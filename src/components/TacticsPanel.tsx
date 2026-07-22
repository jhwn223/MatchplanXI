import { FORMATIONS, FORMATION_KEYS, type FormationKey } from "../data/formation";
import { TACTIC_STYLES, recommendedStylesFor, type TacticStyleKey } from "../data/tactics";

interface Props {
  selectedFormation: FormationKey;
  detectedFormation: string;
  attackBias: number;
  onSelectFormation: (key: FormationKey) => void;
  onAutoFill: () => void;
  tacticStyleKey: TacticStyleKey | null;
  onSelectTacticStyle: (key: TacticStyleKey) => void;
  /** true once kickoff has happened: auto-fill could add unlimited new
   *  faces, bypassing the substitution cap, so it's disabled after that —
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
  selectedFormation,
  detectedFormation,
  attackBias,
  onSelectFormation,
  onAutoFill,
  tacticStyleKey,
  onSelectTacticStyle,
  subsLocked = false,
}: Props) {
  const lockedTitle = "킥오프 이후에는 자동 배치를 쓸 수 없습니다 — 벤치에서 직접 교체하세요";
  const formationMeta = FORMATIONS[selectedFormation];
  const recommended = recommendedStylesFor(selectedFormation);

  return (
    <div className="tactics-panel">
      <div className="tactics-panel__section">
        <span className="tactics-panel__label">포메이션 선택</span>
        <div className="formation-grid">
          {FORMATION_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className="formation-btn"
              data-active={key === selectedFormation || undefined}
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
        <span className="tactics-panel__hint">
          감지된 형태 {detectedFormation} · {biasLabel(attackBias)}
        </span>
      </div>

      <div className="tactics-panel__section">
        <span className="tactics-panel__label">{selectedFormation} 장단점</span>
        <div className="formation-summary">
          <div className="formation-summary__col formation-summary__col--pros">
            <strong>👍 장점</strong>
            <ul>
              {formationMeta.pros.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
          <div className="formation-summary__col formation-summary__col--cons">
            <strong>👎 단점</strong>
            <ul>
              {formationMeta.cons.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="tactics-panel__section">
        <span className="tactics-panel__label">
          전술 스타일 {recommended.length > 0 && "· ⭐ 추천 표시 참고"}
        </span>
        <div className="style-grid">
          {TACTIC_STYLES.map((s) => (
            <button
              key={s.key}
              type="button"
              className="style-btn"
              data-active={s.key === tacticStyleKey || undefined}
              data-recommended={recommended.includes(s.key) || undefined}
              onClick={() => onSelectTacticStyle(s.key)}
              title={s.description}
            >
              {recommended.includes(s.key) && <span className="style-btn__badge">⭐ 추천</span>}
              <span className="style-btn__emoji">{s.emoji}</span>
              <span className="style-btn__label">{s.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
