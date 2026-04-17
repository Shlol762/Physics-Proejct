from __future__ import annotations

import math
from typing import Optional, Tuple

SIM_C = 3.0


def period_from_wavelength(wavelength_m: float) -> float:
    wavelength_m = max(wavelength_m, 1e-12)
    return wavelength_m / SIM_C


def snell_refraction_angle(theta_i_rad: float, n1: float, n2: float) -> Tuple[Optional[float], bool]:
    n1 = max(n1, 1e-9)
    n2 = max(n2, 1e-9)
    ratio = n1 / n2 * math.sin(theta_i_rad)
    if abs(ratio) > 1.0:
        return None, True
    return math.asin(ratio), False


def critical_angle(n1: float, n2: float) -> Optional[float]:
    if n1 <= n2:
        return None
    return math.asin(max(-1.0, min(1.0, n2 / n1)))


def reflection_transmission_amplitudes(r_coeff: float) -> Tuple[float, float]:
    r = max(0.0, min(1.0, r_coeff))
    return r, math.sqrt(max(0.0, 1.0 - r * r))


def phased_array_beam_argument(delta_phi_rad: float, wavelength_m: float, spacing_m: float) -> float:
    spacing_m = max(spacing_m, 1e-9)
    return delta_phi_rad * wavelength_m / (2.0 * math.pi * spacing_m)


def phased_array_beam_angle(delta_phi_rad: float, wavelength_m: float, spacing_m: float) -> Tuple[Optional[float], bool]:
    arg = phased_array_beam_argument(delta_phi_rad, wavelength_m, spacing_m)
    if abs(arg) > 1.0:
        return None, True
    return math.asin(arg), False


def lens_phase_shift(y_m: float, wavelength_m: float, focal_length_m: float) -> float:
    wavelength_m = max(wavelength_m, 1e-12)
    if abs(focal_length_m) < 1e-9:
        return 0.0
    return (2.0 * math.pi / wavelength_m) * (y_m * y_m / (2.0 * focal_length_m))


def deg_to_rad(value: float) -> float:
    return value * math.pi / 180.0


def rad_to_deg(value: float) -> float:
    return value * 180.0 / math.pi
