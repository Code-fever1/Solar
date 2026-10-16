import type { EnergyFlowPoint } from "@/context/energy-types";
import { memo, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Line, Path, Text as SvgText } from "react-native-svg";

import { INK, SOURCE, type Ink } from "./palette";

export type ChartRange = "day" | "week" | "month";

type DailyPoint = { timestamp: number; label: string; usage: number };

type Sample = {
  t: number;
  solar: number | null;
  home: number | null;
  imported: number | null;
  exported: number | null;
};

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function hourLabel(ts: number) {
  const d = new Date(ts);
  let h = d.getHours();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h} ${ap}`;
}

function dayLabel(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { weekday: "short" });
}

function buildDay(points: EnergyFlowPoint[], now: number): { samples: Sample[]; start: number; end: number } {
  const start = startOfDay(now);
  const end = start + DAY;
  const samples: Sample[] = points
    .filter((p) => p.timestamp >= start && p.timestamp <= now + 60_000)
    .map((p) => ({
      t: p.timestamp,
      solar: p.solarKw,
      home: p.loadKw,
      imported: p.gridKw != null && p.gridKw > 0 ? p.gridKw : p.gridKw === 0 ? 0 : null,
      exported: p.gridKw != null && p.gridKw < 0 ? -p.gridKw : p.gridKw === 0 ? 0 : null,
    }));
  return { samples, start, end };
}

function buildUsage(days: DailyPoint[], count: number, now: number): { samples: Sample[]; start: number; end: number } {
  const slice = days.slice(-count);
  const start = slice[0]?.timestamp ?? now - count * DAY;
  const end = (slice[slice.length - 1]?.timestamp ?? now) + DAY;
  const samples: Sample[] = slice.map((d) => ({
    t: d.timestamp,
    solar: null,
    home: d.usage,
    imported: null,
    exported: null,
  }));
  return { samples, start, end };
}

function linePath(pts: Array<{ x: number; y: number }>) {
  if (pts.length === 0) return "";
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

function areaPath(pts: Array<{ x: number; y: number }>, baseY: number) {
  if (pts.length === 0) return "";
  const line = linePath(pts);
  const last = pts[pts.length - 1];
  const first = pts[0];
  return `${line} L${last.x.toFixed(1)},${baseY.toFixed(1)} L${first.x.toFixed(1)},${baseY.toFixed(1)} Z`;
}

export const FlowChart = memo(function FlowChart({
  flow,
  daily,
  range,
  ink = INK,
}: {
  flow: EnergyFlowPoint[];
  daily: DailyPoint[];
  range: ChartRange;
  ink?: Ink;
}) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const touchX = useRef(0);
  const now = Date.now();
  const height = 168;
  const padL = 28;
  const padR = 8;
  const padT = 16;
  const padB = 8;

  const model = useMemo(() => {
    if (range === "day") return { ...buildDay(flow, now), unit: "kW" as const };
    if (range === "week") return { ...buildUsage(daily, 7, now), unit: "units" as const };
    return { ...buildUsage(daily, 30, now), unit: "units" as const };
  }, [daily, flow, now, range]);

  const plotW = Math.max(1, width - padL - padR);
  const plotH = height - padT - padB;
  const span = Math.max(1, model.end - model.start);
  const xOf = (t: number) => padL + ((t - model.start) / span) * plotW;

  const nums = model.samples.flatMap((s) => [s.solar, s.home, s.exported, s.imported].filter((v): v is number => v != null && v > 0));
  const max = Math.max(0.4, ...nums, 0);
  const yOfPos = (v: number) => padT + plotH / 2 - (v / max) * (plotH / 2 - 4);
  const yOfNeg = (v: number) => padT + plotH / 2 + (v / max) * (plotH / 2 - 4);
  const zeroY = padT + plotH / 2;

  const solarPts = model.samples.filter((s) => s.solar != null && s.solar > 0).map((s) => ({ x: xOf(s.t), y: yOfPos(s.solar as number) }));
  const exportPts = model.samples.filter((s) => s.exported != null && s.exported > 0).map((s) => ({ x: xOf(s.t), y: yOfPos(s.exported as number) }));
  const importPts = model.samples.filter((s) => s.imported != null && s.imported > 0).map((s) => ({ x: xOf(s.t), y: yOfNeg(s.imported as number) }));
  const homePts = model.samples.filter((s) => s.home != null).map((s) => ({ x: xOf(s.t), y: yOfPos(Math.max(0, s.home as number)) }));

  const nowX = xOf(Math.min(model.end, Math.max(model.start, now)));
  const activeIndex = selected ?? model.samples.reduce((best, s, i) => (s.t <= now && (best < 0 || s.t > model.samples[best].t) ? i : best), -1);
  const active = activeIndex >= 0 ? model.samples[activeIndex] : null;

  const ticks = useMemo(() => {
    const out: { t: number; label: string }[] = [];
    if (range === "day") {
      for (let h = 0; h <= 24; h += 4) {
        const t = model.start + h * 60 * 60 * 1000;
        out.push({ t, label: hourLabel(t === model.end ? t - 1 : t) });
      }
    } else {
      const step = Math.max(1, Math.ceil(model.samples.length / 5));
      model.samples.forEach((s, i) => {
        if (i % step === 0) out.push({ t: s.t, label: dayLabel(s.t) });
      });
    }
    return out;
  }, [model.end, model.samples, model.start, range]);

  const pick = (x: number) => {
    if (model.samples.length === 0) return;
    const t = model.start + ((x - padL) / plotW) * span;
    let best = 0;
    let dist = Infinity;
    model.samples.forEach((s, i) => {
      const d = Math.abs(s.t - t);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    setSelected(best);
  };

  const tip = active
    ? range === "day"
      ? `${hourLabel(active.t)}  ·  Solar ${active.solar?.toFixed(2) ?? "—"}  Home ${active.home?.toFixed(2) ?? "—"}`
      : `${dayLabel(active.t)}  ·  ${active.home?.toFixed(2) ?? "—"} units`
    : "Drag to inspect";

  return (
    <View>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => {
          touchX.current = e.nativeEvent.locationX;
          pick(e.nativeEvent.locationX);
        }}
        onResponderMove={(e) => pick(e.nativeEvent.locationX)}
        accessibilityLabel="Energy flow chart. Drag to inspect a time."
      >
        {width > 0 ? (
          <Svg width={width} height={height}>
            <SvgText x={0} y={padT + 8} fill={ink.secondary} fontSize={9}>{max >= 10 ? max.toFixed(0) : max.toFixed(1)}</SvgText>
            <SvgText x={0} y={zeroY + 3} fill={ink.secondary} fontSize={9}>0</SvgText>
            <Line x1={padL} y1={zeroY} x2={width - padR} y2={zeroY} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
            <Line x1={nowX} y1={padT} x2={nowX} y2={height - padB} stroke="rgba(242,245,248,0.45)" strokeDasharray="2 3" strokeWidth={1} />
            {solarPts.length > 1 ? <Path d={areaPath(solarPts, zeroY)} fill={SOURCE.solar} fillOpacity={0.35} stroke={SOURCE.solar} strokeWidth={1.4} /> : null}
            {exportPts.length > 1 ? <Path d={areaPath(exportPts, zeroY)} fill={SOURCE.export} fillOpacity={0.28} stroke={SOURCE.export} strokeWidth={1.2} /> : null}
            {importPts.length > 1 ? <Path d={areaPath(importPts, zeroY)} fill={SOURCE.grid} fillOpacity={0.28} stroke={SOURCE.grid} strokeWidth={1.2} /> : null}
            {homePts.length > 1 ? <Path d={linePath(homePts)} stroke={SOURCE.home} strokeWidth={1.8} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
          </Svg>
        ) : (
          <View style={{ height }} />
        )}
        <View style={[styles.nowPill, { left: Math.min(width - 46, Math.max(padL, nowX - 18)), backgroundColor: ink.card, borderColor: ink.highlight }]}>
          <Text style={[styles.nowText, { color: ink.text }]}>now</Text>
        </View>
      </View>
      <View style={[styles.axis, { marginLeft: padL, marginRight: padR }]}>
        {ticks.map((tick) => (
          <Text key={`${tick.t}-${tick.label}`} style={[styles.axisText, { color: ink.secondary }]}>{tick.label}</Text>
        ))}
      </View>
      <View style={styles.legend}>
        <Text style={[styles.legendItem, { color: SOURCE.solar }]}>Solar</Text>
        <Text style={[styles.legendItem, { color: SOURCE.home }]}>Home</Text>
        <Text style={[styles.legendItem, { color: SOURCE.export }]}>Export</Text>
        <Text style={[styles.legendItem, { color: SOURCE.grid }]}>Import</Text>
      </View>
      <Text style={[styles.tip, { color: ink.text }]}>{tip}</Text>
      <Text style={[styles.unit, { color: ink.secondary }]}>{model.unit === "kW" ? "kW  ·  production above, import below" : "units per day"}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  nowPill: {
    position: "absolute",
    top: 0,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
  },
  nowText: { fontFamily: "Outfit_500Medium", fontSize: 9 },
  axis: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  axisText: { fontFamily: "Outfit_400Regular", fontSize: 10, fontVariant: ["tabular-nums"] },
  legend: { flexDirection: "row", gap: 12, marginTop: 8 },
  legendItem: { fontFamily: "Outfit_500Medium", fontSize: 11 },
  tip: { fontFamily: "Outfit_500Medium", fontSize: 12, marginTop: 6, fontVariant: ["tabular-nums"] },
  unit: { fontFamily: "Outfit_400Regular", fontSize: 11, marginTop: 2 },
});
