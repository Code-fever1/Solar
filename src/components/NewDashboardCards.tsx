import { ArrowDown, ArrowUp, Home, Sparkles, SunMedium, TowerControl, Zap } from 'lucide-react-native';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

const { width: screenWidth } = Dimensions.get('window');
const cardWidth = (screenWidth - 32) / 2;

// ═══════════════════════════════════════════════════════════════════════
//  ENERGY PULSE — Live Energy Control Center
//  Typography: 24 / 16 / 11 / 8  ·  8pt grid  ·  Layered depth
// ═══════════════════════════════════════════════════════════════════════

// ── Energy Received Today ───────────────────────────────────────────────
export function EnergyReceivedCard({ totalEnergy, solarEnergy, gridEnergy, isWapda }: {
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
      <Text style={s.heroValue}>{totalEnergy.toFixed(1)}<Text style={s.heroUnit}> units</Text></Text>

      {/* Source bars — numbers dominate, donut is secondary */}
      <View style={s.sourceBars}>
        <View style={s.sourceBarRow}>
          <View style={s.sourceBarLeft}>
            <SunMedium size={10} color="#F5C42E" />
            <Text style={s.sourceBarLabel}>Solar</Text>
          </View>
          <Text style={s.sourceBarValue}>{solarEnergy.toFixed(1)}</Text>
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
          <Text style={s.sourceBarValue}>{gridEnergy.toFixed(1)}</Text>
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
}

// ── Energy Used Today ───────────────────────────────────────────────────
export function EnergyUsedCard({ totalHomeUsage, liveLoadW, peakLoadW, vsYesterdayPercent, voltage, currentA, loadStatus, normalDrawKw }: {
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
      <Text style={s.heroValue}>{totalHomeUsage.toFixed(1)}<Text style={s.heroUnit}> units</Text></Text>

      {/* Live load — with V·A context and colored zone gauge */}
      <View style={s.liveBlock}>
        <View style={s.liveLeft}>
          <Text style={s.liveLabel}>● Live Load</Text>
          <Text style={s.liveValue}>{Math.round(liveLoadW)}<Text style={s.liveUnit}> W</Text></Text>
          <Text style={s.liveContext}>{currentA.toFixed(1)}A · {voltage.toFixed(0)}V</Text>
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
}

// ── AI Forecast & Budget — Hero centerpiece ─────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function ForecastBudgetCard({
  expectedUnits, vsLastMonth, confidence, dailyUsage, budgetLeft, budgetTarget,
  daysLeft, meter1Left, meter1Target, meter2Left, meter2Target,
}: {
  expectedUnits: number; vsLastMonth: number | null; confidence: number;
  dailyUsage: Array<{ timestamp: number; label: string; usage: number }>;
  budgetLeft: number; budgetTarget: number; daysLeft: number;
  meter1Left: number; meter1Target: number; meter2Left: number; meter2Target: number;
}) {
  const budgetPct = Math.max(0, Math.min(100, (budgetLeft / budgetTarget) * 100));
  const m1Pct = Math.round((meter1Left / meter1Target) * 100);
  const m2Pct = Math.round((meter2Left / meter2Target) * 100);
  const m1Remaining = Math.max(0, meter1Target - meter1Left);
  const m2Remaining = Math.max(0, meter2Target - meter2Left);
  const budgetHealth = budgetPct > 50 ? 'Healthy' : budgetPct > 25 ? 'Moderate' : 'Low';

  // Chart dimensions
  const chH = 70;
  const chW = screenWidth * 0.38;

  // ── Build cumulative actual + forecast across the billing cycle (29th → 28th) ──
  // Billing cycle: 28th of prev month → 28th of current month (30-31 days)
  const now = new Date();
  const billingDay = 28;
  // Cycle start: 28th of current month, or 28th of prev month if before 28th
  const cycleStartMonth = now.getDate() >= billingDay ? now.getMonth() : now.getMonth() - 1;
  const cycleStartYear = cycleStartMonth < 0 ? now.getFullYear() - 1 : now.getFullYear();
  const cycleStartIdx = ((cycleStartMonth % 12) + 12) % 12;
  const cycleStartDate = new Date(cycleStartYear, cycleStartIdx, billingDay);
  const cycleEndDate = new Date(cycleStartYear, cycleStartIdx + 1, billingDay);
  const totalCycleDays = Math.max(1, Math.round((cycleEndDate.getTime() - cycleStartDate.getTime()) / 86_400_000));
  const elapsedDays = Math.max(0, Math.min(totalCycleDays, Math.floor((now.getTime() - cycleStartDate.getTime()) / 86_400_000)));

  // Map dailyUsage (7-day window) into cumulative actual values
  // dailyUsage has { timestamp, label, usage } for last 7 days
  // Build cumulative sum from the earliest available day
  const sortedDaily = [...dailyUsage].sort((a, b) => a.timestamp - b.timestamp);
  let cumulative = 0;
  const actualCumulative: number[] = [];
  for (const day of sortedDaily) {
    cumulative += day.usage;
    actualCumulative.push(cumulative);
  }

  // If we have actual data, the actual line covers those days
  // The forecast continues from the last actual cumulative value to expectedUnits at month end
  const actualDays = actualCumulative.length;
  const lastActualCumulative = actualCumulative.length > 0 ? actualCumulative[actualCumulative.length - 1] : 0;

  // Y-axis: dynamic — round up to next 100 above prediction, min 100
  const yMax = Math.max(100, Math.ceil(Math.max(expectedUnits, lastActualCumulative) / 100) * 100);

  // Forecast points: from last actual point to expectedUnits at end of cycle
  // Use a smooth curve — not straight — that accounts for daily variation
  const remainingDays = Math.max(1, totalCycleDays - elapsedDays);

  // Generate forecast points with slight variation so it's not a dead-straight line
  const forecastPoints: Array<{ x: number; y: number }> = [];
  const actualPoints: Array<{ x: number; y: number }> = [];

  // Total chart points = totalCycleDays (one per day)
  const totalPoints = totalCycleDays;

  // Actual line: cumulative usage for each elapsed day
  for (let i = 0; i <= elapsedDays && i <= actualDays; i++) {
    const x = (i / totalPoints) * chW;
    const val = actualCumulative[i] || (i === 0 ? 0 : lastActualCumulative);
    const y = chH - Math.min(1, val / yMax) * chH;
    actualPoints.push({ x, y });
  }

  // Forecast line: from last actual point to expectedUnits, with daily variation
  const forecastStartX = actualPoints.length > 0 ? actualPoints[actualPoints.length - 1].x : 0;
  const forecastStartY = actualPoints.length > 0 ? actualPoints[actualPoints.length - 1].y : chH;
  for (let i = elapsedDays; i <= totalCycleDays; i++) {
    const x = (i / totalPoints) * chW;
    // Smooth curve with slight wave — simulates daily variation in forecast
    const progress = (i - elapsedDays) / Math.max(1, totalCycleDays - elapsedDays);
    const baseVal = lastActualCumulative + (expectedUnits - lastActualCumulative) * progress;
    // Add subtle wave so it's not a straight line (±3% variation)
    const wave = Math.sin(progress * Math.PI * 3) * (expectedUnits * 0.015);
    const val = Math.max(0, baseVal + wave);
    const y = chH - Math.min(1, val / yMax) * chH;
    forecastPoints.push({ x, y });
  }

  // Build SVG paths
  const actualPath = actualPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const forecastPath = forecastPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  // Current point — where actual meets forecast
  const currentX = actualPoints.length > 0 ? actualPoints[actualPoints.length - 1].x : 0;
  const currentY = actualPoints.length > 0 ? actualPoints[actualPoints.length - 1].y : chH;

  // Dynamic x-axis labels — billing cycle months (29th → 28th)
  // Show: cycle start month, 1/4, mid, 3/4, cycle end month
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
        </View>
        <View style={s.confidenceBadge}>
          <Text style={s.confidenceText}>{confidence}% Confidence</Text>
        </View>
      </View>

      {/* Hero metric — prediction dominates */}
      <View style={s.heroRow}>
        <View>
          <Text style={s.forecastHeroValue}>{Math.round(expectedUnits)}</Text>
          <Text style={s.forecastHeroUnit}>units predicted by {endMonthLabel} {billingDay}</Text>
        </View>
        <View style={s.trendChip}>
          {vsLastMonth == null ? (
            <Text style={[s.trendText, { color: '#7E91A6' }]}>Building baseline…</Text>
          ) : (
            <>
              {vsLastMonth <= 0 ? <ArrowDown size={11} color="#32E56B" /> : <ArrowUp size={11} color="#EF4C4C" />}
              <Text style={[s.trendText, { color: vsLastMonth <= 0 ? '#32E56B' : '#EF4C4C' }]}>
                {Math.abs(vsLastMonth)}% vs daily avg
              </Text>
            </>
          )}
        </View>
      </View>

      {/* Forecast chart — cumulative actual + projected forecast */}
      <View style={s.chartSection}>
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
              {/* Grid lines — 4 sections */}
              <Line x1="0" y1={chH * 0.25} x2={chW} y2={chH * 0.25} stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
              <Line x1="0" y1={chH * 0.5} x2={chW} y2={chH * 0.5} stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
              <Line x1="0" y1={chH * 0.75} x2={chW} y2={chH * 0.75} stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
              {/* Forecast line — dashed, from current point to month end */}
              {forecastPath && <Path d={forecastPath} stroke="#8862ED" strokeWidth="1.5" fill="none" strokeDasharray="3 3" />}
              {/* Actual line — solid, from cycle start to now */}
              {actualPath && <Path d={actualPath} stroke="#32E56B" strokeWidth="2" fill="none" />}
              {/* Current point — where actual meets forecast */}
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

      {/* Budget — connected component: ring + days + status */}
      <View style={s.budgetSection}>
        <View style={s.budgetRingWrap}>
          <Svg width={72} height={72} viewBox="0 0 80 80">
            <Path d="M 12 68 A 32 32 0 1 1 68 68" stroke="rgba(255,255,255,0.06)" strokeWidth="7" fill="none" strokeLinecap="round" />
            <Path d="M 12 68 A 32 32 0 1 1 68 68" stroke="#32E56B" strokeWidth="7"
              strokeDasharray={`${(budgetPct / 100) * 150} 250`} fill="none" strokeLinecap="round" />
          </Svg>
          <View style={s.budgetRingInner}>
            <Text style={s.budgetRingValue}>{Math.round(budgetLeft)}</Text>
            <Text style={s.budgetRingUnit}>left</Text>
          </View>
        </View>
        <View style={s.budgetInfo}>
          <Text style={s.budgetTitle}>{budgetLeft.toFixed(0)} / {budgetTarget} units</Text>
          <Text style={s.budgetDays}>≈ {daysLeft} days remaining</Text>
          <View style={s.budgetHealthChip}>
            <View style={[s.budgetHealthDot, { backgroundColor: budgetPct > 50 ? '#32E56B' : budgetPct > 25 ? '#F8C653' : '#EF4C4C' }]} />
            <Text style={s.budgetHealthText}>{budgetHealth} Budget</Text>
          </View>
        </View>
      </View>

      {/* Meter bars — smarter with %, units left */}
      <View style={s.meterRow}>
        <View style={s.meterCol}>
          <View style={s.meterHeader}>
            <Text style={s.meterName}>Meter 1</Text>
            <Text style={s.meterPct}>{m1Pct}%</Text>
          </View>
          <View style={s.meterTrack}>
            <View style={[s.meterFill, { backgroundColor: '#32E56B', width: `${m1Pct}%` }]} />
          </View>
          <Text style={s.meterRemaining}>{m1Remaining.toFixed(0)} units left</Text>
        </View>
        <View style={s.meterCol}>
          <View style={s.meterHeader}>
            <Text style={s.meterName}>Meter 2</Text>
            <Text style={s.meterPct}>{m2Pct}%</Text>
          </View>
          <View style={s.meterTrack}>
            <View style={[s.meterFill, { backgroundColor: '#548EFF', width: `${m2Pct}%` }]} />
          </View>
          <Text style={s.meterRemaining}>{m2Remaining.toFixed(0)} units left</Text>
        </View>
      </View>
    </View>
  );
}

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

  // Forecast card
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

  // Hero row — prediction dominates
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  forecastHeroValue: {
    color: '#F4F8FC',
    fontSize: 32,
    fontFamily: 'Outfit',
    fontWeight: '700',
  },
  forecastHeroUnit: {
    color: '#7E91A6',
    fontSize: 10,
    fontFamily: 'Outfit',
    marginTop: 2,
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

  // Chart section
  chartSection: {
    marginBottom: 12,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  colLabel: {
    color: '#7E91A6',
    fontSize: 8,
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
    height: 70,
  },
  yAxisCol: {
    justifyContent: 'space-between',
    paddingRight: 4,
  },
  axisText: {
    color: '#5C6C7E',
    fontSize: 7,
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
    paddingLeft: 20,
    marginTop: 3,
  },

  // Budget — connected component
  budgetSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  budgetRingWrap: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  budgetRingInner: {
    position: 'absolute',
    alignItems: 'center',
    top: 20,
  },
  budgetRingValue: {
    color: '#F4F8FC',
    fontSize: 16,
    fontFamily: 'Outfit',
    fontWeight: '700',
  },
  budgetRingUnit: {
    color: '#7E91A6',
    fontSize: 8,
    fontFamily: 'Outfit',
  },
  budgetInfo: {
    flex: 1,
  },
  budgetTitle: {
    color: '#E4ECF4',
    fontSize: 13,
    fontFamily: 'Outfit',
    fontWeight: '700',
    marginBottom: 2,
  },
  budgetDays: {
    color: '#7E91A6',
    fontSize: 10,
    fontFamily: 'Outfit',
    marginBottom: 6,
  },
  budgetHealthChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  budgetHealthDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  budgetHealthText: {
    color: '#AAB7C7',
    fontSize: 9,
    fontFamily: 'Outfit',
    fontWeight: '600',
  },

  // Meter bars — smarter
  meterRow: {
    flexDirection: 'row',
    gap: 14,
  },
  meterCol: { flex: 1 },
  meterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  meterName: {
    color: '#AAB7C7',
    fontSize: 9,
    fontFamily: 'Outfit',
  },
  meterPct: {
    color: '#E4ECF4',
    fontSize: 10,
    fontFamily: 'Outfit',
    fontWeight: '700',
  },
  meterTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
    marginBottom: 4,
  },
  meterFill: {
    height: '100%',
    borderRadius: 2,
  },
  meterRemaining: {
    color: '#7E91A6',
    fontSize: 8,
    fontFamily: 'Outfit',
  },
});
