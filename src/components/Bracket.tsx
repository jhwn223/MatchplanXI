import { useState, type CSSProperties } from "react";
import { motion } from "framer-motion";
import type { Team, TournamentData } from "../data/types";
import {
  allGroupStandingsFull,
  buildBracket,
  buildTournamentLeaderboard,
  champion,
  getQualifiers,
  nextUserKOMatch,
  KO_ROUND_KO,
  teamTournamentRecord,
  type KOMatch,
  type KOResults,
  type KOTeam,
  type TeamTournamentRecord,
  type TournamentLeader,
} from "../data/tournamentEngine";
import type { PlayedMap } from "../data/tournament";
import type { Leaderboard } from "../data/leaderboard";
import { PlayerAvatar } from "./player-photo/PlayerPhoto";
import { getPlayerPhoto, getPlayerPhotoUrl } from "./player-photo/playerPhotoData";
import { AppTopbar } from "./AppTopbar";
import { TeamFlag } from "./TeamFlag";

interface Props {
  data: TournamentData;
  team: Team;
  played: PlayedMap;
  koResults: KOResults;
  tournamentSeed: number;
  leaderboard?: Leaderboard;
  onBack: () => void;
  onPlayKO: (m: KOMatch) => void;
  onRestart?: () => void;
}

export function Bracket({ data, team, played, koResults, tournamentSeed, leaderboard = {}, onBack, onPlayKO, onRestart }: Props) {
  const [showBracket, setShowBracket] = useState(false);
  const standings = allGroupStandingsFull(data, played, tournamentSeed);
  const qualifiers = getQualifiers(data, standings);
  const userQualified = qualifiers.some((q) => q.name === team.team_name);
  const rounds = buildBracket(data, qualifiers, koResults, team.team_name, tournamentSeed);
  const nextMatch = nextUserKOMatch(rounds, team.team_name);
  const champ = champion(rounds);
  const finalMatch = rounds[4]?.find((match) => match.placement === "final") ?? null;
  const thirdPlaceMatch = rounds[4]?.find((match) => match.placement === "third") ?? null;
  // 32강~4강만 좌/우로 쪼갠다 — 결승(rounds[4])은 가운데 별도 컬럼에서 그린다.
  const bracketRounds = rounds.slice(0, 4);
  const leftHalf = bracketRounds.map((round) => round.slice(0, Math.ceil(round.length / 2)));
  const rightHalf = bracketRounds.map((round) => round.slice(Math.ceil(round.length / 2))).reverse();
  const rightRoundLabels = KO_ROUND_KO.slice(0, 4).reverse();
  const thirdPlace = thirdPlaceMatch?.winner ?? null;
  const tournamentComplete = Boolean(champ && finalMatch?.played && thirdPlaceMatch?.played);
  const runnerUp =
    champ && finalMatch ? (finalMatch.a?.name === champ.name ? finalMatch.b : finalMatch.a) : null;
  const awards = tournamentComplete
    ? buildTournamentLeaderboard(data, played, rounds, team.team_name, leaderboard)
    : null;
  const topScorers = awards?.topScorers.slice(0, 3) ?? [];
  const topAssists = awards?.topAssists.slice(0, 3) ?? [];
  const topGoalkeepers = awards?.topGoalkeepers.slice(0, 3) ?? [];
  const champRecord = champ ? teamTournamentRecord(standings, rounds, champ.name) : null;
  const runnerUpRecord = runnerUp ? teamTournamentRecord(standings, rounds, runnerUp.name) : null;
  const thirdPlaceRecord = thirdPlace ? teamTournamentRecord(standings, rounds, thirdPlace.name) : null;

  const userAlive =
    userQualified &&
    rounds.some((r) => r.some((m) => m.isUser && (!m.played || m.winner?.name === team.team_name)));
  const userOut =
    userQualified &&
    rounds.some((r) => r.some((m) => m.isUser && m.played && m.winner && m.winner.name !== team.team_name));

  let banner: { text: string; tone: string };
  if (nextMatch) {
    const opp = nextMatch.a?.name === team.team_name ? nextMatch.b : nextMatch.a;
    const roundLabel = nextMatch.placement === "third"
      ? "3위 결정전"
      : KO_ROUND_KO[nextMatch.round];
    banner = {
      text: `▶ 다음 경기: ${roundLabel} vs ${opp?.name} (⛰ ${nextMatch.venue.elevation_meters}m)`,
      tone: "good",
    };
  } else if (tournamentComplete && champ) {
    banner = {
      text: champ.name === team.team_name ? `🏆 우승! ${team.team_name}가 월드컵을 들어올렸습니다!` : `🏆 우승: ${champ.name}`,
      tone: champ.name === team.team_name ? "good" : "neutral",
    };
  } else if (!userQualified) {
    banner = { text: "조별리그 탈락 — 대회는 다른 팀들로 계속 진행됩니다.", tone: "bad" };
  } else if (userOut && !userAlive) {
    banner = { text: `${team.team_name} 토너먼트 탈락. 남은 대회는 시뮬레이션으로 진행됩니다.`, tone: "bad" };
  } else {
    banner = { text: "토너먼트 진행 중…", tone: "neutral" };
  }

  if (tournamentComplete && champ && !showBracket) {
    return (
      <FinalResults
        teamCode={team.fifa_code}
        champ={champ}
        runnerUp={runnerUp}
        thirdPlace={thirdPlace}
        champRecord={champRecord}
        runnerUpRecord={runnerUpRecord}
        thirdPlaceRecord={thirdPlaceRecord}
        finalMatch={finalMatch}
        topScorers={topScorers}
        topAssists={topAssists}
        topGoalkeepers={topGoalkeepers}
        onShowBracket={() => setShowBracket(true)}
        onBack={onBack}
        onRestart={onRestart}
      />
    );
  }

  return (
    <div className="bracket-view">
      <AppTopbar active="standings" teamCode={team.fifa_code} onBrandClick={onBack} />
      <header className="hub__header">
        <button type="button" className="btn-back" onClick={champ ? () => setShowBracket(false) : onBack}>
          {champ ? "← 최종 결과" : "← 일정"}
        </button>
        <div className="hub__title-block">
          <span className="hub__code">
            <TeamFlag fifaCode={team.fifa_code} className="hub__flag" />
            <small>{team.fifa_code}</small>
          </span>
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
          {/* Both halves of the draw read outward-in toward the final, like a
           *  real bracket sheet, instead of one long 32강→결승 line. Round `r`
           *  match `m` is fed by round `r-1` matches `2m`/`2m+1` (see
           *  buildBracket), so splitting each round's array at its midpoint by
           *  index is already exactly the left/right half of the draw. */}
          {leftHalf.map((round, ri) => (
            <div className="bracket-col" key={`l-${ri}`}>
              <div className="bracket-col__title">{KO_ROUND_KO[ri]}</div>
              <div className="bracket-col__matches">
                <BracketConnectors count={round.length} attach="right" />
                {round.map((m) => (
                  <MatchCell key={m.id} m={m} teamName={team.team_name} />
                ))}
              </div>
            </div>
          ))}
          <div className="bracket-col bracket-col--final" key="final">
            <div className="bracket-col__title">{KO_ROUND_KO[4]}</div>
            <div className="bracket-col__matches bracket-col__matches--final">
              {finalMatch && <MatchCell key={finalMatch.id} m={finalMatch} teamName={team.team_name} />}
            </div>
          </div>
          {rightHalf.map((round, ri) => (
            <div className="bracket-col" key={`r-${ri}`}>
              <div className="bracket-col__title">{rightRoundLabels[ri]}</div>
              <div className="bracket-col__matches">
                <BracketConnectors count={round.length} attach="left" />
                {round.map((m) => (
                  <MatchCell key={m.id} m={m} teamName={team.team_name} />
                ))}
              </div>
            </div>
          ))}
        </div>
        {thirdPlaceMatch && (
          <div className="bracket-bronze">
            <MatchCell key={thirdPlaceMatch.id} m={thirdPlaceMatch} teamName={team.team_name} />
          </div>
        )}
      </div>
    </div>
  );
}

