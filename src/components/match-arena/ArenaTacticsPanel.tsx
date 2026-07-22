import type { FormationKey } from "../../data/formation";
import {
  TACTIC_SELECTS,
  type BuildUpPlay,
  type ChanceCreation,
  type DefenseStyle,
  type TacticMeterKey,
  type TacticSelectKey,
  type TeamTactics,
} from "./tactics";

interface Props {
  userTeamName: string;
  userCode: string;
  formation: FormationKey;
  formationLabel?: string;
  tactics: TeamTactics;
  openSelect: TacticSelectKey | null;
  onOpenSelect: (key: TacticSelectKey | null) => void;
  onSelect: <K extends TacticSelectKey>(key: K, value: TeamTactics[K]) => void;
  onNudge: (key: TacticMeterKey, delta: number) => void;
}

export function ArenaTacticsPanel({
  userTeamName,
  userCode,
  formation,
  formationLabel,
  tactics,
  openSelect,
  onOpenSelect,
  onSelect,
  onNudge,
}: Props) {
  return (
    <div className="arena-team-tactics">
      <div className="arena-team-tactics__head"><strong>팀 전술</strong><span>{userTeamName}</span></div>
      <div className="arena-team-tactics__formation">{userCode} / {formationLabel ?? formation}</div>
      <TacticSelectRow
        label="수비 스타일"
        value={tactics.defenseStyle}
        selectKey="defenseStyle"
        openKey={openSelect}
        onToggle={onOpenSelect}
        onSelect={(value) => onSelect("defenseStyle", value as DefenseStyle)}
      />
      <TacticMeter label="폭" value={tactics.width} onNudge={(delta) => onNudge("width", delta)} />
      <TacticMeter label="깊이" value={tactics.depth} onNudge={(delta) => onNudge("depth", delta)} />
      <div className="arena-team-tactics__section">공격</div>
      <TacticSelectRow
        label="빌드업 플레이"
        value={tactics.buildUpPlay}
        selectKey="buildUpPlay"
        openKey={openSelect}
        onToggle={onOpenSelect}
        onSelect={(value) => onSelect("buildUpPlay", value as BuildUpPlay)}
      />
      <TacticSelectRow
        label="기회 만들기"
        value={tactics.chanceCreation}
        selectKey="chanceCreation"
        openKey={openSelect}
        onToggle={onOpenSelect}
        onSelect={(value) => onSelect("chanceCreation", value as ChanceCreation)}
      />
      <TacticMeter label="폭" value={tactics.attackWidth} onNudge={(delta) => onNudge("attackWidth", delta)} />
      <TacticMeter label="박스 안쪽 선수" value={tactics.boxPlayers} onNudge={(delta) => onNudge("boxPlayers", delta)} />
      <TacticMeter label="코너킥" value={tactics.corners} onNudge={(delta) => onNudge("corners", delta)} />
      <TacticMeter label="프리킥" value={tactics.freeKicks} onNudge={(delta) => onNudge("freeKicks", delta)} />
    </div>
  );
}

function TacticSelectRow({
  label,
  value,
  selectKey,
  openKey,
  onToggle,
  onSelect,
}: {
  label: string;
  value: string;
  selectKey: TacticSelectKey;
  openKey: TacticSelectKey | null;
  onToggle: (key: TacticSelectKey | null) => void;
  onSelect: (value: string) => void;
}) {
  const config = TACTIC_SELECTS[selectKey];
  const currentLabel = config.options.find((option) => option.value === value)?.label ?? "밸런스";
  const open = openKey === selectKey;
  return (
    <div className="tactic-row-wrap">
      <button type="button" className="tactic-row tactic-row--select" onClick={() => onToggle(open ? null : selectKey)}>
        <span>{label}</span><strong>{currentLabel}</strong><span className="tactic-row__chevron">▾</span>
      </button>
      {open && (
        <div className="tactic-menu">
          <div className="tactic-menu__title">{config.title}<button type="button" onClick={() => onToggle(null)}>×</button></div>
          {config.options.map((option) => (
            <button
              key={option.value}
              type="button"
              className="tactic-menu__option"
              data-active={option.value === value || undefined}
              onClick={() => onSelect(option.value)}
            >
              <span>{option.label}</span>{option.value === value && <strong>✓</strong>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TacticMeter({ label, value, onNudge }: { label: string; value: number; onNudge: (delta: number) => void }) {
  return (
    <div className="tactic-row tactic-row--meter">
      <span>{label}</span><strong>{value}</strong>
      <button type="button" className="tactic-step" onClick={() => onNudge(-1)} aria-label={`${label} 낮추기`}>◂</button>
      <div className="tactic-meter" aria-hidden="true">
        {Array.from({ length: 10 }).map((_, index) => <span key={index} data-on={index < value || undefined} />)}
      </div>
      <button type="button" className="tactic-step" onClick={() => onNudge(1)} aria-label={`${label} 높이기`}>▸</button>
    </div>
  );
}
