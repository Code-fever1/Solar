import { GlassCard } from "@/components/GlassCard";
import { ArrowDown, ArrowUp, Home, Sparkles, SunMedium, TowerControl, Zap } from 'lucide-react-native';
import { memo } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

const { width: screenWidth } = Dimensions.get('window');

// Theme-aware color tokens — derived from isLight flag
export type CardTheme = {
  cardBg: string;
  cardBorder: string;
  cardHighlight: string;
  cardShadow: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  trackBg: string;
  overlayBg: string;
  overlayBorder: string;
  svgGridLine: string;
  svgTrack: string;
};

const DARK_THEME: CardTheme = {
  cardBg: '#0E1520',
  cardBorder: 'rgba(255,255,255,0.06)',
  cardHighlight: 'rgba(255,255,255,0.08)',
  cardShadow: '#000',
  textPrimary: '#F4F8FC',
  textSecondary: '#94A5B8',
  textMuted: '#7A8499',
  trackBg: 'rgba(255,255,255,0.05)',
  overlayBg: 'rgba(255,255,255,0.04)',
  overlayBorder: 'rgba(255,255,255,0.06)',
  svgGridLine: 'rgba(255,255,255,0.04)',
  svgTrack: 'rgba(255,255,255,0.06)',
};

const LIGHT_THEME: CardTheme = {
  cardBg: '#FFFFFF',
  cardBorder: 'rgba(15,23,42,0.08)',
  cardHighlight: 'rgba(15,23,42,0.03)',
  cardShadow: 'rgba(15,23,42,0.08)',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  trackBg: 'rgba(15,23,42,0.06)',
  overlayBg: 'rgba(15,23,42,0.03)',
  overlayBorder: 'rgba(15,23,42,0.08)',
  svgGridLine: 'rgba(15,23,42,0.06)',
  svgTrack: 'rgba(15,23,42,0.06)',
};

function useCardTheme(isLight: boolean): CardTheme {
  return isLight ? LIGHT_THEME : DARK_THEME;
}

// Build a scene-tinted CardTheme from the active wallpaper's seam color.
// The card background is a darkened version of the seam color (×0.42), so
// each card inherits the scene's hue while staying dark enough for light
// text. Text colors are brightened (vs the base dark theme) to guarantee
// WCAG AA contrast (≥3:1 muted, ≥4.5:1 secondary/primary) even for the
// lightest scene (morning-cloud, seam 148,142,140 → card rgb(62,60,59)).
function makeSceneCardTheme(seam: [number, number, number]): CardTheme {
  const d = (v: number) => Math.round(v * 0.42);
  const [r, g, b] = seam;
  // Adapt text/overlay colors for light scenes (fog, morning-cloud) where
  // glassmorphism lets more light through — use dark text on light scenes.
  const luminance = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
  const isLightScene = luminance > 0.4;
  const overlayBase = isLightScene ? "0,0,0" : "255,255,255";
  return {
    cardBg: `rgb(${d(r)},${d(g)},${d(b)})`,
    cardBorder: `rgba(${overlayBase},0.12)`,
    cardHighlight: `rgba(${overlayBase},0.08)`,
    cardShadow: 'rgba(0,0,0,0.5)',
    textPrimary: isLightScene ? '#1A2332' : '#F8FAFC',
    textSecondary: isLightScene ? '#475569' : '#CBD5E1',
    textMuted: isLightScene ? '#64748B' : '#94A3B8',
    trackBg: `rgba(${overlayBase},0.08)`,
    overlayBg: `rgba(${overlayBase},0.06)`,
    overlayBorder: `rgba(${overlayBase},0.12)`,
    svgGridLine: `rgba(${overlayBase},${isLightScene ? 0.12 : 0.06})`,
    svgTrack: `rgba(${overlayBase},0.06)`,
  };
}

// Color helper: keeps original color above 20 units, transitions yellow→red as it drops below 20
// At 20: yellow (#F8C653), at 0: red (#EF4C4C), interpolated in between
function gaugeColor(remaining: number, baseColor: string): string {
  if (remaining >= 20) return baseColor;
  // t = 1 at 20 (yellow), t = 0 at 0 (red)
  const t = Math.max(0, remaining) / 20;
  // Yellow: #F8C653 = (248, 198, 83)
  // Red:    #EF4C4C = (239, 76, 76)
  const r = Math.round(248 * t + 239 * (1 - t));
  const g = Math.round(198 * t + 76 * (1 - t));
  const b = Math.round(83 * t + 76 * (1 - t));
  return `rgb(${r},${g},${b})`;
}
const cardWidth = (screenWidth - 32) / 2;

// ═══════════════════════════════════════════════════════════════════════
//  ENERGY PULSE — Live Energy Control Center
//  Typography: 24 / 16 / 11 / 8  ·  8pt grid  ·  Layered depth
// ═══════════════════════════════════════════════════════════════════════

