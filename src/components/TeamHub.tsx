import { useMemo } from "react";
import { motion } from "framer-motion";
import type { Team, TournamentData } from "../data/types";
import {
  finishingPosition,
  getTeamMatches,
  stageLabelKo,
  type PlayedMap,
  type TeamMatch,
} from "../data/tournament";
import { groupStandingsHub, qualificationProbability } from "../data/tournamentEngine";
import { AppTopbar } from "./AppTopbar";

interface Props {
  data: TournamentData;
  team: Team;
  lineupCounts: Record<number, number>;
  played: PlayedMap;
  onBack: () => void;
  onOpenMatch: (matchId: number) => void;
  onOpenBracket: () => void;
}

interface UserResult {
  gf: number;
  ga: number;
  outcome: "W" | "D" | "L";
}

function userResultOf(tm: TeamMatch, played: PlayedMap): UserResult | null {
  const r = played[tm.match.match_id];
  if (!r) return null;
  const gf = tm.isHome ? r.homeGoals : r.awayGoals;
  const ga = tm.isHome ? r.awayGoals : r.homeGoals;
  return { gf, ga, outcome: gf > ga ? "W" : gf < ga ? "L" : "D" };
}

export function TeamHub({ data, team, lineupCounts, played, onBack, onOpenMatch, onOpenBracket }: Props) {
  const allMatches = getTeamMatches(data, team.team_name);
  const groupMatches = allMatches.filter((m) => m.match.stage_name === "Group Stage");
  const standings = groupStandingsHub(data, team.group_letter, played, team.team_name);

  const groupPlayedCount = groupMatches.filter((m) => played[m.match.match_id]).length;
  const groupComplete = groupPlayedCount === groupMatches.length;
  const nextFixtureIndex = groupMatches.findIndex((m) => !played[m.match.match_id]);
  const pos = finishingPosition(standings, team.team_name);
  const qualified = groupComplete && pos <= 2;
  const advanceProbability = useMemo(
    () => qualificationProbability(data, team.group_letter, played, team.team_name),
    [data, team.group_letter, team.team_name, played]
  );

  let banner: { text: string; tone: string };
  if (!groupComplete) {
    banner = {
      text: `조별리그 진행 ${groupPlayedCount}/${groupMatches.length} — 경기를 치르면 순위와 진출이 바뀝니다`,
      tone: "neutral",
    };
  } else if (qualified) {
    banner = { text: `🎉 조 ${pos}위로 토너먼트 진출! 대진표에서 다음 경기를 치르세요.`, tone: "good" };
  } else {
    banner = { text: `😢 조 ${pos}위 — 조별리그 탈락. 대회는 계속 진행됩니다.`, tone: "bad" };
  }

  return (
    <div className="hub">
      <AppTopbar active="schedule" teamCode={team.fifa_code} onBrandClick={onBack} />
      <header className="hub__header">
        <button type="button" className="btn-back" onClick={onBack}>
          ← 국가 선택
        </button>
        <div className="hub__title-block">
          <span className="hub__code">{team.fifa_code}</span>
          <div>
            <h1 className="hub__title">{team.team_name}</h1>
            <p className="hub__meta">
              그룹 {team.group_letter} · FIFA #{team.fifa_ranking_pre_tournament} · 감독 {team.manager_name}
            </p>
          </div>
        </div>
        <div className="hub__progress">
          <div><span>대회 진행률</span><strong>{groupPlayedCount}/{groupMatches.length} MATCHES</strong></div>
          <div className="hub__progress-track"><i style={{ width: `${(groupPlayedCount / Math.max(1, groupMatches.length)) * 100}%` }} /></div>
        </div>
      </header>

      <div className={`hub__banner hub__banner--${banner.tone}`}>{banner.text}</div>

      {groupComplete && (
        <div className="bracket-cta">
          <button type="button" className="tournament-btn" onClick={onOpenBracket}>
            🏆 토너먼트 대진표 보기 / 경기 진행 →
          </button>
        </div>
      )}

      <div className="hub__body">
        <section className="hub__standings">
          <h2 className="hub__section-title">그룹 {team.group_letter} 순위 (내 경기는 실제 결과 · 다른 경기는 전력 기준 시뮬레이션)</h2>
          <table className="standings">
            <thead>
              <tr>
                <th>#</th>
                <th className="standings__team">팀</th>
                <th>경기</th>
                <th>승</th>
                <th>무</th>
                <th>패</th>
                <th>득실</th>
                <th>승점</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((r, i) => (
                <tr key={r.teamName} data-me={r.teamName === team.team_name || undefined} data-qualify={i < 2 || undefined}>
                  <td>{i + 1}</td>
                  <td className="standings__team">{r.teamName}</td>
                  <td>{r.played}</td>
                  <td>{r.won}</td>
                  <td>{r.drawn}</td>
                  <td>{r.lost}</td>
                  <td>{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                  <td className="standings__pts">{r.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hub__hint">상위 2팀이 토너먼트 진출 · 내가 아직 안 치른 내 경기만 순위에서 제외됩니다</p>
          <div className="qualification-card">
            <span>32강 진출 확률</span>
            <div><strong>{advanceProbability}%</strong><em>{pos <= 2 ? "진출권" : "추격 필요"}</em></div>
            <div className="qualification-card__track"><i style={{ width: `${advanceProbability}%` }} /></div>
            <p>
              {groupComplete
                ? qualified ? "토너먼트 진출 확정" : "조별리그 일정 종료"
                : `남은 경기 ${groupMatches.length - groupPlayedCount}회 · 상대 전력 기준 시뮬레이션`}
            </p>
          </div>
        </section>

        <section className="hub__fixtures">
          <h2 className="hub__section-title">조별리그 3경기 — 전술을 짜세요</h2>
          <div className="fixtures">
            {groupMatches.map((tm, index) => (
              <FixtureCard
                key={tm.match.match_id}
                tm={tm}
                teamCode={team.fifa_code}
                placed={lineupCounts[tm.match.match_id] ?? 0}
                result={userResultOf(tm, played)}
                featured={index === nextFixtureIndex}
                locked={nextFixtureIndex !== -1 && index > nextFixtureIndex}
                matchday={index + 1}
                onOpen={() => onOpenMatch(tm.match.match_id)}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function FixtureCard({
  tm,
  teamCode,
  placed,
  result,
  featured,
  locked,
  matchday,
  onOpen,
}: {
  tm: TeamMatch;
  teamCode: string;
  placed: number;
  result: UserResult | null;
  featured: boolean;
  locked: boolean;
  matchday: number;
  onOpen: () => void;
}) {
  const { match } = tm;
  const elevClass = tm.elevation >= 2000 ? "high" : tm.elevation >= 1000 ? "mid" : "low";

  return (
    <motion.button
      type="button"
      className="fixture"
      data-played={result ? true : undefined}
      data-featured={featured || undefined}
      data-locked={locked || undefined}
      disabled={locked}
      aria-disabled={locked || undefined}
      onClick={locked ? undefined : onOpen}
      whileHover={locked ? undefined : { scale: 1.01, y: -2 }}
      whileTap={locked ? undefined : { scale: 0.99 }}
    >
      <div className="fixture__meta-panel">
        <span className="fixture__matchday">MATCHDAY {String(matchday).padStart(2, "0")}</span>
        <strong>{result ? "경기 종료" : match.date}</strong>
        <p>Stadium<br />{match.stadium_name.replace(/\s*\(.*\)/, "")}</p>
      </div>
      <div className="fixture__content">
        {featured && <span className="fixture__next-label">NEXT FIXTURE</span>}
        {locked && <span className="fixture__locked-label">🔒 LOCKED</span>}
        <div className="fixture__match">
          <span className="fixture__team-code">{teamCode}</span>
          {result ? (
            <strong className="fixture__score">{result.gf} — {result.ga}</strong>
          ) : (
            <span className="fixture__vs">VS</span>
          )}
          <span className="fixture__team-code fixture__team-code--opp">{tm.opponentCode}</span>
        </div>
        {!result && (
          <div className="fixture__factors">
            <span className={`elev-badge elev-badge--${elevClass}`}>⛰<small>ALTITUDE</small><strong>{tm.elevation}m</strong></span>
            <span><b>▣</b><small>REST</small><strong>{tm.restDays} Days</strong></span>
            <span><b>✈</b><small>TRAVEL</small><strong>{tm.travelKm}km</strong></span>
            <span><b>◷</b><small>TIME ZONE</small><strong>{Math.abs(tm.tzShiftHours)}h Diff</strong></span>
          </div>
        )}
        <div className="fixture__bottom">
          <span>{stageLabelKo(match.stage_name)} · {match.city}</span>
          <strong className={result ? `fixture__result fixture__result--${result.outcome.toLowerCase()}` : "fixture__status"}>
            {result
              ? `${result.outcome === "W" ? "승" : result.outcome === "D" ? "무" : "패"} · 다시보기`
              : locked
                ? "이전 경기를 먼저 진행하세요"
                : placed === 11
                  ? "라인업 완성 · 경기 시작"
                  : placed > 0
                    ? `${placed}/11 배치 계속하기`
                    : "전술 설정"}
          </strong>
        </div>
      </div>
    </motion.button>
  );
}
