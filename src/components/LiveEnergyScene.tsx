import { BlurView } from "expo-blur";
import { memo, useEffect, useRef, useState } from "react";
import { AppState, Platform, StyleSheet, Text, View } from "react-native";

import type { GridFlow, InverterTelemetry, WeatherState } from "@/context/energy-types";
import type { TomznLive } from "@/context/EnergyContext";
import { useIdle } from "@/context/IdleContext";
import { HeroOverlayEngine } from "@/overlay/HeroOverlayEngine";
import type { HeroOverlayConfig, OverlayLabelPosition } from "@/overlay/types";

// Fixed aspect ratio for the card so day/night backgrounds never change sizing.
const CARD_ASPECT = 1600 / 899;

type SceneProps = {
  inverter: InverterTelemetry;
  weather: WeatherState;
  offline: boolean;
  connecting?: boolean;
  tomznLive: TomznLive;
  inverterOff: boolean;
  loadStatus?: "Low" | "Normal" | "High";
  normalDrawKw?: number;
  isVisible?: boolean;
  variant?: "card" | "hero";
  overlayConfig?: HeroOverlayConfig;
  ups?: { active: boolean; label: string } | null;
  gridFlow?: GridFlow | null;
};

function labelPositionStyle(
  pos: OverlayLabelPosition,
  viewBox: HeroOverlayConfig["viewBox"],
): { top: `${number}%`; left?: `${number}%`; right?: `${number}%`; transform?: { translateX: number }[] } {
  const top = `${(pos.y / viewBox.height) * 100}%` as `${number}%`;
  const anchor = pos.anchor ?? "center";
  if (anchor === "right") {
    return { top, right: `${((viewBox.width - pos.x) / viewBox.width) * 100}%` as `${number}%` };
  }
  if (anchor === "left") {
    return { top, left: `${(pos.x / viewBox.width) * 100}%` as `${number}%` };
  }
  return {
    top,
    left: `${(pos.x / viewBox.width) * 100}%` as `${number}%`,
    transform: [{ translateX: -45 }],
  };
}

function formatPowerShort(watts: number) {
  const abs = Math.abs(watts);
  const sign = watts < 0 && abs >= 0.5 ? "-" : "";
  if (abs >= 1000) return { value: `${sign}${(abs / 1000).toFixed(2)}`, unit: "kW" };
  return { value: `${sign}${Math.round(abs)}`, unit: "W" };
}

// Dead code removed: SkiaParticle, SkiaBubbleParticle, SkiaStreamLayer,
// SkiaInverterHub, EnergyCanvas, SolarFlowLine, GridFlowLine.
// These were legacy animation components superseded by HeroOverlayEngine.
// Verified zero runtime references via grep before removal.

