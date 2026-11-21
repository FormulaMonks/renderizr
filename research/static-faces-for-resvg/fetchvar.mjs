import { writeFileSync } from 'node:fs';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
for (const fam of ['Inter', 'Arimo']) {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${fam}:wght@400;700`, { headers: { 'User-Agent': UA } })).text();
  const block = css.split('/* latin */')[1];
  const url = block.match(/url\((https:[^)]+)\)/)[1];
  writeFileSync(`${fam.toLowerCase()}-var.woff2`, Buffer.from(await (await fetch(url)).arrayBuffer()));
}
