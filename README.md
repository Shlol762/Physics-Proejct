# Huygens Principle Simulator (Physics Project T8G01)

This is our group project. We built an interactive wave optics simulator in React + TypeScript to make Huygens' principle easier to understand visually.

#### Click [here](https://shlol762.github.io/Physics-Proejct/) to experience the simulator.

## GenAI Use Disclosure

A simulation that looks this clean and runs this smoothly could not have been feasibly acheived in a short time. As we wanted to deliver on the visual experience and intuition-building aspect, we used GenAI as a development assistant while building this project.

How we used it:

- Brainstorming implementation options:
  - We had to choose between Python and JavaScript. Ultimately, we proceeded with JavaScript because of its lightweight nature and ease of sharing interactive demos on the web.
- Generating/refining boilerplate code
- Debugging and cleanup suggestions

What we did ourselves:

- Chose final architecture
- Verified behavior against physics expectations
- Reviewed and edited generated code
- Tuned visuals and controls


## What We Wanted To Do

In simple terms, we wanted a simulator where we can move sliders and directly see the consequences of these quantities in wave physics, in the context of Huygens' principle. The main phenomena we cover are:

- Huygens principle (wavefronts made from secondary wavelets)
- Reflection and refraction at a boundary
- Total internal reflection (when refraction is not possible)
- Single-slit diffraction
- Phased-array beam steering using phase delay

## How Our Simulation Works (Overview)

At runtime, this is the flow:

1. A loop moves simulation time forward.
2. A renderer computes the geometry and source points for the active scene, at that point in time.
3. When Interference mode is active, those source points are sent to WebGL for interference rendering.

## Main Files (Where Physics Happens)

- `src/hooks/usePhysicsLoop.ts` -> simulation clock and time stepping
- `src/simulation/panelRenderer.ts` -> reflection/refraction/diffraction/phased-array construction
- `src/hooks/useWebGLField.ts` -> GPU field superposition (interference)
- `src/components/SimulationCanvas.tsx` -> links panel output to rendering modes

## Key Physics Code (Formulae + Annotated Extracts)

This section maps each implemented physics law to the code path that applies it.
Comments inside snippets explicitly name the law being used.

### Formula Summary

- Wave speed in medium: `v = c / n`
- Period from wavelength (simulator units): `T = lambda / c`
- Snell's law: `n1 * sin(theta1) = n2 * sin(theta2)`
- Reflection law: `theta_r = theta_i`
- Total internal reflection condition: `| (n1 / n2) * sin(theta1) | >= 1`
- Single-slit first minimum: `a * sin(theta_1) = lambda`
- Phased-array phase shift: `delta_phi = omega * delta_t = 2pi * delta_t / T`
- Beam steering relation: `sin(theta_beam) = (delta_phi * lambda) / (2pi * d)`
- Harmonic wave quantities: `k = 2pi / lambda`, `omega = 2pi / T`
- Interference superposition: `A = sum_i a_i * cos(k * r_i - omega * t + phi_i)`

### 1) Simulation Clock and Time Integration

File: `src/hooks/usePhysicsLoop.ts`

```ts
const animate = (now: number): void => {
  const dtRaw = (now - lastRef.current) / 1000;
  // Numerical integration safeguard: we clamp dt so a slow frame does not
  // create an unrealistically large jump in simulated time.
  const dt = Math.max(0.001, Math.min(0.04, dtRaw));
  lastRef.current = now;

  if (isPlayingRef.current) {
    // Time update rule: the next simulation time equals current time plus
    // the elapsed step scaled by the user-selected playback speed.
    timeRef.current += dt * simSpeedRef.current;
  }

  onFrameRef.current(timeRef.current, dt);
  rafRef.current = requestAnimationFrame(animate);
};
```

### 2) Huygens Propagation (Intro Panel)

File: `src/simulation/panelRenderer.ts` (`drawIntro`)

```ts
const speedPxPerFs = C_UM_PER_FS * PX_PER_UM;
// Wave-speed relation v = c / n: in this intro scene the medium is treated
// as n = 1, so propagation uses the baseline speed converted to pixels.

const deltaTFs = Math.max(0.75, periodFromWavelength(controls.wavelength) * 0.9);
// Period relation T = lambda / c: this sets the source timing from the
// wavelength so temporal spacing stays physically consistent.
const emissionPeriodFs = deltaTFs * 2;

const chainFrontRadiusPx = chainAgeFs * speedPxPerFs;
// Huygens propagation step: each emitted front expands radially with
// radius r = v * delta_t as time advances.

const waveletRadiusPx = speedPxPerFs * waveletTimeFs;
// Secondary-wavelet update: each secondary source also grows according to
// the same radial law r = v * delta_t.
```

