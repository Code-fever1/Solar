import { ArrowRight, Home, Sun, Zap } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { Colors } from "@/constants/Colors";
import { GlassCard } from "./GlassCard";

type PowerFlowProps = {
  solarKw: number;
  gridKw: number;
  loadKw: number;
  exportKw?: number;
};

export function PowerFlow({ solarKw, gridKw, loadKw }: PowerFlowProps) {
  return (
    <GlassCard style={styles.card}>
      <Text style={styles.title}>Power Flow Diagram</Text>

      <View style={styles.flowContainer}>
        {/* Sources column */}
        <View style={styles.sourcesColumn}>
          {/* Solar node */}
          <View style={[styles.node, styles.solarNode]}>
            <View style={styles.iconContainer}>
              <Sun color={Colors.dark.solar} size={20} />
            </View>
            <Text style={styles.nodeLabel}>Solar Yield</Text>
            <Text style={styles.nodeValue}>{solarKw.toFixed(1)} kW</Text>
          </View>

          {/* Grid node */}
          <View style={[styles.node, styles.gridNode]}>
            <View style={styles.iconContainer}>
              <Zap color={Colors.dark.grid} size={20} />
            </View>
            <Text style={styles.nodeLabel}>Grid Import</Text>
            <Text style={styles.nodeValue}>{gridKw.toFixed(1)} kW</Text>
          </View>
        </View>

        {/* Connectors / Flow direction column */}
        <View style={styles.connectorColumn}>
          <View style={styles.connectorRow}>
            <View style={styles.line} />
            <ArrowRight
              color={Colors.dark.solar}
              size={16}
              style={styles.arrow}
            />
          </View>

          <View style={styles.connectorRow}>
            <View style={styles.line} />
            <ArrowRight
              color={Colors.dark.grid}
              size={16}
              style={styles.arrow}
            />
          </View>
        </View>

        {/* Destination column */}
        <View style={styles.destinationColumn}>
          <View style={[styles.node, styles.loadNode]}>
            <View style={styles.iconContainer}>
              <Home color={Colors.dark.load} size={22} />
            </View>
            <Text style={styles.nodeLabel}>Home Load</Text>
            <Text style={styles.nodeValue}>{loadKw.toFixed(1)} kW</Text>
            <Text style={styles.nodeSub}>
              {((loadKw * 1000) / 220).toFixed(0)}A @ 220V
            </Text>
          </View>
        </View>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 16,
  },
  title: {
    color: Colors.dark.text,
    fontFamily: "Outfit",
    fontSize: 16,
    fontWeight: "700",
  },
  flowContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  sourcesColumn: {
    flex: 1.2,
    gap: 16,
  },
  connectorColumn: {
    flex: 0.8,
    gap: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  connectorRow: {
    height: 80,
    width: "100%",
    position: "relative",
    justifyContent: "center",
  },
  line: {
    height: 2,
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  arrow: {
    position: "absolute",
    right: 4,
    alignSelf: "center",
  },
  destinationColumn: {
    flex: 1.2,
    justifyContent: "center",
  },
  node: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.02)",
  },
  solarNode: {
    borderColor: "rgba(255,184,0,0.18)",
  },
  gridNode: {
    borderColor: "rgba(239,86,86,0.18)",
  },
  loadNode: {
    borderColor: "rgba(24,144,255,0.18)",
    height: 140,
    justifyContent: "center",
  },
  iconContainer: {
    marginBottom: 6,
  },
  nodeLabel: {
    color: Colors.dark.textSecondary,
    fontFamily: "Outfit",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  nodeValue: {
    color: Colors.dark.text,
    fontFamily: "Share Tech Mono",
    fontSize: 18,
    fontWeight: "700",
  },
  nodeSub: {
    color: Colors.dark.textSecondary,
    fontFamily: "Share Tech Mono",
    fontSize: 11,
    marginTop: 6,
  },
});
