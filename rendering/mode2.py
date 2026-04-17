from __future__ import annotations

from typing import Sequence, Tuple

import moderngl
import numpy as np
import pygame

from physics.wavefront import AnalyticSource, point_sources_to_arrays
from rendering.axes import AxisViewport


MAX_SOURCES = 128


VERT_SHADER = """
#version 410 core
in vec2 in_pos;
out vec2 v_uv;
void main() {
    v_uv = in_pos * 0.5 + 0.5;
    gl_Position = vec4(in_pos, 0.0, 1.0);
}
"""


FIELD_FRAG_SHADER = f"""
#version 410 core
const int MAX_SOURCES = {MAX_SOURCES};

uniform int u_source_count;
uniform vec2 u_sources[MAX_SOURCES];
uniform float u_amplitudes[MAX_SOURCES];
uniform float u_phases[MAX_SOURCES];
uniform float u_wavelength;
uniform float u_time;
uniform vec4 u_viewport;
uniform vec2 u_world_center;
uniform float u_px_per_m;
uniform float u_alpha;

out vec4 fragColor;

void main() {{
    vec2 frag = gl_FragCoord.xy;
    if (frag.x < u_viewport.x || frag.x > (u_viewport.x + u_viewport.z) ||
        frag.y < u_viewport.y || frag.y > (u_viewport.y + u_viewport.w)) {{
        discard;
    }}

    vec2 world;
    world.x = (frag.x - (u_viewport.x + 0.5 * u_viewport.z)) / u_px_per_m + u_world_center.x;
    world.y = (frag.y - (u_viewport.y + 0.5 * u_viewport.w)) / u_px_per_m + u_world_center.y;

    float wavelength = max(u_wavelength, 1e-9);
    float k = 6.28318530718 / wavelength;
    float omega = 6.28318530718 / max(wavelength / 3.0, 1e-9);

    float sumA = 0.0;
    for (int i = 0; i < MAX_SOURCES; ++i) {{
        if (i >= u_source_count) break;
        vec2 d = world - u_sources[i];
        float r = length(d) + 1e-6;
        float p = k * r - omega * u_time + u_phases[i];
        sumA += u_amplitudes[i] * cos(p);
    }}

    float norm = max(float(u_source_count), 1.0);
    float intensity = clamp(abs(sumA) / norm, 0.0, 1.0);
    vec3 c = sumA >= 0.0 ? vec3(intensity, 0.0, 0.0) : vec3(0.0, 0.0, intensity);
    fragColor = vec4(c, u_alpha);
}}
"""


BLIT_FRAG_SHADER = """
#version 410 core
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_alpha;
out vec4 fragColor;
void main() {
    vec4 src = texture(u_tex, v_uv);
    fragColor = vec4(src.rgb, src.a * u_alpha);
}
"""


class Mode2Renderer:
    def __init__(self, ctx: moderngl.Context, width: int, height: int) -> None:
        self.ctx = ctx
        self.width = width
        self.height = height

        quad = np.array(
            [
                -1.0,
                -1.0,
                1.0,
                -1.0,
                -1.0,
                1.0,
                1.0,
                -1.0,
                1.0,
                1.0,
                -1.0,
                1.0,
            ],
            dtype="f4",
        )
        self.vbo = self.ctx.buffer(quad.tobytes())

        self.field_prog = self.ctx.program(vertex_shader=VERT_SHADER, fragment_shader=FIELD_FRAG_SHADER)
        self.field_vao = self.ctx.simple_vertex_array(self.field_prog, self.vbo, "in_pos")

        self.blit_prog = self.ctx.program(vertex_shader=VERT_SHADER, fragment_shader=BLIT_FRAG_SHADER)
        self.blit_vao = self.ctx.simple_vertex_array(self.blit_prog, self.vbo, "in_pos")

        self.overlay_tex = self.ctx.texture((max(width, 1), max(height, 1)), components=4)
        self.overlay_tex.filter = (moderngl.LINEAR, moderngl.LINEAR)

    def resize(self, width: int, height: int) -> None:
        self.width = max(1, width)
        self.height = max(1, height)
        self.ctx.viewport = (0, 0, self.width, self.height)
        self.overlay_tex.release()
        self.overlay_tex = self.ctx.texture((self.width, self.height), components=4)
        self.overlay_tex.filter = (moderngl.LINEAR, moderngl.LINEAR)

    def clear(self) -> None:
        self.ctx.enable(moderngl.BLEND)
        self.ctx.blend_func = (moderngl.SRC_ALPHA, moderngl.ONE_MINUS_SRC_ALPHA)
        self.ctx.clear(0.0, 0.0, 0.0, 1.0)

    def render_field(
        self,
        axis: AxisViewport,
        sources: Sequence[AnalyticSource],
        wavelength_m: float,
        time_s: float,
        alpha: float = 1.0,
    ) -> None:
        pos, amp, phase = point_sources_to_arrays(sources)
        if len(sources) > MAX_SOURCES:
            pos = pos[:MAX_SOURCES]
            amp = amp[:MAX_SOURCES]
            phase = phase[:MAX_SOURCES]

        count = int(pos.shape[0])
        self.field_prog["u_source_count"].value = count
        self.field_prog["u_wavelength"].value = float(max(wavelength_m, 1e-9))
        self.field_prog["u_time"].value = float(time_s)
        view = axis.viewport
        view_bottom = float(self.height - (view.y + view.height))
        self.field_prog["u_viewport"].value = (
            float(view.x),
            view_bottom,
            float(view.width),
            float(view.height),
        )
        self.field_prog["u_world_center"].value = (float(axis.center_x), float(axis.center_y))
        self.field_prog["u_px_per_m"].value = float(axis.px_per_meter)
        self.field_prog["u_alpha"].value = float(max(0.0, min(1.0, alpha)))

        # GLSL uniform arrays require fixed-size payloads on many drivers.
        src_buf = np.zeros((MAX_SOURCES, 2), dtype="f4")
        amp_buf = np.zeros(MAX_SOURCES, dtype="f4")
        phase_buf = np.zeros(MAX_SOURCES, dtype="f4")
        if count > 0:
            src_buf[:count] = pos.astype("f4")
            amp_buf[:count] = amp.astype("f4")
            phase_buf[:count] = phase.astype("f4")

        self.field_prog["u_sources"].write(src_buf.tobytes())
        self.field_prog["u_amplitudes"].write(amp_buf.tobytes())
        self.field_prog["u_phases"].write(phase_buf.tobytes())

        self.field_vao.render(moderngl.TRIANGLES)

    def render_surface_overlay(self, surface: pygame.Surface, alpha: float = 1.0) -> None:
        if surface.get_width() != self.width or surface.get_height() != self.height:
            surf = pygame.transform.smoothscale(surface, (self.width, self.height))
        else:
            surf = surface

        raw = pygame.image.tostring(surf, "RGBA", True)
        self.overlay_tex.write(raw)
        self.overlay_tex.use(location=0)
        self.blit_prog["u_tex"].value = 0
        self.blit_prog["u_alpha"].value = float(max(0.0, min(1.0, alpha)))
        self.blit_vao.render(moderngl.TRIANGLES)
