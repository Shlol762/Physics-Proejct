# Huygens Principle Simulator (Physics Project T8G01)

This is our group project. We built an interactive wave optics simulator in React + TypeScript to make Huygens' principle easier to understand visually.

We also used GenAI during development for brainstorming, drafting code, debugging, and writing support material. We are being transparent about that, and we included a blank prompt log section below so we can paste our exact prompts before final submission.

## What We Wanted To Show

In simple terms, we wanted a tool where we can move sliders and directly see core wave physics:

- Huygens principle (wavefront made from secondary wavelets)
- Reflection and refraction at a boundary
- Total internal reflection (when refraction is not possible)
- Single-slit diffraction and first-minimum angle idea
- Phased-array beam steering using phase delay

## How Our Simulation Works (Big Picture)

At runtime, this is the flow:

1. A frame loop moves simulation time forward.
2. A panel renderer computes geometry and source points for the active scene.
3. If Field mode is active, those source points are sent to WebGL for interference rendering.
4. HUD values are updated so we can track what is happening numerically.

## Main Files (Where Physics Happens)

- `src/hooks/usePhysicsLoop.ts` -> simulation clock and time stepping
- `src/simulation/panelRenderer.ts` -> reflection/refraction/diffraction/phased-array construction
- `src/hooks/useWebGLField.ts` -> GPU field superposition (interference)
- `src/components/SimulationCanvas.tsx` -> links panel output to rendering modes

## Key Physics Code (Extracted)

### 1) Time Stepping (Simulation Clock)

File: `src/hooks/usePhysicsLoop.ts`

```ts
const animate = (now: number): void => {
  const dtRaw = (now - lastRef.current) / 1000;
  const dt = Math.max(0.001, Math.min(0.04, dtRaw));
  lastRef.current = now;

  if (isPlayingRef.current) {
    timeRef.current += dt * simSpeedRef.current;
  }

  onFrameRef.current(timeRef.current, dt);
  rafRef.current = requestAnimationFrame(animate);
};
```

Plain meaning:

- Converts real time to simulation time.
- Clamps `dt` so the animation does not jump too much.
- Applies playback speed from the UI.
- Calls frame rendering every animation frame.

### 2) Reflection + Refraction Core Math

File: `src/simulation/panelRenderer.ts` (inside `drawBoundaryWave`)

```ts
const theta1 = (controls.thetaIncidence * Math.PI) / 180;
const sinT2 = (controls.n1 / controls.n2) * Math.sin(theta1);
const tir = type === "refraction" && Math.abs(sinT2) >= 1;
const theta2 = type === "refraction" && !tir ? Math.asin(sinT2) : null;

const v1 = (C_UM_PER_FS / controls.n1) * PX_PER_UM;
const v2 = (C_UM_PER_FS / (type === "reflection" ? controls.n1 : controls.n2)) * PX_PER_UM;
```

Plain meaning:

- Uses Snell-type relation through `sinT2`.
- Detects total internal reflection (`tir`) when no real refracted angle exists.
- Changes wave speed based on refractive index.

### 3) Diffraction Source Construction

File: `src/simulation/panelRenderer.ts` (inside `drawDiffraction`)

```ts
const period = controls.wavelength / C_UM_PER_FS;
const perSlitSourceCount = Math.max(1, Math.round(controls.slitWidth * 8));

for (const slit of slits) {
  for (let i = 0; i < perSlitSourceCount; i += 1) {
    const t = perSlitSourceCount === 1 ? 0.5 : i / (perSlitSourceCount - 1);
    const y = slit.y0 + t * (slit.y1 - slit.y0);

    sources.push({
      x: barrierX,
      y,
      amplitude: 1 / (count * perSlitSourceCount),
      phase: 0
    });
  }
}
```

Plain meaning:

- We break the slit opening into many tiny source points.
- Wider slit -> more source points.
- Those points are later used for interference rendering in Field mode.

### 4) Phased Array Steering Logic

File: `src/simulation/panelRenderer.ts` (inside `drawPhasedArray`)

```ts
const period = periodFromWavelength(controls.wavelength);
const deltaPhi = TWO_PI * (controls.phaseDelay / Math.max(period, 1e-6));
const argument = (deltaPhi * controls.wavelength) /
  (TWO_PI * Math.max(controls.arraySpacing, 1e-6));

const hasRealBeam = Math.abs(argument) <= 1;
const theta = hasRealBeam ? Math.asin(argument) : null;
```

Plain meaning:

- Converts time delay between elements into phase shift.
- Uses that phase shift to estimate steering angle.
- If `|argument| > 1`, then a real steering angle is not physically valid.

### 5) WebGL Interference Superposition

File: `src/hooks/useWebGLField.ts` fragment shader

```glsl
float k = 6.28318530718 / max(uWavelength, 1e-4);
float wt = 6.28318530718 * (uTime / max(uPeriod, 1e-4));

if (p.x < uBarrierX) {
  A = cos(k * p.x - wt);
} else {
  for (int i = 0; i < MAX_SOURCES; i++) {
    if (i >= uSourceCount) break;
    if (uSourceX[i] < uBarrierX) continue;
    vec2 d = p - vec2(uSourceX[i], uSourceY[i]);
    float r = length(d);
    A += uAmplitude[i] * cos(k * r - wt + uPhase[i] + k * uBarrierX);
  }
}
```

Plain meaning:

- On one side of the barrier, we draw incoming plane-wave behavior.
- On the other side, we add contributions from all active sources.
- This sum gives the interference pattern.

## Scene Summary (What Each Tab Demonstrates)

- Intro:
  - A continuous Huygens-style propagation chain.
- Reflection:
  - Incoming front reflects at a boundary.
- Refraction:
  - Direction and speed change with `n1` and `n2`; includes TIR case.
- Diffraction:
  - Single-slit source distribution with geometric and field views.
- Phased Array:
  - Multi-element source steering via phase delay.

## Controls (Quick Meaning)

- `wavelength` (um): controls spatial/temporal wave scale.
- `thetaIncidence` (deg): incoming angle for boundary scenes.
- `n1`, `n2`: refractive indices.
- `slitWidth` (um): aperture width and source density.
- `phaseDelay` (fs): emitter-to-emitter delay for steering.
- `arraySpacing` (um): spacing between phased-array elements.
- `elementCount`: number of array elements.
- `simSpeed`: playback speed multiplier.

## GenAI Use Disclosure

A simulation that looks this clean and runs this smoothly could not have been feasibly acheived in a short time. As we wanted to deliver on the visual experience and intuition-building aspect, we used GenAI as a development assistant while building this project.

How we used it:

- Brainstorming implementation options:
- Generating/refining boilerplate code
- Debugging and cleanup suggestions
- Documentation drafting support

What we still did ourselves:

- Chose final architecture
- Verified behavior against physics expectations
- Reviewed and edited generated code
- Tuned visuals and controls

## Prompt Log (Blank Space To Fill In)

Paste the exact prompts your team used below.

```text
Prompt 1:




Prompt 2:




Prompt 3:




Prompt 4:




Prompt 5:




Prompt 6:




```

## How To Run

Requirements:

- Node.js 18+

Commands:

```bash
npm install
npm run dev
```

Build preview:

```bash
npm run build
npm run preview
```

## Current Limits

- Diffraction flow is currently set up as a single-slit case in active app logic.
- This is an educational simulator, not a full high-precision numerical solver.
- Canvas mode is geometric/constructive; Field mode is interference-focused.
