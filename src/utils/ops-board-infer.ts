import type { GridFlow, InverterTelemetry } from "@/context/energy-types";
import type { CachedTomznLive } from "@/utils/offline-dashboard";
import type { BoardSwitchState, OpsFlags } from "@/utils/ops-guide";

const PV_V_ON = 40;
const PV_W_ON = 8;
const PV_A_ON = 0.15;
const LOAD_HYBRID_W = 25;
const WAPDA_V = 180;

export type BoardGuess = BoardSwitchState;

export type BoardLearnStats = {
  n?: number;
  pvOn?: number;
  pvOff?: number;
  greyUp?: number;
  greyCenter?: number;
  greyDown?: number;
  wapdaOn?: number;
  wapdaOff?: number;
  tomznOn?: number;
  tomznOff?: number;
};

export type BoardLearn = {
  buckets?: Record<string, BoardLearnStats>;
};

function dayPart(hour: number): string {
  if (hour >= 18 || hour < 6) return "night";
  if (hour < 9) return "morning";
  if (hour < 16) return "day";
  return "evening";
}

function modeKey(inverter: InverterTelemetry | null | undefined): string {
  const raw = String(inverter?.inverterMode || "unknown").toUpperCase();
  if (raw === "L" || raw === "B" || raw === "S" || raw === "F" || raw === "P") return raw;
  if (raw === "OFFLINE") return "S";
  return "U";
}

function flowKey(gridFlow: GridFlow | null | undefined): string {
  const m = String(gridFlow?.mode || "").toLowerCase();
  if (m === "hybrid" || m === "on-grid" || m === "bypass" || m === "night") return m;
  return "unk";
}

export function pvInputOn(inverter: InverterTelemetry | null | undefined): boolean {
  const v1 = inverter?.pv1V || 0;
  const v2 = inverter?.pv2V || 0;
  const w1 = inverter?.pv1W || 0;
  const w2 = inverter?.pv2W || 0;
  const a1 = inverter?.pv1A || 0;
  const a2 = inverter?.pv2A || 0;
  const solar = inverter?.solarW || 0;
  return v1 >= PV_V_ON || v2 >= PV_V_ON || w1 >= PV_W_ON || w2 >= PV_W_ON
    || a1 >= PV_A_ON || a2 >= PV_A_ON || solar >= 15;
}

/** Bottom power button. Dongle can stay online in standby (S). */
export function inverterPowerOn(inverter: InverterTelemetry | null | undefined): boolean {
  const mode = modeKey(inverter);
  if (inverter?.isOnline === false && mode === "U") return false;
  return mode === "L" || mode === "B" || mode === "P" || mode === "F";
}

export function inverterPowerHint(inverter: InverterTelemetry | null | undefined): string {
  const mode = modeKey(inverter);
  if (inverter?.isOnline === false) return "Dongle not reaching the inverter.";
  if (mode === "S") return "Dongle is live. Bottom power looks off (standby).";
  if (mode === "L") return "Inverter on — Line (WAPDA in).";
  if (mode === "B") return "Inverter on — battery (grid lost at inverter).";
  if (mode === "F") return "Inverter on — fault.";
  if (mode === "P") return "Inverter on — power-on.";
  return `Inverter mode ${mode}.`;
}

function inferRules(
  inverter: InverterTelemetry | null | undefined,
  tomzn: CachedTomznLive | null | undefined,
  gridFlow: GridFlow | null | undefined,
): BoardSwitchState {
  const mode = modeKey(inverter);
  const flow = flowKey(gridFlow);
  const loadW = inverter?.loadW || 0;
  const gridV = inverter?.gridV || 0;
  const tomznV = tomzn?.voltageV || 0;
  const tomznW = tomzn?.powerW || 0;

  const pv = pvInputOn(inverter);

  let grey: BoardSwitchState["grey"] = "down";
  if (flow === "hybrid" || (inverterPowerOn(inverter) && loadW >= LOAD_HYBRID_W)) grey = "up";
  else if (flow === "on-grid" || flow === "night" || flow === "bypass") grey = "down";

  let wapdaIn = false;
  if (mode === "L" || mode === "P") wapdaIn = true;
  else if (mode === "B") wapdaIn = true;
  else if (mode === "S") wapdaIn = false;
  else if (inverter?.gridConnected && gridV >= WAPDA_V) wapdaIn = true;

  const tomznOn = tomzn?.switchOn !== false
    && (tomzn?.switchOn === true || tomznV >= 50 || tomznW > 0 || tomzn?.isOnline !== false);

  return { pv, grey, wapdaIn, tomzn: !!tomznOn };
}

function boolVote(on: number | undefined, off: number | undefined, fallback: boolean): boolean {
  const t = (on || 0) + (off || 0);
  if (t < 2) return fallback;
  if (on === off) return fallback;
  return (on || 0) > (off || 0);
}

function greyVote(stats: BoardLearnStats, fallback: BoardSwitchState["grey"]): BoardSwitchState["grey"] {
  const up = stats.greyUp || 0;
  const down = stats.greyDown || 0;
  const center = stats.greyCenter || 0;
  if (up + down + center < 2) return fallback;
  if (down >= up && down >= center) return "down";
  if (up >= down && up >= center) return "up";
  return "center";
}

export function inferBoardFromLive(input: {
  inverter: InverterTelemetry;
  tomznLive: CachedTomznLive;
  gridFlow: GridFlow | null;
  hour?: number;
  learn?: BoardLearn | null;
  serverGuess?: BoardSwitchState | null;
}): BoardSwitchState {
  if (input.serverGuess) return input.serverGuess;
  const hour = input.hour ?? new Date().getHours();
  const rule = inferRules(input.inverter, input.tomznLive, input.gridFlow);
  const buckets = input.learn?.buckets;
  if (!buckets) return rule;
  const exact = buckets[`${modeKey(input.inverter)}|${flowKey(input.gridFlow)}|${dayPart(hour)}`];
  const loose = buckets[`${modeKey(input.inverter)}|${flowKey(input.gridFlow)}|*`];
  const stats = (exact && (exact.n || 0) >= 1) ? exact : ((loose && (loose.n || 0) >= 2) ? loose : null);
  if (!stats) return rule;
  return {
    pv: boolVote(stats.pvOn, stats.pvOff, rule.pv),
    grey: greyVote(stats, rule.grey),
    wapdaIn: boolVote(stats.wapdaOn, stats.wapdaOff, rule.wapdaIn),
    tomzn: boolVote(stats.tomznOn, stats.tomznOff, rule.tomzn),
  };
}

export function boardStateFromFlags(flags: OpsFlags): BoardSwitchState {
  return {
    pv: flags.solarProducing,
    grey: flags.bypass ? "down" : flags.homeOnSolar ? "up" : "down",
    wapdaIn: flags.inverterUp && flags.wapdaOn,
    tomzn: flags.wapdaOn,
  };
}
