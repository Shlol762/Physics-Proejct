import type { SliderControl, SandboxToolId } from "../ui/controls";
import {
  MAX_GPU_SOURCES,
  type PanelFrame,
  type WaveSource,
  cappedSources,
  createLineSources,
  createPlaneWaveSources,
  phaseFromDegrees,
  wavelengthToPeriod
} from "../physics/wavefront";
import { lensPhaseAdvance } from "../physics/optics";

export interface SandboxParams {
  lambda: number;
  huygensOpacity: number;
  fieldOpacity: number;
}

export const SANDBOX_DEFAULTS: SandboxParams = {
  lambda: 0.45,
  huygensOpacity: 0.7,
  fieldOpacity: 0.85
};

export type SandboxObjectCategory = "source" | "element";

export interface SandboxObject {
  id: string;
  category: SandboxObjectCategory;
  subtype: string;
  x: number;
  y: number;
  rotation: number;
  params: Record<string, number>;
}

export interface SandboxState {
  objects: SandboxObject[];
  selectedId: string | null;
  activeTool: SandboxToolId;
  nextId: number;
}

export interface SandboxHit {
  id: string;
  mode: "move" | "rotate";
}

export interface InspectorField {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
}

const SOURCE_LIMIT = 16;
const ELEMENT_LIMIT = 32;

export function sandboxControls(params: SandboxParams): SliderControl[] {
  return [
    {
      key: "lambda",
      label: "Wavelength lambda",
      min: 0.05,
      max: 3,
      step: 0.01,
      value: params.lambda,
      kind: "length"
    },
    {
      key: "huygensOpacity",
      label: "Huygens Layer Opacity",
      min: 0,
      max: 1,
      step: 0.01,
      value: params.huygensOpacity,
      kind: "coefficient"
    },
    {
      key: "fieldOpacity",
      label: "Field Layer Opacity",
      min: 0,
      max: 1,
      step: 0.01,
      value: params.fieldOpacity,
      kind: "coefficient"
    }
  ];
}

export function createSandboxState(): SandboxState {
  return {
    objects: [],
    selectedId: null,
    activeTool: "",
    nextId: 1
  };
}

function countByCategory(state: SandboxState, category: SandboxObjectCategory): number {
  return state.objects.filter((obj) => obj.category === category).length;
}

function nextId(state: SandboxState): string {
  const value = state.nextId;
  state.nextId += 1;
  return `obj-${value}`;
}

function objectRadius(obj: SandboxObject): number {
  const width = obj.params.width ?? obj.params.length ?? obj.params.radius ?? 0.8;
  return Math.max(0.35, width * 0.55);
}

function rotationHandlePosition(obj: SandboxObject): [number, number] {
  const r = objectRadius(obj) + 0.4;
  return [obj.x + Math.cos(obj.rotation) * r, obj.y + Math.sin(obj.rotation) * r];
}

function makeObjectFromTool(
  state: SandboxState,
  tool: SandboxToolId,
  x: number,
  y: number,
  lambda: number
): SandboxObject | null {
  const id = nextId(state);

  switch (tool) {
    case "source-point":
      return {
        id,
        category: "source",
        subtype: "point",
        x,
        y,
        rotation: 0,
        params: { amplitude: 1, phaseDeg: 0 }
      };
    case "source-line":
      return {
        id,
        category: "source",
        subtype: "line",
        x,
        y,
        rotation: 0,
        params: { length: Math.max(0.6, lambda * 4), amplitude: 1, phaseDeg: 0 }
      };
    case "source-plane":
      return {
        id,
        category: "source",
        subtype: "plane",
        x,
        y,
        rotation: 0,
        params: { width: Math.max(1.2, lambda * 10), amplitude: 0.9, phaseDeg: 0 }
      };
    case "source-aperture":
      return {
        id,
        category: "source",
        subtype: "aperture",
        x,
        y,
        rotation: 0,
        params: { width: Math.max(0.8, lambda * 3), density: 8, amplitude: 1, phaseDeg: 0 }
      };
    case "element-flat-mirror":
      return {
        id,
        category: "element",
        subtype: "flat-mirror",
        x,
        y,
        rotation: 0,
        params: { length: 2 }
      };
    case "element-curved-mirror":
      return {
        id,
        category: "element",
        subtype: "curved-mirror",
        x,
        y,
        rotation: 0,
        params: { radius: 1.4, apertureDeg: 120 }
      };
    case "element-converging-lens":
      return {
        id,
        category: "element",
        subtype: "converging-lens",
        x,
        y,
        rotation: 0,
        params: { length: 1.9, focalLength: 1.2 }
      };
    case "element-diverging-lens":
      return {
        id,
        category: "element",
        subtype: "diverging-lens",
        x,
        y,
        rotation: 0,
        params: { length: 1.9, focalLength: 1.2 }
      };
    case "element-wall":
      return {
        id,
        category: "element",
        subtype: "wall",
        x,
        y,
        rotation: 0,
        params: { length: 2.2 }
      };
    case "element-slit-barrier":
      return {
        id,
        category: "element",
        subtype: "slit-barrier",
        x,
        y,
        rotation: 0,
        params: { length: 2.5, slitCount: 2, slitWidth: 0.25, slitSeparation: 0.6 }
      };
    case "element-dielectric":
      return {
        id,
        category: "element",
        subtype: "dielectric",
        x,
        y,
        rotation: 0,
        params: { width: 1.8, height: 1.1, n: 1.5 }
      };
    default:
      return null;
  }
}