const CONNECTOR_STUB = 6; // px — half the .bracket-grid column gap, so the two stubs meet exactly mid-gap

/** Draws the tree lines between one round's matches and the next round's
 *  column: a short stub into each match, a vertical bar joining each pair,
 *  and a stub continuing out toward the next column's matching midpoint. */
function BracketConnectors({ count, attach }: { count: number; attach: "left" | "right" }) {
  if (count < 2) return null;
  const centers = Array.from({ length: count }, (_, i) => ((i + 0.5) / count) * 100);
  const pairs: { top: number; height: number; mid: number }[] = [];
  for (let i = 0; i + 1 < count; i += 2) {
    const top = Math.min(centers[i], centers[i + 1]);
    const height = Math.abs(centers[i + 1] - centers[i]);
    pairs.push({ top, height, mid: top + height / 2 });
  }

  const flushStyle = (top: number): CSSProperties =>
    attach === "right"
      ? { top: `${top}%`, right: 0, width: CONNECTOR_STUB }
      : { top: `${top}%`, left: 0, width: CONNECTOR_STUB };
  const outStyle = (top: number): CSSProperties =>
    attach === "right"
      ? { top: `${top}%`, right: -CONNECTOR_STUB, width: CONNECTOR_STUB }
      : { top: `${top}%`, left: -CONNECTOR_STUB, width: CONNECTOR_STUB };
  const barStyle = (top: number, height: number): CSSProperties =>
    attach === "right"
      ? { top: `${top}%`, height: `${height}%`, right: -CONNECTOR_STUB }
      : { top: `${top}%`, height: `${height}%`, left: -CONNECTOR_STUB };

  return (
    <div className="bracket-connectors" aria-hidden="true">
      {centers.map((top, i) => (
        <span key={`in-${i}`} className="bracket-connectors__stub" style={flushStyle(top)} />
      ))}
      {pairs.map((p, i) => (
        <span key={`bar-${i}`} className="bracket-connectors__bar" style={barStyle(p.top, p.height)} />
      ))}
      {pairs.map((p, i) => (
        <span key={`out-${i}`} className="bracket-connectors__stub" style={outStyle(p.mid)} />
      ))}
    </div>
  );
}

