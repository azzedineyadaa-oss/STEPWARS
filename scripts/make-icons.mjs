// Génère les icônes de assets/ à partir d'un SVG, rendu par Chromium.
// Usage : node scripts/make-icons.mjs [dossier]   (Playwright requis : npm i -g playwright)
import { chromium } from 'playwright';
const out = process.argv[2] ?? new URL('../assets', import.meta.url).pathname;
// Éclair dans un carré 1024, centré sur (512, 512).
const BOLT = 'M 620 70 L 232 600 L 470 600 L 398 954 L 800 400 L 560 400 Z';
const defs = `
  <defs>
    <linearGradient id="bolt" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFB13D"/><stop offset="0.45" stop-color="#FF5A36"/><stop offset="1" stop-color="#FF2D78"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#7C5CFF" stop-opacity="0.55"/><stop offset="1" stop-color="#7C5CFF" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1B1640"/><stop offset="1" stop-color="#0B0C17"/>
    </linearGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="0" stdDeviation="28" flood-color="#FF5A36" flood-opacity="0.65"/>
    </filter>
  </defs>`;
const background = `<rect width="1024" height="1024" fill="url(#bg)"/><circle cx="512" cy="530" r="430" fill="url(#glow)"/>`;
const bolt = (scale) =>
  `<g transform="translate(512 512) scale(${scale}) translate(-512 -512)"><path d="${BOLT}" fill="url(#bolt)" filter="url(#shadow)" stroke="#FFFFFF" stroke-opacity="0.18" stroke-width="10" stroke-linejoin="round"/></g>`;
const svg = (body, size = 1024) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${defs}${body}</svg>`;

const files = {
  'icon.png': svg(background + bolt(0.9)),
  // Android : le premier plan doit tenir dans la zone sûre (≈ 66 % centraux).
  'android-icon-foreground.png': svg(bolt(0.58)),
  'android-icon-background.png': svg(background),
  'android-icon-monochrome.png': svg(`<g transform="translate(512 512) scale(0.58) translate(-512 -512)"><path d="${BOLT}" fill="#FFFFFF"/></g>`),
  'splash-icon.png': svg(bolt(0.9)),
};

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
for (const [name, content] of Object.entries(files)) {
  await page.setContent(`<html><body style="margin:0;background:transparent">${content}</body></html>`);
  await page.screenshot({ path: `${out}/${name}`, omitBackground: true, clip: { x: 0, y: 0, width: 1024, height: 1024 } });
}
await browser.close();
