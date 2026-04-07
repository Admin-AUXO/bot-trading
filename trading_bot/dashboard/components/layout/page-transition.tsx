"use client";

import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();
  const hasMounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const shouldAnimate = hasMounted && !prefersReducedMotion;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={shouldAnimate ? { opacity: 0, y: 8 } : false}
        animate={{ opacity: 1, y: 0 }}
        exit={shouldAnimate ? { opacity: 0, y: -4 } : undefined}
        transition={shouldAnimate ? { duration: 0.2, ease: [0.16, 1, 0.3, 1] } : { duration: 0 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