function teamLabel(t: KOTeam | null): string {
  return t ? `${t.code}` : "-";
}

function recordLine(r: TeamTournamentRecord | null): string | null {
  if (!r) return null;
  return `${r.played}경기 ${r.won}승 ${r.drawn}무${r.lost > 0 ? ` ${r.lost}패` : ""}`;
}

function FinalResults({
  teamCode,
  champ,
  runnerUp,
  thirdPlace,
  champRecord,
  runnerUpRecord,
  thirdPlaceRecord,
  finalMatch,
  topScorers,
  topAssists,
  topGoalkeepers,
  onShowBracket,
  onBack,
  onRestart,
}: {
  teamCode: string;
  champ: KOTeam;
  runnerUp: KOTeam | null;
  thirdPlace: KOTeam | null;
  champRecord: TeamTournamentRecord | null;
  runnerUpRecord: TeamTournamentRecord | null;
  thirdPlaceRecord: TeamTournamentRecord | null;
  finalMatch: KOMatch | null;
  topScorers: TournamentLeader[];
  topAssists: TournamentLeader[];
  topGoalkeepers: TournamentLeader[];
  onShowBracket: () => void;
  onBack: () => void;
  onRestart?: () => void;
}) {
  const finalScoreLine =
    finalMatch && finalMatch.aGoals != null && finalMatch.bGoals != null
      ? `결승 ${Math.max(finalMatch.aGoals, finalMatch.bGoals)} - ${Math.min(finalMatch.aGoals, finalMatch.bGoals)}${finalMatch.pens ? " (승부차기)" : ""}`
      : null;

  return (
    <div className="bracket-view final-results">
      <AppTopbar active="standings" teamCode={teamCode} onBrandClick={onBack} />
      <span className="final-results__pill">★ 대회 종료</span>
      <header className="hub__header final-results__header">
        <div className="hub__title-block">
          <div>
            <h1 className="hub__title">🏆 2026 월드컵 최종 결과</h1>
            <p className="hub__meta">토너먼트가 모두 끝났습니다. 최종 순위를 확인하세요.</p>
          </div>
        </div>
      </header>

      <div className="podium">
        <PodiumCard place={2} label="RUNNER-UP" code={runnerUp?.code ?? "-"} name={runnerUp?.name ?? "-"} record={recordLine(runnerUpRecord)} />
        <PodiumCard place={1} label="CHAMPION" code={champ.code} name={champ.name} highlight subtitle={finalScoreLine} record={recordLine(champRecord)} />
        <PodiumCard place={3} label="THIRD PLACE" code={thirdPlace?.code ?? "-"} name={thirdPlace?.name ?? "-"} record={recordLine(thirdPlaceRecord)} />
      </div>

      {(topScorers.length > 0 || topAssists.length > 0 || topGoalkeepers.length > 0) && (
        <section className="awards">
          <h2 className="hub__section-title">🏅 대회 개인상</h2>
          <div className="awards__grid">
            {topScorers.length > 0 && (
              <AwardCard
                label="GOLDEN BOOT"
                title="대회 득점 Top 3"
                icon="⚽"
                players={topScorers}
                unit="GOALS"
                value={(p) => p.goals}
              />
            )}
            {topAssists.length > 0 && (
              <AwardCard
                label="PLAYMAKER AWARD"
                title="대회 어시스트 Top 3"
                icon="🎯"
                players={topAssists}
                unit="ASSISTS"
                value={(p) => p.assists}
              />
            )}
            {topGoalkeepers.length > 0 && (
              <AwardCard
                label="GOLDEN GLOVE"
                title="최소 실점 골키퍼 Top 3"
                icon="🧤"
                players={topGoalkeepers}
                unit="GOALS ALLOWED"
                value={(player) => player.goalsConceded}
              />
            )}
          </div>
        </section>
      )}

      <p className="final-results__note">📌 이번 대회의 결과는 자동으로 저장되었습니다.</p>

      <div className="final-results__actions">
        <button type="button" className="btn-back" onClick={onShowBracket}>
          🗂 전체 대진표 보기
        </button>
        {onRestart && (
          <button type="button" className="tournament-btn" onClick={onRestart}>
            🔄 새 대회 시작
          </button>
        )}
      </div>
    </div>
  );
}

