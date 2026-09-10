export type MetricMonth = "abril" | "maio" | "junho" | "media";

export type RouteRow = {
  id: string;
  promotor: string;
  vendedor: string;
  cnpj: string;
  cnpjFormatado: string;
  razaoSocial: string;
  loja: string;
  cidade: string;
  diaVisita: string;
  rede: string;
  abril: number;
  maio: number;
  junho: number;
  media: number;
  filial?: "TCG" | "MCD";
  enderecoComercial?: string;
  diasVisita?: string[];
  frequencia?: number;
  redeConfianca?: string;
  fonteFaturamento?: string;
  junhoConfianca?: "confirmado" | "estimado" | "sem_confirmacao";
};

export type DashboardPayload = {
  meta: {
    source: string;
    generatedAt: string;
    rows: number;
    privacy: string;
  };
  rows: RouteRow[];
};

export const MONTH_LABELS: Record<MetricMonth, string> = {
  abril: "Abril",
  maio: "Maio",
  junho: "Junho",
  media: "Média 90 dias",
};

export const POWER_BI_URL =
  "https://app.powerbi.com/groups/me/reports/4ebb78b4-981f-4e4a-88c9-940c7985ee18/5a165a90a93bd330c80f?experience=power-bi&clientSideAuth=0";

export const normalizeText = (value: unknown) =>
  value === null || value === undefined ? "" : String(value).trim();

export const normalizeKey = (value: unknown) =>
  normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("pt-BR")
    .replace(/\s+/g, " ");

export const normalizeCnpj = (value: unknown) => {
  const digits = normalizeText(value).replace(/\D/g, "");
  if (!digits) return "";
  const normalized = digits.padStart(14, "0").slice(-14);
  return /^0{14}$/.test(normalized) ? "" : normalized;
};

export const formatCnpj = (value: string) => {
  const digits = normalizeCnpj(value);
  if (!digits) return "";
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
};

export const formatMoney = (value: number, compact = false) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  }).format(Number.isFinite(value) ? value : 0);

export const formatNumber = (value: number, maximumFractionDigits = 0) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits }).format(
    Number.isFinite(value) ? value : 0,
  );

export const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  "AGUA CLARA": { lat: -20.4481, lon: -52.8781 },
  AMAMBAI: { lat: -23.1042, lon: -55.2258 },
  ANASTACIO: { lat: -20.4836, lon: -55.8069 },
  ANAURILANDIA: { lat: -22.1875, lon: -52.7178 },
  AQUIDAUANA: { lat: -20.4711, lon: -55.7872 },
  BATAGUASSU: { lat: -21.7142, lon: -52.4222 },
  BATAYPORA: { lat: -22.2953, lon: -53.2711 },
  BATAIPORA: { lat: -22.2953, lon: -53.2711 },
  BONITO: { lat: -21.1211, lon: -56.4819 },
  "CAMPO GRANDE": { lat: -20.4428, lon: -54.6464 },
  CORUMBA: { lat: -19.0092, lon: -57.6533 },
  "COSTA RICA": { lat: -18.5439, lon: -53.1292 },
  COXIM: { lat: -18.5067, lon: -54.76 },
  DEODAPOLIS: { lat: -22.2756, lon: -54.165 },
  DOURADOS: { lat: -22.2211, lon: -54.8056 },
  "FATIMA DO SUL": { lat: -22.3742, lon: -54.5139 },
  ITAPORA: { lat: -22.0789, lon: -54.7894 },
  JARDIM: { lat: -21.4803, lon: -56.1381 },
  LADARIO: { lat: -19.0047, lon: -57.6017 },
  MARACAJU: { lat: -21.6144, lon: -55.1683 },
  MIRANDA: { lat: -20.2406, lon: -56.3783 },
  NAVIRAI: { lat: -23.065, lon: -54.1906 },
  "NOVA ALVORADA DO SUL": { lat: -21.4658, lon: -54.3839 },
  "NOVA ANDRADINA": { lat: -22.2333, lon: -53.3431 },
  "NOVA CASA VERDE": { lat: -21.878, lon: -53.54 },
  PARANAIBA: { lat: -19.6772, lon: -51.1908 },
  "PONTA PORA": { lat: -22.5361, lon: -55.7256 },
  "RIBAS DO RIO PARDO": { lat: -20.4431, lon: -53.7592 },
  SIDROLANDIA: { lat: -20.9319, lon: -54.9614 },
  SONORA: { lat: -17.5769, lon: -54.7578 },
  "TRES LAGOAS": { lat: -20.7511, lon: -51.6783 },
  VICENTINA: { lat: -22.4092, lon: -54.4356 },
};

export const STATE_OUTLINE = [
  [-57.75, -17.62],
  [-56.3, -17.55],
  [-54.9, -17.67],
  [-53.95, -17.96],
  [-52.75, -18.3],
  [-51.45, -18.86],
  [-51.02, -20.05],
  [-51.42, -21.2],
  [-52.1, -21.88],
  [-52.72, -22.72],
  [-53.62, -23.83],
  [-55.15, -24.02],
  [-56.38, -23.75],
  [-57.08, -22.62],
  [-57.86, -21.33],
  [-57.58, -19.6],
] as const;

export function metricByStore(rows: RouteRow[], month: MetricMonth) {
  const stores = new Map<string, RouteRow>();
  for (const row of rows) {
    const key = row.cnpj || `${normalizeKey(row.loja)}-${normalizeKey(row.cidade)}`;
    if (!stores.has(key)) stores.set(key, row);
  }
  return [...stores.values()].reduce((sum, row) => sum + Number(row[month] || 0), 0);
}

export function uniqueStores(rows: RouteRow[]) {
  return new Set(rows.map((row) => row.cnpj || `${row.loja}-${row.cidade}`)).size;
}
