import { motion } from "framer-motion";
import type { Leaderboard } from "../../data/leaderboard";
import type { LiveMatchSnapshot, PlayerMatchStats, SimComparison, TeamStats } from "../../data/matchSim";
import type { TacticStyleKey } from "../../data/tactics";

interface ResultSim {
  userGoals: number;
  oppGoals: number;
  userXg?: number;
  oppXg?: number;
  comparison?: SimComparison;
  teamStats?: { user: TeamStats; opp: TeamStats };
  liveSnapshots?: LiveMatchSnapshot[];
  playerStats?: PlayerMatchStats[];
  wentToExtraTime?: boolean;
  penalties?: { userGoals: number; oppGoals: number; winner: "user" | "opp" } | null;
  regulationUserGoals?: number;
  regulationOppGoals?: number;
}

interface Props {
  sim: ResultSim;
  final: boolean;
  interimLabel: string;
  interimCta: string;
  userTeamName: string;
  oppTeamName: string;
  tacticStyleKey?: TacticStyleKey | null;
  leaderboard: Leaderboard;
  onInterimContinue?: () => void;
  onReplay: () => void;
  onClose: () => void;
  onSchedule?: () => void;
  onNext?: () => void;
}

export function ArenaResultPanel({
  sim,
  final,
  interimLabel,
  interimCta,
  userTeamName,
  oppTeamName,
  onInterimContinue,
  onReplay,
  onClose,
  onSchedule,
  onNext,
}: Props) {
  if (!final) {
    const snapshots = sim.liveSnapshots;
    const live = snapshots && snapshots.length ? snapshots[snapshots.length - 1] : null;
    return (
      <motion.div className="sim-compare" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="sim-compare__row">
          <div className="sim-compare__col">
            <span className="sim-compare__label">{interimLabel}</span>
            <span className="sim-compare__val">{sim.userGoals} - {sim.oppGoals}</span>
          </div>
        </div>
        <p className="sim-compare__verdict">전술과 라인업을 조정할 수 있습니다.</p>
        <div className="interim-columns">
          <div className="interim-columns__side">
            {sim.teamStats && <HalftimeStatsPanel teamStats={sim.teamStats} userXg={sim.userXg} oppXg={sim.oppXg} players={live?.players} />}
          </div>
          {/* 포메이션 편집(Pitch.tsx) 자리 — 2번 담당 영역, 3번은 비워둠 */}
          <div className="interim-columns__center" />
          <div className="interim-columns__side">
            {live && <LivePlayerConditionPanel players={live.players} />}
          </div>
        </div>
        <div className="sim-compare__actions">
          <button type="button" className="sim-btn" onClick={onInterimContinue ?? onClose}>{interimCta}</button>
        </div>
      </motion.div>
    );
  }

  const comparison = sim.comparison;
  const live = sim.liveSnapshots?.at(-1);
  const players = sim.playerStats?.length ? sim.playerStats : live?.players ?? [];
  const outcome = sim.userGoals > sim.oppGoals ? "승리" : sim.userGoals < sim.oppGoals ? "패배" : "무승부";
  return (
    <motion.div className="sim-compare sim-compare--final" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <section className="fulltime-outcome" data-result={outcome}>
        <div>
          <span className="fulltime-outcome__eyebrow">FULL TIME</span>
          <strong>{outcome}</strong>
          <p>{userTeamName}의 경기가 종료되었습니다.</p>
        </div>
        <div className="fulltime-outcome__meta">
          {sim.wentToExtraTime && (
            <span>
              90분 {sim.regulationUserGoals}-{sim.regulationOppGoals}
              {sim.penalties
                ? ` · 승부차기 ${sim.penalties.userGoals}-${sim.penalties.oppGoals}`
                : " · 연장전 종료"}
            </span>
          )}
          {comparison?.hasActual && (
            <span>실제 경기 결과 {comparison.actualUserGoals}-{comparison.actualOppGoals}</span>
          )}
          {!sim.wentToExtraTime && !comparison?.hasActual && (
            <span>90분 경기 종료</span>
          )}
        </div>
      </section>

      <div className="fulltime-grid" data-single={!players.length || undefined}>
        {sim.teamStats && (
          <FullTimeStatsPanel
            stats={sim.teamStats}
            userXg={sim.userXg ?? live?.userXg ?? 0}
            oppXg={sim.oppXg ?? live?.oppXg ?? 0}
            userTeamName={userTeamName}
            oppTeamName={oppTeamName}
          />
        )}
        {players.length > 0 && (
          <TopPerformersPanel
            players={players}
            userTeamName={userTeamName}
            oppTeamName={oppTeamName}
          />
        )}
      </div>

      <div className="sim-compare__actions fulltime-actions">
        <button type="button" className="sim-btn sim-btn--ghost" onClick={onReplay}>다시 보기</button>
        <button type="button" className="sim-btn sim-btn--ghost" onClick={onSchedule ?? onClose}>경기 일정으로</button>
        {onNext && <button type="button" className="sim-btn sim-btn--accent" onClick={onNext}>다음 경기 →</button>}
      </div>
    </motion.div>
  );
}
function FullTimeStatsPanel({
  stats,
  userXg,
  oppXg,
  userTeamName,
  oppTeamName,
}: {
  stats: { user: TeamStats; opp: TeamStats };
  userXg: number;
  oppXg: number;
  userTeamName: string;
  oppTeamName: string;
}) {
  return (
    <section className="fulltime-card fulltime-stats">
      <header className="fulltime-card__header">
        <div>
          <span>MATCH STATS</span>
          <h3>경기 통계</h3>
        </div>
        <div className="fulltime-stats__teams" aria-hidden="true">
          <strong>{userTeamName}</strong>
          <strong>{oppTeamName}</strong>
        </div>
      </header>
      <div className="fulltime-stats__body">
        <FullTimeStatRow label="점유율" user={`${stats.user.possession}%`} opp={`${stats.opp.possession}%`} />
        <FullTimeStatRow
          label="슈팅 · 유효슈팅"
          user={`${stats.user.shots} · ${stats.user.shotsOnTarget}`}
          opp={`${stats.opp.shots} · ${stats.opp.shotsOnTarget}`}
        />
        <FullTimeStatRow label="기대 득점 (xG)" user={userXg.toFixed(2)} opp={oppXg.toFixed(2)} />
        <FullTimeStatRow
          label="패스 성공"
          user={`${stats.user.passSuccessRate}% · ${stats.user.passesCompleted}/${stats.user.passesAttempted}`}
          opp={`${stats.opp.passSuccessRate}% · ${stats.opp.passesCompleted}/${stats.opp.passesAttempted}`}
        />
        <FullTimeStatRow
          label="볼 탈취"
          user={String(stats.user.tacklesWon + stats.user.interceptions)}
          opp={String(stats.opp.tacklesWon + stats.opp.interceptions)}
        />
        <FullTimeStatRow
          label="파울 · 카드"
          user={`${stats.user.fouls} · ${stats.user.yellowCards}/${stats.user.redCards}`}
          opp={`${stats.opp.fouls} · ${stats.opp.yellowCards}/${stats.opp.redCards}`}
        />
      </div>
    </section>
  );
}
function FullTimeStatRow({ label, user, opp }: { label: string; user: string; opp: string }) {
  return (
    <div className="fulltime-stat-row">
      <strong>{user}</strong>
      <span>{label}</span>
      <strong>{opp}</strong>
    </div>
  );
}

