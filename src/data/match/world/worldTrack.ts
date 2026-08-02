import type { MatchSide } from "../types";
import type { MatchWorld, WorldPlayerState } from "./types";

/** Ball ownership stored per frame. */
export const BALL_DEAD = -2;
export const BALL_LOOSE = -1;
export const BALL_USER = 0;
export const BALL_OPP = 1;

/**
 * Where the ball and the players actually were, sampled on the clock rather
 * than at events.
 *
 * The analysis maps were built from event coordinates, so the "ball heat map"
 * was really a map of where passes started and ended. Time the ball spent
 * circulating in one area, the route it travelled, a spell of sideways
 * possession — none of it registered, because nothing was recorded between one
 * event and the next. Player maps had the opposite problem: one sample a
 * minute, which loses any run that starts and finishes inside it.
 *
 * Stored as flat typed arrays. Ball frames are cheap so they are taken at the
 * simulation's own tick rate; player frames cost twenty-two times as much, and
 * a second is fine for a heat map.
 *
 * Nothing in the simulation ever reads this back. It is a recording.
 */
export interface WorldTrack {
  /** Match second of frame zero for both series. */
  startSecond: number;
  ballInterval: number;
  ballFrames: number;
  /** Frame-major x/y pairs. */
  ball: Float32Array;
  /** Which side held the ball on each frame; see the BALL_* codes. */
  ballOwner: Int8Array;
  /** Which player held it, or -1 when nobody did. */
  ballOwnerId: Int32Array;
  playerInterval: number;
  playerFrames: number;
  /** Stable player order every player frame follows. */
  players: { side: MatchSide; playerId: number }[];
  /** Frame-major x/y pairs: frame f, player p at 2 * (f * players + p). */
  positions: Float32Array;
}

interface BallFlight {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startSecond: number;
  seconds: number;
}

export interface WorldTrackRecorder extends WorldTrack {
  ballCapacity: number;
  playerCapacity: number;
  nextBallSecond: number;
  nextPlayerSecond: number;
  flight?: BallFlight;
  states: (WorldPlayerState | undefined)[];
  statesFor: number;
}

export function createTrackRecorder(
  world: MatchWorld,
  startSecond: number,
  seconds: number,
  ballInterval = 0.5,
  playerInterval = 1,
): WorldTrackRecorder {
  const players: { side: MatchSide; playerId: number }[] = [];
  for (const side of ["user", "opp"] as MatchSide[]) {
    for (const state of world.players[side].values()) {
      players.push({ side, playerId: state.player.playerId });
    }
  }
  const ballCapacity = Math.max(1, Math.ceil(seconds / ballInterval) + 8);
  const playerCapacity = Math.max(1, Math.ceil(seconds / playerInterval) + 8);
  return {
    startSecond,
    ballInterval,
    ballFrames: 0,
    ball: new Float32Array(ballCapacity * 2),
    ballOwner: new Int8Array(ballCapacity),
    ballOwnerId: new Int32Array(ballCapacity),
    playerInterval,
    playerFrames: 0,
    players,
    positions: new Float32Array(playerCapacity * players.length * 2),
    ballCapacity,
    playerCapacity,
    nextBallSecond: startSecond,
    nextPlayerSecond: startSecond,
    states: players.map(() => undefined),
    statesFor: -1,
  };
}

/**
 * A pass that is in the air.
 *
 * The engine settles a pass in one step: the moment it is played the ball
 * belongs to the receiver, so sampling `world.ball` alone would record it at
 * the passer's feet and then at the receiver's, and the route between them —
 * the thing that shows how a side actually moves the ball — would never
 * appear. The frames covered by the flight are written along the line instead,
 * which spends the same match time rather than inventing any.
 */
export function noteBallFlight(
  world: MatchWorld,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
) {
  const recorder = world.track;
  if (!recorder) return;
  const dx = toX - fromX;
  const dy = toY - fromY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance < 2) return;
  recorder.flight = {
    fromX,
    fromY,
    toX,
    toY,
    startSecond: world.elapsedSeconds,
    seconds: Math.min(2, distance / 24),
  };
}

function ownerCode(world: MatchWorld) {
  if (!world.ballInPlay) return BALL_DEAD;
  if (world.ball.ownerSide === "user") return BALL_USER;
  if (world.ball.ownerSide === "opp") return BALL_OPP;
  return BALL_LOOSE;
}

/**
 * Captures whatever frames the clock has passed. A single step can cover
 * several seconds — a goal costs most of a minute — so the gap is filled by
 * repeating the current state rather than leaving a hole in the record.
 */
