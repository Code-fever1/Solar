import type { GridFlow, InverterTelemetry, MeterId, WeatherState } from "@/context/energy-types";
import type { CachedTomznLive } from "@/utils/offline-dashboard";

const SOLAR_LOW_W = 80;
const HOME_DRAW_W = 20;
const LOAD_OK_W = 200;
const WAPDA_MIN_V = 180;
/** Analog Meter 1 is unsafe below this — leave it. */
const METER1_LEAVE_UNITS = 5;
const METER2_MIN_TO_SWITCH = 5;
/** PV array below this (V) — torque loads can trip. Hybrid (WAPDA on) is required. */
export const PV_HYBRID_MIN_V = 160;

export type OpsDevice = "green" | "tomzn" | "wapdaIn" | "grey" | "pv" | "volt" | "inverter" | "dongle" | "none";
export type OpsSeverity = "ok" | "info" | "warn" | "alert";

export type OpsFlags = {
  meter: MeterId;
  inverterUp: boolean;
  bypass: boolean;
  wapdaOn: boolean;
  tomznStandby: boolean;
  solarV: number;
  solarLow: boolean;
  solarProducing: boolean;
  exporting: boolean;
  isNight: boolean;
  homeOnSolar: boolean;
  remaining1: number;
  remaining2: number;
  protectMeter1: boolean;
};

export type BoardSwitchState = {
  pv: boolean;
  grey: "up" | "center" | "down";
  wapdaIn: boolean;
  tomzn: boolean;
};

export function boardStateFromFlags(flags: OpsFlags): BoardSwitchState {
  return {
    pv: flags.solarProducing,
    grey: flags.bypass ? "down" : flags.homeOnSolar ? "up" : "down",
    wapdaIn: flags.inverterUp && flags.wapdaOn,
    tomzn: flags.wapdaOn && !flags.tomznStandby,
  };
}

export function mergeBoardState(saved: BoardSwitchState | null | undefined, flags: OpsFlags): BoardSwitchState {
  return saved ?? boardStateFromFlags(flags);
}

export type OpsGoalId =
  | "inverter-on"
  | "inverter-off"
  | "house-solar"
  | "house-bypass"
  | "house-hybrid"
  | "meter-2"
  | "meter-1"
  | "stop-export";

export type OpsGoalMark = "yellow" | "green";

export type OpsGoal = {
  id: OpsGoalId;
  title: string;
  why: string;
  /** Yellow = do this next. Green = best / safe path (e.g. analog Meter 1 in the sun). */
  mark?: OpsGoalMark;
};

/** Physical WAHID changeover: Meter 1 is DOWN, Meter 2 is UP. */
export function greenLeverDir(target: "meter1" | "meter2"): "up" | "down" {
  return target === "meter1" ? "down" : "up";
}

export function greenLeverWord(target: "meter1" | "meter2"): "UPWARD" | "DOWNWARD" {
  return greenLeverDir(target) === "up" ? "UPWARD" : "DOWNWARD";
}

export type OpsStep = {
  n: number;
  text: string;
  detail: string;
  device: OpsDevice;
  done: boolean;
  apply?: Partial<BoardSwitchState>;
};

export type OpsGuide = {
  id: string;
  title: string;
  why: string;
  severity: OpsSeverity;
  steps: OpsStep[];
  flags: OpsFlags;
};

/** Status-row slot closest to the next physical throw. */
export type OpsAnchor = "solar" | "inverter" | "grid" | "meter";

export function currentOpsStep(guide: OpsGuide): OpsStep | undefined {
  return guide.steps.find((st) => !st.done) ?? guide.steps[guide.steps.length - 1];
}

export function helpAnchorFor(guide: OpsGuide): OpsAnchor {
  const device = currentOpsStep(guide)?.device ?? "none";
  if (device === "pv") return "solar";
  if (device === "inverter" || device === "dongle") return "inverter";
  if (device === "green") return "meter";
  if (device === "wapdaIn") return "inverter";
  if (device === "tomzn" || device === "grey" || device === "volt") return "grid";
  switch (guide.id) {
    case "startup":
    case "dongle-or-pv":
      return "inverter";
    case "export-meter2":
    case "meter2-need-hyd-off":
    case "leave-meter1":
    case "night-meter2":
      return "meter";
    case "trip-bypass":
    case "no-wapda-low-solar":
    case "parked":
      return "grid";
    case "night-shutdown":
    case "night-finish":
      return "grid";
    case "tomzn-standby-hybrid":
      return "grid";
    default:
      return "inverter";
  }
}

