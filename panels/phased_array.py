from __future__ import annotations

import math
from typing import List

import numpy as np
import pygame

from physics.optics import phased_array_beam_angle, phased_array_beam_argument
from physics.wavefront import AnalyticSource, period_from_wavelength
from rendering.axes import AxisViewport
from rendering.mode1 import CYAN_DIM, YELLOW, draw_plane_wave_crests, draw_world_circle
from ui.controls import Slider, Theme, ToggleGroup, draw_panel_background
from ui.hud import draw_hud_box


class PhasedArrayPanel:
    name = "Phased Array"

    def __init__(self, width: int, height: int, top_offset: int, control_width: int = 340) -> None:
        self.theme = Theme()
        self.top_offset = top_offset
        self.control_width = control_width

        self.canvas_rect = pygame.Rect(0, top_offset, width - control_width, height - top_offset)
        self.controls_rect = pygame.Rect(width - control_width, top_offset, control_width, height - top_offset)
        self.axis = AxisViewport(self.canvas_rect)

        self.mode_toggle = ToggleGroup(pygame.Rect(0, 0, 280, 32), ["Huygens", "Field"], selected=1, label="Render Mode")
        self.lambda_slider = Slider(pygame.Rect(0, 0, 280, 20), "Wavelength", 1e-8, 2.0, 0.25, formatter=self._fmt_length)
        self.n_slider = Slider(pygame.Rect(0, 0, 280, 20), "Elements N", 2.0, 32.0, 8.0, formatter=lambda v: f"{int(round(v))}")
        self.spacing_slider = Slider(pygame.Rect(0, 0, 280, 20), "Spacing d", 1e-6, 2.0, 0.30, formatter=self._fmt_length)
        self.delta_phi_slider = Slider(
            pygame.Rect(0, 0, 280, 20),
            "Delta phase",
            -180.0,
            180.0,
            30.0,
            formatter=lambda v: f"{v:.1f} deg",
        )
        self.speed_slider = Slider(pygame.Rect(0, 0, 280, 20), "Simulation Speed", 0.1, 5.0, 1.0, formatter=lambda v: f"{v:.2f}x")

        self.dragging = False
        self.last_mouse = (0, 0)
        self.sim_time = 0.0

        self.set_layout(width, height)

    def _fmt_length(self, value_m: float) -> str:
        unit = self.axis.current_unit(self.lambda_slider.value)
        return f"{value_m / unit.meters_per_unit:.4g} {unit.name}"

    @property
    def wavelength(self) -> float:
        return self.lambda_slider.value

    @property
    def element_count(self) -> int:
        return int(round(self.n_slider.value))

    @property
    def spacing(self) -> float:
        return self.spacing_slider.value

    @property
    def delta_phi_rad(self) -> float:
        return math.radians(self.delta_phi_slider.value)

    def mode_is_field(self) -> bool:
        return self.mode_toggle.selected == 1

    def set_layout(self, width: int, height: int) -> None:
        self.canvas_rect = pygame.Rect(0, self.top_offset, max(220, width - self.control_width), max(120, height - self.top_offset))
        self.controls_rect = pygame.Rect(width - self.control_width, self.top_offset, self.control_width, max(120, height - self.top_offset))
        self.axis.set_viewport(self.canvas_rect)

        x0 = self.controls_rect.left + 30
        y = self.controls_rect.top + 24
        for ctl in [
            self.mode_toggle,
            self.lambda_slider,
            self.n_slider,
            self.spacing_slider,
            self.delta_phi_slider,
            self.speed_slider,
        ]:
            ctl.rect.topleft = (x0, y)
            y += 56

    def handle_event(self, event: pygame.event.Event) -> None:
        for ctl in [
            self.mode_toggle,
            self.lambda_slider,
            self.n_slider,
            self.spacing_slider,
            self.delta_phi_slider,
            self.speed_slider,
        ]:
            ctl.handle_event(event)

        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1 and self.canvas_rect.collidepoint(event.pos):
            self.dragging = True
            self.last_mouse = event.pos
        elif event.type == pygame.MOUSEBUTTONUP and event.button == 1:
            self.dragging = False
        elif event.type == pygame.MOUSEMOTION and self.dragging:
            dx = event.pos[0] - self.last_mouse[0]
            dy = event.pos[1] - self.last_mouse[1]
            self.axis.pan_pixels(dx, dy)
            self.last_mouse = event.pos
        elif event.type == pygame.MOUSEWHEEL:
            mx, my = pygame.mouse.get_pos()
            if self.canvas_rect.collidepoint((mx, my)):
                zoom = 1.1 if event.y > 0 else 1.0 / 1.1
                self.axis.zoom_at(zoom, (mx, my))

    def update(self, dt: float) -> None:
        self.sim_time += dt * self.speed_slider.value

    def _sources(self) -> List[AnalyticSource]:
        n = self.element_count
        ys = (np.arange(n) - 0.5 * (n - 1)) * self.spacing
        amp = 1.0 / n
        return [
            AnalyticSource(0.0, float(y), amplitude=amp, phase=i * self.delta_phi_rad)
            for i, y in enumerate(ys)
        ]

    def _draw_mode1(self, overlay: pygame.Surface) -> None:
        period = period_from_wavelength(self.wavelength)
        omega = 2.0 * math.pi / max(period, 1e-9)

        n = self.element_count
        ys = (np.arange(n) - 0.5 * (n - 1)) * self.spacing
        for i, y in enumerate(ys):
            phase = i * self.delta_phi_rad
            t_eff = self.sim_time + phase / omega
            radius = (t_eff % period) * 3.0
            draw_world_circle(overlay, self.axis, (0.0, float(y)), radius, CYAN_DIM, width=1)
            sx, sy = self.axis.world_to_screen(0.0, float(y))
            pygame.draw.circle(overlay, (240, 245, 255), (int(sx), int(sy)), 3)

        theta, invalid = phased_array_beam_angle(self.delta_phi_rad, self.wavelength, self.spacing)
        if theta is None:
            theta = 0.0
        direction = (math.cos(theta), math.sin(theta))
        draw_plane_wave_crests(
            overlay,
            self.axis,
            direction_xy=direction,
            wavelength_m=self.wavelength,
            speed_mps=3.0,
            time_s=self.sim_time,
            clip_fn=lambda x, y: True,
            color=YELLOW,
            width=2,
        )

    def _draw_hud(self, overlay: pygame.Surface, font: pygame.font.Font) -> None:
        unit = self.axis.current_unit(self.wavelength)
        arg = phased_array_beam_argument(self.delta_phi_rad, self.wavelength, self.spacing)
        angle, invalid = phased_array_beam_angle(self.delta_phi_rad, self.wavelength, self.spacing)

        lines = [
            f"Unit: {unit.name}",
            f"lambda: {self.wavelength / unit.meters_per_unit:.4g} {unit.name}",
            f"N: {self.element_count}",
            f"d: {self.spacing / unit.meters_per_unit:.4g} {unit.name}",
            f"arg = DeltaPhi * lambda / (2pi d): {arg:.3f}",
        ]
        if invalid or angle is None:
            lines.append("theta_beam: invalid (|arg| > 1)")
            lines.append("Warning: grating lobe condition")
        else:
            lines.append(f"theta_beam: {math.degrees(angle):.2f} deg")

        draw_hud_box(overlay, lines, self.canvas_rect.left + 10, self.canvas_rect.top + 10, font)

    def _draw_controls(self, overlay: pygame.Surface, font: pygame.font.Font, small_font: pygame.font.Font) -> None:
        draw_panel_background(overlay, self.controls_rect, self.theme)
        for ctl in [
            self.mode_toggle,
            self.lambda_slider,
            self.n_slider,
            self.spacing_slider,
            self.delta_phi_slider,
            self.speed_slider,
        ]:
            ctl.draw(overlay, font, small_font, self.theme)

    def render(self, renderer, overlay: pygame.Surface, font: pygame.font.Font, small_font: pygame.font.Font) -> None:
        self.axis.draw(overlay, self.wavelength, font, small_font)

        if self.mode_is_field():
            renderer.render_field(self.axis, self._sources(), self.wavelength, self.sim_time, alpha=1.0)
            # Draw source markers on top.
            for src in self._sources():
                sx, sy = self.axis.world_to_screen(src.x, src.y)
                pygame.draw.circle(overlay, (240, 245, 255), (int(sx), int(sy)), 3)
        else:
            self._draw_mode1(overlay)

        self._draw_hud(overlay, small_font)
        self._draw_controls(overlay, font, small_font)