export const LiveEnergyScene = memo(function LiveEnergyScene({
  inverter,
  weather,
  offline,
  connecting = false,
  tomznLive,
  inverterOff,
  loadStatus,
  normalDrawKw,
  isVisible = true,
  variant = "card",
  overlayConfig,
  ups = null,
  gridFlow = null,
}: SceneProps) {
  // ── Phase 1: Render counter (no behavior change) ──
  const _renderCount = useRef(0);
  _renderCount.current += 1;
  useEffect(() => {
    const iv = setInterval(() => {
      if (_renderCount.current > 0) console.log(`[PerfFE] LiveEnergyScene renders: ${_renderCount.current}/10s`);
      _renderCount.current = 0;
    }, 10_000);
    return () => clearInterval(iv);
  }, []);
  const { animationFpsShared } = useIdle();
  const now = Date.now();
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  // Solar text debounce: count consecutive polls where solarW=0 AND solarV=0 AND solarA=0.
  // Only hide solar text after 10 consecutive zero-checks (~50s at 5s poll).
  const [solarTextVisible, setSolarTextVisible] = useState(true);
  // Line visibility debounce: keep last known good solar/home values for 6s
  // to prevent flickering when the inverter poll briefly fails (network hiccup).
  const lastGoodSolarW = useRef(0);
  const lastGoodLoadW = useRef(0);
  const lastGoodSolarTime = useRef(0);
  const lastGoodLoadTime = useRef(0);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => setAppActive(state === "active"));
    return () => subscription.remove();
  }, []);

  // Sunrise/sunset come from the backend weather API (Open-Meteo) which fetches
  // them daily. Falls back to the local device hour if sunrise/sunset aren't
  // available — EMPTY_WEATHER ships isDay=true, which would incorrectly mark
  // nighttime as daytime before the backend responds.
  const sunriseMs = weather.sunrise ? new Date(weather.sunrise).getTime() : null;
  const sunsetMs = weather.sunset ? new Date(weather.sunset).getTime() : null;
  const localHour = new Date(now).getHours();
  const isDayTime = sunriseMs && sunsetMs
    ? (now >= sunriseMs && now < sunsetMs)
    : localHour >= 5 && localHour < 19;

  // Note: isLive is NOT checked — it's a data-freshness flag that flips false
  // when the inverter's hardware clock is 3+ min stale, even if solar is still
  // producing (e.g. 436W). Removing it prevents the solar line from going idle
  // at high wattage. The inverterOff check (debounced, without isLive) covers
  // genuinely-off states.
  // Debounce: if solarW drops to 0 but we had solar < 6s ago, keep showing
  // the last known value to avoid flickering on brief poll failures.
  const DEBOUNCE_MS = 6_000;
  if (inverter.solarW >= 20) {
    lastGoodSolarW.current = inverter.solarW;
    lastGoodSolarTime.current = Date.now();
  }
  const solarWEffective = (inverterOff || offline) ? 0 :
    (inverter.solarW >= 20 ? inverter.solarW :
      (Date.now() - lastGoodSolarTime.current < DEBOUNCE_MS ? lastGoodSolarW.current : 0));
  const solarOnline = !inverterOff && !offline && solarWEffective >= 20;
  // When inverter is offline or system is offline (no internet), override W/V/A with 0.
  // Debounce loadW same as solarW to prevent home line flickering.
  if (!inverterOff && !offline && (inverter.loadW || 0) >= 10) {
    lastGoodLoadW.current = inverter.loadW || 0;
    lastGoodLoadTime.current = Date.now();
  }
  const loadWEffective = (inverterOff || offline) ? 0 :
    ((inverter.loadW || 0) >= 10 ? (inverter.loadW || 0) :
      (Date.now() - lastGoodLoadTime.current < DEBOUNCE_MS ? lastGoodLoadW.current : 0));
  const invW = (inverterOff || offline) ? 0 : loadWEffective;
  // Use inverter AC output V and VA when grid is on standby or not connected.
  // A = VA / V (derived from the inverter's AC output readings).
  const gridV = inverter.gridV || 0;
  const acOutV = inverter.acOutV || 0;
  const loadVa = inverter.loadVa || 0;
  const usingAcOut = !inverterOff && !offline && gridV <= 0 && acOutV > 0;
  const invV = (inverterOff || offline) ? 0 : (gridV > 0 ? gridV : acOutV);
  const invA = (inverterOff || offline) ? 0 : (usingAcOut ? loadVa / acOutV : (inverter.loadW || 0) / Math.max(1, gridV));
  // TOMZN fault codes:
  // 2048 = wapda cut off while load was on (relay was on, power was drawing, wapda went away)
  // 8192 = wapda gone and relay also off (grid disconnected, relay already open)
  // Both are "Wapda Cut Off" states — the grid is no longer available.
  const fault = tomznLive.faultCode || 0;
  const wapdaCutOff = !offline && (fault === 2048 || fault === 8192);
  // Relay off with no cutoff fault = standby. Tuya may still say isOnline=false.
  const wapdaStandby = !offline && !tomznLive.switchOn && fault !== 2048 && fault !== 8192;
  // Grid path is gone on cutoff, standby, or a truly unreachable meter (relay still on).
  const gridUnavailable = offline || wapdaCutOff || wapdaStandby || (!tomznLive.isOnline && !!tomznLive.switchOn);
  // Grid watts on the hero are always the TOMZN meter (the real wire).
  // Fronus is only used to decide hybrid import vs export — never as the
  // displayed grid number. On-grid uses backend direction from TOMZN-vs-solar.
  const tomznW = Math.max(0, tomznLive.powerW || 0);
  const gridImporting = !offline && tomznLive.isOnline && tomznW > 0 && !wapdaCutOff && !wapdaStandby;
  const gridPowerW = gridImporting ? tomznW : 0;
  const gridColor = gridImporting ? "#6E9BFF" : wapdaCutOff ? "#EF4C4C" : wapdaStandby ? "#F8C653" : "#8A8A8A";
  const onGridMode = gridFlow?.mode === "on-grid";
  const hybridMode = gridFlow?.mode === "hybrid";
  const solarNow = inverter?.solarW ?? 0;
  const canExport = !gridUnavailable && inverter?.inverterMode !== "B";
  const hybridFronusExport = Math.max(0, -(inverter?.gridWRaw ?? 0)) > 50;
  const hybridExporting = hybridMode && canExport && (
    gridFlow?.direction === "export" || (!gridFlow && hybridFronusExport)
  );
  const onGridExporting = onGridMode && canExport && gridFlow?.direction === "export"
    && tomznW < solarNow
    && (gridFlow?.homeW ?? 0) < solarNow;
  const isExporting = hybridExporting || onGridExporting || (!onGridMode && !hybridMode && gridFlow?.direction === "export" && canExport);
  const exportW = gridPowerW;

  // Pace algorithm — uses TOMZN powerW (total home draw) for BOTH label and color.
  // TOMZN sees all power flowing to the home whether from solar or grid, so the
  // ratio is consistent and not affected by whether solar is active or not.
  const lerpSpeed = (a: number, b: number, x: number) => Math.round(a + (b - a) * Math.max(0, Math.min(1, x)));
  // Power-based color mapping (absolute watts, not relative to normal):
  //   0–500W:   light green → full green  (less green as it approaches 500)
  //   500–750W: light green → white
  //   750–1000W: white → yellow
  //   1–2kW:    yellow → orange
  //   2kW+:     orange → red (deeper red as it climbs)
  const getPowerColor = (): string => {
    const w = tomznLive.powerW || 0;
    if (w <= 0) return "#6B7280";
    if (w <= 500) {
      // light green (144,238,144) → full green (34,197,94)
      const s = w / 500;
      return `rgb(${lerpSpeed(144, 34, s)},${lerpSpeed(238, 197, s)},${lerpSpeed(144, 94, s)})`;
    }
    if (w <= 750) {
      // full green (34,197,94) → white (255,255,255)
      const s = (w - 500) / 250;
      return `rgb(${lerpSpeed(34, 255, s)},${lerpSpeed(197, 255, s)},${lerpSpeed(94, 255, s)})`;
    }
    if (w <= 1000) {
      // white (255,255,255) → yellow (255,215,0)
      const s = (w - 750) / 250;
      return `rgb(255,${lerpSpeed(255, 215, s)},${lerpSpeed(255, 0, s)})`;
    }
    if (w <= 2000) {
      // yellow (255,215,0) → orange (255,140,0)
      const s = (w - 1000) / 1000;
      return `rgb(255,${lerpSpeed(215, 140, s)},${lerpSpeed(0, 0, s)})`;
    }
    // 2kW+: orange (255,140,0) → red (239,68,68), deepening with more power
    const s = Math.min(1, (w - 2000) / 2000);
    return `rgb(${lerpSpeed(255, 239, s)},${lerpSpeed(140, 68, s)},${lerpSpeed(0, 68, s)})`;
  };
  const paceColor = getPowerColor();
  // Grid arc color uses pace algorithm when importing, falls back to status color otherwise
  const gridArcColor = gridImporting ? paceColor : gridColor;

  // ── Power mode label + color ──
  // Hybrid: solar + grid both supplying power (tomzn powerW > 0)
  // Hybrid Idle: tomzn relay is ON, no error, inverter on, but tomzn powerW = 0
  //   (grid is connected and ready, solar is supplying, grid just not drawing yet)
  // Solar Only: solar producing AND tomzn relay is OFF (standby/cutoff) — grid disconnected
  // Wapda Importing: solar near zero, wapda supplying
  // Bypass Mode: inverter fully off, tomzn importing
  // Wapda Cut Off / Standby / Offline: wapda states when no solar
  const solarProducing = !inverterOff && !offline && inverter.solarW > 5;
  const solarLow = !inverterOff && !offline && inverter.solarW <= 5;
  // Relay is ON and healthy (no fault) but no power flowing — grid connected but idle
  const relayOnIdle = !offline && tomznLive.isOnline && tomznLive.switchOn && fault !== 2048 && fault !== 8192 && (tomznLive.powerW || 0) === 0;
  // Label uses loadStatus from backend (which also uses TOMZN powerW).
  // Show pace whenever TOMZN is online and drawing power, not just when grid imports.
  // When hybrid idle (relay on, solar producing, but 0W from grid), show "Idle".
  const tomznDrawing = tomznLive.isOnline && (tomznLive.powerW || 0) > 0;
  const paceLabel = isExporting
    ? "Exporting"
    : relayOnIdle && solarProducing
    ? "Idle"
    : !tomznDrawing
    ? "No draw"
    : (tomznLive.powerW || 0) >= 2000 ? "↑ Critical"
    : (tomznLive.powerW || 0) >= 1000 ? "↑ High"
    : (tomznLive.powerW || 0) <= 500 ? "↓ Low"
    : "On Pace";
  const { modeLabel, modeColor } = (() => {
    if (connecting) return { modeLabel: "Connecting", modeColor: "#F8C653" };
    if (offline) return { modeLabel: "System Offline", modeColor: "#EF4C4C" };
    // On-grid mode takes PRIORITY over hybrid/solar-only. In on-grid mode,
    // both solar and grid are active (solar injects to WAPDA bus, grid supplies
    // home via changeover), so the hybrid checks below would wrongly trigger.
    // The backend's gridFlow.mode is the authoritative mode determination.
    if (onGridMode && isExporting) return { modeLabel: "On-Grid · Exporting", modeColor: "#6E9BFF" };
    if (onGridMode && gridImporting) return { modeLabel: "On-Grid · Importing", modeColor: "#6E9BFF" };
    if (onGridMode) return { modeLabel: "On-Grid", modeColor: "#6E9BFF" };
    if (hybridMode && isExporting) return { modeLabel: "Hybrid · Exporting", modeColor: "#6E9BFF" };
    if (hybridMode && gridImporting) return { modeLabel: "Hybrid · Importing", modeColor: "#32E56B" };
    if (hybridMode) return { modeLabel: "Hybrid", modeColor: "#32E56B" };
    // Solar / Hybrid take priority over UPS. A leftover `ups` object
    // from a stale cache or a single inverter timeout must never cover a
    // still-producing inverter (the Solar Only → UPS flicker).
    if (solarProducing && gridImporting) return { modeLabel: "Hybrid", modeColor: "#32E56B" };
    if (solarProducing && relayOnIdle) return { modeLabel: "Hybrid", modeColor: "#32E56B" };
    if (solarProducing && !gridImporting) return { modeLabel: "Solar Only", modeColor: "#F9C641" };
    // UPS only when the inverter is actually off AND the backend confirmed
    // both sources are down. Transient poll failures never reach here now.
    if (ups && inverterOff) return { modeLabel: ups.active ? "UPS" : "Power Down", modeColor: ups.active ? "#F8C653" : "#EF4C4C" };
    if (wapdaCutOff) return { modeLabel: "Wapda Cut Off", modeColor: "#EF4C4C" };
    if (inverterOff && gridImporting) return { modeLabel: "Bypass Mode", modeColor: "#F8C653" };
    if (isExporting && canExport) return { modeLabel: "Exporting", modeColor: "#6E9BFF" };
    if (solarLow && gridImporting) return { modeLabel: "Wapda Importing", modeColor: paceColor };
    if (gridImporting) return { modeLabel: "Wapda Importing", modeColor: paceColor };
    if (wapdaStandby) return { modeLabel: solarProducing ? "Solar Only" : "Wapda Standby", modeColor: solarProducing ? "#F9C641" : "#F8C653" };
    if (tomznLive.isOnline) return { modeLabel: solarProducing ? "Solar Only" : "Wapda Idle", modeColor: solarProducing ? "#F9C641" : "#F8C653" };
    return { modeLabel: "Wapda Offline", modeColor: "#EF4C4C" };
  })();
  // Home power/V/A: in hybrid mode from the inverter's load readings (loadW).
  // In on-grid mode, loadW ≈ 0 (inverter's load output isn't feeding home), so
  // use the backend's computed homeW (inverter dump added, inverter self-draw removed from TOMZN).
  // Voltage comes from the TOMZN meter (WAPDA grid voltage feeding home) and
  // current is derived: A = W / V. All three (W, V, A) are predicted values.
  const homeW = offline ? 0 : (onGridMode && gridFlow ? gridFlow.homeW : invW);
  const homeV = offline ? 0 : (onGridMode && gridFlow ? (tomznLive.voltageV || inverter.acOutV || 0) : (inverter.acOutV || 0));
  const homeA = offline ? 0 : (onGridMode && gridFlow ? (homeW / Math.max(1, homeV)) : ((inverter.loadVa || 0) / Math.max(1, inverter.acOutV || 1)));
  const homeActive = !offline && homeW >= 10;

  // Solar V/A
  const solarV = inverter.solarV || 0;
  const solarA = inverter.solarA || 0;
  // Grid V/A (from tomzn meter) — zeroed when grid is offline/unavailable/cutoff
  const tomznV = gridUnavailable ? 0 : (tomznLive.voltageV || 0);
  const tomznA = gridUnavailable ? 0 : (tomznLive.currentA || 0);

  // Solar text: hide immediately when solar is on standby (0W, 0V, 0A).
  const solarAllZero = inverter.solarW === 0 && solarV === 0 && solarA === 0;
  useEffect(() => {
    if (inverterOff || offline) {
      setSolarTextVisible(false);
      return;
    }
    setSolarTextVisible(!solarAllZero);
  }, [solarAllZero, inverterOff, offline]);

  const solarP = connecting ? { value: "—", unit: "" } : formatPowerShort(offline ? 0 : inverter.solarW);
  const homeP = connecting ? { value: "—", unit: "" } : formatPowerShort(homeW);
  const gridP = connecting
    ? { value: "—", unit: "" }
    : formatPowerShort(gridUnavailable ? 0 : (isExporting ? -tomznW : gridPowerW));
  // Bypass mode: inverter is off, so grid feeds the home directly via the
  // bypass path (grid → DB). This applies whether wapda is actively importing
  // or idle — the physical routing doesn't change just because power stops flowing.
  const bypassMode = inverterOff;
  const gridPathOverride =
    bypassMode && overlayConfig?.gridBypassPath?.length
      ? overlayConfig.gridBypassPath
      : undefined;
  // When grid watts exceed home usage by 100W+, show both grid→inverter and grid→DB wires.
  // The excess power flows through the bypass path directly to the distribution box.
  const gridExcess = gridImporting && !isExporting && (gridPowerW - homeW) >= 100;
  const gridBypassFlow = gridExcess && !bypassMode && overlayConfig?.gridBypassPath?.length
    ? {
        active: true,
        power: Math.max(0, gridPowerW - homeW),
        color: gridArcColor,
        glowColor: gridArcColor,
        idleOpacity: 0.16,
      }
    : undefined;

  return (
    <View
      style={variant === 'hero' ? { flex: 1, width: "100%", height: "100%" } : [styles.card, { aspectRatio: CARD_ASPECT }]}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setCanvasSize((current) => current.width === width && current.height === height ? current : { width, height });
      }}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {variant === "hero" && overlayConfig && canvasSize.width > 0 && (
          <HeroOverlayEngine
            config={overlayConfig}
            width={canvasSize.width}
            height={canvasSize.height}
            gridPathOverride={gridPathOverride}
            isVisible={isVisible && appActive}
            animationFpsShared={animationFpsShared}
            solarFlow={{
              active: solarOnline,
              power: offline ? 0 : inverter.solarW,
              color: "#FFD54F",
              glowColor: "#FFE066",
              idleOpacity: 0.16,
            }}
            gridFlow={{
              active: gridImporting || isExporting,
              power: isExporting ? exportW : gridPowerW,
              color: (isExporting || onGridMode) ? "#6E9BFF" : gridArcColor,
              glowColor: (isExporting || onGridMode) ? "#6E9BFF" : (gridImporting ? gridArcColor : gridColor),
              idleOpacity: 0.16,
              reverse: isExporting,
            }}
            inverterOutputFlow={{
              // In on-grid mode, the inverter→DB wire turns blue (solar injecting
              // to the WAPDA bus, not feeding home via the load output).
              active: homeActive && !bypassMode,
              power: homeW,
              color: onGridMode ? "#6E9BFF" : "#45E376",
              glowColor: onGridMode ? "#6E9BFF" : "#2DDB6C",
              idleOpacity: 0.14,
            }}
            gridBypassFlow={gridBypassFlow}
            solarHidden={connecting || inverterOff || offline || solarAllZero}
            gridHidden={connecting || gridUnavailable || (solarProducing && !gridImporting && !isExporting && !onGridMode)}
            inverterOutputHidden={connecting || inverterOff || offline}
          />
        )}

        {/* ── 3-column labels: Solar | Home | Grid ── */}
        {/* Solar column (left) — hidden when inverter is offline OR solar W/V/A have been 0 for 10 consecutive polls */}
        <View
          style={[
            styles.colSolar,
            overlayConfig ? labelPositionStyle(overlayConfig.solarLabelPosition, overlayConfig.viewBox) : null,
          ]}
        >
          {!connecting && !inverterOff && !offline && solarTextVisible && (
            <>
              <View style={styles.powerRow}>
                <Text style={[styles.powerValue, { color: "#FFD54F" }, isDayTime ? styles.textOutlineDay : styles.textOutlineNight]}>{solarP.value}</Text>
                <Text style={[styles.powerUnit, { color: "#FFD54F" }, isDayTime ? styles.textOutlineDay : styles.textOutlineNight]}>{solarP.unit}</Text>
              </View>
              <Text style={[styles.vaText, styles.vaOutline]}>{solarV.toFixed(0)}V · {solarA.toFixed(1)}A</Text>
            </>
          )}
        </View>

        {/* Home column (center) — hidden only when inverter is offline */}
        <View
          style={[
            styles.colHome,
            overlayConfig ? labelPositionStyle(overlayConfig.homeLabelPosition, overlayConfig.viewBox) : null,
          ]}
        >
          {!connecting && !inverterOff && !offline && (
            <>
              <View style={styles.powerRow}>
                <Text style={[styles.powerValue, { color: onGridMode ? "#6E9BFF" : homeActive ? "#45E376" : "#8A8A8A" }, isDayTime ? styles.textOutlineDay : styles.textOutlineNight]}>{homeP.value}</Text>
                <Text style={[styles.powerUnit, { color: onGridMode ? "#6E9BFF" : homeActive ? "#45E376" : "#8A8A8A" }, isDayTime ? styles.textOutlineDay : styles.textOutlineNight]}>{homeP.unit}</Text>
              </View>
              <Text style={[styles.vaText, styles.vaOutline, onGridMode ? { color: "#6E9BFF" } : null]}>{homeV.toFixed(0)}V · {homeA.toFixed(1)}A</Text>
            </>
          )}
        </View>

        {/* Grid column (right) — hidden when wapda is cut off/unavailable */}
        <View
          style={[
            styles.colGrid,
            overlayConfig ? labelPositionStyle(overlayConfig.gridLabelPosition, overlayConfig.viewBox) : null,
          ]}
        >
          {!connecting && !gridUnavailable && (
            <>
              <View style={styles.powerRow}>
                <Text style={[styles.powerValue, { color: isExporting ? "#6E9BFF" : (gridImporting ? gridArcColor : gridColor) }, isDayTime ? styles.textOutlineDay : styles.textOutlineNight]}>{gridP.value}</Text>
                <Text style={[styles.powerUnit, { color: isExporting ? "#6E9BFF" : (gridImporting ? gridArcColor : gridColor) }, isDayTime ? styles.textOutlineDay : styles.textOutlineNight]}>{gridP.unit}</Text>
              </View>
              <Text style={[styles.vaText, styles.vaOutline]}>{tomznV.toFixed(0)}V · {tomznA.toFixed(1)}A</Text>
            </>
          )}
        </View>

        {/* ── Footer: mode ── */}
        <View style={styles.footer}>
          <View style={styles.footerPill}>
            <BlurView
              intensity={40}
              tint="dark"
              style={StyleSheet.absoluteFill}
              blurMethod={Platform.OS === "android" ? "none" : undefined}
            />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,255,255,0.05)" }]} />
            <View style={styles.footerPillRim} />
            <View style={styles.footerPillContent}>
              <View style={[styles.footerDot, { backgroundColor: modeColor }]} />
              <Text style={[styles.footerText, { color: modeColor }]}>{modeLabel}</Text>
              {/* In on-grid mode, the mode label already carries the direction
                  ("On-Grid · Importing" / "On-Grid · Exporting") — don't show
                  the pace label (On Pace / High / Low / Critical). */}
              {!onGridMode && !isExporting && (tomznDrawing || (relayOnIdle && solarProducing)) && (
                <Text style={[styles.footerText, { color: paceColor, fontWeight: '700', marginLeft: 4 }]}>
                  · {paceLabel}
                </Text>
              )}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(190,212,240,0.16)",
  },
  svg: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  // ── Solar L-shaped energy flow (vertical down → horizontal left) ──
  solarLTrack: {
    position: "absolute",
    top: "44%",
    left: "59%",
    width: 103,
    height: 62,
    marginLeft: -100,
    overflow: "visible",
  },
  solarLVertical: {
    position: "absolute",
    top: 0,
    left: 100,
    width: 3,
    height: 59,
    backgroundColor: "rgba(255,213,79,0.25)",
    borderRadius: 2,
  },
  solarLHorizontal: {
    position: "absolute",
    top: 59,
    left: 0,
    width: 100,
    height: 3,
    backgroundColor: "rgba(255,213,79,0.25)",
    borderRadius: 2,
    transform: [{ rotate: "2.6deg" }],
  },
  solarLPulseVert: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 3,
    height: 20,
    backgroundColor: "#FFE066",
    borderRadius: 2,
    shadowColor: "#FFE066",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 6,
  },
  solarLPulseHorz: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 20,
    height: 3,
    backgroundColor: "#FFE066",
    borderRadius: 2,
    shadowColor: "#FFE066",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 6,
  },
  // ── Grid L-shaped energy flow (vertical down → horizontal left to junction) ──
  gridLTrack: {
    position: "absolute",
    top: "41%",
    left: "41%",
    marginTop: 9,
    marginLeft: -100,
    width: 165,
    height: 110,
    overflow: "visible",
  },
  gridLVertical: {
    position: "absolute",
    top: 0,
    left: 170,
    width: 3,
    height: 56,
    backgroundColor: "rgba(110,155,255,0.25)",
    borderRadius: 2,
    transform: [{ rotate: "5deg" }],
  },
  gridLHorizontal: {
    position: "absolute",
    top: 49,
    left: 9,
    width: 160,
    height: 3,
    backgroundColor: "rgba(110,155,255,0.25)",
    borderRadius: 2,
    transform: [{ rotate: "2.5deg" }],
  },
  gridLPulseVert: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 3,
    height: 20,
    backgroundColor: "#6E9BFF",
    borderRadius: 2,
    shadowColor: "#6E9BFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 6,
  },
  gridLPulseVertBody: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 3,
    height: 34,
    backgroundColor: "#6E9BFF",
    borderRadius: 2,
    shadowColor: "#6E9BFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 8,
  },
  gridLPulseHorzBody: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 48,
    height: 3,
    backgroundColor: "#6E9BFF",
    borderRadius: 2,
    shadowColor: "#6E9BFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 8,
  },
  gridBypassPulseBody: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 3,
    height: 45,
    backgroundColor: "#6E9BFF",
    borderRadius: 2,
    shadowColor: "#6E9BFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 8,
  },
  gridLPulseVertBig: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 3,
    height: 60,
    backgroundColor: "#6E9BFF",
    borderRadius: 2,
    shadowColor: "#6E9BFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 8,
  },
  gridLPulseHorz: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 20,
    height: 3,
    backgroundColor: "#6E9BFF",
    borderRadius: 2,
    shadowColor: "#6E9BFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 6,
  },
  // ── Grid bypass vertical line (child of gridLTrack, from left end of horizontal going down) ──
  gridBypassLine: {
    position: "absolute",
    top: 46,
    left: 9,
    width: 3,
    height: 75,
    backgroundColor: "rgba(110,155,255,0.25)",
    borderRadius: 2,
  },
  gridBypassPulse: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 3,
    height: 20,
    backgroundColor: "#6E9BFF",
    borderRadius: 2,
    shadowColor: "#6E9BFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 6,
  },
  gridBypassPulseBig: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 3,
    height: 60,
    backgroundColor: "#6E9BFF",
    borderRadius: 2,
    shadowColor: "#6E9BFF",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 8,
  },
  // ── LIVE tag (removed — offline state shown by footer mode label) ──
  // ── 3-column labels ──
  colSolar: {
    position: "absolute",
    top: "10%",
    left: "3%",
    alignItems: "center",
    width: 90,
  },
  colHome: {
    position: "absolute",
    top: "8%",
    left: "50%",
    transform: [{ translateX: -45 }],
    alignItems: "center",
    width: 90,
  },
  colGrid: {
    position: "absolute",
    top: "10%",
    right: "3%",
    alignItems: "center",
    width: 90,
  },
  powerRow: { flexDirection: "row", alignItems: "baseline", gap: 2, marginTop: 3 },
  powerValue: { fontFamily: "Outfit", fontSize: 18, fontWeight: "800" },
  powerUnit: { fontFamily: "Outfit", fontSize: 10, fontWeight: "600" },
  // Black outline for watt values in daytime so they're readable over bright background
  textOutlineDay: {
    textShadowColor: "rgba(0,0,0,0.85)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
  // White outline for watt values at night so they're readable over dark background
  textOutlineNight: {
    textShadowColor: "rgba(255,255,255,0.5)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 2,
  },
  colLabel: { color: "#DCE6F0", fontFamily: "Outfit", fontSize: 9, fontWeight: "600", marginTop: 2 },
  // ── V/A text — white with black outline for visibility on any background ──
  vaText: { color: "#FFFFFF", fontFamily: "Outfit", fontSize: 9, fontWeight: "600", marginTop: 3 },
  vaOutline: {
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 3,
  },
  // ── Footer ──
  footer: {
    position: "absolute",
    left: "2.6%",
    right: "2.6%",
    bottom: "4.5%",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerPill: {
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
    overflow: "hidden",
    position: "relative",
  },
  footerPillRim: {
    ...StyleSheet.absoluteFill,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  footerPillContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    zIndex: 1,
  },
  footerDot: { width: 6, height: 6, borderRadius: 3 },
  footerText: { color: "#E4EDF6", fontFamily: "Outfit", fontSize: 9 },
});
