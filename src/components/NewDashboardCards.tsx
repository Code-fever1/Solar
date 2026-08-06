import { ArrowDown, ArrowUp, Home, Sparkles, SunMedium, TowerControl, Zap } from 'lucide-react-native';
import { memo } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

const { width: screenWidth } = Dimensions.get('window');

// Theme-aware color tokens — derived from isLight flag
type CardTheme = {
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
  textMuted: '#5C6C7E',
  trackBg: 'rgba(255,255,255,0.05)',
  overlayBg: 'rgba(255,255,255,0.03)',
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
export const EnergyReceivedCard = memo(function EnergyReceivedCard({ totalEnergy, solarEnergy, gridEnergy, isWapda, isLight = false }: {
  totalEnergy: number; solarEnergy: number; gridEnergy: number; isWapda: boolean; isLight?: boolean;
}) {
  const t = useCardTheme(isLight);
  const solarShare = totalEnergy > 0 ? Math.round((solarEnergy / totalEnergy) * 100) : 0;
  const gridShare = totalEnergy > 0 ? 100 - solarShare : 0;
  const dominant = solarShare >= gridShare ? 'solar' : 'grid';

  return (
    <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder, shadowColor: t.cardShadow }]}>
      <View style={[s.cardHighlight, { backgroundColor: t.cardHighlight }]} />
      <View style={s.cardHeader}>
        <Zap size={11} color="#F5C42E" />
        <Text style={[s.cardTitle, { color: t.textSecondary }]}>Energy Received</Text>
        <Text style={[s.cardTitleRight, { color: t.textMuted }]}>Today</Text>
      </View>

      {/* Hero — total value */}
      <Text style={[s.heroValue, { color: t.textPrimary }]}>{totalEnergy.toFixed(2)}<Text style={[s.heroUnit, { color: t.textMuted }]}> units</Text></Text>

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
          <Text style={[s.sourceBarPct, { color: t.textMuted }]}>{solarShare}%</Text>
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
          <Text style={[s.sourceBarPct, { color: t.textMuted }]}>{gridShare}%</Text>
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
    </View>
  );
});

// ── Energy Used Today ───────────────────────────────────────────────────
export const EnergyUsedCard = memo(function EnergyUsedCard({ totalHomeUsage, liveLoadW, peakLoadW, vsYesterdayPercent, voltage, currentA, loadStatus, normalDrawKw, isLight = false }: {
  totalHomeUsage: number; liveLoadW: number; peakLoadW: number; vsYesterdayPercent: number | null;
  voltage: number; currentA: number; loadStatus: 'Low' | 'Normal' | 'High';
  normalDrawKw: number; isLight?: boolean;
}) {
  const t = useCardTheme(isLight);
  const hasTrend = vsYesterdayPercent != null;
  const isLower = hasTrend && vsYesterdayPercent <= 0;
  const statusColor = loadStatus === 'High' ? '#EF4C4C' : loadStatus === 'Low' ? '#5C6C7E' : '#32E56B';
  const loadPct = Math.min(100, (liveLoadW / 2500) * 100);

  return (
    <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder, shadowColor: t.cardShadow }]}>
      <View style={[s.cardHighlight, { backgroundColor: t.cardHighlight }]} />
      <View style={s.cardHeader}>
        <Home size={11} color="#32E56B" />
        <Text style={[s.cardTitle, { color: t.textSecondary }]}>Energy Used</Text>
        <Text style={[s.cardTitleRight, { color: t.textMuted }]}>Today</Text>
      </View>

      {/* Hero — total usage */}
      <Text style={[s.heroValue, { color: t.textPrimary }]}>{totalHomeUsage.toFixed(2)}<Text style={[s.heroUnit, { color: t.textMuted }]}> units</Text></Text>

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
            <Text style={[s.gaugeScaleText, { color: t.textMuted }]}>0</Text>
            <Text style={[s.gaugeScaleText, { color: t.textMuted }]}>1kW</Text>
            <Text style={[s.gaugeScaleText, { color: t.textMuted }]}>2.5kW</Text>
          </View>
          <Text style={[s.loadStatusText, { color: statusColor }]}>● {loadStatus} Load</Text>
        </View>
      </View>

      {/* Stats — peak + vs yesterday */}
      <View style={[s.statRow, { backgroundColor: t.overlayBg }]}>
        <View style={s.statItem}>
          <Text style={[s.statLabel, { color: t.textMuted }]}>Peak Today</Text>
          <Text style={[s.statValue, { color: t.textPrimary }]}>{Math.round(peakLoadW)}W</Text>
        </View>
        <View style={[s.statSep, { backgroundColor: t.overlayBorder }]} />
        <View style={s.statItem}>
          <Text style={[s.statLabel, { color: t.textMuted }]}>vs Yesterday</Text>
          {hasTrend ? (
            <View style={s.vsRow}>
              {isLower ? <ArrowDown size={10} color="#32E56B" /> : <ArrowUp size={10} color="#EF4C4C" />}
              <Text style={[s.vsValue, { color: isLower ? '#32E56B' : '#EF4C4C' }]}>{Math.abs(vsYesterdayPercent as number)}%</Text>
            </View>
          ) : (
            <Text style={[s.vsValue, { color: t.textMuted }]}>Building…</Text>
          )}
        </View>
      </View>
    </View>
  );
});

