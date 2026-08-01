import type { MatchEvent, PassType, PositionSample } from "../../data/matchSim";
import { ALL_PASS_TYPES, PASS_TYPE_META } from "./passMap";

export type EventMapMode = "positions" | "shots" | "passes" | "turnovers" | "recoveries";

interface Props {
  events: MatchEvent[];
  minute: number;
  mode: EventMapMode;
  player?: string;
  passTypes?: PassType[];
  positionSamples?: PositionSample[];
}

interface HeatPoint {
  x: number;
  y: number;
  intensity: number;
}

function buildHeatPoints(samples: PositionSample[]): HeatPoint[] {
  const cells = new Map<string, { x: number; y: number; count: number }>();
  for (const sample of samples.slice(-2_500)) {
    const x = sample.x;
    const y = (sample.y / 100) * 62 + 1;
    const key = `${Math.round(x / 4)}:${Math.round(y / 4)}`;
    const cell = cells.get(key) ?? { x: 0, y: 0, count: 0 };
    cell.x += x;
    cell.y += y;
    cell.count++;
    cells.set(key, cell);
  }
  const maxCount = Math.max(1, ...Array.from(cells.values(), (cell) => cell.count));
  return Array.from(cells.values(), (cell) => ({
    x: cell.x / cell.count,
    y: cell.y / cell.count,
    intensity: Math.sqrt(cell.count / maxCount),
  }));
}

export function ArenaEventMap({
  events,
  minute,
  mode,
  player,
  passTypes = ALL_PASS_TYPES,
  positionSamples = [],
}: Props) {
  const elapsed = events
    .filter((event) => event.minute <= minute)
    .filter((event) => (mode === "turnovers" ? event.side === "opp" : event.side === "user"))
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
  const heatSamples = positionSamples
    .filter((sample) => sample.minute <= minute && sample.side === "user")
    .filter((sample) => !player || sample.playerName === player);
  const heatPoints = mode === "positions" ? buildHeatPoints(heatSamples) : [];

  return (
    <div className={`arena-event-map-frame arena-event-map-frame--${mode}`}>
    <svg className="arena-event-map" viewBox="0 0 100 64" role="img" aria-label="경기 이벤트 위치 지도">
      <defs>
        <filter id="heat-blur" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.8" />
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
      {(mode === "positions" ? heatSamples.length === 0 : visible.length === 0) && (
        <text x="50" y="34" textAnchor="middle">아직 기록이 없습니다</text>
      )}
      {mode === "positions" && (
        <g className="arena-event-map__heat" filter="url(#heat-blur)" clipPath="url(#pitch-clip)">
          {heatPoints.map((point, index) => {
            const radius = 7 + point.intensity * 6;
            return (
              <g key={index}>
                <circle cx={point.x} cy={point.y} r={radius} fill="#52d327" opacity={0.34 + point.intensity * 0.2} />
                <circle cx={point.x} cy={point.y} r={radius * 0.72} fill="#ffe600" opacity={0.28 + point.intensity * 0.3} />
                {point.intensity >= 0.34 && (
                  <circle cx={point.x} cy={point.y} r={radius * 0.46} fill="#ff8118" opacity={0.3 + point.intensity * 0.36} />
                )}
                {point.intensity >= 0.62 && (
                  <circle cx={point.x} cy={point.y} r={radius * 0.25} fill="#f2381b" opacity={0.4 + point.intensity * 0.4} />
                )}
              </g>
            );
          })}
        </g>
      )}
      {mode !== "positions" && visible.slice(-300).map((event, index) => {
        const x = event.x ?? 50;
        const y = ((event.y ?? 50) / 100) * 62 + 1;
        const endX = event.endX ?? x;
        const endY = ((event.endY ?? event.y ?? 50) / 100) * 62 + 1;
        const color = mode === "passes"
          ? PASS_TYPE_META[event.passType ?? "normal"].color
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
              r="1.9"
              fill={mode === "recoveries" ? color : "none"}
              fillOpacity={mode === "recoveries" ? 0.28 : undefined}
              stroke={color}
              strokeWidth="0.7"
            />
            {mode === "recoveries" ? (
              <circle cx={x} cy={y} r="0.7" fill={color} />
            ) : (
              <path d={`M${x - 1.2} ${y - 1.2}l2.4 2.4m0-2.4l-2.4 2.4`} stroke={color} strokeWidth="0.5" />
            )}
          </g>
        );
      })}
      <path className="arena-event-map__line" d="M50 1v62M50 24a8 8 0 1 0 0 16a8 8 0 1 0 0-16M1 17h14v30H1M99 17H85v30h14M1 24h6v16H1M99 24h-6v16h6" />
    </svg>
    </div>
  );
}
