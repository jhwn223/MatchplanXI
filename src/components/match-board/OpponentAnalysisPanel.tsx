import type { ConditionBreakdown } from "../../data/conditionEngine";
import { slotsOf, type FormationKey } from "../../data/formation";
import type { Player, Team } from "../../data/types";
import { PlayerCardVisual } from "../PlayerCardVisual";
import { TeamFlag } from "../TeamFlag";
import type { PlayerDiscipline } from "../playerDiscipline";
import type { OpponentPlan } from "./opponentPlan";

interface Props {
  opponent: Team;
  /** The expected starting XI, ordered by the plan formation's slots. */
  players: Player[];
  /** Everyone in the opposition squad who is not in that XI. */
  bench: Player[];
  conditions: Map<number, ConditionBreakdown>;
  plan: OpponentPlan;
  currentFormation?: FormationKey;
  currentTactics?: OpponentPlan["tactics"];
  onSelectPlayer?: (player: Player) => void;
  discipline?: Map<number, PlayerDiscipline>;
}

const BENCH_GROUPS = [
  ["GK", "골키퍼"],
  ["DEF", "수비수"],
  ["MID", "미드필더"],
  ["FWD", "공격수"],
] as const;

export function OpponentAnalysisPanel({
  opponent,
  players,
  bench,
  conditions,
  plan,
  currentFormation = plan.formation,
  currentTactics = plan.tactics,
  onSelectPlayer,
  discipline,
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
        <span>
          <TeamFlag fifaCode={opponent.fifa_code} className="opponent-report__flag" />
          <small>{opponent.fifa_code}</small>
        </span>
        <div>
          <small>OPPOSITION REPORT</small>
          <h2>{opponent.team_name}</h2>
          <p>
            {currentFormation} · {plan.identity}
            {plan.formationSource === "observed" && <b>실제 경기 데이터</b>}
          </p>
        </div>
      </header>

      <div className="opponent-report__metrics">
        <div>
          <span>{plan.formationSource === "observed" ? "관찰 포메이션" : "추정 포메이션"}</span>
          <strong>{currentFormation}</strong>
        </div>
        <div><span>선발 평균 컨디션</span><strong>{averageCondition}</strong></div>
        <div>
          <span>고지대 적응</span>
          <strong>{plan.altitudeAdaptation >= 15 ? "높음" : plan.altitudeAdaptation > 0 ? "보통" : "낮음"}</strong>
        </div>
      </div>

      <section className="opponent-report__section opponent-report__lineup">
        <OpponentLineupPitch
          formation={currentFormation}
          players={players}
          conditions={conditions}
          onSelectPlayer={onSelectPlayer}
          discipline={discipline}
        />
      </section>

      <section className="opponent-report__shape">
        <div className="opponent-tactic-facts">
          <h3>예상 상대 전술</h3>
          <dl>
            <div><dt>성향</dt><dd>{tacticLabel("mentality", currentTactics.mentality)}</dd></div>
            <div><dt>압박</dt><dd>{tacticLabel("pressing", currentTactics.pressing)}</dd></div>
            <div><dt>수비 라인</dt><dd>{tacticLabel("line", currentTactics.defensiveLine)}</dd></div>
            <div><dt>팀 폭</dt><dd>{tacticLabel("width", currentTactics.width)}</dd></div>
            <div><dt>템포</dt><dd>{tacticLabel("tempo", currentTactics.tempo)}</dd></div>
          </dl>
        </div>
      </section>

      {/* Scout notes and the formation evidence live in one scrollable group
       *  (see .opponent-report__scout-group in match-arena.css) so that if
       *  the two together don't fit the in-match column's fixed height, the
       *  group scrolls instead of the evidence line silently clipping past
       *  the board's bottom edge. */}
      <div className="opponent-report__scout-group">
        <section className="opponent-report__section opponent-report__scout">
          <small className="opponent-report__scout-basis">
            48개국 선수단 분포와 팀 내 상대 순위를 함께 반영
          </small>
          <div>
            <h3>강점</h3>
            <ul>{plan.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          <div>
            <h3>약점</h3>
            <ul>{plan.weaknesses.map((item) => <li key={item}>{item}</li>)}</ul>
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
      </div>

      <section className="opponent-report__section opponent-report__bench">
        <h3>상대 교체 명단 <b>{bench.length}명</b></h3>
        {bench.length === 0 ? (
          <p className="opponent-bench-empty">교체 가능한 선수가 없습니다.</p>
        ) : (
          BENCH_GROUPS.map(([position, label]) => {
            const group = bench
              .filter((player) => player.position === position)
              .sort((a, b) => (b.ability?.overall ?? 0) - (a.ability?.overall ?? 0));
            if (group.length === 0) return null;
            return (
              <div key={position} className="opponent-bench-group">
                <h4>{label} <span>{group.length}</span></h4>
                <div className="opponent-lineup-list">
                  {group.map((player) => (
                    <PlayerCardVisual
                      key={player.player_id}
                      player={player}
                      condition={conditions.get(player.player_id)}
                      variant="bench"
                      onSelect={onSelectPlayer}
                      discipline={discipline?.get(player.player_id)}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </section>

    </div>
  );
}

function tacticLabel(
  type: "mentality" | "pressing" | "line" | "width" | "tempo",
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
    tempo: { slow: "느림", balanced: "보통", fast: "빠름" },
  };
  return labels[type][value] ?? value;
}

/**
 * The opposition XI on the same pitch, with the same cards, as the user's own
 * lineup board — only scaled to the width of the scouting rail. `players` is
 * built by walking `slotsOf(plan.formation)` in order, so the index is what
 * pairs a player with the position he is expected to fill.
 */
function OpponentLineupPitch({
  formation,
  players,
  conditions,
  onSelectPlayer,
  discipline,
}: {
  formation: FormationKey;
  players: Player[];
  conditions: Map<number, ConditionBreakdown>;
  onSelectPlayer?: (player: Player) => void;
  discipline?: Map<number, PlayerDiscipline>;
}) {
  const slots = slotsOf(formation);
  const available = new Set(players);
  const assigned = new Map<string, Player>();
  for (const slot of slots) {
    const candidates = [...available];
    const player = candidates
      .filter((candidate) => candidate.position === slot.position)
      .sort((a, b) => (b.ability?.overall ?? 0) - (a.ability?.overall ?? 0))[0]
      ?? candidates
        .filter((candidate) => slot.position !== "GK" && candidate.position !== "GK")
        .sort((a, b) => (b.ability?.overall ?? 0) - (a.ability?.overall ?? 0))[0]
      ?? candidates[0];
    if (!player) continue;
    assigned.set(slot.id, player);
    available.delete(player);
  }
  return (
    <div className="pitch pitch--compact" aria-label={`상대 예상 선발 ${formation}`}>
      <div className="pitch__markings">
        <div className="pitch__center-circle" />
        <div className="pitch__center-line" />
        <div className="pitch__box pitch__box--top" />
        <div className="pitch__box pitch__box--bottom" />
      </div>
      {slots.map((slot) => {
        const player = assigned.get(slot.id);
        return (
          <div
            key={slot.id}
            className="pitch-slot"
            style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
            data-filled={player ? true : undefined}
          >
            {player ? (
              <PlayerCardVisual
                player={player}
                condition={conditions.get(player.player_id)}
                variant="slot"
                onSelect={onSelectPlayer}
                discipline={discipline?.get(player.player_id)}
              />
            ) : (
              <div className="pitch-slot__placeholder">{slot.label}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
