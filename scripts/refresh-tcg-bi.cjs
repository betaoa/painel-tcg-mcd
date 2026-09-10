const fs = require('node:fs');
const crypto = require('node:crypto');
const XLSX = require('xlsx');

const files = process.argv.slice(2);
if (files.length !== 3) throw new Error('Informe as exportações BI de junho, julho e agosto, nessa ordem.');
const target = 'app/data/power-bi-revenue.json';
const payload = JSON.parse(fs.readFileSync(target, 'utf8'));
const evidence = {};
for (const [index, month] of ['junho', 'julho', 'agosto'].entries()) {
  const bytes = fs.readFileSync(files[index]);
  const workbook = XLSX.read(bytes);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
  const filters = rows.find(row => String(row.Filial).startsWith('Filtros aplicados:'))?.Filial;
  for (const required of ['FILIAL é TCG', `Mês é ${month}`, 'Ano é 2026', 'razao_for é MONDELEZ']) {
    if (!filters?.split(/\r?\n/).includes(required)) throw new Error(`Filtro ausente: ${required}`);
  }
  const map = {};
  for (const row of rows) {
    if (!/^\d{14}$/.test(String(row.CNPJ))) continue;
    if (row.Filial !== 'TCG') throw new Error('Filial inválida');
    if (row.Faturado == null && Number.isFinite(row.Carteira)) continue;
    if (!Number.isFinite(row.Faturado)) throw new Error('Medida inválida');
    if (Object.hasOwn(map, row.CNPJ)) throw new Error('CNPJ duplicado na exportação');
    map[row.CNPJ] = row.Faturado;
  }
  const total = rows.find(row => row.Filial === 'Total')?.Faturado;
  const sum = Object.values(map).reduce((a, b) => a + b, 0);
  if (!Number.isFinite(total) || Math.abs(total - sum) > .01) throw new Error('Total não reconciliado');
  payload.cnpjs[month] = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
  payload.totals[month] = Math.round(sum * 100) / 100;
  payload.meta.sourceRows[month] = Object.keys(map).length;
  evidence[month] = { filters, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), rows: Object.keys(map).length, total: payload.totals[month] };
}
payload.meta.updatedAt = '07/09/2026';
payload.meta.modelUpdatedAt = '06/09/2026';
payload.meta.evidence = evidence;
fs.writeFileSync(target, JSON.stringify(payload, null, 2) + '\n');
console.log(JSON.stringify({ totals: payload.totals, sourceRows: payload.meta.sourceRows }));

// A reconciliação acima precisa da exportação inteira. Só depois dela o arquivo é
// reduzido aos CNPJs que o painel consegue exibir, para não servir o faturamento
// das outras praças a quem abre o site.
require('node:child_process').execFileSync(process.execPath, [require('node:path').join(__dirname, 'enxuga-bi.mjs')], { stdio: 'inherit' });
