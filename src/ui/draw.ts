import { joint, midHip, midShoulder, torsoLength } from '../pose/features';
import { BONES, GroupId, J, Pose } from '../pose/types';

export const COLORS = {
  reference: '#8fa8ff',
  spotlight: '#ffd166',
  ghost: 'rgba(255,255,255,0.34)',
  idle: '#dfe3f5',
  good: '#3ddc97',
  warn: '#ffc857',
  bad: '#ff5d6c',
};

export interface FigureStyle {
  color: (group: GroupId) => string;
  /** Limb thickness as a fraction of torso length. */
  weight?: number;
  alpha?: number;
  /** Skip joints the tracker could not see. */
  minVisibility?: number;
  /** Lines only, with no filled body or head, so a camera image stays visible underneath. */
  outline?: boolean;
}

/** Size a canvas to its on-screen box and return a context scaled for sharp lines. */
export function prepareCanvas(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

/**
 * Draw a pose as a figure. Pose coordinates are in height units, so one scale
 * (the canvas height) maps both axes.
 */
export function drawFigure(ctx: CanvasRenderingContext2D, pose: Pose, h: number, style: FigureStyle) {
  const s = h;
  const torso = torsoLength(pose) * s;
  const lw = Math.max(3, torso * (style.weight ?? 0.17));
  const minVis = style.minVisibility ?? 0;
  ctx.save();
  ctx.globalAlpha = style.alpha ?? 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Torso: a filled shape between shoulders and hips, or just its outline.
  const quad = [J.L_SHOULDER, J.R_SHOULDER, J.R_HIP, J.L_HIP].map((j) => joint(pose, j));
  ctx.fillStyle = style.color('torso');
  ctx.strokeStyle = style.color('torso');
  ctx.lineWidth = style.outline ? lw * 0.6 : lw * 0.9;
  ctx.beginPath();
  quad.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x * s, p.y * s) : ctx.lineTo(p.x * s, p.y * s)));
  ctx.closePath();
  if (!style.outline) ctx.fill();
  ctx.stroke();

  for (const bone of BONES) {
    if (bone.a < 0) continue;
    if (Math.min(pose[bone.a * 3 + 2], pose[bone.b * 3 + 2]) < minVis) continue;
    const a = joint(pose, bone.a);
    const b = joint(pose, bone.b);
    ctx.strokeStyle = style.color(bone.group);
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(a.x * s, a.y * s);
    ctx.lineTo(b.x * s, b.y * s);
    ctx.stroke();
  }

  // Head: a circle above the shoulders, along the line of the spine.
  if (!style.outline) {
    const sh = midShoulder(pose);
    const hip = midHip(pose);
    const ux = (sh.x - hip.x) / (torso / s);
    const uy = (sh.y - hip.y) / (torso / s);
    const r = torso * 0.2;
    ctx.fillStyle = style.color('torso');
    ctx.beginPath();
    ctx.arc(sh.x * s + ux * (r + lw * 0.9), sh.y * s + uy * (r + lw * 0.9), r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
