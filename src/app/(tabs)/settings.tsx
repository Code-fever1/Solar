import { GlassCard } from "@/components/GlassCard";
import { SceneBackground } from "@/components/SceneBackground";
import { TabSlideWrapper } from "@/components/TabSlideWrapper";
import { useEnergy } from "@/context/EnergyContext";
import { useSceneTheme } from "@/context/SceneThemeContext";
import { stopOverlay } from "@/native/FloatingOverlay";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { Activity, BarChart2, CalendarDays, Edit3, Eye, EyeOff, RefreshCw, Save, Sparkles } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";

const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const OVERLAY_ENABLED_KEY = "overlayEnabled";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { isLight, ...theme } = useSceneTheme();
  const { swapChangeover, activeMeter, meters, home, setManualBaseline, setLastMonthTotal, addManualLog, manualLogs } = useEnergy();

  // Installed version
  const installedVersion = `v${Application.nativeApplicationVersion || "1.0.0"}`;

  // 28th baselines — pre-filled with current baseline, locked until Edit pressed
  const baseline1 = meters.meter1.reading - (meters.meter1.cycleUsage || 0);
  const baseline2 = meters.meter2.reading - (meters.meter2.cycleUsage || 0);
  const [meter1Baseline, setMeter1Baseline] = useState(String(baseline1.toFixed(2)));
  const [meter2Baseline, setMeter2Baseline] = useState(String(baseline2.toFixed(2)));
  const [editingBaselines, setEditingBaselines] = useState(false);
  const [savingBaselines, setSavingBaselines] = useState(false);

  // Keep baseline fields in sync when meter data loads
  useEffect(() => {
    if (!editingBaselines) {
      setMeter1Baseline(String(baseline1.toFixed(2)));
      setMeter2Baseline(String(baseline2.toFixed(2)));
    }
  }, [baseline1, baseline2, editingBaselines]);

  // Manual readings — always empty, user enters new values
  const [meter1Reading, setMeter1Reading] = useState("");
  const [meter2Reading, setMeter2Reading] = useState("");
  const [savingReadings, setSavingReadings] = useState(false);

  // Last logged reading per meter (from manualLogs)
  const lastLog1 = manualLogs.filter(l => l.meterId === 'meter1').sort((a, b) => b.timestamp - a.timestamp)[0];
  const lastLog2 = manualLogs.filter(l => l.meterId === 'meter2').sort((a, b) => b.timestamp - a.timestamp)[0];

  const [lastMonthInput, setLastMonthInput] = useState("");
  const [savingLastMonth, setSavingLastMonth] = useState(false);

  // Floating overlay toggle — persisted in AsyncStorage. Default OFF so the
  // overlay only appears when the user explicitly enables it.
  const [overlayEnabled, setOverlayEnabled] = useState(false);
  useEffect(() => {
    void AsyncStorage.getItem(OVERLAY_ENABLED_KEY).then((v) => {
      setOverlayEnabled(v === "true");
    }).catch(() => undefined);
  }, []);
  const toggleOverlay = () => {
    const next = !overlayEnabled;
    setOverlayEnabled(next);
    void AsyncStorage.setItem(OVERLAY_ENABLED_KEY, String(next)).catch(() => undefined);
    if (!next) {
      // Immediately stop the overlay if it's currently running
      void stopOverlay().catch(() => undefined);
    }
  };

  // AI Trend Impact: compares this month's projected usage against last month's
  // total to show how the trend affects the forecast.
  const trendImpact = useMemo(() => {
    const lastMonth = home?.lastMonthTotal;
    const projected = home?.projectedMonthly ?? 0;
    if (lastMonth == null || lastMonth <= 0 || projected <= 0) {
      return {
        units: "0.0",
        label: "Impact on forecast",
        status: "Neutral",
        subLabel: "Set last month's total to see impact",
        gaugeX: 50, gaugeY: 50, gaugeColor: theme.textMuted,
      };
    }
    const delta = round(projected - lastMonth, 1);
    const pct = (delta / lastMonth) * 100;
    const absDelta = Math.abs(delta);
    // Gauge: semicircle from (10,50) to (90,50), center (50,50), radius 40.
    // Map -50%..+50% to 180°..0° (left = saving, right = over).
    const clampedPct = Math.max(-50, Math.min(50, pct));
    const angleDeg = 180 - ((clampedPct + 50) / 100) * 180;
    const angleRad = (angleDeg * Math.PI) / 180;
    const gx = 50 + 40 * Math.cos(angleRad);
    const gy = 50 - 40 * Math.sin(angleRad);

    if (delta < -1) {
      return {
        units: `${absDelta.toFixed(1)}`,
        label: `Saving vs last month`,
        status: "Lower",
        subLabel: `${Math.abs(pct).toFixed(0)}% less than last month`,
        gaugeX: gx, gaugeY: gy, gaugeColor: "#32E56B",
      };
    }
    if (delta > 1) {
      return {
        units: `+${absDelta.toFixed(1)}`,
        label: `Over vs last month`,
        status: "Higher",
        subLabel: `${pct.toFixed(0)}% more than last month`,
        gaugeX: gx, gaugeY: gy, gaugeColor: "#EF4C4C",
      };
    }
    return {
      units: "0.0",
      label: "Impact on forecast",
      status: "Neutral",
      subLabel: "On track with last month",
      gaugeX: 50, gaugeY: 10, gaugeColor: "#4A85FF",
    };
  }, [home?.lastMonthTotal, home?.projectedMonthly]);

  const handleSwap = () => {
    swapChangeover();
    Alert.alert("Changeover Swapped", `Active meter is now ${activeMeter === 'meter1' ? 'Meter 2 (Digital)' : 'Meter 1 (Analog)'}`);
  };

  const handleSaveBaselines = async () => {
    const meter1 = Number(meter1Baseline);
    const meter2 = Number(meter2Baseline);
    if (!Number.isFinite(meter1) || meter1 < 0 || !Number.isFinite(meter2) || meter2 < 0) {
      Alert.alert("Check baseline units", "Enter a valid non-negative meter reading for both meters.");
      return;
    }
    setSavingBaselines(true);
    try {
      await setManualBaseline("meter1", meter1, Date.now());
      await setManualBaseline("meter2", meter2, Date.now());
      Alert.alert("Baselines saved", "Both meter baselines are set for the billing cycle.");
      setEditingBaselines(false);
    } catch {
      Alert.alert("Could not save baselines", "Check the server connection and try again.");
    } finally {
      setSavingBaselines(false);
    }
  };

  const handleSaveReadings = async () => {
    const m1 = Number(meter1Reading);
    const m2 = Number(meter2Reading);
    const hasM1 = Number.isFinite(m1) && m1 >= 0;
    const hasM2 = Number.isFinite(m2) && m2 >= 0;
    if (!hasM1 && !hasM2) {
      Alert.alert("Enter a reading", "Enter at least one meter reading to log.");
      return;
    }
    setSavingReadings(true);
    try {
      if (hasM1) await addManualLog("meter1", m1, Date.now(), "Manual reading from settings");
      if (hasM2) await addManualLog("meter2", m2, Date.now(), "Manual reading from settings");
      Alert.alert("Readings logged", "Manual readings have been recorded.");
      setMeter1Reading("");
      setMeter2Reading("");
    } catch {
      Alert.alert("Could not save readings", "Check the server connection and try again.");
    } finally {
      setSavingReadings(false);
    }
  };

  const handleSaveLastMonth = async () => {
    const total = Number(lastMonthInput);
    if (!Number.isFinite(total) || total < 0) {
      Alert.alert("Check units", "Enter a valid non-negative number of units.");
      return;
    }
    setSavingLastMonth(true);
    try {
      await setLastMonthTotal(total);
      Alert.alert("Last month total saved", `${total} units set as last month's usage.`);
      setLastMonthInput("");
    } catch {
      Alert.alert("Could not save", "Check the server connection and try again.");
    } finally {
      setSavingLastMonth(false);
    }
  };

  return (
    <TabSlideWrapper index={4}>
    <View style={s.screen}>
      <SceneBackground />
      <ScrollView contentContainerStyle={[s.container, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
        
        {/* Header */}
        <View style={s.header}>
          <View style={s.versionBadge}>
            <Text style={[s.versionText, { color: theme.textSecondary }]}>{installedVersion}</Text>
          </View>
          <Text style={[s.title, { color: theme.text }]}>Settings</Text>
          <Text style={[s.subtitle, { color: theme.textSecondary }]}>Changeover control, baselines & manual calibration</Text>
        </View>

        {/* Changeover Control */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <RefreshCw size={14} color="#32E56B" />
            <Text style={[s.sectionTitle, { color: theme.textSecondary }]}>CHANGEOVER CONTROL</Text>
          </View>
          <GlassCard style={s.card}>
            <View style={s.changeoverRow}>
              <View style={s.changeoverLeft}>
                <View style={s.changeoverIcon}>
                  <RefreshCw size={20} color="#32E56B" />
                </View>
                <View>
                  <Text style={[s.cardLabelText, { color: theme.textSecondary }]}>Active Source</Text>
                  <Text style={[s.changeoverActiveText, { color: theme.text }]}>
                    {activeMeter === 'meter1' ? 'Meter 1 (Analog)' : 'Meter 2 (Digital)'}
                  </Text>
                  <View style={s.activeBadge}>
                    <View style={s.activeDot} />
                    <Text style={[s.activeBadgeText, { color: theme.textSecondary }]}>Currently Active</Text>
                  </View>
                </View>
              </View>
              <View style={[s.changeoverSep, { backgroundColor: theme.border }]} />
              <View style={s.changeoverRight}>
                <Text style={[s.aboutTitle, { color: theme.text }]}>About Changeover</Text>
                <Text style={[s.aboutDesc, { color: theme.textSecondary }]}>Switch between meters to control which meter records the consumption.</Text>
                <Pressable style={s.swapBtn} onPress={handleSwap}>
                  <BlurView
                    intensity={30}
                    tint="dark"
                    style={StyleSheet.absoluteFill}
                    blurMethod={Platform.OS === "android" ? "none" : undefined}
                  />
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(50,229,107,0.10)" }]} />
                  <View style={s.swapBtnBorder} />
                  <View style={s.swapBtnContent}>
                    <RefreshCw size={18} color="#32E56B" />
                    <Text style={s.swapBtnText}>Swap Source</Text>
                  </View>
                </Pressable>
              </View>
            </View>
          </GlassCard>
        </View>

        {/* Billing Cycle Baselines */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <CalendarDays size={14} color="#6791E4" />
            <Text style={[s.sectionTitle, { color: theme.textSecondary }]}>BILLING CYCLE BASELINES</Text>
          </View>
          
          <GlassCard style={[s.card, s.blueCard]}>
              <View style={s.baselineHeaderRow}>
                <View style={s.calendarIconBox}>
                  <CalendarDays size={20} color="#4A85FF" />
                  <Text style={s.calendarIconNum}>28</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.whiteCardTitle, { color: theme.text }]}>Meter readings on the 28th</Text>
                  <Text style={[s.grayCardDesc, { color: theme.textSecondary }]}>Physical readings from your bill that anchor the current monthly cycle.</Text>
                  <Text style={s.blueCycleText}>Billing cycle starts on the 28th of every month</Text>
                </View>
              </View>

              <View style={s.inputRow}>
                <View style={s.inputWrapper}>
                  <Text style={[s.inputLabel, { color: theme.textSecondary }]}>Meter 1 (Analog)</Text>
                  <View style={s.inputContainer}>
                    <TextInput
                      value={meter1Baseline}
                      onChangeText={setMeter1Baseline}
                      keyboardType="decimal-pad"
                      style={s.inputField}
                      editable={editingBaselines}
                      underlineColorAndroid="transparent"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                    />
                    {editingBaselines && <Edit3 size={14} color="#4A85FF" />}
                  </View>
                </View>
                <View style={s.inputWrapper}>
                  <Text style={[s.inputLabel, { color: theme.textSecondary }]}>Meter 2 (Digital)</Text>
                  <View style={s.inputContainer}>
                    <TextInput
                      value={meter2Baseline}
                      onChangeText={setMeter2Baseline}
                      keyboardType="decimal-pad"
                      style={s.inputField}
                      editable={editingBaselines}
                      underlineColorAndroid="transparent"
                      placeholderTextColor="rgba(255,255,255,0.2)"
                    />
                    {editingBaselines && <Edit3 size={14} color="#4A85FF" />}
                  </View>
                </View>
              </View>

              {editingBaselines ? (
                <Pressable style={[s.primaryBtn, { backgroundColor: '#1A5CE5' }, savingBaselines && s.btnDisabled]} onPress={handleSaveBaselines} disabled={savingBaselines}>
                  <Save size={16} color="#FFF" />
                  <Text style={[s.primaryBtnText, { color: "#FFF" }]}>{savingBaselines ? "Saving…" : "Save 28th baselines"}</Text>
                </Pressable>
              ) : (
                <Pressable style={s.editBtn} onPress={() => setEditingBaselines(true)}>
                  <Edit3 size={15} color="#4A85FF" />
                  <Text style={s.editBtnText}>Edit baselines</Text>
                </Pressable>
              )}
            </GlassCard>
        </View>

        {/* Manual Meter Readings */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Activity size={14} color="#A78BFA" />
            <Text style={[s.sectionTitle, { color: theme.textSecondary }]}>MANUAL METER READINGS</Text>
          </View>

          <GlassCard style={[s.card, s.purpleCard]}>
            <View style={s.logHeaderRow}>
              <View style={s.purpleIconBox}>
                <Activity size={18} color="#B69AFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.whiteCardTitle, { color: theme.text }]}>Log current readings</Text>
                <Text style={[s.grayCardDesc, { color: theme.textSecondary }]}>Enter the latest physical readings from both meters.</Text>
              </View>
            </View>

            {/* Meter 1 */}
            <View style={s.meterInputBlock}>
              <Text style={[s.meterNameText, { color: theme.text }]}>Meter 1 (Analog)</Text>
              <View style={s.inputContainer}>
                <TextInput
                  value={meter1Reading}
                  onChangeText={setMeter1Reading}
                  keyboardType="decimal-pad"
                  style={s.inputField}
                  underlineColorAndroid="transparent"
                  placeholder={`Current: ${meters.meter1.reading.toFixed(1)} kWh`}
                  placeholderTextColor="rgba(255,255,255,0.25)"
                />
                <Edit3 size={14} color="#B69AFF" />
              </View>
              {lastLog1 && (
                <Text style={s.lastLoggedSubText}>
                  Last logged: {lastLog1.reading.toFixed(1)} kWh · {new Date(lastLog1.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Text>
              )}
            </View>

            {/* Meter 2 */}
            <View style={s.meterInputBlock}>
              <Text style={[s.meterNameText, { color: theme.text }]}>Meter 2 (Digital)</Text>
              <View style={s.inputContainer}>
                <TextInput
                  value={meter2Reading}
                  onChangeText={setMeter2Reading}
                  keyboardType="decimal-pad"
                  style={s.inputField}
                  underlineColorAndroid="transparent"
                  placeholder={`Current: ${meters.meter2.reading.toFixed(1)} kWh`}
                  placeholderTextColor="rgba(255,255,255,0.25)"
                />
                <Edit3 size={14} color="#B69AFF" />
              </View>
              {lastLog2 && (
                <Text style={s.lastLoggedSubText}>
                  Last logged: {lastLog2.reading.toFixed(1)} kWh · {new Date(lastLog2.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Text>
              )}
            </View>

            <Pressable style={[s.primaryBtn, { backgroundColor: '#4C2882' }, savingReadings && s.btnDisabled]} onPress={handleSaveReadings} disabled={savingReadings}>
              <Save size={16} color="#FFF" />
              <Text style={[s.primaryBtnText, { color: "#FFF" }]}>{savingReadings ? "Saving…" : "Log readings"}</Text>
            </Pressable>
          </GlassCard>
        </View>

        {/* Last Month Total */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <BarChart2 size={14} color="#32E56B" />
            <Text style={[s.sectionTitle, { color: theme.textSecondary }]}>LAST MONTH TOTAL</Text>
          </View>

          <GlassCard style={[s.card, s.greenCard]}>
            <View style={s.lastMonthRow}>
              
              <View style={s.lastMonthLeft}>
                <View style={s.lastMonthHeader}>
                  <View style={s.greenChartIcon}>
                    <BarChart2 size={18} color="#32E56B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.whiteCardTitle, { color: theme.text }]}>Units used last billing cycle</Text>
                    <Text style={[s.grayCardDesc, { color: theme.textSecondary }]}>Manually set the total units used last month for trend comparison. Overrides auto-calculated value.</Text>
                  </View>
                </View>

                <View style={s.inputWrapper}>
                  <Text style={[s.inputLabel, { color: theme.textSecondary }]}>Total units</Text>
                  <View style={s.inputContainer}>
                    <TextInput value={lastMonthInput} onChangeText={setLastMonthInput} keyboardType="decimal-pad" style={s.inputField} underlineColorAndroid="transparent" placeholder={home?.lastMonthTotal != null ? String(Math.round(home.lastMonthTotal)) : "0"} placeholderTextColor="rgba(255,255,255,0.2)" />
                  </View>
                </View>

                <Pressable style={[s.primaryBtn, { backgroundColor: '#164831' }, savingLastMonth && s.btnDisabled]} onPress={handleSaveLastMonth} disabled={savingLastMonth}>
                  <Save size={16} color="#32E56B" />
                  <Text style={[s.primaryBtnText, { color: '#32E56B' }]}>{savingLastMonth ? "Saving…" : "Save last month total"}</Text>
                </Pressable>
              </View>

              <View style={[s.lastMonthSep, { backgroundColor: theme.border }]} />

              <View style={s.lastMonthRight}>
                <View style={s.aiTrendHeader}>
                  <Sparkles size={12} color="#32E56B" />
                  <Text style={s.aiTrendTitle}>AI Trend Impact</Text>
                </View>

                <View style={s.aiTrendContent}>
                  <View>
                    <Text style={[s.aiImpactValue, { color: theme.text }]}>{trendImpact.units}</Text>
                    <Text style={[s.aiImpactUnit, { color: theme.textMuted }]}>units</Text>
                    <Text style={[s.aiImpactDesc, { color: theme.textSecondary }]}>{trendImpact.label}</Text>
                  </View>
                  <View style={s.trendGauge}>
                    <Svg width={56} height={32} viewBox="0 0 100 50">
                      <Path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke={isLight ? "rgba(15,23,42,0.06)" : "rgba(255,255,255,0.05)"} strokeWidth="8" strokeLinecap="round" />
                      <Path d="M 10 50 A 40 40 0 0 1 50 10" fill="none" stroke="#4A85FF" strokeWidth="8" strokeLinecap="round" />
                      <Path d="M 50 10 A 40 40 0 0 1 90 50" fill="none" stroke="#B69AFF" strokeWidth="8" strokeLinecap="round" />
                      <Circle cx={trendImpact.gaugeX} cy={trendImpact.gaugeY} r="4" fill={trendImpact.gaugeColor} />
                    </Svg>
                    <Text style={s.gaugeLabel}>{trendImpact.status}</Text>
                    <Text style={[s.gaugeSub, { color: theme.textMuted }]}>{trendImpact.subLabel}</Text>
                  </View>
                </View>
              </View>

            </View>
          </GlassCard>
        </View>

        {/* Floating Overlay Toggle */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            {overlayEnabled ? <Eye size={14} color="#F8C653" /> : <EyeOff size={14} color="#8A9BAE" />}
            <Text style={[s.sectionTitle, { color: theme.textSecondary }]}>FLOATING OVERLAY</Text>
          </View>
          <GlassCard style={[s.card, s.overlayCard]}>
            <View style={s.overlayRow}>
              <View style={s.overlayLeft}>
                <View style={[s.overlayIconBox, { backgroundColor: overlayEnabled ? "rgba(248,198,83,0.12)" : "rgba(138,155,174,0.08)", borderColor: overlayEnabled ? "rgba(248,198,83,0.25)" : "rgba(138,155,174,0.15)" }]}>
                  {overlayEnabled ? <Eye size={18} color="#F8C653" /> : <EyeOff size={18} color="#8A9BAE" />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.cardLabelText, { color: theme.text, fontSize: 13, fontWeight: "600" }]}>Live Data Overlay</Text>
                  <Text style={[s.aboutDesc, { color: theme.textSecondary }]}>
                    Show a floating widget with solar, home &amp; grid readings when the app is in the background.
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={toggleOverlay}
                style={[
                  s.toggleTrack,
                  { backgroundColor: overlayEnabled ? "#F8C653" : "rgba(138,155,174,0.18)" },
                ]}
              >
                <View style={[s.toggleThumb, { transform: [{ translateX: overlayEnabled ? 22 : 0 }] }]} />
              </Pressable>
            </View>
          </GlassCard>
        </View>

        {__DEV__ && (
          <View style={s.section}>
            <View style={s.sectionHeader}>
              <Edit3 size={14} color="#7DD3FC" />
              <Text style={[s.sectionTitle, { color: theme.textSecondary }]}>DEVELOPER</Text>
            </View>
            <Pressable
              onPress={() => router.push("/overlay-editor")}
            >
              <GlassCard style={s.card}>
                <Text style={[s.cardLabelText, { color: theme.text }]}>Hero Overlay Editor</Text>
                <Text style={[s.cardLabelText, { color: theme.textSecondary, marginTop: 4 }]}>
                  Visually tune SVG wiring paths per weather background
                </Text>
              </GlassCard>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
    </TabSlideWrapper>
  );
}

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: 'transparent', // Very dark background like image
  },
  container: {
    paddingHorizontal: 14,
    gap: 18,
  },
  
  // Header
  header: {
    alignItems: 'center',
    marginBottom: 8,
  },
  versionBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: "rgba(84,142,255,0.12)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(84,142,255,0.2)",
  },
  versionText: {
    fontFamily: "Outfit",
    fontSize: 11,
    fontWeight: "700",
  },
  title: {
    color: undefined,
    fontFamily: "Outfit",
    fontSize: 26,
    fontWeight: "700",
  },
  subtitle: {
    color: undefined,
    fontFamily: "Outfit",
    fontSize: 12,
    marginTop: 3,
    textAlign: "center",
  },

  // Sections
  section: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 2,
  },
  sectionTitle: {
    fontFamily: "Outfit",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  card: {
    borderRadius: 14,
    padding: 14,
  },

  // Changeover specific
  changeoverRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  changeoverLeft: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  changeoverIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(50,229,107,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(50,229,107,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabelText: {
    color: undefined,
    fontFamily: "Outfit",
    fontSize: 11,
    fontWeight: "500",
  },
  changeoverActiveText: {
    color: '#32E56B',
    fontFamily: "Outfit",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 2,
    marginBottom: 5,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#32E56B',
  },
  activeBadgeText: {
    color: undefined,
    fontFamily: "Outfit",
    fontSize: 9,
  },
  changeoverSep: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 14,
  },
  changeoverRight: {
    flex: 1,
    justifyContent: 'center',
  },
  aboutTitle: {
    color: undefined,
    fontFamily: "Outfit",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 4,
  },
  aboutDesc: {
    color: undefined,
    fontFamily: "Outfit",
    fontSize: 10,
    lineHeight: 14,
    marginBottom: 10,
  },
  swapBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  swapBtnBorder: {
    ...StyleSheet.absoluteFill,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(50,229,107,0.30)',
  },
  swapBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    zIndex: 1,
  },
  swapBtnText: {
    color: '#32E56B',
    fontFamily: "Outfit",
    fontSize: 14,
    fontWeight: "700",
  },

  // Baselines specific
  blueCard: {
    borderColor: 'rgba(74,133,255,0.15)',
  },
  baselineHeaderRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  calendarIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(74,133,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(74,133,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarIconNum: {
    color: '#4A85FF',
    fontFamily: "Outfit",
    fontSize: 10,
    fontWeight: "700",
    position: 'absolute',
    bottom: 8,
  },
  whiteCardTitle: {
    color: undefined,
    fontFamily: "Outfit",
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 3,
  },
  grayCardDesc: {
    color: undefined,
    fontFamily: "Outfit",
    fontSize: 10,
    lineHeight: 13,
    marginBottom: 6,
  },
  blueCycleText: {
    color: '#7BA8FF',
    fontFamily: "Outfit",
    fontSize: 11,
    fontWeight: "600",
    marginTop: 4,
  },
  // Edit button (for locked baselines)
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: 'rgba(74,133,255,0.3)',
    borderRadius: 10,
    paddingVertical: 11,
  },
  editBtnText: {
    color: '#7BA8FF',
    fontFamily: "Outfit",
    fontSize: 13,
    fontWeight: "600",
  },

  // Inputs
  inputRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  inputWrapper: {
    flex: 1,
    gap: 5,
  },
  inputLabel: {
    color: undefined,
    fontFamily: "Outfit",
    fontSize: 10,
    fontWeight: "500",
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 42,
  },
  inputField: {
    flex: 1,
    color: '#F4F8FC',
    fontFamily: "Outfit",
    fontSize: 13,
    paddingVertical: 0,
    height: 40,
    maxHeight: 40,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  
  // Buttons
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 42,
    borderRadius: 10,
  },
  primaryBtnText: {
    color: '#FFF',
    fontFamily: "Outfit",
    fontSize: 12,
    fontWeight: "600",
  },
  btnDisabled: {
    opacity: 0.6,
  },

  // Readings Section
  purpleCard: {
    borderColor: 'rgba(182,154,255,0.1)',
  },
  logHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 14,
  },
  purpleIconBox: {
    width: 36, height: 36,
    borderRadius: 9,
    backgroundColor: 'rgba(182,154,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  // Per-meter input block — stacked vertically to prevent overlap
  meterInputBlock: {
    marginBottom: 14,
  },
  meterNameText: {
    fontFamily: "Outfit",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
  },
  lastLoggedSubText: {
    color: '#8A9BAE',
    fontFamily: "Outfit",
    fontSize: 9,
    marginTop: 5,
  },

  // Last Month
  greenCard: {
    borderColor: 'rgba(50,229,107,0.1)',
  },
  lastMonthRow: {
    flexDirection: 'column',
    gap: 14,
  },
  lastMonthLeft: {
    width: '100%',
  },
  lastMonthHeader: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  greenChartIcon: {
    width: 36, height: 36,
    borderRadius: 9,
    backgroundColor: 'rgba(50,229,107,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  lastMonthSep: {
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  lastMonthRight: {
    width: '100%',
    alignItems: 'center',
  },
  aiTrendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginBottom: 10,
  },
  aiTrendTitle: {
    color: '#32E56B',
    fontFamily: "Outfit",
    fontSize: 10,
    fontWeight: "600",
  },
  aiTrendContent: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 20,
  },
  aiImpactValue: {
    color: undefined,
    fontFamily: "Outfit",
    fontSize: 16,
    fontWeight: "700",
  },
  aiImpactUnit: {
    color: undefined,
    fontFamily: "Outfit",
    fontSize: 9,
    marginTop: -2,
  },
  aiImpactDesc: {
    color: undefined,
    fontFamily: "Outfit",
    fontSize: 8,
    marginTop: 6,
  },
  trendGauge: {
    alignItems: 'center',
  },
  gaugeLabel: {
    color: '#32E56B',
    fontFamily: "Outfit",
    fontSize: 10,
    fontWeight: "600",
    marginTop: 3,
  },
  gaugeSub: {
    color: undefined,
    fontFamily: "Outfit",
    fontSize: 8,
  },

  // Floating Overlay toggle
  overlayCard: {
    borderColor: "rgba(248,198,83,0.12)",
  },
  overlayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  overlayLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  overlayIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    padding: 3,
    justifyContent: "center",
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
});