export const ALL_SCENARIOS: { title: string; body: string }[] = [
  { title: "Morning start", body: "WAPDA input UP (right 2nd) → inverter left light → TOMZN 10s green → both PV UP → snap grey UP to solar. Do not pause in grey center." },
  { title: "Night / nearby off", body: "Snap grey DOWN to bypass → PV1+PV2 down → WAPDA input (right 2nd) down. House stays on WAPDA." },
  { title: "Trip loop, solar weak", body: "First check load. If it is high, cut it toward 100–200W. If already that low and TOMZN still has WAPDA: grey DOWN. If TOMZN shows grid off, do not bypass — wait for WAPDA." },
  { title: "Meter 1 analog", body: "Stay on Meter 1 while exporting. The analog disk locks — units almost do not move. Leave Meter 1 only when 2–5 units remain. Green WAHID DOWN is Meter 1." },
  { title: "Meter 2", body: "Never export on Meter 2 (billed as import). Green WAHID UP is Meter 2. Before throwing it: inverter setting 37 HYD → OFF (import only). Then Swap Source in Settings." },
  { title: "Hybrid idle", body: `Best idle is hybrid: WAPDA In + TOMZN ON (even at 0 W). If PV is below ${PV_HYBRID_MIN_V} V, turn WAPDA on — a torque load can trip solar-only. Above ${PV_HYBRID_MIN_V} V is smoother, but hybrid is still better.` },
];

export type OpsLiveInput = {
  liveReady: boolean;
  activeMeter: MeterId;
  inverter: InverterTelemetry;
  tomznLive: CachedTomznLive;
  gridFlow: GridFlow | null;
  weather: WeatherState;
  remaining: { meter1: number; meter2: number };
};

function round1(n: number): number {
  return Math.round(Number(n || 0) * 10) / 10;
}

/** Leave analog Meter 1 only when it is down to 2–5 units (cutoff risk). */
export function shouldProtectMeter1(remaining: { meter1: number; meter2: number }, activeMeter: MeterId): boolean {
  if (activeMeter !== "meter1") return false;
  if (remaining.meter2 < METER2_MIN_TO_SWITCH) return false;
  return remaining.meter1 <= METER1_LEAVE_UNITS;
}

/** Physical inverter power. Dongle can stay online in standby (S) after the bottom button is off. */
export function isInverterUp(inverter: InverterTelemetry): boolean {
  return inverter.isOnline !== false
    && inverter.inverterMode !== "S"
    && inverter.inverterMode !== "offline";
}

export function solarArrayV(inverter: InverterTelemetry): number {
  return Math.max(inverter.solarV || 0, inverter.pv1V || 0, inverter.pv2V || 0);
}

/** PV voltage too low to ride through a motor/pump start without grid. */
export function pvVoltageWeak(solarV: number): boolean {
  return solarV < PV_HYBRID_MIN_V;
}

function needsHybridGrid(board: BoardSwitchState, flags: OpsFlags): boolean {
  return flags.tomznStandby || !board.tomzn || !board.wapdaIn;
}

export function isWapdaOn(tomzn: CachedTomznLive, inverter: InverterTelemetry, inverterUp: boolean): boolean {
  const fault = tomzn.faultCode || 0;
  if (fault === 2048 || fault === 8192) return false;
  if ((tomzn.voltageV || 0) >= WAPDA_MIN_V) return true;
  if ((tomzn.powerW || 0) > 0) return true;
  if (tomzn.isOnline && tomzn.switchOn) return true;
  if (inverterUp && inverter.gridConnected && inverter.inverterMode !== "B" && (inverter.gridV || 0) >= WAPDA_MIN_V) {
    return true;
  }
  return false;
}

/** House is on WAPDA through the grey changeover (down / on-grid), not inverter AC out. */
export function isHomeOnBypass(
  gridFlow: GridFlow | null,
  inverter: InverterTelemetry,
  inverterUp: boolean,
  wapdaOn: boolean,
  tomzn: CachedTomznLive,
): boolean {
  if (gridFlow?.mode === "bypass") return true;
  if (gridFlow?.mode === "on-grid") return true;
  if (gridFlow?.mode === "night" && (inverter.loadW || 0) < 25) return true;
  if (!inverterUp && wapdaOn && (tomzn.powerW || 0) >= HOME_DRAW_W) return true;
  return false;
}

export function isHomeOnSolar(gridFlow: GridFlow | null, inverter: InverterTelemetry, inverterUp: boolean): boolean {
  if (!inverterUp) return false;
  if (gridFlow?.mode === "hybrid") return true;
  return (inverter.loadW || 0) >= 25 && (inverter.solarW || 0) >= 20;
}

