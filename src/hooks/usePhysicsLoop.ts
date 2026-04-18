import { useCallback, useEffect, useRef } from "react";

interface UsePhysicsLoopOptions {
  isPlaying: boolean;
  simSpeed: number;
  onFrame: (time: number, dt: number) => void;
}

interface UsePhysicsLoopResult {
  timeRef: React.MutableRefObject<number>;
  resetTime: () => void;
}

export const usePhysicsLoop = ({
  isPlaying,
  simSpeed,
  onFrame
}: UsePhysicsLoopOptions): UsePhysicsLoopResult => {
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(performance.now());
  const timeRef = useRef<number>(0);

  const isPlayingRef = useRef(isPlaying);
  const simSpeedRef = useRef(simSpeed);
  const onFrameRef = useRef(onFrame);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    simSpeedRef.current = simSpeed;
  }, [simSpeed]);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  useEffect(() => {
    const animate = (now: number): void => {
      const dtRaw = (now - lastRef.current) / 1000;
      const dt = Math.max(0.001, Math.min(0.04, dtRaw));
      lastRef.current = now;

      if (isPlayingRef.current) {
        timeRef.current += dt * simSpeedRef.current;
      }

      onFrameRef.current(timeRef.current, dt);
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const resetTime = useCallback(() => {
    timeRef.current = 0;
    lastRef.current = performance.now();
  }, []);

  return { timeRef, resetTime };
};