function TopPerformersPanel({
  players,
  userTeamName,
  oppTeamName,
}: {
  players: PlayerMatchStats[];
  userTeamName: string;
  oppTeamName: string;
}) {
  const ranked = [...players]
    .filter((player) => player.minutesPlayed > 0)
    .sort((a, b) =>
      b.rating - a.rating ||
      b.goals + b.assists - (a.goals + a.assists) ||
      b.minutesPlayed - a.minutesPlayed,
    )
    .slice(0, 4);
  const [best, ...rest] = ranked;
  if (!best) return null;

  return (
    <section className="fulltime-card fulltime-performers">
      <header className="fulltime-card__header">
        <div>
          <span>TOP PERFORMANCE</span>
          <h3>주요 선수</h3>
        </div>
      </header>
      <div className="fulltime-motm">
        <div>
          <span>MVP</span>
          <strong>{best.name}</strong>
          <small>{best.side === "user" ? userTeamName : oppTeamName} · {performanceSummary(best)}</small>
        </div>
        <b>{best.rating.toFixed(1)}</b>
      </div>
      <div className="fulltime-performers__list">
        {rest.map((player, index) => (
          <div className="fulltime-player-row" key={`${player.side}-${player.playerId}`}>
            <span>{index + 2}</span>
            <div>
              <strong>{player.name}</strong>
              <small>{player.side === "user" ? userTeamName : oppTeamName} · {performanceSummary(player)}</small>
            </div>
            <b>{player.rating.toFixed(1)}</b>
          </div>
        ))}
      </div>
    </section>
  );
}

