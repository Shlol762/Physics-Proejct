from __future__ import annotations

import math
from typing import Iterable, List, Tuple

import numpy as np
import pygame

from physics.wavefront import SecondaryWavelet
from rendering.axes import AxisViewport

YELLOW = (255, 220, 60)
CYAN_DIM = (86, 190, 210)


def _polyline_from_world(points: np.ndarray, axis: AxisViewport) -> List[Tuple[int, int]]:
    out: List[Tuple[int, int]] = []
    for p in points:
        sx, sy = axis.world_to_screen(float(p[0]), float(p[1]))
        out.append((int(sx), int(sy)))
    return out


def draw_world_circle(
    surface: pygame.Surface,
    axis: AxisViewport,
    center: Tuple[float, float],
    radius_m: float,
    color: Tuple[int, int, int],
    width: int = 2,
    dashed: bool = False,
) -> None:
    if radius_m <= 0.0:
        return

    cx, cy = center
    circumference = 2.0 * math.pi * radius_m
    segments = max(40, min(420, int(circumference * axis.px_per_meter / 12.0)))
    ang = np.linspace(0.0, 2.0 * math.pi, segments, endpoint=False)
    pts = np.column_stack((cx + radius_m * np.cos(ang), cy + radius_m * np.sin(ang)))
    screen_pts = _polyline_from_world(pts, axis)

    if not dashed:
        if len(screen_pts) >= 2:
            pygame.draw.lines(surface, color, True, screen_pts, width)
        return

    # Dashed circle by drawing short alternating segments.
    stride = 6
    for i in range(0, len(screen_pts), stride * 2):
        segment = screen_pts[i : i + stride]
        if len(segment) >= 2:
            pygame.draw.lines(surface, color, False, segment, width)


def draw_half_wavelet(
    surface: pygame.Surface,
    axis: AxisViewport,
    source_x: float,
    source_y: float,
    radius_m: float,
    direction_x: float,
    direction_y: float,
    color: Tuple[int, int, int],
    alpha: float,
    width: int = 1,
) -> None:
    if radius_m <= 0.0 or alpha <= 0.0:
        return

    base = math.atan2(direction_y, direction_x)
    angles = np.linspace(base - 0.5 * math.pi, base + 0.5 * math.pi, 48)
    pts = np.column_stack((source_x + radius_m * np.cos(angles), source_y + radius_m * np.sin(angles)))

    overlay = pygame.Surface(surface.get_size(), pygame.SRCALPHA)
    screen_pts = _polyline_from_world(pts, axis)
    c = (color[0], color[1], color[2], max(0, min(255, int(alpha * 255))))
    if len(screen_pts) >= 2:
        pygame.draw.lines(overlay, c, False, screen_pts, width)
        surface.blit(overlay, (0, 0))


def draw_secondary_wavelets(
    surface: pygame.Surface,
    axis: AxisViewport,
    wavelets: Iterable[SecondaryWavelet],
    now: float,
    period_s: float,
    color: Tuple[int, int, int] = CYAN_DIM,
) -> None:
    period_s = max(period_s, 1e-9)
    for w in wavelets:
        age = now - w.spawn_time
        if age < 0.0:
            continue
        radius = age * w.speed
        fade = max(0.0, 1.0 - age / period_s)
        draw_half_wavelet(
            surface,
            axis,
            w.x,
            w.y,
            radius,
            w.direction_x,
            w.direction_y,
            color,
            alpha=fade,
            width=1,
        )


def _line_from_plane_phase(
    direction: np.ndarray,
    phase_distance: float,
    extent: float,
) -> np.ndarray:
    tangent = np.array([-direction[1], direction[0]], dtype=np.float64)
    tangent /= max(np.linalg.norm(tangent), 1e-9)
    anchor = direction * phase_distance
    s = np.linspace(-extent, extent, 400)
    return anchor[None, :] + s[:, None] * tangent[None, :]


def draw_plane_wave_crests(
    surface: pygame.Surface,
    axis: AxisViewport,
    direction_xy: Tuple[float, float],
    wavelength_m: float,
    speed_mps: float,
    time_s: float,
    clip_fn,
    color: Tuple[int, int, int],
    width: int = 2,
) -> None:
    d = np.array(direction_xy, dtype=np.float64)
    norm = np.linalg.norm(d)
    if norm < 1e-9:
        return
    d /= norm

    minx, maxx, miny, maxy = axis.visible_world_bounds()
    corners = np.array([[minx, miny], [minx, maxy], [maxx, miny], [maxx, maxy]], dtype=np.float64)
    proj = corners @ d
    min_proj = np.min(proj) - 2.0 * wavelength_m
    max_proj = np.max(proj) + 2.0 * wavelength_m

    spacing = max(wavelength_m, 1e-9)
    first_idx = int(math.floor((min_proj - speed_mps * time_s) / spacing))
    last_idx = int(math.ceil((max_proj - speed_mps * time_s) / spacing))

    extent = 1.5 * math.hypot(maxx - minx, maxy - miny)
    for m in range(first_idx, last_idx + 1):
        phase_d = speed_mps * time_s + m * spacing
        pts = _line_from_plane_phase(d, phase_d, extent)

        segments: List[List[Tuple[int, int]]] = []
        current: List[Tuple[int, int]] = []
        for p in pts:
            if clip_fn(float(p[0]), float(p[1])):
                sx, sy = axis.world_to_screen(float(p[0]), float(p[1]))
                current.append((int(sx), int(sy)))
            elif len(current) >= 2:
                segments.append(current)
                current = []
            else:
                current = []
        if len(current) >= 2:
            segments.append(current)

        for seg in segments:
            pygame.draw.lines(surface, color, False, seg, width)


def draw_arrow_world(
    surface: pygame.Surface,
    axis: AxisViewport,
    start: Tuple[float, float],
    direction: Tuple[float, float],
    length_m: float,
    color: Tuple[int, int, int],
    width: int = 2,
) -> None:
    dx, dy = direction
    norm = math.hypot(dx, dy)
    if norm < 1e-9:
        return
    dx /= norm
    dy /= norm
    end = (start[0] + dx * length_m, start[1] + dy * length_m)

    sx0, sy0 = axis.world_to_screen(*start)
    sx1, sy1 = axis.world_to_screen(*end)
    pygame.draw.line(surface, color, (sx0, sy0), (sx1, sy1), width)

    head_len = max(8.0, 0.08 * axis.px_per_meter)
    ang = math.atan2(sy1 - sy0, sx1 - sx0)
    left = (sx1 - head_len * math.cos(ang - 0.45), sy1 - head_len * math.sin(ang - 0.45))
    right = (sx1 - head_len * math.cos(ang + 0.45), sy1 - head_len * math.sin(ang + 0.45))
    pygame.draw.polygon(surface, color, [(sx1, sy1), left, right])