function nightShutdownSteps(bypassDone: boolean, inverterUp: boolean): OpsStep[] {
  return [
    {
      n: 1,
      text: "Snap grey paddles DOWNWARD to bypass",
      detail: "One fast throw DOWNWARD. Center is OFF — the house will die if you pause.",
      device: "grey",
      done: bypassDone,
      apply: { grey: "down" },
    },
    {
      n: 2,
      text: "Move both PV paddles DOWNWARD",
      detail: "Far left pair. OFF is down. Do this after bypass so the house stays on WAPDA.",
      device: "pv",
      done: bypassDone && !inverterUp,
      apply: { pv: false },
    },
    {
      n: 3,
      text: "Move WAPDA In paddles DOWNWARD",
      detail: "Both blue paddles down to OFF. House stays on bypass through TOMZN.",
      device: "wapdaIn",
      done: bypassDone && !inverterUp,
      apply: { wapdaIn: false },
    },
  ];
}

function startupSteps(inverterUp: boolean, bypass: boolean): OpsStep[] {
  return [
    {
      n: 1,
        text: "Move WAPDA In paddles UPWARD",
        detail: "Both blue paddles, right of Grey. ON is up.",
      device: "wapdaIn",
      done: inverterUp,
      apply: { wapdaIn: true },
    },
    {
      n: 2,
      text: "Confirm TOMZN green light after the 10s timer",
      detail: "Rightmost protector. PV breakers may go up before this finishes.",
      device: "tomzn",
      done: inverterUp,
      apply: { tomzn: true },
    },
    {
      n: 3,
        text: "Move both PV paddles UPWARD",
        detail: "Far left pair. ON is up.",
      device: "pv",
      done: inverterUp,
      apply: { pv: true },
    },
    {
      n: 4,
      text: "Snap grey paddles UPWARD to solar",
      detail: "One motion UPWARD. Do not rest in the center.",
      device: "grey",
      done: inverterUp && !bypass,
      apply: { grey: "up" },
    },
  ];
}

function bypassOnlySteps(bypassDone: boolean): OpsStep[] {
  return [
    {
      n: 1,
      text: "Snap grey changeover DOWNWARD to bypass",
      detail: "Move both grey paddles DOWNWARD in one fast throw. Home stays on WAPDA.",
      device: "grey",
      done: bypassDone,
      apply: { grey: "down" },
    },
  ];
}

function meter2SafeSteps(alreadyMeter2: boolean, hydOff: boolean): OpsStep[] {
  return [
    {
      n: 1,
      text: "Inverter setting 37: HYD → OFF",
      detail: "Import only. Never export on Meter 2 — the digital meter bills export as import.",
      device: "inverter",
      done: hydOff,
    },
    {
      n: 2,
      text: "Throw the green lever UPWARD to Meter 2",
      detail: "WAHID — Meter 2 is UP. One snap through center. Then Settings → Swap Source.",
      device: "green",
      done: alreadyMeter2,
    },
  ];
}

