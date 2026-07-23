import { useState } from "react";
import type { FormationKey } from "../../data/formation";
import {
  applyQuickTactic,
  DEFAULT_TEAM_TACTICS,
  QUICK_TACTICS,
  type QuickTacticKey,
  type TeamTactics,
} from "./tactics";

type TacticsTab = "quick" | "roles" | "general" | "attack" | "defense";

interface Props {
  userTeamName: string;
  userCode: string;
  formation: FormationKey;
  formationLabel?: string;
  tactics: TeamTactics;
  onApply: (tactics: TeamTactics) => void;
  onCancel: () => void;
}

const OPTIONS = {
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
} as const;

export function ArenaTacticsPanel({
  userTeamName,
  userCode,
  formation,
  formationLabel,
  tactics,
  onApply,
  onCancel,
}: Props) {
  const [draft, setDraft] = useState<TeamTactics>(tactics);
  const [tab, setTab] = useState<TacticsTab>("quick");

  const patch = <K extends keyof TeamTactics>(key: K, value: TeamTactics[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <section className="match-tactics-editor">
      <div className="match-tactics-editor__summary">
        <div>
          <span>{userCode}</span>
          <strong>{userTeamName}</strong>
          <small>{formationLabel ?? formation}</small>
        </div>
        <TacticShape tactics={draft} />
      </div>

      <div className="match-tactics-editor__body">
        <nav className="match-tactics-tabs" aria-label="전술 설정 분류">
          {([
            ["quick", "빠른 지시"],
            ["roles", "팀 역할"],
            ["general", "일반"],
            ["attack", "공격"],
            ["defense", "수비"],
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
                    onClick={() => setDraft((current) => applyQuickTactic(current, preset.key as QuickTacticKey))}
                  >
                    <strong>{preset.label}</strong>
                    <span>{preset.description}</span>
                  </button>
                ))}
              </div>
              <p>빠른 지시는 여러 세부 설정을 한 번에 변경합니다. 아래 적용 버튼을 누른 다음 생성되는 플레이부터 반영됩니다.</p>
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
              <TacticSelect label="패싱 스타일" value={draft.passingStyle} options={OPTIONS.passingStyle} onChange={(value) => patch("passingStyle", value as TeamTactics["passingStyle"])} />
              <TacticSelect label="공격 방향" value={draft.attackFocus} options={OPTIONS.attackFocus} onChange={(value) => patch("attackFocus", value as TeamTactics["attackFocus"])} />
              <TacticSelect label="슈팅 지시" value={draft.shooting} options={OPTIONS.shooting} onChange={(value) => patch("shooting", value as TeamTactics["shooting"])} />
              <TacticSelect label="와이드 플레이" value={draft.widePlay} options={OPTIONS.widePlay} onChange={(value) => patch("widePlay", value as TeamTactics["widePlay"])} />
              <TacticMeter label="박스 침투 인원" value={draft.boxPlayers} onChange={(value) => patch("boxPlayers", value)} />
              <TacticToggle label="역습 허용" checked={draft.counterAttack} onChange={(value) => patch("counterAttack", value)} />
            </div>
          )}
          {tab === "defense" && (
            <div className="tactic-field-grid">
              <TacticSelect label="수비 라인" value={draft.defensiveLine} options={OPTIONS.defensiveLine} onChange={(value) => patch("defensiveLine", value as TeamTactics["defensiveLine"])} />
              <TacticSelect label="압박 강도" value={draft.pressing} options={OPTIONS.pressing} onChange={(value) => patch("pressing", value as TeamTactics["pressing"])} />
              <TacticSelect label="마킹 방식" value={draft.marking} options={OPTIONS.marking} onChange={(value) => patch("marking", value as TeamTactics["marking"])} />
              <TacticSelect label="태클 강도" value={draft.tackling} options={OPTIONS.tackling} onChange={(value) => patch("tackling", value as TeamTactics["tackling"])} />
              <TacticMeter label="수비 깊이" value={draft.depth} onChange={(value) => patch("depth", value)} />
            </div>
          )}
        </div>
      </div>

      <footer className="match-tactics-actions">
        <button type="button" className="sim-btn sim-btn--ghost" onClick={onCancel}>취소</button>
        <button type="button" className="sim-btn sim-btn--ghost" onClick={() => setDraft(DEFAULT_TEAM_TACTICS)}>초기화</button>
        <button type="button" className="sim-btn sim-btn--accent" onClick={() => onApply(draft)}>전술 적용</button>
      </footer>
    </section>
  );
}

function TacticSelect({
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
  return (
    <label className="match-tactic-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
    </label>
  );
}

function TacticMeter({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="match-tactic-field match-tactic-field--range">
      <span>{label}<strong>{value}</strong></span>
      <input type="range" min="1" max="10" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function TacticToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="match-tactic-field match-tactic-field--toggle">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function TacticShape({ tactics }: { tactics: TeamTactics }) {
  const push = tactics.mentality === "attacking" ? 8 : tactics.mentality === "positive" ? 4 : tactics.mentality === "defensive" ? -7 : 0;
  const widthScale = tactics.width === "narrow" ? 0.66 : tactics.width === "wide" ? 1.18 : 1;
  const points = [[13, 50], [30, 18], [30, 40], [30, 62], [30, 82], [53, 28], [53, 52], [53, 75], [76, 20], [76, 50], [76, 80]];
  return (
    <svg className="tactic-shape" viewBox="0 0 100 100" role="img" aria-label="현재 전술 형태">
      <rect x="2" y="2" width="96" height="96" rx="4" />
      <line x1="50" y1="2" x2="50" y2="98" />
      <circle cx="50" cy="50" r="12" />
      {points.map(([x, y], index) => <circle key={index} cx={index === 0 ? x : Math.max(7, Math.min(93, x + push))} cy={50 + (y - 50) * widthScale} r="3.2" />)}
    </svg>
  );
}