export function recordTrackFrames(recorder: WorldTrackRecorder, world: MatchWorld) {
  const owner = ownerCode(world);
  const ownerId = owner === BALL_USER || owner === BALL_OPP
    ? world.ball.ownerId ?? -1
    : -1;
  let guard = 0;
  while (world.elapsedSeconds + 1e-6 >= recorder.nextBallSecond && guard++ < 20_000) {
    const at = recorder.nextBallSecond;
    if (recorder.flight && at >= recorder.flight.startSecond + recorder.flight.seconds) {
      recorder.flight = undefined;
    }
    if (recorder.ballFrames < recorder.ballCapacity) {
      const active = recorder.flight;
      const progress = active ? (at - active.startSecond) / active.seconds : 1;
      recorder.ball[recorder.ballFrames * 2] = active
        ? active.fromX + (active.toX - active.fromX) * progress
        : world.ball.x;
      recorder.ball[recorder.ballFrames * 2 + 1] = active
        ? active.fromY + (active.toY - active.fromY) * progress
        : world.ball.y;
      recorder.ballOwner[recorder.ballFrames] = owner;
      recorder.ballOwnerId[recorder.ballFrames] = ownerId;
      recorder.ballFrames++;
    }
    recorder.nextBallSecond += recorder.ballInterval;
  }

  if (world.elapsedSeconds + 1e-6 < recorder.nextPlayerSecond) return;
  const count = recorder.players.length;
  // Substitutions and dismissals replace the state objects, so the cached
  // references are re-resolved whenever the squad size moves.
  const squadSize = world.players.user.size + world.players.opp.size;
  if (recorder.statesFor !== squadSize) {
    for (let index = 0; index < count; index++) {
      const entry = recorder.players[index];
      recorder.states[index] = world.players[entry.side].get(entry.playerId);
    }
    recorder.statesFor = squadSize;
  }
  guard = 0;
  while (world.elapsedSeconds + 1e-6 >= recorder.nextPlayerSecond && guard++ < 20_000) {
    if (recorder.playerFrames < recorder.playerCapacity) {
      let offset = recorder.playerFrames * count * 2;
      for (let index = 0; index < count; index++) {
        const state = recorder.states[index];
        recorder.positions[offset++] = state ? state.x : 50;
        recorder.positions[offset++] = state ? state.y : 50;
      }
      recorder.playerFrames++;
    }
    recorder.nextPlayerSecond += recorder.playerInterval;
  }
}

export function finishTrack(recorder: WorldTrackRecorder): WorldTrack {
  return {
    startSecond: recorder.startSecond,
    ballInterval: recorder.ballInterval,
    ballFrames: recorder.ballFrames,
    ball: recorder.ball.slice(0, recorder.ballFrames * 2),
    ballOwner: recorder.ballOwner.slice(0, recorder.ballFrames),
    ballOwnerId: recorder.ballOwnerId.slice(0, recorder.ballFrames),
    playerInterval: recorder.playerInterval,
    playerFrames: recorder.playerFrames,
    players: recorder.players,
    positions: recorder.positions.slice(
      0,
      recorder.playerFrames * recorder.players.length * 2,
    ),
  };
}

