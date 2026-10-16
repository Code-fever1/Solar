import type { CardTheme } from "@/components/NewDashboardCards";
import { OpsGuideSheet } from "@/components/OpsGuideCard";
import { SpringPressable } from "@/components/SpringPressable";
import { useEnergy } from "@/context/EnergyContext";
import { useSceneTheme } from "@/context/SceneThemeContext";
import type { HeroSceneId } from "@/overlay/types";
import { assessOpsGuide } from "@/utils/ops-guide";
import { Bell, CloudFog, CloudRain, CloudSun, Moon, Sun, Sunset } from "lucide-react-native";
import { memo, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { FlowChart, type ChartRange } from "./FlowChart";
import { HeroHouse } from "./HeroHouse";
import { formatPower, useHomeReadout } from "./homeModel";
import { useCountUp } from "./homeMotion";
import { INK, SOURCE } from "./palette";

const CARD_THEME: CardTheme = {
  cardBg: INK.card,
  cardBorder: INK.border,
  cardHighlight: INK.highlight,
  cardShadow: "#000",
  textPrimary: INK.text,
  textSecondary: INK.secondary,
  textMuted: INK.secondary,
  trackBg: "rgba(255,255,255,0.06)",
  overlayBg: "rgba(255,255,255,0.04)",
  overlayBorder: INK.border,
  svgGridLine: "rgba(255,255,255,0.06)",
  svgTrack: "rgba(255,255,255,0.06)",
};

const SCENE_LABEL: Record<HeroSceneId, string> = {
  night: "Night",
  "rain-light": "Rain",
  "clouds-dark": "Clouds",
  fog: "Fog",
  evening: "Evening",
  "morning-cloud": "Morning",
};

function greeting(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}

function weatherPhrase(code: number, isDay: boolean) {
  if (code === 45 || code === 48) return "Fog";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return "Rain";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code === 3) return "Cloudy";
  if (code === 1 || code === 2) return isDay ? "Partly sunny" : "Partly cloudy";
  if (!isDay) return "Clear night";
  return "Sunny";
}

function WeatherIcon({ code, isDay }: { code: number; isDay: boolean }) {
  const color = INK.text;
  if (code === 45 || code === 48) return <CloudFog color={color} size={16} />;
  if (code >= 51) return <CloudRain color={color} size={16} />;
  if (!isDay) return <Moon color={color} size={16} />;
  if (code === 0) return <Sun color={color} size={16} />;
  if (code === 1 || code === 2) return <CloudSun color={color} size={16} />;
  return <Sunset color={color} size={16} />;
}

