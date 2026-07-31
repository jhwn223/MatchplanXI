/**
 * Stable public entry point for match simulation.
 *
 * Keep application imports pointed here while implementation teams work independently
 * in `data/match/*` (types, event engine, results, penalties, and quick simulation).
 */
export { mulberry32 } from "./match/random";
export { quickSimScore } from "./match/quickSim";
export { simulateHalf, simulatePeriod } from "./match/eventEngine";
export { applyExtraTime, combineExtraTime, combineHalves, combinePeriods } from "./match/result";
export { selectPlayerOfMatch, snapshotAtMinute } from "./match/liveStats";
export { BALANCED_SIM_TACTICS, normalizeSimTactics } from "./match/tactics";
export type {
  GoalEvent,
  HalfResult,
  LiveMatchSnapshot,
  MatchEvent,
  MatchEventType,
  PassType,
  MatchSide,
  PenaltyResult,
  PositionSample,
  PlacedPlayerLite,
  PlayerMatchStats,
  SimActual,
  SimComparison,
  SimInput,
  SimTacticProfile,
  SimResult,
  TeamStats,
} from "./match/types";
