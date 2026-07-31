/**
 * Stable public entry point for match simulation.
 *
 * Keep application imports pointed here while implementation teams work independently
 * in `data/match/*` (types, event engine, results, penalties, and quick simulation).
 */
export { mulberry32 } from "./match/random";
export {
  quickSimExpectedGoals,
  quickSimMatch,
  quickSimScore,
} from "./match/quickSim";
export type {
  QuickSimInput,
  QuickSimOptions,
  QuickSimTeamInput,
} from "./match/quickSim";
export {
  simulateHalf,
  simulatePeriod,
  simulatePeriodWithWorld,
} from "./match/eventEngine";
export { applyExtraTime, combineExtraTime, combineHalves, combinePeriods } from "./match/result";
export { selectPlayerOfMatch, snapshotAtMinute } from "./match/liveStats";
export {
  assertValidHalfResult,
  validateHalfResult,
} from "./match/invariants";
export type { MatchInvariantIssue } from "./match/invariants";
export {
  actionPerformanceFactor,
  currentCondition,
  fatigueBreakdown,
  performanceFactor,
} from "./match/playerRuntime";
export type {
  ActionKind,
  FatigueBreakdown,
} from "./match/playerRuntime";
export { continueMatchWorld, createMatchWorld } from "./match/world/createWorld";
export {
  coordinateFromWorld,
  samplesFromWorld,
  snapshotWorld,
} from "./match/world/eventBridge";
export {
  advanceWorld,
  beginPossession,
  moveBallOwner,
} from "./match/world/movementEngine";
export {
  nearestOpponentDistance,
  passOptionScore,
  worldDistance,
  worldPassLanePressure,
  worldPlayer,
} from "./match/world/perception";
export type {
  MatchWorld,
  MatchWorldSnapshot,
  TacticsBySide,
  WorldBallState,
  WorldIntent,
  WorldPlayerSnapshot,
  WorldPlayerState,
  WorldPoint,
} from "./match/world/types";
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