export function assessOpsGuide(input: OpsLiveInput): OpsGuide {
  const inverterUp = isInverterUp(input.inverter);
  const wapdaOn = isWapdaOn(input.tomznLive, input.inverter, inverterUp);
  const bypass = isHomeOnBypass(input.gridFlow, input.inverter, inverterUp, wapdaOn, input.tomznLive);
  const homeOnSolar = isHomeOnSolar(input.gridFlow, input.inverter, inverterUp);
  const solarW = input.inverter.solarW || 0;
  const solarProducing = inverterUp && solarW >= 20;
  const solarLow = !solarProducing || solarW < SOLAR_LOW_W;
  const exporting = input.gridFlow?.direction === "export";
  const hour = new Date().getHours();
  const isNight = input.weather?.isDay === false || hour >= 18 || hour < 6;
  const remaining = {
    meter1: round1(input.remaining?.meter1 ?? 0),
    meter2: round1(input.remaining?.meter2 ?? 0),
  };
  const protectMeter1 = shouldProtectMeter1(remaining, input.activeMeter);
  const loadW = Math.max(input.inverter.loadW || 0, input.tomznLive.powerW || 0);
  const loadHeavy = loadW > LOAD_OK_W;
  const tomznFault = input.tomznLive.faultCode || 0;
  const tomznStandby = !input.tomznLive.switchOn && tomznFault !== 2048 && tomznFault !== 8192;
  const solarV = solarArrayV(input.inverter);
  const flags: OpsFlags = {
    meter: input.activeMeter,
    inverterUp,
    bypass,
    wapdaOn,
    tomznStandby,
    solarV,
    solarLow,
    solarProducing,
    exporting,
    isNight,
    homeOnSolar,
    remaining1: remaining.meter1,
    remaining2: remaining.meter2,
    protectMeter1,
  };

  if (!input.liveReady) {
    return {
      id: "reading",
      title: "Reading the board…",
      why: "Waiting for live meter, inverter, and TOMZN so the steps match what is actually on.",
      severity: "info",
      steps: [],
      flags,
    };
  }

  // Meter 2 + export is always critical — billed as import.
  if (input.activeMeter === "meter2" && exporting) {
    const backToMeter1 = remaining.meter1 > METER1_LEAVE_UNITS;
    return {
      id: "export-meter2",
      title: "Critical — Meter 2 is exporting",
      why: `Never export on Meter 2. Kill export now. Meter 1 analog disk is safe for export only while it has more than ${METER1_LEAVE_UNITS} u (${remaining.meter1} u left).`,
      severity: "alert",
      steps: [
        {
          n: 1,
          text: "Stop export now — grey DOWN, or setting 37 HYD → OFF",
          detail: "Grey DOWN kills export immediately. Setting 37 OFF keeps import-only so Meter 2 can stay on.",
          device: bypass ? "inverter" : "grey",
          done: false,
        },
        backToMeter1
          ? {
              n: 2,
              text: "Throw green DOWNWARD to Meter 1, then Settings → Swap Source",
              detail: "WAHID — Meter 1 is DOWN. Analog disk locks on export so units almost do not move.",
              device: "green" as const,
              done: false,
            }
          : {
              n: 2,
              text: "Stay on Meter 2 — keep 37 HYD OFF",
              detail: `Meter 1 has only ${remaining.meter1} u. Do not go back to it. Import only.`,
              device: "inverter" as const,
              done: false,
            },
      ],
      flags,
    };
  }

  // Daytime production on Meter 2 → analog Meter 1 (disk locks on export).
  if (input.activeMeter === "meter2" && solarProducing && !isNight && remaining.meter1 > METER1_LEAVE_UNITS) {
    return {
      id: "day-meter2-to-meter1",
      title: "Switch to Meter 1 — sun is up",
      why: `Daytime production on Meter 2. Analog Meter 1 locks the disk on export (${remaining.meter1} u left). Throw the green lever DOWNWARD, then Settings → Swap Source.`,
      severity: exporting ? "alert" : "warn",
      steps: [
        {
          n: 1,
          text: "Throw the green lever DOWNWARD to Meter 1",
          detail: "WAHID changeover. Meter 1 is DOWN. One snap through center. Then Settings → Swap Source.",
          device: "green",
          done: false,
        },
      ],
      flags,
    };
  }

  // Meter 2 in sun with Meter 1 empty — stay import-only.
  if (input.activeMeter === "meter2" && solarProducing && !bypass) {
    return {
      id: "meter2-need-hyd-off",
      title: "Meter 2 — confirm setting 37 is OFF",
      why: "Meter 2 is allowed only as import. If 37 is still HYD, the inverter can export and Meter 2 will bill it as import.",
      severity: "warn",
      steps: [
        {
          n: 1,
          text: "Inverter setting 37: HYD → OFF",
          detail: "Import only. Never export on Meter 2.",
          device: "inverter",
          done: false,
        },
      ],
      flags,
    };
  }

  const meter2SwitchStep = (n: number, done: boolean): OpsStep => ({
    n,
    text: "Setting 37 HYD → OFF, then green WAHID → Meter 2",
    detail: `Meter 1 has ${remaining.meter1} u — leave it. Meter 2 import only. Then Settings → Swap Source.`,
    device: "green",
    done,
  });

  // Night / nearby: park the inverter. Bypass first, then PV, then WAPDA input.
  // If Meter 1 is running low, throw green to Meter 2 after bypass.
  if (isNight && wapdaOn && (homeOnSolar || (inverterUp && !bypass))) {
    const steps = nightShutdownSteps(bypass, inverterUp);
    if (protectMeter1) {
      steps.splice(1, 0, meter2SwitchStep(2, input.activeMeter === "meter2"));
      steps.forEach((s, i) => { s.n = i + 1; });
    }
    return {
      id: "night-shutdown",
      title: protectMeter1 ? "Night off — Meter 1 is at 2–5 u" : "Night — switch the system off",
      why: protectMeter1
        ? `Bypass first. Setting 37 HYD → OFF, then green to Meter 2 (Meter 1 has only ${remaining.meter1} u). Then PV down, then WAPDA input down.`
        : "Bypass first so the house stays on WAPDA. Then kill PV, then the inverter’s WAPDA input. That is the full shutdown.",
      severity: "warn",
      steps,
      flags,
    };
  }

  if (isNight && wapdaOn && bypass && inverterUp) {
    const steps = nightShutdownSteps(true, true).map((s) => (
      s.n === 1 ? { ...s, done: true } : s
    ));
    if (protectMeter1) {
      steps.splice(1, 0, meter2SwitchStep(2, false));
      steps.forEach((s, i) => { s.n = i + 1; });
    }
    return {
      id: "night-finish",
      title: protectMeter1 ? "Finish shutdown — switch to Meter 2" : "House is on bypass — finish shutdown",
      why: protectMeter1
        ? `Grey is down. Setting 37 HYD → OFF, then green to Meter 2 (${remaining.meter1} u left on Meter 1), then PV off, then WAPDA input off.`
        : "Grey is already down. Turn PV off, then the WAPDA input breaker so the inverter is fully parked.",
      severity: "info",
      steps,
      flags,
    };
  }

  // Meter 1 is at 2–5 units — leave it, any time of day, import-only on Meter 2.
  if (protectMeter1) {
    return {
      id: "leave-meter1",
      title: `Leave Meter 1 — ${remaining.meter1} u left`,
      why: `Analog Meter 1 is a cutoff risk at 2–5 units. Switch to Meter 2 only after setting 37 HYD → OFF (import, never export). Meter 2 has ${remaining.meter2} u.`,
      severity: "alert",
      steps: meter2SafeSteps(false, false),
      flags,
    };
  }

  // Weak solar / trip loop while WAPDA is actually present — load first, then bypass.
  if (wapdaOn && solarLow && homeOnSolar && !isNight) {
    return {
      id: "trip-bypass",
      title: loadHeavy ? "Cut load, then bypass" : "Bypass now — stop the trip loop",
      why: loadHeavy
        ? `Load is ~${Math.round(loadW)} W. Cut it toward 100–200 W first. If it still trips and TOMZN has WAPDA, snap grey DOWN.`
        : `Load is already ~${Math.round(loadW)} W (not overload). Solar is too weak. WAPDA is up — grey DOWN puts the house on grid.`,
      severity: "warn",
      steps: loadHeavy
        ? [
            {
              n: 1,
              text: "Drop heavy loads toward 100–200 W",
              detail: `Live load ~${Math.round(loadW)} W. AC / iron / heater first.`,
              device: "none",
              done: false,
            },
            {
              n: 2,
              text: "Then snap grey DOWN to bypass",
              detail: "Only after load is reasonable. Center is OFF — one fast throw.",
              device: "grey",
              done: bypass,
            },
          ]
        : bypassOnlySteps(bypass),
      flags,
    };
  }

  if (!wapdaOn && solarLow) {
    return {
      id: "no-wapda-low-solar",
      title: "WAPDA is off and solar is weak",
      why: `Bypass needs WAPDA. Grey DOWN with grid dead takes the house down. ${loadHeavy ? `Load is ~${Math.round(loadW)} W — cut it first.` : `Load is already ~${Math.round(loadW)} W.`} Wait for TOMZN voltage.`,
      severity: "alert",
      steps: [
        {
          n: 1,
          text: loadHeavy ? "Cut heavy loads toward 100–200 W" : "Do not throw grey to bypass",
          detail: loadHeavy
            ? `Live load ~${Math.round(loadW)} W. Reducing load may stop the trip loop until WAPDA returns.`
            : "Load is already low. No grid at TOMZN means bypass has nothing to feed.",
          device: loadHeavy ? "none" : "grey",
          done: false,
        },
        {
          n: 2,
          text: "Watch TOMZN for voltage / green light",
          detail: "When WAPDA returns, then grey DOWN is safe.",
          device: "tomzn",
          done: false,
        },
      ],
      flags,
    };
  }

  if (wapdaOn && !inverterUp && (isNight || solarLow)) {
    return {
      id: "parked",
      title: `Parked — house on Meter ${input.activeMeter === "meter1" ? "1" : "2"}`,
      why: input.activeMeter === "meter2"
        ? `On Meter 2. Keep setting 37 HYD OFF — import only. Meter 1 has ${remaining.meter1} u.`
        : `Inverter is off. WAPDA is feeding the house through bypass. Meter 1 ${remaining.meter1} u · Meter 2 ${remaining.meter2} u.`,
      severity: "ok",
      steps: [],
      flags,
    };
  }

  if (wapdaOn && !inverterUp && !isNight) {
    return {
      id: "startup",
      title: "Start the inverter",
      why: "WAPDA is up and the inverter is off. Bring grid in, wait for the left light and TOMZN green, then PV, then snap grey UP.",
      severity: "info",
      steps: startupSteps(false, bypass),
      flags,
    };
  }

  if (inverterUp && !solarProducing && wapdaOn) {
    return {
      id: "dongle-or-pv",
      title: "Inverter is on, no solar yet",
      why: "If the left light is on but the app has zeros, press the InverterZone button. If it is daytime, check PV1 and PV2 are up.",
      severity: "info",
      steps: [
        {
          n: 1,
          text: "Press the Wi-Fi dongle button",
          detail: "Wooden box on top of the white DB. Needed if live data never arrives.",
          device: "dongle",
          done: false,
        },
        {
          n: 2,
          text: "Confirm PV1 and PV2 are UP",
          detail: "Far left pair.",
          device: "pv",
          done: false,
        },
      ],
      flags,
    };
  }

  if (inverterUp && !isNight && tomznStandby) {
    const weak = pvVoltageWeak(solarV);
    return {
      id: "tomzn-standby-hybrid",
      title: weak
        ? `Turn WAPDA on — PV is ${Math.round(solarV)} V`
        : "Turn TOMZN on — stay hybrid",
      why: weak
        ? `PV is ${Math.round(solarV)} V (below ${PV_HYBRID_MIN_V} V). A torque load (AC, pump) can trip at any time. Turn WAPDA / TOMZN on — hybrid is the secure case.`
        : `PV is ${Math.round(solarV)} V, so production is smoother, but hybrid is still better. TOMZN on (even 0 W) keeps grid as backup.`,
      severity: weak ? "alert" : "warn",
      steps: [
        {
          n: 1,
          text: "Turn WAPDA In and TOMZN ON",
          detail: "Blue WAPDA In paddles UP, then rightmost TOMZN ON. Wait for green RUN (~10s).",
          device: "tomzn",
          done: false,
          apply: { wapdaIn: true, tomzn: true },
        },
      ],
      flags,
    };
  }

  return {
    id: "running",
    title: input.activeMeter === "meter2"
      ? "Running on Meter 2 — import only, 37 must be OFF"
      : "Running on Meter 1 — analog disk locks on export",
    why: input.activeMeter === "meter2"
      ? `Never export on Meter 2. Meter 1 ${remaining.meter1} u · Meter 2 ${remaining.meter2} u. Go back to Meter 1 only when it is safely above 5 u.`
      : `Meter 1 ${remaining.meter1} u · Meter 2 ${remaining.meter2} u. Stay here for export. Leave Meter 1 only at 2–5 u, then 37 HYD → OFF and Meter 2.`,
    severity: "ok",
    steps: [],
    flags,
  };
}