function joinFloat(a: Float32Array, b: Float32Array) {
  const out = new Float32Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

/** Joins the records of consecutive periods into one continuous track. */
export function combineTracks(
  previous: WorldTrack | undefined,
  next: WorldTrack | undefined,
): WorldTrack | undefined {
  if (!previous || previous.ballFrames === 0) return next;
  if (!next || next.ballFrames === 0) return previous;
  const ballOwner = new Int8Array(previous.ballFrames + next.ballFrames);
  ballOwner.set(previous.ballOwner);
  ballOwner.set(next.ballOwner, previous.ballFrames);
  const ballOwnerId = new Int32Array(previous.ballFrames + next.ballFrames);
  ballOwnerId.set(previous.ballOwnerId);
  ballOwnerId.set(next.ballOwnerId, previous.ballFrames);
  return {
    startSecond: previous.startSecond,
    ballInterval: previous.ballInterval,
    ballFrames: previous.ballFrames + next.ballFrames,
    ball: joinFloat(previous.ball, next.ball),
    ballOwner,
    ballOwnerId,
    playerInterval: previous.playerInterval,
    playerFrames: previous.playerFrames + next.playerFrames,
    players: previous.players,
    positions: joinFloat(previous.positions, next.positions),
  };
}

/** Match minute (1-based, as events are numbered) a frame belongs to. */
function minuteOf(second: number) {
  return Math.floor(second / 60) + 1;
}

/** Drops everything before `fromMinute`, for screens that show one period. */
export function sliceTrack(
  track: WorldTrack | undefined,
  fromMinute: number,
): WorldTrack | undefined {
  if (!track) return undefined;
  const from = (fromMinute - 1) * 60;
  if (track.startSecond >= from) return track;
  const ballOffset = Math.min(
    track.ballFrames,
    Math.ceil((from - track.startSecond) / track.ballInterval),
  );
  const playerOffset = Math.min(
    track.playerFrames,
    Math.ceil((from - track.startSecond) / track.playerInterval),
  );
  const count = track.players.length;
  return {
    startSecond: track.startSecond + ballOffset * track.ballInterval,
    ballInterval: track.ballInterval,
    ballFrames: track.ballFrames - ballOffset,
    ball: track.ball.subarray(ballOffset * 2),
    ballOwner: track.ballOwner.subarray(ballOffset),
    ballOwnerId: track.ballOwnerId.subarray(ballOffset),
    playerInterval: track.playerInterval,
    playerFrames: track.playerFrames - playerOffset,
    players: track.players,
    positions: track.positions.subarray(playerOffset * count * 2),
  };
}

export interface TrackPoint {
  x: number;
  y: number;
  /** Match seconds this point stands for, so a map can weigh dwell time. */
  seconds: number;
}

interface TrackWindow {
  fromMinute?: number;
  toMinute?: number;
}

/**
 * Ball positions weighted by how long the ball stayed there. Dead-ball time is
 * left out: the minute lost to a goal celebration would otherwise outweigh any
 * amount of actual play in the same spot.
 */
export function ballDwell(
  track: WorldTrack,
  options: TrackWindow & { side?: MatchSide; playerId?: number } = {},
): TrackPoint[] {
  const { side, playerId, fromMinute = 0, toMinute = Infinity } = options;
  const wanted = side === "user" ? BALL_USER : side === "opp" ? BALL_OPP : null;
  const points: TrackPoint[] = [];
  for (let frame = 0; frame < track.ballFrames; frame++) {
    const owner = track.ballOwner[frame];
    if (owner === BALL_DEAD) continue;
    if (wanted != null && owner !== wanted) continue;
    if (playerId != null && track.ballOwnerId[frame] !== playerId) continue;
    const minute = minuteOf(track.startSecond + frame * track.ballInterval);
    if (minute < fromMinute || minute > toMinute) continue;
    points.push({
      x: track.ball[frame * 2],
      y: track.ball[frame * 2 + 1],
      seconds: track.ballInterval,
    });
  }
  return points;
}

/** Player positions, one point per player per recorded frame. */
export function playerDwell(
  track: WorldTrack,
  options: TrackWindow & { side?: MatchSide; playerId?: number } = {},
): TrackPoint[] {
  const { side, playerId, fromMinute = 0, toMinute = Infinity } = options;
  const count = track.players.length;
  const wanted: number[] = [];
  for (let index = 0; index < count; index++) {
    const entry = track.players[index];
    if (side && entry.side !== side) continue;
    if (playerId != null && entry.playerId !== playerId) continue;
    wanted.push(index);
  }
  const points: TrackPoint[] = [];
  for (let frame = 0; frame < track.playerFrames; frame++) {
    const minute = minuteOf(track.startSecond + frame * track.playerInterval);
    if (minute < fromMinute || minute > toMinute) continue;
    for (const index of wanted) {
      const offset = (frame * count + index) * 2;
      points.push({
        x: track.positions[offset],
        y: track.positions[offset + 1],
        seconds: track.playerInterval,
      });
    }
  }
  return points;
}

/** Share of in-play recorded time each side held the ball. */
export function trackPossession(track: WorldTrack, options: TrackWindow = {}) {
  const { fromMinute = 0, toMinute = Infinity } = options;
  let user = 0;
  let opp = 0;
  for (let frame = 0; frame < track.ballFrames; frame++) {
    const owner = track.ballOwner[frame];
    if (owner !== BALL_USER && owner !== BALL_OPP) continue;
    const minute = minuteOf(track.startSecond + frame * track.ballInterval);
    if (minute < fromMinute || minute > toMinute) continue;
    if (owner === BALL_USER) user++;
    else opp++;
  }
  const total = user + opp;
  return total ? { user: user / total, opp: opp / total } : { user: 0.5, opp: 0.5 };
}
