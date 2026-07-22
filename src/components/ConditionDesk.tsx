import { useMemo, useState } from "react";
import { usePlayerConditions } from "../hooks/usePlayerConditions";
import { conditionColor, computeTeamIndex } from "../data/conditionEngine";
import { getTeamMatches, type TeamMatch } from "../data/tournament";
import type { Position, Team, TournamentData } from "../data/types";

interface Props {
  data: TournamentData;
  team: Team;
  restBias: Record<number, number>;
  onChangeRestBias: (playerId: number, value: number) => void;
  onBack: () => void;
}

const POSITION_ORDER: Position[] = ["GK", "DEF", "MID", "FWD"];

function formatEur(v: number): string {
  return `€${(v / 1_000_000).toFixed(1)}M`;
}

export function ConditionDesk({ data, team, restBias, onChangeRestBias, onBack }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);

  const teamMatches = useMemo(() => getTeamMatches(data, team.team_name), [data, team.team_name]);
  const refMatch: TeamMatch | null = useMemo(
    () => teamMatches.find((tm) => tm.match.status !== "Completed") ?? teamMatches[0] ?? null,
    [teamMatches]
  );
  const restBiasMap = useMemo(() => {
    const m = new Map<number, number>();
    for (const [k, v] of Object.entries(restBias)) m.set(Number(k), v);
    return m;
  }, [restBias]);

  const conditions = usePlayerConditions(data, team.team_id, teamMatches, refMatch, restBiasMap);
  const squad = useMemo(() => data.players.filter((p) => p.team_id === team.team_id), [data, team.team_id]);
  const teamAvg = computeTeamIndex(
    squad.map((p) => conditions.get(p.player_id)?.score).filter((s): s is number => s != null)
  );

  return (
    <div className="condition-desk">
      <header className="condition-desk__header">
        <button type="button" className="btn-back" onClick={onBack}>
          ← 팀 허브
        </button>
        <div className="condition-desk__title-block">
          <h1 className="condition-desk__title">✈️ 컨디션 트래커</h1>
          {refMatch && (
            <p className="condition-desk__meta">
              기준 경기 · {refMatch.opponentName} · {refMatch.match.city} · ⛰ {refMatch.elevation}m · 휴식{" "}
              {refMatch.restDays}일
            </p>
          )}
        </div>
        <div className="condition-desk__teamavg">
          <span className="condition-desk__teamavg-label">팀 평균 컨디션</span>
          <span
            className="cond-badge"
            style={{ background: conditionColor(teamAvg ?? 0) }}
          >
            {teamAvg == null ? "–" : Math.round(teamAvg)}
          </span>
        </div>
      </header>

      <div className="condition-desk__list">
        {POSITION_ORDER.map((pos) => {
          const group = squad.filter((p) => p.position === pos);
          if (group.length === 0) return null;
          return (
            <section key={pos} className="condition-desk__group">
              <h2 className="condition-desk__group-title">{pos}</h2>
              {group.map((p) => {
                const c = conditions.get(p.player_id);
                const bias = restBias[p.player_id] ?? 50;
                const isOpen = expanded === p.player_id;
                return (
                  <div key={p.player_id} className="cond-row" data-open={isOpen || undefined}>
                    <button
                      type="button"
                      className="cond-row__main"
                      onClick={() => setExpanded(isOpen ? null : p.player_id)}
                    >
                      <span className="cond-row__name">{p.player_name}</span>
                      <span className="cond-row__club">{p.club_team}</span>
                      <span className="cond-badge" style={{ background: conditionColor(c?.score ?? 0) }}>
                        {c ? Math.round(c.score) : "–"}
                      </span>
                      <span className="cond-row__chevron">{isOpen ? "▲" : "▼"}</span>
                    </button>
                    {isOpen && c && (
                      <div className="cond-row__detail">
                        <div className="cond-breakdown">
                          <span>⛰ 고도 −{c.altitudePenalty.toFixed(1)}</span>
                          <span>
                            🛫 비행 {c.flightHours.toFixed(1)}h (−{c.flightPenalty.toFixed(1)})
                          </span>
                          <span>
                            🕐 시차 {c.jetlagHours}h (−{c.jetlagPenalty.toFixed(1)})
                          </span>
                          <span>😴 휴식 부족 −{c.restPenalty.toFixed(1)}</span>
                          <span>🏃 피로 −{c.fatiguePenalty.toFixed(1)}</span>
                          <span>🎖 경험 보정 +{c.experienceOffset.toFixed(1)}</span>
                          <span>
                            {bias < 50 ? "🛌" : bias > 50 ? "💪" : "➖"} 컨디션 조절{" "}
                            {c.restBiasAdjust >= 0 ? "+" : ""}
                            {c.restBiasAdjust.toFixed(1)}
                          </span>
                        </div>
                        <div className="cond-ability">
                          능력치 · 캡 {p.caps} · 시장가치 {formatEur(p.market_value_eur)} · 키 {p.height_cm}cm ·
                          A매치 골 {p.goals}
                        </div>
                        <div className="rest-slider-row">
                          <div className="rest-slider-row__labels">
                            <span>휴식 위주</span>
                            <span>훈련 위주</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={bias}
                            onChange={(e) => onChangeRestBias(p.player_id, Number(e.target.value))}
                            className="rest-slider"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
