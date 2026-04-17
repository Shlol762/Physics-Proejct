import "./styles.css";

import {
  ControlsUI,
  activatePanelTab,
  bindPanelTabs,
  bindRenderModeToggle,
  bindSandboxTools,
  type SliderControl
} from "./ui/controls";
import { HudView } from "./ui/hud";
import { AxisRenderer } from "./rendering/axes";
import { Mode1Renderer } from "./rendering/mode1";
import { Mode2Renderer } from "./rendering/mode2";
import {
  type PanelFrame,
  type PanelId,
  type RenderMode,
  type CameraState,
  evaluateAmplitudeAtPoint,
  formatLength,
  screenToWorld,
  unitFromWavelength,
  wavelengthToPeriod
} from "./physics/wavefront";
import {
  INTRODUCTION_DEFAULTS,
  buildIntroductionFrame,
  introductionControls,
  type IntroductionParams
} from "./panels/introduction";
import {
  REFLECTION_REFRACTION_DEFAULTS,
  buildReflectionRefractionFrame,
  reflectionRefractionControls,
  type ReflectionRefractionParams
} from "./panels/reflection_refraction";
import {
  DIFFRACTION_DEFAULTS,
  buildDiffractionFrame,
  diffractionControls,
  type DiffractionParams
} from "./panels/diffraction";
import {
  PHASED_ARRAY_DEFAULTS,
  buildPhasedArrayFrame,
  phasedArrayControls,
  type PhasedArrayParams
} from "./panels/phased_array";
import {
  SANDBOX_DEFAULTS,
  buildSandboxFrame,
  createSandboxState,
  deleteSelectedSandboxObject,
  findSandboxHit,
  getSandboxInspectorFields,
  getSelectedSandboxObject,
  moveSandboxObject,
  objectLabel,
  placeSandboxObject,
  rotateSandboxObjectToPoint,
  sandboxControls,
  selectSandboxObject,
  setSandboxTool,
  updateSandboxInspectorValue,
  type SandboxParams,
  type SandboxState
} from "./panels/sandbox";

function mustElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id) as T | null;
  if (!element) {
    throw new Error(`Missing required element #${id}.`);
  }
  return element;
}

function must2DContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) {
    throw new Error("Unable to create Canvas 2D context.");
  }
  return context;
}

interface PanelParamsState {
  introduction: IntroductionParams;
  reflection_refraction: ReflectionRefractionParams;
  diffraction: DiffractionParams;
  phased_array: PhasedArrayParams;
  sandbox: SandboxParams;
}

interface AppState {
  panel: PanelId;
  mode: RenderMode;
  simulationTime: number;
  simulationSpeed: number;
  camera: CameraState;
  panelParams: PanelParamsState;
  sandbox: SandboxState;
}

const panelNameById: Record<PanelId, string> = {
  introduction: "Introduction",
  reflection_refraction: "Reflection / Refraction",
  diffraction: "Diffraction",
  phased_array: "Phased Array",
  sandbox: "Sandbox"
};

const integerKeys = new Set([
  "secondaryDensity",
  "slitCount",
  "elementCount",
  "density"
]);

const mode1Canvas = mustElement<HTMLCanvasElement>("mode1-canvas");
const mode2Canvas = mustElement<HTMLCanvasElement>("mode2-canvas");
const axesCanvas = mustElement<HTMLCanvasElement>("axes-canvas");
const intensityCanvas = mustElement<HTMLCanvasElement>("intensity-canvas");
const viewport = mustElement<HTMLElement>("viewport");
const canvasStack = mustElement<HTMLElement>("canvas-stack");

const globalControlsContainer = mustElement<HTMLElement>("global-controls");
const panelControlsContainer = mustElement<HTMLElement>("panel-controls");
const panelTabsContainer = mustElement<HTMLElement>("panel-tabs");
const sandboxPalette = mustElement<HTMLElement>("sandbox-palette");
const inspectorPanel = mustElement<HTMLElement>("sandbox-inspector");
const inspectorFields = mustElement<HTMLElement>("inspector-fields");
const inspectorEmpty = mustElement<HTMLElement>("inspector-empty");
const inspectorDeleteButton = mustElement<HTMLButtonElement>("inspector-delete");