export function setSandboxTool(state: SandboxState, tool: SandboxToolId): void {
  state.activeTool = tool;
}

export function placeSandboxObject(
  state: SandboxState,
  x: number,
  y: number,
  lambda: number
): { placed: boolean; reason?: string } {
  if (!state.activeTool) {
    return { placed: false };
  }

  const object = makeObjectFromTool(state, state.activeTool, x, y, lambda);
  if (!object) {
    return { placed: false };
  }

  if (object.category === "source" && countByCategory(state, "source") >= SOURCE_LIMIT) {
    return { placed: false, reason: "Source limit reached (16)." };
  }

  if (object.category === "element" && countByCategory(state, "element") >= ELEMENT_LIMIT) {
    return { placed: false, reason: "Element limit reached (32)." };
  }

  state.objects.push(object);
  state.selectedId = object.id;
  return { placed: true };
}

export function findSandboxHit(state: SandboxState, x: number, y: number): SandboxHit | null {
  const selected = state.objects.find((obj) => obj.id === state.selectedId);
  if (selected) {
    const [hx, hy] = rotationHandlePosition(selected);
    if (Math.hypot(hx - x, hy - y) <= 0.18) {
      return { id: selected.id, mode: "rotate" };
    }
  }

  for (let i = state.objects.length - 1; i >= 0; i -= 1) {
    const obj = state.objects[i];
    if (Math.hypot(obj.x - x, obj.y - y) <= objectRadius(obj) * 0.8) {
      return { id: obj.id, mode: "move" };
    }
  }

  return null;
}

export function selectSandboxObject(state: SandboxState, id: string | null): void {
  state.selectedId = id;
}

export function moveSandboxObject(state: SandboxState, id: string, x: number, y: number): void {
  const obj = state.objects.find((item) => item.id === id);
  if (!obj) {
    return;
  }
  obj.x = x;
  obj.y = y;
}

export function rotateSandboxObjectToPoint(
  state: SandboxState,
  id: string,
  targetX: number,
  targetY: number
): void {
  const obj = state.objects.find((item) => item.id === id);
  if (!obj) {
    return;
  }
  obj.rotation = Math.atan2(targetY - obj.y, targetX - obj.x);
}

export function deleteSelectedSandboxObject(state: SandboxState): void {
  if (!state.selectedId) {
    return;
  }
  state.objects = state.objects.filter((obj) => obj.id !== state.selectedId);
  state.selectedId = null;
}

export function getSelectedSandboxObject(state: SandboxState): SandboxObject | null {
  if (!state.selectedId) {
    return null;
  }
  return state.objects.find((obj) => obj.id === state.selectedId) ?? null;
}

