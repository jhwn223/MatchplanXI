import { useEffect, useRef, useState } from "react";
import { slotsOf, type FormationKey } from "../../data/formation";
import { tacticalCoordinate } from "../Pitch";
import { TeamFlag } from "../TeamFlag";
import {
  applyQuickTactic,
  QUICK_TACTICS,
  type QuickTacticKey,
  type TeamTactics,
} from "./tactics";

type TacticsTab = "quick" | "style" | "roles" | "general" | "attack" | "defense";

interface Props {
  userTeamName: string;
  userCode: string;
  formation: FormationKey;
  formationLabel?: string;
  tactics: TeamTactics;
  onApply: (tactics: TeamTactics) => void;
  variant?: "match" | "prematch";
}

const OPTIONS = {
  defenseStyle: [["dropBack", "후퇴"], ["balanced", "밸런스"], ["errorPress", "터치 실수 시 압박"], ["lossPress", "뺏긴 직후 압박"], ["constantPress", "지속 압박"]],
  buildUpPlay: [["shortPass", "짧은 패스"], ["balanced", "밸런스"], ["longPass", "긴 패스"], ["fastBuildUp", "빠른 빌드업"]],
  chanceCreation: [["possession", "점유율"], ["balanced", "밸런스"], ["directPassing", "침투 패스"], ["forwardRuns", "전방 침투"]],
  mentality: [["defensive", "수비적"], ["cautious", "신중함"], ["balanced", "균형"], ["positive", "적극적"], ["attacking", "공격적"]],
  tempo: [["slow", "느림"], ["balanced", "보통"], ["fast", "빠름"]],
  fluidity: [["rigid", "조직적"], ["balanced", "보통"], ["fluid", "유동적"]],
  workRate: [["conserve", "체력 안배"], ["balanced", "보통"], ["intense", "많은 활동량"]],
  creativity: [["disciplined", "규율"], ["balanced", "신중함"], ["expressive", "자유롭게"]],
  passingStyle: [["short", "짧은 패스"], ["mixed", "혼합"], ["direct", "직접 패스"], ["long", "롱 볼"]],
  attackFocus: [["left", "왼쪽 측면"], ["balanced", "균형"], ["right", "오른쪽 측면"], ["central", "중앙 돌파"]],
  shooting: [["patient", "침착하게 찬스"], ["balanced", "균형"], ["onSight", "보는 즉시 슈팅"]],
  widePlay: [["mixed", "혼합"], ["overlap", "오버래핑"], ["earlyCross", "얼리 크로스"]],
  defensiveLine: [["low", "낮은 라인"], ["standard", "보통"], ["high", "높은 라인"]],
  pressing: [["low", "지역 방어"], ["standard", "상황별 압박"], ["high", "강한 압박"]],
  marking: [["zonal", "지역 방어"], ["man", "대인 방어"]],
  tackling: [["cautious", "신중"], ["balanced", "보통"], ["aggressive", "적극적"]],
  strikerRole: [["target", "타깃맨"], ["poacher", "침투형 공격수"], ["falseNine", "펄스 나인"]],
  midfieldRole: [["hold", "수비 지원"], ["balanced", "균형"], ["playmaker", "플레이메이커"]],
  fullbackRole: [["stay", "수비 대기"], ["overlap", "오버래핑"], ["inverted", "인버티드"]],
  width: [["narrow", "좁게"], ["balanced", "중간"], ["wide", "넓게"]],
  lineOfEngagement: [["deep", "로우 블록"], ["middle", "미들 블록"], ["high", "하이 블록"]],
  compactness: [["compact", "촘촘하게"], ["balanced", "보통"], ["stretched", "넓게 벌려"]],
  offsideTrap: [["off", "사용 안 함"], ["on", "사용"]],
} as const;

