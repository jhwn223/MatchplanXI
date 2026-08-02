import type { PassType } from "../../data/matchSim";

export const PASS_TYPE_META: Record<PassType, { label: string; color: string }> = {
  cross: { label: "크로스", color: "#35dc66" },
  short: { label: "짧은 패스", color: "#9b83ff" },
  through: { label: "스루패스", color: "#35b7ff" },
  longBall: { label: "롱 볼", color: "#ead64b" },
  normal: { label: "보통", color: "#f4f5f0" },
};

export const ALL_PASS_TYPES: PassType[] = ["cross", "short", "through", "longBall", "normal"];
