import type { CardTheme } from "@/components/NewDashboardCards";
import { OpsBoardVisual, type BoardSwitchState } from "@/components/OpsBoardVisual";
import { OpsFlowRunner } from "@/components/OpsFlowRunner";
import { useEnergy } from "@/context/EnergyContext";
import { inferBoardFromLive, inverterPowerHint } from "@/utils/ops-board-infer";
import {
  possibleOpsGoals,
  type OpsAnchor,
  type OpsGoal,
  type OpsGuide,
  type OpsSeverity,
} from "@/utils/ops-guide";
import { startNode, type FlowLive } from "@/utils/ops-workflows";
import { Check, HelpCircle, X } from "lucide-react-native";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export const SEVERITY_COLOR: Record<OpsSeverity, string> = {
  ok: "#32E56B",
  info: "#548EFF",
  warn: "#F8C653",
  alert: "#EF4C4C",
};

export function OpsHelpBadge({
  active,
  color,
}: {
  active: boolean;
  color: string;
}) {
  if (!active) return null;
  return (
    <View style={[s.badge, { backgroundColor: `${color}22`, borderColor: `${color}88` }]}>
      <HelpCircle size={11} color={color} strokeWidth={2.4} />
    </View>
  );
}

type SheetPhase = "setup" | "goal" | "flow" | "done";