export function ArenaTacticsPanel({
  userTeamName,
  userCode,
  formation,
  formationLabel,
  tactics,
  onApply,
  variant = "match",
}: Props) {
  const [draft, setDraft] = useState<TeamTactics>(tactics);
  const [tab, setTab] = useState<TacticsTab>("quick");
  const [selectedQuick, setSelectedQuick] = useState<QuickTacticKey | null>(null);

  useEffect(() => {
    setDraft(tactics);
  }, [tactics]);

  // Every change applies straight away — there is no draft to confirm, so the
  // panel carries no cancel/reset/apply footer.
  function commit(next: TeamTactics, quick: QuickTacticKey | null = null) {
    setDraft(next);
    setSelectedQuick(quick);
    onApply(next);
  }

  const patch = <K extends keyof TeamTactics>(key: K, value: TeamTactics[K]) =>
    commit({ ...draft, [key]: value });

  return (
    <section className={`match-tactics-editor match-tactics-editor--${variant}`}>
      {variant === "match" && <div className="match-tactics-editor__summary">
        <div>
          <span>
            <TeamFlag fifaCode={userCode} className="match-tactics-editor__flag" />
            <small>{userCode}</small>
          </span>
          <strong>{userTeamName}</strong>
          {/* Formation lives with the lineup, on the squad tab. */}
          <small>{formationLabel ?? formation}</small>
        </div>
        <TacticShape formation={formation} tactics={draft} />
      </div>}

      <div className="match-tactics-editor__body">
        <nav className="match-tactics-tabs" aria-label="전술 설정 분류">
          {([
            ["quick", "빠른 지시"],
            ["style", "스타일"],
            ["general", "일반"],
            ["attack", "공격"],
            ["defense", "수비"],
            ["roles", "역할"],
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
                {QUICK_TACTICS.filter((preset) => preset.group === "orientation").map((preset) => (
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
              <p>
                빠른 지시는 여러 세부 설정을 한 번에 변경합니다. 선택 즉시 저장되며,
                경기 중에는 다음 플레이부터 반영됩니다.
              </p>
            </div>
          )}
          {tab === "style" && (
            <div className="quick-tactics">
              <div className="quick-tactics__grid">
                {QUICK_TACTICS.filter((preset) => preset.group === "style").map((preset) => (
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
              <p>
                경기 전에 고른 전술 스타일과 같은 기준입니다. 선택 즉시 저장되며,
                경기 중에는 다음 플레이부터 반영됩니다.
              </p>
            </div>
          )}
          {tab === "roles" && (
            <div className="tactic-field-grid">
              <TacticSelect label="공격수 역할" value={draft.strikerRole} options={OPTIONS.strikerRole} onChange={(value) => patch("strikerRole", value as TeamTactics["strikerRole"])} />
              <TacticSelect label="미드필더 역할" value={draft.midfieldRole} options={OPTIONS.midfieldRole} onChange={(value) => patch("midfieldRole", value as TeamTactics["midfieldRole"])} />
              <TacticSelect label="풀백 역할" value={draft.fullbackRole} options={OPTIONS.fullbackRole} onChange={(value) => patch("fullbackRole", value as TeamTactics["fullbackRole"])} />
              <div className="role-explainer">
                <strong>역할 조합도 경기 판정에 반영됩니다</strong>
                <span>침투형 공격수는 슈팅 빈도, 플레이메이커는 창의적인 패스, 오버래핑 풀백은 측면 공격 가담을 높입니다.</span>
              </div>
            </div>
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
              <TacticSelect label="빌드업 플레이" value={draft.buildUpPlay} options={OPTIONS.buildUpPlay} onChange={(value) => patch("buildUpPlay", value as TeamTactics["buildUpPlay"])} />
              <TacticSelect label="기회 만들기" value={draft.chanceCreation} options={OPTIONS.chanceCreation} onChange={(value) => patch("chanceCreation", value as TeamTactics["chanceCreation"])} />
              <TacticSelect label="패싱 스타일" value={draft.passingStyle} options={OPTIONS.passingStyle} onChange={(value) => patch("passingStyle", value as TeamTactics["passingStyle"])} />
              <TacticSelect label="공격 방향" value={draft.attackFocus} options={OPTIONS.attackFocus} onChange={(value) => patch("attackFocus", value as TeamTactics["attackFocus"])} />
              <TacticSelect label="슈팅 지시" value={draft.shooting} options={OPTIONS.shooting} onChange={(value) => patch("shooting", value as TeamTactics["shooting"])} />
              <TacticSelect label="와이드 플레이" value={draft.widePlay} options={OPTIONS.widePlay} onChange={(value) => patch("widePlay", value as TeamTactics["widePlay"])} />
              <TacticMeter label="잔류 수비 인원" value={draft.restDefense} min={2} max={5} onChange={(value) => patch("restDefense", value)} />
            </div>
          )}
          {tab === "defense" && (
            <div className="tactic-field-grid">
              <TacticSelect label="수비 스타일" value={draft.defenseStyle} options={OPTIONS.defenseStyle} onChange={(value) => patch("defenseStyle", value as TeamTactics["defenseStyle"])} />
              <TacticSelect label="수비 라인" value={draft.defensiveLine} options={OPTIONS.defensiveLine} onChange={(value) => patch("defensiveLine", value as TeamTactics["defensiveLine"])} />
              <TacticSelect label="압박 강도" value={draft.pressing} options={OPTIONS.pressing} onChange={(value) => patch("pressing", value as TeamTactics["pressing"])} />
              <TacticSelect label="마킹 방식" value={draft.marking} options={OPTIONS.marking} onChange={(value) => patch("marking", value as TeamTactics["marking"])} />
              <TacticSelect label="태클 강도" value={draft.tackling} options={OPTIONS.tackling} onChange={(value) => patch("tackling", value as TeamTactics["tackling"])} />
              <TacticSelect label="압박 시작 위치" value={draft.lineOfEngagement} options={OPTIONS.lineOfEngagement} onChange={(value) => patch("lineOfEngagement", value as TeamTactics["lineOfEngagement"])} />
              <TacticSelect label="라인 간격" value={draft.compactness} options={OPTIONS.compactness} onChange={(value) => patch("compactness", value as TeamTactics["compactness"])} />
              <TacticSelect label="오프사이드 트랩" value={draft.offsideTrap ? "on" : "off"} options={OPTIONS.offsideTrap} onChange={(value) => patch("offsideTrap", value === "on")} />
              <TacticMeter label="수비 깊이" value={draft.depth} onChange={(value) => patch("depth", value)} />
            </div>
          )}
        </div>
      </div>

    </section>
  );
}

export function TacticItemBoxSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const currentLabel = options.find(([optionValue]) => optionValue === value)?.[1] ?? value;

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

function TacticMeter({ label, value, min = 1, max = 10, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (value: number) => void }) {
  return (
    <label className="match-tactic-field match-tactic-field--range">
      <span>{label}<strong>{value}</strong></span>
      <input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

/**
 * Drawn from the selected formation's slots rather than a fixed set of points,
 * so switching formation mid-match actually redraws the shape. The pitch runs
 * left-to-right here while slot coordinates are top-down, hence the swap.
 */
function TacticShape({
  formation,
  tactics,
}: {
  formation: FormationKey;
  tactics: TeamTactics;
}) {
  return (
    <svg className="tactic-shape" viewBox="0 0 100 100" role="img" aria-label="현재 전술 형태">
      <rect x="2" y="2" width="96" height="96" rx="4" />
      <line x1="50" y1="2" x2="50" y2="98" />
      <circle cx="50" cy="50" r="12" />
      {slotsOf(formation).map((slot) => {
        const coordinate = tacticalCoordinate(slot, slot, tactics);
        return (
          <circle
            key={slot.id}
            cx={Math.max(7, Math.min(93, 100 - coordinate.y))}
            cy={Math.max(7, Math.min(93, coordinate.x))}
            r="3.2"
          />
        );
      })}
    </svg>
  );
}
