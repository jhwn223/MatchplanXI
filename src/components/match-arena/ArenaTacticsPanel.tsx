import { useEffect, useRef, useState } from "react";
import { slotsOf, type FormationKey, type FormationSlot } from "../../data/formation";
import { tacticalCoordinate } from "../Pitch";
import { TeamFlag } from "../TeamFlag";
import type { Player } from "../../data/types";
import type { PlayerRole, SlotRoleAssignments } from "../../data/playerRoles";
import {
  EMPTY_SET_PIECE_ASSIGNMENTS,
  type SetPieceAssignments,
} from "../../data/tactics";
import { RoleAssignmentBoard } from "./RoleAssignmentBoard";
import { MAX_SAVED_TACTICS, type SavedTactic } from "../../data/savedTactics";
import {
  applyQuickTactic,
  QUICK_TACTICS,
  type QuickTacticKey,
  type TeamTactics,
} from "./tactics";

type TacticsTab = "quick" | "roles" | "general" | "attack" | "defense" | "setPieces";

interface Props {
  userTeamName: string;
  userCode: string;
  formation: FormationKey;
  formationLabel?: string;
  tactics: TeamTactics;
  onApply: (tactics: TeamTactics) => void;
  slots?: Record<string, number | null>;
  playersById?: Map<number, Player>;
  slotRoles?: SlotRoleAssignments;
  onRoleChange?: (slotId: string, role: PlayerRole) => void;
  setPieces?: SetPieceAssignments;
  onSetPieceChange?: (assignments: SetPieceAssignments) => void;
  variant?: "match" | "prematch";
  /** Kept for the whole run (owned by the App root), not persisted storage —
   *  see savedTactics.ts for why. */
  savedTactics?: SavedTactic[];
  onSaveTactic?: (name: string, tactics: TeamTactics) => void;
  onDeleteTactic?: (id: string) => void;
}

const OPTIONS = {
  defenseStyle: [["dropBack", "후퇴"], ["balanced", "밸런스"], ["errorPress", "터치 실수 시 압박"], ["lossPress", "뺏긴 직후 압박"], ["constantPress", "지속 압박"]],
  chanceCreation: [["possession", "점유율"], ["balanced", "밸런스"], ["forwardRuns", "전방 침투"]],
  mentality: [["defensive", "수비적"], ["cautious", "신중함"], ["balanced", "균형"], ["positive", "적극적"], ["attacking", "공격적"]],
  tempo: [["slow", "느림"], ["balanced", "보통"], ["fast", "빠름"]],
  fluidity: [["rigid", "조직적"], ["balanced", "보통"], ["fluid", "유동적"]],
  workRate: [["conserve", "체력 안배"], ["balanced", "보통"], ["intense", "많은 활동량"]],
  creativity: [["disciplined", "규율"], ["balanced", "신중함"], ["expressive", "자유롭게"]],
  passingStyle: [["short", "짧은 패스"], ["mixed", "혼합"], ["long", "롱 볼"]],
  attackFocus: [["left", "왼쪽 측면"], ["balanced", "균형"], ["right", "오른쪽 측면"], ["central", "중앙 돌파"]],
  shooting: [["patient", "침착하게 찬스"], ["balanced", "균형"], ["onSight", "보는 즉시 슈팅"]],
  defensiveLine: [["low", "낮은 라인"], ["standard", "보통"], ["high", "높은 라인"]],
  pressing: [["standard", "상황별 압박"], ["high", "강한 압박"]],
  marking: [["zonal", "지역 방어"], ["man", "대인 방어"]],
  tackling: [["cautious", "신중"], ["balanced", "보통"], ["aggressive", "적극적"]],
  strikerRole: [["target", "타깃맨"], ["poacher", "침투형 공격수"], ["falseNine", "펄스 나인"]],
  midfieldRole: [["hold", "수비 지원"], ["balanced", "균형"], ["playmaker", "플레이메이커"]],
  fullbackRole: [["stay", "수비 대기"], ["overlap", "오버래핑"], ["inverted", "인버티드"]],
  width: [["narrow", "좁게"], ["balanced", "중간"], ["wide", "넓게"]],
  lineOfEngagement: [["deep", "로우 블록"], ["middle", "미들 블록"], ["high", "하이 블록"]],
} as const;

