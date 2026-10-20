'use client';
import { useMemo } from 'react';
import { create } from 'qrcode';
import type { Release, Software } from '@/lib/station-types';
import { adviceMeta, monthDay } from '@/lib/station-view';

/** 二维码矩阵（qrcode 库只用来编码，渲染自己做，SVG 与 canvas 共用）。 */
export function qrMatrix(text: string) {
  const { modules } = create(text, { errorCorrectionLevel: 'M' });
  return { size: modules.size, dark: (x: number, y: number) => modules.get(y, x) === 1 };
}

export function QrSvg({ text, label, className = 'sv-qr__svg' }: { text: string; label: string; className?: string }) {
  const { size, path } = useMemo(() => {
    const m = qrMatrix(text); let d = '';
    for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) if (m.dark(x, y)) d += `M${x + 2} ${y + 2}h1v1h-1z`;
    return { size: m.size + 4, path: d };
  }, [text]);
  return <svg className={className} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges"><rect width={size} height={size} fill="#fff"/><path d={path} fill="#141F33"/></svg>;
}

/* ---------- 分享海报（canvas，R-SHEET-03） ---------- */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function wrapLines(ctx: CanvasRenderingContext2D, text: string, width: number, max: number) {
  const lines: string[] = []; let line = '';
  for (const ch of Array.from(text)) {
    if (ctx.measureText(line + ch).width > width && line) { lines.push(line); line = ch; if (lines.length === max) break; } else line += ch;
  }
  if (lines.length < max && line) lines.push(line);
  if (lines.length === max && lines.join('').length < text.length) lines[max - 1] = lines[max - 1].slice(0, -1) + '…';
  return lines;
}
const FONT = '-apple-system, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';

/** 生成海报 PNG（data URL）。尺寸 600×780，按 2 倍绘制保证清晰。 */
export function drawPoster({ siteName, software, release, url }: { siteName: string; software: Software; release: Release; url: string }) {
  const W = 600, H = 780, S = 2;
  const canvas = document.createElement('canvas'); canvas.width = W * S; canvas.height = H * S;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('canvas unavailable');
  ctx.scale(S, S);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  // 上部品牌渐变
  const g = ctx.createLinearGradient(0, 0, W, 440); g.addColorStop(0, '#1F4FD8'); g.addColorStop(1, '#5B8CFF');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 440);
  ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.beginPath(); ctx.arc(W - 30, 30, 120, 0, Math.PI * 2); ctx.fill();
  // 图标：首字 + 渐变底
  const ic = ctx.createLinearGradient(40, 48, 136, 144); ic.addColorStop(0, /^#[0-9a-f]{6}$/i.test(software.color) ? software.color : '#3E7BFA'); ic.addColorStop(1, '#1F4FD8');
  ctx.fillStyle = ic; roundRect(ctx, 40, 48, 96, 96, 24); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = `800 46px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(Array.from(software.name)[0] || '软', 88, 98);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = `800 36px ${FONT}`;
  ctx.fillText(wrapLines(ctx, `${software.name} ${release.version}`, W - 200, 1)[0], 160, 92);
  ctx.globalAlpha = .88; ctx.font = `500 24px ${FONT}`;
  ctx.fillText(`${adviceMeta[release.advice].label} · ${monthDay(release.published_at)}`, 160, 132);
  ctx.globalAlpha = .96; ctx.font = `400 26px ${FONT}`;
  wrapLines(ctx, release.summary || software.summary || '', W - 80, 4).forEach((line, i) => ctx.fillText(line, 40, 210 + i * 40));
  ctx.globalAlpha = 1;
  ctx.font = `600 22px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText(siteName, 40, 410);
  // 下部二维码与文字
  const m = qrMatrix(url), box = 220, cell = box / (m.size + 2), qx = 40, qy = 500;
  ctx.fillStyle = '#fff'; ctx.fillRect(qx, qy, box, box);
  ctx.fillStyle = '#141F33';
  for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) if (m.dark(x, y)) ctx.fillRect(qx + (x + 1) * cell, qy + (y + 1) * cell, Math.ceil(cell), Math.ceil(cell));
  ctx.fillStyle = '#141F33'; ctx.font = `700 30px ${FONT}`; ctx.fillText('扫码查看下载和教程', 290, 590);
  ctx.fillStyle = '#5F6B80'; ctx.font = `400 22px ${FONT}`;
  wrapLines(ctx, `${siteName} · 群友整理的软件更新`, W - 320, 2).forEach((line, i) => ctx.fillText(line, 290, 634 + i * 32));
  return canvas.toDataURL('image/png');
}
