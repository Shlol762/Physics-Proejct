import type { AxisUnitInfo, PanelId, RenderMode } from "../physics/wavefront";

export type SliderValueKind =
  | "length"
  | "angle"
  | "index"
  | "phase"
  | "speed"
  | "coefficient"
  | "count"
  | "raw";

export interface SliderControl {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  kind: SliderValueKind;
}

interface SliderBinding {
  key: string;
  kind: SliderValueKind;
  output: HTMLOutputElement;
  input: HTMLInputElement;
}

function formatValue(value: number, kind: SliderValueKind, axisUnit: AxisUnitInfo): string {
  switch (kind) {
    case "length": {
      const display = value / axisUnit.factor;
      return `${display.toFixed(display >= 100 ? 1 : 3)} ${axisUnit.unit}`;
    }
    case "angle":
      return `${value.toFixed(1)} deg`;
    case "index":
      return value.toFixed(2);
    case "phase":
      return `${value.toFixed(1)} deg`;
    case "speed":
      return `${value.toFixed(2)}x`;
    case "coefficient":
      return value.toFixed(2);
    case "count":
      return `${Math.round(value)}`;
    case "raw":
    default:
      return value.toFixed(3);
  }
}

function buildSliderNode(
  control: SliderControl,
  axisUnit: AxisUnitInfo,
  onInput: (key: string, value: number) => void
): { wrapper: HTMLDivElement; binding: SliderBinding } {
  const wrapper = document.createElement("div");
  wrapper.className = "control";

  const label = document.createElement("label");
  label.textContent = control.label;
  label.htmlFor = `slider-${control.key}`;

  const output = document.createElement("output");
  output.textContent = formatValue(control.value, control.kind, axisUnit);

  const input = document.createElement("input");
  input.type = "range";
  input.id = `slider-${control.key}`;
  input.min = String(control.min);
  input.max = String(control.max);
  input.step = String(control.step);
  input.value = String(control.value);

  input.addEventListener("input", () => {
    const next = Number(input.value);
    output.textContent = formatValue(next, control.kind, axisUnit);
    onInput(control.key, next);
  });

  wrapper.append(label, output, input);

  return {
    wrapper,
    binding: {
      key: control.key,
      kind: control.kind,
      output,
      input
    }
  };
}

export class ControlsUI {
  private globalBindings: SliderBinding[] = [];
  private panelBindings: SliderBinding[] = [];

  constructor(
    private readonly globalContainer: HTMLElement,
    private readonly panelContainer: HTMLElement
  ) {}

  renderGlobal(
    controls: SliderControl[],
    axisUnit: AxisUnitInfo,
    onInput: (key: string, value: number) => void
  ): void {
    this.globalBindings = this.renderSection(this.globalContainer, controls, axisUnit, onInput);
  }

  renderPanel(
    controls: SliderControl[],
    axisUnit: AxisUnitInfo,
    onInput: (key: string, value: number) => void
  ): void {
    this.panelBindings = this.renderSection(this.panelContainer, controls, axisUnit, onInput);
  }

  private renderSection(
    container: HTMLElement,
    controls: SliderControl[],
    axisUnit: AxisUnitInfo,
    onInput: (key: string, value: number) => void
  ): SliderBinding[] {
    const heading = container.querySelector("h2");
    container.innerHTML = "";
    if (heading) {
      container.appendChild(heading);
    }

    const bindings: SliderBinding[] = [];
    for (const control of controls) {
      const { wrapper, binding } = buildSliderNode(control, axisUnit, onInput);
      container.appendChild(wrapper);
      bindings.push(binding);
    }

    return bindings;
  }

  refreshReadouts(values: Record<string, number>, axisUnit: AxisUnitInfo): void {
    for (const binding of [...this.globalBindings, ...this.panelBindings]) {
      const value = values[binding.key];
      if (typeof value !== "number") {
        continue;
      }
      if (Number(binding.input.value) !== value) {
        binding.input.value = String(value);
      }
      binding.output.textContent = formatValue(value, binding.kind, axisUnit);
    }
  }
}

export function bindRenderModeToggle(
  root: ParentNode,
  onChange: (mode: RenderMode) => void
): void {
  const radios = root.querySelectorAll<HTMLInputElement>('input[name="render-mode"]');
  radios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (radio.checked) {
        onChange(radio.value as RenderMode);
      }
    });
  });
}

export function setRenderMode(root: ParentNode, mode: RenderMode): void {
  const radio = root.querySelector<HTMLInputElement>(`input[name="render-mode"][value="${mode}"]`);
  if (radio) {
    radio.checked = true;
  }
}

export function bindPanelTabs(root: ParentNode, onSelect: (panel: PanelId) => void): void {
  const buttons = root.querySelectorAll<HTMLButtonElement>("[data-panel]");
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const panel = button.dataset.panel as PanelId;
      onSelect(panel);
      buttons.forEach((b) => b.classList.toggle("active", b === button));
    });
  });
}

export function activatePanelTab(root: ParentNode, panel: PanelId): void {
  const buttons = root.querySelectorAll<HTMLButtonElement>("[data-panel]");
  buttons.forEach((button) => {
    button.classList.toggle("active", button.dataset.panel === panel);
  });
}

export type SandboxToolId =
  | ""
  | "source-point"
  | "source-line"
  | "source-plane"
  | "source-aperture"
  | "element-flat-mirror"
  | "element-curved-mirror"
  | "element-converging-lens"
  | "element-diverging-lens"
  | "element-wall"
  | "element-slit-barrier"
  | "element-dielectric";

export function bindSandboxTools(
  root: ParentNode,
  onToolChange: (tool: SandboxToolId) => void
): void {
  const buttons = root.querySelectorAll<HTMLButtonElement>("[data-tool]");
  const clear = root.querySelector<HTMLButtonElement>("#sandbox-tool-clear");

  const setActive = (tool: SandboxToolId) => {
    buttons.forEach((button) => {
      button.classList.toggle("active", button.dataset.tool === tool);
    });
  };

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const tool = (button.dataset.tool ?? "") as SandboxToolId;
      setActive(tool);
      onToolChange(tool);
    });
  });

  clear?.addEventListener("click", () => {
    setActive("");
    onToolChange("");
  });
}
