import { GlassCard } from "@/components/GlassCard";
import { ForecastBudgetCard } from "@/components/NewDashboardCards";
import { SceneBackground } from "@/components/SceneBackground";
import type { MeterId, MeterState } from '@/context/energy-types';
import { useEnergy } from '@/context/EnergyContext';
import { useSceneTheme } from "@/context/SceneThemeContext";
import { Repeat } from 'lucide-react-native';
import { memo, useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const { isLight, ...theme } = useSceneTheme();
  const {
    activeMeter, meters, home, changeover, tomznLive, inverter, meta,
    swapChangeover,
  } = useEnergy();

  const [showChangeoverModal, setShowChangeoverModal] = useState(false);

  const meter1 = meters.meter1;
  const meter2 = meters.meter2;
  const targetMeter: MeterId = activeMeter === 'meter1' ? 'meter2' : 'meter1';
  const currentLoadW = tomznLive.powerW || inverter.loadW || 0;

  const handleChangeover = () => {
    setShowChangeoverModal(false);
    void swapChangeover(targetMeter);
  };

  return (
    <View style={s.screen}>
      <SceneBackground />
      <ScrollView
        contentContainerStyle={[s.content, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 105 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={s.header}>
          <Text style={[s.headerTitle, { color: theme.text }]}>Energy</Text>
          <Text style={[s.headerSubtitle, { color: theme.textSecondary }]}>Meter tracking, usage comparison & changeover control</Text>
        </View>

        {/* ── Active Meter Selector ── */}
        <View style={s.dropdownRow}>
          <GlassCard style={s.dropdownBox}>
            <Text style={[s.dropdownLabel, { color: theme.textSecondary }]}>
              Active Meter <Text style={{ color: '#32E56B' }}>●</Text>{' '}
              <Text style={{ color: '#32E56B', fontWeight: '700' }}>
                {activeMeter === 'meter1' ? 'Meter 1 (Analog)' : 'Meter 2 (Digital)'}
              </Text>
            </Text>
          </GlassCard>
          <Pressable onPress={() => setShowChangeoverModal(true)}>
            <GlassCard style={s.changeoverBtn} intensity={35} tintAmount={0.10}>
              <Repeat size={15} color="#7BA8FF" />
              <Text style={s.changeoverText}>Changeover</Text>
            </GlassCard>
          </Pressable>
        </View>

        {/* ── AI Forecast & Budget ── */}
        <ForecastBudgetCard
          expectedUnits={home.projectedMonthly}
          vsLastMonth={home.vsLastMonthPercent ?? null}
          lastMonthTotal={home.lastMonthTotal ?? 0}
          confidence={home.confidencePercent}
          dailyUsage={home.dailyUsage || []}
          budgetLeft={meters[activeMeter].remainingUnits}
          budgetTarget={meters[activeMeter].targetUnits}
          daysLeft={meters[activeMeter].projectedDaysLeft}
          combinedDaysLeft={home.combinedDaysLeft ?? 0}
          averageDaily={home.averageDaily}
          meter1Left={meter1.remainingUnits}
          meter1Target={meter1.targetUnits}
          meter1Used={meter1.cycleUsage ?? 0}
          meter1Today={meter1.todayUsage}
          meter1DaysLeft={meter1.projectedDaysLeft}
          meter2Left={meter2.remainingUnits}
          meter2Target={meter2.targetUnits}
          meter2Used={meter2.cycleUsage ?? 0}
          meter2Today={meter2.todayUsage}
          meter2DaysLeft={meter2.projectedDaysLeft}
          cycleStartTs={meta?.cycleStart as number | undefined}
          billingEndTs={meta?.billingEnd as number | undefined}
          isLight={isLight}
        />

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
          />
          <MeterCard
            meter={meter2}
            isActive={activeMeter === 'meter2'}
            isLight={isLight}
            accentColor="#548EFF"
            typeLabel="Digital"
            typePillStyle={s.typePillDigital}
            typePillTextStyle={s.typePillDigitalText}
          />
        </View>
      </ScrollView>

      {/* ── Changeover Confirmation Modal ── */}
      <Modal visible={showChangeoverModal} transparent animationType="fade" onRequestClose={() => setShowChangeoverModal(false)}>
        <View style={s.modalOverlay}>
          <GlassCard style={s.modalCard} blur>
            <Text style={[s.modalTitle, { color: theme.text }]}>Switch to {targetMeter === 'meter1' ? 'Meter 1' : 'Meter 2'}?</Text>
            <Text style={[s.modalSub, { color: theme.textSecondary }]}>
              Current Home Load{'\n'}
              <Text style={[s.modalLoad, { color: theme.text }]}>{Math.round(currentLoadW)}W</Text>
            </Text>
            <Text style={[s.modalNote, { color: theme.textMuted }]}>Switching takes 2 seconds.</Text>
            <View style={s.modalBtnRow}>
              <Pressable style={[s.modalCancelBtn]} onPress={() => setShowChangeoverModal(false)}>
                <Text style={[s.modalCancelText, { color: theme.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable style={s.modalSwitchBtn} onPress={handleChangeover}>
                <Text style={[s.modalSwitchText, { color: isLight ? '#4A85FF' : '#84A2F0' }]}>Switch</Text>
              </Pressable>
            </View>
          </GlassCard>
        </View>
      </Modal>
    </View>
  );
}

// ── Meter Card Component ────────────────────────────────────────────────
const MeterCard = memo(function MeterCard({ meter, isActive, accentColor, typeLabel, typePillStyle, typePillTextStyle, isLight = false }: {
  meter: MeterState;
  isActive: boolean;
  accentColor: string;
  typeLabel: string;
  typePillStyle: any;
  typePillTextStyle: any;
  isLight?: boolean;
}) {
  const cardBorder = isLight ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.08)';
  const textPrimary = isLight ? '#0F172A' : '#F8FAFC';
  const textSecondary = isLight ? '#475569' : '#CBD5E1';
  const textMuted = isLight ? '#94A3B8' : '#94A3B8';
  const overlayBg = isLight ? 'rgba(15,23,42,0.05)' : 'rgba(255,255,255,0.12)';
  const lastReading = meter.lastLoggedReading;
  const todayUsage = meter.todayUsage || 0;

  return (
    <GlassCard style={[s.meterCard, { borderColor: isActive ? `${accentColor}40` : cardBorder, shadowOpacity: isLight ? 0.12 : 0.35, shadowRadius: isLight ? 6 : 10 }]}>
      {/* Header: status pill + meter identity */}
      <View style={s.meterCardHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[s.meterCardTitle, { color: textPrimary }]}>Meter {meter.id === 'meter1' ? '1' : '2'}</Text>
          <View style={typePillStyle}><Text style={typePillTextStyle}>{typeLabel}</Text></View>
        </View>
        {isActive ? (
          <View style={[s.activePill, { backgroundColor: `${accentColor}20` }]}>
            <Text style={[s.activePillText, { color: accentColor }]}>Active</Text>
          </View>
        ) : (
          <View style={[s.inactivePill, { backgroundColor: overlayBg }]}>
            <Text style={[s.inactivePillText, { color: textMuted }]}>Inactive</Text>
          </View>
        )}
      </View>

      {/* Current Reading */}
      <View style={s.readingHero}>
        <View style={s.readingHeroLabelRow}>
          <View style={[s.readingHeroDot, { backgroundColor: accentColor }]} />
          <Text style={[s.readingHeroLabel, { color: textSecondary }]}>Current Reading</Text>
        </View>
        <Text style={[s.readingHeroValue, { color: textPrimary }]} numberOfLines={1} adjustsFontSizeToFit={false}>
          {formatReading(meter.reading)}<Text style={[s.readingHeroUnit, { color: textMuted }]}> kWh</Text>
        </Text>
        {lastReading !== undefined && (
          <Text style={[s.readingHeroSub, { color: textMuted }]}>
            Last {formatReading(lastReading)} kWh · {formatTimeAgo(meter.lastLoggedAt || 0)}
          </Text>
        )}
      </View>

      {/* Today's Usage */}
      <View style={[s.todayRow, { backgroundColor: overlayBg }]}>
        <Text style={[s.todayLabel, { color: textSecondary }]}>Today</Text>
        <Text style={[s.todayValue, { color: accentColor }]}>{todayUsage.toFixed(2)}<Text style={[s.todayUnit, { color: textMuted }]}> units</Text></Text>
      </View>
    </GlassCard>
  );
});

// ── Styles ──────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: 13, gap: 10 },

  // Header
  header: { alignItems: 'center', marginBottom: 4 },
  headerTitle: { color: undefined, fontFamily: 'Outfit', fontSize: 26, fontWeight: '700' },
  headerSubtitle: { color: undefined, fontFamily: 'Outfit', fontSize: 12, marginTop: 3, textAlign: 'center' },

  // Active meter selector
  dropdownRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dropdownBox: {
    flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'transparent', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: 'transparent',
  },
  dropdownLabel: { color: undefined, fontFamily: 'Outfit', fontSize: 11 },
  changeoverBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(123,168,255,0.35)',
  },
  changeoverText: { color: '#7BA8FF', fontFamily: 'Outfit', fontSize: 12, fontWeight: '700' },

  // Meter cards
  meterCardsRow: { flexDirection: 'row', gap: 8 },
  meterCard: {
    width: cardWidth,
    borderRadius: 14,
    padding: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
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

  // Current Reading — HERO (the meter's primary identity number)
  readingHero: { marginBottom: 10 },
  readingHeroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 },
  readingHeroDot: { width: 5, height: 5, borderRadius: 2.5 },
  readingHeroLabel: { fontFamily: 'Outfit', fontSize: 8, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase' },
  readingHeroValue: { fontFamily: 'Outfit', fontSize: 26, fontWeight: '700', letterSpacing: -0.5, lineHeight: 30 },
  readingHeroUnit: { fontSize: 12, fontWeight: '500' },
  readingHeroSub: { fontFamily: 'Outfit', fontSize: 8, marginTop: 3 },

  // Today's usage
  todayRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  todayLabel: { color: undefined, fontFamily: 'Outfit', fontSize: 8 },
  todayValue: { fontFamily: 'Outfit', fontSize: 13, fontWeight: '700' },
  todayUnit: { fontSize: 8, color: undefined },

  // Wide card
  wideCard: {
    width: '100%', borderRadius: 14, padding: 14,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 10,
  },
  wideCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  wideCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  wideCardTitle: { color: undefined, fontFamily: 'Outfit', fontSize: 12, fontWeight: '600' },
  dropdownSmall: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
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
  chartBars: { flex: 1, borderBottomWidth: 1, borderLeftWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  chartXAxis: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 16, marginTop: 3 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: {
    width: '100%', borderRadius: 16, padding: 20,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 16,
  },
  modalTitle: { color: undefined, fontFamily: 'Outfit', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  modalSub: { color: undefined, fontFamily: 'Outfit', fontSize: 11, marginBottom: 6 },
  modalLoad: { color: undefined, fontFamily: 'Outfit', fontSize: 20, fontWeight: '700' },
  modalNote: { color: undefined, fontFamily: 'Outfit', fontSize: 9, marginBottom: 16 },
  modalBtnRow: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingVertical: 10, alignItems: 'center',
  },
  modalCancelText: { color: undefined, fontFamily: 'Outfit', fontSize: 12, fontWeight: '600' },
  modalSwitchBtn: {
    flex: 1, backgroundColor: 'rgba(84,142,255,0.2)', borderRadius: 10, paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(84,142,255,0.3)',
  },
  modalSwitchText: { color: '#84A2F0', fontFamily: 'Outfit', fontSize: 12, fontWeight: '700' },
  // Note: modalSwitchText color overridden inline for light mode contrast
});
