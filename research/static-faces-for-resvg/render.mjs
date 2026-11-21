import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as fontkit from 'fontkit';
import { exportView } from './driver.mjs';
const require = createRequire(import.meta.url);
const R = { stable: require('@resvg/resvg-js'), next: require('./next/node_modules/@resvg/resvg-js') };
const ws = JSON.parse(readFileSync('../../test/__fixtures__/export.json', 'utf8'));
const cases = [
  { name: 'inter-variable', family: 'Inter', files: ['inter-var.woff2'] },
  { name: 'inter-variable-resvg-2.7', family: 'Inter', files: ['inter-var.woff2'], resvg: 'next' },
  { name: 'inter-gf-static', family: 'Inter', files: ['inter-400.ttf', 'inter-700.ttf'] },
  { name: 'inter-instanced', family: 'Inter', files: ['inter-inst-400.ttf', 'inter-inst-700.ttf'] },
  { name: 'arimo-variable', family: 'Arimo', files: ['arimo-var.woff2'] },
  { name: 'arimo-gf-static', family: 'Arimo', files: ['arimo-400.ttf', 'arimo-700.ttf'] },
  { name: 'arimo-instanced', family: 'Arimo', files: ['arimo-inst-400.ttf', 'arimo-inst-700.ttf'] },
  { name: 'lato-static', family: 'Lato', files: ['lato-0.ttf', 'lato-1.ttf'] },
];
// Ink of one word drawn regular and bold: a lost weight shows as a ratio near 1.
function inkRatio(resvg, family, files) {
  const ink = (w) => { const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="80"><rect width="400" height="80" fill="#fff"/><text x="10" y="55" font-family="${family}" font-size="40" font-weight="${w}">Banking</text></svg>`;
    const px = new resvg.Resvg(svg, { font: { fontFiles: files, loadSystemFonts: false, defaultFontFamily: family } }).render().pixels; let n = 0; for (let i = 0; i < px.length; i += 4) n += 255 - px[i]; return n; };
  return ink(700) / ink(400);
}
for (const c of cases) {
  const resvg = R[c.resvg ?? 'stable'];
  const files = c.files.map((f) => f.replace('.woff2', '.ttf')); const buffers = files.map((f) => readFileSync(f));
  const faces = c.files.map((f) => fontkit.openSync(f));
  const face = (bold) => faces.length > 1 ? faces[bold ? 1 : 0] : faces[0].getVariation({ wght: bold ? 700 : 400 });
  const upm = faces[0].unitsPerEm;
  const measure = (text, size, bold) => face(bold).layout(text).advanceWidth / upm * size;
  const t0 = performance.now();
  const { svg, width } = exportView(ws, 'Containers', c.family, measure, faces[0].hhea.ascent / upm, -faces[0].hhea.descent / upm);
  const png = new resvg.Resvg(svg, { fitTo: { mode: 'width', value: Math.round(width * 2) }, font: { fontFiles: files, loadSystemFonts: false, defaultFontFamily: c.family } }).render().asPng();
  const ms = performance.now() - t0;
  writeFileSync(`out-${c.name}.png`, png);
  console.log(c.name.padEnd(26), 'bold/regular ink', inkRatio(resvg, c.family, c.files.map(f => f.replace('.woff2', '.ttf'))).toFixed(3), ' fonts', (buffers.reduce((a, b) => a + b.length, 0) / 1024).toFixed(0) + ' KB', ' export', ms.toFixed(0) + ' ms');
}
