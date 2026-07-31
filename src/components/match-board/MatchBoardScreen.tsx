import { useState, type RefObject } from "react";
import type { ConditionBreakdown } from "../../data/conditionEngine";
import {
  FORMATION_KEYS,
  type FormationKey,
  type FormationSlot,
} from "../../data/formation";
import type { HalfResult, SimResult } from "../../data/matchSim";
import { stageLabelKo, type TeamMatch } from "../../data/tournament";
import type { Player, Team } from "../../data/types";
import { AppTopbar } from "../AppTopbar";
import { Bench } from "../Bench";
import { Pitch, tacticalCoordinate } from "../Pitch";
import { TacticsPanel } from "../TacticsPanel";
import {
  ArenaTacticsPanel,
  TacticItemBoxSelect,
} from "../match-arena/ArenaTacticsPanel";
import {
  describeTeamTactics,
  intensityFromTeamTactics,
  type TeamTactics,
} from "../match-arena/tactics";
import { OpponentAnalysisPanel } from "./OpponentAnalysisPanel";
import type { OpponentPlan, TacticalMatchup } from "./opponentPlan";
import type { Lineup, MatchPhase } from "./types";

interface Props {
  team: Team;
  opponent?: Team;
  opponentPlayers: Player[];
  opponentConditions: Map<number, ConditionBreakdown>;
  opponentPlan: OpponentPlan | null;
  matchups: TacticalMatchup[];
  activeMatch: TeamMatch;
  phase: MatchPhase;
  lineup: Lineup;
  formation: FormationSlot[];
  detectedFormation: string;
  effectiveAttackBias: number;
  teamTactics: TeamTactics;
  onTacticsChange: (tactics: TeamTactics) => void;
  teamIndex: number | null;
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
  /** false while the arena overlay is showing: it owns the pitch and bench
   *  then, and two copies would register duplicate drop targets. */
  lineupInteractive?: boolean;
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
  opponent,
  opponentPlayers,
  opponentConditions,
  opponentPlan,
  matchups,
  activeMatch,
  phase,
  lineup,
  formation,
  detectedFormation,
  effectiveAttackBias,
  teamTactics,
  onTacticsChange,
  teamIndex,
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
  lineupInteractive = true,
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
  const [saved, setSaved] = useState(true);
  const [workspaceMode, setWorkspaceMode] = useState<"lineup" | "tactics">("lineup");
  const [rightPanel, setRightPanel] = useState<"squad" | "opponent">("squad");
  const match = activeMatch.match;
  const intensity = intensityFromTeamTactics(teamTactics);
  const staminaRisk = intensity.attackPress >= 72 || teamTactics.workRate === "intense";
  const spaceRisk =
    teamTactics.defensiveLine === "high" ||
    teamTactics.depth >= 8 ||
    teamTactics.mentality === "attacking";

  function updateTactics(next: TeamTactics) {
    setSaved(false);
    onTacticsChange(next);
  }

