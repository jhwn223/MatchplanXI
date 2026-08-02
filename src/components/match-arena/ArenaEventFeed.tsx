import type { MatchEvent } from "../../data/matchSim";
import type { OpponentTacticChange } from "../match-board/opponentPlan";
import { describeTeamTactics, type TeamTactics } from "./tactics";

const EVENT_META: Record<MatchEvent["type"], { icon: string; label: string }> = {
  pass: { icon: "↗", label: "패스" },
  recovery: { icon: "●", label: "볼 회수" },
  dribble: { icon: "◇", label: "돌파" },
  interception: { icon: "◆", label: "가로채기" },
  tackle: { icon: "✦", label: "태클" },
  shot: { icon: "◎", label: "슈팅" },
  save: { icon: "✋", label: "선방" },
  block: { icon: "■", label: "블록" },
  miss: { icon: "○", label: "빗나감" },
  goal: { icon: "⚽", label: "득점" },
  foul: { icon: "!", label: "파울" },
  yellowCard: { icon: "▰", label: "경고" },
  redCard: { icon: "■", label: "퇴장" },
  offside: { icon: "⚑", label: "오프사이드" },
  corner: { icon: "⌜", label: "코너킥" },
  freeKick: { icon: "◉", label: "프리킥" },
  throwIn: { icon: "↥", label: "스로인" },
  penaltyKick: { icon: "◎", label: "페널티킥" },
  injury: { icon: "+", label: "부상" },
};

interface Props {
  events: MatchEvent[];
  minute: number;
  opponentTacticChanges?: OpponentTacticChange[];
  opponentTactics?: TeamTactics;
}

export function ArenaEventFeed({
  events,
  minute,
  opponentTacticChanges = [],
  opponentTactics,
}: Props) {
  // The whole history stays in the list and the list scrolls, so the panel
  // keeps a fixed height however long the match runs.
  const visible = events
    .filter(
      (event) =>
        event.minute <= minute &&
        event.type !== "pass" &&
        event.type !== "shot" &&
        event.type !== "recovery" &&
        event.type !== "throwIn",
    )
    .reverse();
  const latestOpponentChange = opponentTacticChanges
    .filter((change) => change.minute <= minute)
    .at(-1);

  return (
    <aside className="arena-events">
      {opponentTactics && (
        <div className="arena-opponent-current">
          <span>현재 상대 전술</span>
          <strong>{describeTeamTactics(opponentTactics)}</strong>
        </div>
      )}
      {latestOpponentChange && (
        <div className="arena-opponent-change">
          <span>{latestOpponentChange.minute}' 상대 전술 변화</span>
          <strong>{latestOpponentChange.title}</strong>
          <p>{latestOpponentChange.detail}</p>
        </div>
      )}
      <h3>최근 경기 정보</h3>
      <div className="arena-events__list">
        {visible.length === 0 ? <p className="arena-events__empty">경기 흐름을 분석하고 있습니다.</p> : visible.map((event, index) => (
          <div className="arena-event" key={`${event.minute}-${event.type}-${index}`} data-side={event.side} data-event={event.type}>
            <span>{EVENT_META[event.type].icon}</span>
            <p>
              <strong>{event.minute}′ {event.detail}</strong>
              <small>{EVENT_META[event.type].label}{event.xg != null ? ` · xG ${event.xg.toFixed(2)}` : ""}</small>
            </p>
          </div>
        ))}
      </div>
    </aside>
  );
}
