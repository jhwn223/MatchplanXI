import { forwardRef } from "react";
import { motion } from "framer-motion";
import { conditionColor } from "../data/conditionEngine";
import type { ConditionBreakdown } from "../data/conditionEngine";
import type { Player } from "../data/types";
import { PlayerPhoto } from "./player-photo/PlayerPhoto";
import type { PlayerDiscipline } from "./playerDiscipline";

export type CardVisualState = "idle" | "dragging-source" | "floating";

interface Props {
  player: Player;
  condition?: ConditionBreakdown;
  variant: "bench" | "slot";
  state?: CardVisualState;
  style?: React.CSSProperties;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listeners?: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attributes?: Record<string, any>;
  useLayoutId?: boolean;
  ineligible?: boolean;
  discipline?: PlayerDiscipline;
  onSelect?: (player: Player) => void;
}

const VARIANTS = {
  idle: { scale: 1, opacity: 1, rotate: 0, boxShadow: "0 2px 6px rgba(0,0,0,0.2)" },
  // opacity stays 1 here on purpose: the drag source is hidden via the plain
  // `visibility: hidden` style instead, so the shared layoutId transition
  // doesn't inherit a stale opacity:0 when the card reappears at its new slot.
  "dragging-source": { scale: 1, opacity: 1, rotate: 0, boxShadow: "none" },
  floating: { scale: 1.07, opacity: 1, rotate: -2, boxShadow: "0 16px 28px rgba(0,0,0,0.4)" },
};

export const PlayerCardVisual = forwardRef<HTMLDivElement, Props>(
  (
    { player, condition, variant, state = "idle", style, listeners, attributes, useLayoutId = false, ineligible, discipline, onSelect },
    ref
  ) => {
    const color = condition ? conditionColor(condition.score) : "hsl(210, 10%, 55%)";
    const ability = player.ability;
    const keyStats = ability ? keyAbilityStats(player) : null;

    return (
      <motion.div
        ref={ref}
        {...(ineligible ? {} : (listeners as object))}
        {...(attributes as object)}
        style={style}
        className={`player-card player-card--${variant}`}
        data-discipline={discipline}
        data-dragging={state !== "idle" || undefined}
        data-ineligible={ineligible || undefined}
        onClick={(event) => {
          if (state !== "idle") return;
          event.stopPropagation();
          onSelect?.(player);
        }}
        layoutId={useLayoutId ? `player-${player.player_id}` : undefined}
        initial={false}
        animate={VARIANTS[state]}
        // No whileTap scale here on purpose: this element is also the drag
        // source (see PlayerCard.tsx), and dnd-kit measures its rect right as
        // the drag activates. A tap-scale still in effect at that moment
        // throws the measurement off by a fixed amount, so the floating
        // DragOverlay copy trails the cursor at a constant offset for the
        // whole drag.
        transition={state === "dragging-source" ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 28 }}
      >
        <motion.div
          className="player-card__ring"
          animate={{ backgroundColor: color, borderColor: color }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <PlayerPhoto player={player} className="player-card__photo" />
          {discipline && (
            <span
              className={`player-card__discipline player-card__discipline--${discipline}`}
              title={discipline === "red" ? "레드카드" : "옐로카드"}
              aria-label={discipline === "red" ? "레드카드" : "옐로카드"}
            />
          )}
        </motion.div>
        <div className="player-card__meta">
          <span className="player-card__name">{player.player_name}</span>
          <span className="player-card__sub">
            {ability
              ? variant === "slot" ? `OVR ${ability.overall}` : `OVR ${ability.overall} · ${keyStats}`
              : `${player.position} · ${player.caps} caps`}
          </span>
        </div>
        {ineligible && <span className="player-card__ineligible">교체 불가</span>}
        {condition && variant === "slot" && (
          <span
            className="player-card__condition"
            title={`컨디션 ${Math.round(condition.score)}%`}
            aria-label={`컨디션 ${Math.round(condition.score)}%`}
          >
            <motion.i
              animate={{ width: `${condition.score}%`, backgroundColor: color }}
              transition={{ duration: 0.45, ease: "easeOut" }}
            />
          </span>
        )}
        {condition && variant === "bench" && (
          <motion.span
            className="player-card__score"
            animate={{ color }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          >
            {Math.round(condition.score)}
          </motion.span>
        )}
      </motion.div>
    );
  }
);
PlayerCardVisual.displayName = "PlayerCardVisual";

function keyAbilityStats(player: Player): string {
  const ability = player.ability!;
  if (player.position === "GK") return `GK ${Math.round((ability.gkDiving + ability.gkHandling + ability.gkPositioning + ability.gkReflexes) / 4)}`;
  if (player.position === "DEF") return `DEF ${ability.defending} · PHY ${ability.physical}`;
  if (player.position === "MID") return `PAS ${ability.passing} · DRI ${ability.dribbling}`;
  return `PAC ${ability.pace} · SHO ${ability.shooting}`;
}
