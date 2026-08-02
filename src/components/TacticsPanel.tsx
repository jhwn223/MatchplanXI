import { FORMATION_KEYS, type FormationKey } from "../data/formation";
import { attackBiasLabel, formationTraits } from "../data/formationTraits";
import { TACTIC_STYLES, recommendedStylesFor, type TacticStyleKey } from "../data/tactics";

interface Props {
  selectedFormation: FormationKey;
  detectedFormation: string;
  attackBias: number;
  onSelectFormation: (key: FormationKey) => void;
  onAutoFill: () => void;
  tacticStyleKey: TacticStyleKey | null;
  onSelectTacticStyle?: (key: TacticStyleKey) => void;
  showStyles?: boolean;
  /** true once kickoff has happened. Auto-fill still works then, but it only
   *  draws on the players already involved plus the remaining substitution
   *  allowance, so it cannot exceed the cap. */
  subsLocked?: boolean;
}

export function TacticsPanel({
  selectedFormation,
  detectedFormation,
  attackBias,
  onSelectFormation,
  onAutoFill,
  tacticStyleKey,
  onSelectTacticStyle,
  showStyles = true,
  subsLocked = false,
}: Props) {
  const lockedTitle = "남은 교체 인원 안에서 최적 조합을 배치합니다";
  const traits = formationTraits(selectedFormation);
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
          onClick={onAutoFill}
          title={subsLocked ? lockedTitle : undefined}
        >
          ⚡ 11인 자동 배치
        </button>
        <span className="tactics-panel__hint">
          감지된 형태 {detectedFormation} · {attackBiasLabel(attackBias)}
        </span>
      </div>

      <div className="tactics-panel__section">
        <span className="tactics-panel__label">{selectedFormation} 장단점</span>
        <div className="formation-summary">
          <div className="formation-summary__col formation-summary__col--pros">
            <strong>👍 장점</strong>
            <ul>
              {traits.pros.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
          <div className="formation-summary__col formation-summary__col--cons">
            <strong>👎 단점</strong>
            <ul>
              {traits.cons.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {showStyles && <div className="tactics-panel__section">
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
              onClick={() => onSelectTacticStyle?.(s.key)}
              title={s.description}
            >
              {recommended.includes(s.key) && <span className="style-btn__badge">⭐ 추천</span>}
              <span className="style-btn__emoji">{s.emoji}</span>
              <span className="style-btn__label">{s.label}</span>
            </button>
          ))}
        </div>
      </div>}
    </div>
  );
}
