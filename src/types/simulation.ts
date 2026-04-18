export type TabId =
  | "intro"
  | "reflection"
  | "refraction"
  | "diffraction"
  | "phasedArray";

export type FieldCapableTab = "diffraction" | "phasedArray";

export type RenderMode = "huygens" | "field";

export interface WaveSource {
  x: number;
  y: number;
  amplitude: number;
  phase: number;
}

export interface SimulationControls {
  n1: number;
  n2: number;
  thetaIncidence: number;
  wavelength: number;
  slitWidth: number;
  slitCount: number;
  slitSeparation: number;
  phaseDelay: number;
  arraySpacing: number;
  elementCount: number;
  simSpeed: number;
}

export interface HudLine {
  label: string;
  value: string;
}

export interface PanelFrameOutput {
  sources: WaveSource[];
  hudLines: HudLine[];
  warning?: string;
}

export interface HudSnapshot {
  panelLabel: string;
  time: number;
  mode: RenderMode;
  lines: HudLine[];
  warning?: string;
}
