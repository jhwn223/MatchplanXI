import type { RefObject } from "react";
import type { ConditionBreakdown } from "../../data/conditionEngine";
import type { FormationKey, FormationSlot } from "../../data/formation";
import type { HalfResult, SimResult } from "../../data/matchSim";
import type { TacticStyleKey } from "../../data/tactics";
import { stageLabelKo, type TeamMatch } from "../../data/tournament";
import type { Player, Team } from "../../data/types";
import { AppTopbar } from "../AppTopbar";
import { Bench } from "../Bench";
import { ConditionGauge, type ConditionSubIndices } from "../ConditionGauge";
import { Pitch } from "../Pitch";
import { TacticsPanel } from "../TacticsPanel";
import type { Lineup, MatchPhase } from "./types";

interface Props {
  team: Team;
  activeMatch: TeamMatch;
  phase: MatchPhase;
  lineup: Lineup;
  formation: FormationSlot[];
  detectedFormation: string;
  effectiveAttackBias: number;
  tacticStyleKey: TacticStyleKey | null;
  onSelectTacticStyle: (key: TacticStyleKey) => void;
  teamIndex: number | null;
  conditionSubIndices: ConditionSubIndices;
  conditions: Map<number, ConditionBreakdown>;
  playersById: Map<number, Player>;
  benchPlayers: Player[];
  benchedOut: Set<number>;
  placedCount: number;
  startingXI: Set<number> | null;
  maxSubs: number;
  subsUsed: number;
  subsRemaining: number;
  firstHalf: HalfResult | null;
  regulation: SimResult | null;
  winEstimate: number;
  soundOn: boolean;
  primaryLabel: string;
  ready: boolean;
  pitchRef: RefObject<HTMLDivElement | null>;
  onBack: () => void;
  onSoundChange: (enabled: boolean) => void;
  onSelectFormation: (key: FormationKey) => void;
  onAutoFill: () => void;
  onResetPositions: () => void;
  onResetLineup: () => void;
  onPrimaryAction: () => void;
  onSelectPlayer: (player: Player) => void;
}

export function MatchBoardScreen({
  team,
  activeMatch,
  phase,
  lineup,
  formation,
  detectedFormation,
  effectiveAttackBias,
  tacticStyleKey,
  onSelectTacticStyle,
  teamIndex,
  conditionSubIndices,
  conditions,
  playersById,
  benchPlayers,
  benchedOut,
  placedCount,
  startingXI,
  maxSubs,
  subsUsed,
  subsRemaining,
  firstHalf,
  regulation,
  winEstimate,
  soundOn,
  primaryLabel,
  ready,
  pitchRef,
  onBack,
  onSoundChange,
  onSelectFormation,
  onAutoFill,
  onResetPositions,
  onResetLineup,
  onPrimaryAction,
  onSelectPlayer,
}: Props) {
  const match = activeMatch.match;
  return (
    <div className="board">
      <AppTopbar active="tactics" teamCode={team.fifa_code} onBrandClick={onBack} />
      <header className="board__header">
        <button type="button" className="btn-back" onClick={onBack}>← 일정</button>
        <div className="board__match">
          <span className="board__stage">{stageLabelKo(match.stage_name)}</span>
          <span className="board__teams">
            {team.team_name} <span className="board__vs">{activeMatch.isHome ? "vs" : "@"}</span>{" "}
            {activeMatch.opponentName}
          </span>
          <span className="board__stadium">
            {match.stadium_name.replace(/\s*\(.*\)/, "")} · {match.city} · {match.date}
          </span>
        </div>
        <div className="board__controls">
          <span className={`elev-badge elev-badge--${activeMatch.elevation >= 2000 ? "high" : activeMatch.elevation >= 1000 ? "mid" : "low"}`}>
            ⛰ 고도 {activeMatch.elevation}m
          </span>
          <span className="board__rest">휴식 {activeMatch.restDays}일</span>
          {activeMatch.travelKm > 0 && (
            <span className="travel-badge">
              ✈ 이동 {activeMatch.travelKm}km
              {activeMatch.tzShiftHours !== 0 ? ` · 시차 ${Math.abs(activeMatch.tzShiftHours)}h` : ""}
            </span>
          )}
          <label className="sound-toggle">
            <input type="checkbox" checked={soundOn} onChange={(event) => onSoundChange(event.target.checked)} />
            사운드
          </label>
        </div>
      </header>

      <div className="board__body">
        <aside className="board__sidebar">
          <TacticsPanel
            selectedFormation={lineup.formation}
            detectedFormation={detectedFormation}
            attackBias={effectiveAttackBias}
            onSelectFormation={onSelectFormation}
            onAutoFill={onAutoFill}
            tacticStyleKey={tacticStyleKey}
            onSelectTacticStyle={onSelectTacticStyle}
            subsLocked={startingXI != null}
          />
          <ConditionGauge value={teamIndex} filledCount={placedCount} subIndices={conditionSubIndices} />
          <div className="sub-tracker">
            <span className="sub-tracker__label">🔄 교체 카드</span>
            <div className="sub-tracker__cards">
              {Array.from({ length: maxSubs }).map((_, index) => (
                <span key={index} className="sub-card" data-used={index < subsUsed || undefined} />
              ))}
            </div>
            <span className="sub-tracker__count">{subsRemaining}장 남음</span>
          </div>
          {phase === "halftime" && firstHalf && (
            <div className="halftime-banner">
              ⏱ 하프타임 · 전반 {firstHalf.userGoals} - {firstHalf.oppGoals} · 전술과 라인업을 조정하세요
            </div>
          )}
          {phase === "etbreak" && regulation && (
            <div className="halftime-banner">
              🔥 연장전 돌입 · 정규시간 {regulation.userGoals} - {regulation.oppGoals} · 교체 카드 1장 추가 지급
            </div>
          )}
        </aside>

        <main className="board__pitch">
          <div className="pitch-toolbar">
            <div className="detected-formation" aria-live="polite">
              <span>자동 포메이션</span>
              <strong>{detectedFormation}</strong>
            </div>
            <button
              type="button"
              className="pitch-reset"
              onClick={onResetPositions}
              disabled={!lineup.positions || Object.keys(lineup.positions).length === 0}
              aria-label="기본 위치로 되돌리기"
              title="기본 위치로 되돌리기"
            >
              ↺
            </button>
          </div>
          <Pitch
            formation={formation}
            slots={lineup.slots}
            playersById={playersById}
            conditions={conditions}
            onSelectPlayer={onSelectPlayer}
            positions={lineup.positions}
            positionMode
            pitchRef={pitchRef}
          />
        </main>

        <section className="board__bench">
          <Bench
            benchPlayers={benchPlayers}
            conditions={conditions}
            benchedOut={benchedOut}
            onSelectPlayer={onSelectPlayer}
          />
        </section>
      </div>

      <footer className="board__actionbar">
        <div className="board__action-metric"><span>스쿼드 구성</span><strong>{placedCount} / 11</strong></div>
        <div className="board__action-metric"><span>예상 승률</span><strong>{winEstimate}%</strong></div>
        <div className="board__action-spacer" />
        <button type="button" className="board__reset" disabled={startingXI != null} onClick={onResetLineup}>전술 초기화</button>
        <button type="button" className="kickoff-btn" disabled={!ready} onClick={onPrimaryAction}>{primaryLabel}</button>
      </footer>
    </div>
  );
}
