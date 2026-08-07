import { GlassCard } from "@/components/GlassCard";
import { TabSlideWrapper } from "@/components/TabSlideWrapper";
import { UsageSummaryCard } from "@/components/UsageSummaryCard";
import { useEnergy } from "@/context/EnergyContext";
import { useSceneTheme } from "@/context/SceneThemeContext";
import {
    Activity,
    AlertCircle,
    Battery,
    Clock,
    Cpu,
    Gauge,
    Radio,
    RefreshCw,
    Sun,
    Thermometer,
    TrendingDown,
    TrendingUp,
    Zap
} from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import {
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSequence,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SceneBackground } from "@/components/SceneBackground";

type Tab = "usage" | "fronus" | "tomzn";

// TOMZN fault code bitfield lookup
const TOMZN_FAULTS: Record<number, { type: string; reason: string; severity: "critical" | "warning" | "info" }> = {
  1: { type: "Short Circuit", reason: "Direct short circuit detected; breaker tripped instantly.", severity: "critical" },
  4: { type: "Overload", reason: "Total connected load exceeded maximum physical hardware capacity.", severity: "critical" },
  8: { type: "Earth Leakage", reason: "Current escaping to the ground wire; safety hazard protection.", severity: "critical" },
  16: { type: "Over-temperature", reason: "Internal terminal connections or breaker housing got too hot.", severity: "warning" },
  64: { type: "Over-power", reason: "Connected wattage exceeded your set safety wattage cap.", severity: "warning" },
  256: { type: "Over-current", reason: "Amperage went past your custom Io cap limit.", severity: "warning" },
  512: { type: "Unbalance", reason: "Amperage difference between phases is unsafely high (3-Phase models).", severity: "warning" },
  1024: { type: "Over-Voltage", reason: "Main grid spiked higher than your upper Uo protection limit.", severity: "critical" },
  2048: { type: "Under-Voltage", reason: "Grid voltage dropped too low for safe operation.", severity: "critical" },
  4096: { type: "Phase Loss / Fault", reason: "One of the incoming lines died completely (3-Phase models).", severity: "critical" },
  8192: { type: "Power Outage", reason: "Main incoming supply grid lost total utility power.", severity: "critical" },
  16384: { type: "Magnetism", reason: "External magnetic field tamper attempt or sensor glitch detected.", severity: "warning" },
  131072: { type: "Phase Sequence Error", reason: "L1, L2, or L3 wires are connected in the wrong order.", severity: "warning" },
  262144: { type: "Voltage Unbalance", reason: "Voltage gap between lines is wider than safe limits.", severity: "warning" },
};

// Decode a bitfield fault code into all active fault flags
type DecodedFault = { bit: number; type: string; reason: string; severity: "critical" | "warning" | "info" };
function decodeFaultCode(code: number): DecodedFault[] {
  if (!code || code <= 0) return [];
  return Object.keys(TOMZN_FAULTS)
    .map(Number)
    .filter((bit) => (code & bit) !== 0)
    .map((bit) => ({ bit, ...TOMZN_FAULTS[bit] }));
}

