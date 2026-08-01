import { goalkeeper, otherSide, outfield, sidePlayers, skill } from "./playerRuntime";
import { createLiveSnapshot, createPlayerStats, finalizePlayerStats, playerStat } from "./liveStats";
import { clamp, mulberry32, weightedPick } from "./random";
import { emptyRunningStats, finalizeTeamStatsPair, type RunningStats } from "./stats";
import { tacticalWorkRate, tacticsForSide } from "./tactics";
import {
  tacticalHome,
} from "./spatial";
import { continueMatchWorld, createMatchWorld } from "./world/createWorld";
import {
  coordinateFromWorld,
  samplesFromWorld,
} from "./world/eventBridge";
import {
  advanceWorld,
  beginPossession,
} from "./world/movementEngine";
import {
  accrueActiveFatigue,
  markPlayerUnavailable,
  runtimeInputForWorld,
} from "./world/playerState";
import {
  attackFocusLaneWeight,
  defensiveLineHeight,
  defensiveThirdCover,
  isPlayerOffside,
  offsideMargin,
  passOptionScore,
  worldDistance,
  worldPassLanePressure,
} from "./world/perception";
import type {
  GoalEvent,
  HalfResult,
  MatchEvent,
  MatchEventType,
  MatchSide,
  PassType,
  PlacedPlayerLite,
  PositionSample,
  SimInput,
  SimTacticProfile,
} from "./types";
import type { MatchWorld } from "./world/types";

export interface PeriodSimulation {
  result: HalfResult;
  world: MatchWorld;
}

function averagePace(players: PlacedPlayerLite[], position: PlacedPlayerLite["position"]) {
  const selected = players.filter((player) => player.position === position);
  const source = selected.length ? selected : players;
  return source.length
    ? source.reduce((sum, player) => sum + player.pace, 0) / source.length
    : 65;
}

/**
 * Elo represents the team-level organisation that is not fully described by
 * one player's attributes: spacing, collective decision making and the
 * repeatability of good actions. Keep it deliberately bounded so a better
 * plan, fresher players and the individual duels can still overturn it.
 */
function eloPerformanceEdge(userElo: number, oppElo: number) {
  return clamp((userElo - oppElo) / 400, -1, 1);
}

function eloQualityMultiplier(edge: number, side: MatchSide) {
  const sideEdge = side === "user" ? edge : -edge;
  return clamp(1 + sideEdge * 0.15, 0.86, 1.15);
}

/**
 * Rewards a plan that specifically attacks the opponent's current structure.
 * This is recalculated for every simulated minute, so an in-match tactical
 * change affects the very next possession instead of a precomputed result.
 */
function tacticalMatchupEdge(
  attacking: SimTacticProfile,
  defending: SimTacticProfile,
  attackers: PlacedPlayerLite[],
  defenders: PlacedPlayerLite[],
) {
  const escapeHighPress =
    Math.max(0, defending.pressBias - 0.2) *
    Math.max(0, attacking.directnessBias - 0.1) *
    0.075;
  const stretchLowBlock =
    Math.max(0, -defending.defensiveLineBias - 0.15) *
    Math.max(0, attacking.widthBias - 0.05) *
    (0.045 + Math.max(0, attacking.overlapBias) * 0.035);
  const paceMismatch = clamp(
    (averagePace(attackers, "FWD") - averagePace(defenders, "DEF")) / 24,
    -1,
    1,
  );
  const attackSlowCenterBacks =
    Math.max(0, paceMismatch) *
    Math.max(0, attacking.counterBias + attacking.tempoBias * 0.35) *
    0.05;
  const shortBuildUpRisk =
    Math.max(0, defending.pressBias - 0.25) *
    Math.max(0, -attacking.directnessBias - 0.1) *
    0.045;

  return clamp(
    escapeHighPress + stretchLowBlock + attackSlowCenterBacks - shortBuildUpRisk,
    -0.08,
    0.16,
  );
}

/** Canonical x at which a foul is punished with a penalty rather than a free kick. */
const PENALTY_AREA_X = 84;

/** Which third of the pitch a canonical position sits in, 0 being own third. */
function thirdOf(canonicalX: number) {
  return canonicalX < 34 ? 0 : canonicalX < 67 ? 1 : 2;
}

/**
 * How many outfield players a side commits to each third of the pitch.
 *
 * Taken from the formation rather than from live positions on purpose. The
 * movement engine pulls everybody towards the ball, so measured positions show
 * a side with no midfielders as barely outnumbered in midfield — the hole is
 * cosmetically filled by players chasing the ball. What actually decides a
 * match is how many bodies a manager commits to a zone, and that is the shape
 * he picked.
 */
function commitmentByThird(players: PlacedPlayerLite[]) {
  const counts = [0, 0, 0];
  for (const player of players) {
    if (player.position === "GK") continue;
    counts[thirdOf(player.baseX)]++;
  }
  return counts;
}

/**
 * How much less willing a defender is to make contact inside his own area.
 *
 * Defenders jockey and shepherd in the box instead of diving in, because the
 * punishment is a penalty. The engine used the same foul rate everywhere, and
 * since attacks concentrate exactly there it awarded around seven times as
 * many penalties as real football — enough that spot kicks produced almost
 * half of every side's goals and swamped the rest of the model.
 */
function penaltyAreaRestraint(canonicalX: number) {
  return canonicalX >= PENALTY_AREA_X ? 0.14 : 1;
}

function actionDetail(type: MatchEventType, actor: string, target?: string): string {
  if (type === "pass") return `${actor} → ${target ?? "전방"} 패스`;
  if (type === "recovery") return `${actor} 볼 회수`;
  if (type === "dribble") return `${actor} 드리블 돌파`;
  if (type === "interception") return `${actor} 패스 차단`;
  if (type === "tackle") return `${actor} 태클 성공`;
  if (type === "shot") return `${actor} 슈팅`;
  if (type === "save") return `${actor} 선방`;
  if (type === "block") return `${actor} 슈팅 블록`;
  if (type === "miss") return `${actor} 슈팅 빗나감`;
  if (type === "foul") return `${actor} 파울`;
  if (type === "yellowCard") return `${actor} 경고`;
  if (type === "redCard") return `${actor} 퇴장`;
  if (type === "offside") return `${actor} 오프사이드`;
  if (type === "corner") return `${actor} 코너킥`;
  if (type === "freeKick") return `${actor} 프리킥`;
  if (type === "throwIn") return `${actor} 스로인`;
  if (type === "penaltyKick") return `${actor} 페널티킥`;
  if (type === "injury") return `${actor} 부상`;
  return `${actor} 득점`;
}