export const BOARD_SLOTS: { slot: string; device: OpsDevice; label: string }[] = [
  { slot: "pv1", device: "pv", label: "PV1" },
  { slot: "pv2", device: "pv", label: "PV2" },
  { slot: "volt", device: "none", label: "Volt" },
  { slot: "grey", device: "grey", label: "Grey" },
  { slot: "wapdaIn", device: "wapdaIn", label: "In" },
  { slot: "tomzn", device: "tomzn", label: "TOMZN" },
];

/** Ranked next action from live board + flags. Green = best path, yellow = do this next. */
export function suggestedOpsGoal(board: BoardSwitchState, flags: OpsFlags): { id: OpsGoalId; mark: OpsGoalMark } | null {
  const dayProduce = flags.solarProducing && !flags.isNight;
  const meter1Ok = flags.remaining1 > METER1_LEAVE_UNITS;
  const meter2Ok = flags.remaining2 >= METER2_MIN_TO_SWITCH;
  const wantHybrid = flags.inverterUp && !flags.isNight && needsHybridGrid(board, flags);
  const weakPv = pvVoltageWeak(flags.solarV);

  if (flags.meter === "meter2" && flags.exporting) {
    return { id: "stop-export", mark: "yellow" };
  }
  if (flags.isNight && flags.inverterUp) {
    return { id: "inverter-off", mark: "yellow" };
  }
  if (wantHybrid && weakPv) {
    return { id: "house-hybrid", mark: "yellow" };
  }
  if (flags.meter === "meter2" && dayProduce && meter1Ok) {
    return { id: "meter-1", mark: "green" };
  }
  if (wantHybrid) {
    return { id: "house-hybrid", mark: "green" };
  }
  if (flags.meter === "meter1" && flags.remaining1 <= METER1_LEAVE_UNITS && meter2Ok) {
    return { id: "meter-2", mark: "yellow" };
  }
  if (!flags.isNight && !flags.inverterUp && flags.wapdaOn) {
    return { id: "inverter-on", mark: "green" };
  }
  if (flags.inverterUp && dayProduce && board.grey !== "up" && flags.wapdaOn) {
    return { id: "house-solar", mark: "green" };
  }
  if (flags.wapdaOn && board.grey !== "down" && (flags.solarLow || flags.isNight)) {
    return { id: "house-bypass", mark: "yellow" };
  }
  if (!flags.wapdaOn) {
    return { id: "house-bypass", mark: "yellow" };
  }
  return null;
}

