from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np
import pygame

from physics.wavefront import AnalyticSource, generate_line_sources, period_from_wavelength
from rendering.axes import AxisViewport
from rendering.mode1 import CYAN_DIM, YELLOW, draw_world_circle
from ui.controls import Button, Slider, Theme, ToggleGroup, draw_panel_background
from ui.hud import draw_hud_box


@dataclass
class SceneItem:
    uid: int
    category: str
    kind: str
    x: float
    y: float
    angle: float = 0.0
    params: Dict[str, float] = field(default_factory=dict)
    enabled: bool = True


SOURCE_TYPES = ["point", "line", "plane", "aperture"]
ELEMENT_TYPES = ["flat_mirror", "curved_mirror", "conv_lens", "div_lens", "wall", "slit_barrier", "slab"]


class SandboxPanel:
    name = "Sandbox"

    def __init__(self, width: int, height: int, top_offset: int) -> None:
        self.theme = Theme()
        self.top_offset = top_offset
        self.left_width = 230
        self.right_width = 300

        self.canvas_rect = pygame.Rect(self.left_width, top_offset, width - self.left_width - self.right_width, height - top_offset)
        self.left_rect = pygame.Rect(0, top_offset, self.left_width, height - top_offset)
        self.right_rect = pygame.Rect(width - self.right_width, top_offset, self.right_width, height - top_offset)

        self.axis = AxisViewport(self.canvas_rect)

        self.speed_slider = Slider(pygame.Rect(0, 0, 240, 20), "Simulation Speed", 0.1, 5.0, 1.0, formatter=lambda v: f"{v:.2f}x")
        self.huygens_opacity = Slider(pygame.Rect(0, 0, 240, 20), "Huygens opacity", 0.0, 1.0, 0.85, formatter=lambda v: f"{int(v*100)}%")
        self.field_opacity = Slider(pygame.Rect(0, 0, 240, 20), "Field opacity", 0.0, 1.0, 0.85, formatter=lambda v: f"{int(v*100)}%")

        self.source_buttons: List[Tuple[str, Button]] = []
        self.element_buttons: List[Tuple[str, Button]] = []

        self.selected_tool: Optional[Tuple[str, str]] = None

        self.sources: List[SceneItem] = []
        self.elements: List[SceneItem] = []
        self._next_uid = 1

        self.selected_uid: Optional[int] = None
        self.inspected_uid: Optional[int] = None
        self.inspector_sliders: Dict[str, Slider] = {}
        self.inspector_toggle = ToggleGroup(pygame.Rect(0, 0, 120, 28), ["Off", "On"], selected=1, label="Enabled")

        self.dragging_item_uid: Optional[int] = None
        self.rotating_item_uid: Optional[int] = None
        self.drag_offset = (0.0, 0.0)
        self.panning = False
        self.last_mouse = (0, 0)
        self.sim_time = 0.0

        self.set_layout(width, height)

    def set_layout(self, width: int, height: int) -> None:
        self.canvas_rect = pygame.Rect(
            self.left_width,
            self.top_offset,
            max(280, width - self.left_width - self.right_width),
            max(120, height - self.top_offset),
        )
        self.left_rect = pygame.Rect(0, self.top_offset, self.left_width, max(120, height - self.top_offset))
        self.right_rect = pygame.Rect(width - self.right_width, self.top_offset, self.right_width, max(120, height - self.top_offset))
        self.axis.set_viewport(self.canvas_rect)

        self.speed_slider.rect.topleft = (self.left_rect.left + 16, self.left_rect.bottom - 192)
        self.huygens_opacity.rect.topleft = (self.left_rect.left + 16, self.left_rect.bottom - 132)
        self.field_opacity.rect.topleft = (self.left_rect.left + 16, self.left_rect.bottom - 72)

        self.source_buttons = []
        self.element_buttons = []

        y = self.left_rect.top + 42
        for name in SOURCE_TYPES:
            btn = Button(pygame.Rect(self.left_rect.left + 14, y, self.left_rect.width - 28, 30), name.replace("_", " ").title())
            self.source_buttons.append((name, btn))
            y += 38

        y += 14
        for name in ELEMENT_TYPES:
            btn = Button(pygame.Rect(self.left_rect.left + 14, y, self.left_rect.width - 28, 30), name.replace("_", " ").title())
            self.element_buttons.append((name, btn))
            y += 38

    def _item_by_uid(self, uid: Optional[int]) -> Optional[SceneItem]:
        if uid is None:
            return None
        for item in self.sources + self.elements:
            if item.uid == uid:
                return item
        return None

    def _default_params(self, category: str, kind: str) -> Dict[str, float]:
        if category == "source":
            if kind == "point":
                return {"lambda": 0.3, "phase_deg": 0.0, "amp": 1.0}
            if kind == "line":
                return {"lambda": 0.3, "phase_deg": 0.0, "amp": 1.0, "length": 0.8}
            if kind == "plane":
                return {"lambda": 0.3, "phase_deg": 0.0, "amp": 1.0, "direction_deg": 0.0}
            if kind == "aperture":
                return {"lambda": 0.3, "phase_deg": 0.0, "amp": 1.0, "aperture": 0.7}
        if kind == "flat_mirror":
            return {"length": 1.0}
        if kind == "curved_mirror":
            return {"f": 1.2}
        if kind == "conv_lens":
            return {"f": 1.0}
        if kind == "div_lens":
            return {"f": -1.0}
        if kind == "wall":
            return {"length": 1.0}
        if kind == "slit_barrier":
            return {"n": 2.0, "a": 0.12, "d": 0.35, "length": 1.4}
        if kind == "slab":
            return {"n": 1.5, "width": 1.0, "height": 0.7}
        return {}

    def _format_length(self, value: float) -> str:
        ref_wl = self._reference_wavelength()
        unit = self.axis.current_unit(ref_wl)
        return f"{value / unit.meters_per_unit:.3g} {unit.name}"

    def _reference_wavelength(self) -> float:
        if self.sources:
            return float(self.sources[0].params.get("lambda", 0.3))
        return 0.3

    def _add_item(self, category: str, kind: str, x: float, y: float) -> None:
        if category == "source" and len(self.sources) >= 16:
            return
        if category == "element" and len(self.elements) >= 32:
            return

        item = SceneItem(
            uid=self._next_uid,
            category=category,
            kind=kind,
            x=x,
            y=y,
            angle=0.0,
            params=self._default_params(category, kind),
            enabled=True,
        )
        self._next_uid += 1

        if category == "source":
            self.sources.append(item)
        else:
            self.elements.append(item)

        self.selected_uid = item.uid

    def _item_hit_test(self, screen_pos: Tuple[int, int]) -> Optional[SceneItem]:
        sx, sy = screen_pos
        for item in reversed(self.sources + self.elements):
            ix, iy = self.axis.world_to_screen(item.x, item.y)
            if (sx - ix) ** 2 + (sy - iy) ** 2 <= 11 ** 2:
                return item
        return None

    def _rotation_handle_hit(self, item: SceneItem, screen_pos: Tuple[int, int]) -> bool:
        handle_dist = 0.30
        hx = item.x + math.cos(item.angle) * handle_dist
        hy = item.y + math.sin(item.angle) * handle_dist
        hsx, hsy = self.axis.world_to_screen(hx, hy)
        sx, sy = screen_pos
        return (sx - hsx) ** 2 + (sy - hsy) ** 2 <= 9 ** 2

    def _build_inspector(self, item: SceneItem) -> None:
        self.inspector_sliders = {}

        x0 = self.right_rect.left + 24
        y = self.right_rect.top + 98

        specs: List[Tuple[str, Tuple[float, float], str]] = []
        if item.category == "source":
            specs.extend(
                [
                    ("lambda", (1e-8, 2.0), "length"),
                    ("phase_deg", (-180.0, 180.0), "deg"),
                    ("amp", (0.0, 2.0), "scalar"),
                ]
            )
            if item.kind == "line":
                specs.append(("length", (0.05, 3.0), "length"))
            if item.kind == "plane":
                specs.append(("direction_deg", (-180.0, 180.0), "deg"))
            if item.kind == "aperture":
                specs.append(("aperture", (0.02, 3.0), "length"))
        else:
            if item.kind in {"flat_mirror", "wall", "slit_barrier"}:
                specs.append(("length", (0.08, 4.0), "length"))
            if item.kind in {"curved_mirror", "conv_lens", "div_lens"}:
                specs.append(("f", (-4.0, 4.0), "length"))
            if item.kind == "slit_barrier":
                specs.append(("n", (1.0, 10.0), "count"))
                specs.append(("a", (0.01, 1.0), "length"))
                specs.append(("d", (0.01, 2.0), "length"))
            if item.kind == "slab":
                specs.append(("n", (1.0, 3.0), "scalar"))
                specs.append(("width", (0.05, 4.0), "length"))
                specs.append(("height", (0.05, 4.0), "length"))

        for key, (lo, hi), style in specs:
            value = float(item.params.get(key, lo))
            if style == "length":
                formatter = self._format_length
            elif style == "deg":
                formatter = lambda v: f"{v:.1f} deg"
            elif style == "count":
                formatter = lambda v: f"{int(round(v))}"
            else:
                formatter = lambda v: f"{v:.3f}"

            slider = Slider(pygame.Rect(x0, y, self.right_rect.width - 48, 20), key, lo, hi, value, formatter=formatter)
            self.inspector_sliders[key] = slider
            y += 54

        self.inspector_toggle.rect.topleft = (x0, self.right_rect.top + 54)
        self.inspector_toggle.selected = 1 if item.enabled else 0

    def handle_event(self, event: pygame.event.Event) -> None:
        self.speed_slider.handle_event(event)
        self.huygens_opacity.handle_event(event)
        self.field_opacity.handle_event(event)

        # Tool selection from sidebar.
        for name, btn in self.source_buttons:
            if btn.handle_event(event):
                self.selected_tool = ("source", name)
        for name, btn in self.element_buttons:
            if btn.handle_event(event):
                self.selected_tool = ("element", name)

        for name, btn in self.source_buttons:
            btn.active = self.selected_tool == ("source", name)
        for name, btn in self.element_buttons:
            btn.active = self.selected_tool == ("element", name)

        # Inspector interactions.
        inspected = self._item_by_uid(self.inspected_uid)
        if inspected is not None:
            if self.inspector_toggle.handle_event(event):
                inspected.enabled = self.inspector_toggle.selected == 1
            for key, slider in self.inspector_sliders.items():
                if slider.handle_event(event):
                    inspected.params[key] = slider.value
                    if key == "n":
                        inspected.params[key] = float(max(1, int(round(slider.value))))

        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 3 and self.canvas_rect.collidepoint(event.pos):
            hit = self._item_hit_test(event.pos)
            if hit is not None:
                self.inspected_uid = hit.uid
                self.selected_uid = hit.uid
                self._build_inspector(hit)

        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            if self.canvas_rect.collidepoint(event.pos):
                hit = self._item_hit_test(event.pos)

                if hit is not None and self._rotation_handle_hit(hit, event.pos):
                    self.rotating_item_uid = hit.uid
                    self.selected_uid = hit.uid
                    return

                if hit is not None:
                    self.dragging_item_uid = hit.uid
                    self.selected_uid = hit.uid
                    wx, wy = self.axis.screen_to_world(*event.pos)
                    self.drag_offset = (hit.x - wx, hit.y - wy)
                    return

                if self.selected_tool is not None:
                    wx, wy = self.axis.screen_to_world(*event.pos)
                    self._add_item(self.selected_tool[0], self.selected_tool[1], wx, wy)
                    return

                self.panning = True
                self.last_mouse = event.pos

        elif event.type == pygame.MOUSEBUTTONUP and event.button == 1:
            self.dragging_item_uid = None
            self.rotating_item_uid = None
            self.panning = False

        elif event.type == pygame.MOUSEMOTION:
            if self.dragging_item_uid is not None:
                item = self._item_by_uid(self.dragging_item_uid)
                if item is not None:
                    wx, wy = self.axis.screen_to_world(*event.pos)
                    item.x = wx + self.drag_offset[0]
                    item.y = wy + self.drag_offset[1]
            elif self.rotating_item_uid is not None:
                item = self._item_by_uid(self.rotating_item_uid)
                if item is not None:
                    wx, wy = self.axis.screen_to_world(*event.pos)
                    item.angle = math.atan2(wy - item.y, wx - item.x)
            elif self.panning:
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

    def _source_to_analytic(self, item: SceneItem) -> List[AnalyticSource]:
        if not item.enabled:
            return []

        amp = float(item.params.get("amp", 1.0))
        phase = math.radians(float(item.params.get("phase_deg", 0.0)))
        wl = max(float(item.params.get("lambda", 0.3)), 1e-9)
        k = 2.0 * math.pi / wl

        if item.kind == "point":
            return [AnalyticSource(item.x, item.y, amplitude=amp, phase=phase)]

        if item.kind == "line":
            length = float(item.params.get("length", 0.8))
            dx = math.cos(item.angle) * 0.5 * length
            dy = math.sin(item.angle) * 0.5 * length
            p0 = (item.x - dx, item.y - dy)
            p1 = (item.x + dx, item.y + dy)
            return generate_line_sources(p0, p1, spacing_m=max(wl, 0.02), amplitude=amp / max(length / max(wl, 0.02), 1.0), phase_offset=phase)

        if item.kind == "aperture":
            width = float(item.params.get("aperture", 0.7))
            tangent = item.angle + 0.5 * math.pi
            dx = math.cos(tangent) * 0.5 * width
            dy = math.sin(tangent) * 0.5 * width
            p0 = (item.x - dx, item.y - dy)
            p1 = (item.x + dx, item.y + dy)
            direction = (math.cos(item.angle), math.sin(item.angle))
            return generate_line_sources(
                p0,
                p1,
                spacing_m=max(wl, 0.02),
                amplitude=amp / max(width / max(wl, 0.02), 1.0),
                phase_offset=phase,
                direction_phase=direction,
                wavelength_m=wl,
            )

        if item.kind == "plane":
            # Plane-wave source represented as a wide coherent line emitter.
            minx, maxx, miny, maxy = self.axis.visible_world_bounds()
            span = 1.4 * math.hypot(maxx - minx, maxy - miny)
            tangent = item.angle + 0.5 * math.pi
            dx = math.cos(tangent) * 0.5 * span
            dy = math.sin(tangent) * 0.5 * span
            p0 = (item.x - dx, item.y - dy)
            p1 = (item.x + dx, item.y + dy)
            direction = (math.cos(item.angle), math.sin(item.angle))
            return generate_line_sources(
                p0,
                p1,
                spacing_m=max(wl, 0.05),
                amplitude=amp / max(span / max(wl, 0.05), 1.0),
                phase_offset=phase,
                direction_phase=direction,
                wavelength_m=wl,
            )

        return []

    def _apply_simple_optics(self, sources: List[AnalyticSource]) -> List[AnalyticSource]:
        out = list(sources)

        # Simplified flat mirror model: reflected image sources for point-like emitters.
        for element in self.elements:
            if not element.enabled or element.kind != "flat_mirror":
                continue
            nx = math.cos(element.angle + math.pi * 0.5)
            ny = math.sin(element.angle + math.pi * 0.5)
            px, py = element.x, element.y
            for src in sources:
                dx = src.x - px
                dy = src.y - py
                dist = dx * nx + dy * ny
                rx = src.x - 2.0 * dist * nx
                ry = src.y - 2.0 * dist * ny
                out.append(AnalyticSource(rx, ry, amplitude=0.75 * src.amplitude, phase=src.phase))

        return out

    def _mode2_sources(self) -> List[AnalyticSource]:
        all_sources: List[AnalyticSource] = []
        for src in self.sources:
            all_sources.extend(self._source_to_analytic(src))
        all_sources = self._apply_simple_optics(all_sources)
        return all_sources[:128]

    def _draw_item(self, surface: pygame.Surface, item: SceneItem) -> None:
        sx, sy = self.axis.world_to_screen(item.x, item.y)
        color = (250, 245, 170) if item.category == "source" else (160, 210, 255)
        if not item.enabled:
            color = (90, 90, 100)

        if item.category == "source" and item.kind == "point":
            pygame.draw.circle(surface, color, (int(sx), int(sy)), 5)

        elif item.category == "source" and item.kind == "line":
            length = item.params.get("length", 0.8)
            dx = math.cos(item.angle) * 0.5 * length
            dy = math.sin(item.angle) * 0.5 * length
            p0 = self.axis.world_to_screen(item.x - dx, item.y - dy)
            p1 = self.axis.world_to_screen(item.x + dx, item.y + dy)
            pygame.draw.line(surface, color, p0, p1, 3)

        elif item.category == "source" and item.kind in {"plane", "aperture"}:
            w = item.params.get("aperture", 0.8 if item.kind == "aperture" else 1.4)
            tangent = item.angle + 0.5 * math.pi
            dx = math.cos(tangent) * 0.5 * w
            dy = math.sin(tangent) * 0.5 * w
            p0 = self.axis.world_to_screen(item.x - dx, item.y - dy)
            p1 = self.axis.world_to_screen(item.x + dx, item.y + dy)
            pygame.draw.line(surface, color, p0, p1, 3)
            tip = self.axis.world_to_screen(item.x + math.cos(item.angle) * 0.2, item.y + math.sin(item.angle) * 0.2)
            pygame.draw.circle(surface, color, (int(tip[0]), int(tip[1])), 3)

        elif item.kind in {"flat_mirror", "wall", "slit_barrier"}:
            length = item.params.get("length", 1.0)
            dx = math.cos(item.angle) * 0.5 * length
            dy = math.sin(item.angle) * 0.5 * length
            p0 = self.axis.world_to_screen(item.x - dx, item.y - dy)
            p1 = self.axis.world_to_screen(item.x + dx, item.y + dy)
            thick = 4 if item.kind == "wall" else 2
            pygame.draw.line(surface, color, p0, p1, thick)

            if item.kind == "slit_barrier":
                n = int(max(1, round(item.params.get("n", 2.0))))
                a = item.params.get("a", 0.12)
                d = item.params.get("d", 0.35)
                tangent = item.angle + 0.5 * math.pi
                slit_centers = (np.arange(n) - 0.5 * (n - 1)) * d
                for c in slit_centers:
                    cx = item.x + math.cos(tangent) * c
                    cy = item.y + math.sin(tangent) * c
                    dxs = math.cos(tangent) * 0.5 * a
                    dys = math.sin(tangent) * 0.5 * a
                    q0 = self.axis.world_to_screen(cx - dxs, cy - dys)
                    q1 = self.axis.world_to_screen(cx + dxs, cy + dys)
                    pygame.draw.line(surface, (20, 20, 20), q0, q1, thick + 1)

        elif item.kind in {"curved_mirror", "conv_lens", "div_lens"}:
            f = item.params.get("f", 1.0)
            span = 0.9
            us = np.linspace(-span, span, 50)
            pts = []
            for u in us:
                x_local = (u * u) / max(2.0 * abs(f), 0.2)
                if item.kind == "div_lens":
                    x_local *= -1.0
                if item.kind == "curved_mirror" and f < 0.0:
                    x_local *= -1.0
                wx = item.x + math.cos(item.angle) * x_local - math.sin(item.angle) * u
                wy = item.y + math.sin(item.angle) * x_local + math.cos(item.angle) * u
                pts.append(self.axis.world_to_screen(wx, wy))
            pygame.draw.lines(surface, color, False, pts, 2)

        elif item.kind == "slab":
            w = item.params.get("width", 1.0)
            h = item.params.get("height", 0.7)
            corners = [(-0.5 * w, -0.5 * h), (0.5 * w, -0.5 * h), (0.5 * w, 0.5 * h), (-0.5 * w, 0.5 * h)]
            pts = []
            for cx, cy in corners:
                wx = item.x + math.cos(item.angle) * cx - math.sin(item.angle) * cy
                wy = item.y + math.sin(item.angle) * cx + math.cos(item.angle) * cy
                pts.append(self.axis.world_to_screen(wx, wy))
            pygame.draw.polygon(surface, (70, 120, 170, 180), pts)
            pygame.draw.polygon(surface, color, pts, 2)

        # Selection and rotation handle.
        if self.selected_uid == item.uid:
            pygame.draw.circle(surface, (255, 255, 255), (int(sx), int(sy)), 9, 1)
            handle_dist = 0.30
            hx = item.x + math.cos(item.angle) * handle_dist
            hy = item.y + math.sin(item.angle) * handle_dist
            hsx, hsy = self.axis.world_to_screen(hx, hy)
            pygame.draw.line(surface, (170, 180, 200), (sx, sy), (hsx, hsy), 1)
            pygame.draw.circle(surface, (255, 180, 90), (int(hsx), int(hsy)), 6)

    def _draw_huygens_layer(self, layer: pygame.Surface) -> None:
        for src in self.sources:
            if not src.enabled:
                continue
            wl = max(src.params.get("lambda", 0.3), 1e-9)
            period = period_from_wavelength(wl)
            phase = math.radians(src.params.get("phase_deg", 0.0))
            radius = ((self.sim_time + phase / (2.0 * math.pi) * period) % period) * 3.0
            amp = max(src.params.get("amp", 1.0), 0.0)

            if src.kind == "point":
                draw_world_circle(layer, self.axis, (src.x, src.y), radius, CYAN_DIM, width=1)
                draw_world_circle(layer, self.axis, (src.x, src.y), radius + wl * 0.4, YELLOW, width=1)
            elif src.kind in {"line", "aperture", "plane"}:
                for a_src in self._source_to_analytic(src)[:42]:
                    draw_world_circle(layer, self.axis, (a_src.x, a_src.y), radius, CYAN_DIM, width=1)

        for item in self.sources + self.elements:
            self._draw_item(layer, item)

    def _draw_ui(self, overlay: pygame.Surface, font: pygame.font.Font, small_font: pygame.font.Font) -> None:
        draw_panel_background(overlay, self.left_rect, self.theme)
        draw_panel_background(overlay, self.right_rect, self.theme)

        title = font.render("Sandbox", True, (230, 235, 245))
        overlay.blit(title, (self.left_rect.left + 14, self.left_rect.top + 12))

        sub = small_font.render("Sources", True, (175, 185, 205))
        overlay.blit(sub, (self.left_rect.left + 14, self.left_rect.top + 24))
        for _, btn in self.source_buttons:
            btn.draw(overlay, small_font, self.theme)

        sub2 = small_font.render("Optical Elements", True, (175, 185, 205))
        y_anchor = self.source_buttons[-1][1].rect.bottom + 16
        overlay.blit(sub2, (self.left_rect.left + 14, y_anchor))
        for _, btn in self.element_buttons:
            btn.draw(overlay, small_font, self.theme)

        self.speed_slider.draw(overlay, small_font, small_font, self.theme)
        self.huygens_opacity.draw(overlay, small_font, small_font, self.theme)
        self.field_opacity.draw(overlay, small_font, small_font, self.theme)

        inspected = self._item_by_uid(self.inspected_uid)
        head = small_font.render("Inspector", True, (230, 235, 245))
        overlay.blit(head, (self.right_rect.left + 24, self.right_rect.top + 12))

        if inspected is None:
            hint = small_font.render("Right-click an item to edit", True, (160, 170, 190))
            overlay.blit(hint, (self.right_rect.left + 24, self.right_rect.top + 42))
        else:
            typ = small_font.render(f"{inspected.category}: {inspected.kind}", True, (220, 225, 235))
            overlay.blit(typ, (self.right_rect.left + 24, self.right_rect.top + 30))
            self.inspector_toggle.draw(overlay, small_font, small_font, self.theme)
            for slider in self.inspector_sliders.values():
                slider.draw(overlay, small_font, small_font, self.theme)

        unit = self.axis.current_unit(self._reference_wavelength())
        hud_lines = [
            f"Unit: {unit.name}",
            f"Sources: {len(self.sources)} / 16",
            f"Elements: {len(self.elements)} / 32",
            "Left-click place/drag, handle rotates",
            "Right-click opens inspector",
        ]
        draw_hud_box(overlay, hud_lines, self.canvas_rect.left + 10, self.canvas_rect.top + 10, small_font)

    def render(self, renderer, overlay: pygame.Surface, font: pygame.font.Font, small_font: pygame.font.Font) -> None:
        self.axis.draw(overlay, self._reference_wavelength(), font, small_font)

        # Field layer.
        mode2_sources = self._mode2_sources()
        if self.field_opacity.value > 0.0 and mode2_sources:
            renderer.render_field(
                self.axis,
                mode2_sources,
                wavelength_m=self._reference_wavelength(),
                time_s=self.sim_time,
                alpha=self.field_opacity.value,
            )

        # Huygens layer.
        if self.huygens_opacity.value > 0.0:
            layer = pygame.Surface(overlay.get_size(), pygame.SRCALPHA)
            self._draw_huygens_layer(layer)
            layer.set_alpha(int(self.huygens_opacity.value * 255))
            overlay.blit(layer, (0, 0))
        else:
            for item in self.sources + self.elements:
                self._draw_item(overlay, item)

        self._draw_ui(overlay, font, small_font)
