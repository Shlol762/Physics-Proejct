import { useCallback, useEffect, useRef, useState } from "react";

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  C_UM_PER_FS,
  PX_PER_UM,
  TAB_LABELS,
  isFieldCapableTab
} from "../constants";
import { usePhysicsLoop } from "../hooks/usePhysicsLoop";
import { useWebGLField } from "../hooks/useWebGLField";
import { renderPanelFrame } from "../simulation/panelRenderer";
import {
  HudSnapshot,
  RenderMode,
  SimulationControls,
  TabId
} from "../types/simulation";

interface SimulationCanvasProps {
  activeTab: TabId;
  controls: SimulationControls;
  isPlaying: boolean;
  renderMode: RenderMode;
  resetCounter: number;
  onHudSnapshot: (snapshot: HudSnapshot) => void;
}

export const SimulationCanvas = ({
  activeTab,
  controls,
  isPlaying,
  renderMode,
  resetCounter,
  onHudSnapshot
}: SimulationCanvasProps) => {
  const canvas2DRef = useRef<HTMLCanvasElement | null>(null);
  const fieldCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasStackRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastHudUpdateRef = useRef<number>(0);
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number }>({
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT
  });

  const { render: renderField, clear: clearField } = useWebGLField(fieldCanvasRef);

  useEffect(() => {
    if (!canvas2DRef.current) {
      return;
    }
    ctxRef.current = canvas2DRef.current.getContext("2d");
  }, []);

  useEffect(() => {
    const stack = canvasStackRef.current;
    if (!stack) {
      return;
    }

    const ratio = CANVAS_WIDTH / CANVAS_HEIGHT;
    const updateDisplaySize = (): void => {
      const availableWidth = stack.clientWidth;
      const availableHeight = stack.clientHeight;
      if (availableWidth <= 0 || availableHeight <= 0) {
        return;
      }

      let nextWidth = availableWidth;
      let nextHeight = nextWidth / ratio;

      if (nextHeight > availableHeight) {
        nextHeight = availableHeight;
        nextWidth = nextHeight * ratio;
      }

      setDisplaySize((previous) => {
        if (
          Math.abs(previous.width - nextWidth) < 0.5 &&
          Math.abs(previous.height - nextHeight) < 0.5
        ) {
          return previous;
        }
        return { width: nextWidth, height: nextHeight };
      });
    };

    updateDisplaySize();
    const observer = new ResizeObserver(updateDisplaySize);
    observer.observe(stack);

    return () => {
      observer.disconnect();
    };
  }, []);

  const drawFrame = useCallback(
    (time: number) => {
      const ctx = ctxRef.current;
      if (!ctx) {
        return;
      }

      const frame = renderPanelFrame({
        ctx,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        tab: activeTab,
        controls,
        mode: renderMode,
        time
      });

      const showField = isFieldCapableTab(activeTab) && renderMode === "field";
      if (showField) {
        renderField({
          sources: frame.sources,
          time,
          wavelength: controls.wavelength * PX_PER_UM,
          period: controls.wavelength / C_UM_PER_FS,
          barrierX: frame.barrierX ?? 0
        });
      } else {
        clearField();
      }

      const now = performance.now();
      if (now - lastHudUpdateRef.current > 80) {
        onHudSnapshot({
          panelLabel: TAB_LABELS[activeTab],
          mode: renderMode,
          time,
          lines: frame.hudLines,
          warning: frame.warning
        });
        lastHudUpdateRef.current = now;
      }
    },
    [
      activeTab,
      controls,
      renderMode,
      renderField,
      clearField,
      onHudSnapshot
    ]
  );

  const { resetTime } = usePhysicsLoop({
    isPlaying,
    simSpeed: controls.simSpeed,
    onFrame: drawFrame
  });

  useEffect(() => {
    resetTime();
  }, [resetCounter, resetTime]);

  const showField = isFieldCapableTab(activeTab) && renderMode === "field";
  const fittedCanvasStyle: React.CSSProperties = {
    width: `${displaySize.width}px`,
    height: `${displaySize.height}px`
  };

  return (
    <div className="canvas-panel">
      <div className="canvas-stack" ref={canvasStackRef}>
        <canvas
          ref={canvas2DRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className={showField ? "sim-canvas canvas2d dimmed" : "sim-canvas canvas2d"}
          style={fittedCanvasStyle}
        />
        <canvas
          ref={fieldCanvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className={showField ? "sim-canvas field visible" : "sim-canvas field hidden"}
          style={fittedCanvasStyle}
        />
      </div>
    </div>
  );
};