/** Only goals that still make sense from the switches the user just set. */
export function possibleOpsGoals(board: BoardSwitchState, flags: OpsFlags): OpsGoal[] {
  const goals: OpsGoal[] = [];
  const alreadySolar = board.grey === "up";
  const alreadyBypass = board.grey === "down";
  const dayProduce = flags.solarProducing && !flags.isNight;

  if (!flags.inverterUp) {
    goals.push({
      id: "inverter-on",
      title: "Turn inverter on",
      why: "Bring the Fronus up. Check volt, PV, green RUN, then solar or bypass from live data.",
    });
  } else {
    goals.push({
      id: "inverter-off",
      title: "Turn inverter off",
      why: "Park the inverter. Bypass first so the house stays on, then PV down, then WAPDA In down.",
    });
  }

  if (flags.wapdaOn && !alreadySolar) {
    goals.push({
      id: "house-solar",
      title: "House on solar",
      why: "Grey is not on solar. Snap UP in one motion after PV is up. Do not pause in center.",
    });
  }

  if (!alreadyBypass && flags.wapdaOn) {
    goals.push({
      id: "house-bypass",
      title: "House on WAPDA",
      why: "Snap grey DOWN to bypass. Home load on the grid. Do not do this if TOMZN has no WAPDA.",
    });
  }

  if (flags.inverterUp && needsHybridGrid(board, flags)) {
    const weak = pvVoltageWeak(flags.solarV);
    goals.push({
      id: "house-hybrid",
      title: weak
        ? `Turn WAPDA on — PV ${Math.round(flags.solarV)} V`
        : "Turn WAPDA on — hybrid",
      why: weak
        ? `PV is ${Math.round(flags.solarV)} V, below ${PV_HYBRID_MIN_V} V. A torque load (AC, pump) can trip at any time. Hybrid is the secure case.`
        : `PV is ${Math.round(flags.solarV)} V — smoother, but hybrid is still better. WAPDA In + TOMZN on (even 0 W) keeps grid as backup.`,
    });
  }

  if (!flags.wapdaOn && !flags.tomznStandby) {
    goals.push({
      id: "house-bypass",
      title: "Wait for WAPDA",
      why: "Grid is off at TOMZN. Do not bypass. Watch the rightmost TOMZN for voltage / green light.",
    });
  }

  if (flags.meter === "meter2" && flags.exporting) {
    goals.push({
      id: "stop-export",
      title: "Stop export",
      why: "Never export on Meter 2. Grey DOWN or setting 37 HYD → OFF first.",
    });
  }

  if (flags.meter === "meter1" && flags.remaining2 >= 5 && flags.remaining1 <= 5) {
    goals.push({
      id: "meter-2",
      title: "Switch to Meter 2",
      why: "Meter 1 is at 2–5 units. Setting 37 HYD → OFF first, then green WAHID UPWARD to Meter 2. Import only.",
    });
  }

  if (flags.meter === "meter2" && flags.remaining1 > 5) {
    goals.push({
      id: "meter-1",
      title: "Switch to Meter 1",
      why: dayProduce
        ? "Sun is up. Analog Meter 1 locks the disk on export. Throw green DOWNWARD, then Settings → Swap Source."
        : "Analog Meter 1 is safe for export — the disk locks. Throw green DOWNWARD, then Settings → Swap Source.",
    });
  }

  const suggested = suggestedOpsGoal(board, flags);
  if (suggested) {
    const hit = goals.find((g) => g.id === suggested.id);
    if (hit) hit.mark = suggested.mark;
  }
  goals.sort((a, b) => Number(!!b.mark) - Number(!!a.mark));
  return goals;
}

