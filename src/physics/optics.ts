export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function radToDeg(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function snellRefraction(thetaIncidentRad: number, n1: number, n2: number): {
  totalInternalReflection: boolean;
  thetaRefractionRad: number | null;
} {
  const ratio = (n1 / n2) * Math.sin(thetaIncidentRad);
  if (Math.abs(ratio) > 1) {
    return {
      totalInternalReflection: true,
      thetaRefractionRad: null
    };
  }

  return {
    totalInternalReflection: false,
    thetaRefractionRad: Math.asin(ratio)
  };
}

export function transmissionAmplitudeFromReflectionCoefficient(reflectionCoefficient: number): number {
  const clamped = Math.min(1, Math.max(0, reflectionCoefficient));
  return Math.sqrt(1 - clamped * clamped);
}

export function beamAngleFromPhaseDelay(phaseDelayRad: number, lambda: number, spacing: number): {
  valid: boolean;
  thetaRad: number | null;
  argument: number;
} {
  const argument = (phaseDelayRad * lambda) / (2 * Math.PI * Math.max(spacing, 1e-9));
  if (Math.abs(argument) > 1) {
    return { valid: false, thetaRad: null, argument };
  }

  return {
    valid: true,
    thetaRad: Math.asin(argument),
    argument
  };
}

export function lensPhaseAdvance(y: number, lambda: number, focalLength: number): number {
  return ((2 * Math.PI) / Math.max(lambda, 1e-9)) * ((y * y) / (2 * Math.max(focalLength, 1e-9)));
}
