import { useTheme } from "@/hooks/use-theme";
import { useEnergy } from "@/context/EnergyContext";
import { Activity, ArrowLeft, BarChart2, CalendarDays, Edit3, History, RefreshCw, Save, Sparkles } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { isLight, ...theme } = useTheme();
  const { swapChangeover, activeMeter, meters, home, setManualBaseline, setLastMonthTotal, addManualLog } = useEnergy();
  
  const [meter1Baseline, setMeter1Baseline] = useState("");
  const [meter2Baseline, setMeter2Baseline] = useState("");
  const [savingBaselines, setSavingBaselines] = useState(false);
  
  const [meter1Reading, setMeter1Reading] = useState("");
  const [meter2Reading, setMeter2Reading] = useState("");
  const [savingReadings, setSavingReadings] = useState(false);
  
  const [lastMonthInput, setLastMonthInput] = useState("");
  const [savingLastMonth, setSavingLastMonth] = useState(false);

  useEffect(() => {
    if (!meter1Baseline) setMeter1Baseline(String((meters.meter1.reading - (meters.meter1.cycleUsage || 0)).toFixed(2)));
    if (!meter2Baseline) setMeter2Baseline(String((meters.meter2.reading - (meters.meter2.cycleUsage || 0)).toFixed(2)));
  }, [meters.meter1.reading, meters.meter1.cycleUsage, meters.meter2.reading, meters.meter2.cycleUsage]);

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
    <View style={[s.screen, { backgroundColor: theme.screenBg }]}>
      <ScrollView contentContainerStyle={[s.container, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
        
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <View style={s.backBtn}>
              <ArrowLeft size={20} color="#F4F8FC" />
            </View>
            <View>
              <Text style={[s.title, { color: theme.text }]}>Settings</Text>
              <Text style={s.subtitle}>Manage changeover & billing-cycle baselines</Text>
            </View>
          </View>
          <View style={s.headerRight}>
            <View style={s.updatePill}>
              <View style={s.updateDot} />
              <Text style={s.updateText}>Updated 10s ago</Text>
            </View>
            <View style={s.refreshBtn}>
              <RefreshCw size={16} color="#F4F8FC" />
            </View>
          </View>
        </View>

        {/* Changeover Control */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <RefreshCw size={14} color="#32E56B" />
            <Text style={[s.sectionTitle, { color: theme.textSecondary }]}>CHANGEOVER CONTROL</Text>
          </View>
          <View style={[s.card, { borderColor: theme.cardBorder, backgroundColor: theme.card }]}>
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
              <View style={s.changeoverSep} />
              <View style={s.changeoverRight}>
                <Text style={[s.aboutTitle, { color: theme.text }]}>About Changeover</Text>
                <Text style={[s.aboutDesc, { color: theme.textSecondary }]}>Switch between meters to control which meter records the consumption.</Text>
                <Pressable style={s.swapBtn} onPress={handleSwap}>
                  <RefreshCw size={14} color="#32E56B" />
                  <Text style={[s.swapBtnText, { color: theme.text }]}>Swap Source</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>

        {/* Billing Cycle Baselines */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <CalendarDays size={14} color="#6791E4" />
            <Text style={[s.sectionTitle, { color: theme.textSecondary }]}>BILLING CYCLE BASELINES</Text>
          </View>
          
          <View style={s.baselineCardWrapper}>
            <View style={s.cardHighlight} />
            <View style={[s.card, s.blueCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <View style={s.baselineContentRow}>
                
                <View style={s.baselineLeft}>
                  <View style={s.baselineHeaderRow}>
                    <View style={s.calendarIconBox}>
                      <CalendarDays size={20} color="#4A85FF" />
                      <Text style={s.calendarIconNum}>28</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.whiteCardTitle}>Meter readings on the 28th</Text>
                      <Text style={s.grayCardDesc}>Enter the physical readings from your bill. Both values anchor the current monthly cycle.</Text>
                      <Text style={s.blueCycleText}>Billing cycle starts on the 28th of every month</Text>
                    </View>
                  </View>

                  <View style={s.inputRow}>
                    <View style={s.inputWrapper}>
                      <Text style={[s.inputLabel, { color: theme.textSecondary }]}>Meter 1 (Analog)</Text>
                      <View style={s.inputContainer}>
                        <TextInput value={meter1Baseline} onChangeText={setMeter1Baseline} keyboardType="decimal-pad" style={[s.inputField, { color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.inputBorder, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, height: 38 }]} placeholder="0.00" placeholderTextColor={isLight ? "rgba(15,23,42,0.3)" : "rgba(255,255,255,0.2)"} />
                        <Edit3 size={14} color="#4A85FF" />
                      </View>
                    </View>
                    <View style={s.inputWrapper}>
                      <Text style={[s.inputLabel, { color: theme.textSecondary }]}>Meter 2 (Digital)</Text>
                      <View style={s.inputContainer}>
                        <TextInput value={meter2Baseline} onChangeText={setMeter2Baseline} keyboardType="decimal-pad" style={[s.inputField, { color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.inputBorder, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, height: 38 }]} placeholder="0.00" placeholderTextColor={isLight ? "rgba(15,23,42,0.3)" : "rgba(255,255,255,0.2)"} />
                        <Edit3 size={14} color="#4A85FF" />
                      </View>
                    </View>
                  </View>

                  <Pressable style={[s.primaryBtn, { backgroundColor: '#1A5CE5' }, savingBaselines && s.btnDisabled]} onPress={handleSaveBaselines} disabled={savingBaselines}>
                    <Save size={16} color="#FFF" />
                    <Text style={[s.primaryBtnText, { color: "#FFF" }]}>{savingBaselines ? "Saving…" : "Save 28th baselines"}</Text>
                  </Pressable>
                </View>

                {/* Right side illustration simulation */}
                <View style={s.baselineRight}>
                  <View style={s.illustrationMock}>
                    <View style={s.illDoc}>
                      <Activity size={24} color="#4A85FF" />
                      <View style={s.illLine} />
                      <View style={[s.illLine, { width: '60%' }]} />
                      <View style={s.illLine} />
                    </View>
                    <View style={s.illCal}>
                      <Text style={s.illCalText}>28</Text>
                    </View>
                    {/* Stars */}
                    <View style={[s.star, { top: 10, left: 10 }]} />
                    <View style={[s.star, { top: 30, right: 30 }]} />
                    <View style={[s.star, { top: 60, left: 40 }]} />
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Manual Meter Readings */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Activity size={14} color="#A78BFA" />
            <Text style={[s.sectionTitle, { color: theme.textSecondary }]}>MANUAL METER READINGS</Text>
          </View>

          <View style={s.readingsRow}>
            {/* Main Log Card */}
            <View style={[s.card, s.purpleCard, { flex: 2, backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <View style={s.logHeaderRow}>
                <View style={s.purpleIconBox}>
                  <Activity size={18} color="#B69AFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.whiteCardTitle}>Log current readings</Text>
                  <Text style={s.grayCardDesc}>Enter the latest physical readings from both meters.</Text>
                </View>
                <Pressable style={s.historyBtn}>
                  <History size={12} color="#B69AFF" />
                  <Text style={s.historyBtnText}>History</Text>
                </Pressable>
              </View>

              <View style={s.inputRow}>
                <View style={s.inputWrapper}>
                  <Text style={[s.inputLabel, { color: theme.textSecondary }]}>Meter 1 (Analog)</Text>
                  <View style={s.inputContainer}>
                    <TextInput value={meter1Reading} onChangeText={setMeter1Reading} keyboardType="decimal-pad" style={[s.inputField, { color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.inputBorder, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, height: 38 }]} placeholder={meters.meter1.reading.toFixed(1)} placeholderTextColor={isLight ? "rgba(15,23,42,0.3)" : "rgba(255,255,255,0.2)"} />
                    <Edit3 size={14} color="#B69AFF" />
                  </View>
                </View>
                <View style={s.inputWrapper}>
                  <Text style={[s.inputLabel, { color: theme.textSecondary }]}>Meter 2 (Digital)</Text>
                  <View style={s.inputContainer}>
                    <TextInput value={meter2Reading} onChangeText={setMeter2Reading} keyboardType="decimal-pad" style={[s.inputField, { color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.inputBorder, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, height: 38 }]} placeholder={meters.meter2.reading.toFixed(1)} placeholderTextColor={isLight ? "rgba(15,23,42,0.3)" : "rgba(255,255,255,0.2)"} />
                    <Edit3 size={14} color="#B69AFF" />
                  </View>
                </View>
              </View>

              <Pressable style={[s.primaryBtn, { backgroundColor: '#4C2882' }, savingReadings && s.btnDisabled]} onPress={handleSaveReadings} disabled={savingReadings}>
                <Save size={16} color="#FFF" />
                <Text style={[s.primaryBtnText, { color: "#FFF" }]}>{savingReadings ? "Saving…" : "Log readings"}</Text>
              </Pressable>
            </View>

            {/* Last Logged Card */}
            <View style={[s.card, { flex: 1, backgroundColor: theme.card, borderColor: theme.cardBorder, justifyContent: 'center' }]}>
              <View style={s.lastLoggedHeader}>
                <History size={12} color="#7E91A6" />
                <Text style={s.lastLoggedLabel}>Last Logged</Text>
              </View>
              <Text style={s.lastLoggedDate}>Jul 21, 2025</Text>
              <Text style={s.lastLoggedTime}>3:02 PM</Text>

              <View style={s.lastLoggedDivider} />

              <Text style={s.diffLabel}>Difference</Text>
              <Text style={s.diffValue}>44492.9</Text>
              <Text style={s.diffUnit}>units</Text>
            </View>
          </View>
        </View>

        {/* Last Month Total */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <BarChart2 size={14} color="#32E56B" />
            <Text style={[s.sectionTitle, { color: theme.textSecondary }]}>LAST MONTH TOTAL</Text>
          </View>

          <View style={[s.card, s.greenCard, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
            <View style={s.lastMonthRow}>
              
              <View style={s.lastMonthLeft}>
                <View style={s.lastMonthHeader}>
                  <View style={s.greenChartIcon}>
                    <BarChart2 size={18} color="#32E56B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.whiteCardTitle}>Units used last billing cycle</Text>
                    <Text style={s.grayCardDesc}>Manually set the total units used last month for trend comparison. Overrides auto-calculated value.</Text>
                  </View>
                </View>

                <View style={s.inputWrapper}>
                  <Text style={[s.inputLabel, { color: theme.textSecondary }]}>Total units</Text>
                  <View style={s.inputContainer}>
                    <TextInput value={lastMonthInput} onChangeText={setLastMonthInput} keyboardType="decimal-pad" style={[s.inputField, { color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.inputBorder, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, height: 38 }]} placeholder={home?.lastMonthTotal != null ? String(Math.round(home.lastMonthTotal)) : "0"} placeholderTextColor={isLight ? "rgba(15,23,42,0.3)" : "rgba(255,255,255,0.2)"} />
                  </View>
                </View>

                <Pressable style={[s.primaryBtn, { backgroundColor: '#164831' }, savingLastMonth && s.btnDisabled]} onPress={handleSaveLastMonth} disabled={savingLastMonth}>
                  <Save size={16} color="#32E56B" />
                  <Text style={[s.primaryBtnText, { color: '#32E56B' }]}>{savingLastMonth ? "Saving…" : "Save last month total"}</Text>
                </Pressable>
              </View>

              <View style={s.lastMonthSep} />

              <View style={s.lastMonthRight}>
                <View style={s.aiTrendHeader}>
                  <Sparkles size={12} color="#32E56B" />
                  <Text style={s.aiTrendTitle}>AI Trend Impact</Text>
                </View>
                
                <View style={s.aiTrendContent}>
                  <View>
                    <Text style={s.aiImpactValue}>0.0</Text>
                    <Text style={s.aiImpactUnit}>units</Text>
                    <Text style={s.aiImpactDesc}>Impact on forecast</Text>
                  </View>
                  <View style={s.trendGauge}>
                    <Svg width={56} height={32} viewBox="0 0 100 50">
                      <Path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" strokeLinecap="round" />
                      <Path d="M 10 50 A 40 40 0 0 1 50 10" fill="none" stroke="#4A85FF" strokeWidth="8" strokeLinecap="round" />
                      <Path d="M 50 10 A 40 40 0 0 1 90 50" fill="none" stroke="#B69AFF" strokeWidth="8" strokeLinecap="round" />
                      <Circle cx="50" cy="50" r="4" fill="#32E56B" />
                    </Svg>
                    <Text style={s.gaugeLabel}>Neutral</Text>
                    <Text style={s.gaugeSub}>No impact yet</Text>
                  </View>
                </View>
              </View>

            </View>
          </View>
        </View>
      </ScrollView>
    </View>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: undefined,
    fontFamily: "Outfit",
    fontSize: 20,
    fontWeight: "700",
  },
  subtitle: {
    color: undefined,
    fontFamily: "Outfit",
    fontSize: 11,
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  updatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 16,
  },
  updateDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#32E56B',
  },
  updateText: {
    color: undefined,
    fontFamily: "Outfit",
    fontSize: 9,
  },
  refreshBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
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
    borderWidth: 1,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(50,229,107,0.3)',
    borderRadius: 8,
    paddingVertical: 7,
  },
  swapBtnText: {
    color: '#32E56B',
    fontFamily: "Outfit",
    fontSize: 11,
    fontWeight: "600",
  },

  // Baselines specific
  baselineCardWrapper: {
    position: 'relative',
    borderRadius: 14,
    overflow: 'hidden',
  },
  cardHighlight: {
    position: 'absolute',
    top: 0, left: 0, right: 0, height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    zIndex: 10,
  },
  blueCard: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(74,133,255,0.15)',
  },
  baselineContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  baselineLeft: {
    flex: 2.5,
    paddingRight: 12,
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
    color: '#4A85FF',
    fontFamily: "Outfit",
    fontSize: 9,
    fontWeight: "500",
  },
  baselineRight: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustrationMock: {
    width: 80,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  illDoc: {
    width: 56, height: 72,
    backgroundColor: 'rgba(74,133,255,0.1)',
    borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(74,133,255,0.2)',
    padding: 8,
    transform: [{ rotate: '-10deg' }],
  },
  illLine: {
    width: '100%', height: 4,
    backgroundColor: 'rgba(74,133,255,0.2)',
    borderRadius: 2,
    marginTop: 6,
  },
  illCal: {
    position: 'absolute',
    bottom: 5, right: -5,
    width: 38, height: 38,
    backgroundColor: '#1E3A8A',
    borderRadius: 6,
    borderTopWidth: 4, borderTopColor: '#3B82F6',
    alignItems: 'center', justifyContent: 'center',
    transform: [{ rotate: '5deg' }],
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 3,
  },
  illCalText: {
    color: '#FFF',
    fontFamily: "Outfit",
    fontSize: 15,
    fontWeight: "700",
  },
  star: {
    position: 'absolute',
    width: 4, height: 4,
    backgroundColor: '#93C5FD',
    borderRadius: 2,
    opacity: 0.6,
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
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 42,
  },
  inputField: {
    flex: 1,
    color: undefined,
    fontFamily: "Outfit",
    fontSize: 13,
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
  readingsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  purpleCard: {
    backgroundColor: '#161122',
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
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: 'rgba(182,154,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(182,154,255,0.1)',
  },
  historyBtnText: {
    color: '#B69AFF',
    fontFamily: "Outfit",
    fontSize: 9,
    fontWeight: "600",
  },
  
  // Last Logged
  lastLoggedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 5,
  },
  lastLoggedLabel: {
    color: undefined,
    fontFamily: "Outfit",
    fontSize: 9,
  },
  lastLoggedDate: {
    color: undefined,
    fontFamily: "Outfit",
    fontSize: 12,
    fontWeight: "600",
  },
  lastLoggedTime: {
    color: undefined,
    fontFamily: "Outfit",
    fontSize: 10,
    marginTop: 1,
  },
  lastLoggedDivider: {
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 10,
  },
  diffLabel: {
    color: undefined,
    fontFamily: "Outfit",
    fontSize: 8,
    fontWeight: "500",
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  diffValue: {
    color: '#B69AFF',
    fontFamily: "Outfit",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 3,
  },
  diffUnit: {
    color: undefined,
    fontFamily: "Outfit",
    fontSize: 9,
  },

  // Last Month
  greenCard: {
    backgroundColor: '#0C1613',
    borderColor: 'rgba(50,229,107,0.1)',
  },
  lastMonthRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  lastMonthLeft: {
    flex: 1.5,
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
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 14,
  },
  lastMonthRight: {
    flex: 1,
    justifyContent: 'center',
  },
  aiTrendHeader: {
    flexDirection: 'row',
    alignItems: 'center',
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
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
  }
});
