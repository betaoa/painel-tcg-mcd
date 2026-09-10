import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
function loadTs(file, modules = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  new Function('require', 'exports', outputText)(name => modules[name] || require(name), exports);
  return exports;
}
const data = loadTs('app/lib/dashboard-data.ts');
const selectors = loadTs('app/lib/revenue-selectors.ts', { './dashboard-data': data });
const assets = loadTs('app/lib/published-assets.ts');
const tcg = JSON.parse(fs.readFileSync(path.join(root, 'app/data/power-bi-revenue.json')));
const mcd = JSON.parse(fs.readFileSync(path.join(root, 'app/data/mcd-power-bi-revenue.json')));
const tcgRows = JSON.parse(fs.readFileSync(path.join(root, 'app/data/seed-data.json'))).rows;
const mcdRows = JSON.parse(fs.readFileSync(path.join(root, 'app/data/mcd-route.json'))).rows;
const retailers = JSON.parse(fs.readFileSync(path.join(root, 'app/data/top-varejista.json'))).stores;

test('MCD cannot consume TCG revenue or spreadsheet fallback', () => {
  assert.equal(selectors.hasRevenue(tcg, 'MCD'), false);
  assert.equal(selectors.hasRevenue(mcd, 'MCD'), false);
  for (const payload of [tcg, mcd]) {
    const [row] = selectors.allocateRevenue([{ ...mcdRows[0], abril: 9999999, maio: 5555555, junho: 42, media: 1 }], payload, 'MCD');
    assert.equal(row.revenueAvailable, false);
    for (const key of ['abril', 'maio', 'junho', 'media']) assert.equal(row[key], 0);
  }
});
test('TCG uses full CNPJ and never a network allocation', () => {
  const rows = selectors.allocateRevenue(tcgRows, tcg, 'TCG');
  const unique = [...new Map(rows.map(row => [row.cnpj, row])).values()];
  for (const row of unique) {
    assert.equal(row.abril, tcg.cnpjs.junho[row.cnpj] || 0);
    assert.equal(row.maio, tcg.cnpjs.julho[row.cnpj] || 0);
    assert.equal(row.junho, tcg.cnpjs.agosto[row.cnpj] || 0);
    assert.equal(row.media, (row.abril + row.maio + row.junho) / 3);
  }
  const unknown = selectors.allocateRevenue([{ ...tcgRows[0], cnpj: '99999999000199', abril: 5555 }], tcg, 'TCG')[0];
  assert.equal(unknown.abril, 0); assert.equal(unknown.revenueAvailable, false);
});
test('ABV central billing stays outside route and is not attributed to Dourados', () => {
  const billed = selectors.networkBilling(tcg, 'TCG', ['04757459'], new Set(tcgRows.map(row => row.cnpj)));
  const central = billed.find(row => row.cnpj === '04757459000519');
  assert.ok(central); assert.equal(central.inRoute, false); assert.equal(central.abril, 1135097.7);
  assert.ok(Math.abs(billed.reduce((sum, row) => sum + row.abril, 0) - 1134166.94) < .01);
  assert.ok(!selectors.filterOperationalRows(tcgRows, { city: 'Dourados', network: selectors.ALL, promoter: selectors.ALL, query: '' }).some(row => row.cnpj === central.cnpj));
});
test('one normalized city scope feeds promoters, stores and networks for both branches', () => {
  for (const rows of [tcgRows, mcdRows]) {
    for (const city of new Set(rows.map(row => row.cidade))) {
      const normalizedCity = city.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const filtered = selectors.filterOperationalRows(rows, { city: normalizedCity, network: selectors.ALL, promoter: selectors.ALL, query: '' });
      assert.ok(filtered.length > 0, city);
      assert.ok(filtered.every(row => data.normalizeKey(row.cidade) === data.normalizeKey(city)));
    }
  }
});
test('formatted CNPJ searches find exact stores without confusing punctuation', () => {
  const row = tcgRows[0];
  const filtered = selectors.filterOperationalRows(tcgRows, { city: selectors.ALL, network: selectors.ALL, promoter: selectors.ALL, query: data.formatCnpj(row.cnpj) });
  assert.ok(filtered.length); assert.ok(filtered.every(result => result.cnpj === row.cnpj));
});
test('retailer colors follow the actual latest audit, not registration approval', () => {
  const counts = { approved: 0, rejected: 0, unread: 0, pending: 0 };
  retailers.forEach(store => counts[selectors.readingState(store).group]++);
  assert.deepEqual(counts, { approved: 4, rejected: 9, unread: 16, pending: 2 });
  assert.equal(selectors.readingState({ latestCollection: { auditStatus: 'Reprovada' } }).group, 'rejected');
});
test('negative and missing revenue never creates NaN map geometry', () => {
  for (const value of [-100000, 0, 10, 100000]) assert.ok(Number.isFinite(selectors.markerRadius(value, 3, 100000)));
});
test('original panel scripts are parseable, assets exist and uploads do not 404 by construction', () => {
  const html = fs.readFileSync(path.join(root, 'public/loja-perfeita.html'), 'utf8');
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) if (match[1].trim()) new vm.Script(match[1]);
  for (const script of ['loja-publicar.js', 'loja-pdv-cnpj.js']) new vm.Script(fs.readFileSync(path.join(root, 'public', script), 'utf8'));
  assert.ok(fs.existsSync(path.join(root, 'public/enviar.html')));
  assert.ok(fs.existsSync(path.join(root, 'public/fonts/fonts.css')));
  assert.ok(fs.existsSync(path.join(root, 'public/vendor/pdf.worker.min.js')));
  assert.match(html, /getDocument\(\{data:buf,isEvalSupported:false/);
  assert.match(html, /href="\/enviar.html" target="_top"/);
  assert.match(html, /embedded \.app\{display:block\}/);
});
test('explicit PDV crosswalk links original tasks to complete CNPJs', () => {
  const context = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(root, 'public/loja-pdv-cnpj.js'), 'utf8'), context);
  for (const [code, cnpj] of Object.entries(context.window.LOJA_PDV_CNPJ)) {
    assert.match(cnpj, /^\d{14}$/); assert.ok(tcgRows.some(row => row.cnpj === cnpj), code);
  }
  assert.equal(context.window.LOJA_PDV_CNPJ['9000438'], '04757459000438');
});
test('shared reports remove personal columns and preserve quoted CSV values', () => {
  const result = assets.sanitizeReport('Rótulo;Tipo de Coleta;Ponto de Venda;Responsável;Status;CPF;Telefone\n"Ciclo 1";Share;"Loja; Centro";Equipe;Respondida;12345678901;99999');
  assert.equal(result.linhas, 1); assert.match(result.csv, /"Loja; Centro"/);
  assert.doesNotMatch(result.csv, /12345678901|99999|Telefone|CPF/);
  assert.throws(() => assets.sanitizeReport('CNPJ;Faturamento\n1;20'));
});