  return (
    <div className="board board--prematch" data-workspace={workspaceMode}>
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
            <input
              type="checkbox"
              checked={soundOn}
              onChange={(event) => onSoundChange(event.target.checked)}
            />
            사운드
          </label>
        </div>
      </header>

      <div className="board__body">
        <aside className="board__sidebar" aria-label="경기 전 전술 설정">
          <div className="board-tactics-title">
            <span aria-hidden="true">⚯</span>
            <div>
              <small>PRE-MATCH PLAN</small>
              <h1>{workspaceMode === "lineup" ? "선수 구성" : "전술 설정"}</h1>
            </div>
          </div>
          <div className="board-workspace-tabs" role="tablist" aria-label="경기 전 설정">
            <button
              type="button"
              role="tab"
              aria-selected={workspaceMode === "lineup"}
              data-active={workspaceMode === "lineup" || undefined}
              onClick={() => setWorkspaceMode("lineup")}
            >
              선수·포메이션
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={workspaceMode === "tactics"}
              data-active={workspaceMode === "tactics" || undefined}
              onClick={() => setWorkspaceMode("tactics")}
            >
              팀 전술
            </button>
          </div>
          {workspaceMode === "lineup" ? (
            <TacticsPanel
              selectedFormation={lineup.formation}
              detectedFormation={detectedFormation}
              attackBias={effectiveAttackBias}
              onSelectFormation={onSelectFormation}
              onAutoFill={onAutoFill}
              tacticStyleKey={null}
              showStyles={false}
              subsLocked={startingXI != null}
            />
          ) : (
            <div className="prematch-tactic-summary">
              <div className="prematch-tactic-summary__team">
                <span>{team.fifa_code}</span>
                <div>
                  <small>MY TEAM</small>
                  <strong>{team.team_name}</strong>
                </div>
              </div>
              <TacticItemBoxSelect
                label="포메이션"
                value={lineup.formation}
                options={FORMATION_KEYS.map((key) => [key, key] as const)}
                onChange={(value) => onSelectFormation(value as FormationKey)}
              />
              <FormationMiniMap formation={formation} tactics={teamTactics} />
              <div className="prematch-tactic-summary__copy">
                <span>현재 전술</span>
                <strong>{describeTeamTactics(teamTactics)}</strong>
                <p>포메이션과 전술 변경은 킥오프부터 적용되며 경기 중에도 이어서 조정할 수 있습니다.</p>
              </div>
            </div>
          )}

          {startingXI && (
            <div className="sub-tracker">
              <span className="sub-tracker__label">교체 카드</span>
              <div className="sub-tracker__cards">
                {Array.from({ length: maxSubs }).map((_, index) => (
                  <span key={index} className="sub-card" data-used={index < subsUsed || undefined} />
                ))}
              </div>
              <span className="sub-tracker__count">{subsRemaining}장 남음</span>
            </div>
          )}
          {phase === "halftime" && firstHalf && (
            <div className="halftime-banner">
              하프타임 · 전반 {firstHalf.userGoals} - {firstHalf.oppGoals} · 전술과 라인업을 조정하세요.
            </div>
          )}
          {phase === "etbreak" && regulation && (
            <div className="halftime-banner">
              연장전 돌입 · 정규시간 {regulation.userGoals} - {regulation.oppGoals} · 교체 카드가 1장 추가됩니다.
            </div>
          )}
        </aside>

        <main className="board__pitch">
          {workspaceMode === "lineup" ? (
            <>
              <div className="pitch-toolbar">
              <div className="pitch-toolbar__context">
                <span>선수 배치</span>
                <strong>드래그하여 위치와 선발을 조정하세요</strong>
              </div>
                <div className="detected-formation" aria-live="polite">
                  <span>현재 형태</span>
                  <strong>{detectedFormation}</strong>
                </div>
                <div className="pitch-toolbar__actions">
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
              </div>
              {lineupInteractive && (
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
              )}
              <div className="pitch-tactic-caption pitch-tactic-caption--lineup">
                <span>현재 포메이션</span>
                <strong>{detectedFormation}</strong>
                <small>선수를 드래그하면 포메이션 감지와 선발 명단이 즉시 갱신됩니다.</small>
              </div>
            </>
          ) : (
            <section className="prematch-tactics-workspace">
              <header>
                <div>
                  <small>TACTICAL INSTRUCTIONS</small>
                  <h2>팀 전술</h2>
                  <p>경기 중 전술 화면과 동일한 항목을 킥오프 전에 설정합니다.</p>
                </div>
                <span className="prematch-tactics-workspace__status">
                  {saved ? "✓ 저장됨" : "● 변경사항 자동 저장"}
                </span>
              </header>
              <ArenaTacticsPanel
                variant="prematch"
                userTeamName={team.team_name}
                userCode={team.fifa_code}
                formation={lineup.formation}
                tactics={teamTactics}
                formationLabel={detectedFormation}
                onApply={updateTactics}
              />
            </section>
          )}
        </main>

        <section className="board__bench">
          <div className="board-side-tabs" role="tablist" aria-label="팀 정보">
            <button
              type="button"
              role="tab"
              aria-selected={rightPanel === "squad"}
              data-active={rightPanel === "squad" || undefined}
              onClick={() => setRightPanel("squad")}
            >
              우리 선수단
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={rightPanel === "opponent"}
              data-active={rightPanel === "opponent" || undefined}
              onClick={() => setRightPanel("opponent")}
            >
              상대 분석
            </button>
          </div>
          {rightPanel === "squad" ? (
            lineupInteractive && (
              <Bench
                benchPlayers={benchPlayers}
                conditions={conditions}
                benchedOut={benchedOut}
                onSelectPlayer={onSelectPlayer}
              />
            )
          ) : opponent && opponentPlan ? (
            <OpponentAnalysisPanel
              opponent={opponent}
              players={opponentPlayers}
              conditions={opponentConditions}
              plan={opponentPlan}
              matchups={matchups}
              onApplyMatchup={(patch) => updateTactics({ ...teamTactics, ...patch })}
            />
          ) : (
            <div className="opponent-report opponent-report--empty">
              상대 팀 분석 데이터를 불러올 수 없습니다.
            </div>
          )}
        </section>
      </div>

      <footer className="board__actionbar">
        <div className="board__action-metric">
          <span>선발 명단</span>
          <strong className={ready ? "is-ready" : ""}>{placedCount} / 11</strong>
        </div>
        <div className="board__action-metric">
          <span>평균 컨디션</span>
          <strong>{teamIndex != null ? Math.round(teamIndex) : "—"}<small>/100</small></strong>
        </div>
        <div className="board__action-metric board__action-metric--estimate">
          <span>예상 승률</span>
          <strong>{winEstimate}%</strong>
        </div>
        <div className="tactic-risk-list">
          {staminaRisk && <span className="tactic-risk tactic-risk--warn">△ 높은 체력 소모</span>}
          {spaceRisk && <span className="tactic-risk">ⓘ 뒷공간 위험</span>}
          {!staminaRisk && !spaceRisk && <span className="tactic-risk tactic-risk--safe">✓ 전술 균형 양호</span>}
        </div>
        <div className="board__action-spacer" />
        <button
          type="button"
          className="board__save"
          onClick={() => setSaved(true)}
        >
          {saved ? "전술 저장됨" : "전술 저장"}
        </button>
        <button
          type="button"
          className="board__reset"
          disabled={startingXI != null}
          onClick={onResetLineup}
        >
          초기화
        </button>
        <button type="button" className="kickoff-btn" disabled={!ready} onClick={onPrimaryAction}>
          {primaryLabel}
        </button>
      </footer>
    </div>
  );
}

