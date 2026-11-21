import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { Resvg } = createRequire(import.meta.url)('@resvg/resvg-js');
const [x, y, w, h] = process.argv.slice(2, 6).map(Number); const names = process.argv.slice(6);
const imgs = names.map((n, i) => `<g transform="translate(${i * (w + 20)},30)"><text x="0" y="-10" font-family="Arial" font-size="22">${n}</text><svg x="0" y="0" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}"><image width="4800" height="4028" href="data:image/png;base64,${readFileSync(`out-${n}.png`).toString('base64')}"/></svg></g>`).join('');
writeFileSync('compare.png', new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${names.length * (w + 20)}" height="${h + 30}"><rect width="100%" height="100%" fill="#fff"/>${imgs}</svg>`).render().asPng());
