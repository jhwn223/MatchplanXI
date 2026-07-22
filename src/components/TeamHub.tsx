import { motion } from "framer-motion";
import type { Team, TournamentData } from "../data/types";
import {
  finishingPosition,
  getTeamMatches,
  stageLabelKo,
  type PlayedMap,
  type TeamMatch,
} from "../data/tournament";
import { groupStandingsSim } from "../data/tournamentEngine";

interface Props {
  data: TournamentData;
  team: Team;
  lineupCounts: Record<number, number>;
  played: PlayedMap;
  onBack: () => void;
  onOpenMatch: (matchId: number) => void;
  onOpenBracket: () => void;
}

function elevationTag(elev: number): string {
  if (elev >= 2000) return "초고지대";
  if (elev >= 1000) return "고지대";
  if (elev >= 300) return "구릉지";
  return "저지대";
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
  const standings = groupStandingsSim(data, team.group_letter, played);

  const groupPlayedCount = groupMatches.filter((m) => played[m.match.match_id]).length;
  const groupComplete = groupPlayedCount === groupMatches.length;
  const pos = finishingPosition(standings, team.team_name);
  const qualified = groupComplete && pos <= 2;

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
          <h2 className="hub__section-title">그룹 {team.group_letter} 순위 (플레이한 경기만 반영)</h2>
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
          <p className="hub__hint">상위 2팀이 토너먼트 진출 · 아직 치르지 않은 경기는 순위에 반영되지 않습니다</p>
        </section>

        <section className="hub__fixtures">
          <h2 className="hub__section-title">조별리그 3경기 — 전술을 짜세요</h2>
          <div className="fixtures">
            {groupMatches.map((tm) => (
              <FixtureCard
                key={tm.match.match_id}
                tm={tm}
                placed={lineupCounts[tm.match.match_id] ?? 0}
                result={userResultOf(tm, played)}
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
  placed,
  result,
  onOpen,
}: {
  tm: TeamMatch;
  placed: number;
  result: UserResult | null;
  onOpen: () => void;
}) {
  const { match } = tm;
  const elevClass = tm.elevation >= 2000 ? "high" : tm.elevation >= 1000 ? "mid" : "low";

  const statusNode = result ? (
    <span className={`fixture__result fixture__result--${result.outcome.toLowerCase()}`}>
      {result.outcome === "W" ? "승" : result.outcome === "D" ? "무" : "패"} {result.gf}-{result.ga} · 다시하기 ↻
    </span>
  ) : (
    <span className="fixture__status">
      {placed === 11 ? "✓ 라인업 완성 · 시작" : placed > 0 ? `${placed}/11 배치` : "전술 짜기 →"}
    </span>
  );

  return (
    <motion.button
      type="button"
      className="fixture"
      data-played={result ? true : undefined}
      onClick={onOpen}
      whileHover={{ scale: 1.01, y: -2 }}
      whileTap={{ scale: 0.99 }}
    >
      <div className="fixture__top">
        <span className="fixture__stage">{stageLabelKo(match.stage_name)}</span>
        <span className="fixture__date">{match.date}</span>
      </div>
      <div className="fixture__match">
        <span className="fixture__vs">{tm.isHome ? "vs" : "@"}</span>
        <span className="fixture__opponent">{tm.opponentName}</span>
        <span className="fixture__code">({tm.opponentCode})</span>
      </div>
      <div className="fixture__venue">
        {match.stadium_name.replace(/\s*\(.*\)/, "")} · {match.city}
      </div>
      <div className="fixture__bottom">
        <span className={`elev-badge elev-badge--${elevClass}`}>
          ⛰ {tm.elevation}m · {elevationTag(tm.elevation)}
        </span>
        <span className="fixture__rest">휴식 {tm.restDays}일</span>
        {tm.travelKm > 0 && (
          <span className="travel-badge">
            ✈ {tm.travelKm}km{tm.tzShiftHours !== 0 ? ` · 시차 ${Math.abs(tm.tzShiftHours)}h` : ""}
          </span>
        )}
        {statusNode}
      </div>
    </motion.button>
  );
}
