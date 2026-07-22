import type { MatchEvent } from "../../data/matchSim";

const EVENT_META: Record<MatchEvent["type"], { icon: string; label: string }> = {
  pass: { icon: "↗", label: "패스" },
  dribble: { icon: "◇", label: "돌파" },
  interception: { icon: "◆", label: "가로채기" },
  tackle: { icon: "✦", label: "태클" },
  shot: { icon: "◎", label: "슈팅" },
  save: { icon: "✋", label: "선방" },
  block: { icon: "■", label: "블록" },
  miss: { icon: "○", label: "빗나감" },
  goal: { icon: "⚽", label: "득점" },
};

export function ArenaEventFeed({ events, minute }: { events: MatchEvent[]; minute: number }) {
  const elapsed = events.filter((event) => event.minute <= minute);
  const visible = elapsed
    .filter((event) => event.type !== "pass" && event.type !== "shot")
    .slice(-7)
    .reverse();
  const completedPasses = elapsed.filter((event) => event.side === "user" && event.type === "pass").length;
  const lostPasses = elapsed.filter((event) => event.side === "opp" && event.type === "interception").length;
  const passRate = completedPasses + lostPasses
    ? Math.round((completedPasses / (completedPasses + lostPasses)) * 100)
    : 0;
  const xg = elapsed
    .filter((event) => event.side === "user" && event.type === "shot")
    .reduce((sum, event) => sum + (event.xg ?? 0), 0);

  return (
    <aside className="arena-events">
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
      <div className="arena-events__stats">
        <div><span>실시간 패스 성공</span><strong>{passRate || "–"}%</strong></div>
        <div><span>실시간 xG</span><strong>{xg.toFixed(2)}</strong></div>
      </div>
    </aside>
  );
}
