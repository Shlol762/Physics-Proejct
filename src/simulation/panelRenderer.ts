import {
  C_UM_PER_FS,
  PX_PER_UM,
  TAB_LABELS,
  TWO_PI
} from "../constants";
import {
  HudLine,
  PanelFrameOutput,
  RenderMode,
  SimulationControls,
  TabId,
  WaveSource
} from "../types/simulation";

interface PanelRenderParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  tab: TabId;
  controls: SimulationControls;
  time: number;
  mode: RenderMode;
}

const FONT = '14px "IBM Plex Mono", monospace';

const buildBaseHud = (tab: TabId, mode: RenderMode, controls: SimulationControls): HudLine[] => {
  return [
    { label: "Panel", value: TAB_LABELS[tab] },
    { label: "Mode", value: mode === "huygens" ? "Huygens (Canvas)" : "Field (WebGL)" },
    { label: "Wavelength", value: `${controls.wavelength.toFixed(2)} um` }
  ];
};

const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number): void => {
  ctx.strokeStyle = "#d5d9e5";
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.42;

  for (let x = 0; x <= width; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = 0; y <= height; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
};

const clearScene = (ctx: CanvasRenderingContext2D, width: number, height: number): void => {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#f2f8ff");
  gradient.addColorStop(1, "#d9ecff");

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  drawGrid(ctx, width, height);
};

const periodFromWavelength = (wavelengthUm: number): number => {
  return wavelengthUm / C_UM_PER_FS;
};

const drawIntro = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  controls: SimulationControls,
  time: number
): PanelFrameOutput => {
  const cx = width * 0.5;
  const cy = height * 0.5;
  const speedPxPerFs = C_UM_PER_FS * PX_PER_UM;

  // One full demo cycle has two phases:
  // (1) primary front expansion for constructionDtFs
  // (2) secondary wavelet phase + tangent envelope for constructionDtFs
  const constructionDtFs = Math.max(0.75, periodFromWavelength(controls.wavelength) * 0.9);
  const primaryEmissionPeriodFs = constructionDtFs * 2;

  const cycleTimeFs = time % primaryEmissionPeriodFs;
  const inWaveletPhase = cycleTimeFs >= constructionDtFs;
  const phaseTimeFs = inWaveletPhase ? cycleTimeFs - constructionDtFs : cycleTimeFs;
  const phaseAlpha = Math.min(1, Math.max(0, phaseTimeFs / constructionDtFs));

  const secondarySeedRadius = speedPxPerFs * constructionDtFs;
  const primaryRadiusPx = inWaveletPhase ? secondarySeedRadius : speedPxPerFs * phaseTimeFs;
  const waveletRadiusPx = inWaveletPhase ? speedPxPerFs * phaseTimeFs : 0;

  const secondaryCount = 10;
  const secondarySources: Array<{ x: number; y: number; angle: number }> = [];
  if (inWaveletPhase) {
    for (let i = 0; i < secondaryCount; i += 1) {
      const angle = (i / secondaryCount) * TWO_PI;
      secondarySources.push({
        x: cx + secondarySeedRadius * Math.cos(angle),
        y: cy + secondarySeedRadius * Math.sin(angle),
        angle
      });
    }
  }

  // Primary source marker
  ctx.fillStyle = "#d97706";
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, TWO_PI);
  ctx.fill();

  // Primary wavefront (or frozen construction front in phase 2)
  ctx.strokeStyle = "#1d4ed8";
  ctx.lineWidth = 2.1;
  ctx.globalAlpha = inWaveletPhase ? 0.4 : 0.95;
  ctx.beginPath();
  ctx.arc(cx, cy, primaryRadiusPx, 0, TWO_PI);
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (inWaveletPhase) {
    // Secondary sources sampled along the frozen primary front
    ctx.fillStyle = "#f59e0b";
    for (const secondary of secondarySources) {
      ctx.beginPath();
      ctx.arc(secondary.x, secondary.y, 3, 0, TWO_PI);
      ctx.fill();
    }

    // Outward half-circular wavelets from each secondary source
    ctx.strokeStyle = "#db2777";
    ctx.lineWidth = 1.4;
    for (const secondary of secondarySources) {
      const startAngle = secondary.angle - Math.PI * 0.5;
      const endAngle = secondary.angle + Math.PI * 0.5;
      ctx.beginPath();
      ctx.arc(secondary.x, secondary.y, waveletRadiusPx, startAngle, endAngle);
      ctx.stroke();
    }

    // Tangent envelope: the new advancing primary front formed by wavelet outer edges
    const envelopeRadiusPx = secondarySeedRadius + waveletRadiusPx;
    ctx.strokeStyle = "#15803d";
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.arc(cx, cy, envelopeRadiusPx, 0, TWO_PI);
    ctx.stroke();
  }

  ctx.fillStyle = "#0f172a";
  ctx.font = FONT;
  ctx.fillText("Huygens animation: primary front -> secondary wavelets -> tangent envelope", 20, 30);
  ctx.fillText(
    inWaveletPhase
      ? "Phase 2: secondary wavelets and envelope progression"
      : "Phase 1: primary wavefront expansion",
    20,
    52
  );

  return {
    sources: [{ x: cx, y: cy, amplitude: 1, phase: 0 }],
    hudLines: [
      {
        label: "Stage",
        value: inWaveletPhase ? "Secondary wavelets + envelope" : "Primary front expansion"
      },
      { label: "construction Dt", value: `${constructionDtFs.toFixed(2)} fs` },
      { label: "Secondary sources", value: `${secondaryCount}` },
      { label: "Primary radius", value: `${primaryRadiusPx.toFixed(1)} px` },
      { label: "Wavelet radius", value: `${waveletRadiusPx.toFixed(1)} px` },
      { label: "Progress", value: `${(phaseAlpha * 100).toFixed(0)}%` }
    ]
  };
};

