import { ArrowDown, ArrowUp, Home, Sparkles, SunMedium, TowerControl, Zap } from 'lucide-react-native';
import { memo } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

const { width: screenWidth } = Dimensions.get('window');

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
export const EnergyReceivedCard = memo(function EnergyReceivedCard({ totalEnergy, solarEnergy, gridEnergy, isWapda }: {
  totalEnergy: number; solarEnergy: number; gridEnergy: number; isWapda: boolean;
}) {
  const solarShare = totalEnergy > 0 ? Math.round((solarEnergy / totalEnergy) * 100) : 0;
  const gridShare = totalEnergy > 0 ? 100 - solarShare : 0;
  const dominant = solarShare >= gridShare ? 'solar' : 'grid';

  return (
    <View style={s.card}>
      <View style={s.cardHighlight} />
      <View style={s.cardHeader}>
        <Zap size={11} color="#F5C42E" />
        <Text style={s.cardTitle}>Energy Received</Text>
        <Text style={s.cardTitleRight}>Today</Text>
      </View>

      {/* Hero — total value */}
      <Text style={s.heroValue}>{totalEnergy.toFixed(2)}<Text style={s.heroUnit}> units</Text></Text>

      {/* Source bars — numbers dominate, donut is secondary */}
      <View style={s.sourceBars}>
        <View style={s.sourceBarRow}>
          <View style={s.sourceBarLeft}>
            <SunMedium size={10} color="#F5C42E" />
            <Text style={s.sourceBarLabel}>Solar</Text>
          </View>
          <Text style={s.sourceBarValue}>{solarEnergy.toFixed(2)}</Text>
          <View style={s.sourceBarTrack}>
            <View style={[s.sourceBarFill, { backgroundColor: '#F5C42E', width: `${solarShare}%` }]} />
          </View>
          <Text style={s.sourceBarPct}>{solarShare}%</Text>
        </View>

        <View style={s.sourceBarRow}>
          <View style={s.sourceBarLeft}>
            <TowerControl size={10} color="#548EFF" />
            <Text style={s.sourceBarLabel}>Grid</Text>
          </View>
          <Text style={s.sourceBarValue}>{gridEnergy.toFixed(2)}</Text>
          <View style={s.sourceBarTrack}>
            <View style={[s.sourceBarFill, { backgroundColor: '#548EFF', width: `${gridShare}%` }]} />
          </View>
          <Text style={s.sourceBarPct}>{gridShare}%</Text>
        </View>
      </View>

      {/* Mini donut — small, secondary indicator */}
      <View style={s.donutRow}>
        <MiniDonut solarShare={solarShare} gridShare={gridShare} size={44} />
        <View style={s.sourceChip}>
          <View style={[s.chipDot, { backgroundColor: isWapda ? '#548EFF' : '#F5C42E' }]} />
          <Text style={s.chipText}>
            {isWapda ? 'Grid Active' : 'Solar Active'} · {dominant === 'solar' ? 'Sun-fed' : 'Wapda-fed'}
          </Text>
        </View>
      </View>
    </View>
  );
});

