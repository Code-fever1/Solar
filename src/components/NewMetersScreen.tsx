import { useEnergy } from '@/context/EnergyContext';
import type { MeterId, MeterState } from '@/context/energy-types';
import { useTheme } from "@/hooks/use-theme";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  Clock,
  Gauge,
  LineChart,
  RefreshCw, Repeat,
  Sparkles,
  TrendingUp,
  Trophy,
  Zap
} from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Rect, Text as SvgText } from 'react-native-svg';

const { width: screenWidth } = Dimensions.get('window');
const cardWidth = (screenWidth - 32) / 2;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatReading(reading: number): string {
  return reading.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatTimeAgo(timestamp: number): string {
  if (!timestamp) return 'Never';
  const diff = Date.now() - timestamp;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}

function formatDateTime(timestamp: number): string {
  const d = new Date(timestamp);
  const day = d.getDate();
  const month = MONTHS[d.getMonth()];
  let hour = d.getHours();
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${day} ${month}, ${hour}:${min} ${ampm}`;
}

export function NewMetersScreen() {
  const insets = useSafeAreaInsets();
  const { isLight, ...theme } = useTheme();
  const {
    activeMeter, meters, home, changeover, tomznLive, inverter,
    swapChangeover, refreshTomzn, lastSyncedAt,
  } = useEnergy();

  const [showChangeoverModal, setShowChangeoverModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const meter1 = meters.meter1;
  const meter2 = meters.meter2;
  const targetMeter: MeterId = activeMeter === 'meter1' ? 'meter2' : 'meter1';
  const targetMeterState = targetMeter === 'meter1' ? meter1 : meter2;
  const currentLoadW = tomznLive.powerW || inverter.loadW || 0;

  // Last updated — from tomzn or inverter
  const lastUpdated = Math.max(
    tomznLive.fetchedAt ? new Date(tomznLive.fetchedAt).getTime() : 0,
    inverter.fetchedAt ? new Date(inverter.fetchedAt).getTime() : 0,
    lastSyncedAt || 0,
  );

  // Usage comparison data — from meter cycleUsage and dailyUsage
  const meter1CycleUsage = meter1.cycleUsage || 0;
  const meter2CycleUsage = meter2.cycleUsage || 0;
  const totalCycleUsage = meter1CycleUsage + meter2CycleUsage;

  // Daily usage for comparison chart (last 7 days from home.dailyUsage)
  const dailyData = home.dailyUsage || [];
  const chartMax = Math.max(1, ...dailyData.map(d => d.usage));

  // Efficiency comparison
  const meter1Daily = meter1.averageDaily || 0;
  const meter2Daily = meter2.averageDaily || 0;
  const moreEfficient = meter1Daily < meter2Daily ? 'meter1' : 'meter2';
  const lessEfficient = moreEfficient === 'meter1' ? 'meter2' : 'meter1';
  const efficientMeter = moreEfficient === 'meter1' ? meter1 : meter2;
  const inefficientMeter = lessEfficient === 'meter1' ? meter1 : meter2;
  const savingPercent = inefficientMeter.averageDaily > 0
    ? Math.round((1 - efficientMeter.averageDaily / inefficientMeter.averageDaily) * 100)
    : 0;
  const savedUnits = Math.max(0, (inefficientMeter.averageDaily - efficientMeter.averageDaily) * 30);

  // Smart tips — generated from real data
  const tips = useMemo(() => {
    const result: Array<{ icon: React.ReactNode; color: string; title: string; desc: string }> = [];

    if (savingPercent > 0) {
      result.push({
        icon: <TrendingUp size={16} color="#32E56B" />,
        color: '#32E56B',
        title: `${moreEfficient === 'meter1' ? 'Meter 1 (Analog)' : 'Meter 2 (Digital)'} is more efficient.`,
        desc: `Saving ~${savingPercent}% units (${savedUnits.toFixed(1)} units/month).`,
      });
    }

    // Budget warning
    const activeMeterState = activeMeter === 'meter1' ? meter1 : meter2;
    if (activeMeterState.projectedDaysLeft < 10 && activeMeterState.projectedDaysLeft > 0) {
      result.push({
        icon: <Clock size={16} color="#F8C653" />,
        color: '#F8C653',
        title: `${activeMeter === 'meter1' ? 'Meter 1' : 'Meter 2'} budget running low.`,
        desc: `Estimated ${Math.round(activeMeterState.projectedDaysLeft)} days left. Consider changeover.`,
      });
    }

    // Pace status
    if (home.paceStatus && home.paceStatus !== 'GOOD' && home.paceStatus !== 'EXCELLENT') {
      result.push({
        icon: <Zap size={16} color="#EF4C4C" />,
        color: '#EF4C4C',
        title: `Usage pace is ${home.paceStatus.toLowerCase()}.`,
        desc: `Daily avg ${home.averageDaily.toFixed(1)} units. Target ${meter1.targetDaily.toFixed(1)} units/day.`,
      });
    }

    // Changeover recommendation
    if (moreEfficient !== activeMeter) {
      const expectedSaving = Math.max(0, (inefficientMeter.averageDaily - efficientMeter.averageDaily));
      result.push({
        icon: <Sparkles size={16} color="#B69AFF" />,
        color: '#B69AFF',
        title: `Switch to ${moreEfficient === 'meter1' ? 'Meter 1' : 'Meter 2'}?`,
        desc: `Expected saving ~${expectedSaving.toFixed(1)} units/day.`,
      });
    }

    // Fallback
    if (result.length === 0) {
      result.push({
        icon: <CheckCircle2 size={16} color="#32E56B" />,
        color: '#32E56B',
        title: 'All meters performing well.',
        desc: 'Usage is within budget and pace is on track.',
      });
    }

    return result;
  }, [savingPercent, savedUnits, moreEfficient, activeMeter, meter1, meter2, home]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await refreshTomzn(); } catch {}
    setRefreshing(false);
  };

  const handleChangeover = () => {
    setShowChangeoverModal(false);
    void swapChangeover(targetMeter);
  };

  return (
    <View style={[s.screen, { backgroundColor: theme.screenBg }]}>
      <ScrollView
        contentContainerStyle={[s.content, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 105 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <ArrowLeft size={22} color={theme.text} />
            <View style={[s.headerIconBox, { backgroundColor: theme.overlayBg }]}>
              <Gauge size={20} color={theme.textSecondary} />
            </View>
            <View>
              <Text style={[s.headerTitle, { color: theme.text }]}>Meters</Text>
              <Text style={[s.headerSub, { color: theme.textSecondary }]}>Monitor your Wapda meters</Text>
            </View>
          </View>
          <Pressable style={[s.refreshPill, { backgroundColor: theme.overlayBg, borderColor: theme.cardBorder }]} onPress={handleRefresh}>
            <Text style={[s.refreshText, { color: theme.textSecondary }]}>
              Updated <Text style={{ color: tomznLive.isLive ? '#32E56B' : '#F8C653' }}>●</Text> {formatTimeAgo(lastUpdated)}
            </Text>
            <RefreshCw size={12} color={refreshing ? '#32E56B' : theme.textSecondary} style={{ marginLeft: 6 }} />
          </Pressable>
        </View>

        {/* ── Active Meter Selector ── */}
        <View style={s.dropdownRow}>
          <View style={[s.dropdownBox, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <Text style={[s.dropdownLabel, { color: theme.textSecondary }]}>
              Active Meter <Text style={{ color: '#32E56B' }}>●</Text>{' '}
              <Text style={{ color: '#32E56B', fontWeight: '700' }}>
                {activeMeter === 'meter1' ? 'Meter 1 (Analog)' : 'Meter 2 (Digital)'}
              </Text>
            </Text>
            <ChevronDown size={16} color={theme.textSecondary} />
          </View>
          <Pressable style={[s.changeoverBtn, { backgroundColor: theme.overlayBg }]} onPress={() => setShowChangeoverModal(true)}>
            <Repeat size={14} color="#84A2F0" />
            <Text style={[s.changeoverText, { color: isLight ? '#4A85FF' : '#84A2F0' }]}>Changeover</Text>
          </Pressable>
        </View>

        {/* ── Meter Cards ── */}
        <View style={s.meterCardsRow}>
          <MeterCard
            meter={meter1}
            isActive={activeMeter === 'meter1'}
            isLight={isLight}
            accentColor="#32E56B"
            typeLabel="Analog"
            typePillStyle={s.typePillAnalog}
            typePillTextStyle={s.typePillAnalogText}
            vsYesterday={home.usageChangePercent || 0}
          />
          <MeterCard
            meter={meter2}
            isActive={activeMeter === 'meter2'}
            isLight={isLight}
            accentColor="#548EFF"
            typeLabel="Digital"
            typePillStyle={s.typePillDigital}
            typePillTextStyle={s.typePillDigitalText}
            vsYesterday={home.usageChangePercent || 0}
          />
        </View>

        {/* ── Usage Comparison ── */}
        <View style={[s.wideCard, { backgroundColor: theme.card, borderColor: theme.cardBorder, shadowOpacity: isLight ? 0.12 : 0.35, shadowRadius: isLight ? 6 : 10 }]}>
          <View style={s.wideCardHeader}>
            <View style={s.wideCardTitleRow}>
              <TrendingUp size={16} color="#548EFF" />
              <Text style={[s.wideCardTitle, { color: theme.text }]}>Usage Comparison</Text>
            </View>
            <View style={[s.dropdownSmall, { backgroundColor: theme.overlayBg }]}>
              <Text style={[s.dropdownSmallText, { color: theme.textSecondary }]}>This Cycle</Text>
              <ChevronDown size={12} color={theme.textSecondary} />
            </View>
          </View>

          <View style={s.comparisonBody}>
            {/* Total usage this cycle */}
            <View style={s.comparisonLeft}>
              <Text style={[s.compLabel, { color: theme.textSecondary }]}>Total Usage (This Cycle)</Text>
              <Text style={[s.compValue, { color: theme.text }]}>{totalCycleUsage.toFixed(2)} <Text style={[s.compUnit, { color: theme.textMuted }]}>units</Text></Text>
              <Text style={[s.compTrend, { color: theme.textSecondary }]}>
                {home.usageChangePercent != null && home.usageChangePercent <= 0 ? (
                  <><ArrowDown size={10} color="#32E56B" /> {Math.abs(home.usageChangePercent)}% less than last month</>
                ) : (
                  <><ArrowUp size={10} color="#EF4C4C" /> {Math.abs(home.usageChangePercent || 0)}% more than last month</>
                )}
              </Text>
            </View>

            {/* Daily bar chart — real data */}
            <View style={s.comparisonChart}>
              <View style={s.chartLegend}>
                <Text style={[s.legendText, { color: theme.textSecondary }]}><Text style={{ color: '#32E56B' }}>●</Text> Meter 1</Text>
                <Text style={[s.legendText, { color: theme.textSecondary }]}><Text style={{ color: '#548EFF' }}>●</Text> Meter 2</Text>
              </View>
              <View style={s.chartArea}>
                <View style={s.chartYAxis}>
                  <Text style={[s.axisText, { color: theme.textMuted }]}>{chartMax.toFixed(1)}</Text>
                  <Text style={[s.axisText, { color: theme.textMuted }]}>{(chartMax / 2).toFixed(1)}</Text>
                  <Text style={[s.axisText, { color: theme.textMuted }]}>0</Text>
                </View>
                <View style={s.chartBars}>
                  <Svg width="100%" height="100%" viewBox="0 0 200 60" preserveAspectRatio="none">
                    {dailyData.length > 0 ? dailyData.map((day, i) => {
                      const barWidth = 200 / Math.max(1, dailyData.length);
                      const x = i * barWidth + 2;
                      const barH = (day.usage / chartMax) * 50;
                      // Split usage between meters proportionally
                      const m1Ratio = totalCycleUsage > 0 ? meter1CycleUsage / totalCycleUsage : 0.5;
                      const m1H = barH * m1Ratio;
                      const m2H = barH * (1 - m1Ratio);
                      return (
                        <React.Fragment key={i}>
                          <Rect x={x} y={60 - m1H - m2H} width={barWidth * 0.4} height={m1H + m2H} fill="#32E56B" opacity={0.8} rx={1} />
                          <Rect x={x + barWidth * 0.45} y={60 - m2H - m1H} width={barWidth * 0.4} height={m2H + m1H} fill="#548EFF" opacity={0.8} rx={1} />
                        </React.Fragment>
                      );
                    }) : (
                      <SvgText x="100" y="30" fill={isLight ? "#94A3B8" : "#5C6C7E"} fontSize="8" textAnchor="middle">No data yet</SvgText>
                    )}
                  </Svg>
                </View>
              </View>
              <View style={s.chartXAxis}>
                {dailyData.length > 0 ? dailyData.map((d, i) => (
                  <Text key={i} style={[s.axisText, { color: theme.textMuted }]}>{d.label}</Text>
                )) : (
                  <>
                    <Text style={[s.axisText, { color: theme.textMuted }]}>—</Text>
                    <Text style={[s.axisText, { color: theme.textMuted }]}>—</Text>
                    <Text style={[s.axisText, { color: theme.textMuted }]}>—</Text>
                  </>
                )}
              </View>
            </View>

            {/* Winner card */}
            <View style={s.comparisonRight}>
              <Text style={[s.compLabel, { color: theme.textSecondary }]}>Most Efficient</Text>
              <View style={[s.mostUsedBox, { backgroundColor: theme.overlayBg }]}>
                <View style={[s.mostUsedIcon, { backgroundColor: moreEfficient === 'meter1' ? 'rgba(50,229,107,0.12)' : 'rgba(84,142,255,0.12)' }]}>
                  <Trophy size={16} color={moreEfficient === 'meter1' ? '#32E56B' : '#548EFF'} />
                </View>
                <View style={s.mostUsedTextContainer}>
                  <Text style={[s.mostUsedTitle, { color: theme.text }]} numberOfLines={1} ellipsizeMode="tail">
                    {moreEfficient === 'meter1' ? 'Meter 1 (Analog)' : 'Meter 2 (Digital)'}
                  </Text>
                  <Text style={[s.mostUsedDesc, { color: theme.textSecondary }]}>
                    Saves <Text style={{ color: '#32E56B' }}>{savingPercent}%</Text>{'\n'}
                    ≈ {savedUnits.toFixed(1)} units/month
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* ── Bottom Section: Smart Tips ── */}
        <View style={s.bottomRow}>
          {/* Smart Tips */}
          <View style={[s.tipsCard, { backgroundColor: theme.card, borderColor: theme.cardBorder, shadowOpacity: isLight ? 0.12 : 0.35, shadowRadius: isLight ? 6 : 10 }]}>
            <View style={s.wideCardTitleRow}>
              <LineChart size={16} color="#B69AFF" />
              <Text style={[s.wideCardTitle, { color: '#B69AFF' }]}>Smart Tips</Text>
            </View>

            {tips.map((tip, idx) => (
              <View key={idx} style={[s.tipBox, { backgroundColor: theme.overlayBg }]}>
                <View style={[s.tipIconBox, { backgroundColor: `${tip.color}20` }]}>
                  {tip.icon}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.tipTitle, { color: theme.text }]}>{tip.title}</Text>
                  <Text style={[s.tipDesc, { color: theme.textSecondary }]}>{tip.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* ── Changeover Confirmation Modal ── */}
      <Modal visible={showChangeoverModal} transparent animationType="fade" onRequestClose={() => setShowChangeoverModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <View style={[s.modalHighlight, { backgroundColor: theme.cardHighlight }]} />
            <Text style={[s.modalTitle, { color: theme.text }]}>Switch to {targetMeter === 'meter1' ? 'Meter 1' : 'Meter 2'}?</Text>
            <Text style={[s.modalSub, { color: theme.textSecondary }]}>
              Current Home Load{'\n'}
              <Text style={[s.modalLoad, { color: theme.text }]}>{Math.round(currentLoadW)}W</Text>
            </Text>
            <Text style={[s.modalNote, { color: theme.textMuted }]}>Switching takes 2 seconds.</Text>
            <View style={s.modalBtnRow}>
              <Pressable style={[s.modalCancelBtn, { backgroundColor: theme.overlayBg }]} onPress={() => setShowChangeoverModal(false)}>
                <Text style={[s.modalCancelText, { color: theme.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable style={s.modalSwitchBtn} onPress={handleChangeover}>
                <Text style={[s.modalSwitchText, { color: isLight ? '#4A85FF' : '#84A2F0' }]}>Switch</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Meter Card Component ────────────────────────────────────────────────
function MeterCard({ meter, isActive, accentColor, typeLabel, typePillStyle, typePillTextStyle, vsYesterday, isLight = false }: {
  meter: MeterState;
  isActive: boolean;
  accentColor: string;
  typeLabel: string;
  typePillStyle: any;
  typePillTextStyle: any;
  vsYesterday: number;
  isLight?: boolean;
}) {
  const cardBg = isLight ? '#FFFFFF' : '#0E1521';
  const cardBorder = isLight ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.06)';
  const textPrimary = isLight ? '#0F172A' : '#F4F8FC';
  const textSecondary = isLight ? '#475569' : '#AAB7C7';
  const textMuted = isLight ? '#94A3B8' : '#5C6C7E';
  const overlayBg = isLight ? 'rgba(15,23,42,0.03)' : 'rgba(255,255,255,0.03)';
  const remainingPct = Math.round((meter.remainingUnits / Math.max(1, meter.targetUnits)) * 100);
  const remainingClamped = Math.max(0, Math.min(100, remainingPct));
  const lastReading = meter.lastLoggedReading;
  const isLower = vsYesterday <= 0;
  const todayUsage = meter.todayUsage || 0;

  return (
    <View style={[s.meterCard, { backgroundColor: cardBg, borderColor: isActive ? `${accentColor}40` : cardBorder, shadowOpacity: isLight ? 0.12 : 0.35, shadowRadius: isLight ? 6 : 10 }]}>
      <View style={[s.cardHighlight, { backgroundColor: isLight ? 'rgba(15,23,42,0.03)' : 'rgba(255,255,255,0.08)' }]} />

      {/* Header */}
      <View style={s.meterCardHeader}>
        {isActive ? (
          <View style={[s.activePill, { backgroundColor: `${accentColor}20` }]}>
            <Text style={[s.activePillText, { color: accentColor }]}>Active</Text>
          </View>
        ) : (
          <View style={[s.inactivePill, { backgroundColor: overlayBg }]}>
            <Text style={[s.inactivePillText, { color: textMuted }]}>Inactive</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[s.meterCardTitle, { color: textPrimary }]}>Meter {meter.id === 'meter1' ? '1' : '2'}</Text>
          <View style={typePillStyle}><Text style={typePillTextStyle}>{typeLabel}</Text></View>
        </View>
      </View>

      {/* Today's Usage — compact */}
      <View style={s.todayRow}>
        <View>
          <Text style={[s.todayLabel, { color: textSecondary }]}>Today's Usage</Text>
          <Text style={[s.todayValue, { color: accentColor }]}>{todayUsage.toFixed(2)}<Text style={[s.todayUnit, { color: textMuted }]}> units</Text></Text>
        </View>
        <View style={[s.trendBadge, { backgroundColor: overlayBg }]}>
          {isLower ? <ArrowDown size={10} color="#32E56B" /> : <ArrowUp size={10} color="#EF4C4C" />}
          <Text style={[s.trendBadgeText, { color: isLower ? '#32E56B' : '#EF4C4C' }]}>{Math.abs(vsYesterday)}%</Text>
        </View>
      </View>

      {/* Readings */}
      <View style={[s.readingsBox, { backgroundColor: overlayBg }]}>
        <Text style={[s.readingLabel, { color: textMuted }]}>Current Reading</Text>
        <Text style={[s.readingValue, { color: textPrimary }]}>{formatReading(meter.reading)} <Text style={[s.readingUnit, { color: textMuted }]}>kWh</Text></Text>
        {lastReading !== undefined && (
          <>
            <Text style={[s.lastReadingLabel, { color: textMuted }]}>
              Last: <Text style={{ color: textSecondary }}>{formatReading(lastReading)}</Text>
            </Text>
            <Text style={[s.lastReadingTime, { color: textMuted }]}>{formatTimeAgo(meter.lastLoggedAt || 0)}</Text>
          </>
        )}
      </View>

      {/* Remaining Budget — horizontal bar */}
      <View style={[s.budgetBox, { backgroundColor: overlayBg }]}>
        <View style={s.budgetHeader}>
          <Text style={[s.budgetLabel, { color: textSecondary }]}>Remaining Budget</Text>
          <Text style={[s.budgetPct, { color: textPrimary }]}>{remainingClamped}%</Text>
        </View>
        <View style={[s.limitTrack, { backgroundColor: isLight ? 'rgba(15,23,42,0.06)' : 'rgba(255,255,255,0.05)' }]}>
          <View style={[s.limitFill, { width: `${remainingClamped}%`, backgroundColor: accentColor }]} />
        </View>
        <Text style={[s.budgetLeft, { color: textMuted }]}>
          <Text style={{ color: accentColor, fontWeight: '700' }}>{Math.round(meter.remainingUnits)}</Text> units left · {Math.round(meter.projectedDaysLeft)} days
        </Text>
      </View>

      {/* Forecast mini-row */}
      <View style={s.forecastMiniRow}>
        <View style={s.forecastMiniItem}>
          <Text style={[s.forecastMiniLabel, { color: textMuted }]}>Projected</Text>
          <Text style={[s.forecastMiniValue, { color: textPrimary }]}>{Math.round(meter.projectedMonthly)} units</Text>
        </View>
        <View style={[s.forecastMiniSep, { backgroundColor: isLight ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.06)' }]} />
        <View style={s.forecastMiniItem}>
          <Text style={[s.forecastMiniLabel, { color: textMuted }]}>Health</Text>
          <Text style={[s.forecastMiniValue, { color: meter.healthColor }]}>
            {meter.healthScore}/100
          </Text>
        </View>
      </View>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 13, gap: 10 },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  headerIconBox: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'transparent',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: undefined, fontFamily: 'Outfit', fontSize: 20, fontWeight: '700' },
  headerSub: { color: undefined, fontFamily: 'Outfit', fontSize: 11, marginTop: 1 },
  refreshPill: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5,
    borderWidth: 1, borderColor: 'transparent',
  },
  refreshText: { color: undefined, fontFamily: 'Outfit', fontSize: 9 },

  // Active meter selector
  dropdownRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dropdownBox: {
    flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'transparent', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: 'transparent',
  },
  dropdownLabel: { color: undefined, fontFamily: 'Outfit', fontSize: 11 },
  changeoverBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(84,142,255,0.12)',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(84,142,255,0.2)',
  },
  changeoverText: { color: '#84A2F0', fontFamily: 'Outfit', fontSize: 11, fontWeight: '600' },

  // Meter cards
  meterCardsRow: { flexDirection: 'row', gap: 8 },
  meterCard: {
    width: cardWidth,
    backgroundColor: 'transparent',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  cardHighlight: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 1,
    backgroundColor: 'transparent',
  },
  meterCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 10,
  },
  activePill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  activePillText: { fontFamily: 'Outfit', fontSize: 8, fontWeight: '700' },
  inactivePill: {
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  inactivePillText: { color: undefined, fontFamily: 'Outfit', fontSize: 8, fontWeight: '700' },
  meterCardTitle: { color: undefined, fontFamily: 'Outfit', fontSize: 13, fontWeight: '700' },
  typePillAnalog: {
    backgroundColor: 'rgba(50,229,107,0.12)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4,
  },
  typePillAnalogText: { color: '#32E56B', fontFamily: 'Outfit', fontSize: 8, fontWeight: '600' },
  typePillDigital: {
    backgroundColor: 'rgba(84,142,255,0.12)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4,
  },
  typePillDigitalText: { color: '#548EFF', fontFamily: 'Outfit', fontSize: 8, fontWeight: '600' },

  // Today's usage
  todayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  todayLabel: { color: undefined, fontFamily: 'Outfit', fontSize: 8, marginBottom: 2 },
  todayValue: { fontFamily: 'Outfit', fontSize: 18, fontWeight: '700' },
  todayUnit: { fontSize: 10, color: undefined },
  trendBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'transparent', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  trendBadgeText: { fontFamily: 'Outfit', fontSize: 9, fontWeight: '700' },

  // Readings
  readingsBox: { marginBottom: 10 },
  readingLabel: { color: undefined, fontFamily: 'Outfit', fontSize: 8, marginBottom: 2 },
  readingValue: { color: undefined, fontFamily: 'Outfit', fontSize: 16, fontWeight: '700' },
  readingUnit: { color: undefined, fontSize: 9 },
  lastReadingLabel: { color: undefined, fontFamily: 'Outfit', fontSize: 9, marginTop: 4 },
  lastReadingTime: { color: undefined, fontFamily: 'Outfit', fontSize: 8, marginTop: 1 },

  // Budget
  budgetBox: { marginBottom: 10 },
  budgetHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  budgetLabel: { color: undefined, fontFamily: 'Outfit', fontSize: 8 },
  budgetPct: { color: undefined, fontFamily: 'Outfit', fontSize: 10, fontWeight: '700' },
  limitTrack: { height: 4, backgroundColor: 'transparent', borderRadius: 2, marginBottom: 4 },
  limitFill: { height: '100%', borderRadius: 2 },
  budgetLeft: { color: undefined, fontFamily: 'Outfit', fontSize: 9 },

  // Forecast mini row
  forecastMiniRow: {
    flexDirection: 'row', backgroundColor: 'transparent',
    borderRadius: 8, padding: 8,
  },
  forecastMiniItem: { flex: 1 },
  forecastMiniSep: { width: 1, backgroundColor: 'transparent', marginHorizontal: 8 },
  forecastMiniLabel: { color: undefined, fontFamily: 'Outfit', fontSize: 8, marginBottom: 2 },
  forecastMiniValue: { color: undefined, fontFamily: 'Outfit', fontSize: 11, fontWeight: '700' },

  // Wide card
  wideCard: {
    width: '100%', backgroundColor: 'transparent', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'transparent', overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 4,
  },
  wideCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  wideCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  wideCardTitle: { color: undefined, fontFamily: 'Outfit', fontSize: 12, fontWeight: '600' },
  dropdownSmall: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'transparent', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
  },
  dropdownSmallText: { color: undefined, fontFamily: 'Outfit', fontSize: 9 },

  // Comparison
  comparisonBody: { flexDirection: 'row', gap: 10 },
  comparisonLeft: { flex: 1 },
  compLabel: { color: undefined, fontFamily: 'Outfit', fontSize: 8, marginBottom: 4 },
  compValue: { color: undefined, fontFamily: 'Outfit', fontSize: 18, fontWeight: '700' },
  compUnit: { color: undefined, fontSize: 10 },
  compTrend: { color: undefined, fontFamily: 'Outfit', fontSize: 9, marginTop: 4 },

  comparisonChart: { flex: 1.3 },
  chartLegend: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  legendText: { color: undefined, fontFamily: 'Outfit', fontSize: 8 },
  chartArea: { flexDirection: 'row', height: 60 },
  chartYAxis: { justifyContent: 'space-between', paddingRight: 4 },
  axisText: { color: undefined, fontFamily: 'Outfit', fontSize: 7 },
  chartBars: { flex: 1, borderBottomWidth: 1, borderLeftWidth: 1, borderColor: 'transparent' },
  chartXAxis: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 16, marginTop: 3 },

  comparisonRight: { flex: 1 },
  mostUsedBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'transparent', borderRadius: 8, padding: 8, marginTop: 4,
  },
  mostUsedIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  mostUsedTextContainer: { flex: 1 },
  mostUsedTitle: { color: undefined, fontFamily: 'Outfit', fontSize: 10, fontWeight: '700' },
  mostUsedDesc: { color: undefined, fontFamily: 'Outfit', fontSize: 8, marginTop: 2, lineHeight: 12 },

  // Bottom row
  bottomRow: { gap: 10 },

  // Tips
  tipsCard: {
    backgroundColor: 'transparent', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: 'transparent', overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 4,
  },
  tipBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  tipIconBox: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tipTitle: { color: undefined, fontFamily: 'Outfit', fontSize: 10, fontWeight: '600' },
  tipDesc: { color: undefined, fontFamily: 'Outfit', fontSize: 9, marginTop: 2 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: {
    width: '100%', backgroundColor: 'transparent', borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 8,
  },
  modalHighlight: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  modalTitle: { color: undefined, fontFamily: 'Outfit', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  modalSub: { color: undefined, fontFamily: 'Outfit', fontSize: 11, marginBottom: 6 },
  modalLoad: { color: undefined, fontFamily: 'Outfit', fontSize: 20, fontWeight: '700' },
  modalNote: { color: undefined, fontFamily: 'Outfit', fontSize: 9, marginBottom: 16 },
  modalBtnRow: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, paddingVertical: 10, alignItems: 'center',
  },
  modalCancelText: { color: undefined, fontFamily: 'Outfit', fontSize: 12, fontWeight: '600' },
  modalSwitchBtn: {
    flex: 1, backgroundColor: 'rgba(84,142,255,0.2)', borderRadius: 10, paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(84,142,255,0.3)',
  },
  modalSwitchText: { color: '#84A2F0', fontFamily: 'Outfit', fontSize: 12, fontWeight: '700' },
  // Note: modalSwitchText color overridden inline for light mode contrast
});
