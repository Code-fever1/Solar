import { router } from "expo-router";
import { ArrowLeft, Construction } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function ComingSoonScreen({ title }: { title: string }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.screen, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}><View style={styles.content}><View style={styles.icon}><Construction size={28} color="#A88AFF" /></View><Text style={styles.eyebrow}>NEW DASHBOARD</Text><Text style={styles.title}>{title} is coming soon</Text><Text style={styles.body}>This section is still being rebuilt for the new Voltix experience. Your original version remains available in Old UI mode.</Text><Pressable accessibilityRole="button" style={styles.button} onPress={() => router.replace("/")}><ArrowLeft size={17} color="#081018" /><Text style={styles.buttonText}>Back to dashboard</Text></Pressable></View></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0B111B", paddingHorizontal: 24, justifyContent: "center" },
  content: { alignItems: "center", maxWidth: 360, alignSelf: "center" },
  icon: { width: 68, height: 68, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(168,138,255,0.14)", marginBottom: 20 },
  eyebrow: { color: "#B39AFF", fontFamily: "Outfit", fontSize: 11, fontWeight: "700", letterSpacing: 1.1 },
  title: { color: "#EEF5FC", fontFamily: "Outfit", fontSize: 28, lineHeight: 34, fontWeight: "700", textAlign: "center", marginTop: 8 },
  body: { color: "#9BADBF", fontFamily: "Outfit", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 12 },
  button: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 25, backgroundColor: "#61DB8C", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 },
  buttonText: { color: "#081018", fontFamily: "Outfit", fontSize: 13, fontWeight: "700" },
});
