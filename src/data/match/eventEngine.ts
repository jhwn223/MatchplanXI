import { goalkeeper, otherSide, outfield, sidePlayers, skill } from "./playerRuntime";
import { clamp, mulberry32, weightedPick } from "./random";
import { emptyRunningStats, finalizeStats, type RunningStats } from "./stats";
import type {
  GoalEvent,
  HalfResult,
  MatchEvent,
  MatchEventType,
  MatchSide,
  PlacedPlayerLite,
  SimInput,
} from "./types";

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
    side: MatchSide,
    type: MatchEventType,
    actor: string,
    target: string | undefined,
    success: boolean,
    xg?: number
  ) => {
    events.push({ minute, side, type, actor, target, success, xg, detail: actionDetail(type, actor, target) });
  };

  for (let possession = 0; possession < possessionCount; possession++) {
    const minute = Math.min(hi, lo + Math.floor(((possession + rng()) / possessionCount) * duration));
    const side: MatchSide = rng() < userPossessionChance ? "user" : "opp";
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
  return {
    goals,
    events,
    userGoals: goals.filter((goal) => goal.side === "user").length,
    oppGoals: goals.filter((goal) => goal.side === "opp").length,
    userXg: running.user.xg,
    oppXg: running.opp.xg,
    teamStats: {
      user: finalizeStats(running.user, running.opp),
      opp: finalizeStats(running.opp, running.user),
    },
  };
}

export function simulateHalf(input: SimInput, half: 1 | 2): HalfResult {
  return simulatePeriod(input, half === 1 ? 1 : 46, half === 1 ? 45 : 90, half * 999983);
}
