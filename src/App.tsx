import { useMemo, useState } from "react";

import { HUD } from "./components/HUD";
import { Sidebar } from "./components/Sidebar";
import { SimulationCanvas } from "./components/SimulationCanvas";
import { isFieldCapableTab } from "./constants";
import {
  FieldCapableTab,
  HudSnapshot,
  RenderMode,
  SimulationControls,
  TabId
} from "./types/simulation";

const defaultControls: SimulationControls = {
  n1: 1,
  n2: 1.5,
  thetaIncidence: 30,
  wavelength: 0.8,
  slitWidth: 2,
  slitCount: 2,
  slitSeparation: 2,
  phaseDelay: 1.2,
  arraySpacing: 0.8,
  elementCount: 7,
  simSpeed: 1
};

const defaultHud: HudSnapshot = {
  panelLabel: "Intro",
  mode: "huygens",
  time: 0,
  lines: []
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>("intro");
  const [controls, setControls] = useState<SimulationControls>(defaultControls);
  const [isPlaying, setIsPlaying] = useState(true);
  const [resetCounter, setResetCounter] = useState(0);
  const [hudSnapshot, setHudSnapshot] = useState<HudSnapshot>(defaultHud);

  const [modeByTab, setModeByTab] = useState<Record<FieldCapableTab, RenderMode>>({
    diffraction: "huygens",
    phasedArray: "huygens"
  });

  const renderMode = useMemo<RenderMode>(() => {
    if (!isFieldCapableTab(activeTab)) {
      return "huygens";
    }
    return modeByTab[activeTab];
  }, [activeTab, modeByTab]);

  const updateControl = <K extends keyof SimulationControls>(key: K, value: number): void => {
    setControls((previous) => ({ ...previous, [key]: value }));
  };

  const handleTabChange = (tab: TabId): void => {
    setActiveTab(tab);
    setResetCounter((value) => value + 1);
  };

  const handleModeChange = (tab: FieldCapableTab, mode: RenderMode): void => {
    setModeByTab((previous) => ({ ...previous, [tab]: mode }));
  };

  const handleReset = (): void => {
    setResetCounter((value) => value + 1);
  };

  return (
    <div className="app-shell">
      <Sidebar
        activeTab={activeTab}
        controls={controls}
        renderMode={renderMode}
        isPlaying={isPlaying}
        onTabChange={handleTabChange}
        onControlChange={updateControl}
        onModeChange={handleModeChange}
        onTogglePlay={() => setIsPlaying((value) => !value)}
        onReset={handleReset}
      />

      <SimulationCanvas
        activeTab={activeTab}
        controls={controls}
        isPlaying={isPlaying}
        renderMode={renderMode}
        resetCounter={resetCounter}
        onHudSnapshot={setHudSnapshot}
      />

      <HUD snapshot={hudSnapshot} />
    </div>
  );
}