const mode1Renderer = new Mode1Renderer(mode1Canvas);
const mode2Renderer = new Mode2Renderer(mode2Canvas);
const axisRenderer = new AxisRenderer(axesCanvas);
const controls = new ControlsUI(globalControlsContainer, panelControlsContainer);
const hud = new HudView();

const intensityContext = must2DContext(intensityCanvas);

const state: AppState = {
  panel: "introduction",
  mode: "huygens",
  simulationTime: 0,
  simulationSpeed: 1,
  camera: {
    centerX: 0,
    centerY: 0,
    scale: 140
  },
  panelParams: {
    introduction: { ...INTRODUCTION_DEFAULTS },
    reflection_refraction: { ...REFLECTION_REFRACTION_DEFAULTS },
    diffraction: { ...DIFFRACTION_DEFAULTS },
    phased_array: { ...PHASED_ARRAY_DEFAULTS },
    sandbox: { ...SANDBOX_DEFAULTS }
  },
  sandbox: createSandboxState()
};

let pixelRatio = Math.max(1, window.devicePixelRatio || 1);
let viewportWidthPx = 1;
let viewportHeightPx = 1;

let pointerDrag:
  | {
      kind: "pan";
      lastClientX: number;
      lastClientY: number;
    }
  | {
      kind: "sandbox-move" | "sandbox-rotate";
      objectId: string;
    }
  | null = null;

let transientWarning: { message: string; expiresAt: number } | null = null;
const intensityHistory: Array<{ t: number; values: number[] }> = [];

function currentPanelParams(): Record<string, number> {
  return state.panelParams[state.panel] as unknown as Record<string, number>;
}

function currentLambda(): number {
  return currentPanelParams().lambda ?? 0.5;
}

function globalControls(): SliderControl[] {
  return [
    {
      key: "simulationSpeed",
      label: "Simulation Speed",
      min: 0.1,
      max: 5,
      step: 0.01,
      value: state.simulationSpeed,
      kind: "speed"
    }
  ];
}

function controlsForPanel(panel: PanelId): SliderControl[] {
  switch (panel) {
    case "introduction":
      return introductionControls(state.panelParams.introduction);
    case "reflection_refraction":
      return reflectionRefractionControls(state.panelParams.reflection_refraction);
    case "diffraction":
      return diffractionControls(state.panelParams.diffraction);
    case "phased_array":
      return phasedArrayControls(state.panelParams.phased_array);
    case "sandbox":
      return sandboxControls(state.panelParams.sandbox);
    default:
      return [];
  }
}

function frameForPanel(panel: PanelId): PanelFrame {
  switch (panel) {
    case "introduction":
      return buildIntroductionFrame(state.panelParams.introduction, state.simulationTime);
    case "reflection_refraction":
      return buildReflectionRefractionFrame(
        state.panelParams.reflection_refraction,
        state.simulationTime
      );
    case "diffraction":
      return buildDiffractionFrame(state.panelParams.diffraction, state.simulationTime);
    case "phased_array":
      return buildPhasedArrayFrame(state.panelParams.phased_array, state.simulationTime);
    case "sandbox":
      return buildSandboxFrame(state.sandbox, state.panelParams.sandbox, state.simulationTime);
    default:
      return buildIntroductionFrame(state.panelParams.introduction, state.simulationTime);
  }
}

function allControlValues(): Record<string, number> {
  return {
    simulationSpeed: state.simulationSpeed,
    ...currentPanelParams()
  };
}

function handleControlInput(key: string, value: number): void {
  const nextValue = integerKeys.has(key) ? Math.round(value) : value;

  if (key === "simulationSpeed") {
    state.simulationSpeed = nextValue;
    return;
  }

  const params = currentPanelParams();
  if (key in params) {
    params[key] = nextValue;
  }
}

function renderControlSections(): void {
  const axisUnit = unitFromWavelength(currentLambda());
  controls.renderGlobal(globalControls(), axisUnit, handleControlInput);
  controls.renderPanel(controlsForPanel(state.panel), axisUnit, handleControlInput);
  controls.refreshReadouts(allControlValues(), axisUnit);
}

function updatePanelVisibility(): void {
  const isSandbox = state.panel === "sandbox";
  sandboxPalette.classList.toggle("hidden", !isSandbox);
  inspectorPanel.classList.toggle("hidden", !isSandbox);
  if (!isSandbox) {
    intensityCanvas.classList.add("hidden");
  }
}

