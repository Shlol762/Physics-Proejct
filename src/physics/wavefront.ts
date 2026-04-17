export const SCALED_LIGHT_SPEED = 3;
export const TWO_PI = Math.PI * 2;
export const MAX_GPU_SOURCES = 128;

export type PanelId =
  | "introduction"
  | "reflection_refraction"
  | "diffraction"
  | "phased_array"
  | "sandbox";

export type RenderMode = "huygens" | "field";

export interface CameraState {
  centerX: number;
  centerY: number;
  scale: number;
}

export interface WaveSource {
  x: number;
  y: number;
  amplitude: number;
  phase: number;
}

export type DrawCommand =
  | {
      kind: "arc";
      x: number;
      y: number;
      radius: number;
      startAngle: number;
      endAngle: number;
      color: string;
      alpha: number;
      width: number;
      dashed?: boolean;
    }
  | {
      kind: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      color: string;
      alpha: number;
      width: number;
      dashed?: boolean;
    }
  | {
      kind: "polyline";
      points: Array<[number, number]>;
      color: string;
      alpha: number;
      width: number;
      dashed?: boolean;
      closed?: boolean;
    }
  | {
      kind: "point";
      x: number;
      y: number;
      size: number;
      color: string;
      alpha: number;
    }
  | {
      kind: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      color: string;
      alpha: number;
      filled: boolean;
      dashed?: boolean;
    }
  | {
      kind: "text";
      x: number;
      y: number;
      text: string;
      color: string;
      alpha: number;
      px: number;
    };

export interface PanelFrame {
  sources: WaveSource[];
  drawCommands: DrawCommand[];
  hudEntries: Record<string, string>;
  warning?: string;
  intensityProbe?: {
    enabled: boolean;
    x: number;
    samples: number;
    period: number;
  };
}

export interface AxisUnitInfo {
  unit: "nm" | "um" | "mm" | "m";
  factor: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function wavelengthToPeriod(lambda: number): number {
  return lambda / SCALED_LIGHT_SPEED;
}

export function unitFromWavelength(lambda: number): AxisUnitInfo {
  if (lambda < 1e-6) {
    return { unit: "nm", factor: 1e-9 };
  }
  if (lambda < 1e-3) {
    return { unit: "um", factor: 1e-6 };
  }
  if (lambda < 1) {
    return { unit: "mm", factor: 1e-3 };
  }
  return { unit: "m", factor: 1 };
}

export function formatLength(valueMeters: number, unitInfo: AxisUnitInfo, digits = 3): string {
  const converted = valueMeters / unitInfo.factor;
  return `${converted.toFixed(digits)} ${unitInfo.unit}`;
}

export function worldToScreen(
  x: number,
  y: number,
  camera: CameraState,
  width: number,
  height: number
): [number, number] {
  const sx = width * 0.5 + (x - camera.centerX) * camera.scale;
  const sy = height * 0.5 - (y - camera.centerY) * camera.scale;
  return [sx, sy];
}

export function screenToWorld(
  sx: number,
  sy: number,
  camera: CameraState,
  width: number,
  height: number
): [number, number] {
  const x = (sx - width * 0.5) / camera.scale + camera.centerX;
  const y = -(sy - height * 0.5) / camera.scale + camera.centerY;
  return [x, y];
}

export function evaluateAmplitudeAtPoint(
  x: number,
  y: number,
  time: number,
  lambda: number,
  period: number,
  sources: WaveSource[]
): number {
  const k = TWO_PI / Math.max(lambda, 1e-9);
  const wt = TWO_PI * (time / Math.max(period, 1e-9));
  let sum = 0;

  for (let i = 0; i < sources.length; i += 1) {
    const s = sources[i];
    const dx = x - s.x;
    const dy = y - s.y;
    const r = Math.hypot(dx, dy) + 1e-6;
    sum += s.amplitude * Math.cos(k * r - wt + s.phase);
  }

  return sum;
}

export function buildArcPoints(
  x: number,
  y: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  count: number
): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const segments = Math.max(2, count);
  const range = endAngle - startAngle;
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const a = startAngle + t * range;
    points.push([x + Math.cos(a) * radius, y + Math.sin(a) * radius]);
  }
  return points;
}

export function createPlaneWaveSources(options: {
  centerX: number;
  centerY: number;
  directionAngle: number;
  halfSpan: number;
  spacing: number;
  amplitude: number;
  lambda: number;
  basePhase?: number;
  clip?: (x: number, y: number) => boolean;
}): WaveSource[] {
  const {
    centerX,
    centerY,
    directionAngle,
    halfSpan,
    spacing,
    amplitude,
    lambda,
    basePhase = 0,
    clip
  } = options;

  const dirX = Math.cos(directionAngle);
  const dirY = Math.sin(directionAngle);
  const lineX = -dirY;
  const lineY = dirX;
  const steps = Math.max(2, Math.floor((halfSpan * 2) / Math.max(spacing, 1e-4)));
  const k = TWO_PI / Math.max(lambda, 1e-9);
  const out: WaveSource[] = [];

  for (let i = 0; i <= steps; i += 1) {
    const lerp = i / steps;
    const along = (lerp - 0.5) * 2 * halfSpan;
    const x = centerX + lineX * along;
    const y = centerY + lineY * along;
    if (clip && !clip(x, y)) {
      continue;
    }
    const phase = basePhase - k * (x * dirX + y * dirY);
    out.push({ x, y, amplitude, phase });
  }

  return out;
}

export function createLineSources(options: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  count: number;
  amplitude: number;
  basePhase?: number;
}): WaveSource[] {
  const { x1, y1, x2, y2, count, amplitude, basePhase = 0 } = options;
  const steps = Math.max(1, count - 1);
  const out: WaveSource[] = [];

  for (let i = 0; i < count; i += 1) {
    const t = steps === 0 ? 0 : i / steps;
    out.push({
      x: x1 + (x2 - x1) * t,
      y: y1 + (y2 - y1) * t,
      amplitude,
      phase: basePhase
    });
  }

  return out;
}

export function cappedSources(sources: WaveSource[], cap = MAX_GPU_SOURCES): WaveSource[] {
  if (sources.length <= cap) {
    return sources;
  }
  return sources.slice(0, cap);
}

export function phaseFromDegrees(deg: number): number {
  return (deg * Math.PI) / 180;
}
