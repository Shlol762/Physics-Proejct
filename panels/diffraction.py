from __future__ import annotations

import math
from typing import List

import numpy as np
import pygame

from physics.optics import deg_to_rad
from physics.wavefront import (
    AnalyticSource,
    RollingPeriodAverage,
    SecondaryWavelet,
    evaluate_amplitude_field,
    multi_slit_sample_positions,
    period_from_wavelength,
)
from rendering.axes import AxisViewport
from rendering.mode1 import CYAN_DIM, YELLOW, draw_plane_wave_crests, draw_secondary_wavelets
from ui.controls import Slider, Theme, ToggleGroup, draw_panel_background
from ui.hud import draw_hud_box


class DiffractionPanel:
    name = "Diffraction"

    def __init__(self, width: int, height: int, top_offset: int, control_width: int = 360) -> None:
        self.theme = Theme()
        self.top_offset = top_offset
        self.control_width = control_width

        self.canvas_rect = pygame.Rect(0, top_offset, width - control_width, height - top_offset)
        self.controls_rect = pygame.Rect(width - control_width, top_offset, control_width, height - top_offset)
        self.axis = AxisViewport(self.canvas_rect)

        self.mode_toggle = ToggleGroup(pygame.Rect(0, 0, 295, 32), ["Huygens", "Field"], selected=0, label="Render Mode")
        self.lambda_slider = Slider(pygame.Rect(0, 0, 295, 20), "Wavelength", 1e-8, 2.0, 0.20, formatter=self._fmt_length)
        self.slits_slider = Slider(pygame.Rect(0, 0, 295, 20), "Number of slits N", 1.0, 10.0, 2.0, formatter=lambda v: f"{int(round(v))}")
        self.width_slider = Slider(pygame.Rect(0, 0, 295, 20), "Slit width a", 1e-6, 1.5, 0.12, formatter=self._fmt_length)
        self.sep_slider = Slider(pygame.Rect(0, 0, 295, 20), "Slit separation d", 1e-6, 2.0, 0.35, formatter=self._fmt_length)
        self.angle_slider = Slider(pygame.Rect(0, 0, 295, 20), "Incidence angle", -89.0, 89.0, 0.0, formatter=lambda v: f"{v:.1f} deg")
        self.speed_slider = Slider(pygame.Rect(0, 0, 295, 20), "Simulation Speed", 0.1, 5.0, 1.0, formatter=lambda v: f"{v:.2f}x")

        self.dragging = False
        self.last_mouse = (0, 0)
        self.sim_time = 0.0
        self.intensity_avg = RollingPeriodAverage()

        self._cached_intensity: np.ndarray | None = None
        self._cached_y: np.ndarray | None = None

        self.set_layout(width, height)

    def _fmt_length(self, value_m: float) -> str:
        unit = self.axis.current_unit(self.lambda_slider.value)
        return f"{value_m / unit.meters_per_unit:.4g} {unit.name}"

    @property
    def wavelength(self) -> float:
        return self.lambda_slider.value

    @property
    def slit_count(self) -> int:
        return int(round(self.slits_slider.value))

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
            self.slits_slider,
            self.width_slider,
            self.sep_slider,
            self.angle_slider,
            self.speed_slider,
        ]:
            ctl.rect.topleft = (x0, y)
            y += 56

    def handle_event(self, event: pygame.event.Event) -> None:
        for ctl in [
            self.mode_toggle,
            self.lambda_slider,
            self.slits_slider,
            self.width_slider,
            self.sep_slider,
            self.angle_slider,
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

    def _slit_y_positions(self) -> np.ndarray:
        return multi_slit_sample_positions(
            slit_count=self.slit_count,
            slit_width_m=self.width_slider.value,
            slit_separation_m=self.sep_slider.value,
            wavelength_m=self.wavelength,
        )

    def _mode2_sources(self) -> List[AnalyticSource]:
        ys = self._slit_y_positions()
        theta = self.angle_rad
        k = 2.0 * math.pi / max(self.wavelength, 1e-9)
        phases = -k * np.sin(theta) * ys
        amp = 1.0 / max(len(ys), 1)
        return [AnalyticSource(0.0, float(yy), amplitude=amp, phase=float(ph)) for yy, ph in zip(ys, phases)]

    def _boundary_wavelets(self) -> List[SecondaryWavelet]:
        ys = self._slit_y_positions()
        theta = self.angle_rad
        sin_t = math.sin(theta)
        period = period_from_wavelength(self.wavelength)
        v = 3.0

        out: List[SecondaryWavelet] = []
        for yy in ys:
            base = 0.0 if abs(sin_t) < 1e-9 else (sin_t * float(yy)) / v
            n = math.floor((self.sim_time - base) / period)
            spawn = base + n * period
            age = self.sim_time - spawn
            if age < 0.0 or age > period:
                continue
            out.append(
                SecondaryWavelet(
                    x=0.0,
                    y=float(yy),
                    spawn_time=spawn,
                    amplitude=1.0,
                    phase=0.0,
                    speed=v,
                    direction_x=1.0,
                    direction_y=0.0,
                )
            )
        return out

    def _draw_barrier(self, overlay: pygame.Surface) -> None:
        slit_centers = (np.arange(self.slit_count) - 0.5 * (self.slit_count - 1)) * self.sep_slider.value
        half_w = 0.5 * self.width_slider.value
        intervals = [(float(c - half_w), float(c + half_w)) for c in slit_centers]
        intervals.sort(key=lambda v: v[0])

        minx, maxx, miny, maxy = self.axis.visible_world_bounds()
        sx, _ = self.axis.world_to_screen(0.0, 0.0)

        y_cursor = miny
        for lo, hi in intervals:
            if lo > y_cursor:
                _, sy0 = self.axis.world_to_screen(0.0, y_cursor)
                _, sy1 = self.axis.world_to_screen(0.0, lo)
                pygame.draw.line(overlay, (220, 220, 220), (sx, sy0), (sx, sy1), 3)
            y_cursor = max(y_cursor, hi)
        if y_cursor < maxy:
            _, sy0 = self.axis.world_to_screen(0.0, y_cursor)
            _, sy1 = self.axis.world_to_screen(0.0, maxy)
            pygame.draw.line(overlay, (220, 220, 220), (sx, sy0), (sx, sy1), 3)

    def _draw_mode1(self, overlay: pygame.Surface) -> None:
        theta = self.angle_rad
        draw_plane_wave_crests(
            overlay,
            self.axis,
            direction_xy=(math.cos(theta), math.sin(theta)),
            wavelength_m=self.wavelength,
            speed_mps=3.0,
            time_s=self.sim_time,
            clip_fn=lambda x, y: x <= 0.0,
            color=YELLOW,
            width=2,
        )

        self._draw_barrier(overlay)
        draw_secondary_wavelets(
            overlay,
            self.axis,
            self._boundary_wavelets(),
            self.sim_time,
            period_from_wavelength(self.wavelength),
            color=CYAN_DIM,
        )

    def _update_screen_intensity(self, sources: List[AnalyticSource]) -> None:
        if len(sources) == 0:
            self._cached_intensity = None
            self._cached_y = None
            return

        x_screen, _ = self.axis.screen_to_world(self.canvas_rect.right - 4, self.canvas_rect.centery)
        minx, maxx, miny, maxy = self.axis.visible_world_bounds()

        y = np.linspace(miny, maxy, 240)
        pts = np.column_stack((np.full_like(y, x_screen), y))
        a = evaluate_amplitude_field(pts, sources, self.wavelength, self.sim_time)
        i = a * a

        avg = self.intensity_avg.update(self.sim_time, i, period_from_wavelength(self.wavelength))
        self._cached_intensity = avg
        self._cached_y = y

    def _draw_intensity_screen(self, overlay: pygame.Surface) -> None:
        if self._cached_intensity is None or self._cached_y is None:
            return

        screen_rect = pygame.Rect(self.canvas_rect.right - 26, self.canvas_rect.top + 8, 20, self.canvas_rect.height - 16)
        pygame.draw.rect(overlay, (20, 28, 35), screen_rect)
        pygame.draw.rect(overlay, (180, 190, 210), screen_rect, 1)

        intensity = self._cached_intensity
        yvals = self._cached_y
        peak = float(np.max(intensity)) if float(np.max(intensity)) > 1e-12 else 1.0
        norm = intensity / peak

        points = []
        graph_x0 = self.canvas_rect.right - 140
        graph_x1 = self.canvas_rect.right - 34
        for yy, val in zip(yvals, norm):
            sx, sy = self.axis.world_to_screen(0.0, float(yy))
            gx = graph_x0 + val * (graph_x1 - graph_x0)
            points.append((gx, sy))
            b = max(0, min(255, int(val * 255)))
            pygame.draw.line(overlay, (b, b, b), (screen_rect.left + 2, sy), (screen_rect.right - 2, sy), 1)

        if len(points) >= 2:
            pygame.draw.lines(overlay, (255, 220, 120), False, points, 2)

        # Optional minima markers for m = +/-1, +/-2.
        x_screen, _ = self.axis.screen_to_world(self.canvas_rect.right - 4, self.canvas_rect.centery)
        L = abs(x_screen - 0.0)
        a = max(self.width_slider.value, 1e-12)
        for m in [1, 2]:
            arg = m * self.wavelength / a
            if abs(arg) > 1.0:
                continue
            ymag = L * math.tan(math.asin(arg))
            for sgn in [-1.0, 1.0]:
                yv = sgn * ymag
                sx0, sy = self.axis.world_to_screen(0.0, yv)
                pygame.draw.line(overlay, (120, 200, 255), (graph_x0, sy), (graph_x1, sy), 1)

    def _draw_hud(self, overlay: pygame.Surface, font: pygame.font.Font) -> None:
        unit = self.axis.current_unit(self.wavelength)
        sample_count = max(1, int(math.floor(self.width_slider.value / max(self.wavelength, 1e-9))))
        lines = [
            f"Unit: {unit.name}",
            f"lambda: {self.wavelength / unit.meters_per_unit:.4g} {unit.name}",
            f"N slits: {self.slit_count}",
            f"sources/slit: max(1, floor(a/lambda)) = {sample_count}",
            f"Mode: {'Field' if self.mode_is_field() else 'Huygens'}",
        ]
        draw_hud_box(overlay, lines, self.canvas_rect.left + 10, self.canvas_rect.top + 10, font)

    def _draw_controls(self, overlay: pygame.Surface, font: pygame.font.Font, small_font: pygame.font.Font) -> None:
        draw_panel_background(overlay, self.controls_rect, self.theme)
        for ctl in [
            self.mode_toggle,
            self.lambda_slider,
            self.slits_slider,
            self.width_slider,
            self.sep_slider,
            self.angle_slider,
            self.speed_slider,
        ]:
            ctl.draw(overlay, font, small_font, self.theme)

        if self.slit_count < 2:
            txt = small_font.render("d active only when N >= 2", True, (170, 178, 198))
            overlay.blit(txt, (self.sep_slider.rect.left, self.sep_slider.rect.bottom + 8))

    def render(self, renderer, overlay: pygame.Surface, font: pygame.font.Font, small_font: pygame.font.Font) -> None:
        self.axis.draw(overlay, self.wavelength, font, small_font)

        if self.mode_is_field():
            sources = self._mode2_sources()
            renderer.render_field(self.axis, sources, self.wavelength, self.sim_time, alpha=1.0)
            self._draw_barrier(overlay)
            self._update_screen_intensity(sources)
            self._draw_intensity_screen(overlay)
        else:
            self._draw_mode1(overlay)

        self._draw_hud(overlay, small_font)
        self._draw_controls(overlay, font, small_font)
