import type { RefObject } from "react";
import { motion } from "framer-motion";
import type { FormationSlot, FormationKey } from "../data/formation";
import type { ConditionBreakdown } from "../data/conditionEngine";
import type { Player } from "../data/types";
import type { TacticalPreset } from "../data/tactics";
import { Pitch } from "./Pitch";
import { Bench } from "./Bench";
import { TacticsPanel } from "./TacticsPanel";

interface Props {
  scoreUser: number;
  scoreOpp: number;
  userCode: string;
  oppCode: string;
  formation: FormationKey;
  formationDef: FormationSlot[];
  heatmapFormation?: FormationSlot[];
  pitchRef?: RefObject<HTMLDivElement | null>;
  slots: Record<string, number | null>;
  benchPlayers: Player[];
  playersById: Map<number, Player>;
  conditions: Map<number, ConditionBreakdown>;
  subsUsed: number;
  subsMax: number;
  activePresetKey: string | null;
  onSelectFormation: (key: FormationKey) => void;
  onApplyPreset: (preset: TacticalPreset) => void;
  onAutoFill: () => void;
  onConfirm: () => void;
}

export function HalftimeModal({
  scoreUser,
  scoreOpp,
  userCode,
  oppCode,
  formation,
  formationDef,
  heatmapFormation,
  pitchRef,
  slots,
  benchPlayers,
  playersById,
  conditions,
  subsUsed,
  subsMax,
  activePresetKey,
  onSelectFormation,
  onApplyPreset,
  onAutoFill,
  onConfirm,
}: Props) {
  const subsLeft = Math.max(0, subsMax - subsUsed);

  return (
    <motion.div className="sim-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        className="arena-modal halftime-modal"
        initial={{ scale: 0.95, y: 16, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
      >
        <div className="arena-score">
          <span className="arena-score__side">{userCode}</span>
          <span className="arena-score__nums">
            {scoreUser} : {scoreOpp}
          </span>
          <span className="arena-score__side arena-score__side--opp">{oppCode}</span>
          <span className="halftime-modal__badge">하프타임</span>
        </div>

        <p className="halftime-modal__hint">
          벤치 선수를 필드로 드래그해 교체하거나, 포메이션을 바꿔 후반전을 준비하세요.
        </p>

        <div className="halftime-modal__body">
          <aside className="halftime-modal__sidebar">
            <TacticsPanel
              formation={formation}
              onSelectFormation={onSelectFormation}
              onApplyPreset={onApplyPreset}
              onAutoFill={onAutoFill}
              activePresetKey={activePresetKey}
            />
            <div className="halftime-modal__subs">
              선수 교체 <b>{subsUsed}</b>/{subsMax} 사용
              {subsLeft === 0 && <span className="halftime-modal__subs-warn"> · 교체 카드 소진</span>}
            </div>
          </aside>

          <div className="halftime-modal__pitch">
            <Pitch
              ref={pitchRef}
              formation={formationDef}
              heatmapFormation={heatmapFormation}
              slots={slots}
              playersById={playersById}
              conditions={conditions}
            />
          </div>

          <div className="halftime-modal__bench">
            <Bench benchPlayers={benchPlayers} conditions={conditions} />
          </div>
        </div>

        <div className="halftime-modal__actions">
          <button type="button" className="sim-btn" onClick={onConfirm}>
            후반전 시작 →
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