function FormationMiniMap({
  formation,
  tactics,
}: {
  formation: FormationSlot[];
  tactics: TeamTactics;
}) {
  const widthLabel = { narrow: "좁게", balanced: "중간", wide: "넓게" }[tactics.width];
  const lineLabel = { low: "낮은 라인", standard: "보통 라인", high: "높은 라인" }[tactics.defensiveLine];
  const lineBottom = Math.max(13, Math.min(36, 19 + (tactics.depth - 4) * 1.7 + (tactics.defensiveLine === "high" ? 8 : tactics.defensiveLine === "low" ? -5 : 0)));
  return (
    <div
      className="prematch-mini-pitch"
      aria-label="현재 포메이션과 전술 미리보기"
      data-pressing={tactics.pressing}
    >
      <div className="prematch-mini-pitch__line" />
      <div className="prematch-mini-pitch__circle" />
      <div className="prematch-mini-pitch__shape-line" style={{ bottom: `${lineBottom}%` }} />
      <div className="prematch-mini-pitch__legend">
        <span>폭 {widthLabel}</span>
        <span>{lineLabel}</span>
      </div>
      {formation.map((slot) => {
        const coordinate = tacticalCoordinate(slot, slot, tactics);
        return (
          <span
            key={slot.id}
            title={slot.label}
            style={{ left: `${coordinate.x}%`, top: `${coordinate.y}%` }}
            data-position={slot.position}
          />
        );
      })}
    </div>
  );
}