function rebuildInspector(): void {
  if (state.panel !== "sandbox") {
    return;
  }

  const selected = getSelectedSandboxObject(state.sandbox);
  inspectorFields.innerHTML = "";

  if (!selected) {
    inspectorEmpty.classList.remove("hidden");
    inspectorDeleteButton.classList.add("hidden");
    return;
  }

  inspectorEmpty.classList.add("hidden");
  inspectorDeleteButton.classList.remove("hidden");

  const fields = getSandboxInspectorFields(state.sandbox);
  const grid = document.createElement("div");
  grid.className = "inspector-grid";

  for (const field of fields) {
    const label = document.createElement("label");
    label.textContent = field.label;

    const input = document.createElement("input");
    input.type = "number";
    input.min = String(field.min);
    input.max = String(field.max);
    input.step = String(field.step);
    input.value = String(field.value);

    input.addEventListener("input", () => {
      const numeric = Number(input.value);
      if (Number.isFinite(numeric)) {
        updateSandboxInspectorValue(state.sandbox, field.key, numeric);
      }
    });

    label.appendChild(input);
    grid.appendChild(label);
  }

  inspectorFields.appendChild(grid);
}

function setPanel(panel: PanelId): void {
  state.panel = panel;
  hud.setPanelName(panelNameById[panel]);
  activatePanelTab(panelTabsContainer, panel);
  updatePanelVisibility();
  renderControlSections();
  rebuildInspector();
  intensityHistory.length = 0;
}

function eventToWorld(event: PointerEvent | WheelEvent): [number, number] {
  const rect = viewport.getBoundingClientRect();
  const sx = (event.clientX - rect.left) * pixelRatio;
  const sy = (event.clientY - rect.top) * pixelRatio;
  return screenToWorld(sx, sy, state.camera, viewportWidthPx, viewportHeightPx);
}

function resizeCanvases(): void {
  const rect = viewport.getBoundingClientRect();
  pixelRatio = Math.max(1, window.devicePixelRatio || 1);

  const widthCss = Math.max(1, rect.width);
  const heightCss = Math.max(1, rect.height);

  viewportWidthPx = Math.floor(widthCss * pixelRatio);
  viewportHeightPx = Math.floor(heightCss * pixelRatio);

  mode1Renderer.resize(widthCss, heightCss, pixelRatio);
  mode2Renderer.resize(widthCss, heightCss, pixelRatio);
  axisRenderer.resize(widthCss, heightCss, pixelRatio);

  const intensityWidthCss = Math.min(220, widthCss * 0.18);
  intensityCanvas.width = Math.max(1, Math.floor(intensityWidthCss * pixelRatio));
  intensityCanvas.height = Math.max(1, Math.floor(heightCss * pixelRatio));
  intensityCanvas.style.width = `${intensityWidthCss}px`;
  intensityCanvas.style.height = `${heightCss}px`;
}

function clearIntensityCanvas(): void {
  intensityContext.setTransform(1, 0, 0, 1, 0, 0);
  intensityContext.clearRect(0, 0, intensityCanvas.width, intensityCanvas.height);
}