// ── Energy Received Today ───────────────────────────────────────────────
export const EnergyReceivedCard = memo(function EnergyReceivedCard({ totalEnergy, solarEnergy, gridEnergy, isWapda, isLight = false, cardTheme }: {
  totalEnergy: number; solarEnergy: number; gridEnergy: number; isWapda: boolean; isLight?: boolean; cardTheme?: CardTheme;
}) {
  const t = cardTheme ?? useCardTheme(isLight);
  const solarShare = totalEnergy > 0 ? Math.round((solarEnergy / totalEnergy) * 100) : 0;
  const gridShare = totalEnergy > 0 ? 100 - solarShare : 0;
  const dominant = solarShare >= gridShare ? 'solar' : 'grid';

  return (
    <GlassCard style={s.card}>
      <View style={s.cardHeader}>
        <Zap size={11} color="#F5C42E" />
        <Text style={[s.cardTitle, { color: t.textSecondary }]}>Energy Received</Text>
        <Text style={[s.cardTitleRight, { color: t.textSecondary }]}>Today</Text>
      </View>

      {/* Hero — total value */}
      <Text style={[s.heroValue, { color: t.textPrimary }]}>{totalEnergy.toFixed(2)}<Text style={[s.heroUnit, { color: t.textSecondary }]}> units</Text></Text>

      {/* Source bars — numbers dominate, donut is secondary */}
      <View style={s.sourceBars}>
        <View style={s.sourceBarRow}>
          <View style={s.sourceBarLeft}>
            <SunMedium size={10} color="#F5C42E" />
            <Text style={[s.sourceBarLabel, { color: t.textSecondary }]}>Solar</Text>
          </View>
          <Text style={[s.sourceBarValue, { color: t.textPrimary }]}>{solarEnergy.toFixed(2)}</Text>
          <View style={[s.sourceBarTrack, { backgroundColor: t.trackBg }]}>
            <View style={[s.sourceBarFill, { backgroundColor: '#F5C42E', width: `${solarShare}%` }]} />
          </View>
          <Text style={[s.sourceBarPct, { color: t.textSecondary }]}>{solarShare}%</Text>
        </View>

        <View style={s.sourceBarRow}>
          <View style={s.sourceBarLeft}>
            <TowerControl size={10} color="#548EFF" />
            <Text style={[s.sourceBarLabel, { color: t.textSecondary }]}>Grid</Text>
          </View>
          <Text style={[s.sourceBarValue, { color: t.textPrimary }]}>{gridEnergy.toFixed(2)}</Text>
          <View style={[s.sourceBarTrack, { backgroundColor: t.trackBg }]}>
            <View style={[s.sourceBarFill, { backgroundColor: '#548EFF', width: `${gridShare}%` }]} />
          </View>
          <Text style={[s.sourceBarPct, { color: t.textSecondary }]}>{gridShare}%</Text>
        </View>
      </View>

      {/* Mini donut — small, secondary indicator */}
      <View style={s.donutRow}>
        <MiniDonut solarShare={solarShare} gridShare={gridShare} size={44} isLight={isLight} />
        <View style={[s.sourceChip, { backgroundColor: t.overlayBg }]}>
          <View style={[s.chipDot, { backgroundColor: isWapda ? '#548EFF' : '#F5C42E' }]} />
          <Text style={[s.chipText, { color: t.textSecondary }]}>
            {isWapda ? 'Grid Active' : 'Solar Active'} · {dominant === 'solar' ? 'Sun-fed' : 'Wapda-fed'}
          </Text>
        </View>
      </View>
    </GlassCard>
  );
});

// ── Energy Used Today ───────────────────────────────────────────────────
export const EnergyUsedCard = memo(function EnergyUsedCard({ totalHomeUsage, liveLoadW, peakLoadW, vsYesterdayPercent, voltage, currentA, loadStatus, normalDrawKw, isLight = false, cardTheme }: {
  totalHomeUsage: number; liveLoadW: number; peakLoadW: number; vsYesterdayPercent: number | null;
  voltage: number; currentA: number; loadStatus: 'Low' | 'Normal' | 'High';
  normalDrawKw: number; isLight?: boolean; cardTheme?: CardTheme;
}) {
  const t = cardTheme ?? useCardTheme(isLight);
  const hasTrend = vsYesterdayPercent != null;
  const isLower = hasTrend && vsYesterdayPercent <= 0;
  const statusColor = loadStatus === 'High' ? '#EF4C4C' : loadStatus === 'Low' ? '#7A8499' : '#32E56B';
  const loadPct = Math.min(100, (liveLoadW / 2500) * 100);

  return (
    <GlassCard style={s.card}>
      <View style={s.cardHeader}>
        <Home size={11} color="#32E56B" />
        <Text style={[s.cardTitle, { color: t.textSecondary }]}>Energy Used</Text>
        <Text style={[s.cardTitleRight, { color: t.textSecondary }]}>Today</Text>
      </View>

      {/* Hero — total usage */}
      <Text style={[s.heroValue, { color: t.textPrimary }]}>{totalHomeUsage.toFixed(2)}<Text style={[s.heroUnit, { color: t.textSecondary }]}> units</Text></Text>

      {/* Live load — with V·A context and colored zone gauge */}
      <View style={s.liveBlock}>
        <View style={s.liveLeft}>
          <Text style={[s.liveLabel, { color: t.textSecondary }]}>● Live Load</Text>
          <Text style={s.liveValue}>{Math.round(liveLoadW)}<Text style={s.liveUnit}> W</Text></Text>
        </View>

        {/* Horizontal load indicator with zones */}
        <View style={s.loadGaugeWrap}>
          <View style={s.loadGaugeTrack}>
            <View style={s.zoneIdle} />
            <View style={s.zoneNormal} />
            <View style={s.zoneHigh} />
            <View style={[s.loadGaugeFill, { width: `${loadPct}%` }]} />
            <View style={[s.loadGaugeMarker, { left: `${loadPct}%`, backgroundColor: t.textPrimary }]} />
          </View>
          <View style={s.loadGaugeLabels}>
            <Text style={[s.gaugeScaleText, { color: t.textSecondary }]}>0</Text>
            <Text style={[s.gaugeScaleText, { color: t.textSecondary }]}>1kW</Text>
            <Text style={[s.gaugeScaleText, { color: t.textSecondary }]}>2.5kW</Text>
          </View>
          <Text style={[s.loadStatusText, { color: statusColor }]}>● {loadStatus} Load</Text>
        </View>
      </View>

      {/* Stats — peak + vs yesterday */}
      <View style={[s.statRow, { backgroundColor: t.overlayBg }]}>
        <View style={s.statItem}>
          <Text style={[s.statLabel, { color: t.textSecondary }]}>Peak Today</Text>
          <Text style={[s.statValue, { color: t.textPrimary }]}>{Math.round(peakLoadW)}W</Text>
        </View>
        <View style={[s.statSep, { backgroundColor: t.overlayBorder }]} />
        <View style={s.statItem}>
          <Text style={[s.statLabel, { color: t.textSecondary }]}>vs Yesterday</Text>
          {hasTrend ? (
            <View style={s.vsRow}>
              {isLower ? <ArrowDown size={10} color="#32E56B" /> : <ArrowUp size={10} color="#EF4C4C" />}
              <Text style={[s.vsValue, { color: isLower ? '#32E56B' : '#EF4C4C' }]}>{Math.abs(vsYesterdayPercent as number)}%</Text>
            </View>
          ) : (
            <Text style={[s.vsValue, { color: t.textSecondary }]}>Building…</Text>
          )}
        </View>
      </View>
    </GlassCard>
  );
});

