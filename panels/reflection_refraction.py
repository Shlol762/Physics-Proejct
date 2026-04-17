from __future__ import annotations

import math
from typing import List

import pygame

from physics.optics import (
    deg_to_rad,
    reflection_transmission_amplitudes,
    snell_refraction_angle,
)
from physics.wavefront import AnalyticSource, SecondaryWavelet, period_from_wavelength
from rendering.axes import AxisViewport
from rendering.mode1 import CYAN_DIM, YELLOW, draw_plane_wave_crests, draw_secondary_wavelets
from ui.controls import Slider, Theme, ToggleGroup, draw_panel_background
from ui.hud import draw_hud_box


class ReflectionRefractionPanel:
    name = "Reflection & Refraction"

    def __init__(self, width: int, height: int, top_offset: int, control_width: int = 340) -> None:
        self.theme = Theme()
        self.top_offset = top_offset
        self.control_width = control_width

        self.canvas_rect = pygame.Rect(0, top_offset, width - control_width, height - top_offset)
        self.controls_rect = pygame.Rect(width - control_width, top_offset, control_width, height - top_offset)
        self.axis = AxisViewport(self.canvas_rect)

        self.mode_toggle = ToggleGroup(pygame.Rect(0, 0, 280, 32), ["Huygens", "Field"], selected=0, label="Render Mode")
        self.lambda_slider = Slider(pygame.Rect(0, 0, 280, 20), "Wavelength", 1e-8, 2.0, 0.35, formatter=self._fmt_length)
        self.angle_slider = Slider(pygame.Rect(0, 0, 280, 20), "Incidence angle", -89.0, 89.0, 30.0, formatter=lambda v: f"{v:.1f} deg")
        self.n1_slider = Slider(pygame.Rect(0, 0, 280, 20), "n1", 1.0, 3.0, 1.0, formatter=lambda v: f"{v:.3f}")
        self.n2_slider = Slider(pygame.Rect(0, 0, 280, 20), "n2", 1.0, 3.0, 1.5, formatter=lambda v: f"{v:.3f}")
        self.r_slider = Slider(pygame.Rect(0, 0, 280, 20), "Reflection coeff R", 0.0, 1.0, 0.35, formatter=lambda v: f"{v:.3f}")
        self.interface_density = Slider(
            pygame.Rect(0, 0, 280, 20),
            "Interface source density",
            4.0,
            240.0,
            70.0,
            formatter=lambda v: f"{v:.1f} /m",
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
    def n1(self) -> float:
        return self.n1_slider.value

    @property
    def n2(self) -> float:
        return self.n2_slider.value

    @property
    def angle_rad(self) -> float:
        return deg_to_rad(self.angle_slider.value)

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
            self.angle_slider,
            self.n1_slider,
            self.n2_slider,
            self.r_slider,
            self.interface_density,
            self.speed_slider,
        ]:
            ctl.rect.topleft = (x0, y)
            y += 56

    def handle_event(self, event: pygame.event.Event) -> None:
        for ctl in [
            self.mode_toggle,
            self.lambda_slider,
            self.angle_slider,
            self.n1_slider,
            self.n2_slider,
            self.r_slider,
            self.interface_density,
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

    def _boundary_wavelets(self) -> List[SecondaryWavelet]:
        minx, maxx, miny, maxy = self.axis.visible_world_bounds()
        period = period_from_wavelength(self.wavelength)
        v1 = 3.0 / max(self.n1, 1e-9)
        spacing = 1.0 / max(self.interface_density.value, 1e-6)

        ys = []
        y = miny - spacing
        while y <= maxy + spacing:
            ys.append(y)
            y += spacing

        theta = self.angle_rad
        sin_t = math.sin(theta)

        d_i = (math.cos(theta), math.sin(theta))
        d_r = (-math.cos(theta), math.sin(theta))

        t_angle, tir = snell_refraction_angle(theta, self.n1, self.n2)
        if t_angle is None:
            d_t = (math.cos(theta), math.sin(theta))
        else:
            d_t = (math.cos(t_angle), math.sin(t_angle))

        amp_r, amp_t = reflection_transmission_amplitudes(self.r_slider.value)

        out: List[SecondaryWavelet] = []
        for yv in ys:
            base_time = 0.0 if abs(sin_t) < 1e-9 else (sin_t * yv) / max(v1, 1e-9)
            k = math.floor((self.sim_time - base_time) / period)
            spawn = base_time + k * period
            age = self.sim_time - spawn
            if age < 0.0 or age > period:
                continue

            out.append(
                SecondaryWavelet(
                    x=0.0,
                    y=yv,
                    spawn_time=spawn,
                    amplitude=amp_r,
                    phase=0.0,
                    speed=v1,
                    direction_x=d_r[0],
                    direction_y=d_r[1],
                )
            )
            if not tir:
                v2 = 3.0 / max(self.n2, 1e-9)
                out.append(
                    SecondaryWavelet(
                        x=0.0,
                        y=yv,
                        spawn_time=spawn,
                        amplitude=amp_t,
                        phase=0.0,
                        speed=v2,
                        direction_x=d_t[0],
                        direction_y=d_t[1],
                    )
                )

        return out

    def _mode2_sources(self) -> List[AnalyticSource]:
        period = period_from_wavelength(self.wavelength)
        omega = 2.0 * math.pi / max(period, 1e-9)
        wavelets = self._boundary_wavelets()
        out: List[AnalyticSource] = []
        for w in wavelets:
            phi = omega * w.spawn_time
            out.append(AnalyticSource(w.x, w.y, amplitude=w.amplitude, phase=phi))
        return out

    def _draw_mode1(self, overlay: pygame.Surface) -> None:
        theta = self.angle_rad
        v1 = 3.0 / max(self.n1, 1e-9)

        # Boundary at x = 0.
        sx0, _ = self.axis.world_to_screen(0.0, 0.0)
        pygame.draw.line(overlay, (200, 200, 210), (sx0, self.canvas_rect.top), (sx0, self.canvas_rect.bottom), 2)

        # Incident wavefronts, clipped to incidence side.
        draw_plane_wave_crests(
            overlay,
            self.axis,
            direction_xy=(math.cos(theta), math.sin(theta)),
            wavelength_m=self.wavelength / max(self.n1, 1e-9),
            speed_mps=v1,
            time_s=self.sim_time,
            clip_fn=lambda x, y: x <= 0.0,
            color=YELLOW,
            width=2,
        )

        # Secondary sources along interface produce reflected/refracted fronts.
        period = period_from_wavelength(self.wavelength)
        draw_secondary_wavelets(overlay, self.axis, self._boundary_wavelets(), self.sim_time, period, color=CYAN_DIM)

    def _draw_controls(self, overlay: pygame.Surface, font: pygame.font.Font, small_font: pygame.font.Font) -> None:
        draw_panel_background(overlay, self.controls_rect, self.theme)
        for ctl in [
            self.mode_toggle,
            self.lambda_slider,
            self.angle_slider,
            self.n1_slider,
            self.n2_slider,
            self.r_slider,
            self.interface_density,
            self.speed_slider,
        ]:
            ctl.draw(overlay, font, small_font, self.theme)

    def _draw_hud(self, overlay: pygame.Surface, font: pygame.font.Font) -> None:
        unit = self.axis.current_unit(self.wavelength)
        theta_i = self.angle_slider.value
        theta_t, tir = snell_refraction_angle(self.angle_rad, self.n1, self.n2)

        lines = [
            f"Unit: {unit.name}",
            f"lambda: {self.wavelength / unit.meters_per_unit:.4g} {unit.name}",
            f"theta_i: {theta_i:.2f} deg",
            f"theta_r: {theta_i:.2f} deg",
        ]
        if tir or theta_t is None:
            lines.append("theta_t: TIR")
            lines.append("Warning: total internal reflection")
        else:
            lines.append(f"theta_t: {math.degrees(theta_t):.2f} deg")

        draw_hud_box(overlay, lines, self.canvas_rect.left + 12, self.canvas_rect.top + 12, font)

    def render(self, renderer, overlay: pygame.Surface, font: pygame.font.Font, small_font: pygame.font.Font) -> None:
        self.axis.draw(overlay, self.wavelength, font, small_font)

        if self.mode_is_field():
            renderer.render_field(
                self.axis,
                self._mode2_sources(),
                wavelength_m=self.wavelength,
                time_s=self.sim_time,
                alpha=1.0,
            )
        else:
            self._draw_mode1(overlay)

        self._draw_hud(overlay, small_font)
        self._draw_controls(overlay, font, small_font)
