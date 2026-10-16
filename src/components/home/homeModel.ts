import type { TomznLive } from "@/context/EnergyContext";
import type { GridFlow, InverterTelemetry } from "@/context/energy-types";
import { useEffect, useRef, useState } from "react";

export type Tone = "good" | "warn" | "bad" | "info" | "neutral";

export type StatusRow = {
  key: string;
  label: string;
  value: string;
  tone: Tone;
};

export type FlowNode = {
  key: "solar" | "home" | "grid";
  label: string;
  watts: number;
  volts: number;
  amps: number;
  active: boolean;
  caption: string;
};

export type HomeReadout = {
  heroWatts: number;
  modeLabel: string;
  modeTone: Tone;
  nodes: [FlowNode, FlowNode, FlowNode];
  solarFlow: { active: boolean };
  gridFlow: { active: boolean; reverse: boolean };
  statuses: StatusRow[];
};

type Input = {
  inverter: InverterTelemetry;
  tomznLive: TomznLive;
  gridFlow: GridFlow | null;
  ups: { active: boolean; label: string } | null;
  offline: boolean;
  connecting: boolean;
  liveReady: boolean;
  activeMeter: "meter1" | "meter2";
};

const SOLAR_HOLD_MS = 6_000;

function signedWatts(watts: number) {
  return Number.isFinite(watts) ? watts : 0;
}

export function formatPower(watts: number): { value: string; unit: "W" | "kW" } {
  if (!Number.isFinite(watts)) return { value: "—", unit: "W" };
  const sign = watts < 0 ? "−" : "";
  const abs = Math.abs(watts);
  if (abs >= 1000) {
    const kw = abs / 1000;
    const digits = kw >= 10 ? 1 : 2;
    return { value: `${sign}${kw.toFixed(digits)}`, unit: "kW" };
  }
  return { value: `${sign}${Math.round(abs)}`, unit: "W" };
}

export function formatKilowatts(watts: number) {
  if (!Number.isFinite(watts)) return "—";
  const sign = watts < 0 ? "−" : "";
  return `${sign}${(Math.abs(watts) / 1000).toFixed(2)}`;
}

export function formatVA(volts: number, amps: number) {
  const v = Number.isFinite(volts) ? Math.round(volts) : 0;
  const a = Number.isFinite(amps) ? amps : 0;
  return `${v} V · ${a.toFixed(1)} A`;
}

