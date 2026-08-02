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
          <span className="country-select__eyebrow">MATCHPLAN XI · 2026 WORLD CUP</span>
          <h1 className="country-select__title">당신이 감독이라면?</h1>
          <p className="country-select__kicker">
            고도, 체력, 이동거리 — 데이터가 말해주지 않는 것까지 읽어내는 전술 시뮬레이터
          </p>
          <p className="country-select__subtitle">
            48개국 중 하나를 맡아 실제 월드컵 대진표를 그대로 따라갑니다. 선수 컨디션을 살피고,
            경기장 환경에 맞춰 선발과 포메이션을 짜세요.
          </p>
          <div className="country-select__metrics" aria-label="대회 데이터 요약">
            <div><strong>48</strong><span>국가</span></div>
            <div><strong>1,248</strong><span>선수</span></div>
            <div><strong>104</strong><span>경기</span></div>
          </div>
        </div>
        <div className="country-select__hero-visual" aria-hidden="true">
          <div className="tactic-pitch">
            <svg viewBox="0 0 68 100" preserveAspectRatio="none">
              <rect className="tactic-pitch__lines" x="2" y="2" width="64" height="96" rx="2" />
              <line className="tactic-pitch__lines" x1="2" y1="50" x2="66" y2="50" />
              <circle className="tactic-pitch__lines" cx="34" cy="50" r="9.15" />
              <rect className="tactic-pitch__lines" x="14" y="2" width="40" height="16" />
              <rect className="tactic-pitch__lines" x="14" y="82" width="40" height="16" />
              <path className="tactic-pitch__link" d="M34,92 L10,72 M34,92 L26,76 M34,92 L42,76 M34,92 L58,72" />
              <path className="tactic-pitch__link" d="M10,72 L18,52 M26,76 L18,52 M26,76 L34,56 M42,76 L34,56 M42,76 L50,52 M58,72 L50,52" />
              <path className="tactic-pitch__link" d="M18,52 L14,22 M18,52 L34,16 M34,56 L34,16 M50,52 L34,16 M50,52 L54,22" />
              <circle className="tactic-pitch__dot" cx="34" cy="92" r="3.2" />
              <circle className="tactic-pitch__dot" cx="10" cy="72" r="3.2" />
              <circle className="tactic-pitch__dot" cx="26" cy="76" r="3.2" />
              <circle className="tactic-pitch__dot" cx="42" cy="76" r="3.2" />
              <circle className="tactic-pitch__dot" cx="58" cy="72" r="3.2" />
              <circle className="tactic-pitch__dot" cx="18" cy="52" r="3.2" />
              <circle className="tactic-pitch__dot" cx="34" cy="56" r="3.2" />
              <circle className="tactic-pitch__dot" cx="50" cy="52" r="3.2" />
              <circle className="tactic-pitch__dot" cx="14" cy="22" r="3.2" />
              <circle className="tactic-pitch__dot tactic-pitch__dot--lead" cx="34" cy="16" r="3.6" />
              <circle className="tactic-pitch__dot" cx="54" cy="22" r="3.2" />
            </svg>
            <span className="tactic-pitch__chip">4-3-3</span>
          </div>
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
