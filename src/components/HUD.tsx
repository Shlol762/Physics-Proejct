import { HudSnapshot } from "../types/simulation";

interface HUDProps {
  snapshot: HudSnapshot;
}

export const HUD = ({ snapshot }: HUDProps) => {
  return (
    <aside className="hud-panel">
      <h2>HUD</h2>

      <div className="hud-row">
        <span>Panel</span>
        <strong>{snapshot.panelLabel}</strong>
      </div>
      <div className="hud-row">
        <span>Mode</span>
        <strong>{snapshot.mode === "huygens" ? "Huygens" : "Field"}</strong>
      </div>
      <div className="hud-row">
        <span>Time</span>
        <strong>{snapshot.time.toFixed(2)} fs</strong>
      </div>

      {snapshot.lines.map((line) => (
        <div className="hud-row" key={line.label}>
          <span>{line.label}</span>
          <strong>{line.value}</strong>
        </div>
      ))}

      {snapshot.warning ? <p className="hud-warning">{snapshot.warning}</p> : null}

      <section className="legend-card">
        <h3>Legend</h3>
        <div className="legend-row">
          <span className="dot dot-wave" />
          Wavefront / Plane front
        </div>
        <div className="legend-row">
          <span className="dot dot-wavelet" />
          Huygens wavelet
        </div>
        <div className="legend-row">
          <span className="dot dot-source" />
          Source point
        </div>
        <div className="legend-row">
          <span className="dot dot-envelope" />
          Tangent envelope
        </div>
      </section>
    </aside>
  );
};
