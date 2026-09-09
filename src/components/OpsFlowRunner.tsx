import type { CardTheme } from "@/components/NewDashboardCards";
import { OpsBoardVisual, type BoardSwitchState } from "@/components/OpsBoardVisual";
import { useEnergy } from "@/context/EnergyContext";
import type { OpsDevice, OpsFlags, OpsGoalId } from "@/utils/ops-guide";
import {
  autoJump,
  advance,
  DONGLE_WAIT_SEC,
  GREEN_WAIT_SEC,
  screenFor,
  startNode,
  type FlowChoice,
  type FlowLive,
  type FlowMemory,
} from "@/utils/ops-workflows";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

function focusForDevice(device: OpsDevice): "db" | "inverter" | "dongle" | "green" {
  if (device === "inverter") return "inverter";
  if (device === "dongle") return "dongle";
  if (device === "green") return "green";
  return "db";
}

function Fade({ id, children }: { id: string; children: React.ReactNode }) {
  const opacity = useSharedValue(0);
  const y = useSharedValue(10);
  useEffect(() => {
    opacity.value = 0;
    y.value = 10;
    opacity.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.cubic) });
    y.value = withTiming(0, { duration: 280, easing: Easing.out(Easing.cubic) });
  }, [id, opacity, y]);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

export const OpsFlowRunner = memo(function OpsFlowRunner({
  goal,
  board,
  flags,
  live,
  accent,
  cardTheme,
  onBoardChange,
  onDone,
}: {
  goal: OpsGoalId;
  board: BoardSwitchState;
  flags: OpsFlags;
  live: FlowLive;
  accent: string;
  cardTheme: CardTheme;
  onBoardChange: (next: BoardSwitchState) => void;
  onDone: () => void;
}) {
  const { refreshInverterForce } = useEnergy();
  const [node, setNode] = useState(() => startNode(goal, board, live));
  const [mem, setMem] = useState<FlowMemory>({ powerTries: 0, dongleTries: 0 });
  const [waitLeft, setWaitLeft] = useState<number | null>(null);
  const boardRef = useRef(board);
  boardRef.current = board;
  const liveRef = useRef(live);
  liveRef.current = live;
  const memRef = useRef(mem);
  memRef.current = mem;

  const screen = useMemo(
    () => screenFor(goal, node, board, live, mem, waitLeft ?? undefined),
    [goal, node, board, live, mem, waitLeft],
  );

  useEffect(() => {
    if (screen.kind !== "wait") {
      setWaitLeft(null);
      return;
    }
    const sec = node === "green-wait" ? GREEN_WAIT_SEC : node === "dongle-wait" ? DONGLE_WAIT_SEC : screen.waitSec ?? 0;
    setWaitLeft(sec);
  }, [node, screen.kind, screen.waitSec]);

  useEffect(() => {
    if (waitLeft == null || waitLeft <= 0) return;
    const t = setTimeout(() => setWaitLeft((n) => (n == null || n <= 0 ? n : n - 1)), 1000);
    return () => clearTimeout(t);
  }, [waitLeft]);

  useEffect(() => {
    const jump = autoJump(goal, node, boardRef.current, liveRef.current, memRef.current, waitLeft);
    if (!jump) return;
    if (jump.node === "done") {
      onDone();
      return;
    }
    if (jump.node !== node) {
      setNode(jump.node);
      setMem(jump.mem);
    }
  }, [goal, node, waitLeft, live.flags.inverterUp, live.flags.wapdaOn, live.loadW, live.voltV, onDone]);

  useEffect(() => {
    if (node !== "dongle-wait" && node !== "green-wait" && node !== "wait-wapda") return;
    void refreshInverterForce();
    const poll = setInterval(() => { void refreshInverterForce(); }, 4000);
    return () => clearInterval(poll);
  }, [node, refreshInverterForce]);

  const go = (choice: FlowChoice) => {
    const current = screenFor(goal, node, boardRef.current, liveRef.current, memRef.current, waitLeft ?? undefined);
    if (choice === "primary" && current.apply) {
      const nextBoard = { ...boardRef.current, ...current.apply };
      onBoardChange(nextBoard);
      boardRef.current = nextBoard;
    }
    const next = advance(goal, node, choice, boardRef.current, liveRef.current, memRef.current);
    setMem(next.mem);
    if (next.node === "done") {
      onDone();
      return;
    }
    setNode(next.node);
  };

  const highlight: OpsDevice = screen.device;
  const waiting = screen.kind === "wait";
  const showVisual = screen.device !== "none";
  const greenTarget = screen.device === "green"
    ? (goal === "meter-1" ? "meter1" as const : "meter2" as const)
    : undefined;

  return (
    <Fade id={`${goal}-${node}`}>
      <Text style={s.live}>{screen.live}</Text>
      <Text style={[s.hint, { color: cardTheme.textSecondary }]}>{screen.hint}</Text>
      {waiting ? (
        <View style={s.spin}>
          <ActivityIndicator color={accent} />
        </View>
      ) : null}
      {showVisual ? (
        <OpsBoardVisual
          mode="guide"
          boardState={board}
          highlight={highlight}
          flags={flags}
          accent={accent}
          stepText={screen.title}
          stepDetail={screen.hint}
          guideApply={screen.apply}
          greenTarget={greenTarget}
          focusOverride={focusForDevice(screen.device)}
          bare={screen.kind === "wait" || screen.kind === "hold"}
          dongleRetry={mem.dongleTries > 0}
        />
      ) : null}

      {screen.primary ? (
        <Pressable onPress={() => go("primary")} style={[s.btn, { backgroundColor: accent }]}>
          <Text style={s.btnText}>{screen.primary}</Text>
        </Pressable>
      ) : null}
      {screen.secondary ? (
        <Pressable onPress={() => go("secondary")} style={s.btnGhost}>
          <Text style={[s.btnGhostText, { color: cardTheme.textSecondary }]}>{screen.secondary}</Text>
        </Pressable>
      ) : null}
    </Fade>
  );
});

const s = StyleSheet.create({
  live: {
    fontFamily: "Outfit",
    fontSize: 11,
    fontWeight: "600",
    color: "#8A9BAE",
    textAlign: "center",
    marginBottom: 6,
  },
  hint: {
    fontFamily: "Outfit",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  spin: {
    alignItems: "center",
    marginBottom: 8,
  },
  btn: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  btnText: {
    fontFamily: "Outfit",
    fontSize: 14,
    fontWeight: "700",
    color: "#0B1220",
    textAlign: "center",
  },
  btnGhost: {
    marginTop: 6,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnGhostText: {
    fontFamily: "Outfit",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
});
