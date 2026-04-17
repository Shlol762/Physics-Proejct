from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Tuple

import pygame

from physics.wavefront import axis_unit_for_wavelength


@dataclass
class AxisUnit:
    name: str
    meters_per_unit: float


class AxisViewport:
    def __init__(self, viewport: pygame.Rect) -> None:
        self.viewport = viewport.copy()
        self.center_x = 0.0
        self.center_y = 0.0
        self.px_per_meter = 100.0

    def set_viewport(self, viewport: pygame.Rect) -> None:
        self.viewport = viewport.copy()

    def world_to_screen(self, x: float, y: float) -> Tuple[float, float]:
        sx = self.viewport.centerx + (x - self.center_x) * self.px_per_meter
        sy = self.viewport.centery - (y - self.center_y) * self.px_per_meter
        return sx, sy

    def screen_to_world(self, sx: float, sy: float) -> Tuple[float, float]:
        x = (sx - self.viewport.centerx) / self.px_per_meter + self.center_x
        y = (self.viewport.centery - sy) / self.px_per_meter + self.center_y
        return x, y

    def pan_pixels(self, dx: float, dy: float) -> None:
        self.center_x -= dx / self.px_per_meter
        self.center_y += dy / self.px_per_meter

    def zoom_at(self, factor: float, anchor_screen: Tuple[float, float]) -> None:
        ax, ay = anchor_screen
        wx_before, wy_before = self.screen_to_world(ax, ay)
        self.px_per_meter = max(1e-2, min(5e5, self.px_per_meter * factor))
        wx_after, wy_after = self.screen_to_world(ax, ay)
        self.center_x += wx_before - wx_after
        self.center_y += wy_before - wy_after

    def visible_world_bounds(self) -> Tuple[float, float, float, float]:
        minx, maxy = self.screen_to_world(self.viewport.left, self.viewport.top)
        maxx, miny = self.screen_to_world(self.viewport.right, self.viewport.bottom)
        return minx, maxx, miny, maxy

    def distance_from_origin_of_view_center(self) -> float:
        return math.hypot(self.center_x, self.center_y)

    def current_unit(self, wavelength_m: float) -> AxisUnit:
        name, scale = axis_unit_for_wavelength(wavelength_m)
        return AxisUnit(name=name, meters_per_unit=scale)

    def _nice_step(self, raw_step: float) -> float:
        raw_step = max(raw_step, 1e-12)
        power = math.floor(math.log10(raw_step))
        base = raw_step / (10.0 ** power)
        if base < 1.5:
            nice = 1.0
        elif base < 3.5:
            nice = 2.0
        elif base < 7.5:
            nice = 5.0
        else:
            nice = 10.0
        return nice * (10.0 ** power)

    def draw(self, surface: pygame.Surface, wavelength_m: float, font: pygame.font.Font, small_font: pygame.font.Font) -> None:
        unit = self.current_unit(wavelength_m)
        view = self.viewport

        pygame.draw.rect(surface, (4, 4, 8), view)

        minx, maxx, miny, maxy = self.visible_world_bounds()
        target_px_spacing = 90.0
        raw_world_step = target_px_spacing / self.px_per_meter
        raw_display_step = raw_world_step / unit.meters_per_unit
        display_step = self._nice_step(raw_display_step)
        world_step = display_step * unit.meters_per_unit

        grid_color = (35, 40, 48)
        axis_color = (150, 150, 160)
        label_color = (180, 180, 190)

        x_start = math.floor(minx / world_step) * world_step
        y_start = math.floor(miny / world_step) * world_step

        # Draw grid lines.
        x = x_start
        line_count = 0
        while x <= maxx and line_count < 512:
            sx, _ = self.world_to_screen(x, 0.0)
            pygame.draw.line(surface, grid_color, (sx, view.top), (sx, view.bottom), 1)
            x += world_step
            line_count += 1

        y = y_start
        line_count = 0
        while y <= maxy and line_count < 512:
            _, sy = self.world_to_screen(0.0, y)
            pygame.draw.line(surface, grid_color, (view.left, sy), (view.right, sy), 1)
            y += world_step
            line_count += 1

        # Main axes.
        sx0, sy0 = self.world_to_screen(0.0, 0.0)
        if view.left <= sx0 <= view.right:
            pygame.draw.line(surface, axis_color, (sx0, view.top), (sx0, view.bottom), 2)
        if view.top <= sy0 <= view.bottom:
            pygame.draw.line(surface, axis_color, (view.left, sy0), (view.right, sy0), 2)

        # Tick labels near the visible axis positions.
        label_y = min(max(sy0 + 4, view.top + 4), view.bottom - 20)
        x = x_start
        label_count = 0
        while x <= maxx and label_count < 256:
            if abs(x) > 1e-12:
                sx, _ = self.world_to_screen(x, 0.0)
                txt = small_font.render(f"{x / unit.meters_per_unit:.2g}", True, label_color)
                surface.blit(txt, (sx + 3, label_y))
            x += world_step
            label_count += 1

        label_x = min(max(sx0 + 6, view.left + 6), view.right - 44)
        y = y_start
        label_count = 0
        while y <= maxy and label_count < 256:
            if abs(y) > 1e-12:
                _, sy = self.world_to_screen(0.0, y)
                txt = small_font.render(f"{y / unit.meters_per_unit:.2g}", True, label_color)
                surface.blit(txt, (label_x, sy + 2))
            y += world_step
            label_count += 1

        x_label = font.render(f"x ({unit.name})", True, (205, 210, 220))
        y_label = font.render(f"y ({unit.name})", True, (205, 210, 220))
        surface.blit(x_label, (view.right - x_label.get_width() - 12, view.bottom - 30))
        surface.blit(y_label, (view.left + 10, view.top + 10))