const drawBoundaryWave = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  controls: SimulationControls,
  time: number,
  type: "reflection" | "refraction"
): PanelFrameOutput => {
  const mediumShadeFromIndex = (n: number): string => {
    const clamped = Math.max(1, Math.min(3, n));
    const t = (clamped - 1) / 2;
    const channel = Math.round(255 - t * (255 - 128));
    return `rgb(${channel}, ${channel}, ${channel})`;
  };

  const drawLabelChip = (text: string, x: number, y: number, color: string): void => {
    ctx.save();
    ctx.font = '11px "IBM Plex Mono", monospace';
    ctx.textAlign = "center";

    const metrics = ctx.measureText(text);
    const chipWidth = metrics.width + 10;
    const chipHeight = 16;

    ctx.fillStyle = "rgba(248, 250, 252, 0.88)";
    ctx.strokeStyle = "rgba(100, 116, 139, 0.45)";
    ctx.lineWidth = 1;
    ctx.fillRect(x - chipWidth / 2, y - chipHeight + 3, chipWidth, chipHeight);
    ctx.strokeRect(x - chipWidth / 2, y - chipHeight + 3, chipWidth, chipHeight);

    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  };

  const drawArrow = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: string,
    label: string,
    dashed = false,
    labelAnchor: "head" | "tail" = "head"
  ): void => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      return;
    }

    const ux = dx / len;
    const uy = dy / len;
    const head = 11;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.2;
    ctx.setLineDash(dashed ? [7, 5] : []);

    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - ux * head - uy * head * 0.5, y1 - uy * head + ux * head * 0.5);
    ctx.lineTo(x1 - ux * head + uy * head * 0.5, y1 - uy * head - ux * head * 0.5);
    ctx.closePath();
    ctx.fill();

    const nx = -uy;
    const ny = ux;
    const baseX = labelAnchor === "tail" ? x0 + ux * 16 : x1 - ux * 10;
    const baseY = labelAnchor === "tail" ? y0 + uy * 16 : y1 - uy * 10;
    drawLabelChip(label, baseX + nx * 12, baseY + ny * 12, color);
    ctx.restore();
  };

  const cx = width / 2;
  const cy = height / 2;
  const theta1 = (controls.thetaIncidence * Math.PI) / 180;
  const sinT2 = (controls.n1 / controls.n2) * Math.sin(theta1);
  const tir = type === "refraction" && Math.abs(sinT2) >= 1;
  const theta2 = type === "refraction" && !tir ? Math.asin(sinT2) : null;
  const theta2Deg = theta2 === null ? null : (theta2 * 180) / Math.PI;

  const normalizeAngle = (angle: number): number => {
    let normalized = angle % TWO_PI;
    if (normalized < 0) {
      normalized += TWO_PI;
    }
    return normalized;
  };

  const arcMidAngle = (startAngle: number, endAngle: number, anticlockwise: boolean): number => {
    const start = normalizeAngle(startAngle);
    const end = normalizeAngle(endAngle);
    let span = anticlockwise ? start - end : end - start;
    if (span < 0) {
      span += TWO_PI;
    }
    return normalizeAngle(anticlockwise ? start - span / 2 : start + span / 2);
  };

  const drawAngleMarker = (
    startAngle: number,
    endAngle: number,
    anticlockwise: boolean,
    radius: number,
    color: string,
    label: string,
    labelRadius?: number
  ): void => {
    const midAngle = arcMidAngle(startAngle, endAngle, anticlockwise);
    const labelR = labelRadius ?? radius + 18;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, startAngle, endAngle, anticlockwise);
    ctx.stroke();
    ctx.restore();

    drawLabelChip(label, cx + Math.cos(midAngle) * labelR, cy + Math.sin(midAngle) * labelR, color);
  };

  const v1 = (C_UM_PER_FS / controls.n1) * PX_PER_UM;
  const v2 = (C_UM_PER_FS / (type === "reflection" ? controls.n1 : controls.n2)) * PX_PER_UM;

  const medium1Shade = type === "refraction" ? mediumShadeFromIndex(controls.n1) : "#f8fafc";
  const medium2Shade = type === "refraction" ? mediumShadeFromIndex(controls.n2) : "#f8fafc";

  ctx.fillStyle = medium1Shade;
  ctx.fillRect(0, 0, width, cy);
  ctx.fillStyle = medium2Shade;
  ctx.fillRect(0, cy, width, height - cy);

  drawGrid(ctx, width, height);

  ctx.fillStyle = "#334155";
  ctx.font = FONT;
  ctx.fillText(`Medium 1 (n1 = ${controls.n1.toFixed(2)}), v = ${(C_UM_PER_FS / controls.n1).toFixed(2)} um/fs`, 20, 30);
  if (type === "refraction") {
    ctx.fillText(`Medium 2 (n2 = ${controls.n2.toFixed(2)}), v = ${(C_UM_PER_FS / controls.n2).toFixed(2)} um/fs`, 20, cy + 30);
  } else {
    ctx.fillText("Mirror boundary", 20, cy + 30);
  }

  ctx.strokeStyle = type === "reflection" ? "#f59e0b" : "#0f172a";
  ctx.lineWidth = type === "reflection" ? 4 : 2;
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(width, cy);
  ctx.stroke();

  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, height);
  ctx.stroke();
  ctx.setLineDash([]);

  drawLabelChip("n̂", cx + 16, cy - 84, "#334155");

  const tc = 20;
  const currentT = time % 45;
  const spread = 450;

  ctx.strokeStyle = "#0284c7";
  ctx.lineWidth = 3;
  ctx.beginPath();
  let firstPoint = true;

  for (let s = -spread / 2; s <= spread / 2; s += 5) {
    const thit = tc + (s * Math.tan(theta1)) / v1;
    let x = 0;
    let y = 0;

    if (currentT < thit) {
      x = v1 * (currentT - tc) * Math.sin(theta1) + s * Math.cos(theta1);
      y = v1 * (currentT - tc) * Math.cos(theta1) - s * Math.sin(theta1);
    } else {
      const xhit = s / Math.cos(theta1);
      if (type === "reflection") {
        x = xhit + v1 * (currentT - thit) * Math.sin(theta1);
        y = -v1 * (currentT - thit) * Math.cos(theta1);
      } else {
        if (tir) {
          x = xhit + v1 * (currentT - thit) * Math.sin(theta1);
          y = -v1 * (currentT - thit) * Math.cos(theta1);
        } else if (theta2 !== null) {
          x = xhit + v2 * (currentT - thit) * Math.sin(theta2);
          y = v2 * (currentT - thit) * Math.cos(theta2);
        }
      }
    }

    if (firstPoint) {
      ctx.moveTo(cx + x, cy + y);
      firstPoint = false;
    } else {
      ctx.lineTo(cx + x, cy + y);
    }
  }
  ctx.stroke();

  const numDots = 13;
  const dotSpread = spread / Math.cos(theta1);
  ctx.strokeStyle = "#dc2626";
  ctx.lineWidth = 1.5;

  for (let i = 0; i < numDots; i += 1) {
    const xb = -dotSpread / 2 + (i / (numDots - 1)) * dotSpread;
    const thit = tc + (xb * Math.sin(theta1)) / v1;

    if (currentT <= thit) {
      continue;
    }

    ctx.fillStyle = "#d97706";
    ctx.beginPath();
    ctx.arc(cx + xb, cy, 3, 0, Math.PI * 2);
    ctx.fill();

    if (type === "reflection") {
      const r = v1 * (currentT - thit);
      ctx.beginPath();
      ctx.arc(cx + xb, cy, r, Math.PI, Math.PI * 2);
      ctx.stroke();
    } else {
      if (tir) {
        const r = v1 * (currentT - thit);
        ctx.beginPath();
        ctx.arc(cx + xb, cy, r, Math.PI, Math.PI * 2);
        ctx.stroke();
      } else {
        const r = v2 * (currentT - thit);
        ctx.beginPath();
        ctx.arc(cx + xb, cy, r, 0, Math.PI);
        ctx.stroke();
      }
    }
  }

  // Rays are the propagation directions and therefore perpendicular to wavefronts.
  const incidentDir = {
    x: Math.sin(theta1),
    y: Math.cos(theta1)
  };
  const reflectedDir = {
    x: Math.sin(theta1),
    y: -Math.cos(theta1)
  };

  const rayLength = 130;
  drawArrow(
    cx - incidentDir.x * rayLength,
    cy - incidentDir.y * rayLength,
    cx,
    cy,
    "#2563eb",
    "Incident",
    false,
    "tail"
  );

  if (type === "reflection" || tir) {
    drawArrow(
      cx,
      cy,
      cx + reflectedDir.x * rayLength,
      cy + reflectedDir.y * rayLength,
      "#f97316",
      "Reflected"
    );
  }

  if (type === "refraction" && theta2 !== null) {
    drawArrow(
      cx,
      cy,
      cx + Math.sin(theta2) * rayLength,
      cy + Math.cos(theta2) * rayLength,
      "#059669",
      "Refracted"
    );
  }

  const normalUpAngle = -Math.PI / 2;
  const normalDownAngle = Math.PI / 2;
  drawAngleMarker(
    normalUpAngle,
    normalUpAngle - theta1,
    true,
    42,
    "#1d4ed8",
    `θᵢ = ${controls.thetaIncidence.toFixed(1)}°`,
    68
  );

  if (type === "reflection" || tir) {
    drawAngleMarker(
      normalUpAngle,
      normalUpAngle + theta1,
      false,
      58,
      "#ea580c",
      `θᵣ = ${controls.thetaIncidence.toFixed(1)}°`,
      84
    );
  }

  if (type === "refraction" && theta2 !== null && theta2Deg !== null) {
    drawAngleMarker(
      normalDownAngle,
      normalDownAngle - theta2,
      true,
      52,
      "#047857",
      `θₜ = ${theta2Deg.toFixed(1)}°`,
      76
    );
  }

  return {
    sources: [],
    hudLines: [
      { label: "Incidence", value: `${controls.thetaIncidence.toFixed(1)} deg` },
      {
        label: type === "reflection" ? "Reflected angle" : "Refracted angle",
        value: type === "reflection" ? `${controls.thetaIncidence.toFixed(1)} deg` : theta2Deg === null ? "N/A" : `${theta2Deg.toFixed(1)} deg`
      },
      {
        label: "Rays",
        value: type === "reflection" ? "Incident + Reflected" : theta2 === null ? "Incident + Reflected (TIR)" : "Incident + Refracted"
      }
    ],
    warning: tir ? "Total internal reflection: no transmitted real angle." : undefined
  };
};