function Sparkline({ values }: { values: number[] }) {
  const width = 120;
  const height = 36;
  if (values.length < 2) return <View style={{ width, height }} />;
  const max = Math.max(...values, 0.05);
  const min = Math.min(...values, 0);
  const span = Math.max(0.05, max - min);
  const d = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - 2 - ((v - min) / span) * (height - 4);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <Svg width={width} height={height}>
      <Path d={d} stroke={SOURCE.home} strokeWidth={1.7} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

function statusColor(tone: string, key: string) {
  if (key === "meter") return SOURCE.home;
  if (tone === "bad") return INK.bad;
  if (tone === "warn") return INK.warn;
  return INK.good;
}

export const HomeDashboard = memo(function HomeDashboard({ isTabFocused = true }: { isTabFocused?: boolean }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, 520);
  const {
    activeMeter, energyToday, flowHistory, home, inverter, intelligence, isOffline, liveReady,
    tomznLive, ups, gridFlow, weather, alerts, refreshAll, lastSyncedAt, meters,
  } = useEnergy();
  const { heroScene, cycleScene, manualSceneIndex } = useSceneTheme();
  const readout = useHomeReadout({
    inverter,
    tomznLive,
    gridFlow,
    ups,
    offline: isOffline,
    connecting: !liveReady && !isOffline,
    liveReady,
    activeMeter,
  });
  const [range, setRange] = useState<ChartRange>("day");
  const [refreshing, setRefreshing] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const solarKwh = energyToday.solarKwh || 0;
  const gridKwh = energyToday.gridKwh || 0;
  const received = solarKwh + gridKwh;
  const used = home.todayUsage || 0;
  const receivedShown = useCountUp(received);
  const usedShown = useCountUp(used);
  const loadShown = useCountUp(readout.heroWatts);
  const solarShare = received > 0 ? Math.round((solarKwh / received) * 100) : 0;
  const gridShare = received > 0 ? 100 - solarShare : 0;
  const peakW = Math.max(0, ...flowHistory.map((p) => (p.loadKw ?? 0) * 1000), readout.heroWatts);
  const loadPct = Math.max(0, Math.min(100, (readout.heroWatts / 2500) * 100));
  const delta = home.usageChangePercent ?? null;
  const spark = flowHistory.filter((p) => p.loadKw != null).slice(-48).map((p) => p.loadKw as number);
  const phrase = manualSceneIndex === null ? weatherPhrase(weather.code, weather.isDay) : SCENE_LABEL[heroScene.id];
  const temp = Number.isFinite(weather.temperatureC) ? `${Math.round(weather.temperatureC)}°` : "";
  const note = intelligence?.notification;
  const hasNotes = Boolean(note) || alerts.length > 0;

  const opsGuide = useMemo(
    () => assessOpsGuide({
      liveReady,
      activeMeter,
      inverter,
      tomznLive,
      gridFlow,
      weather,
      remaining: { meter1: meters.meter1.remainingUnits, meter2: meters.meter2.remainingUnits },
    }),
    [activeMeter, gridFlow, inverter, liveReady, meters.meter1.remainingUnits, meters.meter2.remainingUnits, tomznLive, weather],
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshAll();
    } finally {
      setRefreshing(false);
    }
  };

  const updated = lastSyncedAt ? `Updated ${Math.max(0, Math.round((Date.now() - lastSyncedAt) / 1000))}s ago` : "Waiting for the house";

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 28, width: contentWidth, alignSelf: "center" }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={INK.secondary} />}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{isOffline ? "Offline" : greeting(new Date())}</Text>
            <Text style={styles.title} accessibilityRole="header">My Home</Text>
          </View>
          <SpringPressable onPress={cycleScene} style={styles.weather} accessibilityRole="button" accessibilityLabel={`Weather ${temp} ${phrase}. Changes the house scene.`}>
            <WeatherIcon code={weather.code} isDay={weather.isDay && manualSceneIndex === null} />
            <Text style={styles.weatherText}>{temp} {phrase}</Text>
          </SpringPressable>
          <SpringPressable onPress={() => setNotesOpen(true)} style={styles.bell} accessibilityRole="button" accessibilityLabel="Notifications">
            <Bell color={INK.text} size={18} />
            {hasNotes ? <View style={styles.bellDot} /> : null}
          </SpringPressable>
        </View>

        {isTabFocused ? (
          <HeroHouse
            scene={heroScene}
            width={contentWidth}
            nodes={readout.nodes}
            solarActive={readout.solarFlow.active}
            gridActive={readout.gridFlow.active}
            gridExporting={readout.gridFlow.active && !readout.gridFlow.reverse}
          />
        ) : null}

        <View style={styles.statusStrip}>
          {readout.statuses.map((row) => (
            <View key={row.key} style={styles.statusItem}>
              <View style={[styles.statusDot, { backgroundColor: statusColor(row.tone, row.key) }]} />
              <Text style={styles.statusText} numberOfLines={1}>{row.label} {row.value}</Text>
            </View>
          ))}
        </View>

        <View style={styles.stack}>
          <View style={styles.card}>
            <Text style={styles.kicker}>Energy received today</Text>
            <Text style={styles.figure}>
              {receivedShown.toFixed(2)}
              <Text style={styles.figureUnit}> units</Text>
            </Text>
            <View style={styles.splitTrack}>
              <View style={{ flex: Math.max(solarShare, 1), backgroundColor: SOURCE.solar, height: "100%" }} />
              <View style={{ flex: Math.max(gridShare, 1), backgroundColor: SOURCE.grid, height: "100%" }} />
            </View>
            <View style={styles.legendRow}>
              <Text style={[styles.legend, { color: SOURCE.solar }]}>Solar {solarKwh.toFixed(2)}</Text>
              <Text style={[styles.legend, { color: SOURCE.grid }]}>Grid {gridKwh.toFixed(2)}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.kicker}>Energy used today</Text>
                <Text style={styles.figure}>
                  {usedShown.toFixed(2)}
                  <Text style={styles.figureUnit}> units</Text>
                </Text>
              </View>
              <Sparkline values={spark} />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.kicker}>Live load</Text>
            <Text style={styles.liveFigure}>
              {Math.round(loadShown).toLocaleString("en-US")}
              <Text style={styles.figureUnit}> W</Text>
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.meta}>Peak {Math.round(peakW).toLocaleString("en-US")} W</Text>
              {delta != null ? (
                <Text style={[styles.delta, { color: delta <= 0 ? INK.good : INK.warn }]}>
                  {delta <= 0 ? "▼" : "▲"} {Math.abs(delta).toFixed(1)}% vs yesterday
                </Text>
              ) : (
                <Text style={styles.meta}>Comparing with yesterday</Text>
              )}
            </View>
            <View style={styles.gaugeTrack}>
              <View style={[styles.gaugeFill, { width: `${loadPct}%` }]} />
              <View style={[styles.knob, { left: `${loadPct}%` }]} />
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.chartTitle}>Today's energy flow</Text>
              <View style={styles.segment}>
                {(["day", "week", "month"] as ChartRange[]).map((item) => (
                  <SpringPressable key={item} onPress={() => setRange(item)} style={[styles.segmentItem, range === item && styles.segmentOn]} accessibilityRole="button" accessibilityState={{ selected: range === item }}>
                    <Text style={[styles.segmentText, range === item && styles.segmentTextOn]}>{item[0].toUpperCase()}{item.slice(1)}</Text>
                  </SpringPressable>
                ))}
              </View>
            </View>
            <FlowChart flow={flowHistory} daily={home.dailyUsage ?? []} range={range} />
          </View>
        </View>
        <Text style={styles.updated}>{refreshing ? "Updating…" : updated}</Text>
      </ScrollView>

      <Modal visible={notesOpen} transparent animationType="fade" onRequestClose={() => setNotesOpen(false)}>
        <View style={styles.modalFill}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setNotesOpen(false)} accessibilityLabel="Close notifications" />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Notifications</Text>
            {note ? (
              <View style={styles.noteBlock}>
                <Text style={styles.noteTitle}>{note.title}</Text>
                <Text style={styles.noteBody}>{note.message}</Text>
              </View>
            ) : null}
            {alerts.map((alert) => (
              <View key={alert.id} style={styles.noteBlock}>
                <Text style={styles.noteTitle}>{alert.title}</Text>
                <Text style={styles.noteBody}>{alert.description}</Text>
              </View>
            ))}
            {!hasNotes ? <Text style={styles.noteBody}>You're up to date.</Text> : null}
            <SpringPressable onPress={() => { setNotesOpen(false); setGuideOpen(true); }} style={styles.guideBtn} accessibilityRole="button" accessibilityLabel="Open power guide">
              <Text style={styles.guideText}>Power guide</Text>
            </SpringPressable>
          </View>
        </View>
      </Modal>
      <OpsGuideSheet visible={guideOpen} onClose={() => setGuideOpen(false)} guide={opsGuide} cardTheme={CARD_THEME} anchor="grid" />
    </View>
  );
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: INK.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingBottom: 12, gap: 10 },
  greeting: { color: INK.secondary, fontFamily: "Outfit_400Regular", fontSize: 13 },
  title: { color: INK.text, fontFamily: "Outfit_600SemiBold", fontSize: 28, letterSpacing: -0.6, marginTop: 1 },
  weather: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 },
  weatherText: { color: INK.text, fontFamily: "Outfit_500Medium", fontSize: 13 },
  bell: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  bellDot: { position: "absolute", top: 6, right: 6, width: 7, height: 7, borderRadius: 4, backgroundColor: SOURCE.export },
  statusStrip: {
    marginHorizontal: 16,
    marginTop: -8,
    borderRadius: 18,
    backgroundColor: "rgba(18,24,33,0.88)",
    borderWidth: 1,
    borderColor: INK.highlight,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statusItem: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: "46%" },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { color: INK.text, fontFamily: "Outfit_500Medium", fontSize: 12, flexShrink: 1 },
  stack: { paddingHorizontal: 16, paddingTop: 14, gap: 12 },
  card: {
    backgroundColor: INK.card,
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: INK.highlight,
  },
  kicker: {
    color: INK.secondary,
    fontFamily: "Outfit_500Medium",
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  figure: {
    color: INK.text,
    fontFamily: "Outfit_600SemiBold",
    fontSize: 34,
    letterSpacing: -0.8,
    fontVariant: ["tabular-nums"],
    marginTop: 4,
  },
  liveFigure: {
    color: INK.text,
    fontFamily: "Outfit_600SemiBold",
    fontSize: 40,
    letterSpacing: -1,
    fontVariant: ["tabular-nums"],
    marginTop: 2,
  },
  figureUnit: { color: INK.secondary, fontFamily: "Outfit_400Regular", fontSize: 15 },
  splitTrack: { height: 6, borderRadius: 3, overflow: "hidden", flexDirection: "row", marginTop: 14, backgroundColor: "rgba(255,255,255,0.06)" },
  legendRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  legend: { fontFamily: "Outfit_500Medium", fontSize: 12, fontVariant: ["tabular-nums"] },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6, gap: 8 },
  meta: { color: INK.secondary, fontFamily: "Outfit_400Regular", fontSize: 13, fontVariant: ["tabular-nums"] },
  delta: { fontFamily: "Outfit_600SemiBold", fontSize: 13, fontVariant: ["tabular-nums"] },
  gaugeTrack: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 14 },
  gaugeFill: { height: "100%", borderRadius: 3, backgroundColor: SOURCE.home },
  knob: {
    position: "absolute",
    top: -4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#F2F5F8",
    marginLeft: -7,
  },
  chartTitle: { color: INK.text, fontFamily: "Outfit_600SemiBold", fontSize: 16, flex: 1 },
  segment: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 10, padding: 2 },
  segmentItem: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  segmentOn: { backgroundColor: "rgba(255,255,255,0.12)" },
  segmentText: { color: INK.secondary, fontFamily: "Outfit_500Medium", fontSize: 11 },
  segmentTextOn: { color: INK.text },
  updated: { color: INK.secondary, fontFamily: "Outfit_400Regular", fontSize: 11, textAlign: "center", marginTop: 14 },
  modalFill: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    backgroundColor: INK.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: INK.highlight,
  },
  sheetTitle: { color: INK.text, fontFamily: "Outfit_600SemiBold", fontSize: 20 },
  noteBlock: { gap: 4 },
  noteTitle: { color: INK.text, fontFamily: "Outfit_600SemiBold", fontSize: 15 },
  noteBody: { color: INK.secondary, fontFamily: "Outfit_400Regular", fontSize: 14, lineHeight: 20 },
  guideBtn: { alignSelf: "flex-start", paddingVertical: 8 },
  guideText: { color: SOURCE.home, fontFamily: "Outfit_600SemiBold", fontSize: 15 },
});
