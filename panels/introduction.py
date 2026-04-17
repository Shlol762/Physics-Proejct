from __future__ import annotations

import math
from typing import List

import pygame

from physics.wavefront import AnalyticSource, generate_arc_wavelets, period_from_wavelength
from rendering.axes import AxisViewport
from rendering.mode1 import CYAN_DIM, YELLOW, draw_secondary_wavelets, draw_world_circle
from ui.controls import Button, Slider, Theme, ToggleGroup, draw_panel_background
from ui.hud import draw_distance_readout, draw_hud_box


class IntroductionPanel:
    name = "Introduction"

    def __init__(self, width: int, height: int, top_offset: int, control_width: int = 320) -> None:
        self.theme = Theme()
        self.top_offset = top_offset
        self.control_width = control_width

        self.canvas_rect = pygame.Rect(0, top_offset, width - control_width, height - top_offset)
        self.controls_rect = pygame.Rect(width - control_width, top_offset, control_width, height - top_offset)
        self.axis = AxisViewport(self.canvas_rect)

        self.mode_toggle = ToggleGroup(pygame.Rect(0, 0, 260, 32), ["Huygens", "Field"], selected=0, label="Render Mode")
        self.lambda_slider = Slider(pygame.Rect(0, 0, 260, 20), "Wavelength", 1e-8, 2.0, 0.5, formatter=self._fmt_length)
        self.density_slider = Slider(
            pygame.Rect(0, 0, 260, 20),
            "Secondary source density",
            2.0,
            200.0,
            40.0,
            formatter=lambda v: f"{v:.1f} /m",
        )
        self.speed_slider = Slider(
            pygame.Rect(0, 0, 260, 20),
            "Simulation Speed",
            0.1,
            5.0,
            1.0,
            formatter=lambda v: f"{v:.2f}x",
        )
        self.far_field_button = Button(pygame.Rect(0, 0, 260, 28), "Far-field Boundary")
        self.far_field_button.active = True

        self.dragging = False
        self.last_mouse = (0, 0)
        self.sim_time = 0.0

        self.set_layout(width, height)

    def _fmt_length(self, value_m: float) -> str:
        unit = self.axis.current_unit(self.lambda_slider.value)
        return f"{value_m / unit.meters_per_unit:.4g} {unit.name}"

    def set_layout(self, width: int, height: int) -> None:
        self.canvas_rect = pygame.Rect(0, self.top_offset, max(200, width - self.control_width), max(120, height - self.top_offset))
        self.controls_rect = pygame.Rect(width - self.control_width, self.top_offset, self.control_width, max(120, height - self.top_offset))
        self.axis.set_viewport(self.canvas_rect)

        x0 = self.controls_rect.left + 28
        y = self.controls_rect.top + 28
        for ctl in [self.mode_toggle, self.lambda_slider, self.density_slider, self.speed_slider, self.far_field_button]:
            ctl.rect.topleft = (x0, y)
            y += 62

    @property
    def wavelength(self) -> float:
        return self.lambda_slider.value

    def handle_event(self, event: pygame.event.Event) -> None:
        controls = [self.mode_toggle, self.lambda_slider, self.density_slider, self.speed_slider, self.far_field_button]
        for ctl in controls:
            if ctl.handle_event(event) and ctl is self.far_field_button:
                self.far_field_button.active = not self.far_field_button.active

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
                zoom = 1.12 if event.y > 0 else 1.0 / 1.12
                self.axis.zoom_at(zoom, (mx, my))

    def update(self, dt: float) -> None:
        self.sim_time += dt * self.speed_slider.value

    def mode_is_field(self) -> bool:
        return self.mode_toggle.selected == 1

    def _draw_mode1(self, overlay: pygame.Surface) -> None:
        c = 3.0
        period = period_from_wavelength(self.wavelength)
        radius = (self.sim_time % period) * c

        draw_world_circle(overlay, self.axis, (0.0, 0.0), radius, YELLOW, width=2)

        wavelets = generate_arc_wavelets(
            center=(0.0, 0.0),
            radius_m=max(radius, self.wavelength * 0.2),
            now=self.sim_time,
            density_per_m=self.density_slider.value,
            period_s=period,
            speed_mps=c,
            amplitude=1.0,
            start_angle=0.0,
            end_angle=2.0 * math.pi,
            outward=True,
        )
        draw_secondary_wavelets(overlay, self.axis, wavelets, self.sim_time, period, color=CYAN_DIM)

        sx, sy = self.axis.world_to_screen(0.0, 0.0)
        pygame.draw.circle(overlay, (255, 245, 160), (int(sx), int(sy)), 4)

        if self.far_field_button.active:
            draw_world_circle(overlay, self.axis, (0.0, 0.0), 12.0 * self.wavelength, (160, 160, 180), width=1, dashed=True)

    def _draw_controls(self, overlay: pygame.Surface, font: pygame.font.Font, small_font: pygame.font.Font) -> None:
        draw_panel_background(overlay, self.controls_rect, self.theme)
        for ctl in [self.mode_toggle, self.lambda_slider, self.density_slider, self.speed_slider, self.far_field_button]:
            ctl.draw(overlay, font, small_font, self.theme)

    def _draw_hud(self, overlay: pygame.Surface, font: pygame.font.Font) -> None:
        unit = self.axis.current_unit(self.wavelength)
        period = period_from_wavelength(self.wavelength)

        hud_lines: List[str] = [
            f"Unit: {unit.name}",
            f"lambda: {self.wavelength / unit.meters_per_unit:.4g} {unit.name}",
            f"T = lambda / c: {period:.4g} s",
            f"c (scaled): 3.0 m/s",
            f"Mode: {'Field' if self.mode_is_field() else 'Huygens'}",
        ]
        draw_hud_box(overlay, hud_lines, self.canvas_rect.left + 12, self.canvas_rect.top + 10, font)

        distance = self.axis.distance_from_origin_of_view_center()
        draw_distance_readout(
            overlay,
            distance_m=distance,
            unit_name=unit.name,
            unit_scale=unit.meters_per_unit,
            x=self.canvas_rect.left + 12,
            y=self.canvas_rect.top + 134,
            font=font,
        )

    def render(self, renderer, overlay: pygame.Surface, font: pygame.font.Font, small_font: pygame.font.Font) -> None:
        self.axis.draw(overlay, self.wavelength, font, small_font)

        if not self.mode_is_field():
            self._draw_mode1(overlay)
        else:
            renderer.render_field(
                self.axis,
                [AnalyticSource(0.0, 0.0, amplitude=1.0, phase=0.0)],
                wavelength_m=self.wavelength,
                time_s=self.sim_time,
                alpha=1.0,
            )

        self._draw_hud(overlay, small_font)
        self._draw_controls(overlay, font, small_font)