// ── AI Forecast & Budget — Hero centerpiece (merged with Meter Details) ─
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const ForecastBudgetCard = memo(function ForecastBudgetCard({
  expectedUnits, vsLastMonth, lastMonthTotal, confidence, dailyUsage, budgetLeft, budgetTarget,
  daysLeft, combinedDaysLeft, averageDaily,
  meter1Left, meter1Target, meter1Used, meter1Today, meter1DaysLeft,
  meter2Left, meter2Target, meter2Used, meter2Today, meter2DaysLeft,
  cycleStartTs, billingEndTs,
  isLight = false, cardTheme,
}: {
  expectedUnits: number; vsLastMonth: number | null; lastMonthTotal: number; confidence: number;
  dailyUsage: Array<{ timestamp: number; label: string; usage: number }>;
  budgetLeft: number; budgetTarget: number; daysLeft: number;
  combinedDaysLeft: number; averageDaily: number;
  meter1Left: number; meter1Target: number; meter1Used: number; meter1Today: number; meter1DaysLeft: number;
  meter2Left: number; meter2Target: number; meter2Used: number; meter2Today: number; meter2DaysLeft: number;
  cycleStartTs?: number; billingEndTs?: number;
  isLight?: boolean; cardTheme?: CardTheme;
}) {
  const t = cardTheme ?? useCardTheme(isLight);
  const totalTarget = 400;
  const totalRemaining = meter1Left + meter2Left;
  const totalUsed = meter1Used + meter2Used;
  const budgetPct = Math.max(0, Math.min(100, (totalRemaining / totalTarget) * 100));
  const budgetHealth = budgetPct > 50 ? 'Healthy' : budgetPct > 25 ? 'Moderate' : 'Low';

  // Over/under budget — uses backend's projectedMonthly (same as old UI)
  const overBudget = Math.round(expectedUnits - totalTarget);
  const isOver = overBudget > 0;

  // Meter gauge calculations
  const m1Pct = Math.round((meter1Left / meter1Target) * 100);
  const m2Pct = Math.round((meter2Left / meter2Target) * 100);
  const arcLength = 167.5;
  const m1Stroke = (m1Pct / 100) * arcLength;
  const m2Stroke = (m2Pct / 100) * arcLength;

  // Chart dimensions
  const chH = 130;
  const chW = screenWidth * 0.48;

  // ── Build cumulative actual + forecast across the billing cycle ──
  // Use the backend's cycleStart and billingEnd from meta (fully dynamic —
  // follows the billing day automatically each month). Fall back to local
  // computation with billingDay=28 if meta is unavailable (offline cache).
  const now = new Date();
  const billingDay = 28;
  const cycleStartDate = cycleStartTs && Number.isFinite(cycleStartTs)
    ? new Date(cycleStartTs)
    : (() => {
        const m = now.getDate() >= billingDay ? now.getMonth() : now.getMonth() - 1;
        const y = m < 0 ? now.getFullYear() - 1 : now.getFullYear();
        return new Date(y, ((m % 12) + 12) % 12, billingDay);
      })();
  const cycleEndDate = billingEndTs && Number.isFinite(billingEndTs)
    ? new Date(billingEndTs)
    : new Date(cycleStartDate.getFullYear(), cycleStartDate.getMonth() + 1, billingDay);
  const totalCycleDays = Math.max(1, Math.round((cycleEndDate.getTime() - cycleStartDate.getTime()) / 86_400_000));
  const elapsedDays = Math.max(0, Math.min(totalCycleDays, Math.floor((now.getTime() - cycleStartDate.getTime()) / 86_400_000)));
  const remainingDays = Math.max(1, totalCycleDays - elapsedDays);

  const sortedDaily = [...dailyUsage].sort((a, b) => a.timestamp - b.timestamp);

  // ── Build actual cumulative mapped to day-offset from cycle start ──
  // The backend's dailyUsage only covers the last 7 days, but the graph spans
  // the entire billing cycle (up to 31 days from the 28th). We need to:
  //  1. Map each dailyUsage entry to its correct day offset from cycle start
  //     (based on its timestamp, NOT its array index).
  //  2. Anchor the total to meter1Used + meter2Used (total used in the cycle).
  //     The usage before the 7-day window = totalUsed - sum(7-day dailyUsage).
  //  3. For days before the 7-day window, ramp linearly from 0 to the first
  //     data point's cumulative (which includes the pre-window usage).
  //  4. For days with data, use the real cumulative.
  //  5. For days after the last data point (but ≤ today), extend flat.
  const cycleStartMs = cycleStartDate.getTime();
  const recentTotal = sortedDaily.reduce((sum, d) => sum + d.usage, 0);
  const earlyTotal = Math.max(0, totalUsed - recentTotal); // usage before the 7-day window
  const dayOffsetToCumulative = new Map<number, number>();
  let cumulative = earlyTotal;
  let firstDataDayOffset = -1;
  let lastDataDayOffset = -1;
  for (const day of sortedDaily) {
    cumulative += day.usage;
    const dayOffset = Math.round((day.timestamp - cycleStartMs) / 86_400_000);
    if (firstDataDayOffset < 0) firstDataDayOffset = dayOffset;
    lastDataDayOffset = dayOffset;
    dayOffsetToCumulative.set(dayOffset, cumulative);
  }
  // Fallbacks when no dailyUsage at all
  if (firstDataDayOffset < 0) firstDataDayOffset = elapsedDays;
  if (lastDataDayOffset < 0) lastDataDayOffset = elapsedDays;

  // Use backend's combinedDaysLeft (blends TOMZN + historical, same as old UI)
  // combinedDaysLeft = how many days until both meters run out at current burn rate
  const remainingCycleDays = Math.max(1, totalCycleDays - elapsedDays);
  const daysBuffer = Math.round(combinedDaysLeft - remainingCycleDays);
  let displayDays: string;
  if (daysBuffer > 0) {
    displayDays = `+${daysBuffer} days buffer`;
  } else if (daysBuffer < 0) {
    displayDays = `${Math.abs(daysBuffer)} days over`;
  } else {
    displayDays = `On pace`;
  }

  // Days left for meter gauges middle column — sum per-meter projectedDaysLeft
  // (same as old UI: m1.projectedDaysLeft + m2.projectedDaysLeft)
  const estDaysLeft = meter1DaysLeft + meter2DaysLeft;

  const lastActualCumulative = cumulative; // includes earlyTotal + all dailyUsage
  // Hardcode yMax to 400 units so the forecast line scales accordingly
  const yMax = 400;

  const forecastPoints: Array<{ x: number; y: number }> = [];
  const actualPoints: Array<{ x: number; y: number }> = [];
  const totalPoints = totalCycleDays;

  // Actual line: from day 0 to today (elapsedDays). Each day is plotted at its
  // correct x-position based on its offset from the cycle start. Days before the
  // 7-day data window ramp from 0 to the first data point; days after the last
  // data point extend flat to today.
  const firstDataCumulative = dayOffsetToCumulative.get(firstDataDayOffset) ?? lastActualCumulative;
  let prevCumulative = 0;
  for (let i = 0; i <= elapsedDays; i++) {
    const x = (i / totalPoints) * chW;
    let val: number;
    if (dayOffsetToCumulative.has(i)) {
      val = dayOffsetToCumulative.get(i)!;
    } else if (i < firstDataDayOffset && firstDataDayOffset > 0) {
      // Before the 7-day window: ramp linearly from 0 to the first data point
      val = (firstDataCumulative * i) / firstDataDayOffset;
    } else {
      // After the last data point but before today: extend flat
      val = prevCumulative;
    }
    prevCumulative = val;
    const y = chH - Math.min(1, val / yMax) * chH;
    actualPoints.push({ x, y });
  }

  // Forecast line: day-of-week-aware curve that bumps on weekends.
  // Learns the weekly usage pattern from dailyUsage (each day-of-week's average
  // consumption), then projects each future day using its day-of-week average.
  // The curve is scaled so the total matches expectedUnits (backend's projection).
  // This creates realistic bumps on weekends (when consumption is higher) while
  // staying flat on weekdays — instead of a flat straight line.
  const dowAvg: number[] = new Array(7).fill(0);   // 0=Sun, 1=Mon, ..., 6=Sat
  const dowCount: number[] = new Array(7).fill(0);
  for (const day of sortedDaily) {
    if (day.usage > 0) {
      const dow = new Date(day.timestamp).getDay();
      dowAvg[dow] += day.usage;
      dowCount[dow] += 1;
    }
  }
  for (let d = 0; d < 7; d++) {
    if (dowCount[d] > 0) dowAvg[d] /= dowCount[d];
  }
  // Fallback: if no dailyUsage history, use flat averageDaily for all days.
  const hasDowPattern = dowCount.some((c) => c > 0);
  const flatDaily = averageDaily > 0 ? averageDaily : (expectedUnits / Math.max(1, totalCycleDays));
  const getPredictedDaily = (dayOffset: number): number => {
    if (!hasDowPattern) return flatDaily;
    const futureDate = new Date(cycleStartDate.getTime() + dayOffset * 86_400_000);
    const dow = futureDate.getDay();
    return dowAvg[dow] > 0 ? dowAvg[dow] : flatDaily;
  };
  // Build per-day predictions for the remaining cycle, then scale to match
  // expectedUnits so the curve endpoint aligns with the backend's projection.
  const remainingStart = elapsedDays + 1;
  const rawPredictions: number[] = [];
  let rawTotal = 0;
  for (let i = remainingStart; i <= totalCycleDays; i++) {
    const pred = getPredictedDaily(i);
    rawPredictions.push(pred);
    rawTotal += pred;
  }
  // Scale factor: (expectedUnits - lastActualCumulative) / rawTotal
  // This preserves the weekend bump SHAPE while hitting the backend's endpoint.
  const targetRemaining = Math.max(0, expectedUnits - lastActualCumulative);
  const scale = rawTotal > 0 ? targetRemaining / rawTotal : 1;

  const forecastStartX = actualPoints.length > 0 ? actualPoints[actualPoints.length - 1].x : 0;
  const forecastStartY = actualPoints.length > 0 ? actualPoints[actualPoints.length - 1].y : chH;
  forecastPoints.push({ x: forecastStartX, y: forecastStartY });

  let forecastCumulative = lastActualCumulative;
  for (let i = remainingStart; i <= totalCycleDays; i++) {
    const predIdx = i - remainingStart;
    const pred = rawPredictions[predIdx] * scale;
    forecastCumulative += pred;
    const x = (i / totalPoints) * chW;
    const y = chH - Math.min(1, forecastCumulative / yMax) * chH;
    forecastPoints.push({ x, y });
  }

  const actualPath = actualPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const forecastPath = forecastPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  const currentX = actualPoints.length > 0 ? actualPoints[actualPoints.length - 1].x : 0;
  const currentY = actualPoints.length > 0 ? actualPoints[actualPoints.length - 1].y : chH;

  // X-axis labels: compute actual dates at 5 points across the cycle (0%,
  // 25%, 50%, 75%, 100%) and format as "Mon DD". This is fully dynamic —
  // follows the billing cycle dates automatically each month.
  const fmtLabel = (ts: number): string => {
    const d = new Date(ts);
    return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  };
  const cycleEndMs = cycleEndDate.getTime();
  const cycleSpan = cycleEndMs - cycleStartMs;
  const startLabel = fmtLabel(cycleStartMs);
  const q1Label = fmtLabel(cycleStartMs + cycleSpan * 0.25);
  const midLabel = fmtLabel(cycleStartMs + cycleSpan * 0.5);
  const q3Label = fmtLabel(cycleStartMs + cycleSpan * 0.75);
  const endLabel = fmtLabel(cycleEndMs);

  return (
    <GlassCard style={s.wideCard}>
      {/* Header */}
      <View style={s.cardHeader}>
        <View style={s.headerLeft}>
          <Sparkles size={12} color="#8862ED" />
          <Text style={[s.cardTitle, { color: t.textSecondary }]}>AI Forecast & Budget</Text>
          <View style={s.confidenceBadge}>
            <Text style={[s.confidenceText, { color: '#A78BFA' }]}>{confidence}% Confidence</Text>
          </View>
        </View>
        <View style={s.headerRight}>
          {vsLastMonth != null && lastMonthTotal > 0 ? (
            <View style={[s.trendChip, { backgroundColor: t.overlayBg }]}>
              {vsLastMonth <= 0 ? <ArrowDown size={11} color="#32E56B" /> : <ArrowUp size={11} color="#EF4C4C" />}
              <Text style={[s.trendText, { color: vsLastMonth <= 0 ? '#32E56B' : '#EF4C4C' }]}>
                {Math.abs(vsLastMonth)}%
              </Text>
            </View>
          ) : (
            <View style={[s.trendChip, { backgroundColor: t.overlayBg }]}>
              <Text style={[s.trendText, { color: t.textSecondary }]}>
                Set last month total in settings
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={s.contentRow}>
        <View style={s.leftCol}>
          <Text style={[s.forecastHeroValue, { color: t.textPrimary }]}>{Math.round(expectedUnits)}</Text>
          <Text style={[s.forecastHeroUnit, { color: t.textSecondary }]}>units predicted by {endLabel}</Text>
          <Text style={[s.forecastOverUnder, { color: isOver ? '#EF4C4C' : '#32E56B' }]}>
            {isOver ? `+${overBudget} units saved` : overBudget === 0 ? 'On budget' : `${Math.abs(overBudget)} units saved`}
          </Text>

          {/* This month vs last month comparison — always visible */}
          {(() => {
            const hasLastMonth = lastMonthTotal > 0;
            const unitGap = hasLastMonth ? Math.round(expectedUnits - lastMonthTotal) : 0;
            const gapColor = unitGap > 0 ? '#EF4C4C' : unitGap < 0 ? '#32E56B' : t.textPrimary;
            return (
              <View style={[s.vsLastMonthRow, { backgroundColor: t.overlayBg }]}>
                <View style={s.vsLastMonthCol}>
                  <Text style={[s.vsLastMonthLabel, { color: t.textSecondary }]}>This month</Text>
                  <Text style={[s.vsLastMonthValue, { color: t.textPrimary }]}>{Math.round(expectedUnits)}</Text>
                </View>
                <View style={s.vsLastMonthArrow}>
                  {hasLastMonth ? (
                    unitGap > 0 ? <ArrowUp size={14} color={gapColor} /> : unitGap < 0 ? <ArrowDown size={14} color={gapColor} /> : <Text style={[s.vsLastMonthEqual, { color: t.textPrimary }]}>—</Text>
                  ) : (
                    <Text style={[s.vsLastMonthEqual, { color: t.textPrimary }]}>—</Text>
                  )}
                  <Text style={[s.vsLastMonthGap, { color: hasLastMonth ? gapColor : t.textSecondary }]}>
                    {hasLastMonth ? `${unitGap > 0 ? '+' : ''}${unitGap}` : 'N/A'}
                  </Text>
                </View>
                <View style={s.vsLastMonthCol}>
                  <Text style={[s.vsLastMonthLabel, { color: t.textSecondary }]}>Last month</Text>
                  <Text style={[s.vsLastMonthValue, { color: t.textPrimary }, !hasLastMonth && { color: t.textSecondary, fontSize: 10 }]}>
                    {hasLastMonth ? Math.round(lastMonthTotal) : 'Set in settings'}
                  </Text>
                </View>
              </View>
            );
          })()}

          <View style={[s.budgetHealthChip, { backgroundColor: t.overlayBg }]}>
            <View style={[s.budgetHealthDot, { backgroundColor: budgetPct > 50 ? '#32E56B' : budgetPct > 25 ? '#F8C653' : '#EF4C4C' }]} />
            <Text style={[s.budgetHealthText, { color: t.textPrimary }]}>{displayDays}</Text>
          </View>
        </View>

        <View style={s.rightCol}>
          <View style={s.chartHeader}>
            <Text style={[s.colLabel, { color: t.textSecondary }]}>Cumulative Usage (units)</Text>
            <View style={s.legendRow}>
              <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#32E56B' }]} /><Text style={[s.legendText, { color: t.textSecondary }]}>Actual</Text></View>
              <View style={s.legendItem}><View style={[s.legendDash, { backgroundColor: '#F8C653' }]} /><Text style={[s.legendText, { color: t.textSecondary }]}>Forecast</Text></View>
            </View>
          </View>
          
          <View style={s.chartArea}>
            <View style={s.yAxisCol}>
              <Text style={[s.axisText, { color: t.textSecondary }]}>{yMax}</Text>
              <Text style={[s.axisText, { color: t.textSecondary }]}>{Math.round(yMax * 0.66)}</Text>
              <Text style={[s.axisText, { color: t.textSecondary }]}>{Math.round(yMax * 0.33)}</Text>
              <Text style={[s.axisText, { color: t.textSecondary }]}>0</Text>
            </View>
            <View style={[s.chartPlot, { borderColor: t.svgGridLine }]}>
              <Svg width="100%" height={chH} viewBox={`0 0 ${chW} ${chH}`} preserveAspectRatio="none">
                <Line x1="0" y1={chH * 0.25} x2={chW} y2={chH * 0.25} stroke={t.svgGridLine} strokeWidth="0.5" />
                <Line x1="0" y1={chH * 0.5} x2={chW} y2={chH * 0.5} stroke={t.svgGridLine} strokeWidth="0.5" />
                <Line x1="0" y1={chH * 0.75} x2={chW} y2={chH * 0.75} stroke={t.svgGridLine} strokeWidth="0.5" />
                {forecastPath && <Path d={forecastPath} stroke="#F8C653" strokeWidth="1.5" fill="none" strokeDasharray="3 3" />}
                {actualPath && <Path d={actualPath} stroke="#32E56B" strokeWidth="2" fill="none" />}
                {/* Today marker — vertical dashed line at elapsedDays position */}
                {elapsedDays > 0 && elapsedDays < totalCycleDays && (
                  <Line x1={currentX} y1="0" x2={currentX} y2={chH} stroke="#32E56B" strokeWidth="0.5" strokeDasharray="2 3" opacity="0.4" />
                )}
                <Circle cx={currentX} cy={currentY} r="3.5" fill="#32E56B" />
                <Circle cx={currentX} cy={currentY} r="6" fill="#32E56B" opacity="0.2" />
              </Svg>
            </View>
          </View>
          <View style={s.xAxisRow}>
            <Text style={[s.axisText, { color: t.textSecondary }]}>{startLabel}</Text>
            <Text style={[s.axisText, { color: t.textSecondary }]}>{q1Label}</Text>
            <Text style={[s.axisText, { color: t.textSecondary }]}>{midLabel}</Text>
            <Text style={[s.axisText, { color: t.textSecondary }]}>{q3Label}</Text>
            <Text style={[s.axisText, { color: t.textSecondary }]}>{endLabel}</Text>
          </View>
        </View>
      </View>

      {/* ── Horizontal divider ── */}
      <View style={[s.sectionDivider, { backgroundColor: t.overlayBorder }]} />

      {/* ── Meter Gauges Row ── */}
      <View style={s.meterDetailsRow}>

        {/* Meter 1 */}
        <View style={s.meterDetailsCol}>
          <Text style={[s.meterDetailsTitle, { color: t.textPrimary }]}>Meter 1 (Analog)</Text>
          <View style={s.meterGaugeWrap}>
            <Svg width={100} height={100} viewBox="0 0 100 100">
              <Circle cx="50" cy="50" r="40" stroke={isLight ? "rgba(50,229,107,0.12)" : "rgba(50,229,107,0.15)"} strokeWidth="8" fill="none" strokeDasharray="167.5 251.3" strokeLinecap="round" transform="rotate(150 50 50)" />
              <Circle cx="50" cy="50" r="40" stroke={gaugeColor(meter1Left, '#32E56B')} strokeWidth="8" fill="none" strokeDasharray={`${m1Stroke} 251.3`} strokeLinecap="round" transform="rotate(150 50 50)" />
            </Svg>
            <View style={s.meterGaugeInner}>
              <Text style={[s.meterGaugeValue, { color: t.textPrimary }]}>{Math.round(meter1Left)}</Text>
              <Text style={[s.meterGaugeUnit, { color: t.textSecondary }]}>units left</Text>
            </View>
          </View>
          <View style={s.meterStatsCol}>
            <Text style={[s.meterStatTotalLabel, { color: t.textSecondary }]}>Total Used</Text>
            <Text style={[s.meterStatTotalValue, { color: t.textPrimary }]}>{meter1Used.toFixed(2)} <Text style={[s.meterStatUnit, { color: t.textSecondary }]}>units</Text></Text>
            <View style={[s.meterStatSep, { backgroundColor: t.overlayBorder }]} />
            <View style={[s.meterTodayPill, { backgroundColor: t.overlayBg }]}>
              <Text style={[s.meterTodayLabel, { color: t.textSecondary }]}>Today</Text>
              <Text style={[s.meterTodayValue, { color: t.textPrimary }]}>{meter1Today.toFixed(2)} units</Text>
            </View>
          </View>
        </View>

        <View style={[s.meterDetailsDivider, { backgroundColor: t.overlayBorder }]} />

        {/* Middle — Total Remaining ring */}
        <View style={s.meterDetailsMiddle}>
          <Text style={[s.middleTitle, { color: t.textSecondary }]}>TOTAL REMAINING</Text>
          <View style={s.middleRingWrap}>
            <Svg width={110} height={110} viewBox="0 0 140 140">
              <Circle cx="70" cy="70" r="60" stroke={isLight ? "rgba(136,98,237,0.12)" : "rgba(136,98,237,0.15)"} strokeWidth="12" fill="none" strokeDasharray="282.7 377" strokeLinecap="round" transform="rotate(135 70 70)" />
              <Circle cx="70" cy="70" r="60" stroke={gaugeColor(totalRemaining, '#8862ED')} strokeWidth="12" fill="none" strokeDasharray={`${(budgetPct / 100) * 282.7} 377`} strokeLinecap="round" transform="rotate(135 70 70)" />
            </Svg>
            <View style={s.middleRingInner}>
              <Text style={[s.middleRingValue, { color: t.textPrimary }]}>{Math.round(totalRemaining)}</Text>
              <Text style={[s.middleRingUnit, { color: t.textSecondary }]}>units left</Text>
            </View>
          </View>
          <Text style={[s.middleRemainingDays, { color: t.textSecondary }]}>≈ {estDaysLeft} days remaining</Text>
          <View style={s.meterStatsCol}>
            <Text style={[s.meterStatTotalLabel, { color: t.textSecondary }]}>Total Used</Text>
            <Text style={[s.meterStatTotalValue, { color: t.textPrimary }]}>{totalUsed.toFixed(2)} <Text style={[s.meterStatUnit, { color: t.textSecondary }]}>units</Text></Text>
          </View>
        </View>

        <View style={[s.meterDetailsDivider, { backgroundColor: t.overlayBorder }]} />

        {/* Meter 2 */}
        <View style={s.meterDetailsCol}>
          <Text style={[s.meterDetailsTitle, { color: t.textPrimary }]}>Meter 2 (Digital)</Text>
          <View style={s.meterGaugeWrap}>
            <Svg width={100} height={100} viewBox="0 0 100 100">
              <Circle cx="50" cy="50" r="40" stroke={isLight ? "rgba(84,142,255,0.12)" : "rgba(84,142,255,0.15)"} strokeWidth="8" fill="none" strokeDasharray="167.5 251.3" strokeLinecap="round" transform="rotate(150 50 50)" />
              <Circle cx="50" cy="50" r="40" stroke={gaugeColor(meter2Left, '#548EFF')} strokeWidth="8" fill="none" strokeDasharray={`${m2Stroke} 251.3`} strokeLinecap="round" transform="rotate(150 50 50)" />
            </Svg>
            <View style={s.meterGaugeInner}>
              <Text style={[s.meterGaugeValue, { color: t.textPrimary }]}>{Math.round(meter2Left)}</Text>
              <Text style={[s.meterGaugeUnit, { color: t.textSecondary }]}>units left</Text>
            </View>
          </View>
          <View style={s.meterStatsCol}>
            <Text style={[s.meterStatTotalLabel, { color: t.textSecondary }]}>Total Used</Text>
            <Text style={[s.meterStatTotalValue, { color: t.textPrimary }]}>{meter2Used.toFixed(2)} <Text style={[s.meterStatUnit, { color: t.textSecondary }]}>units</Text></Text>
            <View style={[s.meterStatSep, { backgroundColor: t.overlayBorder }]} />
            <View style={[s.meterTodayPill, { backgroundColor: t.overlayBg }]}>
              <Text style={[s.meterTodayLabel, { color: t.textSecondary }]}>Today</Text>
              <Text style={[s.meterTodayValue, { color: t.textPrimary }]}>{meter2Today.toFixed(2)} units</Text>
            </View>
          </View>
        </View>

      </View>
    </GlassCard>
  );
});

// ── Mini Donut helper ───────────────────────────────────────────────────
function MiniDonut({ solarShare, gridShare, size, isLight = false }: { solarShare: number; gridShare: number; size: number; isLight?: boolean }) {
  const r = (size - 8) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  const solarStroke = (solarShare / 100) * circ;
  const gridStroke = (gridShare / 100) * circ;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={cx} cy={cx} r={r} stroke={isLight ? "rgba(15,23,42,0.06)" : "rgba(255,255,255,0.06)"} strokeWidth="4" fill="none" />
      {solarShare > 0 && (
        <Circle cx={cx} cy={cx} r={r} stroke="#F5C42E" strokeWidth="4"
          strokeDasharray={`${solarStroke} ${circ}`} fill="none"
          strokeLinecap="round" transform={`rotate(-90 ${cx} ${cx})`} />
      )}
      {gridShare > 0 && (
        <Circle cx={cx} cy={cx} r={r} stroke="#548EFF" strokeWidth="4"
          strokeDasharray={`${gridStroke} ${circ}`} strokeDashoffset={-solarStroke}
          fill="none" strokeLinecap="round" transform={`rotate(-90 ${cx} ${cx})`} />
      )}
    </Svg>
  );
}

// ── Styles — layered depth, 8pt grid, 4 typography sizes ────────────────
const s = StyleSheet.create({
  // Card shells — layered depth (border + top highlight + shadow)
  card: {
    width: cardWidth,
    borderRadius: 14,
    padding: 12,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  wideCard: {
    width: '100%',
    borderRadius: 14,
    padding: 14,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  // Faint top highlight — glass effect
  cardHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },

  // Headers
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1, flexShrink: 1 },
  cardTitle: {
    fontSize: 10,
    fontFamily: 'Outfit',
    fontWeight: '600',
    flexShrink: 1,
    letterSpacing: 0.3,
    flex: 1,
  },
  cardTitleRight: {
    fontSize: 9,
    fontFamily: 'Outfit',
  },

  // Hero values — primary focus
  heroValue: {
    fontSize: 24,
    fontFamily: 'Outfit',
    fontWeight: '700',
    marginBottom: 10,
  },
  heroUnit: {
    fontSize: 11,
    fontWeight: '500',
  },

  // Source bars — numbers dominate, not donut
  sourceBars: {
    gap: 6,
    marginBottom: 8,
  },
  sourceBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sourceBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    width: 48,
  },
  sourceBarLabel: {

    fontSize: 9,
    fontFamily: 'Outfit',
  },
  sourceBarValue: {

    fontSize: 11,
    fontFamily: 'Outfit',
    fontWeight: '700',
    width: 32,
  },
  sourceBarTrack: {
    flex: 1,
    height: 4,

    borderRadius: 2,
  },
  sourceBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  sourceBarPct: {

    fontSize: 9,
    fontFamily: 'Outfit',
    width: 28,
    textAlign: 'right',
  },

  // Donut row — mini donut + source chip
  donutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sourceChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 8,

    borderRadius: 8,
  },
  chipDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  chipText: {

    fontSize: 9,
    fontFamily: 'Outfit',
  },

  // Live load block — with V·A context
  liveBlock: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  liveLeft: {
    flex: 1,
  },
  liveLabel: {
    color: '#32E56B',
    fontSize: 8,
    fontFamily: 'Outfit',
    fontWeight: '600',
    marginBottom: 2,
  },
  liveValue: {
    color: '#32E56B',
    fontSize: 18,
    fontFamily: 'Outfit',
    fontWeight: '700',
  },
  liveUnit: {
    fontSize: 10,
    color: '#32E56B',
  },
  liveContext: {

    fontSize: 9,
    fontFamily: 'Outfit',
    marginTop: 2,
  },

  // Horizontal load gauge — with colored zones
  loadGaugeWrap: {
    width: 100,
    alignItems: 'flex-end',
  },
  loadGaugeTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    flexDirection: 'row',
    overflow: 'hidden',
    position: 'relative',
  },
  zoneIdle: {
    flex: 20,
    backgroundColor: 'rgba(92,108,126,0.2)',
  },
  zoneNormal: {
    flex: 50,
    backgroundColor: 'rgba(50,229,107,0.15)',
  },
  zoneHigh: {
    flex: 30,
    backgroundColor: 'rgba(239,76,76,0.15)',
  },
  loadGaugeFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: '#32E56B',
    borderRadius: 3,
    opacity: 0.7,
  },
  loadGaugeMarker: {
    position: 'absolute',
    top: -2,
    width: 2,
    height: 10,

    borderRadius: 1,
  },
  loadGaugeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 2,
  },
  gaugeScaleText: {

    fontSize: 7,
    fontFamily: 'Outfit',
  },
  loadStatusText: {
    fontSize: 8,
    fontFamily: 'Outfit',
    fontWeight: '600',
    marginTop: 4,
  },

  // Stats row
  statRow: {
    flexDirection: 'row',

    borderRadius: 8,
    padding: 8,
  },
  statItem: { flex: 1 },
  statSep: {
    width: 1,

    marginHorizontal: 8,
  },
  statLabel: {

    fontSize: 8,
    fontFamily: 'Outfit',
    marginBottom: 3,
  },
  statValue: {

    fontSize: 13,
    fontFamily: 'Outfit',
    fontWeight: '700',
  },
  vsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  vsValue: {
    fontSize: 13,
    fontFamily: 'Outfit',
    fontWeight: '700',
  },

  // Forecast card layout updates
  contentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 8,
  },
  leftCol: {
    width: '43%',
    alignItems: 'center', // Center everything in left col like the image
  },
  rightCol: {
    width: '54%',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  confidenceBadge: {
    backgroundColor: 'rgba(136,98,237,0.25)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(136,98,237,0.40)',
  },
  confidenceText: {

    fontSize: 10,
    fontFamily: 'Outfit',
    fontWeight: '700',
  },
  forecastHeroValue: {

    fontSize: 42,
    fontFamily: 'Outfit',
    fontWeight: '700',
    alignSelf: 'flex-start',
  },
  forecastHeroUnit: {

    fontSize: 10,
    fontFamily: 'Outfit',
    marginTop: -2,
    alignSelf: 'flex-start',
  },
  forecastOverUnder: {
    fontSize: 10,
    fontFamily: 'Outfit',
    fontWeight: '600',
    marginTop: 3,
    alignSelf: 'flex-start',
  },
  vsLastMonthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',

    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 10,
    width: '100%',
  },
  vsLastMonthCol: {
    alignItems: 'center',
    flex: 1,
  },
  vsLastMonthLabel: {

    fontSize: 8,
    fontFamily: 'Outfit',
    fontWeight: '600',
  },
  vsLastMonthValue: {

    fontSize: 16,
    fontFamily: 'Outfit',
    fontWeight: '700',
    marginTop: 2,
  },
  vsLastMonthArrow: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  vsLastMonthGap: {
    fontSize: 11,
    fontFamily: 'Outfit',
    fontWeight: '700',
    marginTop: 2,
  },
  vsLastMonthEqual: {

    fontSize: 14,
    fontFamily: 'Outfit',
    fontWeight: '700',
  },
  trendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,

    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  trendText: {
    fontSize: 10,
    fontFamily: 'Outfit',
    fontWeight: '600',
  },

  // Chart section updates
  chartSection: {
    flex: 1,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  colLabel: {

    fontSize: 9,
    fontFamily: 'Outfit',
    fontWeight: '600',
  },
  legendRow: {
    flexDirection: 'row',
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  legendDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  legendDash: {
    width: 8,
    height: 2,
    borderRadius: 1,
  },
  legendText: {

    fontSize: 8,
    fontFamily: 'Outfit',
  },
  chartArea: {
    flexDirection: 'row',
    height: 130, // Updated height
  },
  yAxisCol: {
    justifyContent: 'space-between',
    paddingRight: 6,
  },
  axisText: {

    fontSize: 8,
    fontFamily: 'Outfit',
  },
  chartPlot: {
    flex: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,

  },
  xAxisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: 24, // Shift past y-axis
    marginTop: 6,
  },

  // Big purple budget ring
  budgetHealthChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,

    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    marginTop: 12,
  },
  budgetHealthDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  budgetHealthText: {

    fontSize: 10,
    fontFamily: 'Outfit',
    fontWeight: '600',
  },

  // Meter Details Card
  sectionDivider: {
    height: 1,

    marginVertical: 14,
  },
  meterDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    marginVertical: 4,
  },
  meterDetailsCol: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  meterDetailsDivider: {
    width: 1,

    marginHorizontal: 8,
  },
  meterDetailsMiddle: {
    flex: 1.2,
    alignItems: 'center',
    paddingVertical: 4,
  },
  meterDetailsTitle: {

    fontSize: 12,
    fontFamily: 'Outfit',
    fontWeight: '600',
    marginBottom: 8,
  },
  meterGaugeWrap: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meterGaugeInner: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    top: 30, // Push down slightly into the arc
  },
  meterGaugeValue: {

    fontSize: 24,
    fontFamily: 'Outfit',
    fontWeight: '700',
  },
  meterGaugeUnit: {

    fontSize: 9,
    fontFamily: 'Outfit',
    marginTop: -2,
  },
  middleTitle: {

    fontSize: 9,
    fontFamily: 'Outfit',
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  middleRingWrap: {
    width: 110,
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  middleRingInner: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  middleRingValue: {

    fontSize: 22,
    fontFamily: 'Outfit',
    fontWeight: '700',
  },
  middleRingUnit: {

    fontSize: 8,
    fontFamily: 'Outfit',
  },
  middleRemainingDays: {

    fontSize: 9,
    fontFamily: 'Outfit',
    marginTop: 2,
  },
  meterStatsCol: {
    alignItems: 'center',
    marginTop: 2,
  },
  meterStatTotalLabel: {

    fontSize: 8,
    fontFamily: 'Outfit',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  meterStatTotalValue: {

    fontSize: 15,
    fontFamily: 'Outfit',
    fontWeight: '700',
    marginTop: 2,
  },
  meterStatUnit: {

    fontSize: 8,
    fontFamily: 'Outfit',
    fontWeight: '400',
  },
  meterStatSep: {
    width: 24,
    height: 1,

    marginVertical: 8,
  },
  meterTodayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,

    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  meterTodayLabel: {

    fontSize: 8,
    fontFamily: 'Outfit',
    fontWeight: '600',
  },
  meterTodayValue: {

    fontSize: 9,
    fontFamily: 'Outfit',
    fontWeight: '700',
  },
});
