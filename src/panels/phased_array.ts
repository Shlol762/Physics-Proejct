import type { SliderControl } from "../ui/controls";
import {
  SCALED_LIGHT_SPEED,
  type PanelFrame,
  type WaveSource,
  cappedSources,
  phaseFromDegrees,
  wavelengthToPeriod
} from "../physics/wavefront";
import { beamAngleFromPhaseDelay, radToDeg } from "../physics/optics";

export interface PhasedArrayParams {
  lambda: number;
  elementCount: number;
  spacing: number;
  phaseDelayDeg: number;
}

export const PHASED_ARRAY_DEFAULTS: PhasedArrayParams = {
  lambda: 0.4,
  elementCount: 8,
  spacing: 0.6,
  phaseDelayDeg: 20
};

export function phasedArrayControls(params: PhasedArrayParams): SliderControl[] {
  return [
    {
      key: "lambda",
      label: "Wavelength λ",
      min: 0.05,
      max: 3,
      step: 0.01,
      value: params.lambda,
      kind: "length"
    },
    {
      key: "elementCount",
      label: "Element Count N",
      min: 2,
      max: 32,
      step: 1,
      value: params.elementCount,
      kind: "count"
    },
    {
      key: "spacing",
      label: "Element Spacing d",
      min: 0.04,
      max: 2.5,
      step: 0.01,
      value: params.spacing,
      kind: "length"
    },
    {
      key: "phaseDelayDeg",
      label: "Inter-element Delay Δφ",
      min: -180,
      max: 180,
      step: 0.1,
      value: params.phaseDelayDeg,
      kind: "phase"
    }
  ];
}

export function buildPhasedArrayFrame(
  params: PhasedArrayParams,
  simulationTime: number
): PanelFrame {
  const lambda = params.lambda;
  const period = wavelengthToPeriod(lambda);
  const elementCount = Math.max(2, Math.round(params.elementCount));
  const phaseDelay = phaseFromDegrees(params.phaseDelayDeg);

  const sources: WaveSource[] = [];
  const drawCommands: PanelFrame["drawCommands"] = [];

  const radius = SCALED_LIGHT_SPEED * (simulationTime % period);

  for (let k = 0; k < elementCount; k += 1) {
    const y = (k - (elementCount - 1) * 0.5) * params.spacing;
    const phase = k * phaseDelay;
    sources.push({
      x: 0,
      y,
      amplitude: 1,
      phase
    });

    drawCommands.push({
      kind: "point",
      x: 0,
      y,
      size: 3.4,
      color: "#89efff",
      alpha: 1
    });

    drawCommands.push({
      kind: "arc",
      x: 0,
      y,
      radius,
      startAngle: -Math.PI * 0.5,
      endAngle: Math.PI * 0.5,
      color: "#89efff",
      alpha: 0.44,
      width: 1.1
    });
  }

  const beam = beamAngleFromPhaseDelay(phaseDelay, lambda, params.spacing);
  let warning: string | undefined;

  if (beam.valid && beam.thetaRad !== null) {
    const dirX = Math.cos(beam.thetaRad);
    const dirY = Math.sin(beam.thetaRad);
    const tangentX = -dirY;
    const tangentY = dirX;
    const frontDistance = SCALED_LIGHT_SPEED * (simulationTime % period) + lambda;
    const centerX = dirX * frontDistance;
    const centerY = dirY * frontDistance;
    const span = Math.max(8, elementCount * params.spacing * 0.7);

    drawCommands.push({
      kind: "line",
      x1: centerX - tangentX * span,
      y1: centerY - tangentY * span,
      x2: centerX + tangentX * span,
      y2: centerY + tangentY * span,
      color: "#ffe074",
      alpha: 0.95,
      width: 2.2
    });
  } else {
    warning = "|Δφ λ / (2π d)| > 1: no real steering angle.";
  }

  return {
    sources: cappedSources(sources),
    drawCommands,
    warning,
    hudEntries: {
      "θ beam": beam.thetaRad === null ? "N/A" : `${radToDeg(beam.thetaRad).toFixed(2)} deg`,
      Argument: beam.argument.toFixed(3),
      Elements: `${elementCount}`
    }
  };
}
