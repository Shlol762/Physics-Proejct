from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, List, Optional, Sequence

import pygame


@dataclass
class Theme:
    panel_bg: tuple[int, int, int] = (12, 14, 20)
    control_bg: tuple[int, int, int] = (26, 30, 38)
    control_border: tuple[int, int, int] = (54, 62, 78)
    accent: tuple[int, int, int] = (255, 214, 64)
    text: tuple[int, int, int] = (225, 228, 235)
    subdued: tuple[int, int, int] = (148, 154, 170)
    cyan: tuple[int, int, int] = (110, 220, 255)


class Slider:
    def __init__(
        self,
        rect: pygame.Rect,
        label: str,
        minimum: float,
        maximum: float,
        value: float,
        formatter: Optional[Callable[[float], str]] = None,
    ) -> None:
        self.rect = rect.copy()
        self.label = label
        self.min = minimum
        self.max = maximum
        self.value = max(self.min, min(self.max, value))
        self.formatter = formatter
        self.dragging = False

    def normalized(self) -> float:
        return (self.value - self.min) / max(self.max - self.min, 1e-9)

    def set_from_normalized(self, t: float) -> None:
        t = max(0.0, min(1.0, t))
        self.value = self.min + t * (self.max - self.min)

    def handle_event(self, event: pygame.event.Event) -> bool:
        changed = False
        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
            if self.rect.collidepoint(event.pos):
                self.dragging = True
                self.set_from_normalized((event.pos[0] - self.rect.left) / max(self.rect.width, 1))
                changed = True
        elif event.type == pygame.MOUSEBUTTONUP and event.button == 1:
            self.dragging = False
        elif event.type == pygame.MOUSEMOTION and self.dragging:
            self.set_from_normalized((event.pos[0] - self.rect.left) / max(self.rect.width, 1))
            changed = True
        return changed

    def draw(self, surface: pygame.Surface, font: pygame.font.Font, small_font: pygame.font.Font, theme: Theme) -> None:
        pygame.draw.rect(surface, theme.control_bg, self.rect, border_radius=8)
        pygame.draw.rect(surface, theme.control_border, self.rect, width=1, border_radius=8)

        ty = self.rect.y + self.rect.height // 2
        track_left = self.rect.left + 10
        track_right = self.rect.right - 10
        pygame.draw.line(surface, (85, 96, 118), (track_left, ty), (track_right, ty), 3)

        knob_x = track_left + int(self.normalized() * (track_right - track_left))
        pygame.draw.circle(surface, theme.accent, (knob_x, ty), 7)
        pygame.draw.circle(surface, (245, 245, 245), (knob_x, ty), 7, width=1)

        label_text = font.render(self.label, True, theme.text)
        surface.blit(label_text, (self.rect.left, self.rect.top - 20))

        if self.formatter is not None:
            value_str = self.formatter(self.value)
        else:
            value_str = f"{self.value:.3f}"
        value_text = small_font.render(value_str, True, theme.subdued)
        surface.blit(value_text, (self.rect.right - value_text.get_width(), self.rect.top - 18))


class ToggleGroup:
    def __init__(self, rect: pygame.Rect, options: Sequence[str], selected: int = 0, label: str = "") -> None:
        self.rect = rect.copy()
        self.options = list(options)
        self.selected = max(0, min(len(self.options) - 1, selected))
        self.label = label

    def handle_event(self, event: pygame.event.Event) -> bool:
        if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1 and self.rect.collidepoint(event.pos):
            if len(self.options) == 0:
                return False
            segment_w = self.rect.width / len(self.options)
            idx = int((event.pos[0] - self.rect.left) / segment_w)
            idx = max(0, min(len(self.options) - 1, idx))
            if idx != self.selected:
                self.selected = idx
                return True
        return False

    def draw(self, surface: pygame.Surface, font: pygame.font.Font, small_font: pygame.font.Font, theme: Theme) -> None:
        if self.label:
            txt = font.render(self.label, True, theme.text)
            surface.blit(txt, (self.rect.left, self.rect.top - 20))

        pygame.draw.rect(surface, theme.control_bg, self.rect, border_radius=8)
        pygame.draw.rect(surface, theme.control_border, self.rect, width=1, border_radius=8)

        if len(self.options) == 0:
            return

        segment_w = self.rect.width / len(self.options)
        for i, option in enumerate(self.options):
            seg = pygame.Rect(self.rect.left + int(i * segment_w), self.rect.top, int(segment_w) + 1, self.rect.height)
            if i == self.selected:
                pygame.draw.rect(surface, theme.accent, seg, border_radius=6)
            label = small_font.render(option, True, (20, 20, 20) if i == self.selected else theme.text)
            surface.blit(
                label,
                (seg.centerx - label.get_width() // 2, seg.centery - label.get_height() // 2),
            )


class Button:
    def __init__(self, rect: pygame.Rect, label: str) -> None:
        self.rect = rect.copy()
        self.label = label
        self.active = False

    def handle_event(self, event: pygame.event.Event) -> bool:
        return event.type == pygame.MOUSEBUTTONDOWN and event.button == 1 and self.rect.collidepoint(event.pos)

    def draw(self, surface: pygame.Surface, font: pygame.font.Font, theme: Theme) -> None:
        bg = theme.accent if self.active else theme.control_bg
        fg = (25, 25, 25) if self.active else theme.text
        pygame.draw.rect(surface, bg, self.rect, border_radius=8)
        pygame.draw.rect(surface, theme.control_border, self.rect, width=1, border_radius=8)
        txt = font.render(self.label, True, fg)
        surface.blit(txt, (self.rect.centerx - txt.get_width() // 2, self.rect.centery - txt.get_height() // 2))


def draw_panel_background(surface: pygame.Surface, rect: pygame.Rect, theme: Theme) -> None:
    pygame.draw.rect(surface, theme.panel_bg, rect)
