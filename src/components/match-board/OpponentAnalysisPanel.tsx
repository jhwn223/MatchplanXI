import { conditionColor, type ConditionBreakdown } from "../../data/conditionEngine";
import { slotsOf, type FormationKey } from "../../data/formation";
import type { Player, Team } from "../../data/types";
import { PlayerPhoto } from "../player-photo/PlayerPhoto";
import type { TeamTactics } from "../match-arena/tactics";
import type { OpponentPlan, TacticalMatchup } from "./opponentPlan";

interface Props {
  opponent: Team;
  players: Player[];
  conditions: Map<number, ConditionBreakdown>;
  plan: OpponentPlan;
  matchups: TacticalMatchup[];
  onApplyMatchup: (patch: Partial<TeamTactics>) => void;
}

export function OpponentAnalysisPanel({
  opponent,
  players,
  conditions,
  plan,
  matchups,
  onApplyMatchup,
}: Props) {
  const averageCondition = players.length
    ? Math.round(
        players.reduce((sum, player) => sum + (conditions.get(player.player_id)?.score ?? 70), 0) /
          players.length
      )
    : 0;

  return (
    <div className="opponent-report">
      <header className="opponent-report__header">
        <span>{opponent.fifa_code}</span>
        <div>
          <small>OPPOSITION REPORT</small>
          <h2>{opponent.team_name}</h2>
          <p>
            {plan.formation} · {plan.identity}
            {plan.formationSource === "observed" && <b>실제 경기 데이터</b>}
          </p>
        </div>
      </header>

      <div className="opponent-report__metrics">
        <div>
          <span>{plan.formationSource === "observed" ? "관찰 포메이션" : "추정 포메이션"}</span>
          <strong>{plan.formation}</strong>
        </div>
        <div><span>선발 평균 컨디션</span><strong>{averageCondition}</strong></div>
        <div>
          <span>고지대 적응</span>
          <strong>{plan.altitudeAdaptation >= 15 ? "높음" : plan.altitudeAdaptation > 0 ? "보통" : "낮음"}</strong>
        </div>
      </div>

      <section className="opponent-report__shape">
        <OpponentFormationPreview formation={plan.formation} />
        <div className="opponent-tactic-facts">
          <h3>예상 상대 전술</h3>
          <dl>
            <div><dt>성향</dt><dd>{tacticLabel("mentality", plan.tactics.mentality)}</dd></div>
            <div><dt>압박</dt><dd>{tacticLabel("pressing", plan.tactics.pressing)}</dd></div>
            <div><dt>수비 라인</dt><dd>{tacticLabel("line", plan.tactics.defensiveLine)}</dd></div>
            <div><dt>팀 폭</dt><dd>{tacticLabel("width", plan.tactics.width)}</dd></div>
            <div><dt>빌드업</dt><dd>{tacticLabel("buildUp", plan.tactics.buildUpPlay)}</dd></div>
            <div><dt>템포</dt><dd>{tacticLabel("tempo", plan.tactics.tempo)}</dd></div>
          </dl>
        </div>
      </section>
      {plan.formationEvidence && (
        <div className="opponent-report__evidence">
          <span>근거</span>
          <p>{plan.formationEvidence.matchId} · {plan.formationEvidence.match}</p>
          <a href={plan.formationEvidence.sourceUrl} target="_blank" rel="noreferrer">
            {plan.formationEvidence.sourceName} 보기 ↗
          </a>
        </div>
      )}

      <section className="opponent-report__section">
        <h3>예상 선발 컨디션</h3>
        <div className="opponent-lineup-list">
          {players.map((player) => {
            const condition = Math.round(conditions.get(player.player_id)?.score ?? 70);
            const color = conditionColor(condition);
            return (
              <div key={player.player_id} className="opponent-player">
                <PlayerPhoto player={player} className="opponent-player__photo" />
                <span>
                  <strong>{player.player_name}</strong>
                  <small>{player.position} · OVR {player.ability?.overall ?? "–"}</small>
                </span>
                <i><b style={{ width: `${condition}%`, background: color }} /></i>
                <em style={{ color }}>{condition}</em>
              </div>
            );
          })}
        </div>
      </section>

      <section className="opponent-report__section opponent-report__scout">
        <div>
          <h3>강점</h3>
          <ul>{plan.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
        <div>
          <h3>약점</h3>
          <ul>{plan.weaknesses.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      </section>

      <section className="opponent-report__section">
        <h3>전술 상성 분석</h3>
        <div className="matchup-list">
          {matchups.map((matchup) => (
            <article key={matchup.id} className="matchup-card" data-status={matchup.status}>
              <div>
                <span>{matchup.status === "effective" ? "✓ 대응 중" : matchup.status === "warning" ? "△ 대응 필요" : "분석"}</span>
                <strong>{matchup.title}</strong>
              </div>
              <p>{matchup.detail}</p>
              <small>{matchup.recommendation}</small>
              {Object.keys(matchup.patch).length > 0 && (
                <button type="button" onClick={() => onApplyMatchup(matchup.patch)}>
                  추천 대응 적용
                </button>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function tacticLabel(
  type: "mentality" | "pressing" | "line" | "width" | "buildUp" | "tempo",
  value: string,
) {
  const labels: Record<typeof type, Record<string, string>> = {
    mentality: {
      defensive: "수비적",
      cautious: "신중",
      balanced: "균형",
      positive: "적극적",
      attacking: "공격적",
    },
    pressing: { low: "낮음", standard: "보통", high: "강함" },
    line: { low: "낮음", standard: "보통", high: "높음" },
    width: { narrow: "좁게", balanced: "중간", wide: "넓게" },
    buildUp: {
      shortPass: "짧은 패스",
      balanced: "균형",
      longPass: "긴 패스",
      fastBuildUp: "빠른 전개",
    },
    tempo: { slow: "느림", balanced: "보통", fast: "빠름" },
  };
  return labels[type][value] ?? value;
}

function OpponentFormationPreview({ formation }: { formation: FormationKey }) {
  return (
    <div className="opponent-mini-pitch" aria-label={`상대 포메이션 ${formation}`}>
      <div className="opponent-mini-pitch__halfway" />
      <div className="opponent-mini-pitch__circle" />
      <div className="opponent-mini-pitch__box opponent-mini-pitch__box--top" />
      <div className="opponent-mini-pitch__box opponent-mini-pitch__box--bottom" />
      {slotsOf(formation).map((slot) => (
        <span
          key={slot.id}
          data-position={slot.position}
          style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
          title={slot.label}
        />
      ))}
      <strong>{formation}</strong>
    </div>
  );
}
