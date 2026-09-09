import type { BoardSwitchState, OpsDevice, OpsFlags, OpsGoalId } from "@/utils/ops-guide";
import { PV_HYBRID_MIN_V } from "@/utils/ops-guide";

const LOAD_OK_W = 200;
const VOLT_ON_V = 180;
const MAX_POWER_TRIES = 3;
const MAX_DONGLE_TRIES = 2;
export const GREEN_WAIT_SEC = 10;
export const DONGLE_WAIT_SEC = 15;

export type FlowKind = "throw" | "ask" | "wait" | "press" | "hold" | "info" | "done";

export type FlowNode = {
  id: string;
  kind: FlowKind;
  title: string;
  hint: string;
  live: string;
  device: OpsDevice;
  apply?: Partial<BoardSwitchState>;
  primary: string;
  secondary?: string;
  waitSec?: number;
};

export type FlowLive = {
  flags: OpsFlags;
  solarW: number;
  voltV: number;
  loadW: number;
  hour: number;
};

export type FlowMemory = {
  powerTries: number;
  dongleTries: number;
};

export type FlowChoice = "primary" | "secondary";

export function liveLine(live: FlowLive): string {
  const { flags, solarW, voltV } = live;
  const inv = flags.inverterUp ? "Inverter on" : "Inverter offline";
  const grid = flags.wapdaOn
    ? (voltV >= 1 ? `WAPDA ${Math.round(voltV)}V` : "WAPDA on")
    : "No WAPDA";
  const pv = flags.solarProducing ? `PV ${Math.round(solarW)}W` : "PV 0W";
  const house = flags.homeOnSolar ? "House solar" : flags.bypass ? "House bypass" : "House —";
  return `${inv} · ${grid} · ${pv} · ${house}`;
}

/** Low light, night, or no grid — do not throw grey to solar. */
export function preferBypass(live: FlowLive): boolean {
  const { flags, hour } = live;
  if (!flags.wapdaOn) return true;
  if (flags.isNight) return true;
  if (flags.solarLow) return true;
  if (hour >= 5 && hour < 8) return true;
  return false;
}

export function voltLooksOn(live: FlowLive): boolean {
  return live.flags.wapdaOn || live.voltV >= VOLT_ON_V;
}

function node(
  partial: Omit<FlowNode, "live">,
  live: FlowLive,
): FlowNode {
  return { ...partial, live: liveLine(live) };
}

export function startNode(goal: OpsGoalId, board: BoardSwitchState, live: FlowLive): string {
  switch (goal) {
    case "inverter-on":
      return board.wapdaIn ? "volt-ask" : "wapda-up";
    case "inverter-off":
      if (!live.flags.wapdaOn && live.flags.homeOnSolar) return "off-no-grid";
      if (board.grey !== "down") return "off-grey";
      if (board.pv) return "off-pv";
      if (board.wapdaIn) return "off-wapda";
      return "off-power";
    case "house-solar":
      if (!live.flags.wapdaOn && !board.wapdaIn && !live.flags.tomznStandby) return "solar-no-grid";
      if (!board.wapdaIn) return "wapda-up";
      if (!live.flags.inverterUp) return "volt-ask";
      if (!board.pv) return "pv-up";
      if (!board.tomzn || live.flags.tomznStandby) return "tomzn-on";
      if (preferBypass(live)) return "stay-bypass";
      if (board.grey !== "up") return "grey-solar";
      return live.flags.inverterUp ? "done" : "dongle";
    case "house-hybrid":
      if (!board.wapdaIn) return "wapda-up";
      if (!board.tomzn || live.flags.tomznStandby) return "tomzn-on";
      return "done";
    case "house-bypass":
      if (!live.flags.wapdaOn) return "wait-wapda";
      if (live.loadW > LOAD_OK_W) return "cut-load";
      if (board.grey === "down") return "done";
      return "grey-bypass";
    case "stop-export":
      if (board.grey !== "down") return "export-grey";
      return "export-hyd";
    case "meter-2":
      if (live.flags.remaining2 < 5) return "meter2-refuse";
      if (live.flags.exporting && board.grey !== "down") return "export-grey";
      return "meter2-hyd";
    case "meter-1":
      if (live.flags.remaining1 <= 5) return "meter1-refuse";
      return "meter1-green";
  }
}

