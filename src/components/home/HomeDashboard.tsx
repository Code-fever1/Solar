import type { CardTheme } from "@/components/NewDashboardCards";
import { OpsGuideSheet } from "@/components/OpsGuideCard";
import { SpringPressable } from "@/components/SpringPressable";
import { useEnergy } from "@/context/EnergyContext";
import { useSceneTheme } from "@/context/SceneThemeContext";
import { assessOpsGuide } from "@/utils/ops-guide";
import { Bell } from "lucide-react-native";
import { memo, useMemo, useState } from "react";
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FlowChart, type ChartRange } from "./FlowChart";
import { formatKilowatts, useHomeReadout } from "./homeModel";
import { useCountUp } from "./homeMotion";
import { PowerFlow } from "./PowerFlow";
import { inkFor, SOURCE, type Ink } from "./palette";

function greeting(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

function cardTheme(ink: Ink): CardTheme {
  return {
    cardBg: ink.card,
    cardBorder: ink.border,
    cardHighlight: ink.highlight,
    cardShadow: "#000",
    textPrimary: ink.text,
    textSecondary: ink.secondary,
    textMuted: ink.secondary,
    trackBg: ink.highlight,
    overlayBg: ink.highlight,
    overlayBorder: ink.border,
    svgGridLine: ink.border,
    svgTrack: ink.highlight,
  };
}

export const HomeDashboard = memo(function HomeDashboard() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, 520);
  const {
    activeMeter, energyToday, flowHistory, home, inverter, intelligence, isOffline, liveReady,
    tomznLive, ups, gridFlow, weather, alerts, refreshAll, lastSyncedAt, meters,
  } = useEnergy();
  const { isLight, cycleScene } = useSceneTheme();
  const ink = inkFor(isLight);
  const readout = useHomeReadout({
    inverter, tomznLive, gridFlow, ups,
    offline: isOffline,
    connecting: !liveReady && !isOffline,
    liveReady,
    activeMeter,
  });
  const [range, setRange] = useState<ChartRange>("day");
  const [refreshing, setRefreshing] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const [solar, homeNode, grid] = readout.nodes;
  const shownW = useCountUp(readout.heroWatts);
  const received = (energyToday.solarKwh || 0) + (energyToday.gridKwh || 0);
  const receivedShown = useCountUp(received);
  const usedShown = useCountUp(home.todayUsage || 0);
  const solarKwh = energyToday.solarKwh || 0;
  const gridKwh = energyToday.gridKwh || 0;
  const solarShare = received > 0 ? Math.round((solarKwh / received) * 100) : 0;
  const delta = home.usageChangePercent ?? null;
  const note = intelligence?.notification;
  const hasNotes = Boolean(note) || alerts.length > 0;
  const temp = Number.isFinite(weather.temperatureC) ? `${Math.round(weather.temperatureC)}°` : "";

  const opsGuide = useMemo(
    () => assessOpsGuide({
      liveReady, activeMeter, inverter, tomznLive, gridFlow, weather,
      remaining: { meter1: meters.meter1.remainingUnits, meter2: meters.meter2.remainingUnits },
    }),
    [activeMeter, gridFlow, inverter, liveReady, meters.meter1.remainingUnits, meters.meter2.remainingUnits, tomznLive, weather],
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try { await refreshAll(); } finally { setRefreshing(false); }
  };

  return (
    <View style={[styles.screen, { backgroundColor: ink.bg }]}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 36, width: contentWidth, alignSelf: "center" }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ink.secondary} />}
      >
        <View style={styles.header}>
          <Text style={[styles.greeting, { color: ink.secondary }]}>{isOffline ? "Offline" : greeting(new Date())}</Text>
          <View style={styles.headerRight}>
            <SpringPressable onPress={cycleScene} accessibilityRole="button" accessibilityLabel="Cycle the light and dark scene">
              <Text style={[styles.weather, { color: ink.text }]}>{temp}</Text>
            </SpringPressable>
            <SpringPressable onPress={() => setNotesOpen(true)} accessibilityRole="button" accessibilityLabel="Notifications" style={styles.bell}>
              <Bell color={ink.text} size={18} />
              {hasNotes ? <View style={styles.bellDot} /> : null}
            </SpringPressable>
          </View>
        </View>

        <Text style={[styles.hero, { color: ink.text }]} accessibilityRole="header">
          {formatKilowatts(shownW)}
        </Text>
        <Text style={[styles.heroUnit, { color: ink.secondary }]}>kW at home</Text>
        <Text style={[styles.mode, { color: readout.modeTone === "bad" ? ink.bad : readout.modeTone === "warn" ? ink.warn : ink.secondary }]}>
          {readout.modeLabel}
        </Text>

        <PowerFlow
          width={contentWidth - 32}
          ink={ink}
          solarW={solar.watts}
          homeW={homeNode.watts}
          gridW={grid.watts}
          solarActive={readout.solarFlow.active}
          gridActive={readout.gridFlow.active}
          gridExporting={readout.gridFlow.active && !readout.gridFlow.reverse}
        />

        <View style={styles.metaRow}>
          <Text style={[styles.meta, { color: ink.secondary }]}>{solar.volts.toFixed(0)} V solar</Text>
          <Text style={[styles.meta, { color: ink.secondary }]}>{homeNode.volts.toFixed(0)} V · {homeNode.amps.toFixed(1)} A</Text>
          <Text style={[styles.meta, { color: ink.secondary }]}>{grid.volts.toFixed(0)} V grid</Text>
        </View>

        <View style={[styles.list, { borderColor: ink.border }]}>
          {readout.statuses.map((row, index) => (
            <View key={row.key} style={[styles.listRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ink.border }]}>
              <Text style={[styles.listLabel, { color: ink.secondary }]}>{row.label}</Text>
              <Text style={[styles.listValue, { color: row.tone === "bad" ? ink.bad : row.tone === "warn" ? ink.warn : ink.text }]}>{row.value}</Text>
            </View>
          ))}
        </View>

        <View style={styles.pair}>
          <View style={[styles.card, { backgroundColor: ink.card }]}>
            <Text style={[styles.kicker, { color: ink.secondary }]}>Received</Text>
            <Text style={[styles.figure, { color: ink.text }]}>{receivedShown.toFixed(2)}</Text>
            <Text style={[styles.kicker, { color: ink.secondary }]}>units today</Text>
            <View style={[styles.track, { backgroundColor: ink.highlight }]}>
              <View style={{ flex: Math.max(solarShare, received > 0 ? 1 : 0), backgroundColor: SOURCE.solar }} />
              <View style={{ flex: Math.max(100 - solarShare, received > 0 ? 1 : 0), backgroundColor: SOURCE.grid }} />
            </View>
            <Text style={[styles.split, { color: ink.secondary }]}>Solar {solarKwh.toFixed(2)} · Grid {gridKwh.toFixed(2)}</Text>
          </View>
          <View style={[styles.card, { backgroundColor: ink.card }]}>
            <Text style={[styles.kicker, { color: ink.secondary }]}>Used</Text>
            <Text style={[styles.figure, { color: ink.text }]}>{usedShown.toFixed(2)}</Text>
            <Text style={[styles.kicker, { color: ink.secondary }]}>units today</Text>
            <Text style={[styles.delta, { color: delta == null ? ink.secondary : delta <= 0 ? ink.good : ink.warn }]}>
              {delta == null ? "Comparing with yesterday" : `${delta <= 0 ? "▼" : "▲"} ${Math.abs(delta).toFixed(1)}% vs yesterday`}
            </Text>
          </View>
        </View>

        <View style={[styles.chartCard, { backgroundColor: ink.card }]}>
          <View style={styles.chartHead}>
            <Text style={[styles.chartTitle, { color: ink.text }]}>Energy flow</Text>
            <View style={[styles.segment, { backgroundColor: ink.highlight }]}>
              {(["day", "week", "month"] as ChartRange[]).map((item) => (
                <SpringPressable key={item} onPress={() => setRange(item)} style={[styles.segmentItem, range === item && { backgroundColor: ink.card }]} accessibilityRole="button" accessibilityState={{ selected: range === item }}>
                  <Text style={[styles.segmentText, { color: range === item ? ink.text : ink.secondary }]}>{item[0].toUpperCase()}{item.slice(1)}</Text>
                </SpringPressable>
              ))}
            </View>
          </View>
          <FlowChart flow={flowHistory} daily={home.dailyUsage ?? []} range={range} ink={ink} />
        </View>

        <Text style={[styles.updated, { color: ink.secondary }]}>
          {refreshing ? "Updating…" : lastSyncedAt ? `Updated ${Math.max(0, Math.round((Date.now() - lastSyncedAt) / 1000))}s ago` : "Waiting for the house"}
        </Text>
      </ScrollView>

      <Modal visible={notesOpen} transparent animationType="fade" onRequestClose={() => setNotesOpen(false)}>
        <View style={styles.modalFill}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setNotesOpen(false)} accessibilityLabel="Close notifications" />
          <View style={[styles.sheet, { backgroundColor: ink.card }]}>
            <Text style={[styles.sheetTitle, { color: ink.text }]}>Notifications</Text>
            {note ? (
              <View>
                <Text style={[styles.noteTitle, { color: ink.text }]}>{note.title}</Text>
                <Text style={[styles.noteBody, { color: ink.secondary }]}>{note.message}</Text>
              </View>
            ) : null}
            {alerts.map((alert) => (
              <View key={alert.id}>
                <Text style={[styles.noteTitle, { color: ink.text }]}>{alert.title}</Text>
                <Text style={[styles.noteBody, { color: ink.secondary }]}>{alert.description}</Text>
              </View>
            ))}
            {!hasNotes ? <Text style={[styles.noteBody, { color: ink.secondary }]}>You're up to date.</Text> : null}
            <SpringPressable onPress={() => { setNotesOpen(false); setGuideOpen(true); }} accessibilityRole="button" accessibilityLabel="Open power guide">
              <Text style={[styles.guide, { color: SOURCE.home }]}>Power guide</Text>
            </SpringPressable>
          </View>
        </View>
      </Modal>
      <OpsGuideSheet visible={guideOpen} onClose={() => setGuideOpen(false)} guide={opsGuide} cardTheme={cardTheme(ink)} anchor="grid" />
    </View>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 24 },
  greeting: { fontFamily: "Outfit_400Regular", fontSize: 15 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 14 },
  weather: { fontFamily: "Outfit_500Medium", fontSize: 15, fontVariant: ["tabular-nums"] },
  bell: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  bellDot: { position: "absolute", top: 2, right: 2, width: 6, height: 6, borderRadius: 3, backgroundColor: SOURCE.export },
  hero: {
    fontFamily: "Outfit_300Light",
    fontSize: 92,
    letterSpacing: -3,
    textAlign: "center",
    marginTop: 28,
    fontVariant: ["tabular-nums"],
  },
  heroUnit: { textAlign: "center", fontFamily: "Outfit_400Regular", fontSize: 16, marginTop: -6 },
  mode: { textAlign: "center", fontFamily: "Outfit_500Medium", fontSize: 13, letterSpacing: 0.6, marginTop: 8, marginBottom: 28, textTransform: "uppercase" },
  metaRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 28, marginTop: 4 },
  meta: { fontFamily: "Outfit_400Regular", fontSize: 12, fontVariant: ["tabular-nums"] },
  list: { marginHorizontal: 20, marginTop: 28, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  listRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 14 },
  listLabel: { fontFamily: "Outfit_400Regular", fontSize: 16 },
  listValue: { fontFamily: "Outfit_500Medium", fontSize: 16 },
  pair: { flexDirection: "row", gap: 12, paddingHorizontal: 20, marginTop: 22 },
  card: { flex: 1, borderRadius: 18, padding: 16, minHeight: 148 },
  kicker: { fontFamily: "Outfit_400Regular", fontSize: 13 },
  figure: { fontFamily: "Outfit_300Light", fontSize: 36, letterSpacing: -1, marginVertical: 4, fontVariant: ["tabular-nums"] },
  track: { height: 4, borderRadius: 2, overflow: "hidden", flexDirection: "row", marginTop: 12 },
  split: { fontFamily: "Outfit_400Regular", fontSize: 11, marginTop: 8, fontVariant: ["tabular-nums"] },
  delta: { fontFamily: "Outfit_500Medium", fontSize: 13, marginTop: 16, fontVariant: ["tabular-nums"] },
  chartCard: { marginHorizontal: 20, marginTop: 12, borderRadius: 18, padding: 16 },
  chartHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  chartTitle: { fontFamily: "Outfit_500Medium", fontSize: 16 },
  segment: { flexDirection: "row", borderRadius: 10, padding: 2 },
  segmentItem: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  segmentText: { fontFamily: "Outfit_500Medium", fontSize: 11 },
  updated: { textAlign: "center", fontFamily: "Outfit_400Regular", fontSize: 12, marginTop: 16 },
  modalFill: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12 },
  sheetTitle: { fontFamily: "Outfit_500Medium", fontSize: 20 },
  noteTitle: { fontFamily: "Outfit_500Medium", fontSize: 15 },
  noteBody: { fontFamily: "Outfit_400Regular", fontSize: 14, lineHeight: 20 },
  guide: { fontFamily: "Outfit_500Medium", fontSize: 15, paddingVertical: 8 },
});
