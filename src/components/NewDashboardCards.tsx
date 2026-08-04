import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, Circle, Polyline, Rect } from 'react-native-svg';
import { Zap, Home, Sparkles, ChevronRight, TowerControl, SunMedium, Plug, ArrowDown, ArrowUp } from 'lucide-react-native';

const { width: screenWidth } = Dimensions.get('window');
const cardWidth = (screenWidth - 34) / 2;

// --- Energy Received Today Card ---
export function EnergyReceivedCard({ totalEnergy, solarEnergy, gridEnergy, isWapda }: { totalEnergy: number, solarEnergy: number, gridEnergy: number, isWapda: boolean }) {
  const solarShare = totalEnergy > 0 ? Math.round((solarEnergy / totalEnergy) * 100) : 0;
  const gridShare = totalEnergy > 0 ? Math.round((gridEnergy / totalEnergy) * 100) : 0;

  // Donut chart math
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const solarStroke = (solarShare / 100) * circumference;
  const gridStroke = (gridShare / 100) * circumference;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.headerTitleRow}>
          <Zap size={14} color="#F5C42E" />
          <Text style={styles.headerTitle}>ENERGY RECEIVED TODAY</Text>
        </View>
        <View style={styles.iconButton}>
          <ChevronRight size={14} color="#5C6C7E" />
        </View>
      </View>

      <View style={styles.totalSection}>
        <Text style={styles.mainNumber}>{totalEnergy.toFixed(2)}<Text style={styles.mainUnit}> kWh</Text></Text>
        <Text style={styles.subtext}>Total Energy Received</Text>
      </View>

      <View style={styles.donutSection}>
        <View style={styles.donutSide}>
          <View style={[styles.iconBox, { backgroundColor: '#2D281D' }]}>
            <SunMedium size={18} color="#F5C42E" />
          </View>
          <Text style={[styles.sideNumber, { color: '#F5C42E' }]}>{solarEnergy.toFixed(2)}<Text style={styles.sideUnit}> kWh</Text></Text>
          <Text style={styles.sideLabel}>Solar</Text>
          <View style={styles.barTrack}><View style={[styles.barFill, { backgroundColor: '#F5C42E', width: `${solarShare}%` }]} /></View>
          <Text style={styles.shareText}>{solarShare}%</Text>
          <Text style={styles.shareLabel}>Share</Text>
        </View>

        <View style={styles.donutCenter}>
          <Svg width={90} height={90} viewBox="0 0 90 90">
            <Circle cx="45" cy="45" r={radius} stroke="#1A2534" strokeWidth="10" fill="none" />
            {solarShare > 0 && <Circle cx="45" cy="45" r={radius} stroke="#F5C42E" strokeWidth="10" strokeDasharray={`${solarStroke} ${circumference}`} fill="none" strokeLinecap="round" transform="rotate(-90 45 45)" />}
            {gridShare > 0 && <Circle cx="45" cy="45" r={radius} stroke="#548EFF" strokeWidth="10" strokeDasharray={`${gridStroke} ${circumference}`} strokeDashoffset={-solarStroke} fill="none" strokeLinecap="round" transform="rotate(-90 45 45)" />}
          </Svg>
          <View style={styles.donutInnerIcon}>
            <Zap size={22} color="#5C6C7E" />
          </View>
        </View>

        <View style={[styles.donutSide, { alignItems: 'flex-end' }]}>
          <View style={[styles.iconBox, { backgroundColor: '#1C2538' }]}>
            <TowerControl size={18} color="#548EFF" />
          </View>
          <Text style={[styles.sideNumber, { color: '#548EFF' }]}>{gridEnergy.toFixed(2)}<Text style={styles.sideUnit}> units</Text></Text>
          <Text style={styles.sideLabel}>Grid Import</Text>
          <View style={[styles.barTrack, { alignItems: 'flex-end' }]}><View style={[styles.barFill, { backgroundColor: '#548EFF', width: `${gridShare}%` }]} /></View>
          <Text style={styles.shareText}>{gridShare}%</Text>
          <Text style={styles.shareLabel}>Share</Text>
        </View>
      </View>

      <View style={styles.pillBox}>
        <View style={[styles.iconCircle, { backgroundColor: '#1C2538' }]}>
          <Plug size={16} color="#548EFF" />
        </View>
        <View style={styles.pillTextCol}>
          <Text style={[styles.pillTitle, { color: '#548EFF' }]}>Live Source: {isWapda ? 'Grid' : 'Solar/Battery'}</Text>
          <Text style={styles.pillSubtext}>Currently using {isWapda ? 'Wapda' : 'Inverter'} power</Text>
        </View>
        <ChevronRight size={14} color="#3E4C5E" />
      </View>
    </View>
  );
}