export function screenFor(
  goal: OpsGoalId,
  id: string,
  board: BoardSwitchState,
  live: FlowLive,
  mem: FlowMemory,
  waitLeft?: number,
): FlowNode {
  const L = (p: Omit<FlowNode, "live">) => node(p, live);

  switch (id) {
    case "wapda-up":
      return L({
        id,
        kind: "throw",
        title: "WAPDA In on",
        hint: live.flags.solarV < PV_HYBRID_MIN_V
          ? `PV is ${Math.round(live.flags.solarV)} V — below ${PV_HYBRID_MIN_V} V. A torque load can trip. Turn this on, then TOMZN.`
          : "Move both blue paddles UPWARD — right of grey.",
        device: "wapdaIn",
        apply: { wapdaIn: true },
        primary: "I moved it upward",
      });

    case "volt-ask":
      return L({
        id,
        kind: "ask",
        title: "Volt meter?",
        hint: voltLooksOn(live)
          ? "App sees voltage. Is the volt display on?"
          : "Look at the volt meter. Numbers = on. Dashes = off.",
        device: "volt",
        primary: "It's on",
        secondary: "Still off",
      });

    case "power":
      return L({
        id,
        kind: "press",
        title: "Turn inverter on",
        hint: "Underside, bottom left button. Left light should come on.",
        device: "inverter",
        primary: "I pressed it",
      });

    case "volt-dead":
      return L({
        id,
        kind: "hold",
        title: "No voltage",
        hint: "Do not throw grey. Wait for WAPDA on the volt meter / TOMZN.",
        device: "volt",
        primary: "I'll wait",
      });

    case "pv-up":
      return L({
        id,
        kind: board.pv ? "ask" : "throw",
        title: "Both solar switches",
        hint: board.pv
          ? "Confirm PV1 and PV2 are both ON (up)."
          : "Move both PV paddles UPWARD — far left.",
        device: "pv",
        apply: { pv: true },
        primary: "They're on",
        secondary: "No",
      });

    case "recheck":
      return L({
        id,
        kind: "info",
        title: "Recheck last steps",
        hint: "WAPDA In up? Inverter button on? Volt on? Then both PV up.",
        device: "wapdaIn",
        primary: "Checked — continue",
        secondary: "Volt still off",
      });

    case "green-wait":
      return L({
        id,
        kind: "wait",
        title: waitLeft != null ? `Wait ${waitLeft}s` : "Wait for green",
        hint: "Volt numbers + TOMZN green RUN. About 10 seconds.",
        device: "tomzn",
        apply: { tomzn: true },
        primary: "Yes — it's green",
        secondary: waitLeft === 0 ? "Not yet" : undefined,
        waitSec: GREEN_WAIT_SEC,
      });

    case "tomzn-on":
      return L({
        id,
        kind: "throw",
        title: "TOMZN on",
        hint: live.flags.solarV < PV_HYBRID_MIN_V
          ? `PV is ${Math.round(live.flags.solarV)} V — below ${PV_HYBRID_MIN_V} V. Rightmost protector ON. Wait for green RUN (~10s).`
          : "Rightmost protector ON. Wait for green RUN (~10s). Hybrid idle is still the better case.",
        device: "tomzn",
        apply: { tomzn: true },
        primary: "It's on",
      });

    case "grey-solar":
      return L({
        id,
        kind: "throw",
        title: "Snap to solar",
        hint: "Grey paddles UPWARD — one fast throw. Do not pause in the middle.",
        device: "grey",
        apply: { grey: "up" },
        primary: "I snapped it",
      });

    case "stay-bypass":
      return L({
        id,
        kind: live.flags.wapdaOn && board.grey !== "down" ? "throw" : "hold",
        title: "Keep on bypass",
        hint: bypassWhy(live),
        device: "grey",
        apply: live.flags.wapdaOn ? { grey: "down" } : undefined,
        primary: "Stay on bypass",
        secondary: live.flags.wapdaOn && board.grey !== "up" ? "Snap to solar anyway" : undefined,
      });

    case "dongle":
      return L({
        id,
        kind: "press",
        title: mem.dongleTries > 0 ? "Try again" : "Press Wi‑Fi button",
        hint: mem.dongleTries > 0
          ? "Still offline. Press the dongle side button once more."
          : "Tan box on top of the DB — press the side button.",
        device: "dongle",
        primary: "I pressed it",
        secondary: mem.dongleTries > 0 ? "Skip" : undefined,
      });

    case "dongle-wait":
      return L({
        id,
        kind: "wait",
        title: waitLeft != null ? `Checking… ${waitLeft}s` : "Checking…",
        hint: "Waiting for the inverter in the app.",
        device: "dongle",
        primary: "",
        waitSec: DONGLE_WAIT_SEC,
      });

    case "off-no-grid":
      return L({
        id,
        kind: "hold",
        title: "Don't bypass",
        hint: "No WAPDA. Grey DOWN would kill the house. Wait for grid, or stay on solar.",
        device: "grey",
        primary: "I'll wait",
        secondary: board.pv || board.wapdaIn ? "Park anyway (PV / In down)" : undefined,
      });

    case "off-grey":
      return L({
        id,
        kind: "throw",
        title: "Bypass first",
        hint: "Snap grey DOWNWARD so the house stays on WAPDA.",
        device: "grey",
        apply: { grey: "down" },
        primary: "I snapped it",
      });

    case "off-pv":
      return L({
        id,
        kind: "throw",
        title: "PV off",
        hint: "Move both PV paddles DOWNWARD.",
        device: "pv",
        apply: { pv: false },
        primary: "I moved them down",
      });

    case "off-wapda":
      return L({
        id,
        kind: "throw",
        title: "WAPDA In off",
        hint: "Move both blue paddles DOWNWARD.",
        device: "wapdaIn",
        apply: { wapdaIn: false },
        primary: "I moved them down",
      });

    case "off-power":
      return L({
        id,
        kind: "press",
        title: "Inverter power",
        hint: "If the left light is still on, press the underside button.",
        device: "inverter",
        primary: "It's off",
      });

    case "solar-no-grid":
      return L({
        id,
        kind: "hold",
        title: "No WAPDA",
        hint: "Don't snap grey to solar. Wait for voltage first.",
        device: "tomzn",
        primary: "I'll wait",
      });

    case "wait-wapda":
      return L({
        id,
        kind: "hold",
        title: "Wait for WAPDA",
        hint: live.loadW > LOAD_OK_W
          ? `Load ~${Math.round(live.loadW)} W. Cut it. Do not throw grey down.`
          : "Do not throw grey to bypass. Watch TOMZN for voltage.",
        device: "tomzn",
        primary: "I'll wait",
      });

    case "cut-load":
      return L({
        id,
        kind: "ask",
        title: "Cut load first",
        hint: `Load ~${Math.round(live.loadW)} W. Drop AC / iron / heater toward 100–200 W.`,
        device: "none",
        primary: "Load is down",
        secondary: "Bypass anyway",
      });

    case "grey-bypass":
      return L({
        id,
        kind: "throw",
        title: "Snap to WAPDA",
        hint: "Grey paddles DOWNWARD — one fast throw. Do not pause in the middle.",
        device: "grey",
        apply: { grey: "down" },
        primary: "I snapped it",
      });

    case "export-grey":
      return L({
        id,
        kind: "throw",
        title: "Stop export now",
        hint: "Snap grey DOWNWARD. Meter 2 must not export.",
        device: "grey",
        apply: { grey: "down" },
        primary: "I snapped it",
      });

    case "export-hyd":
      return L({
        id,
        kind: "press",
        title: "Setting 37 OFF",
        hint: "On the inverter: 37 HYD → OFF. Import only.",
        device: "inverter",
        primary: "It's off",
      });

    case "meter2-hyd":
      return L({
        id,
        kind: "press",
        title: "Setting 37 OFF first",
        hint: "HYD off before Meter 2. Never export on Meter 2.",
        device: "inverter",
        primary: "It's off",
      });

    case "meter2-green":
      return L({
        id,
        kind: "throw",
        title: "Throw to Meter 2",
        hint: "Green WAHID lever UPWARD — Meter 2 is UP. One snap through center.",
        device: "green",
        primary: "I threw it",
      });

    case "meter2-swap":
      return L({
        id,
        kind: "info",
        title: "Swap Source",
        hint: "Settings → Swap Source so the app follows Meter 2.",
        device: "green",
        primary: "Done",
      });

    case "meter2-refuse":
      return L({
        id,
        kind: "info",
        title: "Stay on Meter 1",
        hint: `Meter 2 has only ${live.flags.remaining2} u. Don't switch.`,
        device: "green",
        primary: "Okay",
      });

    case "meter1-green":
      return L({
        id,
        kind: "throw",
        title: "Throw to Meter 1",
        hint: "Green WAHID lever DOWNWARD — Meter 1 is DOWN. One snap through center.",
        device: "green",
        primary: "I threw it",
      });

    case "meter1-swap":
      return L({
        id,
        kind: "info",
        title: "Swap Source",
        hint: "Settings → Swap Source so the app follows Meter 1.",
        device: "green",
        primary: "Done",
      });

    case "meter1-refuse":
      return L({
        id,
        kind: "info",
        title: "Don't use Meter 1",
        hint: `Meter 1 has ${live.flags.remaining1} u. Stay on Meter 2, import only.`,
        device: "green",
        primary: "Okay",
      });

    case "done":
    default:
      return L({
        id: "done",
        kind: "done",
        title: "Done",
        hint: doneHint(goal, live),
        device: "none",
        primary: "Close",
      });
  }
}

