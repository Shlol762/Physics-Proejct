import type { SliderControl } from "../ui/controls";
import {
  SCALED_LIGHT_SPEED,
  TWO_PI,
  type PanelFrame,
  type WaveSource,
  cappedSources,
  wavelengthToPeriod
} from "../physics/wavefront";
import { degToRad } from "../physics/optics";

export interface DiffractionParams {
  lambda: number;
  slitCount: number;
  slitWidth: number;
  slitSeparation: number;
  incidenceDeg: number;
}

export const DIFFRACTION_DEFAULTS: DiffractionParams = {
  lambda: 0.34,
  slitCount: 2,
  slitWidth: 0.45,
  slitSeparation: 1.1,
  incidenceDeg: 0
};

export function diffractionControls(params: DiffractionParams): SliderControl[] {
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
      key: "slitCount",
      label: "Number of Slits N",
      min: 1,
      max: 10,
      step: 1,
      value: params.slitCount,
      kind: "count"
    },
    {
      key: "slitWidth",
      label: "Slit Width a",
      min: 0.03,
      max: 2.5,
      step: 0.01,
      value: params.slitWidth,
      kind: "length"
    },
    {
      key: "slitSeparation",
      label: "Slit Separation d",
      min: 0.06,
      max: 4,
      step: 0.01,
      value: params.slitSeparation,
      kind: "length"
    },
    {
      key: "incidenceDeg",
      label: "Incidence Angle",
      min: -65,
      max: 65,
      step: 0.1,
      value: params.incidenceDeg,
      kind: "angle"
    }
  ];
}

function slitCenters(count: number, separation: number): number[] {
  const centers: number[] = [];
  const c = Math.max(1, Math.round(count));
  for (let i = 0; i < c; i += 1) {
    centers.push((i - (c - 1) * 0.5) * separation);
  }
  return centers;
}

function buildWavefrontSegment(
  directionX: number,
  directionY: number,
  phaseDistance: number,
  span: number,
  keep: (x: number, y: number) => boolean
): Array<[number, number]> {
  const tangentX = -directionY;
  const tangentY = directionX;
  const points: Array<[number, number]> = [];

  for (let i = 0; i <= 90; i += 1) {
    const t = i / 90;
    const along = (t - 0.5) * span * 2;
    const x = directionX * phaseDistance + tangentX * along;
    const y = directionY * phaseDistance + tangentY * along;
    if (keep(x, y)) {
      points.push([x, y]);
    }
  }

  return points;
}

export function buildDiffractionFrame(
  params: DiffractionParams,
  simulationTime: number
): PanelFrame {
  const lambda = params.lambda;
  const period = wavelengthToPeriod(lambda);
  const theta = degToRad(params.incidenceDeg);
  const dirX = Math.cos(theta);
  const dirY = Math.sin(theta);

  const slitCount = Math.max(1, Math.round(params.slitCount));
  const centers = slitCenters(slitCount, params.slitSeparation);
  const apertureHalf = params.slitWidth * 0.5;
  const barrierHalfHeight = Math.max(8, Math.abs(centers[centers.length - 1] ?? 0) + params.slitWidth * 2 + 2);

  const apertures = centers
    .map((c) => ({ y0: c - apertureHalf, y1: c + apertureHalf }))
    .sort((a, b) => a.y0 - b.y0);

  const drawCommands: PanelFrame["drawCommands"] = [];

  let segmentStart = -barrierHalfHeight;
  for (const aperture of apertures) {
    if (aperture.y0 > segmentStart) {
      drawCommands.push({
        kind: "line",
        x1: 0,
        y1: segmentStart,
        x2: 0,
        y2: aperture.y0,
        color: "#f0d07a",
        alpha: 0.94,
        width: 2.3
      });
    }
    segmentStart = aperture.y1;
  }
  if (segmentStart < barrierHalfHeight) {
    drawCommands.push({
      kind: "line",
      x1: 0,
      y1: segmentStart,
      x2: 0,
      y2: barrierHalfHeight,
      color: "#f0d07a",
      alpha: 0.94,
      width: 2.3
    });
  }

  for (let i = -10; i <= 12; i += 1) {
    const phaseDistance = SCALED_LIGHT_SPEED * simulationTime - i * lambda;
    const points = buildWavefrontSegment(dirX, dirY, phaseDistance, 16, (x) => x <= 0);
    if (points.length > 1) {
      drawCommands.push({
        kind: "polyline",
        points,
        color: "#ffe074",
        alpha: 0.33,
        width: 1.05
      });
    }
  }

  const perSlitSourceCount = Math.max(1, Math.floor(params.slitWidth / lambda));
  const waveletRadius = SCALED_LIGHT_SPEED * (simulationTime % period);
  const fade = Math.max(0, 1 - (simulationTime % period) / period);

  const sources: WaveSource[] = [];

  for (const center of centers) {
    const denom = Math.max(1, perSlitSourceCount - 1);
    for (let i = 0; i < perSlitSourceCount; i += 1) {
      const local = (i / denom - 0.5) * params.slitWidth;
      const y = center + local;
      const phase = -(TWO_PI / Math.max(lambda, 1e-9)) * (y * Math.sin(theta));
      const amplitude = 1 / perSlitSourceCount;
      sources.push({ x: 0, y, amplitude, phase });

      drawCommands.push({
        kind: "point",
        x: 0,
        y,
        size: 2.6,
        color: "#73e7ff",
        alpha: 0.9
      });
      drawCommands.push({
        kind: "arc",
        x: 0,
        y,
        radius: waveletRadius,
        startAngle: -Math.PI * 0.5,
        endAngle: Math.PI * 0.5,
        color: "#73e7ff",
        alpha: fade * 0.45,
        width: 0.95
      });
    }
  }

  return {
    sources: cappedSources(sources),
    drawCommands,
    hudEntries: {
      "Active Slits": `${slitCount}`,
      "Sources per Slit": `${perSlitSourceCount}`,
      "Total Sources": `${sources.length}`,
      "Incidence": `${params.incidenceDeg.toFixed(1)} deg`
    },
    intensityProbe: {
      enabled: true,
      x: 0,
      samples: 140,
      period
    }
  };
}
