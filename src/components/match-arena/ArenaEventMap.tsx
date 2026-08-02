import { useMemo } from "react";
import type { MatchEvent, MatchSide, PassType, WorldTrack } from "../../data/matchSim";
import { ballDwell, playerDwell } from "../../data/matchSim";
import { buildHeatCells, heatColor } from "./heatMap";
import { ALL_PASS_TYPES, PASS_TYPE_META } from "./passMap";

export type EventMapMode = "positions" | "ball" | "shots" | "passes" | "turnovers" | "recoveries";

interface Props {
  events: MatchEvent[];
  minute: number;
  mode: EventMapMode;
  /** Earliest minute to include; lets a tactical change be seen on its own. */
  since?: number;
  player?: string;
  /** The same player as `player`, for the position track, which stores ids. */
  playerId?: number;
  passTypes?: PassType[];
  /** Clock-sampled positions; both heat maps are drawn from it. */
  track?: WorldTrack;
  side?: MatchSide;
}

export function ArenaEventMap({
  events,
  minute,
  mode,
  since = 0,
  player,
  playerId,
  passTypes = ALL_PASS_TYPES,
  track,
  side = "user",
}: Props) {
  const eventSide = mode === "turnovers" ? (side === "user" ? "opp" : "user") : side;
  const elapsed = events
    .filter((event) => event.minute <= minute && event.minute >= since)
    .filter((event) => event.side === eventSide)
    // A turnover is named for the player who lost the ball, so it is filtered
    // by the victim; every other map belongs to whoever performed the action.
    .filter((event) => !player || (mode === "turnovers" ? event.target === player : event.actor === player));
  const visible = elapsed.filter((event) => {
    if (mode === "shots") return event.type === "shot";
    if (mode === "passes") return event.type === "pass" && passTypes.includes(event.passType ?? "normal");
    if (mode === "turnovers" || mode === "recoveries") {
      return event.type === "tackle" || event.type === "interception" || event.type === "recovery";
    }
    return true;
  });
  const isHeatMap = mode === "positions" || mode === "ball";
  const heatCells = useMemo(() => {
    if (!track || !isHeatMap) return [];
    const window = { fromMinute: since, toMinute: minute };
    return buildHeatCells(
      mode === "positions"
        ? playerDwell(track, { ...window, side, playerId })
        : ballDwell(track, { ...window, side, playerId }),
    );
  }, [track, isHeatMap, mode, side, playerId, since, minute]);

  return (
    <div className={`arena-event-map-frame arena-event-map-frame--${mode}`}>
    <svg className="arena-event-map" viewBox="0 0 100 64" role="img" aria-label="경기 이벤트 위치 지도">
      <defs>
        {/* The grid is already smoothed; this only softens the cell edges. */}
        <filter id="heat-blur" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.1" />
        </filter>
        <clipPath id="pitch-clip"><rect x="1" y="1" width="98" height="62" rx="2" /></clipPath>
      </defs>
      <rect className="arena-event-map__grass" x="1" y="1" width="98" height="62" rx="2" />
      {Array.from({ length: 10 }, (_, index) => (
        <rect
          key={index}
          className="arena-event-map__stripe"
          x={1 + index * 9.8}
          y="1"
          width="9.8"
          height="62"
          clipPath="url(#pitch-clip)"
          data-alt={index % 2 || undefined}
        />
      ))}
      {(isHeatMap ? heatCells.length === 0 : visible.length === 0) && (
        <text x="50" y="34" textAnchor="middle">아직 기록이 없습니다</text>
      )}
      {isHeatMap && (
        <g className="arena-event-map__heat" filter="url(#heat-blur)" clipPath="url(#pitch-clip)">
          {heatCells.map((cell, index) => (
            <rect
              key={index}
              // Overlapped by a hair so the blur has no seams to reveal.
              x={cell.x - 0.05}
              y={cell.y - 0.05}
              width={cell.width + 0.1}
              height={cell.height + 0.1}
              fill={heatColor(cell.intensity)}
              opacity={0.18 + cell.intensity * 0.62}
            />
          ))}
        </g>
      )}
      {!isHeatMap && visible.slice(-300).map((event, index) => {
        const x = event.x ?? 50;
        const y = ((event.y ?? 50) / 100) * 62 + 1;
        const endX = event.endX ?? x;
        const endY = ((event.endY ?? event.y ?? 50) / 100) * 62 + 1;
        const color = mode === "passes"
          ? PASS_TYPE_META[event.passType ?? "normal"].color
          : mode === "turnovers"
            ? "#ff6b72"
            : mode === "recoveries"
              ? "#35dc66"
          : event.side === "user" ? "#35dc66" : "#ff6b72";
        if (mode === "passes" || mode === "shots") {
          return (
            <g key={index} opacity={event.success ? 0.72 : 0.35}>
              <line
                x1={x}
                y1={y}
                x2={endX}
                y2={endY}
                stroke={color}
                strokeWidth={event.type === "goal" ? 1.2 : 0.55}
                strokeDasharray={event.success ? undefined : "1.5 1"}
              />
              <circle cx={endX} cy={endY} r={event.type === "goal" ? 1.8 : 0.8} fill={event.type === "goal" ? "#f6c344" : color} />
            </g>
          );
        }
        // Losing the ball is marked with a cross, winning it back with a
        // filled disc, so the two maps stay readable on their own.
        return (
          <g key={index}>
            <circle
              cx={x}
              cy={y}
              r="1.15"
              fill={mode === "recoveries" ? color : "none"}
              fillOpacity={mode === "recoveries" ? 0.28 : undefined}
              stroke={color}
              strokeWidth="0.45"
            />
            {mode === "recoveries" ? (
              <circle cx={x} cy={y} r="0.38" fill={color} />
            ) : (
              <path d={`M${x - 0.7} ${y - 0.7}l1.4 1.4m0-1.4l-1.4 1.4`} stroke={color} strokeWidth="0.38" />
            )}
          </g>
        );
      })}
      <path className="arena-event-map__line" d="M50 1v62M50 24a8 8 0 1 0 0 16a8 8 0 1 0 0-16M1 17h14v30H1M99 17H85v30h14M1 24h6v16H1M99 24h-6v16h6" />
    </svg>
    </div>
  );
}