function deriveReadout(
  input: Input,
  inverterOff: boolean,
  heldSolarW: number,
  heldSolarAt: number,
  heldLoadW: number,
  heldLoadAt: number,
): HomeReadout {
  const { inverter, tomznLive, gridFlow, ups, offline, connecting, liveReady, activeMeter } = input;
  const now = Date.now();
  const solarWEffective = inverterOff || offline
    ? 0
    : inverter.solarW >= 20
      ? inverter.solarW
      : now - heldSolarAt < SOLAR_HOLD_MS
        ? heldSolarW
        : 0;
  const loadWEffective = inverterOff || offline
    ? 0
    : (inverter.loadW || 0) >= 10
      ? inverter.loadW || 0
      : now - heldLoadAt < SOLAR_HOLD_MS
        ? heldLoadW
        : 0;

  const fault = tomznLive.faultCode || 0;
  const wapdaCutOff = !offline && (fault === 2048 || fault === 8192);
  const wapdaStandby = !offline && !tomznLive.switchOn && fault !== 2048 && fault !== 8192;
  const gridUnavailable = offline || wapdaCutOff || wapdaStandby || (!tomznLive.isOnline && !!tomznLive.switchOn);
  const onGridMode = gridFlow?.mode === "on-grid";
  const hybridMode = gridFlow?.mode === "hybrid";
  const tomznW = Math.max(0, tomznLive.powerW || 0);
  const gridImporting = !offline && tomznLive.isOnline && tomznW > 0 && !wapdaCutOff && !wapdaStandby;
  const solarNow = inverter.solarW ?? 0;
  const canExport = !gridUnavailable && inverter.inverterMode !== "B";
  const hybridFronusExport = Math.max(0, -(inverter.gridWRaw ?? 0)) > 50;
  const hybridExporting = hybridMode && canExport && (gridFlow?.direction === "export" || (!gridFlow && hybridFronusExport));
  const onGridExporting = onGridMode && canExport && gridFlow?.direction === "export" && tomznW < solarNow && (gridFlow?.homeW ?? 0) < solarNow;
  const isExporting = hybridExporting || onGridExporting || (!onGridMode && !hybridMode && gridFlow?.direction === "export" && canExport);

  // On-grid and bypass both feed the house through the meter. The inverter's
  // load reading is 0 while it is offline, which would hide a real bypass load.
  const meterFed = !offline && !!gridFlow && (onGridMode || gridFlow.mode === "bypass");
  const homeW = meterFed ? gridFlow.homeW : loadWEffective;
  const homeV = offline ? 0 : meterFed ? (tomznLive.voltageV || inverter.acOutV || 0) : (inverter.acOutV || 0);
  const homeA = offline
    ? 0
    : meterFed
      ? (tomznLive.currentA || homeW / Math.max(1, homeV))
      : (inverter.loadVa || 0) / Math.max(1, inverter.acOutV || 1);

  const solarV = inverterOff || offline ? 0 : inverter.solarV || 0;
  const solarA = inverterOff || offline ? 0 : inverter.solarA || 0;
  const gridV = gridUnavailable ? 0 : tomznLive.voltageV || 0;
  const gridA = gridUnavailable ? 0 : tomznLive.currentA || 0;
  const gridWatts = gridUnavailable ? 0 : isExporting ? -tomznW : gridImporting ? tomznW : 0;

  const solarProducing = !inverterOff && !offline && inverter.solarW > 5;
  const solarLow = !inverterOff && !offline && inverter.solarW <= 5;
  const relayOnIdle = !offline && tomznLive.isOnline && tomznLive.switchOn && fault !== 2048 && fault !== 8192 && (tomznLive.powerW || 0) === 0;

  let modeLabel = "Idle";
  let modeTone: Tone = "neutral";
  if (connecting) {
    modeLabel = "Connecting";
    modeTone = "warn";
  } else if (offline) {
    modeLabel = "Offline";
    modeTone = "bad";
  } else if (onGridMode && isExporting) {
    modeLabel = "Exporting";
    modeTone = "info";
  } else if (onGridMode && gridImporting) {
    modeLabel = "Importing";
    modeTone = "info";
  } else if (onGridMode) {
    modeLabel = "On grid";
    modeTone = "info";
  } else if (hybridMode && isExporting) {
    modeLabel = "Exporting";
    modeTone = "info";
  } else if (hybridMode && gridImporting) {
    modeLabel = "Hybrid";
    modeTone = "good";
  } else if (hybridMode) {
    modeLabel = "Hybrid";
    modeTone = "good";
  } else if (solarProducing && gridImporting) {
    modeLabel = "Hybrid";
    modeTone = "good";
  } else if (solarProducing && relayOnIdle) {
    modeLabel = "Hybrid";
    modeTone = "good";
  } else if (solarProducing && !gridImporting) {
    modeLabel = "Solar only";
    modeTone = "warn";
  } else if (ups && inverterOff) {
    modeLabel = ups.active ? "Backup" : "Power down";
    modeTone = ups.active ? "warn" : "bad";
  } else if (wapdaCutOff) {
    modeLabel = "Grid cut off";
    modeTone = "bad";
  } else if (inverterOff && gridImporting) {
    modeLabel = "Bypass";
    modeTone = "warn";
  } else if (isExporting && canExport) {
    modeLabel = "Exporting";
    modeTone = "info";
  } else if (solarLow && gridImporting) {
    modeLabel = "Importing";
    modeTone = "info";
  } else if (gridImporting) {
    modeLabel = "Importing";
    modeTone = "info";
  } else if (wapdaStandby) {
    modeLabel = solarProducing ? "Solar only" : "Grid standby";
    modeTone = "warn";
  } else if (tomznLive.isOnline) {
    modeLabel = solarProducing ? "Solar only" : "Grid idle";
    modeTone = solarProducing ? "warn" : "neutral";
  } else {
    modeLabel = "Grid offline";
    modeTone = "bad";
  }

  const solarLive = inverter.isOnline !== false && inverter.solarW > 0;
  const solarAllZero = inverter.isOnline !== false && inverter.solarW === 0 && inverter.solarA === 0 && inverter.solarV === 0;
  const rawInverterOff = inverter.isOnline === false || inverter.inverterMode === "S" || inverter.inverterMode === "offline";
  const cutOffFault = tomznLive.faultCode === 2048;
  const unavailableFault = tomznLive.faultCode === 8192;
  const standby = !tomznLive.switchOn && !cutOffFault && !unavailableFault;

  const solarStatus: StatusRow = !liveReady
    ? { key: "solar", label: "Solar", value: "…", tone: "warn" }
    : rawInverterOff
      ? { key: "solar", label: "Solar", value: "Off", tone: "bad" }
      : solarLive
        ? { key: "solar", label: "Solar", value: "Online", tone: "good" }
        : solarAllZero
          ? { key: "solar", label: "Solar", value: "Standby", tone: "warn" }
          : { key: "solar", label: "Solar", value: "Online", tone: "good" };

  const inverterStatus: StatusRow = !liveReady
    ? { key: "inverter", label: "Inverter", value: "…", tone: "warn" }
    : rawInverterOff
      ? { key: "inverter", label: "Inverter", value: "Offline", tone: "bad" }
      : inverter.inverterFault === "NO"
        ? { key: "inverter", label: "Inverter", value: "Healthy", tone: "good" }
        : { key: "inverter", label: "Inverter", value: inverter.inverterFault || "Check", tone: "warn" };

  const gridStatus: StatusRow = !liveReady
    ? { key: "grid", label: "Grid", value: "…", tone: "warn" }
    : cutOffFault
      ? { key: "grid", label: "Grid", value: "Offline", tone: "bad" }
      : unavailableFault
        ? { key: "grid", label: "Grid", value: "Unavailable", tone: "bad" }
        : standby
          ? { key: "grid", label: "Grid", value: "Standby", tone: "warn" }
          : tomznLive.isOnline
            ? tomznLive.powerW > 0
              ? { key: "grid", label: "Grid", value: "Available", tone: "info" }
              : { key: "grid", label: "Grid", value: "Idle", tone: "warn" }
            : { key: "grid", label: "Grid", value: "Offline", tone: "bad" };

  const meterStatus: StatusRow = {
    key: "meter",
    label: "Active meter",
    value: activeMeter === "meter1" ? "Meter 1" : "Meter 2",
    tone: "neutral",
  };

  const solarCaption = inverterOff || offline ? "Off" : solarWEffective > 0 ? "Producing" : "Standby";
  const homeCaption = homeW >= 10 ? "Drawing" : "Quiet";
  const gridCaption = isExporting ? "Exporting" : gridImporting ? "Importing" : gridUnavailable ? (wapdaStandby ? "Standby" : "Unavailable") : "Idle";

  return {
    heroWatts: signedWatts(homeW),
    modeLabel,
    modeTone,
    solarFlow: { active: !inverterOff && !offline && solarWEffective >= 20 },
    gridFlow: {
      active: gridImporting || isExporting,
      reverse: gridImporting && !isExporting,
    },
    nodes: [
      {
        key: "solar",
        label: "Solar",
        watts: signedWatts(inverterOff || offline ? 0 : inverter.solarW),
        volts: solarV,
        amps: solarA,
        active: solarWEffective >= 20,
        caption: solarCaption,
      },
      {
        key: "home",
        label: "Home",
        watts: signedWatts(homeW),
        volts: homeV,
        amps: homeA,
        active: !offline && homeW >= 10,
        caption: homeCaption,
      },
      {
        key: "grid",
        label: "Grid",
        watts: signedWatts(gridWatts),
        volts: gridV,
        amps: gridA,
        active: gridImporting || isExporting,
        caption: gridCaption,
      },
    ],
    statuses: [solarStatus, inverterStatus, gridStatus, meterStatus],
  };
}

