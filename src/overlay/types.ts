/** Normalized point in overlay viewBox space (0–1000). */
export type OverlayPoint = { x: number; y: number };

export type OverlayViewBox = { width: number; height: number };

export type OverlayLabelPosition = OverlayPoint & { anchor?: "left" | "center" | "right" };

export type WireKind = "solar" | "grid" | "inverterOutput";

export type OverlayWireStyle = {
  conduitColor?: string;
  conduitOpacity?: number;
  conduitWidth?: number;
  strokeWidth?: number;
  glowWidth?: number;
  dashArray?: string;
  glowDashArray?: string;
  dashTravel?: number;
  particleCount?: number;
  minDurationMs?: number;
  maxDurationMs?: number;
  powerCeilingW?: number;
  minParticleRadius?: number;
  maxParticleRadius?: number;
  activeOpacityFloor?: number;
  activeOpacityCeiling?: number;
  idleOpacity?: number;
};

export type HeroOverlayConfig = {
  id: string;
  background: string;
  viewBox: OverlayViewBox;
  solarPath: OverlayPoint[];
  gridPath: OverlayPoint[];
  /** Grid → DB when inverter is off (bypass); starts at pole, ends at dbBoxPosition. */
  gridBypassPath?: OverlayPoint[];
  inverterOutputPath: OverlayPoint[];
  solarLabelPosition: OverlayLabelPosition;
  gridLabelPosition: OverlayLabelPosition;
  homeLabelPosition: OverlayLabelPosition;
  inverterPosition: OverlayPoint;
  dbBoxPosition: OverlayPoint;
  wireStyles?: Partial<Record<WireKind, OverlayWireStyle>>;
};

export type HeroSceneId =
  | "night"
  | "rain-light"
  | "clouds-dark"
  | "fog"
  | "evening"
  | "morning-cloud";

export type HeroScene = {
  id: HeroSceneId;
  source: number;
  overlay: HeroOverlayConfig;
};

export type OverlayAnchorKey =
  | "solarLabelPosition"
  | "gridLabelPosition"
  | "homeLabelPosition"
  | "inverterPosition"
  | "dbBoxPosition";

export type WireFlowState = {
  active: boolean;
  power: number;
  color: string;
  glowColor: string;
  idleOpacity?: number;
  /** When true, particles and dash animation flow backward (end → start). */
  reverse?: boolean;
};
