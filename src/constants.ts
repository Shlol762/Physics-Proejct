import { FieldCapableTab, TabId } from "./types/simulation";

export const C_UM_PER_FS = 0.3;
export const PX_PER_UM = 80;
export const TWO_PI = Math.PI * 2;

export const CANVAS_WIDTH = 960;
export const CANVAS_HEIGHT = 640;

export const MAX_SHADER_SOURCES = 128;

export const TAB_LABELS: Record<TabId, string> = {
  intro: "Intro",
  reflection: "Reflection",
  refraction: "Refraction",
  diffraction: "Diffraction",
  phasedArray: "Phased Array"
};

export const FIELD_CAPABLE_TABS: FieldCapableTab[] = ["diffraction", "phasedArray"];

export const isFieldCapableTab = (tab: TabId): tab is FieldCapableTab => {
  return FIELD_CAPABLE_TABS.includes(tab as FieldCapableTab);
};
