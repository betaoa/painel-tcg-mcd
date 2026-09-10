// Reproducible vendoring of the original panel's fonts and PDF reader.
import { mkdir, writeFile } from 'node:fs/promises';
const fontDir = new URL('../public/fonts/', import.meta.url);
const vendorDir = new URL('../public/vendor/', import.meta.url);
await Promise.all([mkdir(fontDir, { recursive: true }), mkdir(vendorDir, { recursive: true })]);
const cssUrl = 'https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@100..900&family=JetBrains+Mono:wght@100..800&family=Poppins:wght@600;700;800&display=swap';
async function download(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response;
}
let css = await (await download(cssUrl)).text();
const urls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(m => m[1]))];
await Promise.all(urls.map(async (url, index) => {
  const name = `loja-${index}.${url.endsWith('.woff2') ? 'woff2' : 'ttf'}`;
  await writeFile(new URL(name, fontDir), Buffer.from(await (await download(url)).arrayBuffer()));
  css = css.replaceAll(url, `/fonts/${name}`);
}));
await writeFile(new URL('fonts.css', fontDir), css);
for (const family of ['anton', 'inter', 'jetbrainsmono', 'poppins']) {
  const text = await (await download(`https://raw.githubusercontent.com/google/fonts/main/ofl/${family}/OFL.txt`)).text();
  await writeFile(new URL(`LICENSE-${family}.txt`, fontDir), text);
}
for (const name of ['pdf.min.js', 'pdf.worker.min.js']) {
  const bytes = await (await download(`https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/${name}`)).arrayBuffer();
  await writeFile(new URL(name, vendorDir), Buffer.from(bytes));
}
console.log(`Vendored ${urls.length} font files with licenses and PDF.js 3.11.174. Runtime evaluation is disabled by the panel.`);