### 3) Reflection, Refraction, and Total Internal Reflection

File: `src/simulation/panelRenderer.ts` (`drawBoundaryWave`)

```ts
const theta1 = (controls.thetaIncidence * Math.PI) / 180;

// Snell's law in computational form: solve for sin(theta2) from
// n1 * sin(theta1) = n2 * sin(theta2).
const sinT2 = (controls.n1 / controls.n2) * Math.sin(theta1);

// Total internal reflection check: when |sin(theta2)| is at least 1,
// there is no real-valued refracted angle in the second medium.
const tir = type === "refraction" && Math.abs(sinT2) >= 1;
const theta2 = type === "refraction" && !tir ? Math.asin(sinT2) : null;

// Medium-dependent speeds from v = c / n: increasing refractive index
// lowers phase speed, which changes wavefront bending and spacing.
const v1 = (C_UM_PER_FS / controls.n1) * PX_PER_UM;
const v2 = (C_UM_PER_FS / (type === "reflection" ? controls.n1 : controls.n2)) * PX_PER_UM;

// Reflection law theta_r = theta_i: reflected direction keeps the same
// tangential component and flips the normal component across the boundary.
const incidentDir = { x: Math.sin(theta1), y: Math.cos(theta1) };
const reflectedDir = { x: Math.sin(theta1), y: -Math.cos(theta1) };
```

### 4) Single-Slit Diffraction Model

File: `src/simulation/panelRenderer.ts` (`drawDiffraction`)

```ts
const period = controls.wavelength / C_UM_PER_FS;
// Temporal conversion using T = lambda / c so the oscillation period
// remains consistent with the selected wavelength.

const perSlitSourceCount = Math.max(1, Math.round(controls.slitWidth * 8));
// Huygens-Fresnel discretization: represent the slit as many point sources
// so the aperture can re-radiate wavelets across its width.

for (let i = 0; i < perSlitSourceCount; i += 1) {
  const t = perSlitSourceCount === 1 ? 0.5 : i / (perSlitSourceCount - 1);
  const y = slit.y0 + t * (slit.y1 - slit.y0);

  sources.push({
    x: barrierX,
    y,
    // Amplitude normalization: dividing by source count keeps the summed
    // interference field in a controlled range as discretization changes.
    amplitude: 1 / perSlitSourceCount,
    phase: 0
  });
}

const sinTheta = controls.wavelength / controls.slitWidth;
// First diffraction-minimum condition for m = 1:
// a * sin(theta_1) = lambda, used to draw the reference angular bounds.
if (sinTheta < 1) {
  const theta = Math.asin(sinTheta);
}
```

### 5) Phased-Array Steering

File: `src/simulation/panelRenderer.ts` (`drawPhasedArray`)

```ts
const period = periodFromWavelength(controls.wavelength);

// Time-delay to phase-shift mapping:
// delta_phi = omega * delta_t = 2pi * delta_t / T.
const deltaPhi = TWO_PI * (controls.phaseDelay / Math.max(period, 1e-6));

// Uniform linear array steering relation:
// sin(theta_beam) = (delta_phi * lambda) / (2pi * d).
const argument = (deltaPhi * controls.wavelength) /
  (TWO_PI * Math.max(controls.arraySpacing, 1e-6));

const hasRealBeam = Math.abs(argument) <= 1;
const theta = hasRealBeam ? Math.asin(argument) : null;
// Physical validity check: if |argument| exceeds 1, arcsin is not real,
// so the chosen delay/spacing pair cannot produce a real beam angle.
```

### 6) Field Interference Superposition (WebGL)

File: `src/hooks/useWebGLField.ts` (fragment shader)

```glsl
// Harmonic-wave parameters: wavenumber k = 2pi / lambda controls spatial
// phase change, while angular frequency omega = 2pi / T controls time phase.
float k = 6.28318530718 / max(uWavelength, 1e-4);
float wt = 6.28318530718 * (uTime / max(uPeriod, 1e-4));

if (p.x < uBarrierX) {
  // Incident-region model: before the barrier we render a plane wave
  // A = cos(kx - omega t) moving in the +x direction.
  A = cos(k * p.x - wt);
} else {
  for (int i = 0; i < MAX_SOURCES; i++) {
    if (i >= uSourceCount) break;
    if (uSourceX[i] < uBarrierX) continue;
    vec2 d = p - vec2(uSourceX[i], uSourceY[i]);
    float r = length(d);

    // Linear superposition principle for coherent sources:
    // the total field equals the sum of each source contribution,
    // A_total = sum_i a_i * cos(k * r_i - omega * t + phi_i).
    A += uAmplitude[i] * cos(k * r - wt + uPhase[i] + k * uBarrierX);
  }
}
```

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
