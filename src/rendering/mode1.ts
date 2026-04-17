import {
  type CameraState,
  type DrawCommand,
  worldToScreen
} from "../physics/wavefront";

export class Mode1Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private width = 1;
  private height = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      throw new Error("Canvas 2D context is unavailable.");
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

  render(commands: DrawCommand[], camera: CameraState, globalOpacity = 1): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);

    ctx.setTransform(
      camera.scale,
      0,
      0,
      -camera.scale,
      this.width * 0.5 - camera.centerX * camera.scale,
      this.height * 0.5 + camera.centerY * camera.scale
    );

    for (const command of commands) {
      const alpha = Math.max(0, Math.min(1, command.alpha * globalOpacity));
      if (alpha <= 0) {
        continue;
      }

      if (command.kind === "text") {
        const [sx, sy] = worldToScreen(
          command.x,
          command.y,
          camera,
          this.width,
          this.height
        );
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = command.color;
        ctx.globalAlpha = alpha;
        ctx.font = `${command.px}px "Space Mono", monospace`;
        ctx.fillText(command.text, sx + 8, sy - 8);
        ctx.setTransform(
          camera.scale,
          0,
          0,
          -camera.scale,
          this.width * 0.5 - camera.centerX * camera.scale,
          this.height * 0.5 + camera.centerY * camera.scale
        );
        continue;
      }

      ctx.globalAlpha = alpha;
      ctx.strokeStyle = command.color;
      ctx.fillStyle = command.color;
      ctx.lineWidth = command.kind === "point" ? 1 : command.width / camera.scale;
      if ("dashed" in command && command.dashed) {
        ctx.setLineDash([6 / camera.scale, 6 / camera.scale]);
      } else {
        ctx.setLineDash([]);
      }

      switch (command.kind) {
        case "arc": {
          ctx.beginPath();
          ctx.arc(command.x, command.y, command.radius, command.startAngle, command.endAngle);
          ctx.stroke();
          break;
        }
        case "line": {
          ctx.beginPath();
          ctx.moveTo(command.x1, command.y1);
          ctx.lineTo(command.x2, command.y2);
          ctx.stroke();
          break;
        }
        case "polyline": {
          if (command.points.length < 2) {
            break;
          }
          ctx.beginPath();
          ctx.moveTo(command.points[0][0], command.points[0][1]);
          for (let i = 1; i < command.points.length; i += 1) {
            ctx.lineTo(command.points[i][0], command.points[i][1]);
          }
          if (command.closed) {
            ctx.closePath();
          }
          ctx.stroke();
          break;
        }
        case "point": {
          ctx.beginPath();
          ctx.arc(command.x, command.y, command.size / camera.scale, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case "rect": {
          ctx.beginPath();
          ctx.rect(
            command.x - command.width * 0.5,
            command.y - command.height * 0.5,
            command.width,
            command.height
          );
          if (command.filled) {
            ctx.fill();
          } else {
            ctx.stroke();
          }
          break;
        }
        default:
          break;
      }
    }

    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