export function useHomeReadout(input: Input): HomeReadout {
  const rawInverterOff = input.inverter.isOnline === false || input.inverter.inverterMode === "S" || input.inverter.inverterMode === "offline";
  const [inverterOff, setInverterOff] = useState(rawInverterOff);
  const offTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldSolarW = useRef(0);
  const heldSolarAt = useRef(0);
  const heldLoadW = useRef(0);
  const heldLoadAt = useRef(0);

  useEffect(() => {
    const confirmedOffline = input.inverter.inverterMode === "offline" || input.inverter.inverterMode === "S";
    if (!rawInverterOff) {
      if (offTimerRef.current) {
        clearTimeout(offTimerRef.current);
        offTimerRef.current = null;
      }
      setInverterOff(false);
    } else if (confirmedOffline) {
      if (offTimerRef.current) {
        clearTimeout(offTimerRef.current);
        offTimerRef.current = null;
      }
      setInverterOff(true);
    } else if (!offTimerRef.current) {
      offTimerRef.current = setTimeout(() => {
        offTimerRef.current = null;
        setInverterOff(true);
      }, 20000);
    }
    return () => {
      if (offTimerRef.current) {
        clearTimeout(offTimerRef.current);
        offTimerRef.current = null;
      }
    };
  }, [rawInverterOff, input.inverter.inverterMode]);

  useEffect(() => {
    if (input.inverter.solarW >= 20) {
      heldSolarW.current = input.inverter.solarW;
      heldSolarAt.current = Date.now();
    }
  }, [input.inverter.solarW]);

  useEffect(() => {
    if (!rawInverterOff && !input.offline && (input.inverter.loadW || 0) >= 10) {
      heldLoadW.current = input.inverter.loadW || 0;
      heldLoadAt.current = Date.now();
    }
  }, [input.inverter.loadW, input.offline, rawInverterOff]);

  return deriveReadout(input, inverterOff, heldSolarW.current, heldSolarAt.current, heldLoadW.current, heldLoadAt.current);
}