function mockStorage() {
  const records = new Map(), objects = new Map();
  const DB = {
    prepare(sql) { let args; return { bind(...values) { args = values; return this; }, async first() { return records.get(args[0]) || null; }, async run() { const [key, name, quem, objectKey, parts, complete, quando] = args; records.set(key, { key, name, quem, objectKey, parts, complete, quando }); return { success: true }; } }; },
    async batch(operations) { return Promise.all(operations.map(operation => operation.run())); }
  };
  const BUCKET = {
    async put(key, value) { objects.set(key, typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value)); },
    async get(key) { const bytes = objects.get(key); return bytes ? { body: bytes, async text() { return new TextDecoder().decode(bytes); } } : null; },
    async head(key) { return objects.has(key) ? { size: objects.get(key).length } : null; }
  };
  const modules = { '@/app/lib/published-assets': { ...assets, getAssetStorage: async () => ({ DB, BUCKET }) } };
  return { records, objects, fotos: loadTs('app/api/public/fotos/route.ts', modules), dados: loadTs('app/api/public/dados/route.ts', modules) };
}
const post = (route, query, body, json = true) => new Request(`https://dashboard.test/api/public/${route}${query}`, { method: 'POST', headers: { origin: 'https://dashboard.test', 'content-type': json ? 'application/json' : 'application/octet-stream' }, body: body === undefined ? undefined : json ? JSON.stringify(body) : body });
test('photos commit only after all chunks; old version remains readable', async () => {
  const storage = mockStorage(), api = storage.fotos;
  storage.records.set('loja_perfeita_fotos', { key: 'loja_perfeita_fotos', complete: 1, parts: 1, objectKey: 'loja-perfeita/fotos/previous', quando: Date.now(), name: 'previous.pdf', quem: 'Equipe' });
  const started = await api.POST(post('fotos', '?acao=iniciar', { nome: 'novo.pdf', quem: 'Equipe', partes: 2 }));
  assert.equal(started.status, 200); const { id } = await started.json();
  const chunk = new Uint8Array(3 * 1024 * 1024); chunk.set(new TextEncoder().encode('%PDF-1.7'));
  assert.equal((await api.POST(post('fotos', `?envio=${id}&parte=0`, chunk, false))).status, 200);
  assert.equal((await api.POST(post('fotos', `?envio=${id}&acao=concluir`, undefined, false))).status, 409);
  assert.equal(storage.records.get('loja_perfeita_fotos').name, 'previous.pdf');
  assert.equal((await api.POST(post('fotos', `?envio=${id}&parte=1`, new TextEncoder().encode('%%EOF'), false))).status, 200);
  assert.equal((await api.POST(post('fotos', `?envio=${id}&acao=concluir`, undefined, false))).status, 200);
  assert.equal(storage.records.get('loja_perfeita_fotos').name, 'novo.pdf');
  const response = await api.GET(new Request(`https://dashboard.test/api/public/fotos?versao=${id}&parte=1`));
  assert.equal(await response.text(), '%%EOF');
});
test('invalid report or cross-site write cannot replace the current report', async () => {
  const { dados, records, objects } = mockStorage();
  const csv = 'Rótulo;Tipo de Coleta;Ponto de Venda;Responsável;Status\nCiclo 1;Share;Loja;Equipe;Respondida';
  assert.equal((await dados.POST(post('dados', '', { csv, nome: 'daily.csv', quem: 'Equipe' }))).status, 200);
  const previous = records.get('loja_perfeita_dados').objectKey;
  assert.equal((await dados.POST(post('dados', '', { csv: 'Bad;Header\n1;2', quem: 'Equipe' }))).status, 400);
  assert.equal(records.get('loja_perfeita_dados').objectKey, previous);
  assert.ok(objects.has(previous));
  const cross = new Request('https://dashboard.test/api/public/dados', { method: 'POST', headers: { origin: 'https://other.test' }, body: '{}' });
  assert.equal((await dados.POST(cross)).status, 403);
});
