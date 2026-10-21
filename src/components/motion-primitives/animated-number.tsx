'use client';
// From motion-primitives (MIT, ibelick/motion-primitives). Adapted: optional
// `format` so currency renders while it springs, and the motion component is
// created once instead of on every render.
import { cn } from '@/lib/utils';
import { motion, SpringOptions, useSpring, useTransform } from 'motion/react';
import { useEffect } from 'react';

export type AnimatedNumberProps = {
  value: number;
  className?: string;
  springOptions?: SpringOptions;
  format?: (n: number) => string;
};

export function AnimatedNumber({ value, className, springOptions, format }: AnimatedNumberProps) {
  const spring = useSpring(value, springOptions ?? { bounce: 0, duration: 700 });
  const display = useTransform(spring, (current) => (format ? format(Math.round(current)) : Math.round(current).toLocaleString()));

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return <motion.span className={cn('tabular-nums', className)}>{display}</motion.span>;
}
