import {
  type AxisUnitInfo,
  type CameraState,
  formatLength,
  unitFromWavelength,
  worldToScreen
} from "../physics/wavefront";

function niceStep(rawStep: number): number {
  const exponent = Math.floor(Math.log10(Math.max(rawStep, 1e-12)));
  const base = rawStep / 10 ** exponent;
  const roundedBase = base < 1.5 ? 1 : base < 3 ? 2 : base < 7 ? 5 : 10;
  return roundedBase * 10 ** exponent;
}

export class AxisRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private width = 1;
  private height = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      throw new Error("Axis canvas context is unavailable.");
    }
    this.ctx = context;
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.width = Math.max(1, Math.floor(width * pixelRatio));
    this.height = Math.max(1, Math.floor(height * pixelRatio));
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  render(camera: CameraState, lambda: number): AxisUnitInfo {
    const ctx = this.ctx;
    const unitInfo = unitFromWavelength(lambda);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    const worldHalfWidth = this.width / (2 * camera.scale);
    const worldHalfHeight = this.height / (2 * camera.scale);
    const xMin = camera.centerX - worldHalfWidth;
    const xMax = camera.centerX + worldHalfWidth;
    const yMin = camera.centerY - worldHalfHeight;
    const yMax = camera.centerY + worldHalfHeight;

    const gridStep = niceStep(110 / camera.scale);
    const majorEvery = 5;

    ctx.lineWidth = 1;

    let xIndex = 0;
    for (let x = Math.floor(xMin / gridStep) * gridStep; x <= xMax; x += gridStep) {
      const [sx] = worldToScreen(x, 0, camera, this.width, this.height);
      const major = xIndex % majorEvery === 0;
      ctx.strokeStyle = major ? "rgba(179, 234, 255, 0.16)" : "rgba(179, 234, 255, 0.07)";
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, this.height);
      ctx.stroke();
      xIndex += 1;
    }

    let yIndex = 0;
    for (let y = Math.floor(yMin / gridStep) * gridStep; y <= yMax; y += gridStep) {
      const [, sy] = worldToScreen(0, y, camera, this.width, this.height);
      const major = yIndex % majorEvery === 0;
      ctx.strokeStyle = major ? "rgba(179, 234, 255, 0.16)" : "rgba(179, 234, 255, 0.07)";
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(this.width, sy);
      ctx.stroke();
      yIndex += 1;
    }

    const [axisX] = worldToScreen(0, 0, camera, this.width, this.height);
    const [, axisY] = worldToScreen(0, 0, camera, this.width, this.height);

    ctx.strokeStyle = "rgba(255, 226, 122, 0.52)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(axisX, 0);
    ctx.lineTo(axisX, this.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, axisY);
    ctx.lineTo(this.width, axisY);
    ctx.stroke();

    ctx.fillStyle = "rgba(228, 248, 255, 0.8)";
    ctx.font = '11px "Space Mono", monospace';

    for (let x = Math.floor(xMin / (gridStep * majorEvery)) * gridStep * majorEvery; x <= xMax; x += gridStep * majorEvery) {
      const [sx] = worldToScreen(x, 0, camera, this.width, this.height);
      if (sx < 0 || sx > this.width) {
        continue;
      }
      const label = formatLength(x, unitInfo, 2).replace(` ${unitInfo.unit}`, "");
      ctx.fillText(label, sx + 4, axisY - 4);
    }

    for (let y = Math.floor(yMin / (gridStep * majorEvery)) * gridStep * majorEvery; y <= yMax; y += gridStep * majorEvery) {
      const [, sy] = worldToScreen(0, y, camera, this.width, this.height);
      if (sy < 0 || sy > this.height) {
        continue;
      }
      const label = formatLength(y, unitInfo, 2).replace(` ${unitInfo.unit}`, "");
      ctx.fillText(label, axisX + 5, sy - 3);
    }

    ctx.fillStyle = "rgba(255, 243, 186, 0.92)";
    ctx.fillText(`x (${unitInfo.unit})`, this.width - 72, axisY - 6);
    ctx.fillText(`y (${unitInfo.unit})`, axisX + 8, 14);

    return unitInfo;
  }
}