function toInspectorField(key: string, label: string, value: number): InspectorField {
  switch (key) {
    case "x":
    case "y":
      return { key, label, value, min: -20, max: 20, step: 0.01 };
    case "rotationDeg":
      return { key, label, value, min: -180, max: 180, step: 0.1 };
    case "amplitude":
      return { key, label, value, min: 0, max: 2, step: 0.01 };
    case "phaseDeg":
      return { key, label, value, min: -360, max: 360, step: 0.1 };
    case "length":
    case "width":
    case "height":
    case "radius":
    case "focalLength":
      return { key, label, value, min: 0.02, max: 10, step: 0.01 };
    case "slitCount":
      return { key, label, value, min: 1, max: 10, step: 1 };
    case "slitWidth":
    case "slitSeparation":
      return { key, label, value, min: 0.02, max: 4, step: 0.01 };
    case "density":
      return { key, label, value, min: 1, max: 32, step: 1 };
    case "apertureDeg":
      return { key, label, value, min: 20, max: 320, step: 1 };
    case "n":
      return { key, label, value, min: 1, max: 3, step: 0.01 };
    default:
      return { key, label, value, min: -50, max: 50, step: 0.01 };
  }
}

export function getSandboxInspectorFields(state: SandboxState): InspectorField[] {
  const obj = getSelectedSandboxObject(state);
  if (!obj) {
    return [];
  }

  const fields: InspectorField[] = [
    toInspectorField("x", "Position X", obj.x),
    toInspectorField("y", "Position Y", obj.y),
    toInspectorField("rotationDeg", "Rotation", (obj.rotation * 180) / Math.PI)
  ];

  for (const [key, value] of Object.entries(obj.params)) {
    fields.push(toInspectorField(key, key, value));
  }

  return fields;
}

export function updateSandboxInspectorValue(
  state: SandboxState,
  key: string,
  value: number
): void {
  const obj = getSelectedSandboxObject(state);
  if (!obj) {
    return;
  }

  if (key === "x") {
    obj.x = value;
    return;
  }
  if (key === "y") {
    obj.y = value;
    return;
  }
  if (key === "rotationDeg") {
    obj.rotation = (value * Math.PI) / 180;
    return;
  }

  obj.params[key] = value;
}

function axisEndpoints(obj: SandboxObject, length: number): [number, number, number, number] {
  const dx = Math.cos(obj.rotation) * length * 0.5;
  const dy = Math.sin(obj.rotation) * length * 0.5;
  return [obj.x - dx, obj.y - dy, obj.x + dx, obj.y + dy];
}

function addSourceObjectContributions(
  obj: SandboxObject,
  lambda: number,
  sources: WaveSource[],
  drawCommands: PanelFrame["drawCommands"]
): void {
  const amplitude = obj.params.amplitude ?? 1;
  const phase = phaseFromDegrees(obj.params.phaseDeg ?? 0);

  if (obj.subtype === "point") {
    sources.push({ x: obj.x, y: obj.y, amplitude, phase });
    drawCommands.push({
      kind: "point",
      x: obj.x,
      y: obj.y,
      size: 3.8,
      color: "#81e9ff",
      alpha: 1
    });
    return;
  }

  if (obj.subtype === "line") {
    const length = obj.params.length ?? 1.2;
    const [x1, y1, x2, y2] = axisEndpoints(obj, length);
    const count = Math.max(4, Math.min(20, Math.floor((length / Math.max(lambda, 0.03)) * 1.5)));
    sources.push(...createLineSources({ x1, y1, x2, y2, count, amplitude: amplitude / count, basePhase: phase }));
    drawCommands.push({
      kind: "line",
      x1,
      y1,
      x2,
      y2,
      color: "#81e9ff",
      alpha: 0.9,
      width: 1.8
    });
    return;
  }

  if (obj.subtype === "plane") {
    const width = obj.params.width ?? 2;
    const strip = createPlaneWaveSources({
      centerX: obj.x,
      centerY: obj.y,
      directionAngle: obj.rotation,
      halfSpan: width * 0.5,
      spacing: Math.max(0.05, lambda * 0.45),
      amplitude: amplitude * 0.35,
      lambda,
      basePhase: phase
    });
    sources.push(...strip);
    const [x1, y1, x2, y2] = axisEndpoints(obj, width);
    drawCommands.push({
      kind: "line",
      x1,
      y1,
      x2,
      y2,
      color: "#81e9ff",
      alpha: 0.9,
      width: 1.5
    });
    drawCommands.push({
      kind: "line",
      x1: obj.x,
      y1: obj.y,
      x2: obj.x + Math.cos(obj.rotation) * 0.6,
      y2: obj.y + Math.sin(obj.rotation) * 0.6,
      color: "#81e9ff",
      alpha: 0.8,
      width: 1.2
    });
    return;
  }

  if (obj.subtype === "aperture") {
    const width = obj.params.width ?? 1;
    const density = Math.max(1, Math.round(obj.params.density ?? 8));
    const [x1, y1, x2, y2] = axisEndpoints(obj, width);
    sources.push(
      ...createLineSources({
        x1,
        y1,
        x2,
        y2,
        count: density,
        amplitude: amplitude / density,
        basePhase: phase
      })
    );
    drawCommands.push({
      kind: "line",
      x1,
      y1,
      x2,
      y2,
      color: "#8fffb8",
      alpha: 0.95,
      width: 2
    });
  }
}

