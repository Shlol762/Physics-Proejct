import { RefObject, useCallback, useEffect, useRef } from "react";

import { MAX_SHADER_SOURCES } from "../constants";
import { WaveSource } from "../types/simulation";

const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

#define MAX_SOURCES 128

uniform vec2 uResolution;
uniform float uTime;
uniform float uWavelength;
uniform float uPeriod;
uniform int uSourceCount;
uniform float uSourceX[MAX_SOURCES];
uniform float uSourceY[MAX_SOURCES];
uniform float uAmplitude[MAX_SOURCES];
uniform float uPhase[MAX_SOURCES];
uniform float uNormalization;

out vec4 outColor;

void main() {
  vec2 p = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);

  float k = 6.28318530718 / max(uWavelength, 1e-4);
  float wt = 6.28318530718 * (uTime / max(uPeriod, 1e-4));

  float A = 0.0;
  for (int i = 0; i < MAX_SOURCES; i++) {
    if (i >= uSourceCount) {
      break;
    }
    vec2 d = p - vec2(uSourceX[i], uSourceY[i]);
    float r = length(d);
    A += uAmplitude[i] * cos(k * r - wt + uPhase[i]);
  }

  float scaled = clamp(abs(A) / max(uNormalization, 1e-4), 0.0, 1.0);
  vec3 color = vec3(0.0);

  if (A > 0.0) {
    color = vec3(scaled, 0.0, 0.0);
  } else if (A < 0.0) {
    color = vec3(0.0, 0.0, scaled);
  }

  outColor = vec4(color, 1.0);
}
`;

interface WebGLLocations {
  aPosition: number;
  uResolution: WebGLUniformLocation;
  uTime: WebGLUniformLocation;
  uWavelength: WebGLUniformLocation;
  uPeriod: WebGLUniformLocation;
  uSourceCount: WebGLUniformLocation;
  uSourceX: WebGLUniformLocation;
  uSourceY: WebGLUniformLocation;
  uAmplitude: WebGLUniformLocation;
  uPhase: WebGLUniformLocation;
  uNormalization: WebGLUniformLocation;
}

interface WebGLState {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  quadBuffer: WebGLBuffer;
  locations: WebGLLocations;
  sourceX: Float32Array;
  sourceY: Float32Array;
  amplitudes: Float32Array;
  phases: Float32Array;
}

interface FieldRenderParams {
  sources: WaveSource[];
  time: number;
  wavelength: number;
  period: number;
}

function compileShader(
  gl: WebGL2RenderingContext,
  shaderType: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(shaderType);
  if (!shader) {
    throw new Error("Unable to create WebGL shader object.");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "Unknown shader compile error";
    gl.deleteShader(shader);
    throw new Error(log);
  }

  return shader;
}

function buildProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);

  const program = gl.createProgram();
  if (!program) {
    throw new Error("Unable to create WebGL program.");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "Unknown program link error";
    gl.deleteProgram(program);
    throw new Error(log);
  }

  return program;
}

function uniform(gl: WebGL2RenderingContext, program: WebGLProgram, name: string): WebGLUniformLocation {
  const loc = gl.getUniformLocation(program, name);
  if (!loc) {
    throw new Error(`Missing uniform: ${name}`);
  }
  return loc;
}

function createState(canvas: HTMLCanvasElement): WebGLState | null {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false
  });

  if (!gl) {
    return null;
  }

  const program = buildProgram(gl);
  const quadBuffer = gl.createBuffer();
  if (!quadBuffer) {
    throw new Error("Unable to allocate fullscreen quad buffer.");
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  const locations: WebGLLocations = {
    aPosition: gl.getAttribLocation(program, "aPosition"),
    uResolution: uniform(gl, program, "uResolution"),
    uTime: uniform(gl, program, "uTime"),
    uWavelength: uniform(gl, program, "uWavelength"),
    uPeriod: uniform(gl, program, "uPeriod"),
    uSourceCount: uniform(gl, program, "uSourceCount"),
    uSourceX: uniform(gl, program, "uSourceX[0]"),
    uSourceY: uniform(gl, program, "uSourceY[0]"),
    uAmplitude: uniform(gl, program, "uAmplitude[0]"),
    uPhase: uniform(gl, program, "uPhase[0]"),
    uNormalization: uniform(gl, program, "uNormalization")
  };

  gl.clearColor(0, 0, 0, 1);

  return {
    gl,
    program,
    quadBuffer,
    locations,
    sourceX: new Float32Array(MAX_SHADER_SOURCES),
    sourceY: new Float32Array(MAX_SHADER_SOURCES),
    amplitudes: new Float32Array(MAX_SHADER_SOURCES),
    phases: new Float32Array(MAX_SHADER_SOURCES)
  };
}

export const useWebGLField = (canvasRef: RefObject<HTMLCanvasElement>) => {
  const stateRef = useRef<WebGLState | null>(null);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    stateRef.current = createState(canvasRef.current);
    return () => {
      stateRef.current = null;
    };
  }, [canvasRef]);

  const clear = useCallback(() => {
    const state = stateRef.current;
    if (!state) {
      return;
    }

    const { gl } = state;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }, []);

  const render = useCallback((params: FieldRenderParams) => {
    const state = stateRef.current;
    if (!state) {
      return;
    }

    const { gl, program, quadBuffer, locations, sourceX, sourceY, amplitudes, phases } = state;

    gl.useProgram(program);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.enableVertexAttribArray(locations.aPosition);
    gl.vertexAttribPointer(locations.aPosition, 2, gl.FLOAT, false, 0, 0);

    const count = Math.min(MAX_SHADER_SOURCES, params.sources.length);
    sourceX.fill(0);
    sourceY.fill(0);
    amplitudes.fill(0);
    phases.fill(0);

    let norm = 0;
    for (let i = 0; i < count; i += 1) {
      const src = params.sources[i];
      sourceX[i] = src.x;
      sourceY[i] = src.y;
      amplitudes[i] = src.amplitude;
      phases[i] = src.phase;
      norm += Math.abs(src.amplitude);
    }

    gl.uniform2f(locations.uResolution, gl.canvas.width, gl.canvas.height);
    gl.uniform1f(locations.uTime, params.time);
    gl.uniform1f(locations.uWavelength, params.wavelength);
    gl.uniform1f(locations.uPeriod, params.period);
    gl.uniform1i(locations.uSourceCount, count);
    gl.uniform1fv(locations.uSourceX, sourceX);
    gl.uniform1fv(locations.uSourceY, sourceY);
    gl.uniform1fv(locations.uAmplitude, amplitudes);
    gl.uniform1fv(locations.uPhase, phases);
    gl.uniform1f(locations.uNormalization, norm > 0 ? norm : 1);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }, []);

  return {
    render,
    clear
  };
};
