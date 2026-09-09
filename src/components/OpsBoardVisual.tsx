import type { BoardSwitchState, OpsDevice, OpsFlags } from "@/utils/ops-guide";
import { greenLeverDir, greenLeverWord } from "@/utils/ops-guide";
import { boardStateFromFlags } from "@/utils/ops-board-infer";
import { memo, useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Polygon,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";

const AnimatedRect = Animated.createAnimatedComponent(Rect);
const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedSvgText = Animated.createAnimatedComponent(SvgText);

// Authentic hardware color palette matching the real photo
const DB_BG = "#ECEFF3";
const DB_FRAME = "#D2D8E2";
const RAIL_BG = "#13171F";
const RAIL_STEEL = "#252C37";

const MCB_WHITE = "#F5F7FA";
const MCB_BORDER = "#BCC4D0";
const MCB_DIVIDER = "#D7DEE7";

const BLUE_PADDLE_TOP = "#3B82F6";
const BLUE_PADDLE_MID = "#1D5BB5";
const BLUE_PADDLE_BOT = "#0F366E";
const BLUE_PADDLE_RIDGE = "#60A5FA";

const GREY_PADDLE_TOP = "#94A3B8";
const GREY_PADDLE_MID = "#64748B";
const GREY_PADDLE_BOT = "#475569";
const GREY_PADDLE_RIDGE = "#7E8E9F";

const RED_FLAG = "#EF4444";
const GREEN_FLAG = "#22C55E";
const RED_LED = "#FF3333";
const GREEN_LED = "#2EE068";
const AMBER_LED = "#F59E0B";

const ORANGE_BTN = "#F97316";
const ORANGE_BTN_BORDER = "#C2410C";

export type { BoardSwitchState };
export { boardStateFromFlags };

type BoardFocus = "db" | "inverter" | "dongle" | "green";

type Props = {
  mode: "interactive" | "guide";
  boardState: BoardSwitchState;
  onBoardStateChange?: (state: BoardSwitchState) => void;
  highlight: OpsDevice;
  flags: OpsFlags;
  accent: string;
  stepN?: number;
  stepTotal?: number;
  stepText?: string;
  stepDetail?: string;
  guideApply?: Partial<BoardSwitchState>;
  greenTarget?: "meter1" | "meter2";
  focusOverride?: BoardFocus;
  bare?: boolean;
  dongleRetry?: boolean;
};

function focusFor(device: OpsDevice): BoardFocus {
  if (device === "inverter") return "inverter";
  if (device === "dongle") return "dongle";
  if (device === "green") return "green";
  return "db";
}

function usePulse(active: boolean) {
  const glow = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    if (!active) {
      glow.value = withTiming(0, { duration: 200 });
      return;
    }
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.35, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [active, glow]);
  return useAnimatedProps(() => ({
    opacity: 0.18 + glow.value * 0.55,
  }));
}

function HotRing({
  x,
  y,
  w,
  h,
  hot,
  accent,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  hot: boolean;
  accent: string;
}) {
  const hotProps = usePulse(hot);
  if (!hot) return null;
  return (
    <AnimatedRect
      animatedProps={hotProps}
      x={x - 3}
      y={y - 3}
      width={w + 6}
      height={h + 6}
      rx={5}
      fill={accent}
    />
  );
}

function useThrowY(fromY: number, toY: number, demo: boolean) {
  const y = useSharedValue(fromY);
  useEffect(() => {
    if (!demo || Math.abs(toY - fromY) < 0.5) {
      y.value = withTiming(fromY, { duration: 220, easing: Easing.out(Easing.cubic) });
      return;
    }
    y.value = fromY;
    y.value = withRepeat(
      withSequence(
        withTiming(toY, { duration: 780, easing: Easing.inOut(Easing.cubic) }),
        withDelay(520, withTiming(fromY, { duration: 260, easing: Easing.in(Easing.quad) })),
      ),
      -1,
    );
  }, [fromY, toY, demo, y]);
  return y;
}

function DualPaddleThrow({
  pole1Cx,
  pole2Cx,
  paddleW,
  paddleH,
  fromY,
  toY,
  demo,
  mid,
  top,
  bot,
  ridge,
}: {
  pole1Cx: number;
  pole2Cx: number;
  paddleW: number;
  paddleH: number;
  fromY: number;
  toY: number;
  demo: boolean;
  mid: string;
  top: string;
  bot: string;
  ridge: string;
}) {
  const y = useThrowY(fromY, toY, demo);
  const p1 = useAnimatedProps(() => ({ y: y.value }));
  const p1Top = useAnimatedProps(() => ({ y: y.value + 1 }));
  const p2 = useAnimatedProps(() => ({ y: y.value }));
  const p2Top = useAnimatedProps(() => ({ y: y.value + 1 }));
  const bar = useAnimatedProps(() => ({ y: y.value + 4 }));
  const r1 = useAnimatedProps(() => ({ y1: y.value + 5, y2: y.value + 5 }));
  const r2 = useAnimatedProps(() => ({ y1: y.value + 8, y2: y.value + 8 }));
  const r3 = useAnimatedProps(() => ({ y1: y.value + 11, y2: y.value + 11 }));
  const r4 = useAnimatedProps(() => ({ y1: y.value + 5, y2: y.value + 5 }));
  const r5 = useAnimatedProps(() => ({ y1: y.value + 8, y2: y.value + 8 }));
  const r6 = useAnimatedProps(() => ({ y1: y.value + 11, y2: y.value + 11 }));

  return (
    <G>
      <AnimatedRect animatedProps={bar} x={pole1Cx} width={pole2Cx - pole1Cx} height={6} rx={1.2} fill={mid} opacity={0.92} />
      <AnimatedRect animatedProps={p1} x={pole1Cx - paddleW / 2} width={paddleW} height={paddleH} rx={1.8} fill={mid} stroke={bot} strokeWidth={0.6} />
      <AnimatedRect animatedProps={p1Top} x={pole1Cx - paddleW / 2 + 0.7} width={paddleW - 1.4} height={paddleH / 2 - 1} rx={1} fill={top} />
      <AnimatedLine animatedProps={r1} x1={pole1Cx - 2.8} x2={pole1Cx + 2.8} stroke={ridge} strokeWidth={0.7} strokeLinecap="round" />
      <AnimatedLine animatedProps={r2} x1={pole1Cx - 2.8} x2={pole1Cx + 2.8} stroke={ridge} strokeWidth={0.7} strokeLinecap="round" />
      <AnimatedLine animatedProps={r3} x1={pole1Cx - 2.8} x2={pole1Cx + 2.8} stroke={ridge} strokeWidth={0.7} strokeLinecap="round" />
      <AnimatedRect animatedProps={p2} x={pole2Cx - paddleW / 2} width={paddleW} height={paddleH} rx={1.8} fill={mid} stroke={bot} strokeWidth={0.6} />
      <AnimatedRect animatedProps={p2Top} x={pole2Cx - paddleW / 2 + 0.7} width={paddleW - 1.4} height={paddleH / 2 - 1} rx={1} fill={top} />
      <AnimatedLine animatedProps={r4} x1={pole2Cx - 2.8} x2={pole2Cx + 2.8} stroke={ridge} strokeWidth={0.7} strokeLinecap="round" />
      <AnimatedLine animatedProps={r5} x1={pole2Cx - 2.8} x2={pole2Cx + 2.8} stroke={ridge} strokeWidth={0.7} strokeLinecap="round" />
      <AnimatedLine animatedProps={r6} x1={pole2Cx - 2.8} x2={pole2Cx + 2.8} stroke={ridge} strokeWidth={0.7} strokeLinecap="round" />
    </G>
  );
}