function addElementContributions(
  obj: SandboxObject,
  lambda: number,
  sources: WaveSource[],
  drawCommands: PanelFrame["drawCommands"]
): void {
  if (obj.subtype === "flat-mirror") {
    const length = obj.params.length ?? 2;
    const [x1, y1, x2, y2] = axisEndpoints(obj, length);
    drawCommands.push({
      kind: "line",
      x1,
      y1,
      x2,
      y2,
      color: "#ffd8af",
      alpha: 0.95,
      width: 2.3
    });

    const reflected = createLineSources({ x1, y1, x2, y2, count: 10, amplitude: 0.025, basePhase: Math.PI });
    sources.push(...reflected);
    return;
  }

  if (obj.subtype === "curved-mirror") {
    const radius = obj.params.radius ?? 1.4;
    const aperture = ((obj.params.apertureDeg ?? 120) * Math.PI) / 180;
    const start = obj.rotation - aperture * 0.5;
    const end = obj.rotation + aperture * 0.5;
    drawCommands.push({
      kind: "arc",
      x: obj.x,
      y: obj.y,
      radius,
      startAngle: start,
      endAngle: end,
      color: "#ffd8af",
      alpha: 0.95,
      width: 2.1
    });

    const count = 14;
    for (let i = 0; i <= count; i += 1) {
      const t = i / count;
      const a = start + (end - start) * t;
      sources.push({
        x: obj.x + Math.cos(a) * radius,
        y: obj.y + Math.sin(a) * radius,
        amplitude: 0.02,
        phase: Math.PI
      });
    }
    return;
  }

  if (obj.subtype === "converging-lens" || obj.subtype === "diverging-lens") {
    const length = obj.params.length ?? 1.8;
    const focal = Math.max(0.05, obj.params.focalLength ?? 1);
    const [x1, y1, x2, y2] = axisEndpoints(obj, length);
    drawCommands.push({
      kind: "line",
      x1,
      y1,
      x2,
      y2,
      color: obj.subtype === "converging-lens" ? "#85c6ff" : "#a7b9ff",
      alpha: 0.92,
      width: 2
    });

    const samples = 14;
    const sign = obj.subtype === "converging-lens" ? 1 : -1;
    for (let i = 0; i <= samples; i += 1) {
      const t = i / samples;
      const yLocal = (t - 0.5) * length;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      const phase = sign * lensPhaseAdvance(yLocal, lambda, focal);
      sources.push({ x, y, amplitude: 0.018, phase });
    }
    return;
  }

  if (obj.subtype === "wall") {
    const length = obj.params.length ?? 2.2;
    const [x1, y1, x2, y2] = axisEndpoints(obj, length);
    drawCommands.push({
      kind: "line",
      x1,
      y1,
      x2,
      y2,
      color: "#f4b575",
      alpha: 0.95,
      width: 3
    });
    return;
  }

  if (obj.subtype === "slit-barrier") {
    const length = obj.params.length ?? 2.5;
    const slitCount = Math.max(1, Math.round(obj.params.slitCount ?? 2));
    const slitWidth = obj.params.slitWidth ?? 0.22;
    const slitSeparation = obj.params.slitSeparation ?? 0.6;

    const axisDirX = Math.cos(obj.rotation);
    const axisDirY = Math.sin(obj.rotation);

    const starts: Array<{ a0: number; a1: number }> = [];
    for (let i = 0; i < slitCount; i += 1) {
      const center = (i - (slitCount - 1) * 0.5) * slitSeparation;
      starts.push({ a0: center - slitWidth * 0.5, a1: center + slitWidth * 0.5 });
    }
    starts.sort((a, b) => a.a0 - b.a0);

    let runStart = -length * 0.5;
    for (const slit of starts) {
      if (slit.a0 > runStart) {
        drawCommands.push({
          kind: "line",
          x1: obj.x + axisDirX * runStart,
          y1: obj.y + axisDirY * runStart,
          x2: obj.x + axisDirX * slit.a0,
          y2: obj.y + axisDirY * slit.a0,
          color: "#f4b575",
          alpha: 0.92,
          width: 2.5
        });
      }
      runStart = slit.a1;
    }

    if (runStart < length * 0.5) {
      drawCommands.push({
        kind: "line",
        x1: obj.x + axisDirX * runStart,
        y1: obj.y + axisDirY * runStart,
        x2: obj.x + axisDirX * (length * 0.5),
        y2: obj.y + axisDirY * (length * 0.5),
        color: "#f4b575",
        alpha: 0.92,
        width: 2.5
      });
    }

    for (const slit of starts) {
      const count = Math.max(1, Math.floor(slitWidth / Math.max(lambda, 0.03)));
      for (let i = 0; i < count; i += 1) {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const along = slit.a0 + (slit.a1 - slit.a0) * t;
        sources.push({
          x: obj.x + axisDirX * along,
          y: obj.y + axisDirY * along,
          amplitude: 0.03,
          phase: 0
        });
      }
    }
    return;
  }

  if (obj.subtype === "dielectric") {
    const width = obj.params.width ?? 1.8;
    const height = obj.params.height ?? 1.1;
    drawCommands.push({
      kind: "rect",
      x: obj.x,
      y: obj.y,
      width,
      height,
      color: "#7bb8ff",
      alpha: 0.35,
      filled: true
    });
    drawCommands.push({
      kind: "rect",
      x: obj.x,
      y: obj.y,
      width,
      height,
      color: "#7bb8ff",
      alpha: 0.9,
      filled: false
    });
  }
}

