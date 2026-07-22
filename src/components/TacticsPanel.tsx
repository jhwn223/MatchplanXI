import { FORMATION_KEYS, type FormationKey } from "../data/formation";
import { TACTICAL_PRESETS, type TacticalPreset } from "../data/tactics";

interface Props {
  detectedFormation: string;
  attackBias: number;
  onSelectFormation: (key: FormationKey) => void;
  onApplyPreset: (preset: TacticalPreset) => void;
  onAutoFill: () => void;
  activePresetKey: string | null;
  /** true once kickoff has happened: auto-fill/presets could add unlimited new
   *  faces, bypassing the substitution cap, so they're disabled after that —
   *  only the (capped) manual bench drag and formation reshuffling remain. */
  subsLocked?: boolean;
}

function biasLabel(bias: number): string {
  if (bias >= 0.7) return "초공격";
  if (bias >= 0.3) return "공격";
  if (bias <= -0.5) return "수비";
  if (bias <= -0.2) return "안정";
  return "균형";
}

export function TacticsPanel({
  detectedFormation,
  attackBias,
  onSelectFormation,
  onApplyPreset,
  onAutoFill,
  activePresetKey,
  subsLocked = false,
}: Props) {
  const lockedTitle = "킥오프 이후에는 자동 배치를 쓸 수 없습니다 — 벤치에서 직접 교체하세요";
  return (
    <div className="tactics-panel">
      <div className="tactics-panel__section">
        <span className="tactics-panel__label">자동 전술</span>
        <div className="preset-grid">
          {TACTICAL_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              className="preset-btn"
              data-active={p.key === activePresetKey || undefined}
              disabled={subsLocked}
              onClick={() => onApplyPreset(p)}
              title={subsLocked ? lockedTitle : p.description}
            >
              <span className="preset-btn__emoji">{p.emoji}</span>
              <span className="preset-btn__label">{p.label}</span>
              <span className="preset-btn__form">{p.formation}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="tactics-panel__section">
        <span className="tactics-panel__label">
          자동 인식 {detectedFormation} · {biasLabel(attackBias)}
        </span>
        <div className="formation-grid">
          {FORMATION_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className="formation-btn"
              data-active={(key === detectedFormation) || undefined}
              onClick={() => onSelectFormation(key)}
            >
              {key}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="autofill-btn"
          disabled={subsLocked}
          onClick={onAutoFill}
          title={subsLocked ? lockedTitle : undefined}
        >
          ⚡ 자동 배치 (최적 11인)
        </button>
      </div>
    </div>
  );
}
