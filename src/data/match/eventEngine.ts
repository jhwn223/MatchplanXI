import { goalkeeper, otherSide, outfield, sidePlayers, skill } from "./playerRuntime";
import { createLiveSnapshot, createPlayerStats, finalizePlayerStats, playerStat } from "./liveStats";
import { clamp, mulberry32, weightedPick } from "./random";
import { emptyRunningStats, finalizeTeamStatsPair, type RunningStats } from "./stats";
import { tacticalWorkRate, tacticsForSide } from "./tactics";
import {
  tacticalHome,
} from "./spatial";
import { createMatchWorld } from "./world/createWorld";
import {
  coordinateFromWorld,
  samplesFromWorld,
} from "./world/eventBridge";
import {
  advanceWorld,
  beginPossession,
} from "./world/movementEngine";
import {
  isPlayerOffside,
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

function averagePace(players: PlacedPlayerLite[], position: PlacedPlayerLite["position"]) {
  const selected = players.filter((player) => player.position === position);
  const source = selected.length ? selected : players;
  return source.length
    ? source.reduce((sum, player) => sum + player.pace, 0) / source.length
    : 65;
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

export function simulatePeriod(input: SimInput, lo: number, hi: number, seedOffset: number): HalfResult {
  const rng = mulberry32((input.seed + seedOffset) >>> 0);
  const goals: GoalEvent[] = [];
  const events: MatchEvent[] = [];
  const eventOrderByMinute = new Map<number, number>();
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
  const duration = hi - lo + 1;
  // A period can be simulated one live minute at a time. Keeping a large
  // minimum here would multiply the number of possessions for short chunks.
  const possessionCount = Math.max(1, Math.round(duration * 1.12));
  const userTactics = tacticsForSide(input, "user");
  const oppTactics = tacticsForSide(input, "opp");
  const tacticsBySide = { user: userTactics, opp: oppTactics };
  let world = createMatchWorld(input, lo, tacticsBySide);
  const eloEdge = (input.userElo - input.oppElo) / 600;
  const creativityEdge = (input.userAbility.creativity - input.oppAbility.creativity) / 120;
  const tacticalPossessionEdge =
    (oppTactics.directnessBias - userTactics.directnessBias) * 0.018 +
    (userTactics.pressBias - oppTactics.pressBias) * 0.012;
  const userPossessionChance = clamp(
    0.5 +
      eloEdge * 0.06 +
      creativityEdge * 0.08 -
      input.attackBias * 0.025 +
      tacticalPossessionEdge +
      (input.isHome ? 0.018 : -0.018),
    0.36,
    0.64
  );
  snapshots.set(
    periodStartMinute,
    createLiveSnapshot(input, periodStartMinute, running, playerStats, goals, periodStartMinute)
  );

  const eventCoordinate = (
    side: MatchSide,
    type: MatchEventType,
    actor: PlacedPlayerLite,
    target: PlacedPlayerLite | undefined,
    success: boolean,
  ) => coordinateFromWorld(
    world,
    input,
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
    minute: number,
    side: MatchSide,
    type: MatchEventType,
    actor: PlacedPlayerLite,
    target: PlacedPlayerLite | undefined,
    success: boolean,
    xg?: number
  ) => {
    const coordinate = eventCoordinate(side, type, actor, target, success);
    const order = eventOrderByMinute.get(minute) ?? 0;
    eventOrderByMinute.set(minute, order + 1);
    events.push({
      minute,
      timestamp: minute - 1 + Math.min(0.94, 0.08 + order * 0.055),
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

  const recordOffside = (
    minute: number,
    side: MatchSide,
    receiver: PlacedPlayerLite,
    passer: PlacedPlayerLite,
  ) => {
    running[side].offsides++;
    const receiverStats = playerStat(playerStats, side, receiver);
    if (receiverStats) receiverStats.offsides++;
    addEvent(minute, side, "offside", receiver, passer, false);
  };

  const resolveSetPiece = (
    minute: number,
    side: MatchSide,
    kind: "corner" | "freeKick" | "penaltyKick",
    taker: PlacedPlayerLite,
    keeperPlayer: PlacedPlayerLite,
  ) => {
    activePossessionId = `${minute}:restart:${events.length}`;
    const sideTactics = side === "user" ? userTactics : oppTactics;
    const defendingSide = otherSide(side);
    const candidates = outfield(sidePlayers(input, side));
    if (kind === "corner") running[side].corners++;
    addEvent(minute, side, kind, taker, keeperPlayer, true);

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

    const shooter = kind === "penaltyKick"
      ? taker
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
    addEvent(minute, side, "shot", shooter, keeperPlayer, true, shotXg);

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
      for (const defender of sidePlayers(input, defendingSide)) {
        if (defender.position !== "GK" && defender.position !== "DEF") continue;
        const stat = playerStat(playerStats, defendingSide, defender);
        if (stat) stat.goalsConceded++;
      }
      goals.push({
        minute,
        side,
        scorerId: shooter.playerId,
        scorer: shooter.name,
        assistId: kind === "penaltyKick" ? undefined : taker.playerId,
        assist: kind === "penaltyKick" ? undefined : taker.name,
      });
      addEvent(
        minute,
        side,
        "goal",
        shooter,
        kind === "penaltyKick" ? undefined : taker,
        true,
        shotXg,
      );
      return;
    }
    if (rng() < 0.55) {
      running[side].shotsOnTarget++;
      running[defendingSide].saves++;
      if (shooterStats) shooterStats.shotsOnTarget++;
      const keeperStats = playerStat(playerStats, defendingSide, keeperPlayer);
      if (keeperStats) keeperStats.saves++;
      addEvent(minute, defendingSide, "save", keeperPlayer, shooter, true, shotXg);
    } else {
      addEvent(minute, side, "miss", shooter, undefined, false, shotXg);
    }
  };

  for (let possession = 0; possession < possessionCount; possession++) {
    const minute = Math.min(hi, lo + Math.floor(((possession + rng()) / possessionCount) * duration));
    if (world.minute !== minute) {
      samplesByMinute.set(world.minute, samplesFromWorld(world, world.minute));
      world = createMatchWorld(input, minute, tacticsBySide);
    }
    activePossessionId = `${minute}:${possession}`;
    possessionBallPoint = null;
    const side: MatchSide = rng() < userPossessionChance ? "user" : "opp";
    const defendingSide = otherSide(side);
    const attackers = outfield(sidePlayers(input, side));
    const possessionPlayers = sidePlayers(input, side);
    const defenders = outfield(sidePlayers(input, defendingSide));
    const keeperPlayer = goalkeeper(sidePlayers(input, defendingSide));
    if (!attackers.length || !defenders.length || !keeperPlayer) continue;

    const sideTactics = side === "user" ? userTactics : oppTactics;
    const defendingTactics = side === "user" ? oppTactics : userTactics;
    const formationAttackBias = side === "user" ? input.attackBias : 0;
    const sideAttackBias = clamp(formationAttackBias + sideTactics.attackBias, -1.5, 1.5);
    const directness = clamp(sideAttackBias * 0.45 + sideTactics.directnessBias, -1.4, 1.4);
    const counterEdge = clamp(sideTactics.counterBias - defendingTactics.counterBias, -1.5, 1.5);
    const sideWorkRate = tacticalWorkRate(sideTactics, minute);
    const defendingWorkRate = tacticalWorkRate(defendingTactics, minute);
    const matchupEdge = tacticalMatchupEdge(
      sideTactics,
      defendingTactics,
      possessionPlayers,
      sidePlayers(input, defendingSide),
    );
    const routinePassCount = possessionPlayers.length > 1
      ? Math.round(clamp(8 - directness * 1.6 - sideTactics.tempoBias * 1.1 + (rng() - 0.5) * 4, 3, 13))
      : 0;
    // A possession has one authoritative carrier. Previously every routine
    // pass picked a fresh random passer, so A→B could be followed by C→D
    // without B ever touching the ball. Keeping the receiver as the next
    // carrier makes the statistical event log a real, replayable sequence.
    let possessionCarrier = weightedPick(
      possessionPlayers,
      (player) =>
        (player.position === "GK" ? 0.8 : player.position === "DEF" ? 2.8 : player.position === "MID" ? 2.4 : 1.1) *
        (0.55 + player.ballControl / 110),
      rng,
    );
    beginPossession(world, side, possessionCarrier);
    // A newly sampled minute starts from the lineup coordinates. Give both
    // blocks enough simulated time to settle around the ball before the first
    // pass; otherwise forwards are repeatedly judged offside while still
    // travelling back from their static formation slot.
    advanceWorld(world, input, tacticsBySide, 5);
    addEvent(
      minute,
      side,
      "recovery",
      possessionCarrier,
      undefined,
      true,
    );
    let possessionLost = false;
    for (let pass = 0; pass < routinePassCount; pass++) {
      const passer = possessionCarrier;
      const receiver = weightedPick(
        possessionPlayers.filter((player) => player.playerId !== passer.playerId),
        (player) => {
          return passOptionScore(world, side, passer, player, directness);
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
      ], "technical", sideTactics) * sideWorkRate;
      const pressureQuality = skill(pressingDefender, minute, input.elevation, [
        [pressingDefender.interceptions, 0.38],
        [pressingDefender.defensiveAwareness, 0.28],
        [pressingDefender.reactions, 0.2],
        [pressingDefender.aggression, 0.14],
      ], "decision", defendingTactics) * defendingWorkRate * (
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
      const routinePassChance = clamp(
        0.92 +
          (passQuality - pressureQuality) / 500 -
          directness * 0.018 +
          matchupEdge * 0.35 -
          laneRisk * 0.045 -
          defendingTactics.pressBias * 0.04 -
          defendingTactics.defensiveLineBias * 0.015,
        0.88,
        0.98
      );
      const pressingFoulChance = clamp(
        0.003 +
          (defendingTactics.pressBias + 1) * 0.007 +
          (defendingTactics.tacklingBias + 1) * 0.002 +
          Math.max(0, pressingDefender.aggression - 72) / 4000,
        0.003,
        0.024,
      );
      if (rng() < pressingFoulChance) {
        running[defendingSide].fouls++;
        const defenderStats = playerStat(playerStats, defendingSide, pressingDefender);
        if (defenderStats) defenderStats.foulsCommitted++;
        addEvent(minute, defendingSide, "foul", pressingDefender, passer, false);
        const passerPoint = world.players[side].get(passer.playerId);
        const canonicalFoulX = side === "user"
          ? passerPoint?.x ?? 50
          : 100 - (passerPoint?.x ?? 50);
        resolveSetPiece(
          minute,
          side,
          canonicalFoulX >= 82 ? "penaltyKick" : "freeKick",
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
      if (isPlayerOffside(world, side, receiver)) {
        recordOffside(minute, side, receiver, passer);
        possessionLost = true;
        break;
      }
      if (rng() < routinePassChance) {
        running[side].passesCompleted++;
        if (passerStats) passerStats.passesCompleted++;
        const receiverStats = playerStat(playerStats, side, receiver);
        if (receiverStats) receiverStats.touches++;
        addEvent(minute, side, "pass", passer, receiver, true);
        possessionCarrier = receiver;
      } else if (
        rng() <
        clamp(
          0.35 +
            defendingTactics.pressBias * 0.11 +
            defendingTactics.defensiveLineBias * 0.045,
          0.18,
          0.58,
        )
      ) {
        running[defendingSide].interceptions++;
        const defenderStats = playerStat(playerStats, defendingSide, pressingDefender);
        if (defenderStats) defenderStats.interceptions++;
        addEvent(minute, side, "pass", passer, receiver, false);
        addEvent(minute, defendingSide, "interception", pressingDefender, passer, true);
        possessionLost = true;
        break;
      } else {
        addEvent(minute, side, "pass", passer, receiver, false);
        possessionLost = true;
        break;
      }
    }

    if (possessionLost) continue;
    let carrier = possessionCarrier;
    let lastPasser: PlacedPlayerLite | undefined;
    let progress = 0;
    const maxActions = Math.round(clamp(2 + Math.floor(rng() * 4) + sideTactics.tempoBias, 2, 6));

    for (let action = 0; action < maxActions; action++) {
      running[side].possessionTouches++;
      const carrierStats = playerStat(playerStats, side, carrier);
      if (carrierStats) carrierStats.touches++;
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
      ], "technical", sideTactics) * sideWorkRate;
      const defenderTackle = skill(defender, minute, input.elevation, [
        [defender.standingTackle, 0.3],
        [defender.defensiveAwareness, 0.24],
        [defender.strength, 0.17],
        [defender.interceptions, 0.17],
        [defender.reactions, 0.12],
      ], "duel", defendingTactics) * defendingWorkRate * (
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
        const dribbleChance = clamp(0.5 + (carrierDribble - defenderTackle) / 145, 0.25, 0.82);
        if (rng() < dribbleChance) {
          progress += 1.2;
          if (carrierStats) carrierStats.dribblesCompleted++;
          addEvent(minute, side, "dribble", carrier, defender, true);
        } else {
          const defenderStats = playerStat(playerStats, defendingSide, defender);
          const foulChance = clamp(
            0.045 +
              Math.max(0, defendingTactics.tacklingBias) * 0.055 +
              Math.max(0, defendingTactics.pressBias) * 0.035 +
              Math.max(0, defender.aggression - 65) / 900,
            0.025,
            0.16,
          );
          if (rng() < foulChance) {
            running[defendingSide].fouls++;
            if (defenderStats) defenderStats.foulsCommitted++;
            addEvent(minute, defendingSide, "foul", defender, carrier, false);

            const cardChance = clamp(
              0.12 +
                Math.max(0, defendingTactics.tacklingBias) * 0.11 +
                Math.max(0, defender.aggression - 72) / 280,
              0.08,
              0.38,
            );
            if (rng() < cardChance) {
              const red = rng() < 0.035 + Math.max(0, defendingTactics.tacklingBias) * 0.018;
              if (red) {
                running[defendingSide].redCards++;
                if (defenderStats) defenderStats.redCards++;
                addEvent(minute, defendingSide, "redCard", defender, carrier, false);
              } else {
                running[defendingSide].yellowCards++;
                if (defenderStats) defenderStats.yellowCards++;
                addEvent(minute, defendingSide, "yellowCard", defender, carrier, false);
              }
            }
            if (rng() < 0.018 + Math.max(0, defendingTactics.tacklingBias) * 0.01) {
              running[side].injuries++;
              if (carrierStats) carrierStats.injuries++;
              addEvent(minute, side, "injury", carrier, defender, false);
            }
            const foulPoint = possessionBallPoint as { x: number; y: number } | null;
            const foulX = side === "user"
              ? foulPoint?.x ?? tacticalHome(carrier, side, sideTactics).x
              : 100 - (foulPoint?.x ?? tacticalHome(carrier, side, sideTactics).x);
            resolveSetPiece(
              minute,
              side,
              foulX >= 82 ? "penaltyKick" : "freeKick",
              carrier,
              keeperPlayer,
            );
            break;
          }
          running[defendingSide].tacklesWon++;
          running[defendingSide].possessionTouches++;
          if (defenderStats) defenderStats.tacklesWon++;
          addEvent(minute, defendingSide, "tackle", defender, carrier, true);
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
            const forwardFit = clamp(1 + forwardDistance * directness / 55, 0.45, 1.8);
            const distanceFit = 1 / (1 + Math.max(0, distance - (22 + directness * 8)) / 22);
            return forwardWeight *
              (0.45 + (player.positioning + player.pace + player.reactions) / 300) *
              forwardFit *
              distanceFit;
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
        ], "technical", sideTactics) * sideWorkRate;
        const interceptionQuality = skill(defender, minute, input.elevation, [
          [defender.interceptions, 0.32],
          [defender.defensiveAwareness, 0.27],
          [defender.reactions, 0.17],
          [defender.aggression, 0.12],
          [defender.pace, 0.12],
        ], "decision", defendingTactics) * defendingWorkRate * (
          1 +
          defendingTactics.pressBias * 0.05 +
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
        const passChance = clamp(
          0.72 +
            (passQuality - interceptionQuality) / 220 -
            progress * 0.012 -
            directness * 0.025 -
            sideTactics.creativityBias * 0.018 +
            matchupEdge * 0.5 -
            laneRisk * 0.07,
          0.5,
          0.92
        );
        running[side].passesAttempted++;
        if (carrierStats) carrierStats.passesAttempted++;
        if (isPlayerOffside(world, side, receiver)) {
          recordOffside(minute, side, receiver, carrier);
          break;
        }
        if (rng() < passChance) {
          running[side].passesCompleted++;
          if (carrierStats) carrierStats.passesCompleted++;
          const baseProgress = receiver.position === "FWD" ? 1.05 : receiver.position === "MID" ? 0.72 : 0.38;
          progress += baseProgress * clamp(1 + directness * 0.2 + counterEdge * 0.08, 0.72, 1.35);
          addEvent(minute, side, "pass", carrier, receiver, true);
          lastPasser = carrier;
          carrier = receiver;
        } else {
          running[defendingSide].interceptions++;
          running[defendingSide].possessionTouches++;
          const defenderStats = playerStat(playerStats, defendingSide, defender);
          if (defenderStats) defenderStats.interceptions++;
          addEvent(minute, side, "pass", carrier, receiver, false);
          addEvent(minute, defendingSide, "interception", defender, carrier, true);
          break;
        }
      }

      const tacticShotBias =
        sideAttackBias * 0.06 +
        sideTactics.overlapBias * 0.012 +
        counterEdge * 0.022 +
        sideTactics.tempoBias * 0.016 +
        sideTactics.shootingBias * 0.055 +
        matchupEdge * 0.24;
      const roleShotChance = carrier.position === "FWD" ? 0.3 : carrier.position === "MID" ? 0.16 : 0.06;
      const carrierPoint = possessionBallPoint ?? tacticalHome(carrier, side, sideTactics);
      const canonicalShotX = side === "user" ? carrierPoint.x : 100 - carrierPoint.x;
      // The final touch has to reach the edge of the penalty area before a
      // shot can be recorded. 78 is also the lower bound used by the visual
      // replay, so a shot never appears to come from midfield.
      const targetShotX = 78;
      const shootNow =
        carrier.position !== "GK" &&
        canonicalShotX >= 56 &&
        (
          rng() < roleShotChance + progress * 0.045 + tacticShotBias ||
          (action === maxActions - 1 && rng() < 0.36)
        );
      if (!shootNow) continue;

      // A shot cannot be resolved from midfield. If a promising possession is
      // still short of the box, add visible ball-carrying actions first. The
      // 2D projector makes the carrier run these coordinates instead of
      // teleporting the player or the ball to the shooting point.
      let approachX = canonicalShotX;
      for (let carry = 0; carry < 7 && approachX < targetShotX; carry++) {
        if (carrierStats) {
          carrierStats.dribblesAttempted++;
          carrierStats.dribblesCompleted++;
        }
        addEvent(minute, side, "dribble", carrier, undefined, true);
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
      const chanceCreation =
        (carrier.positioning - marker.defensiveAwareness) / 900 +
        ((lastPasser?.vision ?? carrier.vision) - 65) / 1300 +
        progress * 0.007 +
        sideTactics.overlapBias * 0.004 +
        sideTactics.widthBias * 0.004 +
        sideTactics.creativityBias * 0.016 -
        sideTactics.shootingBias * 0.012 +
        sideTactics.setPieceBias * 0.003 +
        counterEdge * 0.009 +
        Math.max(0, defendingTactics.pressBias) * 0.004 +
        Math.max(0, defendingTactics.defensiveLineBias) * 0.007 +
        matchupEdge * 0.11;
      const baseXg = carrier.position === "FWD" ? 0.06 : carrier.position === "MID" ? 0.038 : 0.022;
      const shotXg = clamp(baseXg + chanceCreation + rng() * 0.045, 0.012, 0.48);
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
      addEvent(minute, side, "shot", carrier, keeperPlayer, true, shotXg);

      const shootingTechnique = skill(carrier, minute, input.elevation, [
        [carrier.shooting, 0.22],
        [carrier.finishing, 0.3],
        [carrier.shotPower, 0.13],
        [carrier.composure, 0.2],
        [carrier.positioning, 0.15],
      ], "technical", sideTactics) * sideWorkRate;
      const blockQuality = skill(marker, minute, input.elevation, [
        [marker.defending, 0.22],
        [marker.defensiveAwareness, 0.28],
        [marker.standingTackle, 0.2],
        [marker.reactions, 0.16],
        [marker.aggression, 0.14],
      ], "duel", defendingTactics) * defendingWorkRate;
      const keeperQuality = skill(keeperPlayer, minute, input.elevation, [
        [keeperPlayer.gkReflexes, 0.3],
        [keeperPlayer.gkDiving, 0.25],
        [keeperPlayer.gkPositioning, 0.22],
        [keeperPlayer.gkHandling, 0.13],
        [keeperPlayer.reactions, 0.1],
      ], "goalkeeping", defendingTactics) * defendingWorkRate;
      const finishingMultiplier = clamp(0.84 + (shootingTechnique - 60) / 160, 0.68, 1.28);
      const keeperMultiplier = clamp(1.04 - (keeperQuality - 65) / 260, 0.76, 1.16);
      const goalChance = clamp(shotXg * finishingMultiplier * keeperMultiplier, 0.01, 0.72);
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
        for (const defenderPlayer of sidePlayers(input, defendingSide)) {
          if (defenderPlayer.position !== "GK" && defenderPlayer.position !== "DEF") continue;
          const defenderStats = playerStat(playerStats, defendingSide, defenderPlayer);
          if (defenderStats) defenderStats.goalsConceded++;
        }
        goals.push({
          minute,
          side,
          scorerId: carrier.playerId,
          scorer: carrier.name,
          assistId: assist ? lastPasser?.playerId : undefined,
          assist,
        });
        addEvent(minute, side, "goal", carrier, assist ? lastPasser : undefined, true, shotXg);
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
        addEvent(minute, defendingSide, "block", marker, carrier, true, shotXg);
        if (rng() < 0.34) {
          resolveSetPiece(minute, side, "corner", lastPasser ?? carrier, keeperPlayer);
        }
        break;
      }
      const onTargetChance = clamp(
        0.4 + (shootingTechnique - 65) / 150 - sideTactics.shootingBias * 0.055,
        0.2,
        0.86
      );
      if (rng() >= onTargetChance) {
        recordBigChanceMiss();
        addEvent(minute, side, "miss", carrier, undefined, false, shotXg);
        if (rng() < 0.05) {
          resolveSetPiece(minute, side, "corner", lastPasser ?? carrier, keeperPlayer);
        }
        break;
      }
      running[side].shotsOnTarget++;
      running[defendingSide].saves++;
      if (shooterStats) shooterStats.shotsOnTarget++;
      const keeperStats = playerStat(playerStats, defendingSide, keeperPlayer);
      if (keeperStats) keeperStats.saves++;
      recordBigChanceMiss();
      addEvent(minute, defendingSide, "save", keeperPlayer, carrier, true, shotXg);
      if (rng() < 0.2) {
        resolveSetPiece(minute, side, "corner", lastPasser ?? carrier, keeperPlayer);
      }
      break;
    }
    snapshots.set(minute, createLiveSnapshot(input, minute, running, playerStats, goals, periodStartMinute));
  }

  samplesByMinute.set(world.minute, samplesFromWorld(world, world.minute));
  for (let minute = lo; minute <= hi; minute++) {
    const samples = samplesByMinute.get(minute) ??
      samplesFromWorld(createMatchWorld(input, minute, tacticsBySide), minute);
    positionSamples.push(...samples);
  }
  goals.sort((a, b) => a.minute - b.minute);
  events.sort((a, b) => a.minute - b.minute);
  snapshots.set(hi, createLiveSnapshot(input, hi, running, playerStats, goals, periodStartMinute));
  return {
    goals,
    events,
    positionSamples,
    userGoals: goals.filter((goal) => goal.side === "user").length,
    oppGoals: goals.filter((goal) => goal.side === "opp").length,
    userXg: running.user.xg,
    oppXg: running.opp.xg,
    teamStats: finalizeTeamStatsPair(running),
    playerStats: finalizePlayerStats(input, playerStats, hi, periodStartMinute),
    liveSnapshots: [...snapshots.values()].sort((a, b) => a.minute - b.minute),
  };
}

export function simulateHalf(input: SimInput, half: 1 | 2): HalfResult {
  return simulatePeriod(input, half === 1 ? 1 : 46, half === 1 ? 45 : 90, half * 999983);
}
