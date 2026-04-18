interface PlaybackControlsProps {
  isPlaying: boolean;
  simSpeed: number;
  onTogglePlay: () => void;
  onReset: () => void;
  onSimSpeedChange: (value: number) => void;
}

export const PlaybackControls = ({
  isPlaying,
  simSpeed,
  onTogglePlay,
  onReset,
  onSimSpeedChange
}: PlaybackControlsProps) => {
  return (
    <section className="playback-card">
      <h3>Playback</h3>
      <div className="playback-buttons">
        <button type="button" onClick={onTogglePlay}>
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={onReset}>
          Reset Time
        </button>
      </div>

      <label className="slider-label" htmlFor="sim-speed">
        <span>Simulation Speed</span>
        <strong>{simSpeed.toFixed(2)}x</strong>
      </label>
      <input
        id="sim-speed"
        type="range"
        min={0.1}
        max={3}
        step={0.1}
        value={simSpeed}
        onChange={(event) => onSimSpeedChange(Number(event.target.value))}
      />
    </section>
  );
};
