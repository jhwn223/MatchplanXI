import type { LiveMatchSnapshot } from "../../data/matchSim";
import { describeTeamTactics, type TeamTactics } from "./tactics";

interface Props {
  tactics: TeamTactics;
  changedAt: number;
  hasChanged: boolean;
  baseline: LiveMatchSnapshot | null;
  live: LiveMatchSnapshot | null;
  currentMinute: number;
  simulatedThrough: number;
}

function delta(current: number, previous: number | undefined) {
  return current - (previous ?? 0);
}

export function TacticImpactPanel({
  tactics,
  changedAt,
  hasChanged,
  baseline,
  live,
  currentMinute,
  simulatedThrough,
}: Props) {
  const user = live?.teamStats.user;
  const opp = live?.teamStats.opp;
  const baseUser = baseline?.teamStats.user;
  const baseOpp = baseline?.teamStats.opp;
  const userTouches = delta(user?.possessionTouches ?? 0, baseUser?.possessionTouches);
  const oppTouches = delta(opp?.possessionTouches ?? 0, baseOpp?.possessionTouches);
  const intervalTouches = userTouches + oppTouches;
  const possession = intervalTouches ? Math.round((userTouches / intervalTouches) * 100) : 50;
  const shots = delta(user?.shots ?? 0, baseUser?.shots);
  const recoveries =
    delta(user?.tacklesWon ?? 0, baseUser?.tacklesWon) +
    delta(user?.interceptions ?? 0, baseUser?.interceptions);
  const xg = delta(live?.userXg ?? 0, baseline?.userXg);
  const elapsed = Math.max(0, currentMinute - changedAt);

  return (
    <section className="tactic-impact" aria-label="실시간 전술 영향">
      <div className="tactic-impact__head">
        <div>
          <span>LIVE TACTICAL IMPACT</span>
          <strong>{hasChanged ? `${changedAt}분 변경 이후` : "현재 경기 전술"}</strong>
        </div>
        <em>실시간 계산</em>
      </div>
      <p className="tactic-impact__plan">{describeTeamTactics(tactics)}</p>
      <div className="tactic-impact__metrics">
        <div><span>점유율</span><strong>{possession}%</strong></div>
        <div><span>슈팅</span><strong>{shots}</strong></div>
        <div><span>xG</span><strong>{xg.toFixed(2)}</strong></div>
        <div><span>볼 회수</span><strong>{recoveries}</strong></div>
      </div>
      <p className="tactic-impact__proof">
        {elapsed === 0
          ? "변경 완료 — 다음 플레이부터 새 전술로 계산합니다."
          : `${elapsed}분간의 실제 결과입니다. ${simulatedThrough}분 이후 이벤트는 아직 생성되지 않았습니다.`}
      </p>
    </section>
  );
}
