import { motion } from "framer-motion";
import type { Team } from "../data/types";

interface Props {
  teams: Team[];
  onPick: (teamId: number) => void;
}

const GROUP_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

export function CountrySelect({ teams, onPick }: Props) {
  return (
    <div className="country-select">
      <header className="country-select__header">
        <h1 className="country-select__title">내가 국가대표팀 감독이라면</h1>
        <p className="country-select__subtitle">
          감독이 될 국가를 선택하세요. 2026 월드컵 실제 대진을 따라 경기를 치르며,
          경기장 고도에 맞춰 포메이션과 전술을 짜게 됩니다.
        </p>
      </header>

      <div className="groups">
        {GROUP_LETTERS.map((letter) => {
          const group = teams
            .filter((t) => t.group_letter === letter)
            .sort((a, b) => a.fifa_ranking_pre_tournament - b.fifa_ranking_pre_tournament);
          if (group.length === 0) return null;
          return (
            <div key={letter} className="group-card">
              <h2 className="group-card__title">그룹 {letter}</h2>
              <div className="group-card__teams">
                {group.map((t) => (
                  <motion.button
                    key={t.team_id}
                    type="button"
                    className="team-chip"
                    onClick={() => onPick(t.team_id)}
                    whileHover={{ scale: 1.03, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <span className="team-chip__code">{t.fifa_code}</span>
                    <span className="team-chip__name">{t.team_name}</span>
                    <span className="team-chip__rank">#{t.fifa_ranking_pre_tournament}</span>
                  </motion.button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