const SEVERITY_COLOR = { critical: "#EF4C4C", warning: "#F8C653", info: "#548EFF" };

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { isLight, ...theme } = useSceneTheme();
  const { home, inverter, tomznLive, refreshTomzn, tomznHistory } = useEnergy();
  const [tab, setTab] = useState<Tab>("usage");
  const [refreshing, setRefreshing] = useState(false);

  const rotation = useSharedValue(0);
  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    rotation.value = withSequence(
      withTiming(360, { duration: 600 }),
      withTiming(0, { duration: 0 })
    );
    setRefreshing(true);
    try {
      await refreshTomzn();
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, refreshTomzn, rotation]);

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "usage", label: "Usage", icon: Activity },
    { key: "fronus", label: "Fronus", icon: Sun },
    { key: "tomzn", label: "Tomzn", icon: Cpu },
  ];

  // Sliding pill animation for the sub-tab selector
  const tabIndex = tabs.findIndex((t) => t.key === tab);
  const { width: screenWidth } = useWindowDimensions();
  const containerWidth = Math.min(screenWidth - 32, 480);
  const tabCount = tabs.length;
  const tabSlotWidth = (containerWidth - 8) / tabCount; // 8 = padding (4 each side)
  const pillWidth = tabSlotWidth - 8;
  const pillOffset = 4 + tabIndex * tabSlotWidth + 4;
  const pillTranslateX = useSharedValue(pillOffset);

  useEffect(() => {
    pillTranslateX.value = withSpring(pillOffset, {
      damping: 22,
      stiffness: 260,
      mass: 0.9,
    });
  }, [pillOffset, pillTranslateX]);

  const pillAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillTranslateX.value }],
  }));

  return (
    <TabSlideWrapper index={2}>
    <View style={styles.screen}>
      <SceneBackground />
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Summary</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Complete device telemetry & usage analytics</Text>
        </View>

        {/* Tab Selector — glass bar with sliding pill */}
        <View style={[styles.tabBar, { width: containerWidth }]}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(255,255,255,0.06)" }]} />
          <View style={styles.tabBarRim} />

          {/* Sliding active pill */}
          <Animated.View style={[styles.tabPillContainer, { width: pillWidth }, pillAnimStyle]}>
            <View style={styles.tabPillAccent} />
            <View style={styles.tabPillBorder} />
          </Animated.View>

          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={styles.tab}
              >
                <Icon size={14} color={isActive ? "#35E378" : theme.textSecondary} />
                <Text style={[styles.tabText, isActive && styles.tabTextActive, { color: isActive ? undefined : theme.textSecondary }]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Tab Content */}
        {tab === "usage" && <UsageTab />}
        {tab === "fronus" && <FronusTab inverter={inverter} />}
        {tab === "tomzn" && (
          <TomznTab
            tomznLive={tomznLive}
            home={home}
            tomznHistory={tomznHistory}
            onRefresh={handleRefresh}
            refreshing={refreshing}
            spinStyle={spinStyle}
          />
        )}
      </ScrollView>
    </View>
    </TabSlideWrapper>
  );
}

/* ─────────────────── Usage Summary Tab ─────────────────── */

function UsageTab() {
  return (
    <View style={styles.tabContent}>
      <UsageSummaryCard />
    </View>
  );
}

/* ─────────────────── Fronus (Inverter) Tab ─────────────────── */