// --- Energy Used Today Card ---
export function EnergyUsedCard({ totalHomeUsage, liveLoadW, peakLoadW, vsYesterdayPercent }: { totalHomeUsage: number, liveLoadW: number, peakLoadW: number, vsYesterdayPercent: number }) {
  const dialProgress = Math.min(100, (liveLoadW / 5000) * 100);
  const isIdle = liveLoadW < 200;
  
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.headerTitleRow}>
          <Home size={14} color="#32E56B" />
          <Text style={styles.headerTitle}>ENERGY USED TODAY</Text>
        </View>
        <View style={styles.iconButton}>
          <ChevronRight size={14} color="#5C6C7E" />
        </View>
      </View>

      <View style={styles.highlightBox}>
        <View style={[styles.iconBox, { backgroundColor: '#132F20', width: 42, height: 42, borderRadius: 12 }]}>
          <Home size={22} color="#32E56B" />
        </View>
        <View style={styles.highlightTextCol}>
          <Text style={styles.mainNumber}>{totalHomeUsage.toFixed(2)}<Text style={styles.mainUnit}> kWh</Text></Text>
          <Text style={styles.subtext}>Total Home Usage</Text>
        </View>
      </View>

      <View style={styles.liveLoadRow}>
        <View>
          <Text style={styles.greenLabel}>● LIVE LOAD</Text>
          <Text style={styles.liveLoadNumber}>{Math.round(liveLoadW)}<Text style={styles.liveLoadUnit}> W</Text></Text>
        </View>
        <View style={styles.dialContainer}>
           <Svg width={70} height={40} viewBox="0 0 100 60">
             <Path d="M 10 50 A 40 40 0 0 1 90 50" stroke="#1F2A38" strokeWidth="8" fill="none" strokeLinecap="round" />
             <Path d="M 10 50 A 40 40 0 0 1 90 50" stroke="#32E56B" strokeWidth="8" strokeDasharray={`${(dialProgress / 100) * 125} 200`} fill="none" strokeLinecap="round" />
           </Svg>
           <Text style={styles.dialLabel}>{isIdle ? '● Idle' : '● Active'}</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statHeader}>PEAK TODAY</Text>
          <Text style={styles.statValue}>{Math.round(peakLoadW)}<Text style={styles.statUnit}> W</Text></Text>
          <Text style={styles.statSub}>12:14 PM</Text>
          <View style={styles.miniChart}>
            <View style={[styles.bar, { height: '30%' }]} />
            <View style={[styles.bar, { height: '50%' }]} />
            <View style={[styles.bar, { height: '80%' }]} />
            <View style={[styles.bar, { height: '100%' }]} />
          </View>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={styles.statHeader}>VS YESTERDAY</Text>
          <View style={styles.vsRow}>
            {vsYesterdayPercent <= 0 ? <ArrowDown size={18} color="#32E56B" /> : <ArrowUp size={18} color="#EF4C4C" />}
            <Text style={[styles.vsNumber, { color: vsYesterdayPercent <= 0 ? '#32E56B' : '#EF4C4C' }]}>{Math.abs(vsYesterdayPercent)}%</Text>
            <Text style={styles.vsText}>{vsYesterdayPercent <= 0 ? 'Lower' : 'Higher'}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// --- AI Forecast & Budget Card ---
