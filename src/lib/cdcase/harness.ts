import { createCdCase } from './index';
import type { CaseKind, CdCaseController, CdDisc } from './types';

/** Offline paper/scan, cover-only, missing-art, and legacy holographic fixtures. */
export function createHarnessDiscs(): CdDisc[] {
  const artwork = (colour: string, title: string): string => {
    const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 2048;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.scale(8, 8);
    ctx.fillStyle = colour; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 12; i++) {
      ctx.strokeStyle = `rgba(255,255,255,${0.12 + i * 0.04})`;
      ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(128, 128, 15 + i * 12, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(title, 128, 75);
    ctx.font = '6px sans-serif'; ctx.fillText('PRINT DETAIL 0123456789', 128, 236);
    ctx.fillRect(48, 242, 160, 0.25);
    return canvas.toDataURL('image/png');
  };
  const logo = document.createElement('canvas'); logo.width = 512; logo.height = 64;
  const ctx = logo.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#f5f3ed'; ctx.font = '600 42px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('VIOLET HOURS', 256, 32);
  }
  const cover = artwork('#573c91', 'VIOLET HOURS');
  const scan = document.createElement('canvas'); scan.width = scan.height = 2048;
  const ink = scan.getContext('2d');
  if (ink) {
    // Work in mm: the square is 120 mm; leave its corners truly transparent.
    ink.scale(2048 / 120, 2048 / 120); ink.translate(60, 60);
    ink.beginPath(); ink.arc(0, 0, 60, 0, Math.PI * 2); ink.clip();
    ink.fillStyle = '#147b72'; ink.fillRect(-60, -60, 120, 120);
    ink.strokeStyle = '#8bd3ba'; ink.lineWidth = 0.5;
    for (const r of [16.2, 20, 40, 59.4]) { ink.beginPath(); ink.arc(0, 0, r, 0, Math.PI * 2); ink.stroke(); }
    ink.fillStyle = '#f3df87'; ink.font = 'bold 9px sans-serif'; ink.textAlign = 'center';
    ink.fillText('DISC SCAN', 0, -28);
    ink.font = '3px sans-serif'; ink.fillText('120 mm / HUB PRINT / RGBA', 0, 30);
    // A clear centre with faint grey scan residue, plus an unprinted silver
    // registration dot away from the hub, exercises alpha rather than RGB.
    ink.globalCompositeOperation = 'destination-out';
    ink.beginPath(); ink.arc(0, 0, 15.6, 0, Math.PI * 2); ink.fill();
    ink.beginPath(); ink.arc(32, 0, 3, 0, Math.PI * 2); ink.fill();
    ink.globalCompositeOperation = 'source-over'; ink.fillStyle = 'rgba(128,128,128,0.01)';
    ink.beginPath(); ink.arc(0, 0, 15.6, 0, Math.PI * 2); ink.fill();
    ink.globalCompositeOperation = 'destination-out';
    ink.beginPath(); ink.arc(0, 0, 7.5, 0, Math.PI * 2); ink.fill();
  }
  const back = document.createElement('canvas'); back.width = 1536; back.height = 1024;
  const paper = back.getContext('2d');
  if (paper) {
    paper.fillStyle = '#d0b18a'; paper.fillRect(0, 0, back.width, back.height);
    paper.fillStyle = '#54395f'; paper.font = 'bold 80px sans-serif'; paper.textAlign = 'center';
    paper.fillText('BACK INLAY', 768, 120);
    paper.font = '30px sans-serif'; paper.fillText('PAPER UNDER THE CLEAR TRAY', 768, 945);
    paper.strokeStyle = '#725c74'; paper.lineWidth = 4;
    for (let y = 220; y < 860; y += 80) { paper.beginPath(); paper.moveTo(170, y); paper.lineTo(1366, y); paper.stroke(); }
  }
  return [
    { id: 'scan', name: 'Violet Hours — scanned disc', label: 'Violet Hours', art: ink ? scan.toDataURL('image/png') : null, cover, back: paper ? back.toDataURL('image/png') : null, discIsScan: true, accent: '#573c91', spineColour: '#3b265c', spineLogo: ctx ? logo.toDataURL('image/png') : undefined, base: 'print' },
    { id: 'violet', name: 'Violet Hours', label: 'Violet Hours', art: cover, cover, accent: '#573c91', spineColour: '#3b265c', spineLogo: ctx ? logo.toDataURL('image/png') : undefined, base: 'print' },
    { id: 'fallback', name: 'Missing artwork', label: 'Missing artwork', art: null, accent: '#a44d34', spineColour: '#653623' },
    { id: 'tidal', name: 'Tidal Light', label: 'Tidal Light', art: artwork('#126c79', 'TIDAL LIGHT'), accent: '#126c79', base: 'holo', artIn: 24, printOut: 48 },
  ];
}

/** Mount the generated fixtures in a positioned host. */
export function mountHarness(el: HTMLElement, kind: CaseKind = 'jewel'): CdCaseController {
  return createCdCase(el, createHarnessDiscs(), { kind, autoDemo: true, onFail: error => console.error('Case harness:', error) });
}