export function ArenaTacticsPanel({
  userTeamName,
  userCode,
  formation,
  formationLabel,
  tactics,
  onApply,
  slots = {},
  playersById = new Map(),
  slotRoles,
  onRoleChange,
  setPieces = EMPTY_SET_PIECE_ASSIGNMENTS,
  onSetPieceChange,
  variant = "match",
  savedTactics: saved = [],
  onSaveTactic,
  onDeleteTactic,
}: Props) {
  const [draft, setDraft] = useState<TeamTactics>(tactics);
  const [tab, setTab] = useState<TacticsTab>("quick");
  const [selectedQuick, setSelectedQuick] = useState<QuickTacticKey | null>(null);
  const [selectedSaved, setSelectedSaved] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");

  useEffect(() => {
    setDraft(tactics);
  }, [tactics]);

  // Every change applies straight away — there is no draft to confirm, so the
  // panel carries no cancel/reset/apply footer.
  function commit(next: TeamTactics, quick: QuickTacticKey | null = null) {
    setDraft(next);
    setSelectedQuick(quick);
    if (quick) setSelectedSaved(null);
    onApply(next);
  }

  const patch = <K extends keyof TeamTactics>(key: K, value: TeamTactics[K]) =>
    commit({ ...draft, [key]: value });

  return (
    <section className={`match-tactics-editor match-tactics-editor--${variant}`}>
      {variant === "match" && <div className="match-tactics-editor__summary">
        <div className="match-tactics-editor__team">
          <span>
            <TeamFlag fifaCode={userCode} className="match-tactics-editor__flag" />
            <small>{userCode}</small>
          </span>
          <strong>{userTeamName}</strong>
          {/* Formation lives with the lineup, on the squad tab. */}
          <small>{formationLabel ?? formation}</small>
        </div>
        <FormationMiniMap formation={slotsOf(formation)} tactics={draft} />
      </div>}

      <div className="match-tactics-editor__body">
        <nav className="match-tactics-tabs" aria-label="전술 설정 분류">
          {([
            ["quick", "빠른 지시"],
            ["roles", "역할"],
            ["general", "일반"],
            ["attack", "공격"],
            ["defense", "수비"],
            ["setPieces", "세트피스"],
          ] as const).map(([key, label]) => (
            <button key={key} type="button" data-active={tab === key || undefined} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </nav>

        <div className="match-tactics-fields">
          {tab === "quick" && (
            <div className="quick-tactics">
              <div className="quick-tactics__grid">
                {QUICK_TACTICS.map((preset) => (
                  <button
                    type="button"
                    key={preset.key}
                    data-active={selectedQuick === preset.key || undefined}
                    onClick={() => commit(applyQuickTactic(draft, preset.key), preset.key)}
                  >
                    <strong>{preset.label}</strong>
                    <span>{preset.description}</span>
                  </button>
                ))}
              </div>
              <div className="saved-tactics">
                <div className="saved-tactics__head">
                  <strong>내 전술</strong>
                  <span>{saved.length}/{MAX_SAVED_TACTICS}</span>
                </div>
                {saved.length > 0 && (
                  <div className="quick-tactics__grid">
                    {saved.map((entry) => (
                      <button
                        type="button"
                        key={entry.id}
                        data-active={selectedSaved === entry.id || undefined}
                        onClick={() => {
                          setSelectedSaved(entry.id);
                          commit(entry.tactics);
                        }}
                      >
                        <strong>{entry.name}</strong>
                        <span>저장한 전술 불러오기</span>
                        <em
                          role="button"
                          tabIndex={0}
                          aria-label={`${entry.name} 삭제`}
                          onClick={(event) => {
                            event.stopPropagation();
                            onDeleteTactic?.(entry.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.stopPropagation();
                            onDeleteTactic?.(entry.id);
                          }}
                        >
                          삭제
                        </em>
                      </button>
                    ))}
                  </div>
                )}
                <form
                  className="saved-tactics__save"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!saveName.trim()) return;
                    onSaveTactic?.(saveName, draft);
                    setSaveName("");
                  }}
                >
                  <input
                    value={saveName}
                    onChange={(event) => setSaveName(event.target.value)}
                    placeholder="현재 설정을 이름 붙여 저장"
                    maxLength={20}
                    aria-label="전술 이름"
                  />
                  <button type="submit" disabled={!saveName.trim()}>저장</button>
                </form>
              </div>
              <p>
                빠른 지시는 여러 세부 설정을 한 번에 변경합니다. 선택 즉시 저장되며,
                경기 중에는 다음 플레이부터 반영됩니다. 직접 맞춘 설정은 이름을 붙여
                저장해두면 다음 경기에서 그대로 불러올 수 있습니다.
              </p>
            </div>
          )}
          {tab === "roles" && (
            <RoleAssignmentBoard
              formation={formation}
              slots={slots}
              playersById={playersById}
              assignments={slotRoles}
              onChange={onRoleChange ?? (() => {})}
            />
          )}
          {tab === "general" && (
            <div className="tactic-field-grid">
              <TacticSelect label="정신력" value={draft.mentality} options={OPTIONS.mentality} onChange={(value) => patch("mentality", value as TeamTactics["mentality"])} />
              <TacticSelect label="템포" value={draft.tempo} options={OPTIONS.tempo} onChange={(value) => patch("tempo", value as TeamTactics["tempo"])} />
              <TacticSelect label="포메이션 유동성" value={draft.fluidity} options={OPTIONS.fluidity} onChange={(value) => patch("fluidity", value as TeamTactics["fluidity"])} />
              <TacticSelect label="활동량" value={draft.workRate} options={OPTIONS.workRate} onChange={(value) => patch("workRate", value as TeamTactics["workRate"])} />
              <TacticSelect label="창의성" value={draft.creativity} options={OPTIONS.creativity} onChange={(value) => patch("creativity", value as TeamTactics["creativity"])} />
              <TacticSelect label="팀 폭" value={draft.width} options={OPTIONS.width} onChange={(value) => patch("width", value as TeamTactics["width"])} />
            </div>
          )}
          {tab === "attack" && (
            <div className="tactic-field-grid">
              <TacticSelect label="기회 만들기" value={draft.chanceCreation} options={OPTIONS.chanceCreation} extraLabels={[["directPassing", "침투 패스"]]} onChange={(value) => patch("chanceCreation", value as TeamTactics["chanceCreation"])} />
              <TacticSelect label="패싱 스타일" value={draft.passingStyle} options={OPTIONS.passingStyle} extraLabels={[["direct", "직접 패스"]]} onChange={(value) => patch("passingStyle", value as TeamTactics["passingStyle"])} />
              <TacticSelect label="공격 방향" value={draft.attackFocus} options={OPTIONS.attackFocus} onChange={(value) => patch("attackFocus", value as TeamTactics["attackFocus"])} />
              <TacticSelect label="슈팅 지시" value={draft.shooting} options={OPTIONS.shooting} onChange={(value) => patch("shooting", value as TeamTactics["shooting"])} />
            </div>
          )}
          {tab === "defense" && (
            <div className="tactic-field-grid">
              <TacticSelect label="수비 스타일" value={draft.defenseStyle} options={OPTIONS.defenseStyle} onChange={(value) => patch("defenseStyle", value as TeamTactics["defenseStyle"])} />
              <TacticSelect label="수비 라인" value={draft.defensiveLine} options={OPTIONS.defensiveLine} onChange={(value) => patch("defensiveLine", value as TeamTactics["defensiveLine"])} />
              <TacticSelect label="압박 강도" value={draft.pressing} options={OPTIONS.pressing} extraLabels={[["low", "지역 방어"]]} onChange={(value) => patch("pressing", value as TeamTactics["pressing"])} />
              <TacticSelect label="마킹 방식" value={draft.marking} options={OPTIONS.marking} onChange={(value) => patch("marking", value as TeamTactics["marking"])} />
              <TacticSelect label="태클 강도" value={draft.tackling} options={OPTIONS.tackling} onChange={(value) => patch("tackling", value as TeamTactics["tackling"])} />
              <TacticSelect label="압박 시작 위치" value={draft.lineOfEngagement} options={OPTIONS.lineOfEngagement} onChange={(value) => patch("lineOfEngagement", value as TeamTactics["lineOfEngagement"])} />
            </div>
          )}
          {tab === "setPieces" && (
            <SetPieceBoard
              slots={slots}
              playersById={playersById}
              assignments={setPieces}
              onChange={onSetPieceChange ?? (() => {})}
            />
          )}
        </div>
      </div>

    </section>
  );
}

/**
 * Matches whichever stats the engine actually reads for that kick, not a
 * generic overall rating. Corners/free kicks use eventEngine.ts's own
 * weighting (crossing+longPassing*0.5 / freeKickAccuracy+shotPower*0.25);
 * penalties use penalties.ts's goal-probability weighting
 * (penalties 55% + composure 30% + finishing 15%) — composure is included
 * here because it is a real, sizeable contributor to the actual PK result,
 * not just decoration.
 */
function kickerStatLabel(
  key: "penaltyTakerId" | "cornerTakerId" | "freeKickTakerId",
  player: Player,
): string {
  const ability = player.ability;
  if (key === "penaltyTakerId") return `PK ${ability?.penalties ?? 60}`;
  if (key === "cornerTakerId") return `크로스 ${ability?.crossing ?? 60}`;
  return `프리킥 ${ability?.freeKickAccuracy ?? 60}`;
}

/** Same stats as the label above, so the list is sorted by what it shows. */
function kickerSortValue(
  key: "penaltyTakerId" | "cornerTakerId" | "freeKickTakerId",
  player: Player,
): number {
  const ability = player.ability;
  if (key === "penaltyTakerId") return ability?.penalties ?? 60;
  if (key === "cornerTakerId") return ability?.crossing ?? 60;
  return ability?.freeKickAccuracy ?? 60;
}

function SetPieceBoard({
  slots,
  playersById,
  assignments,
  onChange,
}: {
  slots: Record<string, number | null>;
  playersById: Map<number, Player>;
  assignments: SetPieceAssignments;
  onChange: (assignments: SetPieceAssignments) => void;
}) {
  const players = Object.values(slots)
    .filter((id): id is number => id != null)
    .map((id) => playersById.get(id))
    .filter((player): player is Player => player != null);
  const outfield = players.filter((player) => player.position !== "GK");
  const selectValue = (value: number | undefined) => value == null ? "" : String(value);
  const patch = (next: Partial<SetPieceAssignments>) => onChange({ ...assignments, ...next });
  const toggleParticipant = (
    key: "cornerParticipants" | "freeKickParticipants",
    playerId: number,
  ) => {
    const current = assignments[key] ?? [];
    if (current.includes(playerId)) {
      patch({ [key]: current.filter((id) => id !== playerId) });
      return;
    }
    patch({ [key]: [...current, playerId] });
  };

  return (
    <div className="set-piece-board">
      <section className="set-piece-board__takers">
        <h3>키커 지정</h3>
        {([
          ["penaltyTakerId", "페널티킥 키커"],
          ["cornerTakerId", "코너킥 키커"],
          ["freeKickTakerId", "프리킥 키커"],
        ] as const).map(([key, label]) => (
          <label key={key}>
            <span>{label}</span>
            <select
              value={selectValue(assignments[key])}
              onChange={(event) => {
                const playerId = event.target.value ? Number(event.target.value) : undefined;
                if (key === "cornerTakerId") {
                  patch({
                    [key]: playerId,
                    cornerParticipants: assignments.cornerParticipants.filter((id) => id !== playerId),
                  });
                } else if (key === "freeKickTakerId") {
                  patch({
                    [key]: playerId,
                    freeKickParticipants: assignments.freeKickParticipants.filter((id) => id !== playerId),
                  });
                } else {
                  patch({ [key]: playerId });
                }
              }}
            >
              <option value="">자동 선택</option>
              {[...(key === "penaltyTakerId" ? players : outfield)]
                .sort((a, b) => kickerSortValue(key, b) - kickerSortValue(key, a))
                .map((player) => (
                  <option key={player.player_id} value={player.player_id}>
                    {player.player_name} · {kickerStatLabel(key, player)}
                  </option>
                ))}
            </select>
          </label>
        ))}
      </section>
      {([
        ["cornerParticipants", "코너킥 가담 선수"],
        ["freeKickParticipants", "프리킥 가담 선수"],
      ] as const).map(([key, label]) => (
        <section className="set-piece-board__participants" key={key}>
          <header><h3>{label}</h3><span>{assignments[key].length}명 가담 중</span></header>
          <div>
            {outfield
              .filter((player) => player.player_id !== (
                key === "cornerParticipants" ? assignments.cornerTakerId : assignments.freeKickTakerId
              ))
              .map((player) => {
              const selected = assignments[key].includes(player.player_id);
              return (
                <button
                  type="button"
                  key={player.player_id}
                  data-active={selected || undefined}
                  onClick={() => toggleParticipant(key, player.player_id)}
                >
                  <strong>{player.player_name}</strong>
                  <span>헤더 {player.ability?.headingAccuracy ?? 60} · 위치 {player.ability?.positioning ?? 60}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function TacticItemBoxSelect({
  label,
  value,
  options,
  onChange,
  extraLabels = [],
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
  /**
   * Korean label for values that quick-tactic presets can still set (e.g.
   * "direct" passing) but that were deliberately dropped from the dropdown
   * itself. Without this, the button falls back to the raw English value
   * until the field is changed to something the list actually offers.
   */
  extraLabels?: readonly (readonly [string, string])[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const currentLabel =
    options.find(([optionValue]) => optionValue === value)?.[1]
    ?? extraLabels.find(([optionValue]) => optionValue === value)?.[1]
    ?? value;

  useEffect(() => {
    if (!open) return;
    const closeFromOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="match-tactic-field match-tactic-field--choices"
      data-open={open || undefined}
    >
      <button
        type="button"
        className="match-tactic-itembox"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{label}</span>
        <strong>{currentLabel}</strong>
        <i aria-hidden="true">⌄</i>
      </button>
      {open && (
        <div className="match-tactic-menu" role="listbox" aria-label={label}>
        {options.map(([optionValue, optionLabel]) => (
          <button
            type="button"
            key={optionValue}
            role="option"
            data-active={value === optionValue || undefined}
            aria-selected={value === optionValue}
            onClick={() => {
              onChange(optionValue);
              setOpen(false);
            }}
          >
            <span>{optionLabel}</span>
            {value === optionValue && <strong aria-hidden="true">✓</strong>}
          </button>
        ))}
        </div>
      )}
    </div>
  );
}

const TacticSelect = TacticItemBoxSelect;


// Shared with the pre-match/half-time tactics screen so the in-match tactics
// tab shows the same board instead of the smaller, flatter SVG shape it used
// to render on its own.
export function FormationMiniMap({
  formation,
  tactics,
}: {
  formation: FormationSlot[];
  tactics: TeamTactics;
}) {
  const widthLabel = { narrow: "좁게", balanced: "중간", wide: "넓게" }[tactics.width];
  const lineLabel = { low: "낮은 라인", standard: "보통 라인", high: "높은 라인" }[tactics.defensiveLine];
  const lineBottom = 19 + (tactics.defensiveLine === "high" ? 8 : tactics.defensiveLine === "low" ? -5 : 0);
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
