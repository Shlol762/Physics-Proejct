import { MAX_GPU_SOURCES, type CameraState, type WaveSource } from "../physics/wavefront";

const VERTEX_SHADER_SOURCE = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform vec2 uCenter;
uniform float uScale;
uniform float uLambda;
uniform float uPeriod;
uniform float uTime;
uniform int uSourceCount;
uniform vec4 uSources[128];
uniform float uNormalization;

out vec4 outColor;

void main() {
  vec2 world = vec2(
    (gl_FragCoord.x - 0.5 * uResolution.x) / uScale + uCenter.x,
    -(gl_FragCoord.y - 0.5 * uResolution.y) / uScale + uCenter.y
  );

  float k = 6.28318530718 / max(uLambda, 1e-9);
  float wt = 6.28318530718 * (uTime / max(uPeriod, 1e-9));
  float A = 0.0;

  for (int i = 0; i < 128; i++) {
    if (i >= uSourceCount) {
      break;
    }
    vec4 src = uSources[i];
    vec2 delta = world - src.xy;
    float r = length(delta) + 1e-6;
    A += src.z * cos(k * r - wt + src.w);
  }

  float level = clamp(abs(A) / max(uNormalization, 1e-4), 0.0, 1.0);
  vec3 color = A >= 0.0 ? vec3(level, 0.0, 0.0) : vec3(0.0, 0.0, level);
  outColor = vec4(color, 1.0);
}
`;

function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error("Failed to create shader object.");
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? "Unknown shader compile error.";
    gl.deleteShader(shader);
    throw new Error(info);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vs = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
  const program = gl.createProgram();
  if (!program) {
    throw new Error("Failed to create WebGL program.");
  }

  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  gl.deleteShader(vs);
  gl.deleteShader(fs);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program) ?? "Unknown program link error.";
    gl.deleteProgram(program);
    throw new Error(info);
  }

  return program;
}

export class Mode2Renderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly quadBuffer: WebGLBuffer;
  private readonly sourceData = new Float32Array(MAX_GPU_SOURCES * 4);

  private width = 1;
  private height = 1;

  private readonly locations: {
    position: number;
    resolution: WebGLUniformLocation;
    center: WebGLUniformLocation;
    scale: WebGLUniformLocation;
    lambda: WebGLUniformLocation;
    period: WebGLUniformLocation;
    time: WebGLUniformLocation;
    sourceCount: WebGLUniformLocation;
    sources: WebGLUniformLocation;
    normalization: WebGLUniformLocation;
  };

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false
    });
    if (!context) {
      throw new Error("WebGL2 is not supported in this browser.");
    }
    this.gl = context;
    this.program = createProgram(this.gl);

    const buffer = this.gl.createBuffer();
    if (!buffer) {
      throw new Error("Failed to create fullscreen quad buffer.");
    }
    this.quadBuffer = buffer;

    this.locations = {
      position: this.gl.getAttribLocation(this.program, "aPosition"),
      resolution: this.getUniform("uResolution"),
      center: this.getUniform("uCenter"),
      scale: this.getUniform("uScale"),
      lambda: this.getUniform("uLambda"),
      period: this.getUniform("uPeriod"),
      time: this.getUniform("uTime"),
      sourceCount: this.getUniform("uSourceCount"),
      sources: this.getUniform("uSources"),
      normalization: this.getUniform("uNormalization")
    };

    this.initializeQuad();
  }

  private getUniform(name: string): WebGLUniformLocation {
    const location = this.gl.getUniformLocation(this.program, name);
    if (!location) {
      throw new Error(`Missing uniform ${name}.`);
    }
    return location;
  }

  private initializeQuad(): void {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      this.gl.STATIC_DRAW
    );
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.width = Math.max(1, Math.floor(width * pixelRatio));
    this.height = Math.max(1, Math.floor(height * pixelRatio));
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  render(options: {
    sources: WaveSource[];
    time: number;
    lambda: number;
    period: number;
    camera: CameraState;
  }): void {
    const { sources, time, lambda, period, camera } = options;

    const gl = this.gl;
    gl.viewport(0, 0, this.width, this.height);
    gl.useProgram(this.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(this.locations.position);
    gl.vertexAttribPointer(this.locations.position, 2, gl.FLOAT, false, 0, 0);

    const count = Math.min(MAX_GPU_SOURCES, sources.length);
    let normalization = 0;

    this.sourceData.fill(0);
    for (let i = 0; i < count; i += 1) {
      const s = sources[i];
      const offset = i * 4;
      this.sourceData[offset] = s.x;
      this.sourceData[offset + 1] = s.y;
      this.sourceData[offset + 2] = s.amplitude;
      this.sourceData[offset + 3] = s.phase;
      normalization += Math.abs(s.amplitude);
    }

    gl.uniform2f(this.locations.resolution, this.width, this.height);
    gl.uniform2f(this.locations.center, camera.centerX, camera.centerY);
    gl.uniform1f(this.locations.scale, camera.scale);
    gl.uniform1f(this.locations.lambda, lambda);
    gl.uniform1f(this.locations.period, period);
    gl.uniform1f(this.locations.time, time);
    gl.uniform1i(this.locations.sourceCount, count);
    gl.uniform4fv(this.locations.sources, this.sourceData);
    gl.uniform1f(this.locations.normalization, normalization === 0 ? 1 : normalization);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