function performanceSummary(player: PlayerMatchStats): string {
  const details: string[] = [];
  if (player.goals) details.push(`${player.goals}골`);
  if (player.assists) details.push(`${player.assists}도움`);
  if (!details.length && player.position === "GK") details.push(`${player.saves}선방`);
  if (!details.length && (player.tacklesWon || player.interceptions)) {
    details.push(`볼 탈취 ${player.tacklesWon + player.interceptions}`);
  }
  if (!details.length) details.push(`${player.position} · ${player.minutesPlayed}분`);
  return details.join(" · ");
}

function sumDistance(players: PlayerMatchStats[] | undefined, side: "user" | "opp"): number {
  if (!players) return 0;
  return players.filter((p) => p.side === side).reduce((sum, p) => sum + p.distanceKm, 0);
}

function HalftimeStatsPanel({
  teamStats,
  userXg,
  oppXg,
  players,
}: {
  teamStats: { user: TeamStats; opp: TeamStats };
  userXg?: number;
  oppXg?: number;
  players?: PlayerMatchStats[];
}) {
  return (
    <div className="team-stats">
      <h4 className="team-stats__title">경기 통계</h4>
      <TeamStatBar label="점유율" userVal={teamStats.user.possession} oppVal={teamStats.opp.possession} />
      <TeamStatBar
        label="슈팅 (유효)"
        userVal={teamStats.user.shots}
        oppVal={teamStats.opp.shots}
        userSub={`${teamStats.user.shotsOnTarget} 유효`}
        oppSub={`${teamStats.opp.shotsOnTarget} 유효`}
        suffix=""
      />
      <TeamStatBar label="기대 득점 (xG)" userVal={userXg ?? 0} oppVal={oppXg ?? 0} suffix="" decimals={2} />
      <TeamStatBar label="패스 성공률" userVal={teamStats.user.passSuccessRate} oppVal={teamStats.opp.passSuccessRate} />
      <TeamStatBar label="활동량" userVal={sumDistance(players, "user")} oppVal={sumDistance(players, "opp")} suffix="km" decimals={1} />
    </div>
  );
}

function LivePlayerConditionPanel({ players }: { players: PlayerMatchStats[] }) {
  const userPlayers = players.filter((p) => p.side === "user");
  if (!userPlayers.length) return null;
  return (
    <div className="player-condition">
      <h4 className="player-condition__title">선수 상태 및 평점</h4>
      <div className="player-condition__list">
        {userPlayers.map((player) => (
          <PlayerConditionRow key={player.name} player={player} />
        ))}
      </div>
    </div>
  );
}

function PlayerConditionRow({ player }: { player: PlayerMatchStats }) {
  const atRisk = player.condition < 50;
  const ratingPercent = Math.max(0, Math.min(100, ((player.rating - 4) / 6) * 100));
  return (
    <div className="player-condition__row" data-risk={atRisk || undefined}>
      <span className="player-condition__name">
        {player.name}
        <small>{player.position}</small>
      </span>
      <div className="player-condition__rating">
        <span>{player.rating.toFixed(1)}</span>
        <div className="player-condition__track"><div className="player-condition__fill" style={{ width: `${ratingPercent}%` }} /></div>
      </div>
      {atRisk && <span className="player-condition__warn" title="체력 저하 위험">⚠</span>}
    </div>
  );
}

function TeamStatBar({
  label,
  userVal,
  oppVal,
  userSub,
  oppSub,
  suffix = "%",
  decimals = 0,
}: {
  label: string;
  userVal: number;
  oppVal: number;
  userSub?: string;
  oppSub?: string;
  suffix?: string;
  decimals?: number;
}) {
  const total = Math.max(1, userVal + oppVal);
  const userPercent = Math.round((userVal / total) * 100);
  const fmt = (v: number) => (decimals > 0 ? v.toFixed(decimals) : Math.round(v));
  return (
    <div className="stat-bar">
      <div className="stat-bar__nums">
        <span className="stat-bar__val">{fmt(userVal)}{suffix}{userSub && <span className="stat-bar__sub"> · {userSub}</span>}</span>
        <span className="stat-bar__label">{label}</span>
        <span className="stat-bar__val stat-bar__val--opp">{fmt(oppVal)}{suffix}{oppSub && <span className="stat-bar__sub"> · {oppSub}</span>}</span>
      </div>
      <div className="stat-bar__track"><div className="stat-bar__fill" style={{ width: `${userPercent}%` }} /></div>
    </div>
  );
}

