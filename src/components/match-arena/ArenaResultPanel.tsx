import { motion } from "framer-motion";
import { topAssists, topScorers, type Leaderboard, type LeaderboardEntry } from "../../data/leaderboard";
import type { LiveMatchSnapshot, PlayerMatchStats, SimComparison, TeamStats } from "../../data/matchSim";
import { generateTacticAnalysis, type TacticStyleKey } from "../../data/tactics";

interface ResultSim {
  userGoals: number;
  oppGoals: number;
  userXg?: number;
  oppXg?: number;
  comparison?: SimComparison;
  teamStats?: { user: TeamStats; opp: TeamStats };
  liveSnapshots?: LiveMatchSnapshot[];
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
  onNext?: () => void;
}

export function ArenaResultPanel({
  sim,
  final,
  interimLabel,
  interimCta,
  userTeamName,
  oppTeamName,
  tacticStyleKey,
  leaderboard,
  onInterimContinue,
  onReplay,
  onClose,
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
  return (
    <motion.div className="sim-compare sim-compare--final" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      {sim.wentToExtraTime && (
        <p className="sim-compare__et">
          90분 {sim.regulationUserGoals}-{sim.regulationOppGoals} → 연장 {sim.userGoals}-{sim.oppGoals}
          {sim.penalties && ` → 승부차기 ${sim.penalties.userGoals}-${sim.penalties.oppGoals} (${sim.penalties.winner === "user" ? userTeamName : oppTeamName} 승)`}
        </p>
      )}
      <div className="sim-compare__row">
        <div className="sim-compare__col">
          <span className="sim-compare__label">내 전술 결과</span>
          <span className="sim-compare__val">{sim.userGoals} - {sim.oppGoals}</span>
        </div>
        {comparison?.hasActual && (
          <div className="sim-compare__col">
            <span className="sim-compare__label">실제 결과</span>
            <span className="sim-compare__val">{comparison.actualUserGoals} - {comparison.actualOppGoals}</span>
          </div>
        )}
      </div>
      {comparison && (
        <>
          <p className="sim-compare__verdict">{comparison.verdict}</p>
          <p className="sim-compare__tactics">🧩 {comparison.tacticsNote}</p>
        </>
      )}
      {sim.teamStats && <TeamStatsPanel stats={sim.teamStats} />}
      {sim.teamStats && <TacticAnalysisPanel tacticStyleKey={tacticStyleKey} stats={sim.teamStats.user} />}
      <TournamentLeaders teamName={userTeamName} leaderboard={leaderboard} />
      <div className="sim-compare__actions">
        <button type="button" className="sim-btn sim-btn--ghost" onClick={onReplay}>다시 보기</button>
        <button type="button" className="sim-btn" onClick={onClose}>확인</button>
        {onNext && <button type="button" className="sim-btn sim-btn--accent" onClick={onNext}>다음 경기 →</button>}
      </div>
    </motion.div>
  );
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

function TacticAnalysisPanel({ tacticStyleKey, stats }: { tacticStyleKey?: TacticStyleKey | null; stats: TeamStats }) {
  const lines = generateTacticAnalysis(tacticStyleKey, stats);
  if (!lines.length) return null;
  return (
    <div className="tactic-analysis">
      <h4 className="tactic-analysis__title">🤖 AI 전술 분석</h4>
      <ul className="tactic-analysis__list">
        {lines.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

function TeamStatsPanel({ stats }: { stats: { user: TeamStats; opp: TeamStats } }) {
  return (
    <div className="team-stats">
      <h4 className="team-stats__title">팀 스탯</h4>
      <TeamStatBar label="점유율" userVal={stats.user.possession} oppVal={stats.opp.possession} />
      <TeamStatBar
        label="패스 성공률"
        userVal={stats.user.passSuccessRate}
        oppVal={stats.opp.passSuccessRate}
        userSub={`${stats.user.passesCompleted}/${stats.user.passesAttempted}`}
        oppSub={`${stats.opp.passesCompleted}/${stats.opp.passesAttempted}`}
      />
      <TeamStatBar
        label="GK 선방률"
        userVal={stats.user.saveRate}
        oppVal={stats.opp.saveRate}
        userSub={`${stats.user.saves}/${stats.user.shotsFaced} 선방`}
        oppSub={`${stats.opp.saves}/${stats.opp.shotsFaced} 선방`}
      />
      <TeamStatBar
        label="슈팅"
        userVal={stats.user.shots}
        oppVal={stats.opp.shots}
        userSub={`${stats.user.shotsOnTarget} 유효`}
        oppSub={`${stats.opp.shotsOnTarget} 유효`}
        suffix=""
      />
    </div>
  );
}

function TournamentLeaders({ teamName, leaderboard }: { teamName: string; leaderboard: Leaderboard }) {
  return (
    <div className="leaderboard">
      <h4 className="leaderboard__title">🏆 대회 누적 순위 — {teamName}</h4>
      <div className="leaderboard__cols">
        <LeaderboardCol title="⚽ 득점왕" rows={topScorers(leaderboard)} field="goals" />
        <LeaderboardCol title="🎯 어시스트왕" rows={topAssists(leaderboard)} field="assists" />
      </div>
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

function LeaderboardCol({ title, rows, field }: { title: string; rows: LeaderboardEntry[]; field: "goals" | "assists" }) {
  return (
    <div className="leaderboard__col">
      <h5 className="leaderboard__col-title">{title}</h5>
      {rows.length === 0 ? <p className="leaderboard__empty">아직 기록 없음</p> : (
        <ol className="leaderboard__list">
          {rows.map((row, index) => (
            <li key={`${row.name}-${index}`} className="leaderboard__row">
              <span className="leaderboard__rank">{index + 1}</span>
              <span className="leaderboard__name">{row.name}</span>
              <span className="leaderboard__count">{row[field]}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
