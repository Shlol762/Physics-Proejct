import type { SliderControl } from "../ui/controls";
import {
  SCALED_LIGHT_SPEED,
  type PanelFrame,
  type WaveSource,
  buildArcPoints,
  wavelengthToPeriod
} from "../physics/wavefront";

export interface IntroductionParams {
  lambda: number;
  secondaryDensity: number;
}

export const INTRODUCTION_DEFAULTS: IntroductionParams = {
  lambda: 0.5,
  secondaryDensity: 28
};

export function introductionControls(params: IntroductionParams): SliderControl[] {
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
      key: "secondaryDensity",
      label: "Secondary Source Density",
      min: 6,
      max: 64,
      step: 1,
      value: params.secondaryDensity,
      kind: "count"
    }
  ];
}

export function buildIntroductionFrame(params: IntroductionParams, simulationTime: number): PanelFrame {
  const period = wavelengthToPeriod(params.lambda);
  const emissionIndex = Math.floor(simulationTime / period);
  const cycleTime = simulationTime - emissionIndex * period;
  const primaryRadius = SCALED_LIGHT_SPEED * cycleTime;
  const previousPrimaryRadius = primaryRadius + params.lambda;

  const secondaryCount = Math.max(6, Math.floor(params.secondaryDensity));
  const secondaryAlpha = Math.max(0, 1 - cycleTime / period);

  const primaryArcStart = -Math.PI * 0.5;
  const primaryArcEnd = Math.PI * 0.5;

  const secondaryCenters = buildArcPoints(
    0,
    0,
    previousPrimaryRadius,
    primaryArcStart,
    primaryArcEnd,
    secondaryCount
  );

  const drawCommands: PanelFrame["drawCommands"] = [
    {
      kind: "arc",
      x: 0,
      y: 0,
      radius: primaryRadius,
      startAngle: primaryArcStart,
      endAngle: primaryArcEnd,
      color: "#ffe074",
      alpha: 1,
      width: 2.7
    },
    {
      kind: "point",
      x: 0,
      y: 0,
      size: 4,
      color: "#ffe074",
      alpha: 1
    },
    {
      kind: "arc",
      x: 0,
      y: 0,
      radius: params.lambda * 10,
      startAngle: 0,
      endAngle: Math.PI * 2,
      color: "#86d9ff",
      alpha: 0.3,
      width: 1.3,
      dashed: true
    },
    {
      kind: "text",
      x: params.lambda * 10,
      y: 0,
      text: "far field r >> λ",
      color: "#9de8ff",
      alpha: 0.8,
      px: 11
    }
  ];

  const waveletRadius = primaryRadius;

  for (const [x, y] of secondaryCenters) {
    const radial = Math.atan2(y, x);
    drawCommands.push({
      kind: "arc",
      x,
      y,
      radius: waveletRadius,
      startAngle: radial - Math.PI * 0.5,
      endAngle: radial + Math.PI * 0.5,
      color: "#6de4ff",
      alpha: secondaryAlpha * 0.55,
      width: 1.1
    });
  }

  const sources: WaveSource[] = [{ x: 0, y: 0, amplitude: 1, phase: 0 }];

  return {
    sources,
    drawCommands,
    hudEntries: {
      "Period T": `${period.toFixed(4)} s`,
      "Primary Radius": `${primaryRadius.toFixed(3)} m`,
      "Secondary Points": `${secondaryCenters.length}`
    }
  };
}