function updateDiffractionIntensity(frame: PanelFrame, lambda: number): void {
  const probe = frame.intensityProbe;
  const panelIsDiffraction = state.panel === "diffraction";
  const modeUsesField = state.mode === "field";
  if (!panelIsDiffraction || !modeUsesField || !probe?.enabled) {
    intensityCanvas.classList.add("hidden");
    intensityHistory.length = 0;
    clearIntensityCanvas();
    return;
  }

  intensityCanvas.classList.remove("hidden");

  const samples = Math.max(24, Math.floor(probe.samples));
  const worldHalfHeight = viewportHeightPx / (2 * state.camera.scale);
  const yMin = state.camera.centerY - worldHalfHeight;
  const yMax = state.camera.centerY + worldHalfHeight;
  const xProbe = state.camera.centerX + viewportWidthPx / (2 * state.camera.scale) - 0.15;
  const period = probe.period;

  const values: number[] = new Array(samples);
  for (let i = 0; i < samples; i += 1) {
    const t = samples <= 1 ? 0 : i / (samples - 1);
    const y = yMax + (yMin - yMax) * t;
    const a = evaluateAmplitudeAtPoint(
      xProbe,
      y,
      state.simulationTime,
      lambda,
      period,
      frame.sources
    );
    values[i] = a * a;
  }

  intensityHistory.push({ t: state.simulationTime, values });
  while (intensityHistory.length > 0 && intensityHistory[0].t < state.simulationTime - period) {
    intensityHistory.shift();
  }

  const averaged = new Array(samples).fill(0);
  for (const sample of intensityHistory) {
    for (let i = 0; i < samples; i += 1) {
      averaged[i] += sample.values[i] ?? 0;
    }
  }

  const divisor = Math.max(1, intensityHistory.length);
  for (let i = 0; i < samples; i += 1) {
    averaged[i] /= divisor;
  }

  const width = intensityCanvas.width;
  const height = intensityCanvas.height;
  const graphPadding = 8;
  const maxIntensity = Math.max(1e-9, ...averaged);

  intensityContext.setTransform(1, 0, 0, 1, 0, 0);
  intensityContext.clearRect(0, 0, width, height);

  intensityContext.fillStyle = "rgba(0, 0, 0, 0.32)";
  intensityContext.fillRect(0, 0, width, height);

  intensityContext.strokeStyle = "rgba(184, 238, 255, 0.88)";
  intensityContext.lineWidth = 1.4;
  intensityContext.beginPath();

  for (let i = 0; i < samples; i += 1) {
    const py = (i / Math.max(1, samples - 1)) * (height - graphPadding * 2) + graphPadding;
    const px =
      graphPadding +
      (averaged[i] / maxIntensity) * (width - graphPadding * 2);

    if (i === 0) {
      intensityContext.moveTo(px, py);
    } else {
      intensityContext.lineTo(px, py);
    }
  }

  intensityContext.stroke();

  intensityContext.fillStyle = "rgba(255, 241, 176, 0.95)";
  intensityContext.font = `${Math.max(10, Math.floor(11 * pixelRatio))}px "Space Mono", monospace`;
  intensityContext.fillText("I(y) = <A^2>", 8 * pixelRatio, 14 * pixelRatio);
}

function updateCanvasOpacities(): void {
  if (state.panel === "sandbox") {
    const params = state.panelParams.sandbox;
    const mode1Opacity = state.mode === "field" ? params.huygensOpacity * 0.85 : params.huygensOpacity;
    const mode2Opacity = state.mode === "huygens" ? params.fieldOpacity * 0.85 : params.fieldOpacity;
    mode1Canvas.style.opacity = `${Math.min(1, Math.max(0, mode1Opacity))}`;
    mode2Canvas.style.opacity = `${Math.min(1, Math.max(0, mode2Opacity))}`;
    return;
  }

  mode1Canvas.style.opacity = state.mode === "huygens" ? "1" : "0";
  mode2Canvas.style.opacity = state.mode === "field" ? "1" : "0";
}

bindRenderModeToggle(document, (mode) => {
  state.mode = mode;
  if (state.panel === "diffraction" && mode !== "field") {
    intensityHistory.length = 0;
  }
});

bindPanelTabs(panelTabsContainer, (panel) => {
  setPanel(panel);
});

bindSandboxTools(sandboxPalette, (tool) => {
  setSandboxTool(state.sandbox, tool);
  rebuildInspector();
});

inspectorDeleteButton.addEventListener("click", () => {
  deleteSelectedSandboxObject(state.sandbox);
  rebuildInspector();
});

canvasStack.addEventListener("pointerdown", (event) => {
  const [wx, wy] = eventToWorld(event);

  if (state.panel === "sandbox") {
    if (state.sandbox.activeTool) {
      const result = placeSandboxObject(state.sandbox, wx, wy, state.panelParams.sandbox.lambda);
      if (!result.placed && result.reason) {
        transientWarning = {
          message: result.reason,
          expiresAt: performance.now() + 1400
        };
      }
      rebuildInspector();
      return;
    }

    const hit = findSandboxHit(state.sandbox, wx, wy);
    if (hit) {
      selectSandboxObject(state.sandbox, hit.id);
      pointerDrag =
        hit.mode === "move"
          ? { kind: "sandbox-move", objectId: hit.id }
          : { kind: "sandbox-rotate", objectId: hit.id };
      canvasStack.setPointerCapture(event.pointerId);
      rebuildInspector();
      return;
    }

    selectSandboxObject(state.sandbox, null);
    rebuildInspector();
  }

  pointerDrag = {
    kind: "pan",
    lastClientX: event.clientX,
    lastClientY: event.clientY
  };
  canvasStack.setPointerCapture(event.pointerId);
});

