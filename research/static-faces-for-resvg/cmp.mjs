import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { Resvg } = createRequire(import.meta.url)('@resvg/resvg-js');
// decode PNG by re-rendering is awkward; compare raw bytes and a cheap pixel diff via resvg's own PNG decode through an <image>
const px = (f) => { const b64 = readFileSync(f).toString('base64'); const { width, height } = (() => { const b = readFileSync(f); return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }; })();
  return { width, height, data: new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}"><image width="${width}" height="${height}" href="data:image/png;base64,${b64}"/></svg>`).render().pixels }; };
for (const [a, b] of [['inter-gf-static', 'inter-instanced'], ['arimo-gf-static', 'arimo-instanced'], ['inter-variable', 'inter-instanced'], ['arimo-variable', 'arimo-instanced']]) {
  const A = px(`out-${a}.png`), B = px(`out-${b}.png`); let diff = 0; for (let i = 0; i < A.data.length; i += 4) if (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i+1] - B.data[i+1]) + Math.abs(A.data[i+2] - B.data[i+2]) > 30) diff++;
  console.log(`${a} vs ${b}: ${A.width}x${A.height} vs ${B.width}x${B.height}, pixels differing ${(100 * diff / (A.data.length / 4)).toFixed(3)}%`);
}
