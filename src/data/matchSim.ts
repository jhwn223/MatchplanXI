import type { Position } from "./types";
import type { TeamAbilityProfile } from "./playerAbility";

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(lambda: number, rng: () => number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export interface PlacedPlayerLite {
  name: string;
  naturalPosition: Position;
  position: Position;
  overall: number;
  pace: number;
  acceleration: number;
  shooting: number;
  finishing: number;
  positioning: number;
  shotPower: number;
  longShots: number;
  passing: number;
  vision: number;
  shortPassing: number;
  longPassing: number;
  dribbling: number;
  ballControl: number;
  agility: number;
  composure: number;
  reactions: number;
  defending: number;
  interceptions: number;
  defensiveAwareness: number;
  standingTackle: number;
  physical: number;
  strength: number;
  aggression: number;
  stamina: number;
  penalties: number;
  gkDiving: number;
  gkHandling: number;
  gkPositioning: number;
  gkReflexes: number;
  condition: number;
}

export interface GoalEvent {
  minute: number;
  side: "user" | "opp";
  scorer?: string;
  assist?: string;
}

export type MatchEventType =
  | "pass"
  | "dribble"
  | "interception"
  | "tackle"
  | "shot"
  | "save"
  | "block"
  | "miss"
  | "goal";

/** One ability-resolved action in the match engine. The score and UI feed both use this log. */
export interface MatchEvent {
  minute: number;
  side: "user" | "opp";
  type: MatchEventType;
  actor: string;
  target?: string;
  detail: string;
  success: boolean;
  xg?: number;
}

export interface TeamStats {
  /** pass completion probability for this match, 0-100 */
  passSuccessRate: number;
  /** shots faced by this team's goalkeeper */
  shotsFaced: number;
  saves: number;
  /** save probability among shots faced, 0-100 */
  saveRate: number;
  possession: number;
  passesAttempted: number;
  passesCompleted: number;
  shots: number;
  shotsOnTarget: number;
  tacklesWon: number;
  interceptions: number;
}

export interface SimActual {
  userGoals: number;
  oppGoals: number;
  resultType: string;
}

export interface SimInput {
  seed: number;
  userTeamName: string;
  oppTeamName: string;
  userElo: number;
  oppElo: number;
  conditionIndex: number;
  attackBias: number;
  isHome: boolean;
  elevation: number;
  placed: PlacedPlayerLite[];
  oppPlaced: PlacedPlayerLite[];
  userAbility: TeamAbilityProfile;
  oppAbility: TeamAbilityProfile;
  actual: SimActual | null;
  /** knockout ties go to extra time + penalties when level after 90'; group games never do */
  isKnockout: boolean;
}

export interface PenaltyResult {
  userGoals: number;
  oppGoals: number;
  winner: "user" | "opp";
}

export interface SimComparison {
  hasActual: boolean;
  actualUserGoals?: number;
  actualOppGoals?: number;
  simOutcome: "W" | "D" | "L";
  actualOutcome?: "W" | "D" | "L";
  outcomeMatched?: boolean;
  verdict: string;
  tacticsNote: string;
}

export interface SimResult {
  /** final score, including extra time if it was played (not the shootout) */
  userGoals: number;
  oppGoals: number;
  /** score at the 90' whistle, before any extra time */
  regulationUserGoals: number;
  regulationOppGoals: number;
  userXg: number;
  oppXg: number;
  goals: GoalEvent[];
  events: MatchEvent[];
  comparison: SimComparison;
  teamStats: { user: TeamStats; opp: TeamStats };
  wentToExtraTime: boolean;
  penalties: PenaltyResult | null;
}

type Side = "user" | "opp";

interface RunningStats {
  possessionTouches: number;
  passesAttempted: number;
  passesCompleted: number;
  shots: number;
  shotsOnTarget: number;
  saves: number;
  tacklesWon: number;
  interceptions: number;
  xg: number;
}

function emptyRunningStats(): RunningStats {
  return {
    possessionTouches: 0,
    passesAttempted: 0,
    passesCompleted: 0,
    shots: 0,
    shotsOnTarget: 0,
    saves: 0,
    tacklesWon: 0,
    interceptions: 0,
    xg: 0,
  };
}

function weightedPick<T>(items: T[], weight: (item: T) => number, rng: () => number): T {
  const total = items.reduce((sum, item) => sum + Math.max(0.01, weight(item)), 0);
  let cursor = rng() * total;
  for (const item of items) {
    cursor -= Math.max(0.01, weight(item));
    if (cursor <= 0) return item;
  }
  return items[items.length - 1];
}

/** Condition, stamina, altitude and playing out of position alter every individual action. */
function performanceFactor(player: PlacedPlayerLite, minute: number, elevation: number): number {
  const condition = 0.82 + player.condition / 430;
  const fatigueProgress = clamp(minute / 120, 0, 1);
  const staminaProtection = clamp((player.stamina - 45) / 100, 0, 0.5);
  const altitudeLoad = clamp((elevation - 800) / 9000, 0, 0.22);
  const fatigue = 1 - fatigueProgress * (0.17 - staminaProtection * 0.18 + altitudeLoad);
  const positionFit = player.naturalPosition === player.position ? 1 : 0.88;
  return clamp(condition * fatigue * positionFit, 0.62, 1.12);
}

function skill(
  player: PlacedPlayerLite,
  minute: number,
  elevation: number,
  parts: Array<[number, number]>
): number {
  return parts.reduce((sum, [value, weight]) => sum + value * weight, 0) * performanceFactor(player, minute, elevation);
}

function sidePlayers(input: SimInput, side: Side): PlacedPlayerLite[] {
  return side === "user" ? input.placed : input.oppPlaced;
}

function otherSide(side: Side): Side {
  return side === "user" ? "opp" : "user";
}

function outfield(players: PlacedPlayerLite[]): PlacedPlayerLite[] {
  const selected = players.filter((player) => player.position !== "GK");
  return selected.length ? selected : players;
}

function goalkeeper(players: PlacedPlayerLite[]): PlacedPlayerLite {
  return players.find((player) => player.position === "GK") ?? players[0];
}

function finalizeStats(running: RunningStats, other: RunningStats): TeamStats {
  const totalTouches = Math.max(1, running.possessionTouches + other.possessionTouches);
  const shotsFaced = other.shotsOnTarget;
  return {
    passSuccessRate: running.passesAttempted
      ? Math.round((running.passesCompleted / running.passesAttempted) * 100)
      : 0,
    shotsFaced,
    saves: running.saves,
    saveRate: shotsFaced ? Math.round((running.saves / shotsFaced) * 100) : 100,
    possession: Math.round((running.possessionTouches / totalTouches) * 100),
    passesAttempted: running.passesAttempted,
    passesCompleted: running.passesCompleted,
    shots: running.shots,
    shotsOnTarget: running.shotsOnTarget,
    tacklesWon: running.tacklesWon,
    interceptions: running.interceptions,
  };
}

function combineTeamStats(a: TeamStats, b: TeamStats, aWeight = 1, bWeight = 1): TeamStats {
  const passesAttempted = a.passesAttempted + b.passesAttempted;
  const passesCompleted = a.passesCompleted + b.passesCompleted;
  const shotsFaced = a.shotsFaced + b.shotsFaced;
  const saves = a.saves + b.saves;
  return {
    passSuccessRate: passesAttempted ? Math.round((passesCompleted / passesAttempted) * 100) : 0,
    shotsFaced,
    saves,
    saveRate: shotsFaced ? Math.round((saves / shotsFaced) * 100) : 100,
    possession: Math.round((a.possession * aWeight + b.possession * bWeight) / (aWeight + bWeight)),
    passesAttempted,
    passesCompleted,
    shots: a.shots + b.shots,
    shotsOnTarget: a.shotsOnTarget + b.shotsOnTarget,
    tacklesWon: a.tacklesWon + b.tacklesWon,
    interceptions: a.interceptions + b.interceptions,
  };
}

function actionDetail(type: MatchEventType, actor: string, target?: string): string {
  if (type === "pass") return `${actor} → ${target ?? "전방"} 패스`;
  if (type === "dribble") return `${actor} 드리블 돌파`;
  if (type === "interception") return `${actor} 패스 차단`;
  if (type === "tackle") return `${actor} 태클 성공`;
  if (type === "shot") return `${actor} 슈팅`;
  if (type === "save") return `${actor} 선방`;
  if (type === "block") return `${actor} 슈팅 블록`;
  if (type === "miss") return `${actor} 슈팅 빗나감`;
  return `${actor} 득점`;
}

/** Penalty shootout resolves each taker's penalties/composure against the opposing goalkeeper. */
function simulatePenalties(rng: () => number, input: SimInput): PenaltyResult {
  const userTakers = outfield(input.placed).sort(
    (a, b) => b.penalties + b.composure - (a.penalties + a.composure)
  );
  const oppTakers = outfield(input.oppPlaced).sort(
    (a, b) => b.penalties + b.composure - (a.penalties + a.composure)
  );
  const userKeeper = goalkeeper(input.placed);
  const oppKeeper = goalkeeper(input.oppPlaced);
  const kick = (taker: PlacedPlayerLite, keeperPlayer: PlacedPlayerLite) => {
    const takerSkill = taker.penalties * 0.55 + taker.composure * 0.3 + taker.finishing * 0.15;
    const keeperSkill =
      keeperPlayer.gkDiving * 0.25 +
      keeperPlayer.gkReflexes * 0.35 +
      keeperPlayer.gkPositioning * 0.25 +
      keeperPlayer.reactions * 0.15;
    return rng() < clamp(0.74 + (takerSkill - keeperSkill) / 190, 0.52, 0.93);
  };
  let userGoals = 0;
  let oppGoals = 0;
  for (let i = 0; i < 5; i++) {
    if (kick(userTakers[i % userTakers.length], oppKeeper)) userGoals++;
    if (kick(oppTakers[i % oppTakers.length], userKeeper)) oppGoals++;
  }
  let guard = 0;
  while (userGoals === oppGoals && guard++ < 12) {
    if (kick(userTakers[guard % userTakers.length], oppKeeper)) userGoals++;
    if (kick(oppTakers[guard % oppTakers.length], userKeeper)) oppGoals++;
  }
  const winner: "user" | "opp" =
    userGoals === oppGoals ? (rng() < 0.5 ? "user" : "opp") : userGoals > oppGoals ? "user" : "opp";
  return { userGoals, oppGoals, winner };
}

/** xG for the user side given elo gap, condition, attacking bias and home edge. */
function computeXg(input: {
  userElo: number;
  oppElo: number;
  conditionIndex: number;
  attackBias: number;
  isHome: boolean;
  userAbility: TeamAbilityProfile;
  oppAbility: TeamAbilityProfile;
}): { userXg: number; oppXg: number } {
  const homeAdv = input.isHome ? 0.25 : 0.0;
  const eloDiff = (input.userElo - input.oppElo) / 400;
  const condFactor = (input.conditionIndex - 62) / 100;
  const userAttackEdge =
    (input.userAbility.attack - input.oppAbility.defense) / 22 +
    (input.userAbility.creativity - input.oppAbility.goalkeeper) / 48;
  const oppAttackEdge =
    (input.oppAbility.attack - input.userAbility.defense) / 22 +
    (input.oppAbility.creativity - input.userAbility.goalkeeper) / 48;
  const staminaEdge = (input.userAbility.stamina - input.oppAbility.stamina) / 80;
  const userXg = clamp(
    1.18 + eloDiff * 0.48 + condFactor * 1.25 + userAttackEdge + staminaEdge + input.attackBias * 0.55 + homeAdv,
    0.15,
    4.8
  );
  const oppXg = clamp(
    1.18 - eloDiff * 0.42 - condFactor * 0.7 + oppAttackEdge - staminaEdge + input.attackBias * 0.3 + (input.isHome ? 0 : 0.25),
    0.15,
    4.2
  );
  return { userXg, oppXg };
}

/** Lightweight deterministic scoreline for AI-vs-AI matches (tournament fill). */
export function quickSimScore(
  seed: number,
  eloHome: number,
  eloAway: number
): { home: number; away: number } {
  const rng = mulberry32(seed >>> 0);
  const neutralAbility: TeamAbilityProfile = {
    overall: 70,
    attack: 70,
    creativity: 70,
    defense: 70,
    goalkeeper: 70,
    stamina: 70,
  };
  const { userXg, oppXg } = computeXg({
    userElo: eloHome,
    oppElo: eloAway,
    conditionIndex: 62,
    attackBias: 0,
    isHome: true,
    userAbility: neutralAbility,
    oppAbility: neutralAbility,
  });
  return { home: poisson(userXg, rng), away: poisson(oppXg, rng) };
}

export interface HalfResult {
  goals: GoalEvent[];
  events: MatchEvent[];
  userGoals: number;
  oppGoals: number;
  userXg: number;
  oppXg: number;
  teamStats: { user: TeamStats; opp: TeamStats };
}

function simulatePeriod(
  input: SimInput,
  lo: number,
  hi: number,
  seedOffset: number
): HalfResult {
  const rng = mulberry32((input.seed + seedOffset) >>> 0);
  const goals: GoalEvent[] = [];
  const events: MatchEvent[] = [];
  const running: Record<Side, RunningStats> = {
    user: emptyRunningStats(),
    opp: emptyRunningStats(),
  };
  const duration = hi - lo + 1;
  const possessionCount = Math.max(24, Math.round(duration * 1.12));
  const eloEdge = (input.userElo - input.oppElo) / 400;
  const creativityEdge = (input.userAbility.creativity - input.oppAbility.creativity) / 100;
  const userPossessionChance = clamp(
    0.5 + eloEdge * 0.07 + creativityEdge * 0.1 - input.attackBias * 0.025 + (input.isHome ? 0.018 : -0.018),
    0.33,
    0.67
  );

  const addEvent = (
    minute: number,
    side: Side,
    type: MatchEventType,
    actor: string,
    target: string | undefined,
    success: boolean,
    xg?: number
  ) => {
    events.push({ minute, side, type, actor, target, success, xg, detail: actionDetail(type, actor, target) });
  };

  for (let possession = 0; possession < possessionCount; possession++) {
    const minute = Math.min(
      hi,
      lo + Math.floor(((possession + rng()) / possessionCount) * duration)
    );
    const side: Side = rng() < userPossessionChance ? "user" : "opp";
    const defendingSide = otherSide(side);
    const attackers = outfield(sidePlayers(input, side));
    const defenders = outfield(sidePlayers(input, defendingSide));
    const keeperPlayer = goalkeeper(sidePlayers(input, defendingSide));
    if (!attackers.length || !defenders.length || !keeperPlayer) continue;

    let carrier = weightedPick(
      attackers,
      (player) =>
        (player.position === "MID" ? 2.8 : player.position === "DEF" ? 2.1 : 1.1) *
        (0.6 + player.ballControl / 100),
      rng
    );
    let lastPasser: PlacedPlayerLite | undefined;
    let progress = 0;
    const maxActions = 2 + Math.floor(rng() * 4);

    for (let action = 0; action < maxActions; action++) {
      running[side].possessionTouches++;
      const defender = weightedPick(
        defenders,
        (player) => {
          const roleWeight = player.position === "DEF" ? 2.8 : player.position === "MID" ? 1.8 : 0.7;
          return roleWeight * (0.45 + (player.defensiveAwareness + player.aggression) / 200);
        },
        rng
      );

      const carrierDribble = skill(carrier, minute, input.elevation, [
        [carrier.dribbling, 0.34],
        [carrier.ballControl, 0.24],
        [carrier.agility, 0.18],
        [carrier.pace, 0.14],
        [carrier.composure, 0.1],
      ]);
      const defenderTackle = skill(defender, minute, input.elevation, [
        [defender.standingTackle, 0.3],
        [defender.defensiveAwareness, 0.24],
        [defender.strength, 0.17],
        [defender.interceptions, 0.17],
        [defender.reactions, 0.12],
      ]);
      const wantsDribble =
        carrier.position === "FWD"
          ? rng() < 0.32 + Math.max(0, carrier.dribbling - carrier.passing) / 180
          : rng() < 0.16;

      if (wantsDribble) {
        const dribbleChance = clamp(0.5 + (carrierDribble - defenderTackle) / 115, 0.22, 0.86);
        if (rng() < dribbleChance) {
          progress += 1.2;
          addEvent(minute, side, "dribble", carrier.name, defender.name, true);
        } else {
          running[defendingSide].tacklesWon++;
          running[defendingSide].possessionTouches++;
          addEvent(minute, defendingSide, "tackle", defender.name, carrier.name, true);
          break;
        }
      } else {
        const receivers = attackers.filter((player) => player.name !== carrier.name);
        if (!receivers.length) break;
        const receiver = weightedPick(
          receivers,
          (player) => {
            const forwardWeight = player.position === "FWD" ? 2.8 : player.position === "MID" ? 2 : 0.75;
            return forwardWeight * (0.45 + (player.positioning + player.pace + player.reactions) / 300);
          },
          rng
        );
        const passQuality = skill(carrier, minute, input.elevation, [
          [carrier.passing, 0.24],
          [carrier.shortPassing, 0.26],
          [carrier.vision, 0.2],
          [carrier.composure, 0.14],
          [carrier.ballControl, 0.1],
          [carrier.longPassing, 0.06],
        ]);
        const interceptionQuality = skill(defender, minute, input.elevation, [
          [defender.interceptions, 0.32],
          [defender.defensiveAwareness, 0.27],
          [defender.reactions, 0.17],
          [defender.aggression, 0.12],
          [defender.pace, 0.12],
        ]);
        const directness = side === "user" ? input.attackBias : -input.attackBias * 0.35;
        const passChance = clamp(
          0.72 + (passQuality - interceptionQuality) / 175 - progress * 0.012 - directness * 0.025,
          0.48,
          0.94
        );
        running[side].passesAttempted++;
        if (rng() < passChance) {
          running[side].passesCompleted++;
          progress += receiver.position === "FWD" ? 1.05 : receiver.position === "MID" ? 0.72 : 0.38;
          addEvent(minute, side, "pass", carrier.name, receiver.name, true);
          lastPasser = carrier;
          carrier = receiver;
        } else {
          running[defendingSide].interceptions++;
          running[defendingSide].possessionTouches++;
          addEvent(minute, defendingSide, "interception", defender.name, carrier.name, true);
          break;
        }
      }

      const tacticShotBias = side === "user" ? input.attackBias * 0.07 : input.attackBias * 0.025;
      const roleShotChance = carrier.position === "FWD" ? 0.3 : carrier.position === "MID" ? 0.16 : 0.06;
      const shootNow = rng() < roleShotChance + progress * 0.045 + tacticShotBias || action === maxActions - 1 && rng() < 0.36;
      if (!shootNow) continue;

      const marker = weightedPick(
        defenders,
        (player) => 0.4 + (player.defending + player.defensiveAwareness) / 140,
        rng
      );
      const chanceCreation =
        (carrier.positioning - marker.defensiveAwareness) / 650 +
        ((lastPasser?.vision ?? carrier.vision) - 65) / 1000 +
        progress * 0.007;
      const baseXg = carrier.position === "FWD" ? 0.065 : carrier.position === "MID" ? 0.04 : 0.022;
      const shotXg = clamp(baseXg + chanceCreation + rng() * 0.045, 0.012, 0.48);
      running[side].shots++;
      running[side].xg += shotXg;
      addEvent(minute, side, "shot", carrier.name, keeperPlayer.name, true, shotXg);

      const shootingTechnique = skill(carrier, minute, input.elevation, [
        [carrier.shooting, 0.22],
        [carrier.finishing, 0.3],
        [carrier.shotPower, 0.13],
        [carrier.composure, 0.2],
        [carrier.positioning, 0.15],
      ]);
      const blockQuality = skill(marker, minute, input.elevation, [
        [marker.defending, 0.22],
        [marker.defensiveAwareness, 0.28],
        [marker.standingTackle, 0.2],
        [marker.reactions, 0.16],
        [marker.aggression, 0.14],
      ]);
      const keeperQuality = skill(keeperPlayer, minute, input.elevation, [
        [keeperPlayer.gkReflexes, 0.3],
        [keeperPlayer.gkDiving, 0.25],
        [keeperPlayer.gkPositioning, 0.22],
        [keeperPlayer.gkHandling, 0.13],
        [keeperPlayer.reactions, 0.1],
      ]);
      const finishingMultiplier = clamp(0.72 + (shootingTechnique - 60) / 105, 0.58, 1.48);
      const keeperMultiplier = clamp(1.08 - (keeperQuality - 65) / 155, 0.63, 1.2);
      const goalChance = clamp(shotXg * finishingMultiplier * keeperMultiplier, 0.01, 0.72);
      if (rng() < goalChance) {
        running[side].shotsOnTarget++;
        const assist = lastPasser?.name !== carrier.name ? lastPasser?.name : undefined;
        goals.push({ minute, side, scorer: carrier.name, assist });
        addEvent(minute, side, "goal", carrier.name, assist, true, shotXg);
        break;
      }

      const blockChance = clamp(0.12 + (blockQuality - shootingTechnique) / 260, 0.04, 0.32);
      if (rng() < blockChance) {
        running[defendingSide].tacklesWon++;
        addEvent(minute, defendingSide, "block", marker.name, carrier.name, true, shotXg);
        break;
      }

      const onTargetChance = clamp(0.4 + (shootingTechnique - 65) / 150, 0.24, 0.82);
      if (rng() >= onTargetChance) {
        addEvent(minute, side, "miss", carrier.name, undefined, false, shotXg);
        break;
      }
      running[side].shotsOnTarget++;
      running[defendingSide].saves++;
      addEvent(minute, defendingSide, "save", keeperPlayer.name, carrier.name, true, shotXg);
      break;
    }
  }

  goals.sort((a, b) => a.minute - b.minute);
  events.sort((a, b) => a.minute - b.minute);
  const teamStats = {
    user: finalizeStats(running.user, running.opp),
    opp: finalizeStats(running.opp, running.user),
  };
  return {
    goals,
    events,
    userGoals: goals.filter((goal) => goal.side === "user").length,
    oppGoals: goals.filter((goal) => goal.side === "opp").length,
    userXg: running.user.xg,
    oppXg: running.opp.xg,
    teamStats,
  };
}

/** Simulate one half as a chain of player-vs-player decisions. */
export function simulateHalf(input: SimInput, half: 1 | 2): HalfResult {
  return simulatePeriod(input, half === 1 ? 1 : 46, half === 1 ? 45 : 90, half * 999983);
}

/** Combine both halves into a regulation-time result. Extra time (knockouts only,
 *  when still level) is applied afterwards via `applyExtraTime`, once a lineup for
 *  the extra-time period is known. */
export function combineHalves(input: SimInput, h1: HalfResult, h2: HalfResult): SimResult {
  const userGoals = h1.userGoals + h2.userGoals;
  const oppGoals = h1.oppGoals + h2.oppGoals;
  const goals = [...h1.goals, ...h2.goals].sort((a, b) => a.minute - b.minute);
  const events = [...h1.events, ...h2.events].sort((a, b) => a.minute - b.minute);
  const userXg = h1.userXg + h2.userXg;
  const oppXg = h1.oppXg + h2.oppXg;
  const simOutcome: "W" | "D" | "L" =
    userGoals > oppGoals ? "W" : userGoals < oppGoals ? "L" : "D";

  const teamStats = {
    user: combineTeamStats(h1.teamStats.user, h2.teamStats.user),
    opp: combineTeamStats(h1.teamStats.opp, h2.teamStats.opp),
  };

  return {
    userGoals,
    oppGoals,
    regulationUserGoals: userGoals,
    regulationOppGoals: oppGoals,
    userXg,
    oppXg,
    goals,
    events,
    comparison: buildComparison(input, userGoals, oppGoals, simOutcome),
    teamStats,
    wentToExtraTime: false,
    penalties: null,
  };
}

/** Extend a level, regulation-time knockout result with extra time (+ penalties if still
 *  level after that). `input` should reflect whatever lineup is current when extra time
 *  kicks off, so a substitution made just before it can still affect who might score. */
export function applyExtraTime(input: SimInput, base: SimResult): SimResult {
  if (!input.isKnockout || base.userGoals !== base.oppGoals) return base;

  const rng = mulberry32((input.seed + 9_000029) >>> 0);
  const extraTime = simulatePeriod(input, 91, 120, 9_000029);
  const etUserGoals = extraTime.userGoals;
  const etOppGoals = extraTime.oppGoals;

  const userGoals = base.userGoals + etUserGoals;
  const oppGoals = base.oppGoals + etOppGoals;
  const goals = [...base.goals, ...extraTime.goals].sort((a, b) => a.minute - b.minute);
  const events = [...base.events, ...extraTime.events].sort((a, b) => a.minute - b.minute);

  let penalties: PenaltyResult | null = null;
  if (userGoals === oppGoals) {
    penalties = simulatePenalties(rng, input);
  }

  const simOutcome: "W" | "D" | "L" =
    userGoals > oppGoals ? "W" : userGoals < oppGoals ? "L" : "D";
  const totalUserXg = base.userXg + extraTime.userXg;
  const totalOppXg = base.oppXg + extraTime.oppXg;
  const teamStats = {
    user: combineTeamStats(base.teamStats.user, extraTime.teamStats.user, 3, 1),
    opp: combineTeamStats(base.teamStats.opp, extraTime.teamStats.opp, 3, 1),
  };

  return {
    ...base,
    userGoals,
    oppGoals,
    userXg: totalUserXg,
    oppXg: totalOppXg,
    goals,
    events,
    comparison: buildComparison(input, userGoals, oppGoals, simOutcome),
    teamStats,
    wentToExtraTime: true,
    penalties,
  };
}

function buildComparison(
  input: SimInput,
  simU: number,
  simO: number,
  simOutcome: "W" | "D" | "L"
): SimComparison {
  const biasWord =
    input.attackBias >= 0.7
      ? "초공격적"
      : input.attackBias >= 0.3
        ? "공격적"
        : input.attackBias <= -0.5
          ? "수비적"
          : "균형잡힌";
  const condWord =
    input.conditionIndex >= 75
      ? "최상의 컨디션"
      : input.conditionIndex >= 60
        ? "양호한 컨디션"
        : input.conditionIndex >= 45
          ? "주의가 필요한 컨디션"
          : "위험한 컨디션";

  const tacticsNote = `${biasWord} 전술 · 평균 ${condWord}(${Math.round(input.conditionIndex)})${
    input.elevation >= 1500 ? ` · 해발 ${input.elevation}m 고지대` : ""
  }`;

  if (!input.actual) {
    return {
      hasActual: false,
      simOutcome,
      verdict: "이 경기는 실제 결과가 없습니다 (예정된 경기).",
      tacticsNote,
    };
  }

  const aU = input.actual.userGoals;
  const aO = input.actual.oppGoals;
  const actualOutcome: "W" | "D" | "L" = aU > aO ? "W" : aU < aO ? "L" : "D";
  const outcomeMatched = simOutcome === actualOutcome;
  const outcomeKo = (o: "W" | "D" | "L") => (o === "W" ? "승리" : o === "D" ? "무승부" : "패배");

  let verdict: string;
  if (simU === aU && simO === aO) {
    verdict = `🎯 스코어까지 정확히 일치! 당신의 전술은 실제 경기를 그대로 재현했습니다.`;
  } else if (outcomeMatched) {
    verdict = `✅ 결과 일치 — 실제도 ${outcomeKo(actualOutcome)}였습니다. 스코어는 시뮬 ${simU}-${simO} / 실제 ${aU}-${aO}.`;
  } else {
    const simGD = simU - simO;
    const actGD = aU - aO;
    verdict =
      simGD > actGD
        ? `📈 당신의 전술이 실제보다 더 좋은 결과를 냈습니다 (시뮬 ${simU}-${simO} / 실제 ${aU}-${aO}).`
        : `📉 실제 경기가 더 좋았습니다 (시뮬 ${simU}-${simO} / 실제 ${aU}-${aO}). 전술을 조정해 보세요.`;
  }

  return {
    hasActual: true,
    actualUserGoals: aU,
    actualOppGoals: aO,
    simOutcome,
    actualOutcome,
    outcomeMatched,
    verdict,
    tacticsNote,
  };
}