canvasStack.addEventListener("pointermove", (event) => {
  if (!pointerDrag) {
    return;
  }

  if (pointerDrag.kind === "pan") {
    const dx = (event.clientX - pointerDrag.lastClientX) * pixelRatio;
    const dy = (event.clientY - pointerDrag.lastClientY) * pixelRatio;
    state.camera.centerX -= dx / state.camera.scale;
    state.camera.centerY += dy / state.camera.scale;
    pointerDrag.lastClientX = event.clientX;
    pointerDrag.lastClientY = event.clientY;
    return;
  }

  const [wx, wy] = eventToWorld(event);
  if (pointerDrag.kind === "sandbox-move") {
    moveSandboxObject(state.sandbox, pointerDrag.objectId, wx, wy);
    return;
  }

  rotateSandboxObjectToPoint(state.sandbox, pointerDrag.objectId, wx, wy);
});

canvasStack.addEventListener("pointerup", (event) => {
  if (canvasStack.hasPointerCapture(event.pointerId)) {
    canvasStack.releasePointerCapture(event.pointerId);
  }
  pointerDrag = null;
});

canvasStack.addEventListener("pointercancel", (event) => {
  if (canvasStack.hasPointerCapture(event.pointerId)) {
    canvasStack.releasePointerCapture(event.pointerId);
  }
  pointerDrag = null;
});

canvasStack.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const [beforeX, beforeY] = eventToWorld(event);

    const zoomFactor = Math.exp(-event.deltaY * 0.0015);
    const minScale = 25 * pixelRatio;
    const maxScale = 1600 * pixelRatio;
    state.camera.scale = Math.max(minScale, Math.min(maxScale, state.camera.scale * zoomFactor));

    const [afterX, afterY] = eventToWorld(event);
    state.camera.centerX += beforeX - afterX;
    state.camera.centerY += beforeY - afterY;
  },
  { passive: false }
);

window.addEventListener("resize", () => {
  resizeCanvases();
});

function renderFrame(): void {
  const frame = frameForPanel(state.panel);
  const lambda = currentLambda();
  const axisUnit = axisRenderer.render(state.camera, lambda);

  controls.refreshReadouts(allControlValues(), axisUnit);
  updateCanvasOpacities();

  mode1Renderer.render(
    frame.drawCommands,
    state.camera,
    state.panel === "sandbox" ? state.panelParams.sandbox.huygensOpacity : 1
  );
  mode2Renderer.render({
    sources: frame.sources,
    time: state.simulationTime,
    lambda,
    period: wavelengthToPeriod(lambda),
    camera: state.camera
  });

  updateDiffractionIntensity(frame, lambda);

  hud.setAxisUnit(axisUnit);
  hud.setTime(state.simulationTime);
  hud.setViewportDistance(formatLength(Math.hypot(state.camera.centerX, state.camera.centerY), axisUnit, 2));

  const dynamicEntries: Record<string, string> = { ...frame.hudEntries };
  if (state.panel === "sandbox") {
    dynamicEntries["Selected Label"] = objectLabel(getSelectedSandboxObject(state.sandbox));
  }
  hud.setDynamicEntries(dynamicEntries);

  if (transientWarning && transientWarning.expiresAt < performance.now()) {
    transientWarning = null;
  }

  const warning = transientWarning?.message ?? frame.warning;
  hud.setWarning(warning);
}

let previousFrameTime = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.04, Math.max(0.001, (now - previousFrameTime) / 1000));
  previousFrameTime = now;

  state.simulationTime += dt * state.simulationSpeed;

  renderFrame();
  requestAnimationFrame(loop);
}

resizeCanvases();
updatePanelVisibility();
renderControlSections();
rebuildInspector();
setPanel("introduction");
requestAnimationFrame(loop);