function bypassWhy(live: FlowLive): string {
  if (!live.flags.wapdaOn) return "No WAPDA. Do not throw grey to solar.";
  if (live.flags.isNight) return "Night. Keep the house on WAPDA.";
  if (live.hour >= 5 && live.hour < 8) return "Early morning — light is low. Keep bypass.";
  if (live.flags.solarLow) return `Solar is weak (${Math.round(live.solarW)} W). Keep bypass.`;
  return "Keep grey on bypass.";
}

function doneHint(goal: OpsGoalId, live: FlowLive): string {
  if (goal === "inverter-on" || goal === "house-solar" || goal === "house-hybrid") {
    return live.flags.inverterUp
      ? (goal === "house-hybrid" ? "TOMZN is on. Hybrid idle is the safe case." : "Inverter is online.")
      : "Board is set. App may catch up in a minute.";
  }
  if (goal === "stop-export") return "Export should be off. Keep 37 HYD OFF.";
  return "Saved.";
}

function afterStartupReady(board: BoardSwitchState, live: FlowLive): string {
  if (preferBypass(live)) return "stay-bypass";
  if (board.grey !== "up") return "grey-solar";
  return afterHouse(live);
}

function afterHouse(live: FlowLive): string {
  return live.flags.inverterUp ? "done" : "dongle";
}