function greyPaddleY(baseY: number, pos: "up" | "center" | "down") {
  return pos === "up" ? baseY + 19 : pos === "down" ? baseY + 33 : baseY + 26;
}

function BounceArrow({
  x,
  y,
  dir,
  fill,
}: {
  x: number;
  y: number;
  dir: "up" | "down";
  fill: string;
}) {
  const yy = useSharedValue(y);
  useEffect(() => {
    const dest = dir === "up" ? y - 8 : y + 8;
    yy.value = y;
    yy.value = withRepeat(
      withSequence(
        withTiming(dest, { duration: 480, easing: Easing.inOut(Easing.quad) }),
        withTiming(y, { duration: 480, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [y, dir, yy]);
  const ap = useAnimatedProps(() => ({ y: yy.value }));
  return (
    <AnimatedSvgText
      animatedProps={ap}
      x={x}
      fontSize={16}
      fontWeight="800"
      fill={fill}
      textAnchor="middle"
    >
      {dir === "up" ? "▲" : "▼"}
    </AnimatedSvgText>
  );
}

function throwDirFor(
  highlight: OpsDevice,
  apply: Partial<BoardSwitchState> | undefined,
): "up" | "down" | undefined {
  if (highlight === "pv" && apply?.pv === true) return "up";
  if (highlight === "pv" && apply?.pv === false) return "down";
  if (highlight === "wapdaIn" && apply?.wapdaIn === true) return "up";
  if (highlight === "wapdaIn" && apply?.wapdaIn === false) return "down";
  if (highlight === "grey" && apply?.grey === "up") return "up";
  if (highlight === "grey" && apply?.grey === "down") return "down";
  return undefined;
}

function moveCue(
  apply: Partial<BoardSwitchState> | undefined,
  highlight: OpsDevice,
  stepText?: string,
  greenTarget?: "meter1" | "meter2",
): {
  dir: "up" | "down" | "wait" | "press";
  headline: string;
  sub: string;
} | null {
  if (highlight === "none") return null;
  if (highlight === "wapdaIn" && apply?.wapdaIn === true) {
    return { dir: "up", headline: "Move both paddles UPWARD", sub: "WAPDA In — the blue pair right of grey. ON is up." };
  }
  if (highlight === "wapdaIn" && apply?.wapdaIn === false) {
    return { dir: "down", headline: "Move both paddles DOWNWARD", sub: "WAPDA In — flip the blue pair down to OFF." };
  }
  if (highlight === "pv" && apply?.pv === true) {
    return { dir: "up", headline: "Move both paddles UPWARD", sub: "PV1 and PV2 on the far left. ON is up." };
  }
  if (highlight === "pv" && apply?.pv === false) {
    return { dir: "down", headline: "Move both paddles DOWNWARD", sub: "PV1 and PV2 on the far left. OFF is down." };
  }
  if (highlight === "grey" && apply?.grey === "up") {
    return { dir: "up", headline: "Snap both paddles UPWARD", sub: "Grey changeover to solar (I). One fast throw — do not pause in the middle." };
  }
  if (highlight === "grey" && apply?.grey === "down") {
    return { dir: "down", headline: "Snap both paddles DOWNWARD", sub: "Grey changeover to bypass (II). One fast throw — do not pause in the middle." };
  }
  if (highlight === "tomzn") {
    return { dir: "wait", headline: "Wait for green RUN", sub: "Rightmost TOMZN · volt numbers + green light · about 10 seconds" };
  }
  if (highlight === "volt") {
    return { dir: "wait", headline: "Check the volt meter", sub: "Numbers on = on. Dashes = off." };
  }
  if (highlight === "inverter" && /37|HYD/i.test(stepText ?? "")) {
    return { dir: "press", headline: "On the inverter: 37 → OFF", sub: "HYD off = import only. Needed before Meter 2." };
  }
  if (highlight === "inverter") {
    return { dir: "press", headline: "Press the underside button", sub: "Red Fronus · left light shows ON" };
  }
  if (highlight === "dongle") {
    return { dir: "press", headline: "Press the dongle button", sub: "Tan box on top of the white DB" };
  }
  if (highlight === "green") {
    const target: "meter1" | "meter2" =
      greenTarget ?? (/Meter 1/i.test(stepText ?? "") ? "meter1" : "meter2");
    const dir = greenLeverDir(target);
    const word = greenLeverWord(target);
    const meter = target === "meter1" ? "Meter 1" : "Meter 2";
    return {
      dir,
      headline: `Throw the green lever ${word}`,
      sub: `WAHID · ${meter} is ${word === "DOWNWARD" ? "DOWN" : "UP"} · one snap through center`,
    };
  }
  return null;
}

function MoveCueBanner({
  cue,
  accent,
}: {
  cue: NonNullable<ReturnType<typeof moveCue>>;
  accent: string;
}) {
  const bounce = useSharedValue(0);
  useEffect(() => {
    bounce.value = 0;
    bounce.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 520, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 520, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
  }, [cue.headline, cue.dir, bounce]);
  const arrowStyle = useAnimatedStyle(() => {
    const travel = cue.dir === "down" ? 10 : cue.dir === "up" ? -10 : 0;
    return {
      transform: [{ translateY: bounce.value * travel }, { scale: 1 + bounce.value * 0.06 }],
    };
  });
  const glyph = cue.dir === "up" ? "↑" : cue.dir === "down" ? "↓" : cue.dir === "wait" ? "●" : "●";
  return (
    <View style={[vs.cueCard, { borderColor: `${accent}88`, backgroundColor: `${accent}22` }]}>
      <Animated.Text style={[vs.cueArrow, { color: accent }, arrowStyle]}>{glyph}</Animated.Text>
      <Text style={[vs.cueHeadline, { color: accent }]}>{cue.headline}</Text>
      <Text style={vs.cueSub}>{cue.sub}</Text>
    </View>
  );
}

/** Metallic slotted captive screw holding the cover */
function CaptiveScrew({ cx, cy }: { cx: number; cy: number }) {
  return (
    <G>
      <Circle cx={cx} cy={cy} r={3.8} fill="#CBD5E1" stroke="#94A3B8" strokeWidth={0.7} />
      <Circle cx={cx} cy={cy} r={3.2} fill="#E2E8F0" />
      <Line x1={cx - 2.2} y1={cy - 1.2} x2={cx + 2.2} y2={cy + 1.2} stroke="#64748B" strokeWidth={0.85} strokeLinecap="round" />
    </G>
  );
}

/** Warning sticker with lightning bolt & caution caption on DB box left */
function HazardSticker({ x, y }: { x: number; y: number }) {
  return (
    <G>
      {/* Outer yellow triangle with red border */}
      <Polygon
        points={`${x + 7.5},${y} ${x + 15},${y + 13} ${x},${y + 13}`}
        fill="#FEF08A"
        stroke="#DC2626"
        strokeWidth={1}
        strokeLinejoin="round"
      />
      {/* Black lightning bolt */}
      <Path
        d={`M${x + 8} ${y + 3} L${x + 5.8} ${y + 8} L${x + 8.2} ${y + 8} L${x + 6.8} ${y + 12} L${x + 10} ${y + 6.8} L${x + 7.8} ${y + 6.8} Z`}
        fill="#111827"
      />
      {/* Caution text micro lines */}
      <Line x1={x + 1.5} y1={y + 15.5} x2={x + 13.5} y2={y + 15.5} stroke="#DC2626" strokeWidth={0.7} />
      <Line x1={x + 2.5} y1={y + 17.5} x2={x + 12.5} y2={y + 17.5} stroke="#6B7280" strokeWidth={0.5} />
    </G>
  );
}

/** Leftmost 1-module blank spacer with vertical black expansion slits */
function BlankSpacer({ x, y, w = 10, h }: { x: number; y: number; w?: number; h: number }) {
  return (
    <G>
      <Rect x={x} y={y} width={w} height={h} rx={2} fill="#E2E8F0" stroke="#CBD5E1" strokeWidth={0.7} />
      <Rect x={x + w * 0.28} y={y + 8} width={2} height={20} rx={0.8} fill="#0F172A" />
      <Rect x={x + w * 0.62} y={y + 8} width={2} height={20} rx={0.8} fill="#0F172A" />
      <Rect x={x + w * 0.28} y={y + 36} width={2} height={20} rx={0.8} fill="#0F172A" />
      <Rect x={x + w * 0.62} y={y + 36} width={2} height={20} rx={0.8} fill="#0F172A" />
    </G>
  );
}

/**
 * Realistic 2-pole TOMZN DC / AC Miniature Circuit Breaker (MCB).
 * Supports both UP (ON) and DOWN (OFF) positions with accurate mechanical well rendering.
 */
function DualBlueMcb({
  x,
  y,
  w = 39,
  label,
  model = "TOB7Z-63",
  on,
  hot,
  accent,
  dimmed,
  onToggle,
  demoTo,
}: {
  x: number;
  y: number;
  w?: number;
  label: string;
  model?: string;
  on: boolean;
  hot: boolean;
  accent: string;
  dimmed: boolean;
  onToggle?: () => void;
  demoTo?: boolean;
}) {
  const h = 66;
  const paddleW = 9;
  const paddleH = 17;
  const fromY = on ? y + 21 : y + 31;
  const toY = demoTo === undefined ? fromY : (demoTo ? y + 21 : y + 31);
  const demo = hot && demoTo !== undefined && demoTo !== on;

  const pole1Cx = x + w * 0.26;
  const pole2Cx = x + w * 0.74;

  return (
    <G opacity={dimmed ? 0.28 : 1}>
      <HotRing x={x} y={y} w={w} h={h} hot={hot} accent={accent} />

      <Rect x={x} y={y} width={w} height={h} rx={2.5} fill={MCB_WHITE} stroke={MCB_BORDER} strokeWidth={0.8} />
      <Line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y + h} stroke={MCB_DIVIDER} strokeWidth={0.7} />

      <Circle cx={pole1Cx} cy={y + 4.5} r={2.2} fill="#E2E8F0" stroke="#CBD5E1" strokeWidth={0.5} />
      <Line x1={pole1Cx - 1.5} y1={y + 4.5} x2={pole1Cx + 1.5} y2={y + 4.5} stroke="#64748B" strokeWidth={0.7} />
      <Circle cx={pole2Cx} cy={y + 4.5} r={2.2} fill="#E2E8F0" stroke="#CBD5E1" strokeWidth={0.5} />
      <Line x1={pole2Cx - 1.5} y1={y + 4.5} x2={pole2Cx + 1.5} y2={y + 4.5} stroke="#64748B" strokeWidth={0.7} />

      <SvgText x={x + w / 2} y={y + 10} fontSize={3.8} fontWeight="900" fill="#1E40AF" textAnchor="middle">
        TOMZN
      </SvgText>
      <SvgText x={x + w / 2} y={y + 13.5} fontSize={2.7} fontWeight="700" fill="#64748B" textAnchor="middle">
        {model}
      </SvgText>
      <SvgText x={x + w - 3} y={y + 13.5} fontSize={2.3} fontWeight="700" fill="#94A3B8" textAnchor="end">
        CE
      </SvgText>

      <Rect x={pole1Cx - 3.5} y={y + 15} width={7} height={3.5} rx={0.7} fill={(demo ? demoTo : on) ? RED_FLAG : GREEN_FLAG} stroke="#334155" strokeWidth={0.4} />
      <Rect x={pole1Cx - 2.8} y={y + 15.5} width={2.5} height={1.2} rx={0.3} fill="#FFFFFF" opacity={0.5} />
      <Rect x={pole2Cx - 3.5} y={y + 15} width={7} height={3.5} rx={0.7} fill={(demo ? demoTo : on) ? RED_FLAG : GREEN_FLAG} stroke="#334155" strokeWidth={0.4} />
      <Rect x={pole2Cx - 2.8} y={y + 15.5} width={2.5} height={1.2} rx={0.3} fill="#FFFFFF" opacity={0.5} />

      <Rect x={pole1Cx - paddleW / 2} y={y + 20} width={paddleW} height={28} rx={1.5} fill="#0F172A" />
      <Rect x={pole2Cx - paddleW / 2} y={y + 20} width={paddleW} height={28} rx={1.5} fill="#0F172A" />

      <DualPaddleThrow
        pole1Cx={pole1Cx}
        pole2Cx={pole2Cx}
        paddleW={paddleW}
        paddleH={paddleH}
        fromY={fromY}
        toY={toY}
        demo={demo}
        mid={BLUE_PADDLE_MID}
        top={BLUE_PADDLE_TOP}
        bot={BLUE_PADDLE_BOT}
        ridge={BLUE_PADDLE_RIDGE}
      />

      <Circle cx={pole1Cx} cy={y + 53} r={1.8} fill="#E2E8F0" stroke="#CBD5E1" strokeWidth={0.4} />
      <Circle cx={pole2Cx} cy={y + 53} r={1.8} fill="#E2E8F0" stroke="#CBD5E1" strokeWidth={0.4} />
      <Rect x={x + 4} y={y + 56} width={w - 8} height={8} rx={2} fill="#E8EEF5" stroke="#CBD5E1" strokeWidth={0.5} />
      <SvgText x={x + w / 2} y={y + 62} fontSize={4.6} fontWeight="800" fill="#1E293B" textAnchor="middle">
        {label}
      </SvgText>
      {onToggle ? <Rect x={x} y={y} width={w} height={h} fill="transparent" onPress={onToggle} /> : null}
    </G>
  );
}

/**
 * Voltage & Current Protector Relay (Sinotimer / TOMZN SVP style).
 * Features dual red/green 7-segment digital display, LED indicators, and 4 membrane buttons.
 */
function VoltProtector({
  x,
  y,
  w = 43,
  hot,
  accent,
  dimmed,
  live,
  voltageText = "230",
  currentText = "5.2",
}: {
  x: number;
  y: number;
  w?: number;
  hot: boolean;
  accent: string;
  dimmed: boolean;
  live: boolean;
  voltageText?: string;
  currentText?: string;
}) {
  const h = 66;

  return (
    <G opacity={dimmed ? 0.28 : 1}>
      <HotRing x={x} y={y} w={w} h={h} hot={hot} accent={accent} />

      {/* Dark anthracite relay casing */}
      <Rect x={x} y={y} width={w} height={h} rx={2.5} fill="#1E242C" stroke="#0F1318" strokeWidth={0.8} />

      {/* Bezel frame around display */}
      <Rect x={x + 3} y={y + 4} width={w - 6} height={38} rx={1.8} fill="#0B0E13" />

      {/* Voltage Display (Top 7-Segment Screen) */}
      <Rect x={x + 5} y={y + 6.5} width={w - 18} height={12} rx={1.2} fill="#140606" />
      <SvgText
        x={x + (w - 18) / 2 + 5}
        y={y + 15.5}
        fontSize={8.5}
        fontWeight="800"
        fill={live ? RED_LED : "#451212"}
        textAnchor="middle"
        letterSpacing={0.4}
      >
        {live ? voltageText : "---"}
      </SvgText>
      <SvgText x={x + w - 10} y={y + 10} fontSize={2.8} fontWeight="700" fill={live ? "#F87171" : "#551919"}>
        V
      </SvgText>

      {/* Current Display (Bottom 7-Segment Screen) */}
      <Rect x={x + 5} y={y + 20.5} width={w - 18} height={12} rx={1.2} fill="#051408" />
      <SvgText
        x={x + (w - 18) / 2 + 5}
        y={y + 29.5}
        fontSize={8.5}
        fontWeight="800"
        fill={live ? GREEN_LED : "#13381B"}
        textAnchor="middle"
        letterSpacing={0.4}
      >
        {live ? currentText : "0.0"}
      </SvgText>
      <SvgText x={x + w - 10} y={y + 24} fontSize={2.8} fontWeight="700" fill={live ? "#86EFAC" : "#1A4622"}>
        A
      </SvgText>

      {/* Indicator LEDs (Over-V, Under-V, Normal) */}
      <Circle cx={x + w - 6} cy={y + 10} r={1.5} fill={live ? "#4B1515" : "#240A0A"} />
      <Circle cx={x + w - 6} cy={y + 17} r={1.5} fill={live ? "#4B3215" : "#24180A"} />
      <Circle cx={x + w - 6} cy={y + 24} r={1.5} fill={live ? GREEN_LED : "#14331B"} />

      {/* Slate blue membrane button plate */}
      <Rect x={x + 3} y={y + 44} width={w - 6} height={13} rx={1.5} fill="#273544" stroke="#1B2430" strokeWidth={0.5} />

      {/* 4 Micro tactile buttons */}
      {[0, 1, 2, 3].map((i) => {
        const btnLabels = ["M", "▲", "▼", "OK"];
        const bx = x + 5 + i * ((w - 10) / 3);
        return (
          <G key={i}>
            <Circle cx={bx} cy={y + 50.5} r={2.3} fill="#475569" stroke="#1E293B" strokeWidth={0.5} />
            <SvgText x={bx} y={y + 52} fontSize={2.6} fontWeight="700" fill="#E2E8F0" textAnchor="middle">
              {btnLabels[i]}
            </SvgText>
          </G>
        );
      })}

      {/* Bottom badge */}
      <SvgText x={x + w / 2} y={y + 63} fontSize={4.5} fontWeight="800" fill="#94A3B8" textAnchor="middle">
        VOLT
      </SvgText>
    </G>
  );
}

/**
 * Grey Changeover Switch (I - 0 - II).
 * Supports three distinct physical positions:
 * - "up"     (Position I  — Solar)
 * - "center" (Position 0  — OFF / Disconnected)
 * - "down"   (Position II — Bypass / Direct WAPDA)
 */
function GreyChangeover({
  x,
  y,
  w = 40,
  position,
  hot,
  accent,
  dimmed,
  onCycle,
  demoTo,
}: {
  x: number;
  y: number;
  w?: number;
  position: "up" | "center" | "down";
  hot: boolean;
  accent: string;
  dimmed: boolean;
  onCycle?: () => void;
  demoTo?: "up" | "center" | "down";
}) {
  const h = 66;

  const paddleW = 9;
  const paddleH = 17;
  const fromY = greyPaddleY(y, position);
  const toY = greyPaddleY(y, demoTo ?? position);
  const demo = hot && demoTo !== undefined && demoTo !== position;
  const shown = demo && demoTo ? demoTo : position;

  const pole1Cx = x + w * 0.26;
  const pole2Cx = x + w * 0.74;

  return (
    <G opacity={dimmed ? 0.28 : 1}>
      <HotRing x={x} y={y} w={w} h={h} hot={hot} accent={accent} />

      <Rect x={x} y={y} width={w} height={h} rx={2.5} fill="#E2E7ED" stroke="#9EABB8" strokeWidth={0.8} />
      <Line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y + h} stroke="#B8C4D0" strokeWidth={0.7} />

      <SvgText x={x + w / 2} y={y + 10} fontSize={4.6} fontWeight="900" fill="#334155" textAnchor="middle" letterSpacing={1.2}>
        I  0  II
      </SvgText>
      <Line x1={x + 6} y1={y + 13} x2={x + w - 6} y2={y + 13} stroke="#94A3B8" strokeWidth={0.6} />

      <Circle cx={pole1Cx} cy={y + 15} r={1.2} fill={shown === "up" ? GREEN_FLAG : "#CBD5E1"} />
      <Circle cx={x + w / 2} cy={y + 15} r={1.2} fill={shown === "center" ? AMBER_LED : "#CBD5E1"} />
      <Circle cx={pole2Cx} cy={y + 15} r={1.2} fill={shown === "down" ? "#38BDF8" : "#CBD5E1"} />

      <Rect x={pole1Cx - paddleW / 2} y={y + 18} width={paddleW} height={32} rx={1.5} fill="#0F172A" />
      <Rect x={pole2Cx - paddleW / 2} y={y + 18} width={paddleW} height={32} rx={1.5} fill="#0F172A" />

      <DualPaddleThrow
        pole1Cx={pole1Cx}
        pole2Cx={pole2Cx}
        paddleW={paddleW}
        paddleH={paddleH}
        fromY={fromY}
        toY={toY}
        demo={demo}
        mid={GREY_PADDLE_MID}
        top={GREY_PADDLE_TOP}
        bot={GREY_PADDLE_BOT}
        ridge={GREY_PADDLE_RIDGE}
      />

      <Rect x={x + 4} y={y + 56} width={w - 8} height={8} rx={2} fill={shown === "down" ? "#CBD5E1" : "#E2E8F0"} stroke="#94A3B8" strokeWidth={0.5} />
      <SvgText x={x + w / 2} y={y + 62} fontSize={4.5} fontWeight="800" fill={shown === "down" ? "#0F172A" : "#334155"} textAnchor="middle">
        {shown === "up" ? "SOLAR" : shown === "down" ? "BYPASS" : "OFF"}
      </SvgText>

      {onCycle ? <Rect x={x} y={y} width={w} height={h} fill="transparent" onPress={onCycle} /> : null}
    </G>
  );
}

/**
 * Smart TOMZN Tuya WiFi Energy Meter / Relay.
 * Matches the real photo:
 * - No blue lever (controlled purely via digital circuit & front 4 orange buttons).
 * - Top: Red PWR LED, Green RUN (WiFi) LED, and TOMZN brand label.
 * - Center: Large Color LCD Screen (Navy blue background with glowing cyan digital telemetry).
 * - Bottom: 4 distinct tactile orange push-buttons (Menu, Up, Down, OK/Power).
 */
function TomznSmartMeter({
  x,
  y,
  w = 58,
  on,
  hot,
  accent,
  dimmed,
  onToggle,
}: {
  x: number;
  y: number;
  w?: number;
  on: boolean;
  hot: boolean;
  accent: string;
  dimmed: boolean;
  onToggle?: () => void;
}) {
  const h = 66;

  return (
    <G opacity={dimmed ? 0.28 : 1}>
      <HotRing x={x} y={y} w={w} h={h} hot={hot} accent={accent} />

      {/* Main DIN housing */}
      <Rect x={x} y={y} width={w} height={h} rx={2.5} fill={MCB_WHITE} stroke={MCB_BORDER} strokeWidth={0.8} />

      {/* Top terminal screws */}
      <Circle cx={x + 12} cy={y + 4.5} r={2} fill="#E2E8F0" stroke="#CBD5E1" strokeWidth={0.5} />
      <Line x1={x + 10.5} y1={y + 4.5} x2={x + 13.5} y2={y + 4.5} stroke="#64748B" strokeWidth={0.7} />
      <Circle cx={x + w - 12} cy={y + 4.5} r={2} fill="#E2E8F0" stroke="#CBD5E1" strokeWidth={0.5} />
      <Line x1={x + w - 13.5} y1={y + 4.5} x2={x + w - 10.5} y2={y + 4.5} stroke="#64748B" strokeWidth={0.7} />

      {/* Brand & Status LEDs at top */}
      <SvgText x={x + w / 2} y={y + 9} fontSize={3.6} fontWeight="900" fill="#1E40AF" textAnchor="middle">
        TOMZN
      </SvgText>

      {/* Red PWR LED */}
      <Circle cx={x + 9} cy={y + 11} r={1.6} fill={RED_LED} />
      <SvgText x={x + 9} y={y + 14.5} fontSize={2.4} fontWeight="700" fill="#64748B" textAnchor="middle">
        PWR
      </SvgText>

      {/* Green RUN / WiFi LED */}
      <Circle cx={x + w - 9} cy={y + 11} r={1.6} fill={on ? GREEN_LED : "#1E3A24"} />
      {hot ? <RunLedPulse cx={x + w - 9} cy={y + 11} /> : null}
      <SvgText x={x + w - 9} y={y + 14.5} fontSize={2.4} fontWeight="700" fill="#64748B" textAnchor="middle">
        RUN
      </SvgText>

      {/* Color LCD Screen Window */}
      <Rect x={x + 4} y={y + 16} width={w - 8} height={26} rx={1.8} fill="#0A111A" stroke="#1E293B" strokeWidth={0.6} />
      <Rect x={x + 5} y={y + 17} width={w - 10} height={24} rx={1.2} fill="#07192F" />

      {/* LCD Screen Display Content */}
      <SvgText x={x + 9} y={y + 24} fontSize={5.4} fontWeight="800" fill={on ? "#38BDF8" : "#1E3A5F"}>
        {on ? "230 V" : "--- V"}
      </SvgText>
      <SvgText x={x + 9} y={y + 31} fontSize={5.4} fontWeight="800" fill={on ? "#38BDF8" : "#1E3A5F"}>
        {on ? "5.2 A" : "OFF"}
      </SvgText>
      <SvgText x={x + 9} y={y + 38} fontSize={4.4} fontWeight="700" fill={on ? "#4ADE80" : "#143522"}>
        {on ? "1.2 kW" : "--"}
      </SvgText>

      {/* WiFi icon at top-right of LCD screen */}
      <Path
        d={`M${x + w - 12} ${y + 20} A2.8 2.8 0 0 1 ${x + w - 8} ${y + 20} M${x + w - 11} ${y + 22} A1.4 1.4 0 0 1 ${x + w - 9} ${y + 22}`}
        stroke={on ? "#38BDF8" : "#1E3A5F"}
        strokeWidth={0.7}
        fill="none"
      />
      <Circle cx={x + w - 10} cy={y + 23.5} r={0.5} fill={on ? "#38BDF8" : "#1E3A5F"} />

      {/* 4 Tactile Orange Push Buttons (Controlled purely via these buttons) */}
      {[0, 1, 2, 3].map((i) => {
        const btnLabels = ["M", "▲", "▼", "OK"];
        const btnW = (w - 16) / 4;
        const bx = x + 5 + i * (btnW + 2);
        return (
          <G key={i}>
            <Rect x={bx} y={y + 44} width={btnW} height={6.6} rx={1.2} fill={ORANGE_BTN} stroke={ORANGE_BTN_BORDER} strokeWidth={0.5} />
            <SvgText x={bx + btnW / 2} y={y + 48.8} fontSize={3} fontWeight="800" fill="#FFFFFF" textAnchor="middle">
              {btnLabels[i]}
            </SvgText>
          </G>
        );
      })}

      {/* Bottom Label Badge */}
      <Rect x={x + 4} y={y + 55} width={w - 8} height={8} rx={2} fill="#E8EEF5" stroke="#CBD5E1" strokeWidth={0.5} />
      <SvgText x={x + w / 2} y={y + 61} fontSize={4.4} fontWeight="800" fill="#1E40AF" textAnchor="middle">
        TOMZN WiFi
      </SvgText>

      {/* Invisible touch target overlay */}
      {onToggle ? <Rect x={x} y={y} width={w} height={h} fill="transparent" onPress={onToggle} /> : null}
    </G>
  );
}


/**
 * The complete Distribution Board (DB Box) Enclosure.
 * Recreated accurately from the user's uploaded real-life photo:
 * - Beveled white consumer unit box
 * - Translucent smoked hinged lid open at the top with hinge brackets
 * - Bottom finger latch indent
 * - Left & right slotted captive screws
 * - Danger hazard triangle sticker on the left
 * - Blank expansion slot
 * - Dual PV TOMZN DC breakers
 * - Voltage & Current protector relay with dual digital readout
 * - Grey changeover switch (I - 0 - II)
 * - WAPDA input breaker
 * - Smart TOMZN WiFi energy meter / breaker
 */
function WhiteDb({
  highlight,
  flags,
  accent,
  interactive,
  boardState,
  onTogglePv,
  onCycleGrey,
  onToggleWapdaIn,
  onToggleTomzn,
  guideApply,
}: {
  highlight: OpsDevice;
  flags: OpsFlags;
  accent: string;
  interactive: boolean;
  boardState: BoardSwitchState;
  onTogglePv?: () => void;
  onCycleGrey?: () => void;
  onToggleWapdaIn?: () => void;
  onToggleTomzn?: () => void;
  guideApply?: Partial<BoardSwitchState>;
}) {
  const pvOn = boardState.pv;
  const greyPos = boardState.grey;
  const wapdaInOn = boardState.wapdaIn;
  const tomznOn = boardState.tomzn;

  const dim = (device: OpsDevice) => {
    if (highlight === "none") return false;
    if (highlight === device) return false;
    if ((highlight === "volt" || highlight === "tomzn") && (device === "volt" || device === "tomzn")) return false;
    return true;
  };

  // Layout coordinates for 340 width viewBox
  const boxX = 10;
  const boxY = 26;
  const boxW = 320;
  const boxH = 96;

  const railX = 24;
  const railY = 38;
  const railW = 292;
  const railH = 72;

  // DIN rail modules: Left to Right, filling the entire rail with clean balanced spacing
  const spacerX = 28;
  const spacerW = 10;

  const pv1X = 41;
  const pv1W = 39;

  const pv2X = 82;
  const pv2W = 39;

  const voltX = 123;
  const voltW = 43;

  const greyX = 168;
  const greyW = 40;

  const inX = 210;
  const inW = 39;

  const tomznX = 251;
  const tomznW = 59;

  const modY = 41;
  const throwDir = throwDirFor(highlight, guideApply);
  const arrowY = throwDir === "down" ? 122 : 34;

  return (
    <G>
      {/* --- Open Hinged Smoky/Translucent Lid --- */}
      <Polygon
        points={`${boxX + 24},6 ${boxX + boxW - 24},6 ${boxX + boxW - 8},${boxY} ${boxX + 8},${boxY}`}
        fill="#DDE5EE"
        fillOpacity={0.88}
        stroke="#B4C0D0"
        strokeWidth={1.2}
      />
      {/* Glare/reflection highlight across the visor */}
      <Polygon
        points={`${boxX + 40},8 ${boxX + boxW - 80},8 ${boxX + boxW - 50},${boxY - 4} ${boxX + 70},${boxY - 4}`}
        fill="#FFFFFF"
        opacity={0.35}
      />
      {/* Hinge brackets connecting lid to box */}
      <Rect x={boxX + 48} y={boxY - 4} width={12} height={6} rx={1.5} fill="#CBD5E1" stroke="#94A3B8" strokeWidth={0.7} />
      <Rect x={boxX + boxW - 60} y={boxY - 4} width={12} height={6} rx={1.5} fill="#CBD5E1" stroke="#94A3B8" strokeWidth={0.7} />

      {/* --- DB Box Enclosure Body --- */}
      {/* Outer beveled frame */}
      <Rect x={boxX} y={boxY} width={boxW} height={boxH} rx={9} fill={DB_BG} stroke={DB_FRAME} strokeWidth={1.5} />
      {/* Inner molded ridge */}
      <Rect x={boxX + 3} y={boxY + 3} width={boxW - 6} height={boxH - 6} rx={7} fill="#F4F7FA" />

      {/* Bottom center finger latch notch */}
      <Rect x={boxX + boxW / 2 - 18} y={boxY + boxH - 5.5} width={36} height={4.5} rx={2} fill="#CBD5E1" />

      {/* Captive screws on left and right border */}
      <CaptiveScrew cx={boxX + 9} cy={boxY + boxH / 2} />
      <CaptiveScrew cx={boxX + boxW - 9} cy={boxY + boxH / 2} />

      {/* Hazard Warning Label on the left rim */}
      <HazardSticker x={boxX + 8} y={boxY + 8} />

      {/* --- Deep Recessed DIN Rail Cutout --- */}
      <Rect x={railX} y={railY} width={railW} height={railH} rx={4} fill={RAIL_BG} stroke="#0A0D12" strokeWidth={1} />
      {/* Steel DIN Rail Strip */}
      <Rect x={railX} y={railY + 26} width={railW} height={20} fill={RAIL_STEEL} />
      <Line x1={railX} y1={railY + 28} x2={railX + railW} y2={railY + 28} stroke="#3E4756" strokeWidth={0.8} />
      <Line x1={railX} y1={railY + 44} x2={railX + railW} y2={railY + 44} stroke="#3E4756" strokeWidth={0.8} />

      {/* --- DIN Rail Modules (Left to Right) --- */}
      {/* 0: Blank Spacer */}
      <BlankSpacer x={spacerX} y={modY} w={spacerW} h={66} />

      {/* 1: PV1 DC Breaker (Blue Levers) */}
      <DualBlueMcb
        x={pv1X}
        y={modY}
        w={pv1W}
        label="PV1"
        model="TOB7Z-63"
        on={pvOn}
        hot={highlight === "pv"}
        accent={accent}
        dimmed={dim("pv")}
        onToggle={interactive ? onTogglePv : undefined}
        demoTo={highlight === "pv" ? guideApply?.pv : undefined}
      />

      {/* 2: PV2 DC Breaker (Blue Levers) */}
      <DualBlueMcb
        x={pv2X}
        y={modY}
        w={pv2W}
        label="PV2"
        model="TOB7Z-63"
        on={pvOn}
        hot={highlight === "pv"}
        accent={accent}
        dimmed={dim("pv")}
        onToggle={interactive ? onTogglePv : undefined}
        demoTo={highlight === "pv" ? guideApply?.pv : undefined}
      />

      {/* 3: Voltage & Current Protector Relay */}
      <VoltProtector
        x={voltX}
        y={modY}
        w={voltW}
        hot={highlight === "volt" || highlight === "tomzn"}
        accent={accent}
        dimmed={dim("volt")}
        live={flags.homeOnSolar || flags.wapdaOn}
        voltageText={flags.wapdaOn ? "230" : "224"}
        currentText={flags.homeOnSolar ? "5.2" : "0.0"}
      />

      {/* 4: Grey Changeover Switch (I - 0 - II) */}
      <GreyChangeover
        x={greyX}
        y={modY}
        w={greyW}
        position={greyPos}
        hot={highlight === "grey"}
        accent={accent}
        dimmed={dim("grey")}
        onCycle={interactive ? onCycleGrey : undefined}
        demoTo={highlight === "grey" ? guideApply?.grey : undefined}
      />

      {/* 5: WAPDA Input Breaker (Blue Levers) */}
      <DualBlueMcb
        x={inX}
        y={modY}
        w={inW}
        label="IN"
        model="TOB1-63H"
        on={wapdaInOn}
        hot={highlight === "wapdaIn"}
        accent={accent}
        dimmed={dim("wapdaIn")}
        onToggle={interactive ? onToggleWapdaIn : undefined}
        demoTo={highlight === "wapdaIn" ? guideApply?.wapdaIn : undefined}
      />

      {/* 6: Smart TOMZN WiFi Energy Meter / Breaker */}
      <TomznSmartMeter
        x={tomznX}
        y={modY}
        w={tomznW}
        on={tomznOn}
        hot={highlight === "tomzn"}
        accent={accent}
        dimmed={dim("tomzn")}
        onToggle={interactive ? onToggleTomzn : undefined}
      />

      {throwDir ? (
        highlight === "pv" ? (
          <G>
            <BounceArrow x={pv1X + pv1W / 2} y={arrowY} dir={throwDir} fill={accent} />
            <BounceArrow x={pv2X + pv2W / 2} y={arrowY} dir={throwDir} fill={accent} />
          </G>
        ) : highlight === "grey" ? (
          <BounceArrow x={greyX + greyW / 2} y={arrowY} dir={throwDir} fill={accent} />
        ) : highlight === "wapdaIn" ? (
          <BounceArrow x={inX + inW / 2} y={arrowY} dir={throwDir} fill={accent} />
        ) : null
      ) : null}
    </G>
  );
}


function RunLedPulse({ cx, cy }: { cx: number; cy: number }) {
  const s = useSharedValue(1.6);
  useEffect(() => {
    s.value = withRepeat(
      withSequence(
        withTiming(5.2, { duration: 700, easing: Easing.out(Easing.quad) }),
        withTiming(1.6, { duration: 700, easing: Easing.in(Easing.quad) }),
      ),
      -1,
    );
  }, [s]);
  const ap = useAnimatedProps(() => ({ r: s.value, opacity: 0.85 - (s.value - 1.6) * 0.12 }));
  return <AnimatedCircle animatedProps={ap} cx={cx} cy={cy} fill={GREEN_LED} />;
}

function PressPulse({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }) {
  const s = useSharedValue(r);
  useEffect(() => {
    s.value = withRepeat(
      withSequence(
        withTiming(r * 1.45, { duration: 380, easing: Easing.out(Easing.quad) }),
        withDelay(90, withTiming(r, { duration: 280, easing: Easing.in(Easing.quad) })),
      ),
      -1,
    );
  }, [r, s]);
  const ap = useAnimatedProps(() => ({ r: s.value, opacity: 1.25 - s.value / (r * 2) }));
  return <AnimatedCircle animatedProps={ap} cx={cx} cy={cy} fill={fill} />;
}

function InverterStepView({ hot, accent, on }: { hot: boolean; accent: string; on: boolean }) {
  const hotProps = usePulse(hot);
  const cx = 170;
  const cy = 78;
  return (
    <G>
      {hot ? (
        <AnimatedRect animatedProps={hotProps} x={cx - 48} y={cy - 58} width={96} height={118} rx={10} fill={accent} />
      ) : null}
      <Rect x={cx - 44} y={cy - 54} width={88} height={108} rx={6} fill="#C43B3B" stroke="#8E2A2A" strokeWidth={1.3} />
      <Circle cx={cx} cy={cy - 28} r={16} fill="#1A1A1A" />
      <Circle cx={cx} cy={cy - 28} r={12} fill="#111" />
      <Circle cx={cx - 8} cy={cy - 30} r={2} fill={on ? GREEN_LED : "#444"} />
      <SvgText x={cx} y={cy + 8} fontSize={9} fontWeight="700" fill="#FFD5D5" textAnchor="middle">
        FRONUS
      </SvgText>
      <SvgText x={cx} y={cy + 20} fontSize={6} fill="#E8A0A0" textAnchor="middle">
        SOLAR ENERGY
      </SvgText>
      {hot ? <PressPulse cx={cx} cy={cy + 36} r={10} fill="#FF6B6B" /> : null}
      <Circle cx={cx} cy={cy + 36} r={10} fill="#A83232" />
      <Circle cx={cx} cy={cy + 36} r={4} fill="#F8D2D2" />
      <SvgText x={cx} y={cy + 68} fontSize={8} fontWeight="700" fill={hot ? accent : "#6B7A8F"} textAnchor="middle">
        Press this button · left light = on
      </SvgText>
    </G>
  );
}

function DongleStepView({ hot, accent, retry }: { hot: boolean; accent: string; retry?: boolean }) {
  const hotProps = usePulse(hot);
  return (
    <G>
      <Rect x={70} y={48} width={200} height={70} rx={8} fill="#F2F4F7" stroke="#D0D6DE" strokeWidth={1.3} />
      {hot ? (
        <AnimatedRect animatedProps={hotProps} x={138} y={16} width={64} height={36} rx={6} fill={accent} />
      ) : null}
      <Rect x={142} y={20} width={56} height={28} rx={3} fill="#C4A574" stroke="#9A7A4A" strokeWidth={0.8} />
      <Path d="M170 28 C176 28 180 32 180 36 C180 32 184 28 190 28" stroke="#3A2A18" strokeWidth={1.2} fill="none" />
      {hot ? <PressPulse cx={180} cy={38} r={4} fill="#F59E0B" /> : null}
      <Circle cx={180} cy={38} r={2.2} fill="#3A2A18" />
      <Path d="M198 34 L214 40" stroke="#3B82F6" strokeWidth={2} />
      <SvgText x={170} y={128} fontSize={7} fontWeight="700" fill="#6B7A8F" textAnchor="middle">
        Wi‑Fi dongle on top of the DB
      </SvgText>
      <SvgText x={170} y={140} fontSize={8} fontWeight="800" fill={hot ? accent : "#6B7A8F"} textAnchor="middle">
        {retry ? "Press the side button again" : "Press the side button once"}
      </SvgText>
    </G>
  );
}

function GreenStepView({
  hot,
  accent,
  flags,
  target,
}: {
  hot: boolean;
  accent: string;
  flags: OpsFlags;
  target?: "meter1" | "meter2";
}) {
  const hotProps = usePulse(hot);
  // Physical WAHID: Meter 2 is UP, Meter 1 is DOWN.
  const fromY = flags.meter === "meter1" ? 96 : 48;
  const toY = target === "meter1" ? 96 : target === "meter2" ? 48 : fromY;
  const demo = hot && target !== undefined && Math.abs(toY - fromY) > 1;
  const y = useThrowY(fromY, toY, demo);
  const handle = useAnimatedProps(() => ({ y: y.value - 8 }));
  const stem = useAnimatedProps(() => ({ y2: y.value }));
  const shown: "meter1" | "meter2" = target ?? flags.meter;
  const dir = greenLeverDir(shown);

  return (
    <G>
      {hot ? (
        <AnimatedRect animatedProps={hotProps} x={118} y={28} width={88} height={108} rx={14} fill={accent} />
      ) : null}
      <Rect x={122} y={32} width={80} height={100} rx={12} fill="#8FCB9B" stroke="#6EAA7C" strokeWidth={1.3} />
      <Rect x={132} y={48} width={52} height={48} rx={3} fill="#D8DEE4" />
      <SvgText x={158} y={62} fontSize={8} fontWeight="800" fill="#1A1A1A" textAnchor="middle">
        WAHID
      </SvgText>
      <SvgText x={158} y={74} fontSize={6} fontWeight="700" fill="#333" textAnchor="middle">
        CHANGE OVER
      </SvgText>
      <SvgText x={158} y={88} fontSize={5} fill="#555" textAnchor="middle">
        M2 up  ·  M1 down
      </SvgText>
      <Circle cx={202} cy={82} r={8} fill="#6B3FA0" />
      <AnimatedLine animatedProps={stem} x1={202} y1={82} x2={210} stroke="#1A1A1A" strokeWidth={3} strokeLinecap="round" />
      <AnimatedRect animatedProps={handle} x={205} width={14} height={16} rx={4} fill="#1A1A1A" />
      {hot ? <BounceArrow x={228} y={dir === "up" ? 48 : 100} dir={dir} fill={accent} /> : null}
      <SvgText x={170} y={150} fontSize={8} fontWeight="700" fill={hot ? accent : "#6B7A8F"} textAnchor="middle">
        {`Throw the lever ${greenLeverWord(shown)} to ${shown === "meter1" ? "Meter 1" : "Meter 2"}`}
      </SvgText>
    </G>
  );
}

export const OpsBoardVisual = memo(function OpsBoardVisual({
  mode,
  boardState,
  onBoardStateChange,
  highlight,
  flags,
  accent,
  stepN,
  stepTotal,
  stepText,
  stepDetail,
  guideApply,
  greenTarget,
  focusOverride,
  bare,
  dongleRetry,
}: Props) {
  const interactive = mode === "interactive";
  const focus = focusOverride ?? focusFor(highlight);
  const cue = !interactive ? moveCue(guideApply, highlight, stepText, greenTarget) : null;

  const togglePv = () => {
    if (!interactive || !onBoardStateChange) return;
    onBoardStateChange({ ...boardState, pv: !boardState.pv });
  };

  const cycleGrey = () => {
    if (!interactive || !onBoardStateChange) return;
    const next = boardState.grey === "up" ? "center" : boardState.grey === "center" ? "down" : "up";
    onBoardStateChange({ ...boardState, grey: next });
  };

  const toggleWapdaIn = () => {
    if (!interactive || !onBoardStateChange) return;
    onBoardStateChange({ ...boardState, wapdaIn: !boardState.wapdaIn });
  };

  const toggleTomzn = () => {
    if (!interactive || !onBoardStateChange) return;
    onBoardStateChange({ ...boardState, tomzn: !boardState.tomzn });
  };

  const stepLabel = stepN && stepTotal ? `Step ${stepN} of ${stepTotal}` : null;
  const height = 168;

  return (
    <View style={[vs.wrap, (interactive || bare) && vs.wrapCompact]}>
      {!interactive && !bare ? (
        <View style={vs.headerRow}>
          {stepLabel ? <Text style={vs.caption}>{stepLabel}</Text> : <View />}
        </View>
      ) : null}

      {!interactive && !bare && cue ? (
        <MoveCueBanner cue={cue} accent={accent} />
      ) : null}

      {!interactive && !bare && !cue && stepText ? (
        <Text style={vs.guideDetail}>{stepText}</Text>
      ) : null}

      {!interactive && !bare && cue && stepDetail ? (
        <Text style={vs.guideDetail}>{stepDetail}</Text>
      ) : null}

      <Svg width="100%" height={height} viewBox="0 0 340 148">
        <Defs>
          <LinearGradient id="dbTop" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#F8FAFC" />
            <Stop offset="1" stopColor="#E2E8F0" />
          </LinearGradient>
        </Defs>

        {focus === "db" ? (
          <WhiteDb
            highlight={highlight}
            flags={flags}
            accent={accent}
            interactive={interactive}
            boardState={boardState}
            onTogglePv={togglePv}
            onCycleGrey={cycleGrey}
            onToggleWapdaIn={toggleWapdaIn}
            onToggleTomzn={toggleTomzn}
            guideApply={guideApply}
          />
        ) : null}
        {focus === "inverter" ? <InverterStepView hot={true} accent={accent} on={flags.inverterUp} /> : null}
        {focus === "dongle" ? <DongleStepView hot={true} accent={accent} retry={dongleRetry} /> : null}
        {focus === "green" ? (
          <GreenStepView hot={true} accent={accent} flags={flags} target={greenTarget} />
        ) : null}
      </Svg>
    </View>
  );
});

const vs = StyleSheet.create({
  wrap: {
    marginTop: 4,
    marginBottom: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(138,155,174,0.14)",
  },
  wrapCompact: {
    marginTop: 0,
    paddingTop: 0,
    borderTopWidth: 0,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  caption: {
    fontFamily: "Outfit",
    fontSize: 9,
    fontWeight: "700",
    color: "#8A9BAE",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  guideDetail: {
    fontFamily: "Outfit",
    fontSize: 12,
    fontWeight: "500",
    color: "#9AABBC",
    lineHeight: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  cueCard: {
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  cueArrow: {
    fontFamily: "Outfit",
    fontSize: 32,
    fontWeight: "800",
    lineHeight: 36,
    marginBottom: 2,
  },
  cueHeadline: {
    fontFamily: "Outfit",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.4,
    textAlign: "center",
  },
  cueSub: {
    fontFamily: "Outfit",
    fontSize: 12,
    fontWeight: "500",
    color: "#C5D0DC",
    lineHeight: 16,
    textAlign: "center",
    marginTop: 4,
  },
});