function FronusTab({ inverter }: { inverter: any }) {
  const { isLight, ...theme } = useSceneTheme();
  const isLive = inverter?.isLive;
  const isOnline = inverter?.isOnline !== false;
  const statusColor = isLive && isOnline ? "#32E56B" : isOnline ? "#F8C653" : "#EF4C4C";
  const statusText = isLive && isOnline ? "LIVE" : isOnline ? "STALE" : "OFFLINE";
  const fetchedAt = inverter?.fetchedAt
    ? new Date(inverter.fetchedAt).toLocaleString()
    : "Never";

  return (
    <View style={styles.tabContent}>
      {/* Fronus Header Card */}
      <GlassCard style={styles.card}>
        <View style={styles.deviceHeader}>
          <View style={styles.deviceHeaderLeft}>
            {/* Placeholder for Fronus image — replace with actual image when available */}
            <View style={[styles.deviceLogoPlaceholder, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <Sun size={24} color="#F8C653" />
            </View>
            <View>
              <Text style={[styles.deviceName, { color: theme.text }]}>Fronus Inverter</Text>
              <Text style={[styles.deviceSubtitle, { color: theme.textSecondary }]}>Solar inverter telemetry</Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: `${statusColor}20`, borderColor: `${statusColor}40` }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
          </View>
        </View>

        {/* Last fetched */}
        <View style={styles.fetchedRow}>
          <Clock size={10} color={theme.textMuted} />
          <Text style={[styles.fetchedText, { color: theme.textSecondary }]}>Last fetched: {fetchedAt}</Text>
        </View>

        {/* Solar Section */}
        <SectionHeader icon={<Sun size={12} color="#F8C653" />} title="Solar (PV)" color="#F8C653" />
        <View style={styles.dataGrid}>
          <DataTile label="Power" value={inverter?.solarW ? `${inverter.solarW.toFixed(0)} W` : "-- W"} icon={<Zap size={10} color="#F8C653" />} />
          <DataTile label="Voltage" value={inverter?.solarV ? `${inverter.solarV.toFixed(1)} V` : "-- V"} icon={<Gauge size={10} color="#F8C653" />} />
          <DataTile label="Current" value={inverter?.solarA ? `${inverter.solarA.toFixed(1)} A` : "-- A"} icon={<Activity size={10} color="#F8C653" />} />
        </View>

        {/* Grid Section */}
        <SectionHeader icon={<Zap size={12} color="#548EFF" />} title="Grid" color="#548EFF" />
        <View style={styles.dataGrid}>
          <DataTile label="Power" value={(inverter?.isOnline !== false && inverter?.gridWRaw != null) ? `${inverter.gridWRaw.toFixed(0)} W` : "-- W"} icon={<Zap size={10} color="#548EFF" />} />
          <DataTile label="Voltage" value={inverter?.gridV ? `${inverter.gridV.toFixed(1)} V` : "-- V"} icon={<Gauge size={10} color="#548EFF" />} />
          <DataTile label="Frequency" value={inverter?.gridHz ? `${inverter.gridHz.toFixed(2)} Hz` : "-- Hz"} icon={<Activity size={10} color="#548EFF" />} />
        </View>
        <View style={styles.dataGrid}>
          <DataTile
            label="Connection"
            value={inverter?.gridConnected ? "Connected" : "Disconnected"}
            icon={<Radio size={10} color={inverter?.gridConnected ? "#32E56B" : "#EF4C4C"} />}
          />
          <DataTile
            label="Direction"
            value={inverter?.gridDirection === "import" ? "Importing" : inverter?.gridDirection === "export" ? "Exporting" : "--"}
            icon={inverter?.gridDirection === "import" ? <TrendingDown size={10} color="#EF4C4C" /> : <TrendingUp size={10} color="#32E56B" />}
          />
        </View>

        {/* Load Section */}
        <SectionHeader icon={<Battery size={12} color="#32E56B" />} title="Load" color="#32E56B" />
        <View style={styles.dataGrid}>
          <DataTile label="Power" value={inverter?.loadW ? `${inverter.loadW.toFixed(0)} W` : "-- W"} icon={<Zap size={10} color="#32E56B" />} />
          <DataTile label="Apparent Power" value={inverter?.loadVa ? `${inverter.loadVa.toFixed(0)} VA` : "-- VA"} icon={<Activity size={10} color="#32E56B" />} />
          <DataTile label="Load %" value={inverter?.loadPercent ? `${inverter.loadPercent.toFixed(1)}%` : "-- %"} icon={<Gauge size={10} color="#32E56B" />} />
        </View>
        <View style={styles.dataGrid}>
          <DataTile label="Output Voltage" value={inverter?.acOutV ? `${inverter.acOutV.toFixed(1)} V` : "-- V"} icon={<Gauge size={10} color="#32E56B" />} />
          <DataTile label="Output Frequency" value={inverter?.acOutHz ? `${inverter.acOutHz.toFixed(2)} Hz` : "-- Hz"} icon={<Activity size={10} color="#32E56B" />} />
        </View>

        {/* Inverter Status Section */}
        <SectionHeader icon={<Cpu size={12} color="#8862ED" />} title="Inverter Status" color="#8862ED" />
        <View style={styles.dataGrid}>
          <DataTile label="Mode" value={inverter?.inverterMode || "--"} icon={<Cpu size={10} color="#8862ED" />} />
          <DataTile label="Fault" value={inverter?.inverterFault || "--"} icon={<AlertCircle size={10} color={inverter?.inverterFault && inverter.inverterFault !== "OK" && inverter.inverterFault !== "UNKNOWN" ? "#FF5252" : theme.textMuted} />} />
          <DataTile label="Temperature" value={inverter?.temperatureC ? `${inverter.temperatureC.toFixed(1)}°C` : "-- °C"} icon={<Thermometer size={10} color="#8862ED" />} />
        </View>
        <View style={styles.dataGrid}>
          <DataTile label="Rated Output" value={inverter?.ratedOutputW ? `${inverter.ratedOutputW.toFixed(0)} W` : "-- W"} icon={<Zap size={10} color="#8862ED" />} />
          <DataTile label="Signal" value={inverter?.signal != null ? `${inverter.signal}%` : "-- %"} icon={<Radio size={10} color="#8862ED" />} />
          <DataTile label="Data Status" value={isLive && isOnline ? "Live" : isOnline ? "Stale" : "Offline"} icon={<Activity size={10} color={isLive && isOnline ? "#32E56B" : "#EF4C4C"} />} />
        </View>
      </GlassCard>
    </View>
  );
}

/* ─────────────────── Tomzn Tab ─────────────────── */

function TomznTab({
  tomznLive,
  home,
  tomznHistory,
  onRefresh,
  refreshing,
  spinStyle,
}: {
  tomznLive: any;
  home: any;
  tomznHistory: any[];
  onRefresh: () => void;
  refreshing: boolean;
  spinStyle: any;
}) {
  const { isLight, ...theme } = useSceneTheme();
  const isLive = tomznLive?.isLive;
  const isOnline = tomznLive?.isOnline;
  const statusColor = isLive ? "#32E56B" : isOnline ? "#F8C653" : "#EF4C4C";
  const statusText = isLive ? "LIVE" : isOnline ? "STALE" : "OFFLINE";
  const fetchedAt = tomznLive?.fetchedAt
    ? new Date(tomznLive.fetchedAt).toLocaleString()
    : "Never";

  const hourlyUsage = home.hourlyUsage || [];
  const maxHourly = Math.max(0.001, ...hourlyUsage.map((h: any) => h.usage));

  return (
    <View style={styles.tabContent}>
      {/* Tomzn Header Card */}
      <GlassCard style={styles.card}>
        <View style={styles.deviceHeader}>
          <View style={styles.deviceHeaderLeft}>
            {/* Placeholder for Tomzn image — replace with actual image when available */}
            <View style={[styles.deviceLogoPlaceholder, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <Cpu size={24} color="#548EFF" />
            </View>
            <View>
              <Text style={[styles.deviceName, { color: theme.text }]}>Tomzn Meter</Text>
              <Text style={[styles.deviceSubtitle, { color: theme.textSecondary }]}>Smart meter telemetry</Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: `${statusColor}20`, borderColor: `${statusColor}40` }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusText}</Text>
          </View>
        </View>

        {/* Refresh button + last fetched */}
        <View style={styles.fetchedRow}>
          <Clock size={10} color={theme.textMuted} />
          <Text style={[styles.fetchedText, { color: theme.textSecondary }]}>Last fetched: {fetchedAt}</Text>
          <Pressable onPress={onRefresh} style={styles.refreshBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Animated.View style={spinStyle}>
              <RefreshCw size={13} color="#548EFF" />
            </Animated.View>
          </Pressable>
        </View>

        {/* Live Telemetry Section */}
        <SectionHeader icon={<Zap size={12} color="#548EFF" />} title="Live Telemetry" color="#548EFF" />
        <View style={styles.dataGrid}>
          <DataTile label="Power" value={tomznLive?.powerW > 0 ? tomznLive.powerDisplay : "-- W"} icon={<Zap size={10} color="#548EFF" />} />
          <DataTile label="Voltage" value={tomznLive?.voltageV > 0 ? `${tomznLive.voltageV.toFixed(0)} V` : "-- V"} icon={<Gauge size={10} color="#548EFF" />} />
          <DataTile label="Current" value={tomznLive?.currentA > 0 ? `${tomznLive.currentA.toFixed(1)} A` : "-- A"} icon={<Activity size={10} color="#548EFF" />} />
        </View>
        <View style={styles.dataGrid}>
          <DataTile label="Frequency" value={tomznLive?.frequencyHz ? `${tomznLive.frequencyHz.toFixed(2)} Hz` : "-- Hz"} icon={<Activity size={10} color="#548EFF" />} />
          <DataTile label="Total Energy" value={tomznLive?.energyKwh ? `${tomznLive.energyKwh.toFixed(2)} kWh` : "-- kWh"} icon={<Zap size={10} color="#548EFF" />} />
          <DataTile label="Active Meter" value={tomznLive?.activeMeter === "meter1" ? "Meter 1" : tomznLive?.activeMeter === "meter2" ? "Meter 2" : "--"} icon={<Cpu size={10} color="#548EFF" />} />
        </View>

        {/* Switch & Fault Section */}
        <SectionHeader icon={<AlertCircle size={12} color="#F8C653" />} title="Switch & Fault" color="#F8C653" />
        <View style={styles.dataGrid}>
          <DataTile
            label="Switch"
            value={tomznLive?.switchOn ? "ON" : "OFF"}
            icon={<Radio size={10} color={tomznLive?.switchOn ? "#32E56B" : "#EF4C4C"} />}
          />
          <DataTile label="Online" value={isOnline ? "Online" : "Offline"} icon={<Radio size={10} color={isOnline ? "#32E56B" : "#EF4C4C"} />} />
          <DataTile label="Fault Code" value={tomznLive?.faultCode ? String(tomznLive.faultCode) : "0"} icon={<AlertCircle size={10} color={tomznLive?.faultCode ? "#EF4C4C" : "#32E56B"} />} />
        </View>

        {/* Fault Code Explanation */}
        {(() => {
          const code = tomznLive?.faultCode || 0;
          const faults = decodeFaultCode(code);
          if (faults.length === 0) {
            return (
              <View style={[styles.faultBox, { backgroundColor: "rgba(50,229,107,0.06)", borderColor: "rgba(50,229,107,0.15)" }]}>
                <View style={styles.faultHeader}>
                  <AlertCircle size={11} color="#32E56B" />
                  <Text style={[styles.faultTitle, { color: "#32E56B" }]}>No Faults</Text>
                </View>
                <Text style={[styles.faultReason, { color: theme.textSecondary }]}>System is operating normally. No fault flags are active.</Text>
              </View>
            );
          }
          return faults.map((f) => (
            <View key={f.bit} style={[styles.faultBox, { backgroundColor: `${SEVERITY_COLOR[f.severity]}0F`, borderColor: `${SEVERITY_COLOR[f.severity]}33` }]}>
              <View style={styles.faultHeader}>
                <AlertCircle size={11} color={SEVERITY_COLOR[f.severity]} />
                <Text style={[styles.faultTitle, { color: SEVERITY_COLOR[f.severity] }]}>{f.type}</Text>
                <View style={[styles.faultBadge, { backgroundColor: `${SEVERITY_COLOR[f.severity]}22` }]}>
                  <Text style={[styles.faultBadgeText, { color: SEVERITY_COLOR[f.severity] }]}>Code {f.bit}</Text>
                </View>
              </View>
              <Text style={[styles.faultReason, { color: theme.textSecondary }]}>{f.reason}</Text>
            </View>
          ));
        })()}

        {/* Data Status Section */}
        <SectionHeader icon={<Activity size={12} color="#8862ED" />} title="Data Status" color="#8862ED" />
        <View style={styles.dataGrid}>
          <DataTile label="Live Status" value={isLive ? "Live" : "Stale"} icon={<Activity size={10} color={isLive ? "#32E56B" : "#EF4C4C"} />} />
          <DataTile label="Timestamp" value={tomznLive?.timestamp ? new Date(tomznLive.timestamp).toLocaleTimeString() : "--"} icon={<Clock size={10} color="#8862ED" />} />
          <DataTile label="Today Usage" value={home?.todayUsage ? `${home.todayUsage.toFixed(2)} kWh` : "-- kWh"} icon={<Zap size={10} color="#8862ED" />} />
        </View>
      </GlassCard>

      {/* 24-Hour Usage Chart */}
      <GlassCard style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            <TrendingUp size={12} color="#548EFF" />
            <Text style={[styles.cardTitle, { color: theme.text }]}>24-Hour Usage</Text>
          </View>
          <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>Hourly consumption</Text>
        </View>
        {hourlyUsage.length > 0 ? (
          <View style={styles.hourlyChart}>
            {hourlyUsage.map((hour: any, idx: number) => {
              const heightPct = (hour.usage / maxHourly) * 100;
              const isPeak = hour.usage === maxHourly;
              return (
                <View key={idx} style={styles.hourlyBar}>
                  <View style={[styles.hourlyBarFill, {
                    height: `${Math.max(2, heightPct)}%`,
                    backgroundColor: isPeak ? "#548EFF" : hour.usage > maxHourly * 0.5 ? "rgba(84,142,255,0.6)" : "rgba(84,142,255,0.3)",
                  }]} />
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No hourly data available</Text>
        )}
      </GlassCard>

      {/* Tomzn History (recent 10) */}
      <GlassCard style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            <Clock size={12} color="#548EFF" />
            <Text style={[styles.cardTitle, { color: theme.text }]}>History (Recent 10)</Text>
          </View>
          <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>{tomznHistory.length} total records</Text>
        </View>
        {tomznHistory.length > 0 ? (
          tomznHistory.slice(-10).reverse().map((row: any, idx: number) => (
            <View key={idx} style={[styles.historyRow, { borderBottomColor: theme.border }]}>
              <View style={styles.historyLeft}>
                <Clock size={10} color={theme.textSecondary} />
                <Text style={[styles.historyTime, { color: theme.textSecondary }]}>
                  {row.timestamp ? new Date(row.timestamp).toLocaleString() : "--"}
                </Text>
              </View>
              <View style={styles.historyRight}>
                <Text style={[styles.historyPower, { color: theme.text }]}>{row.powerW || 0} W</Text>
                <Text style={[styles.historyEnergy, { color: theme.textSecondary }]}>{(row.energyKwh || 0).toFixed(2)} kWh</Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No history records available</Text>
        )}
      </GlassCard>
    </View>
  );
}

/* ─────────────────── Shared Components ─────────────────── */

function SectionHeader({ icon, title, color }: { icon: React.ReactNode; title: string; color: string }) {
  return (
    <View style={[styles.sectionHeader, { marginTop: 14 }]}>
      {icon}
      <Text style={[styles.sectionHeaderText, { color }]}>{title}</Text>
      <View style={[styles.sectionHeaderLine, { backgroundColor: `${color}20` }]} />
    </View>
  );
}

function DataTile({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  const { ...theme } = useSceneTheme();
  return (
    <View style={[styles.dataTile, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.dataTileHeader}>
        {icon}
        <Text style={[styles.dataTileLabel, { color: theme.textSecondary }]}>{label}</Text>
      </View>
      <Text style={[styles.dataTileValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

/* ─────────────────── Styles ─────────────────── */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    paddingHorizontal: 16,
    gap: 12,
  },
  header: {
    alignItems: "center",
    marginBottom: 4,
  },
  title: {
    color: undefined,
    fontFamily: "Outfit",
    fontSize: 26,
    fontWeight: "700",
  },
  subtitle: {
    color: undefined,
    fontSize: 12,
    fontFamily: "Outfit",
    marginTop: 3,
    textAlign: "center",
  },

  // Tab bar — glass bar with sliding pill
  tabBar: {
    flexDirection: "row",
    borderRadius: 14,
    padding: 4,
    gap: 4,
    overflow: "hidden",
    position: "relative",
    alignItems: "center",
  },
  tabBarRim: {
    ...StyleSheet.absoluteFill,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tabPillContainer: {
    position: "absolute",
    top: 4,
    bottom: 4,
    left: 0,
    zIndex: 0,
  },
  tabPillAccent: {
    ...StyleSheet.absoluteFill,
    borderRadius: 10,
    backgroundColor: "rgba(53,227,120,0.10)",
  },
  tabPillBorder: {
    ...StyleSheet.absoluteFill,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(53,227,120,0.25)",
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    borderRadius: 10,
    zIndex: 1,
  },
  tabText: {
    color: undefined,
    fontSize: 11,
    fontFamily: "Outfit",
    fontWeight: "600",
  },
  tabTextActive: {
    color: "#35E378",
    fontWeight: "700",
  },

  // Tab content
  tabContent: {
    gap: 10,
  },

  // Card
  card: {
    borderRadius: 14,
    padding: 14,
    overflow: "hidden",
    position: "relative",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  cardTitle: {
    color: undefined,
    fontSize: 12,
    fontFamily: "Outfit",
    fontWeight: "700",
  },
  cardSubtitle: {
    color: undefined,
    fontSize: 9,
    fontFamily: "Outfit",
  },

  // Device header
  deviceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  deviceHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  deviceLogoPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  deviceName: {
    color: undefined,
    fontSize: 16,
    fontFamily: "Outfit",
    fontWeight: "700",
  },
  deviceSubtitle: {
    color: undefined,
    fontSize: 10,
    fontFamily: "Outfit",
    marginTop: 2,
  },

  // Status badge
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 9,
    fontFamily: "Outfit",
    fontWeight: "700",
    letterSpacing: 0.5,
  },

  // Fetched row
  fetchedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 10,
    paddingHorizontal: 2,
  },
  fetchedText: {
    color: undefined,
    fontSize: 9,
    fontFamily: "Outfit",
    flex: 1,
  },
  refreshBtn: {
    padding: 4,
  },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 8,
  },
  sectionHeaderText: {
    fontSize: 10,
    fontFamily: "Outfit",
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  sectionHeaderLine: {
    flex: 1,
    height: 1,
  },

  // Data grid
  dataGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  dataTile: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
  },
  dataTileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  dataTileLabel: {
    color: undefined,
    fontSize: 10,
    fontFamily: "Outfit",
    fontWeight: "600",
  },
  dataTileValue: {
    color: undefined,
    fontSize: 13,
    fontFamily: "Outfit",
    fontWeight: "700",
  },

  // Fault explanation
  faultBox: {
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  faultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  faultTitle: {
    fontSize: 11,
    fontFamily: "Outfit",
    fontWeight: "700",
    flex: 1,
  },
  faultBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  faultBadgeText: {
    fontSize: 8,
    fontFamily: "Outfit",
    fontWeight: "700",
  },
  faultReason: {
    fontSize: 10,
    fontFamily: "Outfit",
    color: "rgba(255,255,255,0.6)",
    lineHeight: 14,
  },

  // Hourly chart
  hourlyChart: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 80,
    gap: 2,
    marginTop: 4,
  },
  hourlyBar: {
    flex: 1,
    height: "100%",
    justifyContent: "flex-end",
  },
  hourlyBarFill: {
    borderRadius: 3,
    minHeight: 2,
  },

  // History rows
  historyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  historyLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  historyTime: {
    color: undefined,
    fontSize: 11,
    fontFamily: "Outfit",
  },
  historyRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  historyPower: {
    color: undefined,
    fontSize: 12,
    fontFamily: "Outfit",
    fontWeight: "600",
  },
  historyEnergy: {
    color: undefined,
    fontSize: 11,
    fontFamily: "Outfit",
  },

  // Empty
  emptyText: {
    color: undefined,
    fontSize: 11,
    fontFamily: "Outfit",
    textAlign: "center",
    paddingVertical: 20,
  },
});
