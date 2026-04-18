import { PlaybackControls } from "./PlaybackControls";

import { TAB_LABELS, isFieldCapableTab } from "../constants";
import {
  FieldCapableTab,
  RenderMode,
  SimulationControls,
  TabId
} from "../types/simulation";

interface SidebarProps {
  activeTab: TabId;
  controls: SimulationControls;
  renderMode: RenderMode;
  isPlaying: boolean;
  onTabChange: (tab: TabId) => void;
  onControlChange: <K extends keyof SimulationControls>(key: K, value: number) => void;
  onModeChange: (tab: FieldCapableTab, mode: RenderMode) => void;
  onTogglePlay: () => void;
  onReset: () => void;
}

interface SliderRowProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}

const SliderRow = ({
  id,
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange
}: SliderRowProps) => (
  <div className="slider-row">
    <label className="slider-label" htmlFor={id}>
      <span>{label}</span>
      <strong>
        {value.toFixed(2)}
        {suffix ?? ""}
      </strong>
    </label>
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  </div>
);

export const Sidebar = ({
  activeTab,
  controls,
  renderMode,
  isPlaying,
  onTabChange,
  onControlChange,
  onModeChange,
  onTogglePlay,
  onReset
}: SidebarProps) => {
  const tabs: TabId[] = [
    "intro",
    "reflection",
    "refraction",
    "diffraction",
    "phasedArray"
  ];

  return (
    <aside className="sidebar">
      <header className="title-block">
        <h1>Huygens Engine</h1>
        <p>Hybrid Canvas/WebGL wavefront and interference simulator</p>
      </header>

      <nav className="tabs">
        {tabs.map((tab, index) => (
          <button
            key={tab}
            type="button"
            className={tab === activeTab ? "tab active" : "tab"}
            onClick={() => onTabChange(tab)}
          >
            {index + 1}. {TAB_LABELS[tab]}
          </button>
        ))}
      </nav>

      <section className="controls-card">
        <h2>Global Controls</h2>
        <SliderRow
          id="wavelength"
          label="Wavelength lambda"
          value={controls.wavelength}
          min={0.2}
          max={3}
          step={0.05}
          suffix=" um"
          onChange={(value) => onControlChange("wavelength", value)}
        />
      </section>

      {isFieldCapableTab(activeTab) ? (
        <section className="controls-card">
          <h2>Rendering Mode</h2>
          <div className="mode-toggle" role="group" aria-label="Rendering mode">
            <button
              type="button"
              className={renderMode === "huygens" ? "active" : ""}
              onClick={() => onModeChange(activeTab, "huygens")}
            >
              Mode: Huygens (Canvas)
            </button>
            <button
              type="button"
              className={renderMode === "field" ? "active" : ""}
              onClick={() => onModeChange(activeTab, "field")}
            >
              Mode: Field (WebGL)
            </button>
          </div>
        </section>
      ) : null}

      <section className="controls-card">
        <h2>Panel Controls</h2>

        {(activeTab === "reflection" || activeTab === "refraction") && (
          <>
            <SliderRow
              id="theta"
              label="Incidence Angle theta1"
              value={controls.thetaIncidence}
              min={0}
              max={85}
              step={0.5}
              suffix=" deg"
              onChange={(value) => onControlChange("thetaIncidence", value)}
            />

            {activeTab === "refraction" ? (
              <>
                <SliderRow
                  id="n1"
                  label="Refractive Index n1"
                  value={controls.n1}
                  min={1}
                  max={3}
                  step={0.05}
                  onChange={(value) => onControlChange("n1", value)}
                />
                <SliderRow
                  id="n2"
                  label="Refractive Index n2"
                  value={controls.n2}
                  min={1}
                  max={3}
                  step={0.05}
                  onChange={(value) => onControlChange("n2", value)}
                />
              </>
            ) : null}
          </>
        )}

        {activeTab === "diffraction" && (
          <>
            <SliderRow
              id="slitWidth"
              label="Slit Width a"
              value={controls.slitWidth}
              min={0.3}
              max={6}
              step={0.1}
              suffix=" um"
              onChange={(value) => onControlChange("slitWidth", value)}
            />
            <SliderRow
              id="slitCount"
              label="Slit Count N"
              value={controls.slitCount}
              min={1}
              max={6}
              step={1}
              onChange={(value) => onControlChange("slitCount", Math.round(value))}
            />
            <SliderRow
              id="slitSeparation"
              label="Separation d"
              value={controls.slitSeparation}
              min={0.6}
              max={6}
              step={0.1}
              suffix=" um"
              onChange={(value) => onControlChange("slitSeparation", value)}
            />
          </>
        )}

        {activeTab === "phasedArray" && (
          <>
            <SliderRow
              id="phaseDelay"
              label="Phase Delay Dt"
              value={controls.phaseDelay}
              min={-3}
              max={3}
              step={0.1}
              suffix=" fs"
              onChange={(value) => onControlChange("phaseDelay", value)}
            />
            <SliderRow
              id="arraySpacing"
              label="Element Spacing d"
              value={controls.arraySpacing}
              min={0.4}
              max={2.5}
              step={0.05}
              suffix=" um"
              onChange={(value) => onControlChange("arraySpacing", value)}
            />
            <SliderRow
              id="elementCount"
              label="Element Count"
              value={controls.elementCount}
              min={2}
              max={16}
              step={1}
              onChange={(value) => onControlChange("elementCount", Math.round(value))}
            />
          </>
        )}
      </section>

      <PlaybackControls
        isPlaying={isPlaying}
        simSpeed={controls.simSpeed}
        onTogglePlay={onTogglePlay}
        onReset={onReset}
        onSimSpeedChange={(value) => onControlChange("simSpeed", value)}
      />
    </aside>
  );
};
