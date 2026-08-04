import { RefreshCw } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { Path } from "react-native-svg";

import type { InverterTelemetry, WeatherState } from "@/context/energy-types";

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Fixed aspect ratio for the card so day/night backgrounds never change sizing.
// Both backgrounds stretch to fill this frame.
const CARD_ASPECT = 1600 / 899;

// Arc paths from solar and grid towards home
const SOLAR_ARC = "M 78 96 C 128 108 152 138 196 158";
const GRID_ARC = "M 382 96 C 332 108 306 138 264 158";

type SceneProps = { inverter: InverterTelemetry; weather: WeatherState; offline: boolean };

function formatPower(watts: number) { return watts >= 1000 ? `${(watts / 1000).toFixed(1)} kW` : `${Math.round(watts)} W`; }

export function LiveEnergyScene({ inverter, weather, offline }: SceneProps) {
  const [isDayTime, setIsDayTime] = useState(weather.isDay);

  useEffect(() => {
    fetch("https://api.sunrise-sunset.org/json?lat=31.6265&lng=71.0664&formatted=0")
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "OK") {
          const now = new Date();
          const sunrise = new Date(data.results.sunrise);
          const sunset = new Date(data.results.sunset);
          setIsDayTime(now >= sunrise && now < sunset);
        }
      })
      .catch(() => {});
  }, []);

  const solarOnline = inverter.isLive && !offline && inverter.solarW > 25;
  const gridOnline = inverter.isLive && !offline && inverter.gridConnected;
  const solarColor = solarOnline ? "#F9C641" : "#EF4C4C";
  const gridColor = gridOnline ? "#6E9BFF" : "#EF4C4C";

  const bgImage = isDayTime ? require("../../assets/images/dayback.jpeg") : require("../../assets/images/nightback.jpeg");

  return (
    <View style={[styles.card, { aspectRatio: CARD_ASPECT }]}>
      <Image source={bgImage} style={styles.background} resizeMode="stretch" />
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.topRow}><View style={styles.liveTag}><View style={[styles.liveDot, { backgroundColor: inverter.isLive && !offline ? "#3BE070" : "#F5BF4A" }]} /><Text style={styles.liveText}>Live Energy Flow</Text></View></View>
        <View style={styles.homeUsage}><Text style={styles.homeNumber}>{formatPower(inverter.loadW)}</Text><Text style={styles.homeLabel}>Home Usage</Text></View>
        <View style={[styles.node, styles.solarNode]}>
          <Text style={[styles.nodeValue, { color: solarColor }]}>{formatPower(inverter.solarW)}</Text>
          <Text style={styles.nodeCaption}>{solarOnline ? "Solar Power" : "Solar Offline"}</Text>
        </View>
        <View style={[styles.node, styles.gridNode]}>
          <Text style={[styles.nodeValue, { color: gridColor }]}>{formatPower(inverter.gridW)}</Text>
          <Text style={styles.nodeCaption}>{gridOnline ? inverter.gridDirection === "export" ? "To Grid" : "From Grid" : "Grid Offline"}</Text>
        </View>
        <View style={styles.footer}><View style={styles.footerPill}><RefreshCw size={9} color="#DCE7F2" /><Text style={styles.footerText}>{inverter.isLive && !offline ? "Updated 2 sec ago" : "Waiting for data"}</Text></View><View style={styles.footerPill}><View style={[styles.footerDot, { backgroundColor: gridOnline ? "#6E9BFF" : "#EF4C4C" }]} /><Text style={styles.footerText}>{gridOnline ? inverter.gridDirection === "export" ? "Grid Exporting" : "Grid Importing" : "Grid Offline"}</Text></View></View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: "100%", maxWidth: 520, alignSelf: "center", borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: "rgba(190,212,240,0.16)" },
  background: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  topRow: { position: "absolute", top: "5%", left: "3.2%" },
  liveTag: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { color: "#F5F9FD", fontFamily: "Outfit", fontSize: 11, fontWeight: "600" },
  homeUsage: { position: "absolute", top: "6%", left: 0, right: 0, alignItems: "center" },
  homeNumber: { color: "#45E376", fontFamily: "Outfit", fontSize: 24, fontWeight: "700" },
  homeLabel: { color: "#EDF3FA", fontFamily: "Outfit", fontSize: 10, marginTop: 1 },
  node: { position: "absolute", top: "22%", alignItems: "center", width: 96 },
  solarNode: { left: "1.5%" },
  gridNode: { right: "1.5%" },
  nodeValue: { fontFamily: "Outfit", fontSize: 17, fontWeight: "700" },
  nodeCaption: { color: "#DCE6F0", fontFamily: "Outfit", fontSize: 9, marginTop: 1 },
  footer: { position: "absolute", left: "2.6%", right: "2.6%", bottom: "4.5%", flexDirection: "row", justifyContent: "space-between" },
  footerPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(10,18,28,0.55)", borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5 },
  footerDot: { width: 6, height: 6, borderRadius: 3 },
  footerText: { color: "#E4EDF6", fontFamily: "Outfit", fontSize: 9 },
});
