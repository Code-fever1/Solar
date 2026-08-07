import { useSceneTheme } from "@/context/SceneThemeContext";
import { router } from "expo-router";
import { ArrowLeft, Construction } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function ComingSoonScreen({ title }: { title: string }) {
  const insets = useSafeAreaInsets();
  const theme = useSceneTheme();
  return <View style={[styles.screen, { backgroundColor: theme.screenBg, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}><View style={styles.content}><View style={styles.icon}><Construction size={28} color="#A88AFF" /></View><Text style={[styles.eyebrow, { color: "#B39AFF" }]}>NEW DASHBOARD</Text><Text style={[styles.title, { color: theme.text }]}>{title} is coming soon</Text><Text style={[styles.body, { color: theme.textSecondary }]}>This section is still being rebuilt for the new Voltix experience. Check back soon for updates.</Text><Pressable accessibilityRole="button" style={styles.button} onPress={() => router.replace("/")}><ArrowLeft size={17} color="#081018" /><Text style={styles.buttonText}>Back to dashboard</Text></Pressable></View></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 24, justifyContent: "center" },
  content: { alignItems: "center", maxWidth: 360, alignSelf: "center" },
  icon: { width: 68, height: 68, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(168,138,255,0.14)", marginBottom: 20 },
  eyebrow: { fontFamily: "Outfit", fontSize: 11, fontWeight: "700", letterSpacing: 1.1 },
  title: { fontFamily: "Outfit", fontSize: 28, lineHeight: 34, fontWeight: "700", textAlign: "center", marginTop: 8 },
  body: { fontFamily: "Outfit", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 12 },
  button: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 25, backgroundColor: "#61DB8C", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 },
  buttonText: { color: "#081018", fontFamily: "Outfit", fontSize: 13, fontWeight: "700" },
});
