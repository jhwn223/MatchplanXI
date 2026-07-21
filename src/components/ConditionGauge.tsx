import { useEffect, useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { conditionColor } from "../data/conditionEngine";

interface Props {
  value: number | null;
  filledCount: number;
}

export function ConditionGauge({ value, filledCount }: Props) {
  const motionValue = useMotionValue(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const target = value ?? 0;
    const controls = animate(motionValue, target, {
      duration: 0.6,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(v),
    });
    return () => controls.stop();
  }, [value, motionValue]);

  const color = useTransform(motionValue, (v) => conditionColor(v));
  const pct = Math.max(0, Math.min(100, display));

  return (
    <div className="gauge">
      <span className="gauge__title">팀 고지대 컨디션 지수</span>
      <div className="gauge__track">
        <motion.div
          className="gauge__fill"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <div className="gauge__readout">
        <motion.span className="gauge__number" style={{ color }}>
          {value == null ? "–" : Math.round(display)}
        </motion.span>
        <span className="gauge__sub">
          {filledCount}/11 명 배치됨
        </span>
      </div>
    </div>
  );
}
