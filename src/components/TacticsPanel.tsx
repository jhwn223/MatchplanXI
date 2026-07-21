import { FORMATION_KEYS, FORMATIONS, type FormationKey } from "../data/formation";
import { TACTICAL_PRESETS, type TacticalPreset } from "../data/tactics";

interface Props {
  formation: FormationKey;
  onSelectFormation: (key: FormationKey) => void;
  onApplyPreset: (preset: TacticalPreset) => void;
  onAutoFill: () => void;
  activePresetKey: string | null;
}

function biasLabel(bias: number): string {
  if (bias >= 0.7) return "초공격";
  if (bias >= 0.3) return "공격";
  if (bias <= -0.5) return "수비";
  if (bias <= -0.2) return "안정";
  return "균형";
}

export function TacticsPanel({
  formation,
  onSelectFormation,
  onApplyPreset,
  onAutoFill,
  activePresetKey,
}: Props) {
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
              onClick={() => onApplyPreset(p)}
              title={p.description}
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
          포메이션 · {biasLabel(FORMATIONS[formation].attackBias)}
        </span>
        <div className="formation-grid">
          {FORMATION_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className="formation-btn"
              data-active={key === formation || undefined}
              onClick={() => onSelectFormation(key)}
            >
              {key}
            </button>
          ))}
        </div>
        <button type="button" className="autofill-btn" onClick={onAutoFill}>
          ⚡ 자동 배치 (최적 11인)
        </button>
      </div>
    </div>
  );
}