const slitCenters = (count: number, centerY: number, separationPx: number): number[] => {
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(centerY + (i - (count - 1) / 2) * separationPx);
  }
  return out;
};

const drawDiffraction = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  controls: SimulationControls,
  time: number
): PanelFrameOutput => {
  const barrierX = Math.round(width * 0.32);
  const vPx = C_UM_PER_FS * PX_PER_UM;
  const slitWidthPx = controls.slitWidth * PX_PER_UM;
  const separationPx = controls.slitSeparation * PX_PER_UM;
  const count = Math.max(1, Math.floor(controls.slitCount));
  const centers = slitCenters(count, height / 2, separationPx);

  const slits = centers
    .map((center) => ({ y0: center - slitWidthPx / 2, y1: center + slitWidthPx / 2 }))
    .sort((a, b) => a.y0 - b.y0);

  ctx.fillStyle = "#6b7280";
  const barrierW = 18;
  let yCursor = 0;
  for (const slit of slits) {
    if (slit.y0 > yCursor) {
      ctx.fillRect(barrierX - barrierW / 2, yCursor, barrierW, slit.y0 - yCursor);
    }
    yCursor = slit.y1;
  }
  if (yCursor < height) {
    ctx.fillRect(barrierX - barrierW / 2, yCursor, barrierW, height - yCursor);
  }

  ctx.strokeStyle = "#b91c1c";
  ctx.lineWidth = 1.2;
  const labelY = slits[0]?.y0 ?? height / 2;
  ctx.beginPath();
  ctx.moveTo(barrierX - 30, labelY);
  ctx.lineTo(barrierX - 30, labelY + slitWidthPx);
  ctx.moveTo(barrierX - 35, labelY);
  ctx.lineTo(barrierX - 25, labelY);
  ctx.moveTo(barrierX - 35, labelY + slitWidthPx);
  ctx.lineTo(barrierX - 25, labelY + slitWidthPx);
  ctx.stroke();

  ctx.fillStyle = "#7f1d1d";
  ctx.font = FONT;
  ctx.fillText(`${controls.slitWidth.toFixed(2)} um`, barrierX - 110, labelY + slitWidthPx / 2 + 4);

  const tc = 10;
  const currentT = time % 30;
  if (currentT < tc) {
    const xInc = barrierX - 240 + (currentT / tc) * 240;
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(xInc, 0);
    ctx.lineTo(xInc, height);
    ctx.stroke();
  } else {
    ctx.strokeStyle = "rgba(37, 99, 235, 0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(barrierX - barrierW / 2, 0);
    ctx.lineTo(barrierX - barrierW / 2, height);
    ctx.stroke();
  }

  const sources: WaveSource[] = [];
  const perSlitSourceCount = Math.max(1, Math.floor(controls.slitWidth / controls.wavelength));

  if (currentT >= tc) {
    const radius = (currentT - tc) * vPx;
    ctx.strokeStyle = "#db2777";
    ctx.lineWidth = 1;

    for (const slit of slits) {
      for (let i = 0; i < perSlitSourceCount; i += 1) {
        const t = perSlitSourceCount === 1 ? 0.5 : i / (perSlitSourceCount - 1);
        const y = slit.y0 + t * (slit.y1 - slit.y0);

        sources.push({
          x: barrierX,
          y,
          amplitude: 1 / (count * perSlitSourceCount),
          phase: 0
        });

        ctx.beginPath();
        ctx.arc(barrierX, y, radius, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();

        ctx.fillStyle = "#f59e0b";
        ctx.beginPath();
        ctx.arc(barrierX, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (slits.length > 0) {
      const top = slits[0].y0;
      const bottom = slits[slits.length - 1].y1;
      ctx.strokeStyle = "#15803d";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(barrierX, top, radius, -Math.PI / 2, 0);
      ctx.lineTo(barrierX + radius, bottom);
      ctx.arc(barrierX, bottom, radius, 0, Math.PI / 2);
      ctx.stroke();
    }
  }

  return {
    sources,
    hudLines: [
      { label: "Slit count N", value: `${count}` },
      { label: "Separation d", value: `${controls.slitSeparation.toFixed(2)} um` },
      { label: "Sources/slit", value: `${perSlitSourceCount}` },
      { label: "Total sources", value: `${count * perSlitSourceCount}` }
    ]
  };
};

const drawPhasedArray = (
  ctx: CanvasRenderingContext2D,
  height: number,
  controls: SimulationControls,
  time: number
): PanelFrameOutput => {
  const startX = 200;
  const count = Math.max(2, Math.floor(controls.elementCount));
  const spacingPx = controls.arraySpacing * PX_PER_UM;
  const totalH = (count - 1) * spacingPx;
  const startY = (height - totalH) / 2;
  const vPx = C_UM_PER_FS * PX_PER_UM;

  const period = periodFromWavelength(controls.wavelength);
  const deltaPhi = TWO_PI * (controls.phaseDelay / Math.max(period, 1e-6));
  const argument = (deltaPhi * controls.wavelength) / (TWO_PI * Math.max(controls.arraySpacing, 1e-6));

  const hasRealBeam = Math.abs(argument) <= 1;
  const theta = hasRealBeam ? Math.asin(argument) : null;

  const currentT = time % Math.max(12, period * 5);
  const sources: WaveSource[] = [];

  ctx.fillStyle = "#334155";
  ctx.font = FONT;
  ctx.fillText(`Phase delay Dt = ${controls.phaseDelay.toFixed(2)} fs`, 28, 34);

  if (theta !== null) {
    ctx.fillText(`Theoretical beam angle theta = ${(theta * 180 / Math.PI).toFixed(1)} deg`, 28, 58);
  } else {
    ctx.fillText("Theoretical beam angle theta = N/A", 28, 58);
  }

  const wavelets: Array<{ x: number; y: number; radius: number }> = [];

  for (let i = 0; i < count; i += 1) {
    const y = startY + i * spacingPx;
    const emitOffset = i * controls.phaseDelay;
    const active = currentT - emitOffset;
    const radius = active > 0 ? active * vPx : 0;

    const phase = i * deltaPhi;
    sources.push({ x: startX, y, amplitude: 1 / count, phase });

    ctx.fillStyle = "#d97706";
    ctx.beginPath();
    ctx.arc(startX, y, 5, 0, Math.PI * 2);
    ctx.fill();

    if (radius > 0) {
      wavelets.push({ x: startX, y, radius });
      ctx.strokeStyle = "#db2777";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(startX, y, radius, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
    }
  }

  if (theta !== null && wavelets.length > 1) {
    ctx.strokeStyle = "#15803d";
    ctx.lineWidth = 3;
    ctx.beginPath();

    for (let i = 0; i < wavelets.length; i += 1) {
      const w = wavelets[i];
      const tx = w.x + w.radius * Math.cos(theta);
      const ty = w.y + w.radius * Math.sin(theta);
      if (i === 0) {
        ctx.moveTo(tx, ty);
      } else {
        ctx.lineTo(tx, ty);
      }
    }
    ctx.stroke();

    const midY = startY + totalH / 2;
    const beamLen = 170;
    const endX = startX + Math.cos(theta) * beamLen;
    const endY = midY + Math.sin(theta) * beamLen;

    ctx.setLineDash([8, 6]);
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, midY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#2563eb";
    const head = 12;
    const a1 = theta + Math.PI - Math.PI / 6;
    const a2 = theta + Math.PI + Math.PI / 6;
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX + head * Math.cos(a1), endY + head * Math.sin(a1));
    ctx.lineTo(endX + head * Math.cos(a2), endY + head * Math.sin(a2));
    ctx.fill();
  }

  const warning = hasRealBeam
    ? undefined
    : "Grating-lobe / non-real steering condition: |Dphi lambda / (2pi d)| > 1";

  return {
    sources,
    hudLines: [
      {
        label: "Beam angle theta",
        value: theta === null ? "N/A" : `${(theta * 180 / Math.PI).toFixed(2)} deg`
      },
      { label: "Condition value", value: `${Math.abs(argument).toFixed(3)}` },
      { label: "Elements", value: `${count}` },
      {
        label: "Criterion",
        value: `|Dphi lambda / (2pi d)| = ${Math.abs(argument).toFixed(3)}`
      }
    ],
    warning
  };
};

export const renderPanelFrame = (params: PanelRenderParams): PanelFrameOutput => {
  const { ctx, width, height, tab, controls, time, mode } = params;

  clearScene(ctx, width, height);

  const base = buildBaseHud(tab, mode, controls);
  let output: PanelFrameOutput;

  if (tab === "intro") {
    output = drawIntro(ctx, width, height, controls, time);
  } else if (tab === "reflection") {
    output = drawBoundaryWave(ctx, width, height, controls, time, "reflection");
  } else if (tab === "refraction") {
    output = drawBoundaryWave(ctx, width, height, controls, time, "refraction");
  } else if (tab === "diffraction") {
    output = drawDiffraction(ctx, width, height, controls, time);
  } else if (tab === "phasedArray") {
    output = drawPhasedArray(ctx, height, controls, time);
  } else {
    output = drawIntro(ctx, width, height, controls, time);
  }

  return {
    ...output,
    hudLines: [...base, ...output.hudLines]
  };
};