// ── Energy Used Today ───────────────────────────────────────────────────
export const EnergyUsedCard = memo(function EnergyUsedCard({ totalHomeUsage, liveLoadW, peakLoadW, vsYesterdayPercent, voltage, currentA, loadStatus, normalDrawKw }: {
  totalHomeUsage: number; liveLoadW: number; peakLoadW: number; vsYesterdayPercent: number | null;
  voltage: number; currentA: number; loadStatus: 'Low' | 'Normal' | 'High';
  normalDrawKw: number;
}) {
  const hasTrend = vsYesterdayPercent != null;
  const isLower = hasTrend && vsYesterdayPercent <= 0;
  const statusColor = loadStatus === 'High' ? '#EF4C4C' : loadStatus === 'Low' ? '#5C6C7E' : '#32E56B';
  const loadPct = Math.min(100, (liveLoadW / 2500) * 100);

  return (
    <View style={s.card}>
      <View style={s.cardHighlight} />
      <View style={s.cardHeader}>
        <Home size={11} color="#32E56B" />
        <Text style={s.cardTitle}>Energy Used</Text>
        <Text style={s.cardTitleRight}>Today</Text>
      </View>

      {/* Hero — total usage */}
      <Text style={s.heroValue}>{totalHomeUsage.toFixed(2)}<Text style={s.heroUnit}> units</Text></Text>

      {/* Live load — with V·A context and colored zone gauge */}
      <View style={s.liveBlock}>
        <View style={s.liveLeft}>
          <Text style={s.liveLabel}>● Live Load</Text>
          <Text style={s.liveValue}>{Math.round(liveLoadW)}<Text style={s.liveUnit}> W</Text></Text>
        </View>

        {/* Horizontal load indicator with zones */}
        <View style={s.loadGaugeWrap}>
          <View style={s.loadGaugeTrack}>
            <View style={s.zoneIdle} />
            <View style={s.zoneNormal} />
            <View style={s.zoneHigh} />
            <View style={[s.loadGaugeFill, { width: `${loadPct}%` }]} />
            <View style={[s.loadGaugeMarker, { left: `${loadPct}%` }]} />
          </View>
          <View style={s.loadGaugeLabels}>
            <Text style={s.gaugeScaleText}>0</Text>
            <Text style={s.gaugeScaleText}>1kW</Text>
            <Text style={s.gaugeScaleText}>2.5kW</Text>
          </View>
          <Text style={[s.loadStatusText, { color: statusColor }]}>● {loadStatus} Load</Text>
        </View>
      </View>

      {/* Stats — peak + vs yesterday */}
      <View style={s.statRow}>
        <View style={s.statItem}>
          <Text style={s.statLabel}>Peak Today</Text>
          <Text style={s.statValue}>{Math.round(peakLoadW)}W</Text>
        </View>
        <View style={s.statSep} />
        <View style={s.statItem}>
          <Text style={s.statLabel}>vs Yesterday</Text>
          {hasTrend ? (
            <View style={s.vsRow}>
              {isLower ? <ArrowDown size={10} color="#32E56B" /> : <ArrowUp size={10} color="#EF4C4C" />}
              <Text style={[s.vsValue, { color: isLower ? '#32E56B' : '#EF4C4C' }]}>{Math.abs(vsYesterdayPercent as number)}%</Text>
            </View>
          ) : (
            <Text style={[s.vsValue, { color: '#7E91A6' }]}>Building…</Text>
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
}: {
  expectedUnits: number; vsLastMonth: number | null; lastMonthTotal: number; confidence: number;
  dailyUsage: Array<{ timestamp: number; label: string; usage: number }>;
  budgetLeft: number; budgetTarget: number; daysLeft: number;
  combinedDaysLeft: number; averageDaily: number;
  meter1Left: number; meter1Target: number; meter1Used: number; meter1Today: number; meter1DaysLeft: number;
  meter2Left: number; meter2Target: number; meter2Used: number; meter2Today: number; meter2DaysLeft: number;
}) {
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
    <View style={s.wideCard}>
      <View style={s.cardHighlight} />
      {/* Header */}
      <View style={s.cardHeader}>
        <View style={s.headerLeft}>
          <Sparkles size={12} color="#8862ED" />
          <Text style={s.cardTitle}>AI Forecast & Budget</Text>
          <View style={s.confidenceBadge}>
            <Text style={s.confidenceText}>{confidence}% Confidence</Text>
          </View>
        </View>
        <View style={s.headerRight}>
          {vsLastMonth != null && lastMonthTotal > 0 ? (
            <View style={s.trendChip}>
              {vsLastMonth <= 0 ? <ArrowDown size={11} color="#32E56B" /> : <ArrowUp size={11} color="#EF4C4C" />}
              <Text style={[s.trendText, { color: vsLastMonth <= 0 ? '#32E56B' : '#EF4C4C' }]}>
                {Math.abs(vsLastMonth)}%
              </Text>
            </View>
          ) : (
            <View style={s.trendChip}>
              <Text style={[s.trendText, { color: '#5C6C7E' }]}>
                Set last month total in settings
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={s.contentRow}>
        <View style={s.leftCol}>
          <Text style={s.forecastHeroValue}>{Math.round(expectedUnits)}</Text>
          <Text style={s.forecastHeroUnit}>units predicted by {endMonthLabel} {billingDay}</Text>
          <Text style={[s.forecastOverUnder, { color: isOver ? '#EF4C4C' : '#32E56B' }]}>
            {isOver ? `+${overBudget} units saved` : overBudget === 0 ? 'On budget' : `${Math.abs(overBudget)} units saved`}
          </Text>

          {/* This month vs last month comparison — always visible */}
          {(() => {
            const hasLastMonth = lastMonthTotal > 0;
            const unitGap = hasLastMonth ? Math.round(expectedUnits - lastMonthTotal) : 0;
            const gapColor = unitGap > 0 ? '#EF4C4C' : unitGap < 0 ? '#32E56B' : '#F4F8FC';
            return (
              <View style={s.vsLastMonthRow}>
                <View style={s.vsLastMonthCol}>
                  <Text style={s.vsLastMonthLabel}>This month</Text>
                  <Text style={s.vsLastMonthValue}>{Math.round(expectedUnits)}</Text>
                </View>
                <View style={s.vsLastMonthArrow}>
                  {hasLastMonth ? (
                    unitGap > 0 ? <ArrowUp size={14} color={gapColor} /> : unitGap < 0 ? <ArrowDown size={14} color={gapColor} /> : <Text style={s.vsLastMonthEqual}>—</Text>
                  ) : (
                    <Text style={s.vsLastMonthEqual}>—</Text>
                  )}
                  <Text style={[s.vsLastMonthGap, { color: hasLastMonth ? gapColor : '#5C6C7E' }]}>
                    {hasLastMonth ? `${unitGap > 0 ? '+' : ''}${unitGap}` : 'N/A'}
                  </Text>
                </View>
                <View style={s.vsLastMonthCol}>
                  <Text style={s.vsLastMonthLabel}>Last month</Text>
                  <Text style={[s.vsLastMonthValue, !hasLastMonth && { color: '#5C6C7E', fontSize: 10 }]}>
                    {hasLastMonth ? Math.round(lastMonthTotal) : 'Set in settings'}
                  </Text>
                </View>
              </View>
            );
          })()}

          <View style={s.budgetHealthChip}>
            <View style={[s.budgetHealthDot, { backgroundColor: budgetPct > 50 ? '#32E56B' : budgetPct > 25 ? '#F8C653' : '#EF4C4C' }]} />
            <Text style={s.budgetHealthText}>{displayDays}</Text>
          </View>
        </View>

        <View style={s.rightCol}>
          <View style={s.chartHeader}>
            <Text style={s.colLabel}>Cumulative Usage (units)</Text>
            <View style={s.legendRow}>
              <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#32E56B' }]} /><Text style={s.legendText}>Actual</Text></View>
              <View style={s.legendItem}><View style={[s.legendDash, { backgroundColor: '#8862ED' }]} /><Text style={s.legendText}>Forecast</Text></View>
            </View>
          </View>
          
          <View style={s.chartArea}>
            <View style={s.yAxisCol}>
              <Text style={s.axisText}>{yMax}</Text>
              <Text style={s.axisText}>{Math.round(yMax * 0.66)}</Text>
              <Text style={s.axisText}>{Math.round(yMax * 0.33)}</Text>
              <Text style={s.axisText}>0</Text>
            </View>
            <View style={s.chartPlot}>
              <Svg width="100%" height={chH} viewBox={`0 0 ${chW} ${chH}`} preserveAspectRatio="none">
                <Line x1="0" y1={chH * 0.25} x2={chW} y2={chH * 0.25} stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
                <Line x1="0" y1={chH * 0.5} x2={chW} y2={chH * 0.5} stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
                <Line x1="0" y1={chH * 0.75} x2={chW} y2={chH * 0.75} stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
                {forecastPath && <Path d={forecastPath} stroke="#8862ED" strokeWidth="1.5" fill="none" strokeDasharray="3 3" />}
                {actualPath && <Path d={actualPath} stroke="#32E56B" strokeWidth="2" fill="none" />}
                <Circle cx={currentX} cy={currentY} r="3.5" fill="#32E56B" />
                <Circle cx={currentX} cy={currentY} r="6" fill="#32E56B" opacity="0.2" />
              </Svg>
            </View>
          </View>
          <View style={s.xAxisRow}>
            <Text style={s.axisText}>{startMonthLabel} 28</Text>
            <Text style={s.axisText}>{q1Month} 5</Text>
            <Text style={s.axisText}>{midMonth} 12</Text>
            <Text style={s.axisText}>{q3Month} 20</Text>
            <Text style={s.axisText}>{endMonthLabel} 28</Text>
          </View>
        </View>
      </View>

      {/* ── Horizontal divider ── */}
      <View style={s.sectionDivider} />

      {/* ── Meter Gauges Row ── */}
      <View style={s.meterDetailsRow}>

        {/* Meter 1 */}
        <View style={s.meterDetailsCol}>
          <Text style={s.meterDetailsTitle}>Meter 1 (Analog)</Text>
          <View style={s.meterGaugeWrap}>
            <Svg width={100} height={100} viewBox="0 0 100 100">
              <Circle cx="50" cy="50" r="40" stroke="rgba(50,229,107,0.15)" strokeWidth="8" fill="none" strokeDasharray="167.5 251.3" strokeLinecap="round" transform="rotate(150 50 50)" />
              <Circle cx="50" cy="50" r="40" stroke={gaugeColor(meter1Left, '#32E56B')} strokeWidth="8" fill="none" strokeDasharray={`${m1Stroke} 251.3`} strokeLinecap="round" transform="rotate(150 50 50)" />
            </Svg>
            <View style={s.meterGaugeInner}>
              <Text style={s.meterGaugeValue}>{Math.round(meter1Left)}</Text>
              <Text style={s.meterGaugeUnit}>units left</Text>
            </View>
          </View>
          <View style={s.meterStatsCol}>
            <Text style={s.meterStatTotalLabel}>Total Used</Text>
            <Text style={s.meterStatTotalValue}>{meter1Used.toFixed(2)} <Text style={s.meterStatUnit}>units</Text></Text>
            <View style={s.meterStatSep} />
            <View style={s.meterTodayPill}>
              <Text style={s.meterTodayLabel}>Today</Text>
              <Text style={s.meterTodayValue}>{meter1Today.toFixed(2)} units</Text>
            </View>
          </View>
        </View>

        <View style={s.meterDetailsDivider} />

        {/* Middle — Total Remaining ring */}
        <View style={s.meterDetailsMiddle}>
          <Text style={s.middleTitle}>TOTAL REMAINING</Text>
          <View style={s.middleRingWrap}>
            <Svg width={110} height={110} viewBox="0 0 140 140">
              <Circle cx="70" cy="70" r="60" stroke="rgba(136,98,237,0.15)" strokeWidth="12" fill="none" strokeDasharray="282.7 377" strokeLinecap="round" transform="rotate(135 70 70)" />
              <Circle cx="70" cy="70" r="60" stroke={gaugeColor(totalRemaining, '#8862ED')} strokeWidth="12" fill="none" strokeDasharray={`${(budgetPct / 100) * 282.7} 377`} strokeLinecap="round" transform="rotate(135 70 70)" />
            </Svg>
            <View style={s.middleRingInner}>
              <Text style={s.middleRingValue}>{Math.round(totalRemaining)}</Text>
              <Text style={s.middleRingUnit}>units left</Text>
            </View>
          </View>
          <Text style={s.middleRemainingDays}>≈ {estDaysLeft} days remaining</Text>
          <View style={s.meterStatsCol}>
            <Text style={s.meterStatTotalLabel}>Total Used</Text>
            <Text style={s.meterStatTotalValue}>{totalUsed.toFixed(2)} <Text style={s.meterStatUnit}>units</Text></Text>
          </View>
        </View>

        <View style={s.meterDetailsDivider} />

        {/* Meter 2 */}
        <View style={s.meterDetailsCol}>
          <Text style={s.meterDetailsTitle}>Meter 2 (Digital)</Text>
          <View style={s.meterGaugeWrap}>
            <Svg width={100} height={100} viewBox="0 0 100 100">
              <Circle cx="50" cy="50" r="40" stroke="rgba(84,142,255,0.15)" strokeWidth="8" fill="none" strokeDasharray="167.5 251.3" strokeLinecap="round" transform="rotate(150 50 50)" />
              <Circle cx="50" cy="50" r="40" stroke={gaugeColor(meter2Left, '#548EFF')} strokeWidth="8" fill="none" strokeDasharray={`${m2Stroke} 251.3`} strokeLinecap="round" transform="rotate(150 50 50)" />
            </Svg>
            <View style={s.meterGaugeInner}>
              <Text style={s.meterGaugeValue}>{Math.round(meter2Left)}</Text>
              <Text style={s.meterGaugeUnit}>units left</Text>
            </View>
          </View>
          <View style={s.meterStatsCol}>
            <Text style={s.meterStatTotalLabel}>Total Used</Text>
            <Text style={s.meterStatTotalValue}>{meter2Used.toFixed(2)} <Text style={s.meterStatUnit}>units</Text></Text>
            <View style={s.meterStatSep} />
            <View style={s.meterTodayPill}>
              <Text style={s.meterTodayLabel}>Today</Text>
              <Text style={s.meterTodayValue}>{meter2Today.toFixed(2)} units</Text>
            </View>
          </View>
        </View>

      </View>
    </View>
  );
});

// ── Mini Donut helper ───────────────────────────────────────────────────
function MiniDonut({ solarShare, gridShare, size }: { solarShare: number; gridShare: number; size: number }) {
  const r = (size - 8) / 2;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  const solarStroke = (solarShare / 100) * circ;
  const gridStroke = (gridShare / 100) * circ;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={cx} cy={cx} r={r} stroke="rgba(255,255,255,0.06)" strokeWidth="4" fill="none" />
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
    backgroundColor: '#0E1520',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
    overflow: 'hidden',
  },
  wideCard: {
    width: '100%',
    backgroundColor: '#0E1521',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    shadowColor: '#000',
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
    backgroundColor: 'rgba(255,255,255,0.08)',
  },

  // Headers
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardTitle: {
    color: '#94A5B8',
    fontSize: 10,
    fontFamily: 'Outfit',
    fontWeight: '600',
    letterSpacing: 0.3,
    flex: 1,
  },
  cardTitleRight: {
    color: '#5C6C7E',
    fontSize: 9,
    fontFamily: 'Outfit',
  },

  // Hero values — primary focus
  heroValue: {
    color: '#F4F8FC',
    fontSize: 24,
    fontFamily: 'Outfit',
    fontWeight: '700',
    marginBottom: 10,
  },
  heroUnit: {
    color: '#7E91A6',
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
    color: '#AAB7C7',
    fontSize: 9,
    fontFamily: 'Outfit',
  },
  sourceBarValue: {
    color: '#E4ECF4',
    fontSize: 11,
    fontFamily: 'Outfit',
    fontWeight: '700',
    width: 32,
  },
  sourceBarTrack: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 2,
  },
  sourceBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  sourceBarPct: {
    color: '#7E91A6',
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
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
  },
  chipDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  chipText: {
    color: '#AAB7C7',
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
    color: '#7E91A6',
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
    backgroundColor: '#F4F8FC',
    borderRadius: 1,
  },
  loadGaugeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 2,
  },
  gaugeScaleText: {
    color: '#5C6C7E',
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
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    padding: 8,
  },
  statItem: { flex: 1 },
  statSep: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 8,
  },
  statLabel: {
    color: '#7E91A6',
    fontSize: 8,
    fontFamily: 'Outfit',
    marginBottom: 3,
  },
  statValue: {
    color: '#E4ECF4',
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
    color: '#B69AFF',
    fontSize: 9,
    fontFamily: 'Outfit',
    fontWeight: '600',
  },
  forecastHeroValue: {
    color: '#F4F8FC',
    fontSize: 42,
    fontFamily: 'Outfit',
    fontWeight: '700',
    alignSelf: 'flex-start',
  },
  forecastHeroUnit: {
    color: '#7E91A6',
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
    backgroundColor: 'rgba(255,255,255,0.03)',
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
    color: '#5C6C7E',
    fontSize: 8,
    fontFamily: 'Outfit',
    fontWeight: '600',
  },
  vsLastMonthValue: {
    color: '#E4ECF4',
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
    color: '#F4F8FC',
    fontSize: 14,
    fontFamily: 'Outfit',
    fontWeight: '700',
  },
  trendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
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
    color: '#7E91A6',
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
    color: '#7E91A6',
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
    color: '#5C6C7E',
    fontSize: 8,
    fontFamily: 'Outfit',
  },
  chartPlot: {
    flex: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
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
    backgroundColor: 'rgba(255,255,255,0.04)',
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
    color: '#E4ECF4',
    fontSize: 10,
    fontFamily: 'Outfit',
    fontWeight: '600',
  },

  // Meter Details Card
  sectionDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
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
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 8,
  },
  meterDetailsMiddle: {
    flex: 1.2,
    alignItems: 'center',
    paddingVertical: 4,
  },
  meterDetailsTitle: {
    color: '#F4F8FC',
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
    color: '#F4F8FC',
    fontSize: 24,
    fontFamily: 'Outfit',
    fontWeight: '700',
  },
  meterGaugeUnit: {
    color: '#7E91A6',
    fontSize: 9,
    fontFamily: 'Outfit',
    marginTop: -2,
  },
  middleTitle: {
    color: '#7E91A6',
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
    color: '#F4F8FC',
    fontSize: 22,
    fontFamily: 'Outfit',
    fontWeight: '700',
  },
  middleRingUnit: {
    color: '#7E91A6',
    fontSize: 8,
    fontFamily: 'Outfit',
  },
  middleRemainingDays: {
    color: '#AAB7C7',
    fontSize: 9,
    fontFamily: 'Outfit',
    marginTop: 2,
  },
  meterStatsCol: {
    alignItems: 'center',
    marginTop: 2,
  },
  meterStatTotalLabel: {
    color: '#5C6C7E',
    fontSize: 8,
    fontFamily: 'Outfit',
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  meterStatTotalValue: {
    color: '#E4ECF4',
    fontSize: 15,
    fontFamily: 'Outfit',
    fontWeight: '700',
    marginTop: 2,
  },
  meterStatUnit: {
    color: '#7E91A6',
    fontSize: 8,
    fontFamily: 'Outfit',
    fontWeight: '400',
  },
  meterStatSep: {
    width: 24,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 8,
  },
  meterTodayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  meterTodayLabel: {
    color: '#7E91A6',
    fontSize: 8,
    fontFamily: 'Outfit',
    fontWeight: '600',
  },
  meterTodayValue: {
    color: '#AAB7C7',
    fontSize: 9,
    fontFamily: 'Outfit',
    fontWeight: '700',
  },
});
