/**
 * Stable public entry point for match simulation.
 *
 * Keep application imports pointed here while implementation teams work independently
 * in `data/match/*` (types, event engine, results, penalties, and quick simulation).
 */
export { mulberry32 } from "./match/random";
export { quickSimScore } from "./match/quickSim";
export { simulateHalf } from "./match/eventEngine";
export { applyExtraTime, combineHalves } from "./match/result";
export type {
  GoalEvent,
  HalfResult,
  MatchEvent,
  MatchEventType,
  MatchSide,
  PenaltyResult,
  PlacedPlayerLite,
  SimActual,
  SimComparison,
  SimInput,
  SimResult,
  TeamStats,
} from "./match/types";
