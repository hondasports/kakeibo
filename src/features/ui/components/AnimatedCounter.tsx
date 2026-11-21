import { motion, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";

/**
 * AnimatedCounter コンポーネントのプロパティ
 */
interface AnimatedCounterProps {
  /** 表示する数値 */
  value: number;
  /** 数値の前に表示する接頭辞（例: "¥"） */
  prefix?: string;
  /** 数値の後に表示する接尾辞（例: "円"） */
  suffix?: string;
  /** アニメーションの持続時間（秒） */
  duration?: number;
}

/**
 * 数値が変更されたときにスプリングアニメーションで変化を表示するコンポーネント
 *
 * @example
 * ```tsx
 * <AnimatedCounter value={1234} suffix="円" />
 * ```
 */
export function AnimatedCounter({
  value,
  prefix = "",
  suffix = "",
  duration = 0.5,
}: AnimatedCounterProps) {
  const spring = useSpring(0, {
    duration,
    bounce: 0,
  });
  const shouldReduceMotion = useReducedMotion();

  const display = useTransform(spring, (current) => Math.round(current).toLocaleString("ja-JP"));

  useEffect(() => {
    if (shouldReduceMotion) {
      spring.jump(value);
    } else {
      spring.set(value);
    }
  }, [shouldReduceMotion, spring, value]);

  return (
    <span data-value={`${prefix}${value.toLocaleString("ja-JP")}${suffix}`}>
      {prefix}
      <motion.span>{display}</motion.span>
      {suffix}
    </span>
  );
}