function afterOffGrey(board: BoardSwitchState): string {
  if (board.pv) return "off-pv";
  if (board.wapdaIn) return "off-wapda";
  return "off-power";
}

export function advance(
  goal: OpsGoalId,
  id: string,
  choice: FlowChoice,
  board: BoardSwitchState,
  live: FlowLive,
  mem: FlowMemory,
): { node: string; mem: FlowMemory } {
  const yes = choice === "primary";

  switch (id) {
    case "wapda-up":
      if (goal === "house-hybrid") {
        return { node: (!board.tomzn || live.flags.tomznStandby) ? "tomzn-on" : "done", mem };
      }
      return { node: goal === "house-solar" && live.flags.inverterUp ? (board.pv ? afterStartupReady(board, live) : "pv-up") : "volt-ask", mem };

    case "volt-ask":
      if (yes) return { node: board.pv ? "green-wait" : "pv-up", mem };
      if (mem.powerTries >= MAX_POWER_TRIES) return { node: "volt-dead", mem };
      return { node: "power", mem };

    case "power":
      return { node: "volt-ask", mem: { ...mem, powerTries: mem.powerTries + 1 } };

    case "volt-dead":
      return { node: voltLooksOn(live) ? "volt-ask" : "done", mem };

    case "pv-up":
      if (yes) return { node: "green-wait", mem };
      return { node: "recheck", mem };

    case "recheck":
      if (yes) return { node: "pv-up", mem };
      return { node: mem.powerTries >= MAX_POWER_TRIES ? "volt-dead" : "power", mem };

    case "green-wait":
      if (yes) {
        if (goal === "house-hybrid") return { node: "done", mem };
        return { node: afterStartupReady(board, live), mem };
      }
      return { node: "volt-ask", mem };

    case "tomzn-on":
      return { node: "green-wait", mem };

    case "grey-solar":
      return { node: afterHouse(live), mem };

    case "stay-bypass":
      if (!yes) return { node: "grey-solar", mem };
      return { node: afterHouse(live), mem };

    case "dongle":
      if (!yes) return { node: "done", mem };
      return { node: "dongle-wait", mem: { ...mem, dongleTries: mem.dongleTries + 1 } };

    case "dongle-wait":
      if (live.flags.inverterUp) return { node: "done", mem };
      if (mem.dongleTries >= MAX_DONGLE_TRIES) return { node: "done", mem };
      return { node: "dongle", mem };

    case "off-no-grid":
      if (yes) return { node: "done", mem };
      return { node: board.pv ? "off-pv" : board.wapdaIn ? "off-wapda" : "off-power", mem };

    case "off-grey":
      return { node: afterOffGrey({ ...board, grey: "down" }), mem };

    case "off-pv":
      return { node: ({ ...board, pv: false }).wapdaIn ? "off-wapda" : "off-power", mem };

    case "off-wapda":
      return { node: "off-power", mem };

    case "off-power":
      return { node: "done", mem };

    case "solar-no-grid":
    case "wait-wapda":
      return { node: live.flags.wapdaOn ? startNode(goal, board, live) : "done", mem };

    case "cut-load":
      if (!live.flags.wapdaOn) return { node: "wait-wapda", mem };
      return { node: "grey-bypass", mem };

    case "grey-bypass":
      return { node: "done", mem };

    case "export-grey":
      return { node: goal === "meter-2" ? "meter2-hyd" : "export-hyd", mem };

    case "export-hyd":
      if (live.flags.meter === "meter2" && live.flags.remaining1 > 5) return { node: "meter1-green", mem };
      return { node: "done", mem };

    case "meter2-hyd":
      return { node: "meter2-green", mem };

    case "meter2-green":
      return { node: "meter2-swap", mem };

    case "meter2-swap":
    case "meter2-refuse":
    case "meter1-refuse":
      return { node: "done", mem };

    case "meter1-green":
      return { node: "meter1-swap", mem };

    case "meter1-swap":
      return { node: "done", mem };

    case "done":
    default:
      return { node: "done", mem };
  }
}

/** Live data can skip waits / jump ahead without a tap. */
export function autoJump(
  goal: OpsGoalId,
  id: string,
  board: BoardSwitchState,
  live: FlowLive,
  mem: FlowMemory,
  waitLeft: number | null,
): { node: string; mem: FlowMemory } | null {
  if (id === "dongle-wait" && live.flags.inverterUp) return { node: "done", mem };
  if (id === "dongle-wait" && waitLeft === 0) {
    return { node: mem.dongleTries >= MAX_DONGLE_TRIES ? "done" : "dongle", mem };
  }
  if ((id === "tomzn-on" || (id === "green-wait" && goal === "house-hybrid")) && !live.flags.tomznStandby && live.flags.wapdaOn) {
    return { node: "done", mem };
  }
  if ((id === "wait-wapda" || id === "solar-no-grid" || id === "volt-dead") && live.flags.wapdaOn) {
    return { node: startNode(goal, board, live), mem };
  }
  if (id === "cut-load" && live.loadW <= LOAD_OK_W && live.flags.wapdaOn) {
    return { node: board.grey === "down" ? "done" : "grey-bypass", mem };
  }
  return null;
}
