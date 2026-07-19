import { ArrowRight, Sparkles } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { Colors } from "@/constants/Colors";
import type { Recommendation } from "@/context/EnergyContext";
import { GlassCard } from "./GlassCard";

type RecommendationCardProps = {
  recommendation: Recommendation;
};

export function RecommendationCard({
  recommendation,
}: RecommendationCardProps) {
  return (
    <GlassCard style={styles.card}>
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Sparkles color={Colors.dark.solar} size={18} />
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.kicker}>{recommendation.action}</Text>
          <Text style={styles.title}>{recommendation.title}</Text>
          <Text style={styles.description}>{recommendation.description}</Text>
        </View>
        <ArrowRight color={Colors.dark.textSecondary} size={18} />
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 242, 254, 0.1)",
  },
  textBlock: {
    flex: 1,
    gap: 4,
  },
  kicker: {
    color: Colors.dark.solar,
    fontFamily: "Outfit",
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  title: {
    color: Colors.dark.text,
    fontFamily: "Outfit",
    fontSize: 16,
    fontWeight: "700",
  },
  description: {
    color: Colors.dark.textSecondary,
    fontFamily: "Outfit",
    fontSize: 13,
    lineHeight: 18,
  },
});
