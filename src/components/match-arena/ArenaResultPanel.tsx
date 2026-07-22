import { motion } from "framer-motion";
import { topAssists, topScorers, type Leaderboard, type LeaderboardEntry } from "../../data/leaderboard";
import type { SimComparison, TeamStats } from "../../data/matchSim";

interface ResultSim {
  userGoals: number;
  oppGoals: number;
  comparison?: SimComparison;
  teamStats?: { user: TeamStats; opp: TeamStats };
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
  leaderboard,
  onInterimContinue,
  onReplay,
  onClose,
  onNext,
}: Props) {
  if (!final) {
    return (
      <motion.div className="sim-compare" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="sim-compare__row">
          <div className="sim-compare__col">
            <span className="sim-compare__label">{interimLabel}</span>
            <span className="sim-compare__val">{sim.userGoals} - {sim.oppGoals}</span>
          </div>
        </div>
        <p className="sim-compare__verdict">전술과 라인업을 조정할 수 있습니다.</p>
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
      <TournamentLeaders teamName={userTeamName} leaderboard={leaderboard} />
      <div className="sim-compare__actions">
        <button type="button" className="sim-btn sim-btn--ghost" onClick={onReplay}>다시 보기</button>
        <button type="button" className="sim-btn" onClick={onClose}>확인</button>
        {onNext && <button type="button" className="sim-btn sim-btn--accent" onClick={onNext}>다음 경기 →</button>}
      </div>
    </motion.div>
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
}: {
  label: string;
  userVal: number;
  oppVal: number;
  userSub?: string;
  oppSub?: string;
  suffix?: string;
}) {
  const total = Math.max(1, userVal + oppVal);
  const userPercent = Math.round((userVal / total) * 100);
  return (
    <div className="stat-bar">
      <div className="stat-bar__nums">
        <span className="stat-bar__val">{Math.round(userVal)}{suffix}{userSub && <span className="stat-bar__sub"> · {userSub}</span>}</span>
        <span className="stat-bar__label">{label}</span>
        <span className="stat-bar__val stat-bar__val--opp">{Math.round(oppVal)}{suffix}{oppSub && <span className="stat-bar__sub"> · {oppSub}</span>}</span>
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
