from __future__ import annotations

import sys
from typing import Dict, List, Tuple

import moderngl
import pygame

from panels.diffraction import DiffractionPanel
from panels.introduction import IntroductionPanel
from panels.phased_array import PhasedArrayPanel
from panels.reflection_refraction import ReflectionRefractionPanel
from panels.sandbox import SandboxPanel
from rendering.mode2 import Mode2Renderer


class App:
    def __init__(self) -> None:
        pygame.init()
        pygame.font.init()

        self.width = 1280
        self.height = 800
        self.top_bar_h = 42

        pygame.display.gl_set_attribute(pygame.GL_CONTEXT_MAJOR_VERSION, 4)
        pygame.display.gl_set_attribute(pygame.GL_CONTEXT_MINOR_VERSION, 1)
        pygame.display.gl_set_attribute(pygame.GL_CONTEXT_PROFILE_MASK, pygame.GL_CONTEXT_PROFILE_CORE)
        pygame.display.gl_set_attribute(pygame.GL_DOUBLEBUFFER, 1)

        flags = pygame.OPENGL | pygame.DOUBLEBUF | pygame.RESIZABLE
        pygame.display.set_mode((self.width, self.height), flags)
        pygame.display.set_caption("Huygens Principle and Light Wave Propagation")

        self.ctx = moderngl.create_context(require=410)
        self.renderer = Mode2Renderer(self.ctx, self.width, self.height)

        self.overlay = pygame.Surface((self.width, self.height), pygame.SRCALPHA)
        self.font = pygame.font.SysFont("dejavusans", 16)
        self.small_font = pygame.font.SysFont("dejavusans", 14)

        self.panel_specs: List[Tuple[str, str]] = [
            ("introduction", "Introduction"),
            ("reflection_refraction", "Reflection & Refraction"),
            ("diffraction", "Diffraction"),
            ("phased_array", "Phased Array"),
            ("sandbox", "Sandbox"),
        ]

        self.panels: Dict[str, object] = {
            "introduction": IntroductionPanel(self.width, self.height, self.top_bar_h),
            "reflection_refraction": ReflectionRefractionPanel(self.width, self.height, self.top_bar_h),
            "diffraction": DiffractionPanel(self.width, self.height, self.top_bar_h),
            "phased_array": PhasedArrayPanel(self.width, self.height, self.top_bar_h),
            "sandbox": SandboxPanel(self.width, self.height, self.top_bar_h),
        }
        self.active_key = "introduction"

        self.tab_rects: Dict[str, pygame.Rect] = {}
        self._layout_tabs()

    def _layout_tabs(self) -> None:
        self.tab_rects.clear()
        x = 8
        for key, label in self.panel_specs:
            w = max(120, self.font.size(label)[0] + 24)
            rect = pygame.Rect(x, 6, w, self.top_bar_h - 12)
            self.tab_rects[key] = rect
            x += w + 8

    def _resize(self, width: int, height: int) -> None:
        self.width = max(640, int(width))
        self.height = max(460, int(height))
        self.overlay = pygame.Surface((self.width, self.height), pygame.SRCALPHA)
        self.renderer.resize(self.width, self.height)

        for panel in self.panels.values():
            panel.set_layout(self.width, self.height)
        self._layout_tabs()

    def _draw_top_bar(self) -> None:
        bar_rect = pygame.Rect(0, 0, self.width, self.top_bar_h)
        pygame.draw.rect(self.overlay, (12, 14, 20), bar_rect)
        pygame.draw.line(self.overlay, (56, 62, 76), (0, self.top_bar_h), (self.width, self.top_bar_h), 1)

        for key, label in self.panel_specs:
            rect = self.tab_rects[key]
            active = key == self.active_key
            bg = (255, 214, 64) if active else (30, 35, 44)
            fg = (18, 18, 22) if active else (230, 234, 242)
            pygame.draw.rect(self.overlay, bg, rect, border_radius=7)
            pygame.draw.rect(self.overlay, (76, 84, 102), rect, 1, border_radius=7)
            txt = self.small_font.render(label, True, fg)
            self.overlay.blit(txt, (rect.centerx - txt.get_width() // 2, rect.centery - txt.get_height() // 2))

        title = self.small_font.render("Light only | c = 3 m/s", True, (170, 178, 196))
        self.overlay.blit(title, (self.width - title.get_width() - 14, 12))

    def _handle_tab_click(self, pos: Tuple[int, int]) -> bool:
        for key, rect in self.tab_rects.items():
            if rect.collidepoint(pos):
                self.active_key = key
                return True
        return False

    def run(self) -> None:
        clock = pygame.time.Clock()
        running = True

        while running:
            dt = clock.tick(120) / 1000.0
            active_panel = self.panels[self.active_key]

            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    running = False
                    break

                if event.type == pygame.VIDEORESIZE:
                    self._resize(event.w, event.h)
                    continue

                if event.type == pygame.WINDOWSIZECHANGED:
                    self._resize(event.x, event.y)
                    continue

                if event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_1:
                        self.active_key = "introduction"
                    elif event.key == pygame.K_2:
                        self.active_key = "reflection_refraction"
                    elif event.key == pygame.K_3:
                        self.active_key = "diffraction"
                    elif event.key == pygame.K_4:
                        self.active_key = "phased_array"
                    elif event.key == pygame.K_5:
                        self.active_key = "sandbox"

                if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1 and event.pos[1] <= self.top_bar_h:
                    if self._handle_tab_click(event.pos):
                        continue

                active_panel.handle_event(event)

            active_panel = self.panels[self.active_key]
            active_panel.update(dt)

            self.renderer.clear()
            self.overlay.fill((0, 0, 0, 0))

            active_panel.render(self.renderer, self.overlay, self.font, self.small_font)
            self._draw_top_bar()

            self.renderer.render_surface_overlay(self.overlay, alpha=1.0)
            pygame.display.flip()

        pygame.quit()


def main() -> None:
    app = App()
    app.run()


if __name__ == "__main__":
    main()
