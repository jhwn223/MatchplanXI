import { useEffect } from "react";
import type { ConditionBreakdown } from "../data/conditionEngine";
import type { Player, PlayerAbility } from "../data/types";

interface Props {
  player: Player;
  condition?: ConditionBreakdown;
  onClose: () => void;
}

interface StatItem {
  label: string;
  value: number;
}

const CORE_STATS: Array<{ label: string; key: keyof PlayerAbility }> = [
  { label: "스피드", key: "pace" },
  { label: "슈팅", key: "shooting" },
  { label: "패스", key: "passing" },
  { label: "드리블", key: "dribbling" },
  { label: "수비", key: "defending" },
  { label: "피지컬", key: "physical" },
];

export function PlayerStatsModal({ player, condition, onClose }: Props) {
  const ability = player.ability;

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  if (!ability) return null;

  const attack: StatItem[] = [
    { label: "가속력", value: ability.acceleration },
    { label: "전력 질주", value: ability.sprintSpeed },
    { label: "공격 위치선정", value: ability.positioning },
    { label: "골 결정력", value: ability.finishing },
    { label: "슛 파워", value: ability.shotPower },
    { label: "중거리 슛", value: ability.longShots },
    { label: "발리", value: ability.volleys },
    { label: "페널티킥", value: ability.penalties },
  ];
  const technique: StatItem[] = [
    { label: "시야", value: ability.vision },
    { label: "크로스", value: ability.crossing },
    { label: "프리킥 정확도", value: ability.freeKickAccuracy },
    { label: "짧은 패스", value: ability.shortPassing },
    { label: "긴 패스", value: ability.longPassing },
    { label: "커브", value: ability.curve },
    { label: "민첩성", value: ability.agility },
    { label: "밸런스", value: ability.balance },
    { label: "반응속도", value: ability.reactions },
    { label: "볼 컨트롤", value: ability.ballControl },
    { label: "침착성", value: ability.composure },
  ];
  const defense: StatItem[] = [
    { label: "가로채기", value: ability.interceptions },
    { label: "헤딩 정확도", value: ability.headingAccuracy },
    { label: "수비 인식", value: ability.defensiveAwareness },
    { label: "스탠딩 태클", value: ability.standingTackle },
    { label: "슬라이딩 태클", value: ability.slidingTackle },
    { label: "점프", value: ability.jumping },
    { label: "스태미나", value: ability.stamina },
    { label: "힘", value: ability.strength },
    { label: "적극성", value: ability.aggression },
  ];
  const goalkeeper: StatItem[] = [
    { label: "다이빙", value: ability.gkDiving },
    { label: "핸들링", value: ability.gkHandling },
    { label: "킥", value: ability.gkKicking },
    { label: "위치선정", value: ability.gkPositioning },
    { label: "반사신경", value: ability.gkReflexes },
  ];

  return (
    <div className="player-stats-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="player-stats-modal" role="dialog" aria-modal="true" aria-labelledby="player-stats-title">
        <header className="player-stats-header">
          <div className="player-stats-overall" aria-label={`오버롤 ${ability.overall}`}>{ability.overall}</div>
          <div className="player-stats-identity">
            <span className="player-stats-position">{player.position}</span>
            <h2 id="player-stats-title">{player.player_name}</h2>
            <p>{player.club_team} · {player.height_cm}cm · A매치 {player.caps}경기 · {player.goals}골</p>
          </div>
          <button type="button" className="player-stats-close" onClick={onClose} aria-label="선수 능력치 닫기" title="닫기">×</button>
        </header>

        <div className="player-stats-meta">
          <span>{ability.source === "fc26" ? "FC26 데이터" : "추정 데이터"}</span>
          {ability.preferredFoot && <span>주발 {ability.preferredFoot === "Left" ? "왼발" : "오른발"}</span>}
          <span>약발 {ability.weakFoot}</span>
          <span>개인기 {ability.skillMoves}</span>
          {condition && <span>현재 컨디션 {Math.round(condition.score)}</span>}
        </div>

        <div className="player-stats-core">
          {CORE_STATS.map(({ label, key }) => (
            <div className="player-core-stat" key={key}>
              <span>{label}</span>
              <strong>{ability[key] as number}</strong>
              <div className="player-stat-track"><i style={{ width: `${ability[key]}%` }} /></div>
            </div>
          ))}
        </div>

        <div className="player-stats-details">
          <StatSection title="공격과 스피드" stats={attack} />
          <StatSection title="패스와 테크닉" stats={technique} />
          <StatSection title="수비와 피지컬" stats={defense} />
          {player.position === "GK" && <StatSection title="골키퍼" stats={goalkeeper} />}
        </div>
      </section>
    </div>
  );
}

function StatSection({ title, stats }: { title: string; stats: StatItem[] }) {
  return (
    <section className="player-stat-section">
      <h3>{title}</h3>
      <dl>
        {stats.map((stat) => (
          <div className="player-stat-row" key={stat.label}>
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
            <div className="player-stat-track"><i style={{ width: `${stat.value}%` }} /></div>
          </div>
        ))}
      </dl>
    </section>
  );
}