// ── AI Forecast & Budget — Hero centerpiece (merged with Meter Details) ─
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const ForecastBudgetCard = memo(function ForecastBudgetCard({
  expectedUnits, vsLastMonth, lastMonthTotal, confidence, dailyUsage, budgetLeft, budgetTarget,
  daysLeft, combinedDaysLeft, averageDaily,
  meter1Left, meter1Target, meter1Used, meter1Today, meter1DaysLeft,
  meter2Left, meter2Target, meter2Used, meter2Today, meter2DaysLeft,
  isLight = false,
}: {
  expectedUnits: number; vsLastMonth: number | null; lastMonthTotal: number; confidence: number;
  dailyUsage: Array<{ timestamp: number; label: string; usage: number }>;
  budgetLeft: number; budgetTarget: number; daysLeft: number;
  combinedDaysLeft: number; averageDaily: number;
  meter1Left: number; meter1Target: number; meter1Used: number; meter1Today: number; meter1DaysLeft: number;
  meter2Left: number; meter2Target: number; meter2Used: number; meter2Today: number; meter2DaysLeft: number;
  isLight?: boolean;
}) {
  const t = useCardTheme(isLight);
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

  // ── Build cumulative actual + forecast across the billing cycle (29th → 28th) ──
  const now = new Date();
  const billingDay = 28;
  const cycleStartMonth = now.getDate() >= billingDay ? now.getMonth() : now.getMonth() - 1;
  const cycleStartYear = cycleStartMonth < 0 ? now.getFullYear() - 1 : now.getFullYear();
  const cycleStartIdx = ((cycleStartMonth % 12) + 12) % 12;
  const cycleStartDate = new Date(cycleStartYear, cycleStartIdx, billingDay);
  const cycleEndDate = new Date(cycleStartYear, cycleStartIdx + 1, billingDay);
  const totalCycleDays = Math.max(1, Math.round((cycleEndDate.getTime() - cycleStartDate.getTime()) / 86_400_000));
  const elapsedDays = Math.max(0, Math.min(totalCycleDays, Math.floor((now.getTime() - cycleStartDate.getTime()) / 86_400_000)));
  const remainingDays = Math.max(1, totalCycleDays - elapsedDays);

  const sortedDaily = [...dailyUsage].sort((a, b) => a.timestamp - b.timestamp);
  let cumulative = 0;
  const actualCumulative: number[] = [];
  for (const day of sortedDaily) {
    cumulative += day.usage;
    actualCumulative.push(cumulative);
  }

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

  const actualDays = actualCumulative.length;
  const lastActualCumulative = actualCumulative.length > 0 ? actualCumulative[actualCumulative.length - 1] : 0;
  const yMax = Math.max(100, Math.ceil(Math.max(expectedUnits, lastActualCumulative) / 100) * 100);

  const forecastPoints: Array<{ x: number; y: number }> = [];
  const actualPoints: Array<{ x: number; y: number }> = [];
  const totalPoints = totalCycleDays;

  for (let i = 0; i <= elapsedDays && i <= actualDays; i++) {
    const x = (i / totalPoints) * chW;
    const val = actualCumulative[i] || (i === 0 ? 0 : lastActualCumulative);
    const y = chH - Math.min(1, val / yMax) * chH;
    actualPoints.push({ x, y });
  }

  for (let i = elapsedDays; i <= totalCycleDays; i++) {
    const x = (i / totalPoints) * chW;
    const progress = (i - elapsedDays) / Math.max(1, totalCycleDays - elapsedDays);
    const baseVal = lastActualCumulative + (expectedUnits - lastActualCumulative) * progress;
    const wave = Math.sin(progress * Math.PI * 3) * (expectedUnits * 0.015);
    const val = Math.max(0, baseVal + wave);
    const y = chH - Math.min(1, val / yMax) * chH;
    forecastPoints.push({ x, y });
  }

  const actualPath = actualPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const forecastPath = forecastPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  const currentX = actualPoints.length > 0 ? actualPoints[actualPoints.length - 1].x : 0;
  const currentY = actualPoints.length > 0 ? actualPoints[actualPoints.length - 1].y : chH;

  const startMonthLabel = MONTHS[cycleStartIdx];
  const endMonthIdx = (cycleStartIdx + 1) % 12;
  const endMonthLabel = MONTHS[endMonthIdx];
  const q1Month = MONTHS[(cycleStartIdx + 0.25 * 1) % 12 | 0];
  const midMonth = MONTHS[(cycleStartIdx + Math.floor(totalCycleDays / 2 / 30)) % 12];
  const q3Month = MONTHS[(endMonthIdx + 11) % 12];

  return (
    <View style={[s.wideCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder, shadowColor: t.cardShadow }]}>
      <View style={[s.cardHighlight, { backgroundColor: t.cardHighlight }]} />
      {/* Header */}
      <View style={s.cardHeader}>
        <View style={s.headerLeft}>
          <Sparkles size={12} color="#8862ED" />
          <Text style={[s.cardTitle, { color: t.textSecondary }]}>AI Forecast & Budget</Text>
          <View style={s.confidenceBadge}>
            <Text style={[s.confidenceText, { color: '#8862ED' }]}>{confidence}% Confidence</Text>
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
              <Text style={[s.trendText, { color: t.textMuted }]}>
                Set last month total in settings
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={s.contentRow}>
        <View style={s.leftCol}>
          <Text style={[s.forecastHeroValue, { color: t.textPrimary }]}>{Math.round(expectedUnits)}</Text>
          <Text style={[s.forecastHeroUnit, { color: t.textMuted }]}>units predicted by {endMonthLabel} {billingDay}</Text>
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
                  <Text style={[s.vsLastMonthLabel, { color: t.textMuted }]}>This month</Text>
                  <Text style={[s.vsLastMonthValue, { color: t.textPrimary }]}>{Math.round(expectedUnits)}</Text>
                </View>
                <View style={s.vsLastMonthArrow}>
                  {hasLastMonth ? (
                    unitGap > 0 ? <ArrowUp size={14} color={gapColor} /> : unitGap < 0 ? <ArrowDown size={14} color={gapColor} /> : <Text style={[s.vsLastMonthEqual, { color: t.textPrimary }]}>—</Text>
                  ) : (
                    <Text style={[s.vsLastMonthEqual, { color: t.textPrimary }]}>—</Text>
                  )}
                  <Text style={[s.vsLastMonthGap, { color: hasLastMonth ? gapColor : t.textMuted }]}>
                    {hasLastMonth ? `${unitGap > 0 ? '+' : ''}${unitGap}` : 'N/A'}
                  </Text>
                </View>
                <View style={s.vsLastMonthCol}>
                  <Text style={[s.vsLastMonthLabel, { color: t.textMuted }]}>Last month</Text>
                  <Text style={[s.vsLastMonthValue, { color: t.textPrimary }, !hasLastMonth && { color: t.textMuted, fontSize: 10 }]}>
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
            <Text style={[s.colLabel, { color: t.textMuted }]}>Cumulative Usage (units)</Text>
            <View style={s.legendRow}>
              <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#32E56B' }]} /><Text style={[s.legendText, { color: t.textMuted }]}>Actual</Text></View>
              <View style={s.legendItem}><View style={[s.legendDash, { backgroundColor: '#8862ED' }]} /><Text style={[s.legendText, { color: t.textMuted }]}>Forecast</Text></View>
            </View>
          </View>
          
          <View style={s.chartArea}>
            <View style={s.yAxisCol}>
              <Text style={[s.axisText, { color: t.textMuted }]}>{yMax}</Text>
              <Text style={[s.axisText, { color: t.textMuted }]}>{Math.round(yMax * 0.66)}</Text>
              <Text style={[s.axisText, { color: t.textMuted }]}>{Math.round(yMax * 0.33)}</Text>
              <Text style={[s.axisText, { color: t.textMuted }]}>0</Text>
            </View>
            <View style={[s.chartPlot, { borderColor: t.svgGridLine }]}>
              <Svg width="100%" height={chH} viewBox={`0 0 ${chW} ${chH}`} preserveAspectRatio="none">
                <Line x1="0" y1={chH * 0.25} x2={chW} y2={chH * 0.25} stroke={t.svgGridLine} strokeWidth="0.5" />
                <Line x1="0" y1={chH * 0.5} x2={chW} y2={chH * 0.5} stroke={t.svgGridLine} strokeWidth="0.5" />
                <Line x1="0" y1={chH * 0.75} x2={chW} y2={chH * 0.75} stroke={t.svgGridLine} strokeWidth="0.5" />
                {forecastPath && <Path d={forecastPath} stroke="#8862ED" strokeWidth="1.5" fill="none" strokeDasharray="3 3" />}
                {actualPath && <Path d={actualPath} stroke="#32E56B" strokeWidth="2" fill="none" />}
                <Circle cx={currentX} cy={currentY} r="3.5" fill="#32E56B" />
                <Circle cx={currentX} cy={currentY} r="6" fill="#32E56B" opacity="0.2" />
              </Svg>
            </View>
          </View>
          <View style={s.xAxisRow}>
            <Text style={[s.axisText, { color: t.textMuted }]}>{startMonthLabel} 28</Text>
            <Text style={[s.axisText, { color: t.textMuted }]}>{q1Month} 5</Text>
            <Text style={[s.axisText, { color: t.textMuted }]}>{midMonth} 12</Text>
            <Text style={[s.axisText, { color: t.textMuted }]}>{q3Month} 20</Text>
            <Text style={[s.axisText, { color: t.textMuted }]}>{endMonthLabel} 28</Text>
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
              <Text style={[s.meterGaugeUnit, { color: t.textMuted }]}>units left</Text>
            </View>
          </View>
          <View style={s.meterStatsCol}>
            <Text style={[s.meterStatTotalLabel, { color: t.textMuted }]}>Total Used</Text>
            <Text style={[s.meterStatTotalValue, { color: t.textPrimary }]}>{meter1Used.toFixed(2)} <Text style={[s.meterStatUnit, { color: t.textMuted }]}>units</Text></Text>
            <View style={[s.meterStatSep, { backgroundColor: t.overlayBorder }]} />
            <View style={[s.meterTodayPill, { backgroundColor: t.overlayBg }]}>
              <Text style={[s.meterTodayLabel, { color: t.textMuted }]}>Today</Text>
              <Text style={[s.meterTodayValue, { color: t.textPrimary }]}>{meter1Today.toFixed(2)} units</Text>
            </View>
          </View>
        </View>

        <View style={[s.meterDetailsDivider, { backgroundColor: t.overlayBorder }]} />

        {/* Middle — Total Remaining ring */}
        <View style={s.meterDetailsMiddle}>
          <Text style={[s.middleTitle, { color: t.textMuted }]}>TOTAL REMAINING</Text>
          <View style={s.middleRingWrap}>
            <Svg width={110} height={110} viewBox="0 0 140 140">
              <Circle cx="70" cy="70" r="60" stroke={isLight ? "rgba(136,98,237,0.12)" : "rgba(136,98,237,0.15)"} strokeWidth="12" fill="none" strokeDasharray="282.7 377" strokeLinecap="round" transform="rotate(135 70 70)" />
              <Circle cx="70" cy="70" r="60" stroke={gaugeColor(totalRemaining, '#8862ED')} strokeWidth="12" fill="none" strokeDasharray={`${(budgetPct / 100) * 282.7} 377`} strokeLinecap="round" transform="rotate(135 70 70)" />
            </Svg>
            <View style={s.middleRingInner}>
              <Text style={[s.middleRingValue, { color: t.textPrimary }]}>{Math.round(totalRemaining)}</Text>
              <Text style={[s.middleRingUnit, { color: t.textMuted }]}>units left</Text>
            </View>
          </View>
          <Text style={[s.middleRemainingDays, { color: t.textMuted }]}>≈ {estDaysLeft} days remaining</Text>
          <View style={s.meterStatsCol}>
            <Text style={[s.meterStatTotalLabel, { color: t.textMuted }]}>Total Used</Text>
            <Text style={[s.meterStatTotalValue, { color: t.textPrimary }]}>{totalUsed.toFixed(2)} <Text style={[s.meterStatUnit, { color: t.textMuted }]}>units</Text></Text>
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
              <Text style={[s.meterGaugeUnit, { color: t.textMuted }]}>units left</Text>
            </View>
          </View>
          <View style={s.meterStatsCol}>
            <Text style={[s.meterStatTotalLabel, { color: t.textMuted }]}>Total Used</Text>
            <Text style={[s.meterStatTotalValue, { color: t.textPrimary }]}>{meter2Used.toFixed(2)} <Text style={[s.meterStatUnit, { color: t.textMuted }]}>units</Text></Text>
            <View style={[s.meterStatSep, { backgroundColor: t.overlayBorder }]} />
            <View style={[s.meterTodayPill, { backgroundColor: t.overlayBg }]}>
              <Text style={[s.meterTodayLabel, { color: t.textMuted }]}>Today</Text>
              <Text style={[s.meterTodayValue, { color: t.textPrimary }]}>{meter2Today.toFixed(2)} units</Text>
            </View>
          </View>
        </View>

      </View>
    </View>
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
    borderWidth: 1,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
    overflow: 'hidden',
  },
  wideCard: {
    width: '100%',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
    overflow: 'hidden',
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
    backgroundColor: 'rgba(136,98,237,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(136,98,237,0.2)',
  },
  confidenceText: {

    fontSize: 9,
    fontFamily: 'Outfit',
    fontWeight: '600',
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
