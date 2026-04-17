import type { SliderControl } from "../ui/controls";
import {
  SCALED_LIGHT_SPEED,
  TWO_PI,
  type PanelFrame,
  type WaveSource,
  cappedSources,
  createPlaneWaveSources,
  wavelengthToPeriod
} from "../physics/wavefront";
import {
  degToRad,
  radToDeg,
  snellRefraction,
  transmissionAmplitudeFromReflectionCoefficient
} from "../physics/optics";

export interface ReflectionRefractionParams {
  lambda: number;
  incidenceDeg: number;
  n1: number;
  n2: number;
  reflectionCoefficient: number;
}

export const REFLECTION_REFRACTION_DEFAULTS: ReflectionRefractionParams = {
  lambda: 0.45,
  incidenceDeg: 28,
  n1: 1,
  n2: 1.52,
  reflectionCoefficient: 0.35
};

export function reflectionRefractionControls(
  params: ReflectionRefractionParams
): SliderControl[] {
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
      key: "incidenceDeg",
      label: "Incidence Angle θᵢ",
      min: 0,
      max: 89,
      step: 0.1,
      value: params.incidenceDeg,
      kind: "angle"
    },
    {
      key: "n1",
      label: "n₁",
      min: 1,
      max: 3,
      step: 0.01,
      value: params.n1,
      kind: "index"
    },
    {
      key: "n2",
      label: "n₂",
      min: 1,
      max: 3,
      step: 0.01,
      value: params.n2,
      kind: "index"
    },
    {
      key: "reflectionCoefficient",
      label: "Reflection Coefficient R",
      min: 0,
      max: 1,
      step: 0.01,
      value: params.reflectionCoefficient,
      kind: "coefficient"
    }
  ];
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

  for (let i = 0; i <= 120; i += 1) {
    const t = i / 120;
    const along = (t - 0.5) * span * 2;
    const x = directionX * phaseDistance + tangentX * along;
    const y = directionY * phaseDistance + tangentY * along;
    if (keep(x, y)) {
      points.push([x, y]);
    }
  }

  return points;
}

export function buildReflectionRefractionFrame(
  params: ReflectionRefractionParams,
  simulationTime: number
): PanelFrame {
  const thetaI = degToRad(params.incidenceDeg);
  const dirIncidentX = Math.cos(thetaI);
  const dirIncidentY = Math.sin(thetaI);

  const period = wavelengthToPeriod(params.lambda);
  const v1 = SCALED_LIGHT_SPEED / params.n1;
  const v2 = SCALED_LIGHT_SPEED / params.n2;

  const snell = snellRefraction(thetaI, params.n1, params.n2);
  const transmissionAmplitude = transmissionAmplitudeFromReflectionCoefficient(
    params.reflectionCoefficient
  );

  const thetaT = snell.thetaRefractionRad ?? 0;

  const drawCommands: PanelFrame["drawCommands"] = [
    {
      kind: "line",
      x1: 0,
      y1: -14,
      x2: 0,
      y2: 14,
      color: "#ffc477",
      alpha: 0.92,
      width: 2
    }
  ];

  for (let i = -8; i <= 10; i += 1) {
    const phaseDistance = v1 * simulationTime - i * params.lambda;
    const segment = buildWavefrontSegment(
      dirIncidentX,
      dirIncidentY,
      phaseDistance,
      20,
      (x) => x <= 0
    );
    if (segment.length > 1) {
      drawCommands.push({
        kind: "polyline",
        points: segment,
        color: "#ffe074",
        alpha: 0.42,
        width: 1.2
      });
    }
  }

  const boundarySources: Array<{ y: number; age: number; phase: number }> = [];
  const step = Math.max(0.08, params.lambda * 0.45);
  for (let y = -9; y <= 9; y += step) {
    const phaseTravel = v1 * simulationTime - dirIncidentY * y;
    if (phaseTravel < 0) {
      continue;
    }
    const crestIndex = Math.floor(phaseTravel / params.lambda);
    const contactTime = (dirIncidentY * y + crestIndex * params.lambda) / v1;
    const age = simulationTime - contactTime;
    if (age < 0 || age > period) {
      continue;
    }

    boundarySources.push({
      y,
      age,
      phase: -TWO_PI * (contactTime / period)
    });

    const reflectedRadius = age * v1;
    drawCommands.push({
      kind: "arc",
      x: 0,
      y,
      radius: reflectedRadius,
      startAngle: Math.PI * 0.5,
      endAngle: Math.PI * 1.5,
      color: "#6ee5ff",
      alpha: (1 - age / period) * (0.2 + 0.65 * params.reflectionCoefficient),
      width: 1.05
    });

    if (!snell.totalInternalReflection) {
      const transmittedRadius = age * v2;
      drawCommands.push({
        kind: "arc",
        x: 0,
        y,
        radius: transmittedRadius,
        startAngle: -Math.PI * 0.5,
        endAngle: Math.PI * 0.5,
        color: "#86f3c9",
        alpha: (1 - age / period) * (0.2 + 0.55 * transmissionAmplitude),
        width: 1.05
      });
    }
  }

  const sources: WaveSource[] = [];
  const incidentSources = createPlaneWaveSources({
    centerX: -4.8,
    centerY: 0,
    directionAngle: thetaI,
    halfSpan: 11,
    spacing: Math.max(0.07, params.lambda * 0.5),
    amplitude: 0.75,
    lambda: params.lambda,
    clip: (x) => x <= 0
  });

  sources.push(...incidentSources);

  for (const boundarySource of boundarySources) {
    sources.push({
      x: 0,
      y: boundarySource.y,
      amplitude: Math.max(0.02, params.reflectionCoefficient),
      phase: boundarySource.phase
    });

    if (!snell.totalInternalReflection) {
      sources.push({
        x: 0,
        y: boundarySource.y,
        amplitude: Math.max(0.02, transmissionAmplitude),
        phase: boundarySource.phase + thetaT * 0.15
      });
    }
  }

  const warning = snell.totalInternalReflection
    ? "TIR: θᵢ exceeds critical angle, refracted wave suppressed."
    : undefined;

  return {
    sources: cappedSources(sources),
    drawCommands,
    warning,
    hudEntries: {
      "θ refraction": snell.thetaRefractionRad === null ? "N/A" : `${radToDeg(thetaT).toFixed(2)} deg`,
      "Transmission Amp": transmissionAmplitude.toFixed(3),
      "Boundary Sources": `${boundarySources.length}`,
      "v in n₁": `${v1.toFixed(3)} m/s`,
      "v in n₂": `${v2.toFixed(3)} m/s`
    }
  };
}
