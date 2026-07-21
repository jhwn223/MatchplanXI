import { forwardRef } from "react";
import { motion } from "framer-motion";
import { conditionColor } from "../data/conditionEngine";
import type { ConditionBreakdown } from "../data/conditionEngine";
import type { Player } from "../data/types";

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
}

const VARIANTS = {
  idle: { scale: 1, opacity: 1, rotate: 0, boxShadow: "0 2px 6px rgba(0,0,0,0.2)" },
  "dragging-source": { scale: 1, opacity: 0.32, rotate: 0, boxShadow: "0 2px 6px rgba(0,0,0,0.2)" },
  floating: { scale: 1.07, opacity: 1, rotate: -2, boxShadow: "0 16px 28px rgba(0,0,0,0.4)" },
};

export const PlayerCardVisual = forwardRef<HTMLDivElement, Props>(
  (
    { player, condition, variant, state = "idle", style, listeners, attributes, useLayoutId = true },
    ref
  ) => {
    const color = condition ? conditionColor(condition.score) : "hsl(210, 10%, 55%)";

    return (
      <motion.div
        ref={ref}
        {...(listeners as object)}
        {...(attributes as object)}
        style={style}
        className={`player-card player-card--${variant}`}
        data-dragging={state !== "idle" || undefined}
        layoutId={useLayoutId ? `player-${player.player_id}` : undefined}
        initial={false}
        animate={VARIANTS[state]}
        whileTap={state === "idle" ? { scale: 1.05 } : undefined}
        transition={{ type: "spring", stiffness: 500, damping: 28 }}
      >
        <motion.div
          className="player-card__ring"
          animate={{ backgroundColor: color, borderColor: color }}
          transition={{ duration: 0.45, ease: "easeOut" }}
        >
          <span className="player-card__initials">{initials(player.player_name)}</span>
        </motion.div>
        <div className="player-card__meta">
          <span className="player-card__name">{player.player_name}</span>
          <span className="player-card__sub">
            {player.position} · {player.caps} caps
          </span>
        </div>
        {condition && (
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? "";
  return last.slice(0, 2).toUpperCase();
}
