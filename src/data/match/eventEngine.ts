import { goalkeeper, otherSide, outfield, sidePlayers, skill } from "./playerRuntime";
import { createLiveSnapshot, createPlayerStats, finalizePlayerStats, playerStat } from "./liveStats";
import { clamp, mulberry32, weightedPick } from "./random";
import { emptyRunningStats, finalizeTeamStatsPair, type RunningStats } from "./stats";
import { tacticalWorkRate, tacticsForSide } from "./tactics";
import type {
  GoalEvent,
  HalfResult,
  MatchEvent,
  MatchEventType,
  MatchSide,
  PassType,
  PlacedPlayerLite,
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
  if (type === "dribble") return `${actor} 드리블 돌파`;
  if (type === "interception") return `${actor} 패스 차단`;
  if (type === "tackle") return `${actor} 태클 성공`;
  if (type === "shot") return `${actor} 슈팅`;
  if (type === "save") return `${actor} 선방`;
  if (type === "block") return `${actor} 슈팅 블록`;
  if (type === "miss") return `${actor} 슈팅 빗나감`;
  return `${actor} 득점`;
}

export function simulatePeriod(input: SimInput, lo: number, hi: number, seedOffset: number): HalfResult {
  const rng = mulberry32((input.seed + seedOffset) >>> 0);
  const goals: GoalEvent[] = [];
  const events: MatchEvent[] = [];
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
    minute: number,
    side: MatchSide,
    type: MatchEventType,
    actor: string,
    target?: string
  ) => {
    const source = `${minute}:${type}:${actor}:${target ?? ""}:${events.length}`;
    let hash = 2166136261;
    for (let index = 0; index < source.length; index++) {
      hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
    }
    const unit = (shift: number) => ((hash >>> shift) & 255) / 255;
    const sideTactics = side === "user" ? userTactics : oppTactics;
    const direction = side === "user" ? 1 : -1;
    const roster = sidePlayers(input, side);
    const actorPlayer = roster.find((player) => player.name === actor);
    const role = actorPlayer?.position ?? "MID";
    const rolePlayers = roster.filter((player) => player.position === role);
    const roleIndex = Math.max(0, rolePlayers.findIndex((player) => player.name === actor));
    const lanes: Record<typeof role, number[]> = {
      GK: [50],
      DEF: [15, 38, 62, 85],
      MID: [22, 50, 78],
      FWD: [20, 50, 80],
    };
    const lane = lanes[role][roleIndex % lanes[role].length] ?? 50;
    const widthScale = 1 + sideTactics.widthBias * 0.28;
    const focusShift = sideTactics.focusBias * 9;
    const y = clamp(50 + (lane - 50) * widthScale + focusShift + (unit(8) - 0.5) * 9, 5, 95);
    const targetPlayer = roster.find((player) => player.name === target);
    const targetRole = targetPlayer?.position ?? role;
    const targetRolePlayers = roster.filter((player) => player.position === targetRole);
    const targetRoleIndex = Math.max(0, targetRolePlayers.findIndex((player) => player.name === target));
    const targetLane = lanes[targetRole][targetRoleIndex % lanes[targetRole].length] ?? lane;
    const targetY = clamp(50 + (targetLane - 50) * widthScale + focusShift + (unit(16) - 0.5) * 8, 4, 96);
    const isShot = type === "shot" || type === "goal" || type === "miss";
    const canonicalX =
      type === "save"
        ? 5 + unit(0) * 6
        : type === "block"
          ? 10 + unit(0) * 17
          : isShot
            ? role === "DEF" ? 62 + unit(0) * 18 : role === "MID" ? 68 + unit(0) * 20 : 76 + unit(0) * 18
            : role === "GK"
              ? 5 + unit(0) * 10
              : role === "DEF"
                ? 17 + unit(0) * 30
                : role === "MID"
                  ? 34 + unit(0) * 38
                  : 54 + unit(0) * 34;
    const x = side === "user" ? canonicalX : 100 - canonicalX;
    const targetCanonicalX =
      targetRole === "GK"
        ? 6 + unit(16) * 8
        : targetRole === "DEF"
          ? 20 + unit(16) * 25
          : targetRole === "MID"
            ? 40 + unit(16) * 30
            : 66 + unit(16) * 25;
    const targetX = side === "user" ? targetCanonicalX : 100 - targetCanonicalX;
    const rawPassDistance = Math.hypot(targetX - x, targetY - y);
    const passReach = clamp(
      18 + unit(24) * 30 + sideTactics.directnessBias * 10,
      10,
      58
    );
    const passScale = rawPassDistance > 0 ? Math.min(1, passReach / rawPassDistance) : 1;
    const passEndX = clamp(x + (targetX - x) * passScale, 1, 99);
    const passEndY = clamp(y + (targetY - y) * passScale, 3, 97);
    const travel = type === "dribble" ? 7 : isShot ? 100 : 3;
    return {
      x,
      y,
      endX: type === "pass" ? passEndX : clamp(x + direction * travel, 1, 99),
      endY: type === "pass" ? passEndY : isShot ? 50 + (unit(16) - 0.5) * 18 : clamp(y + (unit(16) - 0.5) * 24, 3, 97),
    };
  };

  const classifyPass = (
    side: MatchSide,
    actor: string,
    target: string | undefined,
    coordinate: ReturnType<typeof eventCoordinate>
  ): PassType => {
    const sideTactics = side === "user" ? userTactics : oppTactics;
    const roster = sidePlayers(input, side);
    const actorPlayer = roster.find((player) => player.name === actor);
    const targetPlayer = roster.find((player) => player.name === target);
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
      targetPlayer?.position === "FWD" &&
      rollSeed < crossChance
    ) return "cross";

    const throughChance =
      0.2 +
      Math.max(0, sideTactics.creativityBias) * 0.2 +
      Math.max(0, sideTactics.directnessBias) * 0.12;
    if (
      targetPlayer?.position === "FWD" &&
      actorPlayer?.position !== "FWD" &&
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
    actor: string,
    target: string | undefined,
    success: boolean,
    xg?: number
  ) => {
    const coordinate = eventCoordinate(minute, side, type, actor, target);
    events.push({
      minute,
      side,
      type,
      actor,
      target,
      success,
      xg,
      passType: type === "pass" ? classifyPass(side, actor, target, coordinate) : undefined,
      detail: actionDetail(type, actor, target),
      ...coordinate,
    });
  };

  for (let possession = 0; possession < possessionCount; possession++) {
    const minute = Math.min(hi, lo + Math.floor(((possession + rng()) / possessionCount) * duration));
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
      ? Math.round(clamp(6 - directness * 1.6 - sideTactics.tempoBias * 1.1 + (rng() - 0.5) * 4, 2, 11))
      : 0;
    for (let pass = 0; pass < routinePassCount; pass++) {
      const passer = weightedPick(
        possessionPlayers,
        (player) =>
          (player.position === "GK" ? 1.15 : player.position === "DEF" ? 2.5 : player.position === "MID" ? 2.2 : 1.2) *
          (0.6 + player.shortPassing / 100),
        rng
      );
      const receiver = weightedPick(
        possessionPlayers.filter((player) => player.name !== passer.name),
        (player) => (player.position === "GK" ? 0.35 : player.position === "MID" ? 2.4 : player.position === "DEF" ? 1.8 : 1.25),
        rng
      );
      const pressingDefender = weightedPick(
        defenders,
        (player) => 0.5 + (player.interceptions + player.aggression + player.reactions) / 240,
        rng
      );
      const passQuality = skill(passer, minute, input.elevation, [
        [passer.shortPassing, 0.42],
        [passer.passing, 0.24],
        [passer.vision, 0.14],
        [passer.ballControl, 0.12],
        [passer.composure, 0.08],
      ]) * sideWorkRate;
      const pressureQuality = skill(pressingDefender, minute, input.elevation, [
        [pressingDefender.interceptions, 0.38],
        [pressingDefender.defensiveAwareness, 0.28],
        [pressingDefender.reactions, 0.2],
        [pressingDefender.aggression, 0.14],
      ]) * defendingWorkRate * (
        1 +
        defendingTactics.pressBias * 0.055 +
        defendingTactics.defensiveLineBias * 0.025 +
        defendingTactics.tacklingBias * 0.02
      );
      const routinePassChance = clamp(
        0.9 +
          (passQuality - pressureQuality) / 500 -
          directness * 0.018 +
          matchupEdge * 0.35,
        0.82,
        0.97
      );
      const passerStats = playerStat(playerStats, side, passer);
      running[side].possessionTouches++;
      running[side].passesAttempted++;
      if (passerStats) {
        passerStats.touches++;
        passerStats.passesAttempted++;
      }
      if (rng() < routinePassChance) {
        running[side].passesCompleted++;
        if (passerStats) passerStats.passesCompleted++;
        const receiverStats = playerStat(playerStats, side, receiver);
        if (receiverStats) receiverStats.touches++;
        addEvent(minute, side, "pass", passer.name, receiver.name, true);
      } else if (rng() < 0.35) {
        running[defendingSide].interceptions++;
        const defenderStats = playerStat(playerStats, defendingSide, pressingDefender);
        if (defenderStats) defenderStats.interceptions++;
        addEvent(minute, side, "pass", passer.name, receiver.name, false);
        addEvent(minute, defendingSide, "interception", pressingDefender.name, passer.name, true);
      } else {
        addEvent(minute, side, "pass", passer.name, receiver.name, false);
      }
    }

    let carrier = weightedPick(
      attackers,
      (player) =>
        (player.position === "MID" ? 2.8 : player.position === "DEF" ? 2.1 : 1.1) *
        (0.6 + player.ballControl / 100),
      rng
    );
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
      ]) * sideWorkRate;
      const defenderTackle = skill(defender, minute, input.elevation, [
        [defender.standingTackle, 0.3],
        [defender.defensiveAwareness, 0.24],
        [defender.strength, 0.17],
        [defender.interceptions, 0.17],
        [defender.reactions, 0.12],
      ]) * defendingWorkRate * (
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
          addEvent(minute, side, "dribble", carrier.name, defender.name, true);
        } else {
          running[defendingSide].tacklesWon++;
          running[defendingSide].possessionTouches++;
          const defenderStats = playerStat(playerStats, defendingSide, defender);
          if (defenderStats) defenderStats.tacklesWon++;
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
        ]) * sideWorkRate;
        const interceptionQuality = skill(defender, minute, input.elevation, [
          [defender.interceptions, 0.32],
          [defender.defensiveAwareness, 0.27],
          [defender.reactions, 0.17],
          [defender.aggression, 0.12],
          [defender.pace, 0.12],
        ]) * defendingWorkRate * (
          1 +
          defendingTactics.pressBias * 0.05 +
          defendingTactics.defensiveLineBias * 0.03 +
          defendingTactics.tacklingBias * 0.018
        );
        const passChance = clamp(
          0.72 +
            (passQuality - interceptionQuality) / 220 -
            progress * 0.012 -
            directness * 0.025 -
            sideTactics.creativityBias * 0.018 +
            matchupEdge * 0.5,
          0.5,
          0.92
        );
        running[side].passesAttempted++;
        if (carrierStats) carrierStats.passesAttempted++;
        if (rng() < passChance) {
          running[side].passesCompleted++;
          if (carrierStats) carrierStats.passesCompleted++;
          const baseProgress = receiver.position === "FWD" ? 1.05 : receiver.position === "MID" ? 0.72 : 0.38;
          progress += baseProgress * clamp(1 + directness * 0.2 + counterEdge * 0.08, 0.72, 1.35);
          addEvent(minute, side, "pass", carrier.name, receiver.name, true);
          lastPasser = carrier;
          carrier = receiver;
        } else {
          running[defendingSide].interceptions++;
          running[defendingSide].possessionTouches++;
          const defenderStats = playerStat(playerStats, defendingSide, defender);
          if (defenderStats) defenderStats.interceptions++;
          addEvent(minute, side, "pass", carrier.name, receiver.name, false);
          addEvent(minute, defendingSide, "interception", defender.name, carrier.name, true);
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
      const shootNow =
        rng() < roleShotChance + progress * 0.045 + tacticShotBias ||
        (action === maxActions - 1 && rng() < 0.36);
      if (!shootNow) continue;

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
      addEvent(minute, side, "shot", carrier.name, keeperPlayer.name, true, shotXg);

      const shootingTechnique = skill(carrier, minute, input.elevation, [
        [carrier.shooting, 0.22],
        [carrier.finishing, 0.3],
        [carrier.shotPower, 0.13],
        [carrier.composure, 0.2],
        [carrier.positioning, 0.15],
      ]) * sideWorkRate;
      const blockQuality = skill(marker, minute, input.elevation, [
        [marker.defending, 0.22],
        [marker.defensiveAwareness, 0.28],
        [marker.standingTackle, 0.2],
        [marker.reactions, 0.16],
        [marker.aggression, 0.14],
      ]) * defendingWorkRate;
      const keeperQuality = skill(keeperPlayer, minute, input.elevation, [
        [keeperPlayer.gkReflexes, 0.3],
        [keeperPlayer.gkDiving, 0.25],
        [keeperPlayer.gkPositioning, 0.22],
        [keeperPlayer.gkHandling, 0.13],
        [keeperPlayer.reactions, 0.1],
      ]) * defendingWorkRate;
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
        goals.push({ minute, side, scorer: carrier.name, assist });
        addEvent(minute, side, "goal", carrier.name, assist, true, shotXg);
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
        addEvent(minute, defendingSide, "block", marker.name, carrier.name, true, shotXg);
        break;
      }
      const onTargetChance = clamp(
        0.4 + (shootingTechnique - 65) / 150 - sideTactics.shootingBias * 0.055,
        0.2,
        0.86
      );
      if (rng() >= onTargetChance) {
        recordBigChanceMiss();
        addEvent(minute, side, "miss", carrier.name, undefined, false, shotXg);
        break;
      }
      running[side].shotsOnTarget++;
      running[defendingSide].saves++;
      if (shooterStats) shooterStats.shotsOnTarget++;
      const keeperStats = playerStat(playerStats, defendingSide, keeperPlayer);
      if (keeperStats) keeperStats.saves++;
      recordBigChanceMiss();
      addEvent(minute, defendingSide, "save", keeperPlayer.name, carrier.name, true, shotXg);
      break;
    }
    snapshots.set(minute, createLiveSnapshot(input, minute, running, playerStats, goals, periodStartMinute));
  }

  goals.sort((a, b) => a.minute - b.minute);
  events.sort((a, b) => a.minute - b.minute);
  snapshots.set(hi, createLiveSnapshot(input, hi, running, playerStats, goals, periodStartMinute));
  return {
    goals,
    events,
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
