import { normalizeCnpj, normalizeKey, type RouteRow } from "./dashboard-data";

export type Branch = "TCG" | "MCD";
// Legacy route keys are kept only as storage slots. Their values are always replaced from BI.
export type Period = "abril" | "maio" | "junho" | "media";
export const BI_MONTHS = ["junho", "julho", "agosto"] as const;
export type BiMonth = typeof BI_MONTHS[number];
export type RevenuePayload = {
  meta: { branch: string; supplier: string; updatedAt: string; scope: string; source: string; status?: string; uf?: string; period?: string; completeness?: string };
  totals: Record<BiMonth, number | null>;
  cnpjs?: Record<BiMonth, Record<string, number>>;
};
export type OperationalRow = RouteRow & { revenueAvailable?: boolean; revenueMonths?: BiMonth[] };
export type Scope = { city: string; network: string; promoter: string; query: string };
export const ALL = "__all__";

export function hasRevenue(payload: RevenuePayload, branch: Branch) {
  return payload.meta.branch === branch && payload.meta.supplier === "MONDELEZ"
    && ["snapshot", "verified"].includes(payload.meta.status || "")
    && BI_MONTHS.every(month => payload.cnpjs?.[month] && Number.isFinite(payload.totals[month]));
}

export function allocateRevenue<T extends OperationalRow>(rows: T[], payload: RevenuePayload, branch: Branch): T[] {
  const usable = hasRevenue(payload, branch);
  return rows.map(row => {
    const key = normalizeCnpj(row.cnpj);
    const months = usable && key ? BI_MONTHS.filter(month => Object.hasOwn(payload.cnpjs?.[month] || {}, key)) : [];
    const read = (month: BiMonth) => usable && key ? Number(payload.cnpjs?.[month]?.[key] || 0) : 0;
    const abril = read("junho"), maio = read("julho"), junho = read("agosto");
    return { ...row, abril, maio, junho, media: (abril + maio + junho) / 3,
      revenueAvailable: months.length > 0, revenueMonths: [...months],
      fonteFaturamento: !usable ? `Aguardando exportação autorizada do Power BI ${branch} MS`
        : months.length ? `Exportação Power BI ${branch} • CNPJ exato • sem rateio entre lojas`
        : "CNPJ sem linha na exportação disponível do BI. Não significa venda zero.",
    };
  });
}

export function filterOperationalRows<T extends OperationalRow>(rows: T[], scope: Scope): T[] {
  const query = normalizeKey(scope.query);
  const digits = scope.query.replace(/\D/g, "");
  return rows.filter(row => {
    if (scope.city !== ALL && normalizeKey(row.cidade) !== normalizeKey(scope.city)) return false;
    if (scope.network !== ALL && normalizeKey(row.rede) !== normalizeKey(scope.network)) return false;
    if (scope.promoter !== ALL && normalizeKey(row.promotor) !== normalizeKey(scope.promoter)) return false;
    return !query || [row.loja, row.razaoSocial, row.cidade, row.rede, row.promotor].some(value => normalizeKey(value).includes(query))
      || (digits.length >= 3 && normalizeCnpj(row.cnpj).includes(digits));
  });
}

export function readingState(store: { latestCollection: null | { auditStatus: string } }) {
  if (!store.latestCollection) return { group: "unread" as const, label: "Sem leitura" };
  const status = normalizeKey(store.latestCollection.auditStatus);
  if (status.includes("REPROV")) return { group: "rejected" as const, label: "Reprovada" };
  if (status === "APROVADA" || status === "APROVADO") return { group: "approved" as const, label: "Aprovada" };
  return { group: "pending" as const, label: "Em aprovação" };
}

export function markerRadius(value: number, cnpjs: number, maxVolume: number) {
  return 3.3 + Math.sqrt(Math.max(0, value > 0 ? value : cnpjs) / Math.max(1, maxVolume)) * 7;
}

export function networkBilling(payload: RevenuePayload, branch: Branch, roots: string[], routeCnpjs: Set<string>) {
  if (!hasRevenue(payload, branch)) return [];
  const cnpjs = new Set(BI_MONTHS.flatMap(month => Object.keys(payload.cnpjs?.[month] || {})));
  return [...cnpjs].filter(cnpj => roots.includes(cnpj.slice(0, 8))).map(cnpj => {
    const abril = payload.cnpjs?.junho[cnpj] || 0, maio = payload.cnpjs?.julho[cnpj] || 0, junho = payload.cnpjs?.agosto[cnpj] || 0;
    return { cnpj, inRoute: routeCnpjs.has(cnpj), abril, maio, junho, media: (abril + maio + junho) / 3 };
  });
}
