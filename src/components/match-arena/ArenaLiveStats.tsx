import type { LiveMatchSnapshot } from "../../data/matchSim";

interface Props {
  live: LiveMatchSnapshot | null;
  userXg: number;
  oppXg: number;
}

/**
 * The full match statistics table. Shown live in the arena sidebar and again
 * in the paused match centre, so both read from one place.
 */
export function ArenaLiveStats({ live, userXg, oppXg }: Props) {
  const user = live?.teamStats.user;
  const opp = live?.teamStats.opp;
  const rows: Array<[string, number, number, string]> = [
    ["점유율", user?.possession ?? 50, opp?.possession ?? 50, "%"],
    ["슈팅", user?.shots ?? 0, opp?.shots ?? 0, ""],
    ["유효 슈팅", user?.shotsOnTarget ?? 0, opp?.shotsOnTarget ?? 0, ""],
    ["기대 득점", userXg, oppXg, ""],
    ["패스 성공", user?.passSuccessRate ?? 0, opp?.passSuccessRate ?? 0, "%"],
    ["볼 회수", (user?.tacklesWon ?? 0) + (user?.interceptions ?? 0), (opp?.tacklesWon ?? 0) + (opp?.interceptions ?? 0), ""],
    ["파울", user?.fouls ?? 0, opp?.fouls ?? 0, ""],
    ["경고", user?.yellowCards ?? 0, opp?.yellowCards ?? 0, ""],
    ["코너킥", user?.corners ?? 0, opp?.corners ?? 0, ""],
    ["오프사이드", user?.offsides ?? 0, opp?.offsides ?? 0, ""],
  ];
  return (
    <div className="match-stat-rows">
      {rows.map(([label, home, away, suffix]) => (
        <div key={label}>
          <strong>{Number.isInteger(home) ? home : home.toFixed(2)}{suffix}</strong>
          <span>{label}</span>
          <strong>{Number.isInteger(away) ? away : away.toFixed(2)}{suffix}</strong>
        </div>
      ))}
    </div>
  );
}