export function stepsForGoal(id: OpsGoalId, board: BoardSwitchState, flags: OpsFlags): OpsStep[] {
  const number = (steps: OpsStep[]) => steps.map((s, i) => ({ ...s, n: i + 1, done: false }));

  if (id === "inverter-on") {
    return [];
  }

  if (id === "inverter-off") {
    const steps: OpsStep[] = [];
    if (board.grey !== "down") {
      steps.push({
        n: 1,
        text: "Snap grey paddles DOWNWARD to bypass first",
        detail: "Move them DOWNWARD so the house stays on WAPDA. Then kill PV and inverter feed.",
        device: "grey",
        done: false,
        apply: { grey: "down" },
      });
    }
    if (board.pv) {
      steps.push({
        n: 1,
        text: "Move both PV paddles DOWNWARD",
        detail: "Far left pair. OFF is down. Do this after bypass so lights stay on.",
        device: "pv",
        done: false,
        apply: { pv: false },
      });
    }
    if (board.wapdaIn) {
      steps.push({
        n: 1,
        text: "Move WAPDA In paddles DOWNWARD",
        detail: "Both blue paddles down to OFF. House stays on bypass through TOMZN.",
        device: "wapdaIn",
        done: false,
        apply: { wapdaIn: false },
      });
    }
    steps.push({
      n: 1,
      text: "Inverter underside power OFF if the left light is still on",
      detail: "Red Fronus, bottom button. Skip if already dark.",
      device: "inverter",
      done: false,
    });
    return number(steps);
  }

  if (id === "house-solar") {
    const steps: OpsStep[] = [];
    if (!board.wapdaIn) {
      steps.push({
        n: 1,
        text: "Move WAPDA In paddles UPWARD first",
        detail: "Both blue paddles UPWARD. The inverter needs grid in before the house goes on solar.",
        device: "wapdaIn",
        done: false,
        apply: { wapdaIn: true },
      });
    }
    if (!board.pv) {
      steps.push({
        n: 1,
        text: "Move both PV paddles UPWARD",
        detail: "Far left blue paddles. ON is up.",
        device: "pv",
        done: false,
        apply: { pv: true },
      });
    }
    steps.push({
      n: 1,
      text: "Snap grey paddles UPWARD to solar",
      detail: "One motion UPWARD. Do not rest in the center.",
      device: "grey",
      done: false,
      apply: { grey: "up" },
    });
    return number(steps);
  }

  if (id === "house-hybrid") {
    const steps: OpsStep[] = [];
    if (!board.wapdaIn) {
      steps.push({
        n: 1,
        text: "Move WAPDA In paddles UPWARD",
        detail: "Both blue paddles, right of Grey. The inverter needs grid in so a torque load cannot trip it.",
        device: "wapdaIn",
        done: false,
        apply: { wapdaIn: true },
      });
    }
    if (!board.tomzn || flags.tomznStandby) {
      steps.push({
        n: 1,
        text: "Turn the TOMZN protector ON",
        detail: pvVoltageWeak(flags.solarV)
          ? `PV is ${Math.round(flags.solarV)} V (below ${PV_HYBRID_MIN_V} V). Wait for green RUN (~10s).`
          : "Rightmost switch. Wait for green RUN (~10s). Hybrid idle is still the better case.",
        device: "tomzn",
        done: false,
        apply: { tomzn: true },
      });
    }
    return number(steps);
  }

  if (id === "house-bypass") {
    if (!board.tomzn && !flags.wapdaOn) {
      return number([
        {
          n: 1,
          text: "Do not throw grey to bypass",
          detail: "No WAPDA at TOMZN. Bypass would kill the house. Wait for green RUN.",
          device: "tomzn",
          done: false,
        },
      ]);
    }
    return number(bypassOnlySteps(board.grey === "down"));
  }

  if (id === "stop-export") {
    return number([
      {
        n: 1,
        text: "Snap grey paddles DOWNWARD — kills export now",
        detail: "Move both grey paddles DOWNWARD. Or inverter setting 37 HYD → OFF if you will stay on Meter 2.",
        device: "grey",
        done: false,
        apply: { grey: "down" },
      },
      {
        n: 1,
        text: "Setting 37: HYD → OFF",
        detail: "Import only. Never export on Meter 2.",
        device: "inverter",
        done: false,
      },
    ]);
  }

  if (id === "meter-2") {
    return number(meter2SafeSteps(false, false));
  }

  if (id === "meter-1") {
    return number([
      {
        n: 1,
        text: "Throw the green lever DOWNWARD to Meter 1",
        detail: "WAHID — Meter 1 is DOWN. One snap through center. Then Settings → Swap Source.",
        device: "green",
        done: false,
      },
    ]);
  }

  return [];
}
