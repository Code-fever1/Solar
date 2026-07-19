import { useMemo, useState } from "react";
import {
    PanResponder,
    StyleSheet,
    Text,
    View,
    type LayoutChangeEvent,
} from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";

import { Colors } from "@/constants/Colors";
import type { HistoryPoint } from "@/context/EnergyContext";

type AnalyticsChartProps = {
  data: HistoryPoint[];
};

type PlotPoint = {
  x: number;
  y: number;
  value: number;
};

function buildSmoothPath(points: PlotPoint[]) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  const segments: string[] = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    const midX = (current.x + next.x) / 2;
    segments.push(
      `C ${midX} ${current.y}, ${midX} ${next.y}, ${next.x} ${next.y}`,
    );
  }
  return segments.join(" ");
}

function buildPoints(
  data: HistoryPoint[],
  width: number,
  height: number,
  selector: (point: HistoryPoint) => number,
) {
  const values = data.map(selector);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = max - min;

  return data.map((point, index) => ({
    x: data.length > 1 ? (index / (data.length - 1)) * width : width / 2,
    y: height - ((selector(point) - min) / span) * (height - 32) - 16,
    value: selector(point),
  }));
}

export function AnalyticsChart({ data }: AnalyticsChartProps) {
  const [width, setWidth] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const plots = useMemo(() => {
    if (!width || data.length === 0) {
      return { meter1: [], meter2: [] };
    }
    const chartHeight = 200;
    return {
      meter1: buildPoints(data, width, chartHeight, (point) => point.meter1),
      meter2: buildPoints(data, width, chartHeight, (point) => point.meter2),
    };
  }, [data, width]);

  const chartHeight = 200;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderMove: (_, gesture) => {
          if (!width || data.length === 0) return;
          const ratio = Math.min(1, Math.max(0, gesture.moveX / width));
          setSelectedIndex(Math.round(ratio * (data.length - 1)));
        },
        onPanResponderRelease: () => setSelectedIndex(null),
      }),
    [data.length, width],
  );

  const onLayout = (event: LayoutChangeEvent) =>
    setWidth(event.nativeEvent.layout.width);
  const activePoint = selectedIndex === null ? null : data[selectedIndex];

  // Get active indicator dots coordinates
  const indicators = useMemo(() => {
    if (selectedIndex === null || !plots.meter1[selectedIndex]) return null;
    return {
      x: plots.meter1[selectedIndex].x,
      m1Y: plots.meter1[selectedIndex].y,
      m2Y: plots.meter2[selectedIndex].y,
    };
  }, [selectedIndex, plots]);

  return (
    <View style={styles.wrapper} onLayout={onLayout} {...responder.panHandlers}>
      {data.length > 0 ? (
        <Svg height={chartHeight} width={width || 1}>
          {/* Baseline grid */}
          <Line
            x1="0"
            y1={chartHeight - 16}
            x2={width || 1}
            y2={chartHeight - 16}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={1}
          />

          {/* Smooth Solid Trend Lines for Meter 1 & Meter 2 */}
          <Path
            d={buildSmoothPath(plots.meter1)}
            fill="none"
            stroke={Colors.dark.grid}
            strokeWidth={2}
          />
          <Path
            d={buildSmoothPath(plots.meter2)}
            fill="none"
            stroke={Colors.dark.solar}
            strokeWidth={2}
          />

          {/* Interactive crosshair and dots */}
          {indicators && (
            <>
              <Line
                x1={indicators.x}
                y1="0"
                x2={indicators.x}
                y2={chartHeight}
                stroke="rgba(255,255,255,0.15)"
                strokeWidth={1}
                strokeDasharray="3,3"
              />
              <Circle
                cx={indicators.x}
                cy={indicators.m1Y}
                r={4.5}
                fill={Colors.dark.grid}
                stroke="#0E1015"
                strokeWidth={1.5}
              />
              <Circle
                cx={indicators.x}
                cy={indicators.m2Y}
                r={4.5}
                fill={Colors.dark.solar}
                stroke="#0E1015"
                strokeWidth={1.5}
              />
            </>
          )}
        </Svg>
      ) : (
        <View style={[styles.emptyContainer, { height: chartHeight }]}>
          <Text style={styles.emptyText}>No data available for graph</Text>
        </View>
      )}

      {/* Simplified, flat tooltip */}
      {activePoint ? (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipTitle}>{activePoint.time}</Text>
          <View style={styles.tooltipRow}>
            <View
              style={[
                styles.indicatorBadge,
                { backgroundColor: Colors.dark.grid },
              ]}
            />
            <Text style={styles.tooltipText}>
              Meter 1 (Analog): {activePoint.meter1.toFixed(2)} kW
            </Text>
          </View>
          <View style={styles.tooltipRow}>
            <View
              style={[
                styles.indicatorBadge,
                { backgroundColor: Colors.dark.solar },
              ]}
            />
            <Text style={styles.tooltipText}>
              Meter 2 (Digital): {activePoint.meter2.toFixed(2)} kW
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: Colors.dark.grid }]}
            />
            <Text style={styles.legendLabel}>Meter 1 (Analog)</Text>
          </View>
          <View style={styles.legendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: Colors.dark.solar }]}
            />
            <Text style={styles.legendLabel}>Meter 2 (Digital)</Text>
          </View>
          <Text style={styles.dragHint}>Drag on chart to inspect points</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 16,
    backgroundColor: Colors.dark.backgroundElement,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: Colors.dark.textSecondary,
    fontFamily: "Outfit",
    fontSize: 13,
  },
  tooltip: {
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#1E222D",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    gap: 4,
  },
  tooltipTitle: {
    color: Colors.dark.text,
    fontFamily: "Outfit",
    fontWeight: "700",
    fontSize: 12,
    marginBottom: 2,
  },
  tooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  indicatorBadge: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tooltipText: {
    color: Colors.dark.textSecondary,
    fontFamily: "Share Tech Mono",
    fontSize: 12,
  },
  legend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 10,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendLabel: {
    color: Colors.dark.textSecondary,
    fontFamily: "Outfit",
    fontSize: 11,
  },
  dragHint: {
    marginLeft: "auto",
    color: "rgba(255, 255, 255, 0.25)",
    fontFamily: "Outfit",
    fontSize: 10,
    fontStyle: "italic",
  },
});
