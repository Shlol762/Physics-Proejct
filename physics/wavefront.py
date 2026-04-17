from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, List, Sequence, Tuple

import numpy as np

SIM_C = 3.0
TAU = np.pi * 2.0


@dataclass
class AnalyticSource:
    x: float
    y: float
    amplitude: float = 1.0
    phase: float = 0.0


@dataclass
class SecondaryWavelet:
    x: float
    y: float
    spawn_time: float
    amplitude: float
    phase: float
    speed: float
    direction_x: float
    direction_y: float
    half_angle: float = np.pi * 0.5


def period_from_wavelength(wavelength_m: float) -> float:
    return max(wavelength_m, 1e-12) / SIM_C


def axis_unit_for_wavelength(wavelength_m: float) -> Tuple[str, float]:
    if wavelength_m < 1e-6:
        return "nm", 1e-9
    if wavelength_m < 1e-3:
        return "um", 1e-6
    if wavelength_m < 1.0:
        return "mm", 1e-3
    return "m", 1.0


def format_value_for_unit(value_m: float, wavelength_m: float, decimals: int = 3) -> str:
    unit, scale = axis_unit_for_wavelength(wavelength_m)
    value = value_m / scale
    return f"{value:.{decimals}f} {unit}"


def source_density_to_count(arc_length_m: float, density_per_m: float, minimum: int = 4) -> int:
    return max(minimum, int(max(0.0, arc_length_m) * max(0.0, density_per_m)))


def generate_arc_wavelets(
    center: Tuple[float, float],
    radius_m: float,
    now: float,
    density_per_m: float,
    period_s: float,
    speed_mps: float = SIM_C,
    amplitude: float = 1.0,
    start_angle: float = 0.0,
    end_angle: float = TAU,
    outward: bool = True,
) -> List[SecondaryWavelet]:
    cx, cy = center
    radius_m = max(radius_m, 1e-9)
    period_s = max(period_s, 1e-9)
    arc_length = abs(end_angle - start_angle) * radius_m
    count = source_density_to_count(arc_length, density_per_m, minimum=8)
    if count <= 0:
        return []

    angles = np.linspace(start_angle, end_angle, count, endpoint=False)
    wavelets: List[SecondaryWavelet] = []
    for idx, angle in enumerate(angles):
        x = cx + radius_m * np.cos(angle)
        y = cy + radius_m * np.sin(angle)
        delay = (idx / max(count - 1, 1)) * period_s
        spawn_time = now - delay
        dx = np.cos(angle)
        dy = np.sin(angle)
        if not outward:
            dx *= -1.0
            dy *= -1.0
        wavelets.append(
            SecondaryWavelet(
                x=x,
                y=y,
                spawn_time=spawn_time,
                amplitude=amplitude,
                phase=0.0,
                speed=speed_mps,
                direction_x=dx,
                direction_y=dy,
            )
        )
    return wavelets


def generate_line_sources(
    p0: Tuple[float, float],
    p1: Tuple[float, float],
    spacing_m: float,
    amplitude: float,
    phase_offset: float = 0.0,
    direction_phase: Tuple[float, float] | None = None,
    wavelength_m: float | None = None,
) -> List[AnalyticSource]:
    p0v = np.array(p0, dtype=np.float64)
    p1v = np.array(p1, dtype=np.float64)
    seg = p1v - p0v
    length = float(np.linalg.norm(seg))
    if length < 1e-9:
        return [AnalyticSource(float(p0v[0]), float(p0v[1]), amplitude, phase_offset)]

    spacing_m = max(spacing_m, 1e-6)
    count = max(2, int(length / spacing_m) + 1)
    t = np.linspace(0.0, 1.0, count)
    pts = p0v[None, :] + t[:, None] * seg[None, :]

    phases = np.full(count, phase_offset, dtype=np.float64)
    if direction_phase is not None and wavelength_m is not None and wavelength_m > 0.0:
        k = TAU / wavelength_m
        d = np.array(direction_phase, dtype=np.float64)
        d_norm = np.linalg.norm(d)
        if d_norm > 0.0:
            d /= d_norm
            phases -= k * (pts @ d)

    return [
        AnalyticSource(float(pts[i, 0]), float(pts[i, 1]), amplitude, float(phases[i]))
        for i in range(count)
    ]


def multi_slit_sample_positions(
    slit_count: int,
    slit_width_m: float,
    slit_separation_m: float,
    wavelength_m: float,
) -> np.ndarray:
    slit_count = int(max(1, slit_count))
    slit_width_m = max(slit_width_m, 1e-9)
    wavelength_m = max(wavelength_m, 1e-9)

    centers = (np.arange(slit_count, dtype=np.float64) - (slit_count - 1) * 0.5) * slit_separation_m
    samples_per_slit = max(1, int(np.floor(slit_width_m / wavelength_m)))

    y_values: List[float] = []
    if samples_per_slit == 1:
        y_values.extend(centers.tolist())
    else:
        local = np.linspace(-0.5 * slit_width_m, 0.5 * slit_width_m, samples_per_slit)
        for c in centers:
            y_values.extend((c + local).tolist())
    return np.array(y_values, dtype=np.float64)


def point_sources_to_arrays(sources: Sequence[AnalyticSource]) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    if not sources:
        return (
            np.zeros((0, 2), dtype=np.float32),
            np.zeros(0, dtype=np.float32),
            np.zeros(0, dtype=np.float32),
        )
    pos = np.array([[s.x, s.y] for s in sources], dtype=np.float32)
    amp = np.array([s.amplitude for s in sources], dtype=np.float32)
    phase = np.array([s.phase for s in sources], dtype=np.float32)
    return pos, amp, phase


def evaluate_amplitude_field(
    points_xy: np.ndarray,
    sources: Sequence[AnalyticSource],
    wavelength_m: float,
    time_s: float,
) -> np.ndarray:
    if len(sources) == 0:
        return np.zeros(points_xy.shape[0], dtype=np.float64)

    wavelength_m = max(wavelength_m, 1e-9)
    omega = TAU / period_from_wavelength(wavelength_m)
    k = TAU / wavelength_m

    src_pos = np.array([[s.x, s.y] for s in sources], dtype=np.float64)
    src_amp = np.array([s.amplitude for s in sources], dtype=np.float64)
    src_phase = np.array([s.phase for s in sources], dtype=np.float64)

    delta = points_xy[:, None, :] - src_pos[None, :, :]
    r = np.linalg.norm(delta, axis=2) + 1e-9
    phase = k * r - omega * time_s + src_phase[None, :]
    return np.sum(src_amp[None, :] * np.cos(phase), axis=1)


class RollingPeriodAverage:
    def __init__(self) -> None:
        self.samples: List[Tuple[float, np.ndarray]] = []

    def update(self, t: float, values: np.ndarray, period: float) -> np.ndarray:
        self.samples.append((t, values.copy()))
        min_t = t - max(period, 1e-6)
        self.samples = [item for item in self.samples if item[0] >= min_t]
        if not self.samples:
            return values
        stack = np.stack([v for _, v in self.samples], axis=0)
        return np.mean(stack, axis=0)