export function buildSandboxFrame(
  state: SandboxState,
  params: SandboxParams,
  simulationTime: number
): PanelFrame {
  const drawCommands: PanelFrame["drawCommands"] = [];
  const sources: WaveSource[] = [];

  const period = wavelengthToPeriod(params.lambda);
  const waveletRadius = (simulationTime % period) * 3;

  for (const object of state.objects) {
    if (object.category === "source") {
      addSourceObjectContributions(object, params.lambda, sources, drawCommands);
      drawCommands.push({
        kind: "arc",
        x: object.x,
        y: object.y,
        radius: waveletRadius,
        startAngle: -Math.PI * 0.5,
        endAngle: Math.PI * 0.5,
        color: "#6ce5ff",
        alpha: 0.2,
        width: 0.85
      });
    } else {
      addElementContributions(object, params.lambda, sources, drawCommands);
    }
  }

  const selected = getSelectedSandboxObject(state);
  if (selected) {
    const radius = objectRadius(selected);
    const [hx, hy] = rotationHandlePosition(selected);

    drawCommands.push({
      kind: "arc",
      x: selected.x,
      y: selected.y,
      radius: radius,
      startAngle: 0,
      endAngle: Math.PI * 2,
      color: "#ffe074",
      alpha: 0.82,
      width: 1.2,
      dashed: true
    });

    drawCommands.push({
      kind: "line",
      x1: selected.x,
      y1: selected.y,
      x2: hx,
      y2: hy,
      color: "#ffe074",
      alpha: 0.8,
      width: 1
    });

    drawCommands.push({
      kind: "point",
      x: hx,
      y: hy,
      size: 3.1,
      color: "#ffe074",
      alpha: 1
    });
  }

  if (sources.length > MAX_GPU_SOURCES) {
    const stride = Math.ceil(sources.length / MAX_GPU_SOURCES);
    const reduced: WaveSource[] = [];
    for (let i = 0; i < sources.length && reduced.length < MAX_GPU_SOURCES; i += stride) {
      reduced.push(sources[i]);
    }
    sources.length = 0;
    sources.push(...reduced);
  }

  return {
    sources: cappedSources(sources),
    drawCommands,
    hudEntries: {
      Sources: `${countByCategory(state, "source")}/${SOURCE_LIMIT}`,
      Elements: `${countByCategory(state, "element")}/${ELEMENT_LIMIT}`,
      Selected: selected ? `${selected.subtype} (${selected.id})` : "none",
      Tool: state.activeTool || "none"
    }
  };
}

export function objectLabel(obj: SandboxObject | null): string {
  if (!obj) {
    return "none";
  }
  return `${obj.subtype} ${obj.id}`;
}

export function defaultSandboxFieldValue(field: InspectorField): string {
  return field.value.toString();
}
