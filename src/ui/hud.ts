import type { AxisUnitInfo } from "../physics/wavefront";

export class HudView {
  private readonly panelName = this.mustGet("hud-panel-name");
  private readonly axisUnit = this.mustGet("hud-axis-unit");
  private readonly time = this.mustGet("hud-time");
  private readonly viewportDistance = this.mustGet("hud-viewport-distance");
  private readonly dynamic = this.mustGet("hud-dynamic");
  private readonly warning = this.mustGet("hud-warning");

  private mustGet(id: string): HTMLElement {
    const el = document.getElementById(id);
    if (!el) {
      throw new Error(`Missing HUD element #${id}.`);
    }
    return el;
  }

  setPanelName(name: string): void {
    this.panelName.textContent = name;
  }

  setAxisUnit(unitInfo: AxisUnitInfo): void {
    this.axisUnit.textContent = unitInfo.unit;
  }

  setTime(seconds: number): void {
    this.time.textContent = `${seconds.toFixed(2)} s`;
  }

  setViewportDistance(valueText: string): void {
    this.viewportDistance.textContent = valueText;
  }

  setDynamicEntries(entries: Record<string, string>): void {
    this.dynamic.innerHTML = "";
    for (const [key, value] of Object.entries(entries)) {
      const line = document.createElement("div");
      line.textContent = `${key}: ${value}`;
      this.dynamic.appendChild(line);
    }
  }

  setWarning(message?: string): void {
    if (!message) {
      this.warning.classList.add("hidden");
      this.warning.textContent = "";
      return;
    }
    this.warning.classList.remove("hidden");
    this.warning.textContent = message;
  }
}
