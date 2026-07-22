import { motion } from "framer-motion";
import type { Team, TournamentData } from "../data/types";
import {
  allGroupStandings,
  buildBracket,
  champion,
  getQualifiers,
  nextUserKOMatch,
  KO_ROUND_KO,
  type KOMatch,
  type KOResults,
  type KOTeam,
} from "../data/tournamentEngine";
import type { PlayedMap } from "../data/tournament";
import { AppTopbar } from "./AppTopbar";

interface Props {
  data: TournamentData;
  team: Team;
  played: PlayedMap;
  koResults: KOResults;
  onBack: () => void;
  onPlayKO: (m: KOMatch) => void;
}

export function Bracket({ data, team, played, koResults, onBack, onPlayKO }: Props) {
  const standings = allGroupStandings(data, played);
  const qualifiers = getQualifiers(data, standings);
  const userQualified = qualifiers.some((q) => q.name === team.team_name);
  const rounds = buildBracket(data, qualifiers, koResults, team.team_name);
  const nextMatch = nextUserKOMatch(rounds, team.team_name);
  const champ = champion(rounds);

  const userAlive =
    userQualified &&
    rounds.some((r) => r.some((m) => m.isUser && (!m.played || m.winner?.name === team.team_name)));
  const userOut =
    userQualified &&
    rounds.some((r) => r.some((m) => m.isUser && m.played && m.winner && m.winner.name !== team.team_name));

  let banner: { text: string; tone: string };
  if (champ) {
    banner = {
      text: champ.name === team.team_name ? `🏆 우승! ${team.team_name}가 월드컵을 들어올렸습니다!` : `🏆 우승: ${champ.name}`,
      tone: champ.name === team.team_name ? "good" : "neutral",
    };
  } else if (!userQualified) {
    banner = { text: "조별리그 탈락 — 대회는 다른 팀들로 계속 진행됩니다.", tone: "bad" };
  } else if (userOut && !userAlive) {
    banner = { text: `${team.team_name} 토너먼트 탈락. 남은 대회는 시뮬레이션으로 진행됩니다.`, tone: "bad" };
  } else if (nextMatch) {
    const opp = nextMatch.a?.name === team.team_name ? nextMatch.b : nextMatch.a;
    banner = { text: `▶ 다음 경기: ${KO_ROUND_KO[nextMatch.round]} vs ${opp?.name} (⛰ ${nextMatch.venue.elevation_meters}m)`, tone: "good" };
  } else {
    banner = { text: "토너먼트 진행 중…", tone: "neutral" };
  }

  return (
    <div className="bracket-view">
      <AppTopbar active="standings" teamCode={team.fifa_code} onBrandClick={onBack} />
      <header className="hub__header">
        <button type="button" className="btn-back" onClick={onBack}>
          ← 일정
        </button>
        <div className="hub__title-block">
          <span className="hub__code">{team.fifa_code}</span>
          <div>
            <h1 className="hub__title">토너먼트 대진표</h1>
            <p className="hub__meta">32강 · 다른 조 경기는 전력(Elo) 기반 시뮬레이션으로 채워집니다</p>
          </div>
        </div>
      </header>

      <div className={`hub__banner hub__banner--${banner.tone}`}>{banner.text}</div>

      {nextMatch && (
        <div className="bracket-cta">
          <NextMatchCard m={nextMatch} teamName={team.team_name} onPlay={() => onPlayKO(nextMatch)} />
        </div>
      )}

      <div className="bracket-scroll">
        <div className="bracket-grid">
          {rounds.map((round, ri) => (
            <div className="bracket-col" key={ri}>
              <div className="bracket-col__title">{KO_ROUND_KO[ri]}</div>
              <div className="bracket-col__matches">
                {round.map((m) => (
                  <MatchCell key={m.id} m={m} teamName={team.team_name} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function teamLabel(t: KOTeam | null): string {
  return t ? `${t.code}` : "-";
}

function MatchCell({ m, teamName }: { m: KOMatch; teamName: string }) {
  const aWin = m.winner && m.a && m.winner.name === m.a.name;
  const bWin = m.winner && m.b && m.winner.name === m.b.name;
  const aMe = m.a?.name === teamName;
  const bMe = m.b?.name === teamName;
  return (
    <div className="ko-cell" data-user={m.isUser || undefined} data-pending={m.a && m.b && !m.played ? true : undefined}>
      <div className="ko-row" data-win={aWin || undefined} data-me={aMe || undefined}>
        <span className="ko-team">{teamLabel(m.a)}</span>
        <span className="ko-score">{m.aGoals ?? ""}</span>
      </div>
      <div className="ko-row" data-win={bWin || undefined} data-me={bMe || undefined}>
        <span className="ko-team">{teamLabel(m.b)}</span>
        <span className="ko-score">{m.bGoals ?? ""}</span>
      </div>
      {m.pens && <span className="ko-pens">PK</span>}
    </div>
  );
}

function NextMatchCard({ m, teamName, onPlay }: { m: KOMatch; teamName: string; onPlay: () => void }) {
  const opp = m.a?.name === teamName ? m.b : m.a;
  const elevClass = m.venue.elevation_meters >= 2000 ? "high" : m.venue.elevation_meters >= 1000 ? "mid" : "low";
  return (
    <motion.button
      type="button"
      className="next-match"
      onClick={onPlay}
      whileHover={{ scale: 1.01, y: -2 }}
      whileTap={{ scale: 0.99 }}
    >
      <div className="next-match__stage">{KO_ROUND_KO[m.round]}</div>
      <div className="next-match__teams">
        {teamName} <span className="board__vs">vs</span> {opp?.name}
      </div>
      <div className="next-match__venue">
        {m.venue.stadium_name.replace(/\s*\(.*\)/, "")} · {m.venue.city}
      </div>
      <div className="next-match__bottom">
        <span className={`elev-badge elev-badge--${elevClass}`}>⛰ {m.venue.elevation_meters}m</span>
        <span className="next-match__go">전술 짜고 경기하기 →</span>
      </div>
    </motion.button>
  );
}
