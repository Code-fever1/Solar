import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Colors } from '@/constants/Colors';

type CircularProgressProps = {
  usage: number; // monthly units consumed so far
  size?: number;
  strokeWidth?: number;
};

export function CircularProgress({ usage, size = 180, strokeWidth = 12 }: CircularProgressProps) {
  const target = 200;
  const remaining = Math.max(0, target - usage);
  const percentage = Math.min(1, Math.max(0, remaining / target));

  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - percentage);

  // Muted, realistic colors depending on limits
  let progressColor: string = Colors.dark.success;
  let glowColor: string = "rgba(82, 196, 26, 0.3)";
  if (remaining < 30) {
    progressColor = Colors.dark.critical;
    glowColor = "rgba(255, 77, 79, 0.3)";
  } else if (remaining < 60) {
    progressColor = Colors.dark.warning;
    glowColor = "rgba(250, 173, 20, 0.3)";
  }

  // Scale fonts dynamically based on component size prop
  const scale = size / 180;
  const remainingFontSize = Math.round(34 * scale);
  const labelFontSize = Math.round(9 * scale);
  const subTextFontSize = Math.round(10 * scale);

  return (
    <View style={styles.container}>
      <Svg width={size} height={size} style={styles.svg}>
        {/* Outer glow ring */}
        <Circle
          cx={center}
          cy={center}
          r={radius + 4}
          stroke={glowColor}
          strokeWidth={2}
          fill="transparent"
          opacity={0.5}
        />
        {/* Underlay track */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Progress indicator circle */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={progressColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="transparent"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      {/* Center Text overlay */}
      <View style={styles.contentOverlay}>
        <Text style={[styles.remainingVal, { fontSize: remainingFontSize }]}>
          {remaining.toFixed(0)}
        </Text>
        <Text style={[styles.label, { fontSize: labelFontSize }]}>UNITS LEFT</Text>
        <Text style={[styles.subText, { fontSize: subTextFontSize }]}>
          Used: {usage.toFixed(1)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginVertical: 4,
  },
  svg: {
    transform: [{ scaleX: 1 }],
  },
  contentOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  remainingVal: {
    color: Colors.dark.text,
    fontFamily: 'Share Tech Mono',
    fontWeight: '700',
  },
  label: {
    color: Colors.dark.textSecondary,
    fontFamily: 'Outfit',
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  subText: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontFamily: 'Share Tech Mono',
    marginTop: 2,
  },
});