export function ForecastBudgetCard({ 
  expectedUnits, vsLastMonth, confidence, points, budgetLeft, budgetTarget, daysLeft, meter1Left, meter1Target, meter2Left, meter2Target 
}: { 
  expectedUnits: number, vsLastMonth: number, confidence: number, points: number[], budgetLeft: number, budgetTarget: number, daysLeft: number, meter1Left: number, meter1Target: number, meter2Left: number, meter2Target: number 
}) {
  const budgetProgress = Math.max(0, Math.min(100, (budgetLeft / budgetTarget) * 100));
  const m1Pct = Math.round((meter1Left / meter1Target) * 100);
  const m2Pct = Math.round((meter2Left / meter2Target) * 100);

  // Simple line chart math
  const chHeight = 90;
  const chWidth = 200;
  const maxVal = 450;
  
  const pathD = points.map((p, i) => {
    const x = (i / (points.length - 1)) * chWidth;
    const y = chHeight - (p / maxVal) * chHeight;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  const actualPoints = points.slice(0, Math.floor(points.length / 2)); // simulate today
  const actualPath = actualPoints.map((p, i) => {
    const x = (i / (points.length - 1)) * chWidth;
    const y = chHeight - (p / maxVal) * chHeight;
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  return (
    <View style={styles.wideCard}>
      <View style={styles.cardHeader}>
        <View style={styles.headerTitleRow}>
          <Sparkles size={16} color="#6584FF" />
          <Text style={[styles.headerTitle, { fontSize: 13, color: '#FFF' }]}>AI FORECAST & BUDGET</Text>
        </View>
        <View style={styles.confidenceBadge}>
          <Text style={styles.confidenceText}>{confidence}% Confidence</Text>
          <View style={styles.badgeIcon}><ChevronRight size={10} color="#B69AFF" /></View>
        </View>
      </View>

      <View style={styles.forecastContent}>
        <View style={styles.expectedCol}>
          <Text style={styles.statHeader}>EXPECTED THIS MONTH</Text>
          <Text style={[styles.mainNumber, { fontSize: 32 }]}>{Math.round(expectedUnits)}<Text style={styles.mainUnit}> units</Text></Text>
          <Text style={[styles.subtext, { marginBottom: 10 }]}>Prediction for 24 Aug</Text>
          <Text style={{ color: '#32E56B', fontSize: 10, fontFamily: 'Outfit', fontWeight: '600' }}>
            ✓ {Math.abs(vsLastMonth)}% vs last month
          </Text>
        </View>

        <View style={styles.chartCol}>
          <View style={styles.chartHeader}>
            <Text style={styles.statHeader}>USAGE FORECAST (UNITS)</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Text style={styles.legendText}><Text style={{ color: '#32E56B' }}>—</Text> Actual</Text>
              <Text style={styles.legendText}><Text style={{ color: '#8862ED' }}>—</Text> Forecast</Text>
            </View>
          </View>
          
          <View style={{ height: chHeight, width: chWidth, marginTop: 15, flexDirection: 'row' }}>
            <View style={styles.yAxis}>
              <Text style={styles.axisText}>450</Text>
              <Text style={styles.axisText}>300</Text>
              <Text style={styles.axisText}>150</Text>
              <Text style={styles.axisText}>0</Text>
            </View>
            <View style={{ flex: 1, borderBottomWidth: 1, borderLeftWidth: 1, borderColor: '#1F2A38' }}>
              <Svg width="100%" height="100%" viewBox={`0 0 ${chWidth} ${chHeight}`} preserveAspectRatio="none">
                <Path d={pathD} stroke="#8862ED" strokeWidth="2" fill="none" strokeDasharray="4 4" />
                <Path d={actualPath} stroke="#32E56B" strokeWidth="2" fill="none" />
                <Circle cx={(actualPoints.length - 1) / (points.length - 1) * chWidth} cy={chHeight - (actualPoints[actualPoints.length-1] / maxVal) * chHeight} r={4} fill="#32E56B" />
              </Svg>
            </View>
          </View>
          <View style={styles.xAxis}>
            <Text style={styles.axisText}>1 Aug</Text>
            <Text style={styles.axisText}>8 Aug</Text>
            <Text style={styles.axisText}>16 Aug</Text>
            <Text style={styles.axisText}>24 Aug</Text>
            <Text style={styles.axisText}>31 Aug</Text>
          </View>
        </View>

        <View style={styles.budgetCol}>
          <Text style={styles.statHeader}>BUDGET LEFT</Text>
          <View style={styles.budgetGauge}>
            <Svg width={110} height={110} viewBox="0 0 120 120">
              <Path d="M 20 100 A 50 50 0 1 1 100 100" stroke="#1F2A38" strokeWidth="12" fill="none" strokeLinecap="round" />
              <Path d="M 20 100 A 50 50 0 1 1 100 100" stroke="#32E56B" strokeWidth="12" strokeDasharray={`${(budgetProgress / 100) * 235} 300`} fill="none" strokeLinecap="round" />
            </Svg>
            <View style={styles.gaugeInner}>
               <Text style={[styles.mainNumber, { fontSize: 24 }]}>{Math.round(budgetLeft)}</Text>
               <Text style={styles.subtext}>units left</Text>
            </View>
            <View style={styles.gaugeFooter}>
              <Text style={styles.gaugeStart}>0</Text>
              <Text style={styles.gaugeEnd}>200</Text>
            </View>
          </View>
          <Text style={{ color: '#E4ECF4', fontSize: 10, fontFamily: 'Outfit', textAlign: 'center', marginTop: -15, fontWeight: '600' }}>≈ {daysLeft} days left</Text>
          <Text style={[styles.subtext, { textAlign: 'center', marginTop: 2 }]}>Expected to reset on 24 Aug</Text>
        </View>
      </View>

      <View style={styles.meterBarsRow}>
         <View style={styles.meterBarCol}>
            <View style={styles.meterHeader}>
              <Text style={styles.subtext}>Meter 1 <Text style={{ fontSize: 9 }}>(Analog)</Text></Text>
              <Text style={styles.meterVal}>{Math.round(meter1Left)} / {meter1Target} <Text style={{ color: '#7E91A6', fontSize: 9 }}>units</Text></Text>
            </View>
            <View style={styles.linearTrack}>
               <View style={[styles.linearFill, { backgroundColor: '#32E56B', width: `${m1Pct}%` }]} />
            </View>
            <Text style={styles.pctLeft}>{m1Pct}% left</Text>
         </View>
         <View style={styles.meterDivider} />
         <View style={styles.meterBarCol}>
            <View style={styles.meterHeader}>
              <Text style={styles.subtext}>Meter 2 <Text style={{ fontSize: 9 }}>(Digital)</Text></Text>
              <Text style={styles.meterVal}>{Math.round(meter2Left)} / {meter2Target} <Text style={{ color: '#7E91A6', fontSize: 9 }}>units</Text></Text>
            </View>
            <View style={styles.linearTrack}>
               <View style={[styles.linearFill, { backgroundColor: '#548EFF', width: `${m2Pct}%` }]} />
            </View>
            <Text style={styles.pctLeft}>{m2Pct}% left</Text>
         </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: cardWidth,
    backgroundColor: '#0F1621',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1D283A',
  },
  wideCard: {
    width: '100%',
    backgroundColor: '#0F1621',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1D283A',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerTitle: {
    color: '#8497AB',
    fontSize: 10,
    fontFamily: 'Outfit',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  iconButton: {
    width: 20, height: 20,
    borderRadius: 10,
    backgroundColor: '#192434',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainNumber: {
    color: '#F4F8FC',
    fontSize: 26,
    fontFamily: 'Outfit',
    fontWeight: '700',
  },
  mainUnit: {
    color: '#D7E1EB',
    fontSize: 11,
    fontWeight: '500',
  },
  subtext: {
    color: '#7E91A6',
    fontSize: 9,
    fontFamily: 'Outfit',
  },
  totalSection: {
    alignItems: 'center',
    marginBottom: 15,
  },
  donutSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  donutCenter: {
    width: 90, height: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutInnerIcon: {
    position: 'absolute',
  },
  donutSide: {
    flex: 1,
  },
  iconBox: {
    width: 28, height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  sideNumber: {
    fontFamily: 'Outfit',
    fontSize: 12,
    fontWeight: '700',
  },
  sideUnit: {
    fontSize: 8,
    fontWeight: '500',
  },
  sideLabel: {
    color: '#AAB7C7',
    fontSize: 9,
    fontFamily: 'Outfit',
    marginBottom: 6,
  },
  barTrack: {
    width: '100%',
    height: 4,
    backgroundColor: '#1C2538',
    borderRadius: 2,
    marginBottom: 4,
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
  shareText: {
    color: '#F3F7FC',
    fontSize: 10,
    fontFamily: 'Outfit',
    fontWeight: '700',
  },
  shareLabel: {
    color: '#7E91A6',
    fontSize: 8,
    fontFamily: 'Outfit',
  },
  pillBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#131D2D',
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: '#1C283B',
  },
  iconCircle: {
    width: 32, height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillTextCol: {
    flex: 1,
    marginLeft: 10,
  },
  pillTitle: {
    fontFamily: 'Outfit',
    fontSize: 10,
    fontWeight: '600',
  },
  pillSubtext: {
    color: '#7E91A6',
    fontSize: 9,
    fontFamily: 'Outfit',
  },
  highlightBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F261C',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#193928',
    marginBottom: 16,
  },
  highlightTextCol: {
    marginLeft: 12,
  },
  liveLoadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 5,
  },
  greenLabel: {
    color: '#32E56B',
    fontFamily: 'Outfit',
    fontSize: 9,
    fontWeight: '700',
    marginBottom: 4,
  },
  liveLoadNumber: {
    color: '#32E56B',
    fontSize: 24,
    fontFamily: 'Outfit',
    fontWeight: '700',
  },
  liveLoadUnit: {
    fontSize: 14,
  },
  dialContainer: {
    alignItems: 'center',
  },
  dialLabel: {
    color: '#32E56B',
    fontSize: 9,
    fontFamily: 'Outfit',
    marginTop: -8,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#131D2D',
    borderRadius: 12,
    padding: 12,
  },
  statBox: {
    flex: 1,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#1F2A38',
    marginHorizontal: 12,
  },
  statHeader: {
    color: '#8497AB',
    fontSize: 9,
    fontFamily: 'Outfit',
    fontWeight: '600',
    marginBottom: 4,
  },
  statValue: {
    color: '#F4F8FC',
    fontSize: 16,
    fontFamily: 'Outfit',
    fontWeight: '700',
  },
  statUnit: {
    color: '#AAB7C7',
    fontSize: 10,
  },
  statSub: {
    color: '#7E91A6',
    fontSize: 9,
    fontFamily: 'Outfit',
    marginTop: 2,
  },
  miniChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 18,
    gap: 3,
    marginTop: 8,
  },
  bar: {
    width: 4,
    backgroundColor: '#32E56B',
    borderRadius: 2,
  },
  vsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  vsNumber: {
    fontSize: 16,
    fontFamily: 'Outfit',
    fontWeight: '700',
    marginHorizontal: 4,
  },
  vsText: {
    color: '#AAB7C7',
    fontSize: 10,
    fontFamily: 'Outfit',
  },
  confidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F1935',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  confidenceText: {
    color: '#B69AFF',
    fontSize: 9,
    fontFamily: 'Outfit',
    fontWeight: '600',
  },
  badgeIcon: {
    marginLeft: 4,
    backgroundColor: '#312754',
    borderRadius: 6,
    width: 12, height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forecastContent: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#1D283A',
    paddingBottom: 20,
    marginBottom: 15,
  },
  expectedCol: {
    flex: 1,
    justifyContent: 'center',
  },
  chartCol: {
    flex: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#1D283A',
    paddingHorizontal: 15,
    marginHorizontal: 15,
  },
  budgetCol: {
    flex: 1,
    alignItems: 'center',
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  legendText: {
    color: '#7E91A6',
    fontSize: 9,
    fontFamily: 'Outfit',
  },
  yAxis: {
    justifyContent: 'space-between',
    paddingRight: 6,
  },
  xAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: 20,
    marginTop: 6,
  },
  axisText: {
    color: '#7E91A6',
    fontSize: 8,
    fontFamily: 'Outfit',
  },
  budgetGauge: {
    width: 120, height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -5,
  },
  gaugeInner: {
    position: 'absolute',
    alignItems: 'center',
    top: 35,
  },
  gaugeFooter: {
    position: 'absolute',
    bottom: 25,
    width: 100,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  gaugeStart: { color: '#7E91A6', fontSize: 8, fontFamily: 'Outfit' },
  gaugeEnd: { color: '#7E91A6', fontSize: 8, fontFamily: 'Outfit' },
  meterBarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  meterBarCol: {
    flex: 1,
  },
  meterDivider: {
    width: 1, height: 30,
    backgroundColor: '#1D283A',
    marginHorizontal: 15,
  },
  meterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  meterVal: {
    color: '#E4ECF4',
    fontFamily: 'Outfit',
    fontSize: 12,
    fontWeight: '700',
  },
  linearTrack: {
    height: 4,
    backgroundColor: '#1C2538',
    borderRadius: 2,
    marginBottom: 6,
  },
  linearFill: {
    height: '100%',
    borderRadius: 2,
  },
  pctLeft: {
    color: '#7E91A6',
    fontSize: 9,
    fontFamily: 'Outfit',
    textAlign: 'right',
  },
});