export function simulatePeriodWithWorld(
  input: SimInput,
  lo: number,
  hi: number,
  seedOffset: number,
  previousWorld?: MatchWorld,
): PeriodSimulation {
  const rng = mulberry32((input.seed + seedOffset) >>> 0);
  const goals: GoalEvent[] = [];
  const events: MatchEvent[] = [];
  let activePossessionId = "";
  let possessionBallPoint: { x: number; y: number } | null = null;
  const positionSamples: PositionSample[] = [];
  const samplesByMinute = new Map<number, PositionSample[]>();
  const running: Record<MatchSide, RunningStats> = {
    user: emptyRunningStats(),
    opp: emptyRunningStats(),
  };
  const playerStats = createPlayerStats(input);
  const snapshots = new Map<number, ReturnType<typeof createLiveSnapshot>>();
  const periodStartMinute = Math.max(0, lo - 1);
  const userTactics = tacticsForSide(input, "user");
  const oppTactics = tacticsForSide(input, "opp");
  const tacticsBySide = { user: userTactics, opp: oppTactics };
  let world = previousWorld
    ? continueMatchWorld(previousWorld, input, lo, tacticsBySide)
    : createMatchWorld(input, lo, tacticsBySide);
  const runtimeInput = runtimeInputForWorld(input, world);
  const activeSidePlayers = (side: MatchSide) =>
    sidePlayers(runtimeInput, side).filter(
      (player) => !world.unavailablePlayers[side].has(player.playerId),
    );
  const commitment = (side: MatchSide) => commitmentByThird(activeSidePlayers(side));
  const eloEdge = eloPerformanceEdge(input.userElo, input.oppElo);
  const creativityEdge = (input.userAbility.creativity - input.oppAbility.creativity) / 120;
  const tacticalPossessionEdge =
    (oppTactics.directnessBias - userTactics.directnessBias) * 0.018 +
    (userTactics.pressBias - oppTactics.pressBias) * 0.012;
  const userPossessionChance = clamp(
    0.5 +
      eloEdge * 0.075 +
      creativityEdge * 0.08 -
      (input.attackBias - (input.oppAttackBias ?? 0)) * 0.025 +
      tacticalPossessionEdge +
      (input.isHome ? 0.018 : -0.018),
    0.36,
    0.64
  );
  snapshots.set(
    periodStartMinute,
    createLiveSnapshot(runtimeInput, periodStartMinute, running, playerStats, goals, periodStartMinute)
  );

  // One clock drives everything: `world.elapsedSeconds` is seconds since
  // kickoff. Every action below consumes real match time, so the event log,
  // the match minute and the world's own movement can never drift apart, and
  // how often the ball changes hands becomes an outcome of play rather than a
  // fixed possession count.
  const periodEndSeconds = hi * 60;
  if (world.elapsedSeconds < periodStartMinute * 60) {
    world.elapsedSeconds = periodStartMinute * 60;
  }
  const currentMinute = () => clamp(Math.floor(world.elapsedSeconds / 60) + 1, lo, hi);
  const currentTimestamp = () => clamp(world.elapsedSeconds / 60, lo - 1, hi - 0.001);
  const advanceClock = (seconds: number) => {
    // Time passing between two recorded events repositions players, not the
    // ball: the event log has to stay one continuous ball path so the replay
    // never has to teleport it. A carry that really does move the ball is
    // recorded explicitly as a dribble event instead.
    const ballX = world.ball.x;
    const ballY = world.ball.y;
    // Long stoppages only need players to walk back into shape, so they are
    // stepped coarsely instead of at in-play resolution.
    const tickLength = seconds > 6 ? 2 : 0.5;
    let remaining = Math.max(0, seconds);
    while (remaining > 0.001) {
      const slice = Math.min(12, remaining);
      advanceWorld(world, runtimeInput, tacticsBySide, slice, tickLength);
      remaining -= slice;
    }
    world.ball.x = ballX;
    world.ball.y = ballY;
  };
  /**
   * How much harder a pass is because of its length and because of who is
   * standing where it lands.
   *
   * Completion falls away sharply with distance in real football — a square
   * ball is almost automatic, a fifty-yard ball into the channel is closer to
   * a coin toss — and an isolated receiver loses it whatever the passer did.
   * The engine had neither, so a side could skip an unmanned midfield entirely
   * and hit its forwards as reliably as a short pass, which is what made
   * shapes with a hole in them stronger than real ones.
   */
  const passDifficulty = (
    side: MatchSide,
    passer: PlacedPlayerLite,
    receiver: PlacedPlayerLite,
  ) => {
    const distance = worldDistance(world, side, passer, side, receiver);
    // Squared, so that ordinary short passing is barely touched while the
    // cost climbs steeply for balls that try to skip a whole third.
    const length = clamp((distance - 14) / 44, 0, 1);
    return length * length * 0.3;
  };
  /** Ball travel plus the receiver's touch and the next decision. */
  const passSeconds = (
    side: MatchSide,
    passer: PlacedPlayerLite,
    receiver: PlacedPlayerLite,
  ) => clamp(0.9 + worldDistance(world, side, passer, side, receiver) / 17, 1, 4);
  const DEAD_BALL_SECONDS = {
    goal: 52,
    penaltyKick: 45,
    corner: 30,
    freeKick: 24,
    offside: 24,
    goalKick: 22,
    save: 17,
    turnover: 1.4,
    tackle: 1.6,
    shot: 1,
  } as const;

  const eventCoordinate = (
    side: MatchSide,
    type: MatchEventType,
    actor: PlacedPlayerLite,
    target: PlacedPlayerLite | undefined,
    success: boolean,
  ) => coordinateFromWorld(
    world,
    runtimeInput,
    tacticsBySide,
    side,
    type,
    actor,
    target,
    success,
  );

  const classifyPass = (
    side: MatchSide,
    actor: PlacedPlayerLite,
    target: PlacedPlayerLite | undefined,
    coordinate: ReturnType<typeof eventCoordinate>
  ): PassType => {
    const sideTactics = side === "user" ? userTactics : oppTactics;
    const forwardDistance = side === "user"
      ? coordinate.endX - coordinate.x
      : coordinate.x - coordinate.endX;
    const lateralDistance = Math.abs(coordinate.endY - coordinate.y);
    const distance = Math.hypot(coordinate.endX - coordinate.x, lateralDistance);
    const wideOrigin = coordinate.y <= 24 || coordinate.y >= 76;
    const canonicalX = side === "user" ? coordinate.x : 100 - coordinate.x;
    const rollSeed = Math.abs(
      Math.sin((coordinate.x + coordinate.y * 3 + coordinate.endX * 5 + coordinate.endY * 7) * 12.9898)
    );

    const crossChance =
      0.38 +
      Math.max(0, sideTactics.widthBias) * 0.18 +
      Math.max(0, sideTactics.overlapBias) * 0.2;
    if (
      wideOrigin &&
      canonicalX >= 48 &&
      forwardDistance > 3 &&
      target?.position === "FWD" &&
      rollSeed < crossChance
    ) return "cross";

    const throughChance =
      0.2 +
      Math.max(0, sideTactics.creativityBias) * 0.2 +
      Math.max(0, sideTactics.directnessBias) * 0.12;
    if (
      target?.position === "FWD" &&
      actor.position !== "FWD" &&
      forwardDistance >= 12 &&
      rollSeed < throughChance
    ) return "through";

    if (distance >= 42 || (sideTactics.directnessBias >= 0.55 && forwardDistance >= 30)) return "longBall";
    if (distance <= 24 || (sideTactics.directnessBias <= -0.45 && distance <= 28)) return "short";
    return "normal";
  };

  const addEvent = (
    side: MatchSide,
    type: MatchEventType,
    actor: PlacedPlayerLite,
    target: PlacedPlayerLite | undefined,
    success: boolean,
    xg?: number
  ) => {
    const coordinate = eventCoordinate(side, type, actor, target, success);
    events.push({
      minute: currentMinute(),
      timestamp: currentTimestamp(),
      possessionId: activePossessionId,
      side,
      type,
      actorId: actor.playerId,
      actor: actor.name,
      targetId: target?.playerId,
      target: target?.name,
      success,
      xg,
      passType: type === "pass" ? classifyPass(side, actor, target, coordinate) : undefined,
      detail: actionDetail(type, actor.name, target?.name),
      ...coordinate,
    });
    possessionBallPoint = {
      x: coordinate.endX,
      y: coordinate.endY,
    };
  };

  /**
   * Decides whether a foul is punished, for both foul sources. Cards used to
   * be issued only from the dribble duel, which left the match on roughly a
   * sixth of real football's booking rate.
   *
   * A player already on a yellow is dismissed for a second one; the direct
   * red chance is kept low and independent so raising bookings does not drag
   * sendings-off up with them.
   */
  const bookOffender = (
    offendingSide: MatchSide,
    offender: PlacedPlayerLite,
    victim: PlacedPlayerLite,
    tactics: SimTacticProfile,
  ) => {
    const stats = playerStat(playerStats, offendingSide, offender);
    const directRedChance = clamp(
      0.0016 + Math.max(0, tactics.tacklingBias) * 0.0011,
      0.0016,
      0.004,
    );
    if (rng() < directRedChance) {
      running[offendingSide].redCards++;
      if (stats) stats.redCards++;
      addEvent(offendingSide, "redCard", offender, victim, false);
      markPlayerUnavailable(
        world,
        runtimeInput,
        offendingSide,
        offender,
        "dismissed",
        currentMinute(),
        tactics,
      );
      return;
    }
    const previousYellows = world.yellowCards[offendingSide].get(offender.playerId) ?? 0;
    const alreadyBooked = previousYellows > 0;
    const bookingChance =
      clamp(
        0.2 +
          Math.max(0, tactics.tacklingBias) * 0.09 +
          Math.max(0, tactics.pressBias) * 0.03 +
          Math.max(0, offender.aggression - 72) / 320,
        0.14,
        0.42,
      ) *
      // A booked player pulls out of challenges he would otherwise make, so
      // treating every foul alike produced far more second yellows than the
      // real game sees.
      (alreadyBooked ? 0.3 : 1);
    if (rng() >= bookingChance) return;
    if (alreadyBooked) {
      // Second caution: the referee sends him off rather than booking twice.
      running[offendingSide].redCards++;
      if (stats) stats.redCards++;
      addEvent(offendingSide, "redCard", offender, victim, false);
      markPlayerUnavailable(
        world,
        runtimeInput,
        offendingSide,
        offender,
        "dismissed",
        currentMinute(),
        tactics,
      );
      return;
    }
    running[offendingSide].yellowCards++;
    if (stats) stats.yellowCards++;
    world.yellowCards[offendingSide].set(offender.playerId, previousYellows + 1);
    addEvent(offendingSide, "yellowCard", offender, victim, false);
  };

  const recordOffside = (
    side: MatchSide,
    receiver: PlacedPlayerLite,
    passer: PlacedPlayerLite,
  ) => {
    running[side].offsides++;
    const receiverStats = playerStat(playerStats, side, receiver);
    if (receiverStats) receiverStats.offsides++;
    addEvent(side, "offside", receiver, passer, false);
    advanceClock(DEAD_BALL_SECONDS.offside);
  };

  const resolveSetPiece = (
    side: MatchSide,
    kind: "corner" | "freeKick" | "penaltyKick",
    taker: PlacedPlayerLite,
    keeperPlayer: PlacedPlayerLite,
  ) => {
    // Walking to the ball, forming a wall and waiting for the referee is a
    // real part of the ninety minutes, so a restart costs the clock.
    advanceClock(DEAD_BALL_SECONDS[kind]);
    activePossessionId = `${currentMinute()}:restart:${events.length}`;
    // The ball is physically placed on the corner arc or the penalty spot
    // before it is struck, so the restart event and everything that follows
    // read from there.
    const attackingRight = side === "user";
    if (kind === "corner") {
      world.ball.x = attackingRight ? 98 : 2;
      world.ball.y = world.ball.y < 50 ? 3 : 97;
    } else if (kind === "penaltyKick") {
      world.ball.x = attackingRight ? 89 : 11;
      world.ball.y = 50;
    }
    const sideTactics = side === "user" ? userTactics : oppTactics;
    const defendingSide = otherSide(side);
    const candidates = outfield(activeSidePlayers(side));
    if (kind === "corner") running[side].corners++;
    addEvent(side, kind, taker, keeperPlayer, true);

    const deliveryChance = kind === "penaltyKick"
      ? 1
      : clamp(
          0.16 +
            sideTactics.setPieceBias * 0.055 +
            (taker.passing + taker.longPassing - 130) / 900,
          0.08,
          0.3,
        );
    if (rng() >= deliveryChance || !candidates.length) return;

    // A goalkeeper can end up carrying the ball out of defence, and a foul on
    // him was handing him the resulting spot kick to take himself.
    const outfieldTaker =
      taker.position === "GK"
        ? weightedPick(candidates, (player) => 0.5 + player.penalties / 100, rng)
        : taker;
    const shooter = kind === "penaltyKick"
      ? outfieldTaker
      : weightedPick(
          candidates,
          (player) =>
            (player.position === "FWD" ? 2.8 : player.position === "DEF" ? 1.5 : 1.1) *
            (0.45 + (player.positioning + player.strength + player.finishing) / 300),
          rng,
        );
    const shotXg = kind === "penaltyKick"
      ? 0.76
      : clamp(
          (kind === "corner" ? 0.055 : 0.07) +
            sideTactics.setPieceBias * 0.012 +
            (shooter.positioning + shooter.finishing - 130) / 2200,
          0.025,
          0.16,
        );
    running[side].shots++;
    running[side].xg += shotXg;
    const shooterStats = playerStat(playerStats, side, shooter);
    if (shooterStats) shooterStats.shots++;
    addEvent(side, "shot", shooter, keeperPlayer, true, shotXg);
    advanceClock(DEAD_BALL_SECONDS.shot);

    const keeperSkill = (keeperPlayer.gkReflexes + keeperPlayer.gkPositioning + keeperPlayer.gkHandling) / 3;
    const goalChance = kind === "penaltyKick"
      ? clamp(0.72 + (shooter.finishing + shooter.composure - keeperSkill * 2) / 500, 0.56, 0.86)
      : clamp(
          shotXg * (0.92 + (shooter.finishing - keeperSkill) / 180),
          0.01,
          0.22,
        );
    if (rng() < goalChance) {
      running[side].shotsOnTarget++;
      if (shooterStats) {
        shooterStats.shotsOnTarget++;
        shooterStats.goals++;
      }
      for (const defender of activeSidePlayers(defendingSide)) {
        if (defender.position !== "GK" && defender.position !== "DEF") continue;
        const stat = playerStat(playerStats, defendingSide, defender);
        if (stat) stat.goalsConceded++;
      }
      goals.push({
        minute: currentMinute(),
        side,
        scorerId: shooter.playerId,
        scorer: shooter.name,
        assistId: kind === "penaltyKick" ? undefined : taker.playerId,
        assist: kind === "penaltyKick" ? undefined : taker.name,
      });
      addEvent(
        side,
        "goal",
        shooter,
        kind === "penaltyKick" ? undefined : taker,
        true,
        shotXg,
      );
      advanceClock(DEAD_BALL_SECONDS.goal);
      return;
    }
    if (rng() < 0.45) {
      running[side].shotsOnTarget++;
      running[defendingSide].saves++;
      if (shooterStats) shooterStats.shotsOnTarget++;
      const keeperStats = playerStat(playerStats, defendingSide, keeperPlayer);
      if (keeperStats) keeperStats.saves++;
      addEvent(defendingSide, "save", keeperPlayer, shooter, true, shotXg);
      advanceClock(DEAD_BALL_SECONDS.save);
    } else {
      addEvent(side, "miss", shooter, undefined, false, shotXg);
      advanceClock(DEAD_BALL_SECONDS.goalKick);
    }
  };

  let possessionIndex = 0;
  while (world.elapsedSeconds < periodEndSeconds && possessionIndex < 12_000) {
    const minute = currentMinute();
    if (world.minute !== minute) {
      samplesByMinute.set(world.minute, samplesFromWorld(world, world.minute));
      world.minute = minute;
    }
    activePossessionId = `${minute}:${possessionIndex++}`;
    possessionBallPoint = null;
    const ownerSide = world.ball.ownerSide;
    // A loose ball is contested, not handed over. Strictly alternating it
    // pinned possession at fifty-fifty no matter what either side put on the
    // pitch, which is why a shape with an empty midfield never lost the ball
    // there: whoever had it last simply gave it back. The side with more
    // bodies committed to the zone the ball is in picks it up more often.
    const contestedSide = (): MatchSide => {
      const previous = world.lastPossessionSide;
      if (previous == null) return rng() < userPossessionChance ? "user" : "opp";
      const userThird = thirdOf(world.ball.x);
      const userBodies = commitment("user")[userThird];
      const oppBodies = commitment("opp")[2 - userThird];
      // The better side wins more of the loose balls. Team strength used to
      // reach the match through the opening possession alone, which left a
      // two-hundred-point rating gap deciding almost nothing.
      const userShare = clamp(
        0.5 +
          (userBodies - oppBodies) * 0.09 +
          eloEdge * 0.1 +
          creativityEdge * 0.05 +
          (previous === "user" ? -0.16 : 0.16),
        0.12,
        0.88,
      );
      return rng() < userShare ? "user" : "opp";
    };
    const side: MatchSide = ownerSide ?? contestedSide();
    const defendingSide = otherSide(side);
    const attackers = outfield(activeSidePlayers(side));
    const possessionPlayers = activeSidePlayers(side);
    const defenders = outfield(activeSidePlayers(defendingSide));
    const keeperPlayer = goalkeeper(activeSidePlayers(defendingSide));
    // Without a playable squad there is no action that could advance the
    // clock, so stop rather than spin.
    if (!attackers.length || !defenders.length || !keeperPlayer) break;

    /**
     * Winning the ball deep against a side that has committed bodies forward
     * is a counter-attack: it happens rarely, but it arrives at a defence that
     * is not yet set. This is the only route to goal a shape built to defend
     * has, and without it such a shape had no attack at all — it took a third
     * of the shots of an attacking one and converted them no better, so
     * committing players to defence was pure loss.
     */
    const possessionStartX = side === "user" ? world.ball.x : 100 - world.ball.x;
    const opponentUpfield =
      commitment(defendingSide)[2] + commitment(defendingSide)[1] * 0.35;
    const counterAttack = clamp(
      ((46 - possessionStartX) / 46) * (opponentUpfield - 2.4) * 0.55,
      0,
      1.2,
    );

    const sideTactics = side === "user" ? userTactics : oppTactics;
    const defendingTactics = side === "user" ? oppTactics : userTactics;
    const formationAttackBias = side === "user" ? input.attackBias : input.oppAttackBias ?? 0;
    const sideAttackBias = clamp(formationAttackBias + sideTactics.attackBias, -1.5, 1.5);
    const directness = clamp(sideAttackBias * 0.45 + sideTactics.directnessBias, -1.4, 1.4);
    const counterEdge = clamp(sideTactics.counterBias - defendingTactics.counterBias, -1.5, 1.5);
    const sideWorkRate = tacticalWorkRate(sideTactics, minute);
    const defendingWorkRate = tacticalWorkRate(defendingTactics, minute);
    const sideStrengthEdge = side === "user" ? eloEdge : -eloEdge;
    const sideQualityMultiplier = eloQualityMultiplier(eloEdge, side);
    const defendingQualityMultiplier = eloQualityMultiplier(eloEdge, defendingSide);
    const matchupEdge = tacticalMatchupEdge(
      sideTactics,
      defendingTactics,
      possessionPlayers,
      activeSidePlayers(defendingSide),
    );
    // How much space the defending side has left behind and around itself.
    // Every term is a deliberate choice that side made to gain something
    // else, so this is the price of those choices.
    const defendingExposure = clamp(
      Math.max(0, defendingTactics.defensiveLineBias) * 0.95 +
        Math.max(0, defendingTactics.engagementBias) * 0.4 +
        Math.max(0, defendingTactics.pressBias) * 0.3 +
        Math.max(0, -defendingTactics.restDefenseBias) * 0.75 +
        Math.max(0, -defendingTactics.compactnessBias) * 0.25 +
        Math.max(0, defendingTactics.compactnessBias) * Math.max(0, sideTactics.widthBias) * 0.5 +
        // A sprung trap is the highest-risk defending there is: beat it and
        // the runner is clean through.
        defendingTactics.offsideTrapBias * 0.45,
      0,
      2,
    );
    /**
     * A stepping line also catches runs that were level. The roll is only
     * taken when a trap is actually set, so a side that does not use one is
     * judged purely on positions as before.
     */
    // A ball played beyond the last defender is a race, not an automatic
    // offence. Flagging every one of them made a suicidally high line
    // unbeatable: a side that pushed its whole team upfield caught the
    // opponent offside a dozen times a match and conceded nothing. Now the
    // mistimed run is punished and the well-timed one arrives behind the
    // defence, which is the price a high line is supposed to pay.
    /**
     * How many bodies the defending side commits to the zone the ball is in,
     * over and above the side in possession. Being three to nil in midfield is
     * why a shape with no midfielders cannot play through it, and no amount of
     * individual quality makes up for it.
     */
    const outnumberedHere = () => {
      const ballCanonical = side === "user" ? world.ball.x : 100 - world.ball.x;
      // Only the middle third. Being outnumbered in the attacking third is the
      // normal condition of attacking — every defence has more bodies in its
      // own box than the attack does — and counting it here punished any shape
      // with a lone striker so heavily it could barely build a move at all.
      // What happens near the goal is already modelled by defensive cover.
      if (thirdOf(ballCanonical) !== 1) return 0;
      return clamp(commitment(defendingSide)[1] - commitment(side)[1], -2, 4);
    };
    let throughOnGoal = false;
    // How far up the pitch the defending side holds its last line. A line on
    // the edge of its own box is hard to run behind and leaves nothing when
    // beaten; one pushed towards halfway is easy to time and leaves a prairie.
    // This is the whole risk-reward of a high line, and the engine had only
    // the reward: the flag went up and the attack simply died.
    const lineRisk = clamp(
      (defensiveLineHeight(world, defendingSide) - 27) / 20,
      0,
      1.5,
    );
    const mistimedRun = (receiver: PlacedPlayerLite) =>
      rng() <
      clamp(
        0.76 -
          lineRisk * 0.09 -
          (receiver.positioning - 68) / 320 -
          (receiver.pace - 68) / 380 +
          defendingTactics.offsideTrapBias * 0.13,
        0.1,
        0.93,
      );
    /** Returns true when the pass is cut off by the flag. */
    const offsideAgainst = (receiver: PlacedPlayerLite) => {
      if (
        defendingTactics.offsideTrapBias > 0 &&
        rng() < defendingTactics.offsideTrapBias * 0.004
      ) {
        return true;
      }
      if (offsideMargin(world, side, receiver) <= 0) return false;
      if (mistimedRun(receiver)) return true;
      // He timed it, and the run carries him past the last defender. Moving
      // him there is what makes the through ball real: the event log, the ball
      // path and the 2D replay all show it arriving behind the defence rather
      // than a shot struck from his starting slot.
      const runner = world.players[side].get(receiver.playerId);
      if (runner) {
        runner.x = side === "user"
          ? Math.max(runner.x, 84 + rng() * 9)
          : Math.min(runner.x, 16 - rng() * 9);
        runner.y = clamp(runner.y + (rng() - 0.5) * 12, 18, 82);
      }
      throughOnGoal = true;
      return false;
    };
    // Real possessions are short: about three or four touches before the ball
    // is either progressed into a chance or given away. The clock-driven loop
    // now runs many more of them per match, so each one has to be brief for
    // the season-long totals to stay in a football-shaped range.
    const routinePassCount = possessionPlayers.length > 1
      ? Math.round(clamp(1.35 - directness * 0.7 - sideTactics.tempoBias * 0.5 + (rng() - 0.5) * 3.4, 0, 6))
      : 0;
    // A possession has one authoritative carrier. Previously every routine
    // pass picked a fresh random passer, so A→B could be followed by C→D
    // without B ever touching the ball. Keeping the receiver as the next
    // carrier makes the statistical event log a real, replayable sequence.
    const existingCarrier =
      world.ball.ownerSide === side && world.ball.ownerId != null
        ? possessionPlayers.find((player) => player.playerId === world.ball.ownerId)
        : undefined;
    const isFreshWorld = world.lastPossessionSide == null;
    let possessionCarrier = existingCarrier ?? weightedPick(
      possessionPlayers,
      (player) => {
        const state = world.players[side].get(player.playerId);
        const ballDistance = state
          ? Math.hypot(state.x - world.ball.x, state.y - world.ball.y)
          : 50;
        const roleWeight = isFreshWorld
          ? player.position === "GK" ? 0.8 : player.position === "DEF" ? 2.8 : player.position === "MID" ? 2.4 : 1.1
          : 1 / Math.max(2, ballDistance);
        return roleWeight * (0.55 + player.ballControl / 110);
      },
      rng,
    );
    const possessionChanged = world.lastPossessionSide !== side;
    beginPossession(world, side, possessionCarrier);
    // The recovery is recorded where the ball was actually won, before the
    // settling time below moves the winner. Recording it afterwards made the
    // ball jump from the recovery point to wherever the carrier had run to.
    if (!existingCarrier || possessionChanged) {
      addEvent(
        side,
        "recovery",
        possessionCarrier,
        undefined,
        true,
      );
    }
    // The first possession needs time to settle from kickoff coordinates.
    // Afterwards this is the moment between winning the ball and playing it.
    advanceClock(isFreshWorld ? 5 : existingCarrier ? 0.9 : 1.8);
    let possessionLost = false;
    for (let pass = 0; pass < routinePassCount; pass++) {
      const passer = possessionCarrier;
      const receiver = weightedPick(
        possessionPlayers.filter((player) => player.playerId !== passer.playerId),
        (player) => {
          // Keep illegal receivers selectable so natural offside mistakes are
          // still possible, but strongly prefer a legal passing lane.
          const offsideFit = isPlayerOffside(world, side, player) ? 0.08 : 1;
          return passOptionScore(
            world,
            side,
            passer,
            player,
            directness,
            sideTactics.focusBias,
            sideTactics.centralFocusBias,
          ) * offsideFit;
        },
        rng
      );
      const pressingDefender = weightedPick(
        defenders,
        (player) => {
          const distance = worldDistance(
            world,
            defendingSide,
            player,
            side,
            passer,
          );
          return (
            0.5 + (player.interceptions + player.aggression + player.reactions) / 240
          ) * (1 / (1 + distance / (18 + Math.max(0, defendingTactics.pressBias) * 8)));
        },
        rng
      );
      const passQuality = skill(passer, minute, input.elevation, [
        [passer.shortPassing, 0.42],
        [passer.passing, 0.24],
        [passer.vision, 0.14],
        [passer.ballControl, 0.12],
        [passer.composure, 0.08],
      ], "technical", sideTactics) * sideWorkRate * sideQualityMultiplier;
      const pressureQuality = skill(pressingDefender, minute, input.elevation, [
        [pressingDefender.interceptions, 0.38],
        [pressingDefender.defensiveAwareness, 0.28],
        [pressingDefender.reactions, 0.2],
        [pressingDefender.aggression, 0.14],
      ], "decision", defendingTactics) * defendingWorkRate * defendingQualityMultiplier * (
        1 +
        defendingTactics.pressBias * 0.055 +
        defendingTactics.defensiveLineBias * 0.025 +
        defendingTactics.tacklingBias * 0.02
      );
      const laneRisk = worldPassLanePressure(
        world,
        side,
        passer,
        receiver,
        defenders,
      );
      // Where the ball is decides how dangerous the pass is. Building out of
      // our own third against a side that presses high is the risky moment;
      // the same pass in midfield against a low block is not. Without this the
      // turnover map was flat and told the manager nothing.
      const ballAtPass = side === "user" ? world.ball.x : 100 - world.ball.x;
      const inOwnThird = clamp((40 - ballAtPass) / 40, 0, 1);
      const trappedInBuildUp =
        inOwnThird *
        Math.max(0, defendingTactics.pressBias + defendingTactics.engagementBias) *
        0.075;
      // Bodies around the ball. Leaving a line of the pitch unmanned means
      // being surrounded every time the ball arrives there, which is the cost
      // a nonsense shape has to pay and previously did not.
      const routinePassChance = clamp(
        0.955 +
          (passQuality - pressureQuality) / 500 -
          directness * 0.018 +
          matchupEdge * 0.35 -
          laneRisk * 0.045 -
          defendingTactics.pressBias * 0.055 -
          defendingTactics.defensiveLineBias * 0.02 -
          trappedInBuildUp -
          Math.max(0, outnumberedHere() - 1) * 0.09 -
          passDifficulty(side, passer, receiver),
        0.4,
        0.98
      );
      const pressingFoulChance = clamp(
        0.004 +
          (defendingTactics.pressBias + 1) * 0.009 +
          (defendingTactics.tacklingBias + 1) * 0.003 +
          Math.max(0, pressingDefender.aggression - 72) / 4000,
        0.004,
        0.032,
      );
      // The restraint has to be judged on the same spot that decides the
      // restart, or the discount is applied to one place and the penalty
      // awarded from another.
      const passerPoint = world.players[side].get(passer.playerId);
      const canonicalFoulX = side === "user"
        ? passerPoint?.x ?? 50
        : 100 - (passerPoint?.x ?? 50);
      if (rng() < pressingFoulChance * penaltyAreaRestraint(canonicalFoulX)) {
        running[defendingSide].fouls++;
        const defenderStats = playerStat(playerStats, defendingSide, pressingDefender);
        if (defenderStats) defenderStats.foulsCommitted++;
        addEvent(defendingSide, "foul", pressingDefender, passer, false);
        bookOffender(defendingSide, pressingDefender, passer, defendingTactics);
        resolveSetPiece(side,
          canonicalFoulX >= PENALTY_AREA_X ? "penaltyKick" : "freeKick",
          passer,
          keeperPlayer,
        );
        possessionLost = true;
        break;
      }
      const passerStats = playerStat(playerStats, side, passer);
      running[side].possessionTouches++;
      running[side].passesAttempted++;
      if (passerStats) {
        passerStats.touches++;
        passerStats.passesAttempted++;
      }
      if (offsideAgainst(receiver)) {
        recordOffside(side, receiver, passer);
        possessionLost = true;
        break;
      }
      const passCost = passSeconds(side, passer, receiver);
      if (rng() < routinePassChance) {
        running[side].passesCompleted++;
        if (passerStats) passerStats.passesCompleted++;
        const receiverStats = playerStat(playerStats, side, receiver);
        if (receiverStats) receiverStats.touches++;
        addEvent(side, "pass", passer, receiver, true);
        advanceClock(passCost);
        possessionCarrier = receiver;
      } else if (
        rng() <
        clamp(
          0.38 +
            defendingTactics.pressBias * 0.26 +
            defendingTactics.defensiveLineBias * 0.03 +
            // Engaging higher up wins the ball closer to the opponent goal;
            // a compact block makes the interception itself more likely.
            defendingTactics.engagementBias * 0.12 +
            defendingTactics.compactnessBias * 0.01,
          0.08,
          0.78,
        )
      ) {
        running[defendingSide].interceptions++;
        const defenderStats = playerStat(playerStats, defendingSide, pressingDefender);
        if (defenderStats) defenderStats.interceptions++;
        addEvent(side, "pass", passer, receiver, false);
        addEvent(defendingSide, "interception", pressingDefender, passer, true);
        advanceClock(DEAD_BALL_SECONDS.turnover);
        possessionLost = true;
        break;
      } else {
        addEvent(side, "pass", passer, receiver, false);
        advanceClock(passCost);
        possessionLost = true;
        break;
      }
    }

    if (possessionLost) continue;
    let carrier = possessionCarrier;
    let lastPasser: PlacedPlayerLite | undefined;
    let progress = 0;
    const maxActions = Math.round(clamp(1 + Math.floor(rng() * 3) + sideTactics.tempoBias * 0.6, 1, 4));

    for (let action = 0; action < maxActions; action++) {
      running[side].possessionTouches++;
      const carrierStats = playerStat(playerStats, side, carrier);
      if (carrierStats) carrierStats.touches++;
      // Recomputed every touch: the ball moves between zones, and with it the
      // question of who has the numbers where it now is.
      const actionPressure = outnumberedHere();
      const defender = weightedPick(
        defenders,
        (player) => {
          const roleWeight = player.position === "DEF" ? 2.8 : player.position === "MID" ? 1.8 : 0.7;
          const distance = worldDistance(
            world,
            defendingSide,
            player,
            side,
            carrier,
          );
          return roleWeight *
            (0.45 + (player.defensiveAwareness + player.aggression) / 200) *
            (1 / (1 + distance / 22));
        },
        rng
      );

      const carrierDribble = skill(carrier, minute, input.elevation, [
        [carrier.dribbling, 0.34],
        [carrier.ballControl, 0.24],
        [carrier.agility, 0.18],
        [carrier.pace, 0.14],
        [carrier.composure, 0.1],
      ], "technical", sideTactics) * sideWorkRate * sideQualityMultiplier;
      const defenderTackle = skill(defender, minute, input.elevation, [
        [defender.standingTackle, 0.3],
        [defender.defensiveAwareness, 0.24],
        [defender.strength, 0.17],
        [defender.interceptions, 0.17],
        [defender.reactions, 0.12],
      ], "duel", defendingTactics) * defendingWorkRate * defendingQualityMultiplier * (
        1 +
        defendingTactics.pressBias * 0.045 +
        defendingTactics.tacklingBias * 0.06 +
        defendingTactics.defensiveLineBias * 0.025
      );
      const wantsDribble =
        carrier.position === "FWD"
          ? rng() < 0.32 + Math.max(0, carrier.dribbling - carrier.passing) / 180
          : rng() < 0.16;

      if (wantsDribble) {
        if (carrierStats) carrierStats.dribblesAttempted++;
        // Beating one man is a duel; beating a crowd is not.
        const dribbleChance = clamp(
          0.5 + (carrierDribble - defenderTackle) / 145 - Math.max(0, actionPressure - 1) * 0.1,
          0.12,
          0.82,
        );
        if (rng() < dribbleChance) {
          progress += 1.2;
          if (carrierStats) carrierStats.dribblesCompleted++;
          addEvent(side, "dribble", carrier, defender, true);
        } else {
          const defenderStats = playerStat(playerStats, defendingSide, defender);
          const duelPoint = possessionBallPoint ?? tacticalHome(carrier, side, sideTactics);
          const duelX = side === "user" ? duelPoint.x : 100 - duelPoint.x;
          const foulChance = clamp(
            0.06 +
              Math.max(0, defendingTactics.tacklingBias) * 0.055 +
              Math.max(0, defendingTactics.pressBias) * 0.035 +
              Math.max(0, defender.aggression - 65) / 900,
            0.035,
            0.18,
          ) * penaltyAreaRestraint(duelX);
          if (rng() < foulChance) {
            let setPieceTaker = carrier;
            running[defendingSide].fouls++;
            if (defenderStats) defenderStats.foulsCommitted++;
            addEvent(defendingSide, "foul", defender, carrier, false);
            bookOffender(defendingSide, defender, carrier, defendingTactics);
            if (rng() < 0.018 + Math.max(0, defendingTactics.tacklingBias) * 0.01) {
              running[side].injuries++;
              if (carrierStats) carrierStats.injuries++;
              addEvent(side, "injury", carrier, defender, false);
              markPlayerUnavailable(
                world,
                runtimeInput,
                side,
                carrier,
                "injured",
                currentMinute(),
                sideTactics,
              );
              setPieceTaker = activeSidePlayers(side)[0] ?? carrier;
            }
            resolveSetPiece(side,
              duelX >= PENALTY_AREA_X ? "penaltyKick" : "freeKick",
              setPieceTaker,
              keeperPlayer,
            );
            break;
          }
          running[defendingSide].tacklesWon++;
          running[defendingSide].possessionTouches++;
          if (defenderStats) defenderStats.tacklesWon++;
          addEvent(defendingSide, "tackle", defender, carrier, true);
          advanceClock(DEAD_BALL_SECONDS.tackle);
          break;
        }
      } else {
        const receivers = attackers.filter((player) => player.playerId !== carrier.playerId);
        if (!receivers.length) break;
        const receiver = weightedPick(
          receivers,
          (player) => {
            const forwardWeight = player.position === "FWD" ? 2.8 : player.position === "MID" ? 2 : 0.75;
            const carrierHome =
              world.players[side].get(carrier.playerId) ??
              tacticalHome(carrier, side, sideTactics);
            const receiverHome =
              world.players[side].get(player.playerId) ??
              tacticalHome(player, side, sideTactics);
            const forwardDistance = side === "user"
              ? receiverHome.x - carrierHome.x
              : carrierHome.x - receiverHome.x;
            const distance = Math.hypot(
              receiverHome.x - carrierHome.x,
              receiverHome.y - carrierHome.y,
            );
            // See passOptionScore: a neutral directness still means forward.
            const forwardFit = clamp(1 + forwardDistance * (0.8 + directness) / 55, 0.45, 2.0);
            const distanceFit = 1 / (1 + Math.max(0, distance - (22 + directness * 8)) / 22);
            const offsideFit = isPlayerOffside(world, side, player) ? 0.08 : 1;
            const focusFit = attackFocusLaneWeight(
              receiverHome.y,
              sideTactics.focusBias,
              side === "user" ? 1 : -1,
              sideTactics.centralFocusBias,
            );
            return forwardWeight *
              (0.45 + (player.positioning + player.pace + player.reactions) / 300) *
              forwardFit *
              distanceFit *
              focusFit *
              offsideFit;
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
        ], "technical", sideTactics) * sideWorkRate * sideQualityMultiplier;
        const interceptionQuality = skill(defender, minute, input.elevation, [
          [defender.interceptions, 0.32],
          [defender.defensiveAwareness, 0.27],
          [defender.reactions, 0.17],
          [defender.aggression, 0.12],
          [defender.pace, 0.12],
        ], "decision", defendingTactics) * defendingWorkRate * defendingQualityMultiplier * (
          1 +
          defendingTactics.pressBias * 0.08 +
          defendingTactics.defensiveLineBias * 0.03 +
          defendingTactics.tacklingBias * 0.018
        );
        const laneRisk = worldPassLanePressure(
          world,
          side,
          carrier,
          receiver,
          defenders,
        );
        // A compact block closes the middle but leaves the flanks; a stretched
        // one is the reverse, so width is the way through a squeezed defence.
        const compactnessResistance =
          defendingTactics.compactnessBias * 0.014 -
          defendingTactics.compactnessBias * Math.max(0, sideTactics.widthBias) * 0.075;
        // Deep in the final third a packed defence is where possession dies,
        // which is what a low block is for.
        const ballHere = side === "user" ? world.ball.x : 100 - world.ball.x;
        const inFinalThird = clamp((ballHere - 60) / 40, 0, 1);
        const congestion =
          inFinalThird *
          (Math.max(0, -defendingTactics.defensiveLineBias) +
            Math.max(0, defendingTactics.compactnessBias)) *
          0.06;
        const passChance = clamp(
          0.77 -
            compactnessResistance -
            congestion +
            (passQuality - interceptionQuality) / 220 -
            progress * 0.012 -
            directness * 0.025 -
            sideTactics.creativityBias * 0.018 +
            matchupEdge * 0.5 -
            laneRisk * 0.07 -
            Math.max(0, actionPressure - 1) * 0.115 -
            passDifficulty(side, carrier, receiver),
          0.22,
          0.92
        );
        running[side].passesAttempted++;
        if (carrierStats) carrierStats.passesAttempted++;
        if (offsideAgainst(receiver)) {
          recordOffside(side, receiver, carrier);
          break;
        }
        const passCost = passSeconds(side, carrier, receiver);
        if (rng() < passChance) {
          running[side].passesCompleted++;
          if (carrierStats) carrierStats.passesCompleted++;
          const baseProgress = receiver.position === "FWD" ? 0.95 : receiver.position === "MID" ? 0.82 : 0.55;
          progress +=
            baseProgress *
            clamp(1 + directness * 0.2 + counterEdge * 0.08, 0.72, 1.35) *
            // Ground is taken against bodies. A side outnumbered in the zone
            // the ball is in does not build moves through it.
            clamp(1 - Math.max(0, actionPressure - 1) * 0.36, 0.22, 1);
          addEvent(side, "pass", carrier, receiver, true);
          advanceClock(passCost);
          lastPasser = carrier;
          carrier = receiver;
        } else {
          running[defendingSide].interceptions++;
          running[defendingSide].possessionTouches++;
          const defenderStats = playerStat(playerStats, defendingSide, defender);
          if (defenderStats) defenderStats.interceptions++;
          addEvent(side, "pass", carrier, receiver, false);
          addEvent(defendingSide, "interception", defender, carrier, true);
          advanceClock(DEAD_BALL_SECONDS.turnover);
          break;
        }
      }

      // Attacking instructions buy attempts, but the shape now holds its lines
      // instead of collapsing onto the ball, so the same instruction reaches
      // the box far more often than it used to and needs a smaller premium.
      const tacticShotBias =
        sideAttackBias * 0.021 +
        sideTactics.overlapBias * 0.005 +
        counterEdge * 0.009 +
        sideTactics.tempoBias * 0.006 +
        sideTactics.shootingBias * 0.019 +
        // Bodies sent forward instead of held back arrive in the box.
        Math.max(0, -sideTactics.restDefenseBias) * 0.010 +
        matchupEdge * 0.1;
      // A possession reaching the final third is not automatically a shot.
      // These rates keep a normal match near 24-28 combined attempts while
      // preserving the relative effect of roles and attacking instructions.
      const roleShotChance = carrier.position === "FWD" ? 0.088 : carrier.position === "MID" ? 0.052 : 0.019;
      // Whether the defence is actually there. A packed box is why standing
      // strikers in it produces nothing, and an empty one is why a side that
      // keeps nobody home concedes every time the ball arrives. Without this
      // the engine resolved everything as a 1v1 against one picked opponent,
      // so fielding no defenders at all was free.
      const cover = defensiveThirdCover(world, defendingSide);
      // The scale has to keep rewarding bodies past a back four, or it
      // saturates exactly where defensive formations live: a 5-4-1 got no more
      // credit for its extra defenders than a 4-3-3, so committing players to
      // defence cost attacking output and bought nothing back.
      const openness = clamp((6.2 - cover) / 4.6, 0, 1.1);
      // Through on goal is a chance regardless of how many bodies are behind
      // the ball, because they have all been beaten.
      // There is only so much room in front of a goal. Bodies past a full
      // front line get in each other's way and, worse, are not behind the ball
      // building the move that would reach them — so stacking the attacking
      // third has to give diminishing returns rather than multiplying chances.
      const crowding = clamp(1 - Math.max(0, commitment(side)[2] - 4) * 0.13, 0.4, 1);
      const spaceToShoot = (throughOnGoal ? 1.3 : 0.37 + openness * 0.54) * crowding;
      const carrierPoint = possessionBallPoint ?? tacticalHome(carrier, side, sideTactics);
      const canonicalShotX = side === "user" ? carrierPoint.x : 100 - carrierPoint.x;
      // The final touch has to reach the edge of the penalty area before a
      // shot can be recorded. 78 is also the lower bound used by the visual
      // replay, so a shot never appears to come from midfield.
      const targetShotX = 78;
      // A runner who has beaten the last line is behind the defence by
      // definition, wherever his formation slot happens to sit. Judging him by
      // that static slot is why a side with no defenders could not be scored
      // against: its opponents' forwards stood permanently offside, so the
      // ball never reached the shooting band at all.
      const shootNow =
        carrier.position !== "GK" &&
        canonicalShotX >= 66 &&
        (
          // A runner who has beaten the last line shoots; he has only the
          // keeper in front of him. Leaving him on the ordinary per-touch
          // rate meant breaking a high line was worth almost nothing.
          (throughOnGoal && rng() < 0.33) ||
          // A shot is the end of a move, not a property of where a player
          // happens to be standing. Weighting the carrier's role far above the
          // possession's progress let a side manufacture chances simply by
          // stationing six forwards in the box: every one of them was a
          // shooter the moment the ball reached him. Progress has to earn it.
          rng() < (roleShotChance * 0.40 + progress * 0.071 + tacticShotBias) * spaceToShoot * (1 + counterAttack * 0.28) ||
          (action === maxActions - 1 && rng() < 0.02 * spaceToShoot)
        );
      if (!shootNow) continue;

      // A shot cannot be resolved from midfield. If a promising possession is
      // still short of the box, add visible ball-carrying actions first. The
      // 2D projector makes the carrier run these coordinates instead of
      // teleporting the player or the ball to the shooting point.
      // Only a possession that is already close can carry into a shooting
      // position. Allowing a long chain of carries here let almost any
      // midfield possession manufacture a chance.
      let approachX = canonicalShotX;
      for (let carry = 0; carry < 3 && approachX < targetShotX; carry++) {
        if (carrierStats) {
          carrierStats.dribblesAttempted++;
          carrierStats.dribblesCompleted++;
        }
        addEvent(side, "dribble", carrier, undefined, true);
        const carriedPoint = possessionBallPoint as { x: number; y: number } | null;
        approachX = side === "user"
          ? carriedPoint?.x ?? approachX
          : 100 - (carriedPoint?.x ?? 100 - approachX);
      }
      if (approachX < targetShotX) {
        continue;
      }

      const marker = weightedPick(
        defenders,
        (player) => 0.4 + (player.defending + player.defensiveAwareness) / 140,
        rng
      );
      // Tactical risk must create some better chances, but it must not turn
      // every shot into a one-on-one. The previous linear multiplier could
      // add 0.32 xG to every attempt. A saturating curve keeps exposed space
      // meaningful while preventing repeated 6-4 and 7-3 scorelines.
      const exposureChanceBoost =
        0.015 * (1 - Math.exp(-Math.max(0, defendingExposure) * 1.25));
      const matchupChanceBoost = clamp(matchupEdge * 0.04, -0.02, 0.03);
      // Urgency creates more attempts, not magically cleaner chances. Teams
      // throwing bodies forward or shooting on sight take a larger share of
      // hurried efforts from imperfect positions.
      const forcedShotPenalty =
        Math.max(0, sideTactics.attackBias - 0.25) * 0.012 +
        Math.max(0, sideTactics.shootingBias) * 0.012;
      const chanceCreation =
        (carrier.positioning - marker.defensiveAwareness) / 900 +
        ((lastPasser?.vision ?? carrier.vision) - 65) / 1300 +
        progress * 0.0045 +
        sideTactics.overlapBias * 0.004 +
        sideTactics.widthBias * 0.004 +
        sideTactics.creativityBias * 0.016 -
        sideTactics.shootingBias * 0.012 +
        sideTactics.setPieceBias * 0.003 +
        counterEdge * 0.009 +
        Math.max(0, -sideTactics.restDefenseBias) * 0.01 +
        // What the defending side's plan costs it. A high line and a high
        // press leave grass behind them, and a side that keeps few players
        // home is punished on the break — without this, committing everyone
        // forward was free and pure upside.
        exposureChanceBoost +
        matchupChanceBoost -
        forcedShotPenalty +
        // A stronger side tends to turn the same territory into a slightly
        // cleaner look. This remains much smaller than a favourable tactical
        // matchup, so the manager can still reverse the expected result.
        sideStrengthEdge * 0.016 +
        // An unguarded box is a chance; a crowded one is a blocked effort.
        openness * 0.04 +
        // A defence that has not reset yet is the whole value of a counter.
        counterAttack * 0.09 +
        (throughOnGoal ? 0.10 : 0);
      const baseXg = carrier.position === "FWD" ? 0.058 : carrier.position === "MID" ? 0.035 : 0.020;
      const shotXg = clamp(baseXg + chanceCreation + rng() * 0.03, 0.01, 0.45);
      running[side].shots++;
      running[side].xg += shotXg;
      const shooterStats = playerStat(playerStats, side, carrier);
      if (shooterStats) shooterStats.shots++;
      if (lastPasser && lastPasser.name !== carrier.name) {
        const creatorStats = playerStat(playerStats, side, lastPasser);
        if (creatorStats) creatorStats.keyPasses++;
      }
      const recordBigChanceMiss = () => {
        if (shotXg >= 0.18 && shooterStats) shooterStats.bigChancesMissed++;
      };
      addEvent(side, "shot", carrier, keeperPlayer, true, shotXg);
      advanceClock(DEAD_BALL_SECONDS.shot);

      const shootingTechnique = skill(carrier, minute, input.elevation, [
        [carrier.shooting, 0.22],
        [carrier.finishing, 0.3],
        [carrier.shotPower, 0.13],
        [carrier.composure, 0.2],
        [carrier.positioning, 0.15],
      ], "technical", sideTactics) * sideWorkRate * sideQualityMultiplier;
      const blockQuality = skill(marker, minute, input.elevation, [
        [marker.defending, 0.22],
        [marker.defensiveAwareness, 0.28],
        [marker.standingTackle, 0.2],
        [marker.reactions, 0.16],
        [marker.aggression, 0.14],
      ], "duel", defendingTactics) * defendingWorkRate * defendingQualityMultiplier;
      const keeperQuality = skill(keeperPlayer, minute, input.elevation, [
        [keeperPlayer.gkReflexes, 0.3],
        [keeperPlayer.gkDiving, 0.25],
        [keeperPlayer.gkPositioning, 0.22],
        [keeperPlayer.gkHandling, 0.13],
        [keeperPlayer.reactions, 0.1],
      ], "goalkeeping", defendingTactics) * defendingWorkRate * defendingQualityMultiplier;
      const finishingMultiplier = clamp(0.84 + (shootingTechnique - 60) / 160, 0.68, 1.28);
      const keeperMultiplier = clamp(0.74 - (keeperQuality - 65) / 260, 0.54, 0.9);
      // Keep normal conversion close to football's roughly ten-percent
      // range. The former 1.2 boost was compensating for an older, low-quality
      // shot model and now over-converted the better chances created by the
      // positional simulation.
      const goalChance = clamp(shotXg * finishingMultiplier * keeperMultiplier * 1.36, 0.01, 0.72);
      if (rng() < goalChance) {
        running[side].shotsOnTarget++;
        if (shooterStats) {
          shooterStats.shotsOnTarget++;
          shooterStats.goals++;
        }
        const assist = lastPasser?.name !== carrier.name ? lastPasser?.name : undefined;
        if (lastPasser && assist) {
          const assisterStats = playerStat(playerStats, side, lastPasser);
          if (assisterStats) assisterStats.assists++;
        }
        for (const defenderPlayer of activeSidePlayers(defendingSide)) {
          if (defenderPlayer.position !== "GK" && defenderPlayer.position !== "DEF") continue;
          const defenderStats = playerStat(playerStats, defendingSide, defenderPlayer);
          if (defenderStats) defenderStats.goalsConceded++;
        }
        goals.push({
          minute: currentMinute(),
          side,
          scorerId: carrier.playerId,
          scorer: carrier.name,
          assistId: assist ? lastPasser?.playerId : undefined,
          assist,
        });
        addEvent(side, "goal", carrier, assist ? lastPasser : undefined, true, shotXg);
        advanceClock(DEAD_BALL_SECONDS.goal);
        break;
      }

      const blockChance = clamp(
        0.12 +
          (blockQuality - shootingTechnique) / 260 +
          defendingTactics.tacklingBias * 0.025 -
          Math.max(0, defendingTactics.defensiveLineBias) * 0.01,
        0.04,
        0.36
      );
      if (rng() < blockChance) {
        running[defendingSide].tacklesWon++;
        const markerStats = playerStat(playerStats, defendingSide, marker);
        if (markerStats) markerStats.blocks++;
        recordBigChanceMiss();
        addEvent(defendingSide, "block", marker, carrier, true, shotXg);
        if (rng() < 0.55) {
          resolveSetPiece(side, "corner", lastPasser ?? carrier, keeperPlayer);
        } else {
          advanceClock(DEAD_BALL_SECONDS.turnover);
        }
        break;
      }
      const onTargetChance = clamp(
        0.27 + (shootingTechnique - 65) / 175 - sideTactics.shootingBias * 0.045,
        0.14,
        0.68
      );
      if (rng() >= onTargetChance) {
        recordBigChanceMiss();
        addEvent(side, "miss", carrier, undefined, false, shotXg);
        if (rng() < 0.18) {
          resolveSetPiece(side, "corner", lastPasser ?? carrier, keeperPlayer);
        } else {
          advanceClock(DEAD_BALL_SECONDS.goalKick);
        }
        break;
      }
      running[side].shotsOnTarget++;
      running[defendingSide].saves++;
      if (shooterStats) shooterStats.shotsOnTarget++;
      const keeperStats = playerStat(playerStats, defendingSide, keeperPlayer);
      if (keeperStats) keeperStats.saves++;
      recordBigChanceMiss();
      addEvent(defendingSide, "save", keeperPlayer, carrier, true, shotXg);
      if (rng() < 0.42) {
        resolveSetPiece(side, "corner", lastPasser ?? carrier, keeperPlayer);
      } else {
        advanceClock(DEAD_BALL_SECONDS.save);
      }
      break;
    }
    const snapshotMinute = currentMinute();
    snapshots.set(
      snapshotMinute,
      createLiveSnapshot(runtimeInput, snapshotMinute, running, playerStats, goals, periodStartMinute),
    );
  }

  samplesByMinute.set(world.minute, samplesFromWorld(world, world.minute));
  let lastSamples = samplesFromWorld(world, lo);
  for (let minute = lo; minute <= hi; minute++) {
    const samples = samplesByMinute.get(minute) ?? lastSamples.map((sample) => ({
      ...sample,
      minute,
    }));
    positionSamples.push(...samples);
    lastSamples = samples;
  }
  goals.sort((a, b) => a.minute - b.minute);
  events.sort(
    (a, b) => (a.timestamp ?? a.minute - 1) - (b.timestamp ?? b.minute - 1),
  );
  accrueActiveFatigue(world, runtimeInput, hi, tacticsBySide);
  snapshots.set(hi, createLiveSnapshot(runtimeInput, hi, running, playerStats, goals, periodStartMinute));
  return {
    result: {
      goals,
      events,
      positionSamples,
      userGoals: goals.filter((goal) => goal.side === "user").length,
      oppGoals: goals.filter((goal) => goal.side === "opp").length,
      userXg: running.user.xg,
      oppXg: running.opp.xg,
      teamStats: finalizeTeamStatsPair(running),
      playerStats: finalizePlayerStats(runtimeInput, playerStats, hi, periodStartMinute),
      liveSnapshots: [...snapshots.values()].sort((a, b) => a.minute - b.minute),
    },
    world,
  };
}

export function simulatePeriod(
  input: SimInput,
  lo: number,
  hi: number,
  seedOffset: number,
): HalfResult {
  return simulatePeriodWithWorld(input, lo, hi, seedOffset).result;
}

export function simulateHalf(input: SimInput, half: 1 | 2): HalfResult {
  return simulatePeriod(input, half === 1 ? 1 : 46, half === 1 ? 45 : 90, half * 999983);
}
