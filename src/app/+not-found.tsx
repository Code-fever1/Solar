import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { Colors } from "@/constants/Colors";

export default function NotFoundScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Route not found</Text>
      <Link href="/(tabs)" style={styles.link}>
        Return to GridWise
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.background,
    gap: 16,
  },
  title: {
    color: Colors.dark.text,
    fontFamily: "Outfit",
    fontSize: 24,
    fontWeight: "700",
  },
  link: {
    color: Colors.dark.solar,
    fontFamily: "Outfit",
    fontSize: 16,
  },
});