export const OpsGuideSheet = memo(function OpsGuideSheet({
  visible,
  onClose,
  guide,
  cardTheme,
}: {
  visible: boolean;
  onClose: () => void;
  guide: OpsGuide;
  cardTheme: CardTheme;
  anchor: OpsAnchor;
}) {
  const insets = useSafeAreaInsets();
  const color = SEVERITY_COLOR[guide.severity];
  const { flags } = guide;
  const {
    boardGuess,
    saveBoardSwitches,
    inverter,
    tomznLive,
    gridFlow,
  } = useEnergy();

  const guessBoard = (): BoardSwitchState => inferBoardFromLive({
    inverter,
    tomznLive,
    gridFlow,
    serverGuess: boardGuess,
  });

  const [phase, setPhase] = useState<SheetPhase>("setup");
  const [boardState, setBoardState] = useState<BoardSwitchState>(guessBoard);
  const [goal, setGoal] = useState<OpsGoal | null>(null);
  const [saving, setSaving] = useState(false);
  const predictedRef = useRef<BoardSwitchState>(boardState);

  const live: FlowLive = useMemo(() => ({
    flags,
    solarW: inverter.solarW || 0,
    voltV: tomznLive.voltageV || inverter.gridV || 0,
    loadW: Math.max(inverter.loadW || 0, tomznLive.powerW || 0),
    hour: new Date().getHours(),
  }), [
    flags,
    inverter.solarW,
    inverter.gridV,
    inverter.loadW,
    tomznLive.voltageV,
    tomznLive.powerW,
  ]);

  useEffect(() => {
    if (!visible) return;
    setPhase("setup");
    setGoal(null);
    const guessed = inferBoardFromLive({
      inverter,
      tomznLive,
      gridFlow,
      serverGuess: boardGuess,
    });
    setBoardState(guessed);
    predictedRef.current = guessed;
  }, [visible]);

  const goals = useMemo(() => possibleOpsGoals(boardState, flags), [boardState, flags]);

  const persistBoard = (next: BoardSwitchState) => {
    setBoardState(next);
    void saveBoardSwitches(next).catch(() => undefined);
  };

  const confirmBoard = async () => {
    setSaving(true);
    try {
      await saveBoardSwitches(boardState, predictedRef.current);
    } catch {
      // queued offline
    } finally {
      setSaving(false);
    }
    setPhase("goal");
  };

  const pickGoal = (next: OpsGoal) => {
    setGoal(next);
    if (startNode(next.id, boardState, live) === "done") {
      setPhase("done");
      return;
    }
    setPhase("flow");
  };

  const headerTitle =
    phase === "setup" ? "Match switches"
      : phase === "goal" ? "What next?"
        : phase === "flow" ? (goal?.title ?? guide.title)
          : "Done";

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.modalRoot}>
        <Pressable style={s.backdrop} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <View style={s.sheetGrab} />
          <View style={s.sheetTop}>
            <View style={{ flex: 1 }}>
              <Text style={[s.sheetLive, { color }]}>{headerTitle}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={s.closeBtn}>
              <X size={16} color="#8A9BAE" />
            </Pressable>
          </View>

          {phase === "setup" ? (
            <>
              <Text style={s.setupHint}>
                Set from live data. Fix any paddle that’s wrong — that trains the next guess.
              </Text>
              <Text style={s.setupMode}>{inverterPowerHint(inverter)}</Text>
              <OpsBoardVisual
                mode="interactive"
                boardState={boardState}
                onBoardStateChange={setBoardState}
                highlight="none"
                flags={flags}
                accent={color}
              />
              <Pressable onPress={() => { void confirmBoard(); }} style={[s.primaryBtn, { backgroundColor: color }]}>
                <Text style={s.primaryBtnText}>{saving ? "Saving…" : "Looks right"}</Text>
              </Pressable>
            </>
          ) : null}

          {phase === "goal" ? (
            <ScrollView style={s.goalScroll} showsVerticalScrollIndicator={false}>
              <Text style={s.setupHint}>
                Suggested is first. Green is the safe path. Yellow is the next throw.
              </Text>
              <View style={s.goalList}>
                {goals.length === 0 ? (
                  <Text style={[s.emptyGoals, { color: cardTheme.textSecondary }]}>
                    Nothing to do from here.
                  </Text>
                ) : goals.map((g) => {
                  const markColor = g.mark === "green" ? "#32E56B" : g.mark === "yellow" ? "#F8C653" : null;
                  return (
                    <Pressable
                      key={g.id}
                      onPress={() => pickGoal(g)}
                      style={[
                        s.goalBtn,
                        markColor ? { borderColor: `${markColor}99`, backgroundColor: `${markColor}14` } : null,
                      ]}
                    >
                      {markColor ? (
                        <View style={[s.goalMark, { backgroundColor: `${markColor}22`, borderColor: `${markColor}88` }]}>
                          <Text style={[s.goalMarkText, { color: markColor }]}>
                            Suggested
                          </Text>
                        </View>
                      ) : null}
                      <Text style={s.goalTitle}>{g.title}</Text>
                      {g.why ? <Text style={s.goalWhy}>{g.why}</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          ) : null}

          {phase === "flow" && goal ? (
            <OpsFlowRunner
              goal={goal.id}
              board={boardState}
              flags={flags}
              live={live}
              accent={color}
              cardTheme={cardTheme}
              onBoardChange={persistBoard}
              onDone={() => setPhase("done")}
            />
          ) : null}

          {phase === "done" ? (
            <>
              <View style={s.doneBox}>
                <Check size={28} color="#32E56B" />
                <Text style={[s.doneTitle, { color: cardTheme.textPrimary }]}>
                  {goal ? `${goal.title} — done` : "Saved"}
                </Text>
                <Text style={[s.doneBody, { color: cardTheme.textSecondary }]}>
                  {flags.inverterUp ? "Inverter is online." : "Saved."}
                </Text>
              </View>
              <Pressable onPress={onClose} style={[s.primaryBtn, { backgroundColor: color }]}>
                <Text style={s.primaryBtnText}>Close</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
});

const s = StyleSheet.create({
  badge: {
    position: "absolute",
    top: -4,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    marginTop: "auto",
    backgroundColor: "#121826",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 8,
    maxHeight: "88%",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  sheetGrab: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginBottom: 10,
  },
  sheetTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sheetLive: {
    fontFamily: "Outfit",
    fontSize: 16,
    fontWeight: "700",
  },
  setupHint: {
    fontFamily: "Outfit",
    fontSize: 13,
    color: "#8A9BAE",
    marginBottom: 4,
    lineHeight: 18,
  },
  setupMode: {
    fontFamily: "Outfit",
    fontSize: 12,
    color: "#548EFF",
    marginBottom: 8,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(138,155,174,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtn: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  primaryBtnText: {
    fontFamily: "Outfit",
    fontSize: 14,
    fontWeight: "700",
    color: "#0B1220",
    textAlign: "center",
  },
  goalScroll: {
    maxHeight: 420,
    marginTop: 4,
  },
  goalList: {
    gap: 10,
    paddingBottom: 8,
  },
  goalBtn: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
  },
  goalMark: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 2,
  },
  goalMarkText: {
    fontFamily: "Outfit",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  goalTitle: {
    fontFamily: "Outfit",
    fontSize: 16,
    fontWeight: "700",
    color: "#F4F7FB",
  },
  goalWhy: {
    fontFamily: "Outfit",
    fontSize: 12,
    lineHeight: 17,
    color: "#8A9BAE",
  },
  emptyGoals: {
    fontFamily: "Outfit",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 24,
  },
  doneBox: {
    alignItems: "center",
    paddingVertical: 28,
    gap: 8,
  },
  doneTitle: {
    fontFamily: "Outfit",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 4,
  },
  doneBody: {
    fontFamily: "Outfit",
    fontSize: 11,
    lineHeight: 15,
    textAlign: "center",
    paddingHorizontal: 12,
  },
});
