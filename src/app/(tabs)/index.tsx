import { useEffect, useState } from "react";
import { StyleSheet, Text, View, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from 'react-native-reanimated';
import { MapPin, Sun, Moon, CloudRain, Cloud } from 'lucide-react-native';

import { BackgroundEngine } from "@/components/BackgroundEngine";
import { GlassPanel } from "@/components/GlassPanel";
import { RemainingUnitsHero } from "@/components/RemainingUnitsHero";
import { UsageStatisticsRow } from "@/components/UsageStatisticsRow";
import { AIAssistantPanel } from "@/components/AIAssistantPanel";
import { EnergyCore } from "@/components/EnergyCore";
import { MechanicalMeter } from "@/components/MechanicalMeter";
import { SmartMeter } from "@/components/SmartMeter";
import { BaselineOverrideModal } from "@/components/BaselineOverrideModal";
import { GlowButton } from "@/components/GlowButton";

import { Colors } from "@/constants/Colors";
import { useEnergy } from "@/context/EnergyContext";
import type { MeterId } from "@/context/energy-types";
import { getStartOfBillingCycle } from "@/utils/calculations";

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const { activeMeter, meters, home, setManualBaseline, learningProfiles } = useEnergy();
  
  const [baselineModalVisible, setBaselineModalVisible] = useState(false);
  const [baselineMeterId, setBaselineMeterId] = useState<MeterId | null>(null);

  const [currentTime, setCurrentTime] = useState(new Date());
  const [locationName, setLocationName] = useState<string>("Locating...");
  const [weatherCode, setWeatherCode] = useState<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetch('https://ipapi.co/json/')
      .then(r => r.json())
      .then(data => {
        const city = data.city || 'Bhakkar';
        setLocationName(city);
        const lat = data.latitude || 31.6269;
        const lon = data.longitude || 71.0645;
        
        return fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
      })
      .then(r => r.json())
      .then(wData => {
         if (wData?.current_weather) {
            setWeatherCode(wData.current_weather.weathercode);
         }
      })
      .catch(() => {
         setLocationName('Bhakkar');
         setWeatherCode(0); 
      });
  }, []);

  const m1State = meters.meter1;
  const m2State = meters.meter2;

  // Derive instant values for the EnergyCore directly from the Prediction Algorithm's output
  const activeState = activeMeter === 'meter1' ? m1State : m2State;
  
  // The prediction algorithm calculates exactly how fast the WAPDA meter is expected to be moving right now.
  const gridKw = Math.max(0, home.expectedDrawNow || 0);
  
  // Since we don't have live inverter telemetry hooked up to the frontend yet,
  // we simulate a generic house load by adding a rough solar estimate during the day.
  const currentHour = currentTime.getHours();
  const isDaytime = currentHour > 6 && currentHour < 18;
  const solarKw = isDaytime ? 1.2 : 0; 
  const loadKw = gridKw + solarKw;

  const h = currentTime.getHours();
  const m = currentTime.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 || 12;
  const timeString = `${displayH}:${m.toString().padStart(2, '0')} ${ampm}`;

  const getWeatherIcon = () => {
    if (weatherCode === null) return null;
    if (weatherCode === 0) return isDaytime ? <Sun size={14} color={Colors.dark.solar} /> : <Moon size={14} color={Colors.dark.textSecondary} />;
    if (weatherCode >= 1 && weatherCode <= 3) return <Cloud size={14} color={Colors.dark.textSecondary} />;
    if (weatherCode >= 51 && weatherCode <= 65) return <CloudRain size={14} color={Colors.dark.info} />;
    return <Cloud size={14} color={Colors.dark.textSecondary} />;
  };

  const greeting =
    currentHour >= 5 && currentHour < 12 ? 'Good Morning' :
    currentHour >= 12 && currentHour < 17 ? 'Good Afternoon' :
    currentHour >= 17 && currentHour < 21 ? 'Good Evening' :
    'Good Night';

  return (
    <View style={styles.screen}>
      <BackgroundEngine />
      
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Section */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.topSection}>
          <View>
            <Text style={styles.greeting}>{greeting}</Text>
            <View style={styles.weatherRow}>
              {getWeatherIcon()}
              <MapPin size={12} color={Colors.dark.textSecondary} style={{ marginLeft: 4 }} />
              <Text style={styles.locationText}>{locationName}</Text>
            </View>
            <Text style={styles.time}>{timeString}</Text>
          </View>
          <View style={styles.statusPill}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>WAPDA ACTIVE</Text>
          </View>
        </Animated.View>

        {/* Priority 1: Usage Statistics */}
        <UsageStatisticsRow home={home} />

        {/* Priority 2: Monthly WAPDA Status */}
        <RemainingUnitsHero home={home} m1State={m1State} m2State={m2State} activeMeter={activeMeter} />

        {/* Priority 3: AI Assistant Section */}
        <Animated.View entering={FadeInDown.delay(300)}>
          <AIAssistantPanel home={home} activeProfile={learningProfiles[activeMeter]} />
        </Animated.View>



        {/* Priority 5: Meter Section */}
        <Animated.View entering={FadeInDown.delay(500)} style={styles.metersSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Physical Meters</Text>
            <GlowButton 
              label="Edit Baseline" 
              variant="secondary" 
              style={styles.smallBtn} 
              textStyle={{ fontSize: 10 }}
              onPress={() => { setBaselineMeterId(activeMeter); setBaselineModalVisible(true); }}
            />
          </View>

          <View style={styles.metersList}>
            {activeMeter === 'meter2' ? (
              <SmartMeter 
                state={m2State} 
                home={home}
                isActive={true} 
              />
            ) : (
              <MechanicalMeter 
                state={m1State} 
                home={home}
                isActive={true} 
              />
            )}
          </View>
        </Animated.View>

        {baselineMeterId && (
          <BaselineOverrideModal
            visible={baselineModalVisible}
            meter={meters[baselineMeterId]}
            currentBaseline={
              baselineMeterId === "meter1" 
                ? m1State.reading - (m1State.targetUnits - m1State.remainingUnits)
                : m2State.reading - (m2State.targetUnits - m2State.remainingUnits)
            }
            onClose={() => {
              setBaselineModalVisible(false);
              setBaselineMeterId(null);
            }}
            onSave={async (meterId, num) => {
              await setManualBaseline(meterId, num, getStartOfBillingCycle(Date.now()));
              setBaselineModalVisible(false);
              setBaselineMeterId(null);
            }}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  container: {
    paddingHorizontal: 16,
    gap: 24,
  },
  topSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  greeting: {
    color: Colors.dark.textSecondary,
    fontFamily: 'Outfit',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  weatherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  locationText: {
    color: Colors.dark.textSecondary,
    fontFamily: 'Outfit',
    fontSize: 13,
  },
  time: {
    color: Colors.dark.text,
    fontFamily: 'Outfit',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -1,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(52, 199, 89, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(52, 199, 89, 0.2)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.success,
    shadowColor: Colors.dark.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  statusText: {
    color: Colors.dark.success,
    fontFamily: 'Outfit',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  heroPanel: {
    height: 280,
    overflow: 'hidden',
    padding: 0,
  },
  secondaryPanel: {
    height: 180,
    overflow: 'hidden',
    padding: 0,
  },
  metersSection: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  sectionTitle: {
    color: Colors.dark.textSecondary,
    fontFamily: 'Outfit',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  smallBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  metersList: {
    gap: 16,
  }
});