const MEDAL_EMOJI: Record<1 | 2 | 3, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function PodiumCard({
  place,
  label,
  code,
  name,
  highlight,
  subtitle,
  record,
}: {
  place: 1 | 2 | 3;
  label: string;
  code: string;
  name: string;
  highlight?: boolean;
  subtitle?: string | null;
  record?: string | null;
}) {
  return (
    <div className={`podium-card podium-card--${place}`} data-highlight={highlight || undefined}>
      {highlight && <span className="podium-card__badge">{label}</span>}
      <div className="podium-card__flag">
        <TeamFlag fifaCode={code} className="podium-card__flag-image" />
        <span>{code}</span>
      </div>
      <div className="podium-card__name">{name}</div>
      {!highlight && <span className="podium-card__label">{label}</span>}
      {subtitle && <p className="podium-card__subtitle">{subtitle}</p>}
      {record && <p className="podium-card__record">{record}</p>}
      <div className="podium-card__rank">
        <span className="podium-card__medal" aria-hidden="true">{MEDAL_EMOJI[place]}</span>
        {place}위
      </div>
    </div>
  );
}

function AwardCard({
  label,
  title,
  icon,
  players,
  unit,
  value,
}: {
  label: string;
  title: string;
  icon: string;
  players: TournamentLeader[];
  unit: string;
  value: (p: TournamentLeader) => number;
}) {
  return (
    <div className="award-card">
      <div className="award-card__head">
        <span className="award-card__label">{label}</span>
        <span className="award-card__icon">{icon}</span>
      </div>
      <p className="award-card__title">{title}</p>
      <ol className="award-card__list">
        {players.map((p, i) => (
          <li className="award-card__row" key={p.playerId}>
            <span className="award-card__rank">{i + 1}</span>
            <AwardAvatar playerId={p.playerId} name={p.name} />
            <div className="award-card__person-info">
              <div className="award-card__name">{p.name}</div>
              <p className="award-card__team">{p.teamName}</p>
            </div>
            <div className="award-card__stat">
              <strong>{value(p)}</strong>
              <span>{unit}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Real (licensed, attributed) player photo when we have one for this player,
 *  falling back to an initials badge otherwise — same fallback contract as
 *  the shared PlayerPhoto component, just without requiring a full Player. */
function AwardAvatar({ playerId, name }: { playerId: number; name: string }) {
  const [failed, setFailed] = useState(false);
  const photo = getPlayerPhoto(playerId);

  if (!photo || failed) {
    return <PlayerAvatar name={name} className="award-card__avatar" />;
  }

  return (
    <img
      className="award-card__avatar award-card__avatar--photo"
      src={getPlayerPhotoUrl(photo)}
      alt={`${name} 선수 사진`}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

function MatchCell({ m, teamName }: { m: KOMatch; teamName: string }) {
  const aWin = m.winner && m.a && m.winner.name === m.a.name;
  const bWin = m.winner && m.b && m.winner.name === m.b.name;
  const aMe = m.a?.name === teamName;
  const bMe = m.b?.name === teamName;
  return (
    <div className="ko-cell" data-user={m.isUser || undefined} data-pending={m.a && m.b && !m.played ? true : undefined}>
      {m.placement === "third" && <span className="ko-placement">3위 결정전</span>}
      <div className="ko-row" data-win={aWin || undefined} data-me={aMe || undefined}>
        <span className="ko-team">
          {m.a && <TeamFlag fifaCode={m.a.code} className="ko-team__flag" />}
          {teamLabel(m.a)}
          {m.pens && aWin && <span className="ko-pens">PK</span>}
        </span>
        <span className="ko-score">{m.aGoals ?? ""}</span>
      </div>
      <div className="ko-row" data-win={bWin || undefined} data-me={bMe || undefined}>
        <span className="ko-team">
          {m.b && <TeamFlag fifaCode={m.b.code} className="ko-team__flag" />}
          {teamLabel(m.b)}
          {m.pens && bWin && <span className="ko-pens">PK</span>}
        </span>
        <span className="ko-score">{m.bGoals ?? ""}</span>
      </div>
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
      <div className="next-match__stage">
        {m.placement === "third" ? "3위 결정전" : KO_ROUND_KO[m.round]}
      </div>
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
