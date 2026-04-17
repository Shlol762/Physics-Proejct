from __future__ import annotations

from typing import Iterable

import pygame


def draw_hud_box(surface: pygame.Surface, lines: Iterable[str], x: int, y: int, font: pygame.font.Font) -> None:
    lines = list(lines)
    if not lines:
        return

    pad = 8
    line_h = font.get_linesize()
    width = max(font.size(line)[0] for line in lines) + pad * 2
    height = line_h * len(lines) + pad * 2

    rect = pygame.Rect(x, y, width, height)
    panel = pygame.Surface((rect.width, rect.height), pygame.SRCALPHA)
    panel.fill((5, 8, 14, 180))
    surface.blit(panel, rect.topleft)
    pygame.draw.rect(surface, (90, 100, 120), rect, width=1, border_radius=8)

    for idx, line in enumerate(lines):
        txt = font.render(line, True, (220, 226, 235))
        surface.blit(txt, (x + pad, y + pad + idx * line_h))


def draw_distance_readout(
    surface: pygame.Surface,
    distance_m: float,
    unit_name: str,
    unit_scale: float,
    x: int,
    y: int,
    font: pygame.font.Font,
) -> None:
    value = distance_m / max(unit_scale, 1e-12)
    draw_hud_box(surface, [f"View distance from origin: {value:.3g} {unit_name}"], x, y, font)
