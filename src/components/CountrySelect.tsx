import { motion } from "framer-motion";
import type { Team } from "../data/types";
import { AppTopbar } from "./AppTopbar";
import { TeamFlag } from "./TeamFlag";

interface Props {
  teams: Team[];
  onPick: (teamId: number) => void;
}

const GROUP_LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

export function CountrySelect({ teams, onPick }: Props) {
  return (
    <div className="country-select">
      <AppTopbar active="squad" />
      <header className="country-select__header">
        <div className="country-select__hero-copy">
          <span className="country-select__eyebrow">2026 WORLD CUP TACTICAL SIMULATION</span>
          <h1 className="country-select__title">고도를 읽고,<br />경기를 설계하세요.</h1>
          <p className="country-select__kicker">
            고도와 체력, 이동 거리를 분석해 월드컵의 흐름을 바꾸는 전술 시뮬레이터
          </p>
          <p className="country-select__subtitle">
            한 국가의 감독이 되어 실제 대진을 따라가세요. 선수 능력과 컨디션을 비교하고,
            경기장 환경에 맞는 선발과 포메이션을 결정합니다.
          </p>
          <div className="country-select__metrics" aria-label="대회 데이터 요약">
            <div><strong>48</strong><span>국가</span></div>
            <div><strong>1,248</strong><span>선수</span></div>
            <div><strong>104</strong><span>경기</span></div>
          </div>
        </div>
        <div className="country-select__hero-visual" aria-hidden="true">
          <div className="altitude-orbit altitude-orbit--one" />
          <div className="altitude-orbit altitude-orbit--two" />
          <div className="altitude-mountain">
            <span>2,240m</span>
          </div>
          <div className="altitude-scan" />
          <p>ENVIRONMENT ENGINE</p>
        </div>
      </header>

      <div className="country-select__section-head">
        <div>
          <span>SELECT YOUR SQUAD</span>
          <h2>감독할 국가를 선택하세요</h2>
        </div>
        <p>FIFA 랭킹 순으로 각 조의 국가를 확인할 수 있습니다.</p>
      </div>

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
                    <TeamFlag fifaCode={t.fifa_code} className="team-chip__flag" />
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
