/**
 * Reescreve os paths de app/data/ms-municipalities.json em coordenadas relativas.
 *
 * O export do geobr sai em coordenadas absolutas com um "L" por vértice, o que é
 * o formato mais verboso possível. Os mesmos 19.831 vértices em forma relativa
 * ocupam metade do tamanho comprimido, sem mover um único ponto — os deltas são
 * números de um ou dois dígitos em vez de coordenadas cheias.
 *
 * Rode depois de regerar o arquivo a partir do IBGE. É idempotente e aborta se a
 * geometria mudar, então também serve de conferência.
 *
 *   node scripts/compacta-mapa.mjs
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const arquivo = path.join(import.meta.dirname, "..", "app", "data", "ms-municipalities.json");

/** Lê M/L/m/l/Z em pontos absolutos, como o navegador faria. */
function lerSubpaths(d) {
  const subpaths = [];
  let atual = null, cx = 0, cy = 0;
  for (const trecho of d.split(/(?=[MmLlZz])/)) {
    const comando = trecho[0];
    if (/[Zz]/.test(comando)) { if (atual) atual.fechado = true; continue; }
    const nums = [...trecho.slice(1).matchAll(/-?(?:\d+\.?\d*|\.\d+)/g)].map(n => +n[0]);
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const absoluto = comando === comando.toUpperCase();
      if (absoluto) { cx = nums[i]; cy = nums[i + 1]; }
      else { cx = arredonda(cx + nums[i]); cy = arredonda(cy + nums[i + 1]); }
      // Só um M inicia subpath; pares seguintes de um M são L implícitos.
      if (/[Mm]/.test(comando) && i === 0) { atual = { fechado: false, pontos: [] }; subpaths.push(atual); }
      atual.pontos.push([cx, cy]);
    }
  }
  return subpaths;
}

const arredonda = (v) => Math.round(v * 10) / 10;
const escreve = (v) => String(v).replace(/^0\./, ".").replace(/^-0\./, "-.");

function paraRelativo(subpaths) {
  return subpaths.map(({ fechado, pontos }) => {
    let [cx, cy] = pontos[0];
    const deltas = [];
    for (const [x, y] of pontos.slice(1)) {
      const dx = arredonda(x - cx), dy = arredonda(y - cy);
      deltas.push(`${escreve(dx)},${escreve(dy)}`);
      cx = arredonda(cx + dx); cy = arredonda(cy + dy);
    }
    return `M${escreve(cx = pontos[0][0])},${escreve(pontos[0][1])}` + (deltas.length ? `l${deltas.join(" ")}` : "") + (fechado ? "Z" : "");
  }).join("");
}

const origem = JSON.parse(fs.readFileSync(arquivo, "utf8"));
const antes = JSON.stringify(origem);

const municipalities = origem.municipalities.map(municipio => {
  const subpaths = lerSubpaths(municipio.path);
  const compacto = paraRelativo(subpaths);
  const conferencia = lerSubpaths(compacto);

  const iguais = subpaths.length === conferencia.length && subpaths.every((sub, i) =>
    sub.pontos.length === conferencia[i].pontos.length &&
    sub.pontos.every(([x, y], k) => x === conferencia[i].pontos[k][0] && y === conferencia[i].pontos[k][1]));
  if (!iguais) throw new Error(`Geometria de ${municipio.name} mudaria na reescrita. Nada foi gravado.`);

  return { ...municipio, path: compacto };
});

const depois = JSON.stringify({ ...origem, municipalities });
fs.writeFileSync(arquivo, depois);

const kb = (texto) => Math.round(zlib.gzipSync(texto).length / 1024);
console.log(`${municipalities.length} municípios conferidos, geometria idêntica.`);
console.log(`gzip: ${kb(antes)}KB -> ${kb(depois)}KB`);
