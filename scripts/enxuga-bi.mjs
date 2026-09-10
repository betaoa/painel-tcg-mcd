/**
 * Reduz os arquivos de faturamento aos CNPJs que o painel realmente consegue exibir.
 *
 * A exportação do Power BI vem com a filial inteira. O painel só mostra CNPJ do
 * roteiro de MS (cruzamento exato) e CNPJ que divide a raiz de oito dígitos com
 * alguma rede do roteiro (o detalhe "fora do roteiro" da página de redes).
 * Todo o resto é faturamento de outras praças que nunca aparece na tela e mesmo
 * assim era baixado por quem abre o site.
 *
 * `totals` continua sendo o total da filial exportada, como o BI entregou, e a
 * evidência de conferência fica intacta em `meta.evidence`.
 *
 * ATENÇÃO: rode sempre a partir de uma exportação completa. Depois do recorte os
 * CNPJs de fora não voltam; se o roteiro ganhar lojas, rode scripts/refresh-tcg-bi.cjs
 * de novo com as planilhas originais.
 *
 *   node scripts/enxuga-bi.mjs
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const raiz = path.join(import.meta.dirname, "..");
const ler = (relativo) => JSON.parse(fs.readFileSync(path.join(raiz, relativo), "utf8"));
const digitos = (valor) => String(valor || "").replace(/\D/g, "");

const doRoteiro = new Set();
for (const arquivo of ["app/data/seed-data.json", "app/data/mcd-route.json"]) {
  for (const linha of ler(arquivo).rows || []) {
    const cnpj = digitos(linha.cnpj);
    if (cnpj.length === 14) doRoteiro.add(cnpj);
  }
}
const raizes = new Set([...doRoteiro].map(cnpj => cnpj.slice(0, 8)));
const mantem = (cnpj) => doRoteiro.has(cnpj) || raizes.has(cnpj.slice(0, 8));

if (!doRoteiro.size) throw new Error("Nenhum CNPJ lido dos roteiros. Nada foi gravado.");

for (const relativo of ["app/data/power-bi-revenue.json", "app/data/mcd-power-bi-revenue.json"]) {
  const arquivo = path.join(raiz, relativo);
  const payload = ler(relativo);
  if (!payload.cnpjs) { console.log(`${relativo}: sem série por CNPJ, nada a fazer.`); continue; }

  const antes = JSON.stringify(payload);
  const todos = new Set(Object.values(payload.cnpjs).flatMap(mes => Object.keys(mes)));

  for (const mes of Object.keys(payload.cnpjs)) {
    payload.cnpjs[mes] = Object.fromEntries(Object.entries(payload.cnpjs[mes]).filter(([cnpj]) => mantem(cnpj)));
  }

  const restantes = new Set(Object.values(payload.cnpjs).flatMap(mes => Object.keys(mes)));
  payload.meta = {
    ...payload.meta,
    scopeFilter: {
      criterio: "CNPJ do roteiro ou mesma raiz de oito dígitos de uma rede do roteiro",
      mantidos: restantes.size,
      removidos: todos.size - restantes.size,
    },
  };

  const depois = JSON.stringify(payload, null, 2) + "\n";
  fs.writeFileSync(arquivo, depois);
  const kb = (texto) => Math.round(zlib.gzipSync(texto).length / 1024);
  console.log(`${relativo}: ${todos.size} -> ${restantes.size} CNPJs (${todos.size - restantes.size} fora do alcance do painel), gzip ${kb(antes)}KB -> ${kb(depois)}KB`);
}

const semFaturamento = [...doRoteiro].filter(cnpj =>
  !["app/data/power-bi-revenue.json", "app/data/mcd-power-bi-revenue.json"]
    .some(relativo => Object.values(ler(relativo).cnpjs || {}).some(mes => Object.hasOwn(mes, cnpj))));
console.log(`${semFaturamento.length} CNPJs do roteiro seguem sem linha no BI. Isso não significa venda zero.`);
