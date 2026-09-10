"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  CircleGauge,
  Database,
  FileSpreadsheet,
  MapPin,
  RefreshCcw,
  Route,
  Search,
  ShieldCheck,
  Store,
  TrendingUp,
  Upload,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast, Toaster } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import municipalityPayload from "@/app/data/ms-municipalities.json";
import biRevenuePayload from "@/app/data/power-bi-revenue.json";
import seedPayload from "@/app/data/seed-data.json";
import {
  CITY_COORDS,
  DashboardPayload,
  formatCnpj,
  formatMoney,
  formatNumber,
  MetricMonth,
  metricByStore,
  MONTH_LABELS,
  normalizeCnpj,
  normalizeKey,
  normalizeText,
  POWER_BI_URL,
  RouteRow,
  uniqueStores,
} from "@/app/lib/dashboard-data";

const seed = seedPayload as DashboardPayload;
const ALL = "__all__";
const STORAGE_KEY = "tcg-ms-intelligence-safe-data-v1";
type BiMonth = "junho" | "julho" | "agosto";
type BiRevenuePayload = {
  meta: { branch: string; supplier: string; updatedAt: string; scope: string; source: string };
  totals: Record<BiMonth, number>;
  unclassified: Record<BiMonth, number>;
  networks: Record<BiMonth, Record<string, number>>;
};
const biRevenue = biRevenuePayload as BiRevenuePayload;
const BI_NETWORKS = Object.fromEntries(
  (Object.keys(biRevenue.networks) as BiMonth[]).map((month) => [
    month,
    new Map(Object.entries(biRevenue.networks[month]).map(([name, value]) => [normalizeKey(name), value])),
  ]),
) as Record<BiMonth, Map<string, number>>;
const BI_REVENUE = {
  branch: biRevenue.meta.branch,
  supplier: biRevenue.meta.supplier,
  updatedAt: biRevenue.meta.updatedAt,
  months: [
    { label: "Junho", value: biRevenue.totals.junho },
    { label: "Julho", value: biRevenue.totals.julho },
    { label: "Agosto", value: biRevenue.totals.agosto },
  ],
};
const BI_SLOT_LABELS: Record<MetricMonth, string> = {
  abril: "Junho",
  maio: "Julho",
  junho: "Agosto",
  media: "Média 3 meses",
};
type DataMode = "faturamento" | "sellout";

type MunicipalityShape = {
  id: string;
  name: string;
  path: string;
  cx: number;
  cy: number;
};

const msMap = municipalityPayload as {
  source: string;
  viewBox: [number, number, number, number];
  bounds: [number, number, number, number];
  padding: number;
  municipalities: MunicipalityShape[];
};

type AggregatedCity = {
  city: string;
  visits: number;
  stores: number;
  promoters: number;
  sellout: number;
  networks: number;
  rows: RouteRow[];
};

type AggregatedPromoter = {
  name: string;
  visits: number;
  stores: number;
  cnpjs: number;
  cities: number;
  cityNames: string[];
  networks: number;
  networkNames: string[];
  sellout: number;
  frequency: number;
  rows: RouteRow[];
};

type AggregatedNetwork = {
  name: string;
  visits: number;
  cnpjs: number;
  cities: number;
  promoters: number;
  sellout: number;
};

type RevenueAuditStatus = "confirmado" | "estimado" | "sem_confirmacao";
type RevenueAudit = {
  name: string;
  cnpjs: number;
  cities: number;
  excelJune: number;
  biJune: number | null;
  biJuly: number | null;
  biAugust: number | null;
  biAverage: number | null;
  delta: number | null;
  status: RevenueAuditStatus;
};

function getBiNetworkValues(network: string) {
  const key = normalizeKey(network);
  const values = {
    junho: BI_NETWORKS.junho.get(key),
    julho: BI_NETWORKS.julho.get(key),
    agosto: BI_NETWORKS.agosto.get(key),
  };
  const linked = Object.values(values).some((value) => value !== undefined);
  return { key, values, linked };
}

function auditStatus(excelJune: number, biJune: number | null, linked: boolean): RevenueAuditStatus {
  if (!linked || biJune === null) return "sem_confirmacao";
  const tolerance = Math.max(100, Math.abs(biJune) * 0.01);
  return Math.abs(excelJune - biJune) <= tolerance ? "confirmado" : "estimado";
}

function buildRevenueAudit(rows: RouteRow[]): RevenueAudit[] {
  const grouped = new Map<string, RouteRow[]>();
  for (const row of uniqueCnpjRows(rows)) {
    const current = grouped.get(row.rede) || [];
    current.push(row);
    grouped.set(row.rede, current);
  }

  return [...grouped.entries()].map(([name, stores]) => {
    const { values, linked } = getBiNetworkValues(name);
    const excelJune = stores.reduce((sum, row) => sum + Number(row.junho || 0), 0);
    const biJune = linked ? values.junho ?? 0 : null;
    const biJuly = linked ? values.julho ?? 0 : null;
    const biAugust = linked ? values.agosto ?? 0 : null;
    return {
      name,
      cnpjs: stores.length,
      cities: new Set(stores.map((row) => row.cidade)).size,
      excelJune,
      biJune,
      biJuly,
      biAugust,
      biAverage: linked ? ((biJune || 0) + (biJuly || 0) + (biAugust || 0)) / 3 : null,
      delta: biJune === null ? null : biJune - excelJune,
      status: auditStatus(excelJune, biJune, linked),
    };
  }).sort((a, b) => {
    const order: Record<RevenueAuditStatus, number> = { estimado: 0, sem_confirmacao: 1, confirmado: 2 };
    return order[a.status] - order[b.status] || Math.abs(b.delta || 0) - Math.abs(a.delta || 0);
  });
}

function allocateBiRevenueByNetwork(rows: RouteRow[]) {
  const storesByNetwork = new Map<string, RouteRow[]>();
  for (const row of uniqueCnpjRows(rows)) {
    const key = normalizeKey(row.rede);
    const current = storesByNetwork.get(key) || [];
    current.push(row);
    storesByNetwork.set(key, current);
  }

  const valueByCnpj = new Map<string, {
    abril: number;
    maio: number;
    junho: number;
    media: number;
    status: RevenueAuditStatus;
  }>();
  for (const [key, stores] of storesByNetwork) {
    const linked = (["junho", "julho", "agosto"] as BiMonth[]).some((month) => BI_NETWORKS[month].has(key));
    const status: RevenueAuditStatus = linked ? "estimado" : "sem_confirmacao";
    const historicWeights = stores.map((row) => Math.max(0, (Number(row.abril || 0) + Number(row.maio || 0) + Number(row.junho || 0)) / 3));
    const historicTotal = historicWeights.reduce((sum, value) => sum + value, 0);
    const weights = historicTotal > 0 ? historicWeights : stores.map(() => 1);
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    stores.forEach((row, index) => {
      const share = weights[index] / totalWeight;
      const junho = linked ? (BI_NETWORKS.junho.get(key) ?? 0) * share : 0;
      const julho = linked ? (BI_NETWORKS.julho.get(key) ?? 0) * share : 0;
      const agosto = linked ? (BI_NETWORKS.agosto.get(key) ?? 0) * share : 0;
      valueByCnpj.set(row.cnpj || row.id, {
        abril: junho,
        maio: julho,
        junho: agosto,
        media: (junho + julho + agosto) / 3,
        status,
      });
    });
  }

  return rows.map((row) => {
    const reconciliation = valueByCnpj.get(row.cnpj || row.id);
    if (!reconciliation) return row;
    return {
      ...row,
      abril: reconciliation.abril,
      maio: reconciliation.maio,
      junho: reconciliation.junho,
      media: reconciliation.media,
      junhoConfianca: reconciliation.status,
    };
  });
}

function rowsToObjects(sheet: XLSX.WorkSheet | undefined) {
  if (!sheet) return [] as Record<string, unknown>[];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
  });
}

function parseWorkbook(buffer: ArrayBuffer): RouteRow[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const routeSheet = workbook.Sheets.Roteiro;
  if (!routeSheet) throw new Error('A aba "Roteiro" não foi encontrada.');

  const routeRows = rowsToObjects(routeSheet);
  if (!routeRows.length) throw new Error("A aba Roteiro está vazia.");

  const headers = new Set(Object.keys(routeRows[0]).map(normalizeKey));
  const required = ["PROMOTOR", "CIDADE", "DIA DA VISITA", "CNPJ"];
  const missing = required.filter((header) => !headers.has(header));
  if (missing.length) {
    throw new Error(`Colunas ausentes: ${missing.join(", ")}.`);
  }

  const networkRows = rowsToObjects(workbook.Sheets["Lojas 2026"]);
  const networkByCnpj = new Map<string, string>();
  let currentNetwork = "Sem rede definida";
  for (const row of networkRows) {
    if (normalizeText(row.Rede)) currentNetwork = normalizeText(row.Rede);
    const cnpj = normalizeCnpj(row.CNPJ);
    if (cnpj) networkByCnpj.set(cnpj, currentNetwork);
  }

  return routeRows
    .filter((row) => normalizeText(row.Promotor) && normalizeText(row.Cidade))
    .map((row, index) => {
      const cnpj = normalizeCnpj(row.CNPJ || row["CNPJ Limpo"]);
      return {
        id: `${cnpj}-${normalizeText(row["Dia da Visita"])}-${index}`,
        promotor: normalizeText(row.Promotor),
        vendedor: normalizeText(row.Vendedor),
        cnpj,
        cnpjFormatado: normalizeText(row.CNPJ),
        razaoSocial: normalizeText(row["Razão Social"]),
        loja:
          normalizeText(row["Nome Fantasia"]) ||
          normalizeText(row["Razão Social"]) ||
          "Loja sem nome",
        cidade: normalizeText(row.Cidade),
        diaVisita: normalizeText(row["Dia da Visita"]),
        rede: networkByCnpj.get(cnpj) || "Sem rede definida",
        abril: Number(row.Abril) || 0,
        maio: Number(row.Maio) || 0,
        junho: Number(row.Junho) || 0,
        media: Number(row.Média) || 0,
      };
    });
}

const municipalityAliases: Record<string, string> = {
  BATAYPORA: "BATAIPORA",
  "NOVA CASA VERDE": "NOVA ANDRADINA",
};

function municipalityKey(value: string) {
  const key = normalizeKey(value);
  return municipalityAliases[key] || key;
}

function projectCityPoint(lon: number, lat: number) {
  const [, , width, height] = msMap.viewBox;
  const [minLon, minLat, maxLon, maxLat] = msMap.bounds;
  const scale = Math.min(
    (width - msMap.padding * 2) / (maxLon - minLon),
    (height - msMap.padding * 2) / (maxLat - minLat),
  );
  const mapWidth = (maxLon - minLon) * scale;
  const mapHeight = (maxLat - minLat) * scale;
  return {
    x: (width - mapWidth) / 2 + (lon - minLon) * scale,
    y: (height - mapHeight) / 2 + (maxLat - lat) * scale,
  };
}

function buildCityAggregation(rows: RouteRow[], month: MetricMonth) {
  const grouped = new Map<string, RouteRow[]>();
  for (const row of rows) {
    const current = grouped.get(row.cidade) || [];
    current.push(row);
    grouped.set(row.cidade, current);
  }
  return [...grouped.entries()]
    .map(([city, cityRows]): AggregatedCity => ({
      city,
      visits: cityRows.length,
      stores: uniqueStores(cityRows),
      promoters: new Set(cityRows.map((row) => row.promotor)).size,
      sellout: metricByStore(cityRows, month),
      networks: new Set(cityRows.map((row) => row.rede)).size,
      rows: cityRows,
    }))
    .sort((a, b) => b.sellout - a.sellout);
}

function buildPromoterAggregation(rows: RouteRow[], month: MetricMonth) {
  const grouped = new Map<string, RouteRow[]>();
  for (const row of rows) {
    const current = grouped.get(row.promotor) || [];
    current.push(row);
    grouped.set(row.promotor, current);
  }
  return [...grouped.entries()]
    .map(([name, promoterRows]): AggregatedPromoter => {
      const stores = uniqueStores(promoterRows);
      const cityNames = [...new Set(promoterRows.map((row) => row.cidade))]
        .sort((a, b) => a.localeCompare(b, "pt-BR"));
      const networkNames = [...new Set(promoterRows.map((row) => row.rede))]
        .sort((a, b) => a.localeCompare(b, "pt-BR"));
      return {
        name,
        visits: promoterRows.length,
        stores,
        cnpjs: new Set(promoterRows.map((row) => row.cnpj).filter(Boolean)).size,
        cities: cityNames.length,
        cityNames,
        networks: networkNames.length,
        networkNames,
        sellout: metricByStore(promoterRows, month),
        frequency: stores ? promoterRows.length / stores : 0,
        rows: promoterRows,
      };
    })
    .sort((a, b) => b.sellout - a.sellout);
}

function buildNetworkAggregation(rows: RouteRow[], month: MetricMonth) {
  const grouped = new Map<string, RouteRow[]>();
  for (const row of rows) {
    const current = grouped.get(row.rede) || [];
    current.push(row);
    grouped.set(row.rede, current);
  }

  return [...grouped.entries()]
    .map(([name, networkRows]): AggregatedNetwork => ({
      name,
      visits: networkRows.length,
      cnpjs: new Set(networkRows.map((row) => row.cnpj || row.id)).size,
      cities: new Set(networkRows.map((row) => row.cidade)).size,
      promoters: new Set(networkRows.map((row) => row.promotor)).size,
      sellout: metricByStore(networkRows, month),
    }))
    .sort((a, b) => b.sellout - a.sellout || b.cnpjs - a.cnpjs);
}

function networkBreakdown(rows: RouteRow[]) {
  const grouped = new Map<string, Set<string>>();
  for (const row of rows) {
    const stores = grouped.get(row.rede) || new Set<string>();
    stores.add(row.cnpj || row.id);
    grouped.set(row.rede, stores);
  }
  return [...grouped.entries()]
    .map(([name, cnpjs]) => ({ name, cnpjs: cnpjs.size }))
    .sort((a, b) => b.cnpjs - a.cnpjs || a.name.localeCompare(b.name, "pt-BR"));
}

function uniqueCnpjRows(rows: RouteRow[]) {
  return [...new Map(rows.map((row) => [row.cnpj || row.id, row])).values()]
    .sort((a, b) => a.cidade.localeCompare(b.cidade, "pt-BR") || a.loja.localeCompare(b.loja, "pt-BR"));
}

function KpiCard({
  index,
  label,
  value,
  detail,
  icon: Icon,
  accent = false,
}: {
  index: string;
  label: string;
  value: string;
  detail: string;
  icon: typeof TrendingUp;
  accent?: boolean;
}) {
  return (
    <article className={`kpi-card ${accent ? "kpi-card-accent" : ""}`}>
      <span className="kpi-index">{index}</span>
      <div className="kpi-icon"><Icon size={17} /></div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </article>
  );
}

function MapScene({
  cities,
  selectedCity,
  onSelectCity,
  metricLabel,
}: {
  cities: AggregatedCity[];
  selectedCity: string;
  onSelectCity: (city: string) => void;
  metricLabel: string;
}) {
  const [hoveredCity, setHoveredCity] = useState("");
  const [hoveredMunicipality, setHoveredMunicipality] = useState("");
  const maximum = Math.max(...cities.map((city) => city.sellout), 1);
  const selectedMunicipality = municipalityKey(selectedCity);
  const labelCities = useMemo(() => {
    const ranked = [...cities]
      .filter((city) => CITY_COORDS[normalizeKey(city.city)])
      .sort((a, b) => b.sellout - a.sellout)
      .slice(0, 8);
    const selected = cities.find((city) => city.city === selectedCity);
    if (selected && !ranked.some((city) => city.city === selected.city)) ranked.push(selected);
    return ranked;
  }, [cities, selectedCity]);

  const coverageByMunicipality = useMemo(() => {
    const grouped = new Map<string, AggregatedCity[]>();
    for (const city of cities) {
      const key = municipalityKey(city.city);
      grouped.set(key, [...(grouped.get(key) || []), city]);
    }

    return new Map([...grouped.entries()].map(([key, territoryCities]) => {
      const rows = territoryCities.flatMap((city) => city.rows);
      return [key, {
        key,
        cities: territoryCities,
        visits: rows.length,
        stores: uniqueStores(rows),
        promoters: new Set(rows.map((row) => row.promotor)).size,
        sellout: territoryCities.reduce((sum, city) => sum + city.sellout, 0),
        networks: new Set(rows.map((row) => row.rede)).size,
      }] as const;
    }));
  }, [cities]);

  const focusedCity = cities.find((entry) => entry.city === hoveredCity)
    || cities.find((entry) => entry.city === selectedCity)
    || cities[0];
  const focusedTerritory = hoveredMunicipality
    ? coverageByMunicipality.get(hoveredMunicipality)
    : focusedCity ? coverageByMunicipality.get(municipalityKey(focusedCity.city)) : undefined;
  const focusedShape = msMap.municipalities.find(
    (municipality) => municipalityKey(municipality.name) === hoveredMunicipality,
  );
  const focusName = hoveredCity || (hoveredMunicipality ? focusedShape?.name : focusedCity?.city) || "Mato Grosso do Sul";
  const focusMetrics = hoveredCity && focusedCity?.city === hoveredCity ? focusedCity : focusedTerritory;

  return (
    <div className="map-shell">
      <div className="map-scan" aria-hidden="true" />
      <span className="map-coordinate map-coordinate-north">N 20°</span>
      <span className="map-coordinate map-coordinate-west">W 54°</span>
      <div className="map-glow map-glow-one" />
      <div className="map-glow map-glow-two" />
      <svg
        className="ms-map"
        viewBox={msMap.viewBox.join(" ")}
        role="img"
        aria-label="Mapa 3D com os 79 municípios de Mato Grosso do Sul e cidades atendidas"
      >
        <defs>
          <linearGradient id="mapSide" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0f3550" />
            <stop offset="0.5" stopColor="#071a2a" />
            <stop offset="1" stopColor="#02070d" />
          </linearGradient>
          <radialGradient id="mapFloor">
            <stop offset="0" stopColor="#35d7ff" stopOpacity="0.18" />
            <stop offset="0.58" stopColor="#143a58" stopOpacity="0.07" />
            <stop offset="1" stopColor="#02060b" stopOpacity="0" />
          </radialGradient>
          <filter id="mapShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="24" stdDeviation="20" floodColor="#000" floodOpacity="0.82" />
          </filter>
          <filter id="redGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#46f2ae" floodOpacity="0.9" />
          </filter>
        </defs>

        <g className="map-world" filter="url(#mapShadow)">
          <ellipse className="map-floor" cx="380" cy="584" rx="330" ry="62" fill="url(#mapFloor)" />

          <g className="map-depth" aria-hidden="true">
            {Array.from({ length: 8 }, (_, depth) => (
              <g key={depth} transform={`translate(0 ${25 - depth * 3.1})`}>
                {msMap.municipalities.map((municipality) => (
                  <path key={municipality.id} d={municipality.path} fill="url(#mapSide)" />
                ))}
              </g>
            ))}
          </g>

          <g className="municipality-layer">
            {msMap.municipalities.map((municipality) => {
              const key = municipalityKey(municipality.name);
              const coverage = coverageByMunicipality.get(key);
              const active = Boolean(coverage);
              const selected = selectedMunicipality === key;
              const intensity = coverage ? Math.max(0, Math.min(coverage.sellout / maximum, 1)) : 0;
              const fill = selected
                ? "#124859"
                : active
                  ? `hsl(199 68% ${15 + intensity * 10}%)`
                  : "#071421";
              return (
                <path
                  key={municipality.id}
                  d={municipality.path}
                  fill={fill}
                  className={`municipality ${active ? "municipality-covered" : ""} ${selected ? "municipality-selected" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${municipality.name}${active ? `, ${coverage?.promoters} promotores e ${coverage?.visits} visitas` : ", sem cobertura no roteiro"}`}
                  onMouseEnter={() => { setHoveredMunicipality(key); setHoveredCity(""); }}
                  onMouseLeave={() => setHoveredMunicipality("")}
                  onFocus={() => { setHoveredMunicipality(key); setHoveredCity(""); }}
                  onBlur={() => setHoveredMunicipality("")}
                  onClick={() => {
                    const candidate = coverage?.cities.find((entry) => entry.city === selectedCity) || coverage?.cities[0];
                    if (candidate) onSelectCity(candidate.city);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    const candidate = coverage?.cities[0];
                    if (candidate) onSelectCity(candidate.city);
                  }}
                />
              );
            })}
          </g>

          {cities.map((city) => {
            const coord = CITY_COORDS[normalizeKey(city.city)];
            if (!coord) return null;
            const point = projectCityPoint(coord.lon, coord.lat);
            const active = selectedCity === city.city;
            const radius = 3.5 + Math.sqrt(Math.max(city.sellout, 0) / maximum) * 5.5;
            const hasAssignedPromoter = city.rows.some((row) => normalizeKey(row.promotor) !== "SEM PROMOTOR");
            const markerStatus = !hasAssignedPromoter ? "unassigned" : city.sellout > 0 ? "with-sales" : "zero-sales";
            return (
              <g
                key={city.city}
                className={`map-marker map-marker-${markerStatus} ${active ? "map-marker-active" : ""}`}
                transform={`translate(${point.x} ${point.y})`}
                role="button"
                tabIndex={0}
                aria-label={`${city.city}, ${city.promoters} promotores, ${formatMoney(city.sellout)}`}
                onClick={() => onSelectCity(city.city)}
                onMouseEnter={() => { setHoveredCity(city.city); setHoveredMunicipality(""); }}
                onMouseLeave={() => setHoveredCity("")}
                onFocus={() => { setHoveredCity(city.city); setHoveredMunicipality(""); }}
                onBlur={() => setHoveredCity("")}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onSelectCity(city.city);
                }}
              >
                <circle className="map-marker-pulse" r={radius + 8} />
                <ellipse className="beacon-shadow" cy="6" rx={radius + 3} ry={radius * 0.55} />
                <circle className="beacon-core" r={radius} filter="url(#redGlow)" />
                <circle className="beacon-shine" cx={-radius * 0.28} cy={-radius * 0.3} r={Math.max(1.2, radius * 0.25)} />
                <title>{city.city}: {city.promoters} promotores, {city.visits} visitas, {formatMoney(city.sellout)}</title>
              </g>
            );
          })}

          <g className="map-label-layer" aria-hidden="true">
            {labelCities.map((city, index) => {
              const coord = CITY_COORDS[normalizeKey(city.city)];
              if (!coord) return null;
              const point = projectCityPoint(coord.lon, coord.lat);
              const anchor = point.x > msMap.viewBox[2] * 0.62 ? "end" : "start";
              const dx = anchor === "end" ? -11 : 11;
              const dy = index % 3 === 0 ? -11 : index % 3 === 1 ? 4 : 15;
              return (
                <text
                  key={city.city}
                  x={point.x}
                  y={point.y}
                  dx={dx}
                  dy={dy}
                  textAnchor={anchor}
                  className={city.city === selectedCity ? "map-city-label active" : "map-city-label"}
                >
                  {city.city}
                </text>
              );
            })}
          </g>
        </g>
      </svg>

      <div className="map-city-card" aria-live="polite">
        <span>{focusMetrics ? "Território com cobertura" : "Município sem roteiro"}</span>
        <strong>{focusName}</strong>
        <div className="map-city-metrics">
          <div><b>{formatNumber(focusMetrics?.promoters || 0)}</b><small>Promotores</small></div>
          <div><b>{formatNumber(focusMetrics?.visits || 0)}</b><small>Visitas</small></div>
          <div><b>{formatNumber(focusMetrics?.stores || 0)}</b><small>Lojas</small></div>
          <div><b>{formatMoney(focusMetrics?.sellout || 0, true)}</b><small>{metricLabel}</small></div>
        </div>
      </div>

      <div className="map-hud map-hud-left">
        <span><i className="hud-dot" /> Cobertura ativa</span>
        <strong>{cities.length}</strong>
        <small>cidades e distritos no roteiro</small>
      </div>
      <div className="map-hud map-hud-right">
        <span>Malha municipal oficial</span>
        <strong>79 municípios</strong>
        <small>IBGE 2025 • mapa interativo</small>
      </div>
    </div>
  );
}

export function Dashboard() {
  const [isMounted, setIsMounted] = useState(false);
  const [rows, setRows] = useState<RouteRow[]>(seed.rows);
  const [dataMode, setDataMode] = useState<DataMode>("faturamento");
  const [month, setMonth] = useState<MetricMonth>("media");
  const [promoter, setPromoter] = useState(ALL);
  const [city, setCity] = useState(ALL);
  const [network, setNetwork] = useState(ALL);
  const [query, setQuery] = useState("");
  const [detailPromoter, setDetailPromoter] = useState<AggregatedPromoter | null>(null);
  const [sourceName, setSourceName] = useState(seed.meta.source);
  const [updatedAt, setUpdatedAt] = useState("01/09/2026");
  const [isImporting, setIsImporting] = useState(false);
  const [showAllCities, setShowAllCities] = useState(false);
  const [showAllNetworks, setShowAllNetworks] = useState(false);
  const [showAllPromoters, setShowAllPromoters] = useState(false);
  const [showFullAudit, setShowFullAudit] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const analysisRows = useMemo(
    () => dataMode === "faturamento" ? allocateBiRevenueByNetwork(rows) : rows,
    [rows, dataMode],
  );
  const periodLabels = dataMode === "faturamento" ? BI_SLOT_LABELS : MONTH_LABELS;
  const metricName = dataMode === "faturamento" ? "Faturamento" : "Sell-out";
  const revenueAudit = useMemo(() => buildRevenueAudit(rows), [rows]);
  const confirmedNetworkCount = revenueAudit.filter((item) => item.status === "confirmado").length;
  const estimatedNetworkCount = revenueAudit.filter((item) => item.status === "estimado").length;
  const unlinkedNetworkCount = revenueAudit.filter((item) => item.status === "sem_confirmacao").length;

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { rows: RouteRow[]; sourceName: string; updatedAt: string };
        if (Array.isArray(parsed.rows) && parsed.rows.length) {
          setRows(parsed.rows);
          setSourceName(parsed.sourceName || "Planilha local");
          setUpdatedAt(parsed.updatedAt || "Atualizado localmente");
        }
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setIsMounted(true);
    }
  }, []);

  const promoters = useMemo(
    () => [...new Set(analysisRows.map((row) => row.promotor))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [analysisRows],
  );
  const cities = useMemo(
    () => [...new Set(analysisRows.map((row) => row.cidade))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [analysisRows],
  );
  const networks = useMemo(
    () => [...new Set(analysisRows.map((row) => row.rede))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [analysisRows],
  );

  const filteredRows = useMemo(() => {
    const key = normalizeKey(query);
    return analysisRows.filter((row) => {
      if (promoter !== ALL && row.promotor !== promoter) return false;
      if (city !== ALL && row.cidade !== city) return false;
      if (network !== ALL && row.rede !== network) return false;
      if (!key) return true;
      return [row.promotor, row.cidade, row.loja, row.rede, row.vendedor, row.cnpjFormatado]
        .some((value) => normalizeKey(value).includes(key));
    });
  }, [analysisRows, promoter, city, network, query]);

  const cityData = useMemo(() => buildCityAggregation(filteredRows, month), [filteredRows, month]);
  const cityComparisonData = useMemo(() => {
    const key = normalizeKey(query);
    const comparisonRows = analysisRows.filter((row) => {
      if (promoter !== ALL && row.promotor !== promoter) return false;
      if (network !== ALL && row.rede !== network) return false;
      if (!key) return true;
      return [row.promotor, row.cidade, row.loja, row.rede, row.vendedor, row.cnpjFormatado]
        .some((value) => normalizeKey(value).includes(key));
    });
    return buildCityAggregation(comparisonRows, month);
  }, [analysisRows, promoter, city, network, query, month]);
  const visibleCityData = useMemo(() => {
    if (showAllCities) return cityComparisonData;
    const topCities = cityComparisonData.slice(0, 7);
    if (city === ALL || topCities.some((entry) => entry.city === city)) return topCities;
    const selected = cityComparisonData.find((entry) => entry.city === city);
    return selected
      ? [...topCities.slice(0, 6), selected].sort((a, b) => b.sellout - a.sellout)
      : topCities;
  }, [cityComparisonData, city, showAllCities]);
  const mapCityData = useMemo(() => buildCityAggregation(analysisRows.filter((row) => {
    if (promoter !== ALL && row.promotor !== promoter) return false;
    if (network !== ALL && row.rede !== network) return false;
    return true;
  }), month), [analysisRows, promoter, network, month]);
  const promoterData = useMemo(() => buildPromoterAggregation(filteredRows, month), [filteredRows, month]);
  const networkComparisonRows = useMemo(() => {
    const key = normalizeKey(query);
    return analysisRows.filter((row) => {
      if (promoter !== ALL && row.promotor !== promoter) return false;
      if (city !== ALL && row.cidade !== city) return false;
      if (!key) return true;
      return [row.promotor, row.cidade, row.loja, row.rede, row.vendedor, row.cnpjFormatado]
        .some((value) => normalizeKey(value).includes(key));
    });
  }, [analysisRows, promoter, city, query]);
  const networkData = useMemo(
    () => buildNetworkAggregation(networkComparisonRows, month),
    [networkComparisonRows, month],
  );
  const networkAlerts = useMemo(() => {
    const mayByNetwork = new Map(buildNetworkAggregation(networkComparisonRows, "maio").map((item) => [item.name, item]));
    const juneByNetwork = new Map(buildNetworkAggregation(networkComparisonRows, "junho").map((item) => [item.name, item]));
    return [...mayByNetwork.entries()]
      .map(([name, may]) => {
        const june = juneByNetwork.get(name);
        const juneSellout = june?.sellout || 0;
        const change = may.sellout ? ((juneSellout - may.sellout) / may.sellout) * 100 : 0;
        return { name, maySellout: may.sellout, juneSellout, change, cnpjs: june?.cnpjs || may.cnpjs };
      })
      .filter((item) => normalizeKey(item.name) !== "SEM REDE DEFINIDA" && item.maySellout >= 10_000 && item.change <= -60)
      .sort((a, b) => (b.maySellout - b.juneSellout) - (a.maySellout - a.juneSellout));
  }, [networkComparisonRows]);
  const multiCityPromoters = useMemo(
    () => promoterData.filter((item) => item.cities > 1).sort((a, b) => b.cities - a.cities),
    [promoterData],
  );

  const totalSellout = useMemo(() => metricByStore(filteredRows, month), [filteredRows, month]);
  const storeCount = useMemo(() => uniqueStores(filteredRows), [filteredRows]);
  const promoterCount = new Set(filteredRows.map((row) => row.promotor)).size;
  const cnpjCount = new Set(filteredRows.map((row) => row.cnpj).filter(Boolean)).size;
  const cityCount = new Set(filteredRows.map((row) => row.cidade)).size;
  const networkCount = new Set(filteredRows.map((row) => row.rede)).size;
  const averageFrequency = storeCount ? filteredRows.length / storeCount : 0;
  const networkSelloutTotal = networkData.reduce((sum, item) => sum + item.sellout, 0);
  const topNetworkSellout = networkData[0]?.sellout || 0;
  const unclassifiedCnpjs = new Set(
    filteredRows
      .filter((row) => normalizeKey(row.rede) === "SEM REDE DEFINIDA")
      .map((row) => row.cnpj || row.id),
  ).size;
  const zeroSelloutCnpjs = uniqueCnpjRows(filteredRows).filter((row) => Number(row[month]) <= 0).length;
  const reconciledCnpjs = dataMode === "faturamento"
    ? uniqueCnpjRows(filteredRows).filter((row) => row.junhoConfianca === "estimado").length
    : 0;
  const territoryComparisonTotal = cityComparisonData.reduce((sum, item) => sum + item.sellout, 0);
  const selectedTerritory = city === ALL ? null : cityComparisonData.find((item) => item.city === city);
  const selectedTerritoryShare = selectedTerritory && territoryComparisonTotal
    ? (selectedTerritory.sellout / territoryComparisonTotal) * 100
    : 0;

  const trendData = useMemo(() => [
    { name: dataMode === "faturamento" ? "Jun" : "Abr", value: metricByStore(filteredRows, "abril") },
    { name: dataMode === "faturamento" ? "Jul" : "Mai", value: metricByStore(filteredRows, "maio") },
    { name: dataMode === "faturamento" ? "Ago" : "Jun", value: metricByStore(filteredRows, "junho") },
  ], [filteredRows, dataMode]);

  const previousMonth: Partial<Record<MetricMonth, MetricMonth>> = { maio: "abril", junho: "maio" };
  const previousMonthKey = previousMonth[month];
  const previousMonthValue = previousMonthKey ? metricByStore(filteredRows, previousMonthKey) : 0;
  const monthVariation = previousMonthKey && previousMonthValue
    ? ((totalSellout - previousMonthValue) / previousMonthValue) * 100
    : null;
  const monthComparisonDetail = dataMode === "faturamento"
    ? `${formatNumber(reconciledCnpjs)} CNPJs estimados pelos totais oficiais das redes`
    : month === "media"
    ? "Média simples de abril a junho da planilha"
    : previousMonthKey && monthVariation !== null
      ? `${monthVariation >= 0 ? "+" : ""}${monthVariation.toFixed(1).replace(".", ",")}% contra ${periodLabels[previousMonthKey].toLowerCase()}`
      : "Primeiro mês disponível na série";
  const hasActiveFilters = promoter !== ALL || city !== ALL || network !== ALL || Boolean(query);
  const displayedBiMonths = hasActiveFilters && dataMode === "faturamento"
    ? [
        { label: "Junho", value: metricByStore(filteredRows, "abril") },
        { label: "Julho", value: metricByStore(filteredRows, "maio") },
        { label: "Agosto", value: metricByStore(filteredRows, "junho") },
      ]
    : BI_REVENUE.months;
  const displayedBiAverage = displayedBiMonths.reduce((sum, item) => sum + item.value, 0) / displayedBiMonths.length;

  const clearFilters = () => {
    setPromoter(ALL);
    setCity(ALL);
    setNetwork(ALL);
    setQuery("");
  };

  const handleCitySelection = (selected: string) => {
    setCity((current) => current === selected ? ALL : selected);
  };

  const handleFile = async (file: File) => {
    setIsImporting(true);
    try {
      const importedRows = parseWorkbook(await file.arrayBuffer());
      if (!importedRows.length) throw new Error("Nenhuma linha válida foi encontrada no roteiro.");
      const date = new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date());
      setRows(importedRows);
      setSourceName(file.name);
      setUpdatedAt(date);
      clearFilters();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ rows: importedRows, sourceName: file.name, updatedAt: date }));
      toast.success("Planilha processada", {
        description: `${formatNumber(importedRows.length)} visitas foram carregadas com os campos pessoais bloqueados.`,
      });
    } catch (error) {
      toast.error("Não foi possível ler a planilha", {
        description: error instanceof Error ? error.message : "Confira a estrutura do arquivo.",
      });
    } finally {
      setIsImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const resetData = () => {
    setRows(seed.rows);
    setSourceName(seed.meta.source);
    setUpdatedAt("01/09/2026");
    localStorage.removeItem(STORAGE_KEY);
    clearFilters();
    toast.success("Base original restaurada");
  };

  if (!isMounted) {
    return (
      <main className="dashboard-root dashboard-loading" aria-busy="true">
        <div className="ambient-grid" />
        <div className="loading-core"><Zap size={24} /><strong>Carregando inteligência operacional</strong><span>Preparando mapa e indicadores</span></div>
      </main>
    );
  }

  return (
    <main className="dashboard-root">
      <Toaster theme="dark" position="top-right" richColors />
      <div className="ambient-grid" />
      <div className="ambient-orb ambient-orb-one" />
      <div className="ambient-orb ambient-orb-two" />

      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Zap size={21} fill="currentColor" /></div>
          <div>
            <span>Triunfante • Operations</span>
            <h1>MS Intelligence</h1>
          </div>
        </div>

        <div className="topbar-code" aria-hidden="true">
          <span>OPS / MS-79</span>
          <small>COMMAND DECK 01</small>
        </div>

        <div className="topbar-status">
          <Badge variant="outline" className="status-badge">
            <i /> Base ativa
          </Badge>
          <div className="source-status">
            <Database size={15} />
            <div>
              <span>{sourceName}</span>
              <small>Atualizado em {updatedAt}</small>
            </div>
          </div>
        </div>

        <div className="topbar-actions">
          <Button variant="ghost" className="powerbi-button" asChild>
            <a href={POWER_BI_URL} target="_blank" rel="noreferrer">
              Power BI <ArrowUpRight size={16} />
            </a>
          </Button>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept=".xlsx,.xls"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <div className="upload-stack">
            <Button className="upload-button" onClick={() => inputRef.current?.click()} disabled={isImporting}>
              {isImporting ? <RefreshCcw className="spin" size={16} /> : <Upload size={16} />}
              {isImporting ? "Lendo arquivo" : "Atualizar Excel"}
            </Button>
            <small>O arquivo fica somente neste navegador</small>
          </div>
        </div>
      </header>

      <nav className="section-rail" aria-label="Navegação do painel">
        <span className="rail-label">Navegação</span>
        <a href="#visao-geral"><CircleGauge size={18} /><span>Visão geral</span></a>
        <a href="#territorio"><MapPin size={18} /><span>Território</span></a>
        <a href="#redes"><Store size={18} /><span>Redes</span></a>
        <a href="#promotores"><Users size={18} /><span>Promotores</span></a>
        <a href="#alertas"><Zap size={18} /><span>Alertas</span>{networkAlerts.length > 0 && <b>{networkAlerts.length}</b>}</a>
        <a href="/campanhas"><Upload size={18} /><span>Campanhas</span></a>
        <div className="rail-filters">
          <strong>Recorte ativo</strong>
          <span>{metricName} • {periodLabels[month]}</span>
          {promoter !== ALL && <span>{promoter}</span>}
          {city !== ALL && <span>{city}</span>}
          {network !== ALL && <span>{network}</span>}
          {!hasActiveFilters && <small>Estado inteiro</small>}
        </div>
      </nav>

      <section id="visao-geral" className="command-bar" aria-label="Filtros do painel">
        <div className="filter-block filter-month">
          <span className="filter-label">Métrica principal</span>
          <div className="metric-mode-switcher" aria-label="Fonte da métrica">
            <button
              type="button"
              className={dataMode === "faturamento" ? "active" : ""}
              onClick={() => setDataMode("faturamento")}
            >Faturamento BI</button>
            <button
              type="button"
              className={dataMode === "sellout" ? "active" : ""}
              onClick={() => setDataMode("sellout")}
            >Sell-out Excel</button>
          </div>
          <span className="filter-label period-label">Período</span>
          <div className="month-switcher">
            {(Object.keys(MONTH_LABELS) as MetricMonth[]).map((option) => (
              <button
                key={option}
                className={month === option ? "active" : ""}
                onClick={() => setMonth(option)}
              >
                {option === "media" ? "Média" : periodLabels[option]}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-block search-block">
          <span className="filter-label">Busca rápida</span>
          <div className="search-field">
            <Search size={16} />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Promotor, cidade, loja ou CNPJ"
              aria-label="Buscar no roteiro"
            />
            {query && <button aria-label="Limpar busca" onClick={() => setQuery("")}><X size={15} /></button>}
          </div>
        </div>

        <div className="filter-selects">
          <div>
            <span className="filter-label">Promotor</span>
            <Select value={promoter} onValueChange={setPromoter}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os promotores</SelectItem>
                {promoters.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <span className="filter-label">Cidade</span>
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as cidades</SelectItem>
                {cities.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <span className="filter-label">Rede</span>
            <Select value={network} onValueChange={setNetwork}>
              <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as redes</SelectItem>
                {networks.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {(promoter !== ALL || city !== ALL || network !== ALL || query) && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="clear-button">
            <X size={15} /> Limpar
          </Button>
        )}
      </section>

      <section className="bi-revenue-strip" aria-label="Faturamento oficial TCG Mondelez no Power BI">
        <div className="bi-revenue-source">
          <div className="bi-source-icon"><Database size={18} /></div>
          <div>
            <span>Power BI • faturamento</span>
            <strong>{BI_REVENUE.branch} / {BI_REVENUE.supplier}</strong>
            <small>{hasActiveFilters && dataMode === "faturamento" ? "Recorte territorial estimado" : "Visão estadual oficial"} • atualizado em {BI_REVENUE.updatedAt}</small>
          </div>
        </div>
        <div className="bi-revenue-average">
          <span>Média dos últimos 3 meses</span>
          <strong>{formatMoney(displayedBiAverage, true)}</strong>
          <small>{hasActiveFilters && dataMode === "faturamento" ? "Estimativa do recorte por CNPJ" : `Base estadual oficial • junho tem ${formatMoney(biRevenue.unclassified.junho, true)} sem rede`}</small>
        </div>
        <div className="bi-revenue-months">
          {displayedBiMonths.map((entry) => (
            <div key={entry.label}>
              <span>{entry.label}</span>
              <strong>{formatMoney(entry.value, true)}</strong>
            </div>
          ))}
        </div>
        <Button variant="ghost" size="sm" asChild className="bi-source-link">
          <a href={POWER_BI_URL} target="_blank" rel="noreferrer">Abrir fonte <ArrowUpRight size={14} /></a>
        </Button>
        {hasActiveFilters && <span className="bi-filter-warning">{dataMode === "faturamento" ? "Estimativa territorial • responde aos filtros" : "BI estadual • altere para Faturamento BI"}</span>}
      </section>

      <section className="kpi-grid" aria-label="Resumo executivo">
        <KpiCard index="01" label={`${metricName} territorial • ${periodLabels[month]}`} value={formatMoney(totalSellout, true)} detail={monthComparisonDetail} icon={TrendingUp} accent />
        <KpiCard index="02" label="Promotores ativos" value={formatNumber(promoterCount)} detail={`${formatNumber(cityCount)} cidades atendidas`} icon={Users} />
        <KpiCard index="03" label="Visitas programadas" value={formatNumber(filteredRows.length)} detail={`${averageFrequency.toFixed(1).replace(".", ",")} por loja`} icon={Route} />
        <KpiCard index="04" label="Lojas únicas" value={formatNumber(storeCount)} detail={`${formatNumber(networkCount)} redes mapeadas`} icon={Store} />
        <KpiCard
          index="05"
          label={city === ALL ? "Cobertura estadual" : "Participação da cidade"}
          value={city === ALL ? `${cityCount}/79` : `${selectedTerritoryShare.toFixed(1).replace(".", ",")}%`}
          detail={city === ALL ? `${((cityCount / 79) * 100).toFixed(0)}% dos municípios` : `${city} no ${metricName.toLowerCase()} do recorte`}
          icon={MapPin}
        />
        <KpiCard index="06" label="Alertas de rede" value={formatNumber(networkAlerts.length)} detail={networkAlerts[0] ? `${networkAlerts[0].name} exige investigação` : "Nenhuma queda acima de 60%"} icon={Zap} />
      </section>

      <section className="main-grid">
        <article id="territorio" className="panel map-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow"><CircleGauge size={14} /> Presença operacional</span>
              <h2>Centro geoespacial de Mato Grosso do Sul</h2>
            </div>
            <div className="map-legend"><span><i className="sales" /> Com valor</span><span><i className="zero" /> Sem valor</span><span><i className="unassigned" /> Sem promotor</span></div>
          </div>
          <MapScene cities={mapCityData} selectedCity={city === ALL ? "" : city} onSelectCity={handleCitySelection} metricLabel={metricName} />
        </article>

        <aside className="right-stack">
          <article id="alertas" className="panel action-panel">
            <div className="panel-heading compact">
              <div>
                <span className="eyebrow"><Zap size={14} /> Exceções que exigem ação</span>
                <h2>Alertas do recorte</h2>
              </div>
              <Badge variant="outline" className={networkAlerts.length ? "alert-count active" : "alert-count"}>{networkAlerts.length}</Badge>
            </div>
            <div className="action-alert-list">
              <button
                type="button"
                className="reconciliation"
                onClick={() => document.getElementById("auditoria-faturamento")?.scrollIntoView({ behavior: "smooth" })}
              >
                <span>Auditoria geral de faturamento</span>
                <strong>{confirmedNetworkCount} redes confirmadas • {estimatedNetworkCount} recalculadas</strong>
                <small>{unlinkedNetworkCount} sem vínculo • valores sem rede no BI não foram jogados em cidades</small>
              </button>
              {networkAlerts.slice(0, 1).map((alert) => (
                <button key={alert.name} type="button" onClick={() => setNetwork(alert.name)}>
                  <span>Queda forte de rede</span>
                  <strong>{alert.name}</strong>
                  <small>{alert.change.toFixed(1).replace(".", ",")}% de {periodLabels.maio.toLowerCase()} para {periodLabels.junho.toLowerCase()} • {alert.cnpjs} CNPJs</small>
                </button>
              ))}
              <button type="button" className="warning">
                <span>Sem {metricName.toLowerCase()} em {periodLabels[month].toLowerCase()}</span>
                <strong>{uniqueCnpjRows(filteredRows).filter((row) => Number(row[month]) <= 0).length} CNPJs</strong>
                <small>Investigar ruptura, cadastro ou ausência de carga</small>
              </button>
            </div>
          </article>
          <article className="panel trend-panel">
            <div className="panel-heading compact">
              <div>
                <span className="eyebrow">Tração comercial</span>
                <h2>Evolução do {metricName.toLowerCase()}</h2>
              </div>
              <Badge variant="outline">{dataMode === "faturamento" ? "BI por rede • estimado por CNPJ" : "Fonte Excel"}</Badge>
            </div>
            <div className="trend-total">
              <strong>{formatMoney(totalSellout, true)}</strong>
              {monthVariation !== null && <span className={monthVariation >= 0 ? "positive" : "negative"}>{monthVariation >= 0 ? "+" : ""}{monthVariation.toFixed(1).replace(".", ",")}%</span>}
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={trendData} margin={{ top: 8, right: 8, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#3ddcff" stopOpacity="0.35" />
                    <stop offset="1" stopColor="#3ddcff" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#183047" strokeDasharray="3 6" vertical={false} />
                <XAxis dataKey="name" stroke="#70869a" axisLine={false} tickLine={false} fontSize={11} />
                <YAxis stroke="#70869a" axisLine={false} tickLine={false} fontSize={10} tickFormatter={(value) => formatMoney(Number(value), true)} />
                <ChartTooltip contentStyle={{ background: "#07111d", border: "1px solid #244058", borderRadius: 10 }} formatter={(value) => [formatMoney(Number(value)), metricName]} />
                <Area type="monotone" dataKey="value" stroke="#46dcff" strokeWidth={2.5} fill="url(#trendFill)" dot={{ fill: "#07111d", stroke: "#46dcff", strokeWidth: 2, r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          </article>

          <article className="panel city-ranking-panel">
            <div className="panel-heading compact">
              <div>
                <span className="eyebrow">Pressão por território</span>
                <h2>{metricName} por cidade</h2>
              </div>
              {city === ALL ? (
                <Button variant="ghost" size="sm" className="ranking-toggle" onClick={() => setShowAllCities((value) => !value)}>
                  {showAllCities ? "Ver top 7" : `${Math.min(7, cityComparisonData.length)} de ${cityComparisonData.length} • ver todas`}
                </Button>
              ) : (
                <span className="city-ranking-context"><MapPin size={12} /> {city}</span>
              )}
            </div>
            <p className="city-ranking-note">
              {reconciledCnpjs > 0
                ? `${periodLabels[month]} usa o total oficial por rede distribuído entre os CNPJs pelo histórico da planilha`
                : city === ALL
                  ? (showAllCities ? "Todos os territórios no período" : "Maiores territórios no período")
                  : "Cidade selecionada destacada sem perder a comparação"}
            </p>
            <ResponsiveContainer width="100%" height={showAllCities ? Math.max(252, visibleCityData.length * 34) : 252}>
              <BarChart data={visibleCityData} layout="vertical" margin={{ top: 2, right: 76, left: 10, bottom: 2 }}>
                <CartesianGrid stroke="#152b40" horizontal={false} strokeDasharray="3 5" />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="city" width={108} axisLine={false} tickLine={false} fontSize={10} stroke="#a5b6c5" />
                <ChartTooltip cursor={{ fill: "rgba(63, 213, 255, 0.04)" }} contentStyle={{ background: "#07111d", border: "1px solid #244058", borderRadius: 10 }} formatter={(value) => [formatMoney(Number(value)), metricName]} />
                <Bar dataKey="sellout" radius={[0, 8, 8, 0]} barSize={16} minPointSize={3}>
                  {visibleCityData.map((entry, index) => (
                    <Cell
                      key={entry.city}
                      fill={city !== ALL && entry.city === city
                        ? "#45dfff"
                        : `rgba(64, ${211 - index * 7}, 255, ${0.9 - index * 0.065})`}
                    />
                  ))}
                  <LabelList
                    dataKey="sellout"
                    position="right"
                    fill="#c9d9e2"
                    fontSize={10}
                    formatter={(value: number) => formatMoney(Number(value), true)}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </article>
        </aside>
      </section>

      <section id="redes" className="panel network-performance-panel" aria-label="Desempenho por rede">
        <div className="panel-heading network-heading">
          <div>
            <span className="eyebrow"><Store size={14} /> Carteira comercial</span>
            <h2>Desempenho por rede</h2>
          </div>
          <div className="network-heading-meta">
            <span>{Math.min(showAllNetworks ? networkData.length : 6, networkData.length)} de {networkData.length} redes</span>
            <button type="button" onClick={() => setShowAllNetworks((value) => !value)}>{showAllNetworks ? "Mostrar principais" : "Ver todas"}</button>
          </div>
        </div>
        <div className="network-rank-grid">
          {networkData.slice(0, showAllNetworks ? networkData.length : 6).map((item, index) => {
            const share = networkSelloutTotal ? (item.sellout / networkSelloutTotal) * 100 : 0;
            const relativeWidth = topNetworkSellout ? (item.sellout / topNetworkSellout) * 100 : 0;
            const active = network === item.name;
            return (
              <button
                key={item.name}
                type="button"
                className={`network-rank-card ${active ? "active" : ""}`}
                onClick={() => setNetwork((current) => current === item.name ? ALL : item.name)}
                aria-pressed={active}
              >
                <span className="network-rank-index">{String(index + 1).padStart(2, "0")}</span>
                <div className="network-rank-title">
                  <strong>{item.name}</strong>
                  <span>{share.toFixed(1).replace(".", ",")}% do {metricName.toLowerCase()}</span>
                </div>
                <b>{formatMoney(item.sellout, true)}</b>
                <div className="network-progress"><i style={{ width: `${Math.max(relativeWidth, 2)}%` }} /></div>
                <div className="network-rank-metrics">
                  <span><strong>{item.cnpjs}</strong> CNPJs</span>
                  <span><strong>{item.cities}</strong> cidades</span>
                  <span><strong>{item.promoters}</strong> promotores</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section id="auditoria-faturamento" className="panel revenue-audit-panel" aria-label="Auditoria do faturamento por rede">
        <div className="panel-heading audit-heading">
          <div>
            <span className="eyebrow"><ShieldCheck size={14} /> Conciliação BI x roteiro</span>
            <h2>Auditoria de todas as redes</h2>
          </div>
          <div className="audit-summary">
            <span className="audit-chip confirmed">{confirmedNetworkCount} confirmadas</span>
            <span className="audit-chip estimated">{estimatedNetworkCount} recalculadas</span>
            <span className="audit-chip unlinked">{unlinkedNetworkCount} sem vínculo</span>
          </div>
        </div>
        <p className="audit-note">
          Junho é o único mês presente nas duas bases e define o status da conferência. Para detalhar faturamento por CNPJ e cidade, os totais oficiais de cada rede são distribuídos pelo histórico de abril a junho da planilha. {formatMoney(biRevenue.unclassified.junho)} sem rede no BI permanece fora das cidades até existir vínculo confiável. Valores negativos são devoluções e foram preservados.
        </p>
        <div className="audit-table-wrap">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rede</TableHead>
                <TableHead>CNPJs</TableHead>
                <TableHead>Excel jun.</TableHead>
                <TableHead>BI jun.</TableHead>
                <TableHead>Delta</TableHead>
                <TableHead>BI jul.</TableHead>
                <TableHead>BI ago.</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {revenueAudit.slice(0, showFullAudit ? revenueAudit.length : 8).map((item) => (
                <TableRow key={item.name} onClick={() => setNetwork(item.name)} className="audit-row">
                  <TableCell><strong>{item.name}</strong><small>{item.cities} cidades</small></TableCell>
                  <TableCell>{item.cnpjs}</TableCell>
                  <TableCell>{formatMoney(item.excelJune, true)}</TableCell>
                  <TableCell>{item.biJune === null ? "Sem vínculo" : formatMoney(item.biJune, true)}</TableCell>
                  <TableCell className={(item.delta || 0) < 0 ? "negative" : "positive"}>{item.delta === null ? "—" : formatMoney(item.delta, true)}</TableCell>
                  <TableCell>{item.biJuly === null ? "—" : formatMoney(item.biJuly, true)}</TableCell>
                  <TableCell>{item.biAugust === null ? "—" : formatMoney(item.biAugust, true)}</TableCell>
                  <TableCell><span className={`audit-status ${item.status}`}>{item.status === "confirmado" ? "Confirmado" : item.status === "estimado" ? "Recalculado" : "Sem vínculo"}</span></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="audit-mobile-list">
          {revenueAudit.slice(0, showFullAudit ? revenueAudit.length : 8).map((item) => (
            <button key={item.name} type="button" onClick={() => setNetwork(item.name)}>
              <span><strong>{item.name}</strong><small>{item.cnpjs} CNPJs • {item.cities} cidades</small></span>
              <b>{item.biJune === null ? "Sem vínculo" : formatMoney(item.biJune, true)}</b>
              <i className={`audit-status ${item.status}`}>{item.status === "confirmado" ? "Confirmado" : item.status === "estimado" ? "Recalculado" : "Sem vínculo"}</i>
            </button>
          ))}
        </div>
        <button type="button" className="table-expand" onClick={() => setShowFullAudit((value) => !value)}>
          {showFullAudit ? "Mostrar principais divergências" : `Mostrando 8 de ${revenueAudit.length} redes • ver auditoria completa`}
        </button>
      </section>

      <section className="bottom-grid">
        <article id="promotores" className="panel promoter-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow"><Users size={14} /> Operação por promotor</span>
              <h2>Resumo de produtividade e cobertura</h2>
            </div>
            <span className="panel-hint">Clique em um nome para abrir o roteiro</span>
          </div>
          {multiCityPromoters.length > 0 && (
            <div className="multi-city-summary">
              <div className="multi-city-icon"><MapPin size={17} /></div>
              <div>
                <strong>{multiCityPromoters.length} {multiCityPromoters.length === 1 ? "promotor atende" : "promotores atendem"} mais de uma cidade</strong>
                <span>{multiCityPromoters.slice(0, 3).map((item) => `${item.name}, ${item.cities} cidades`).join(" • ")}</span>
              </div>
            </div>
          )}
          <div className="table-wrap">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Promotor</TableHead>
                  <TableHead>Cidades</TableHead>
                  <TableHead>Visitas</TableHead>
                  <TableHead>Lojas</TableHead>
                  <TableHead>CNPJs</TableHead>
                  <TableHead>Redes</TableHead>
                  <TableHead>Frequência</TableHead>
                  <TableHead className="text-right">{metricName}</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {promoterData.slice(0, showAllPromoters ? promoterData.length : 12).map((item, index) => (
                  <TableRow key={item.name} onClick={() => setDetailPromoter(item)} className="data-row">
                    <TableCell>
                      <div className="promoter-cell">
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <div className="promoter-identity">
                          <strong>{item.name}</strong>
                          {item.cities > 1 && <small><MapPin size={11} /> Multicidade, {item.cities} cidades</small>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{item.cities}</TableCell>
                    <TableCell>{item.visits}</TableCell>
                    <TableCell>{item.stores}</TableCell>
                    <TableCell>{item.cnpjs}</TableCell>
                    <TableCell>{item.networks}</TableCell>
                    <TableCell><Badge variant="outline">{item.frequency.toFixed(1).replace(".", ",")}x</Badge></TableCell>
                    <TableCell className="text-right money-cell">{formatMoney(item.sellout)}</TableCell>
                    <TableCell><ChevronRight size={16} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="promoter-mobile-list">
            {promoterData.slice(0, showAllPromoters ? promoterData.length : 12).map((item, index) => (
              <button key={item.name} type="button" onClick={() => setDetailPromoter(item)}>
                <span className="mobile-rank">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{item.name}</strong>
                  <small>{item.cities} cidades • {item.visits} visitas • {item.frequency.toFixed(1).replace(".", ",")}x</small>
                </div>
                <b>{formatMoney(item.sellout, true)}</b>
                <ChevronRight size={15} />
              </button>
            ))}
          </div>
          <button type="button" className="table-expand" onClick={() => setShowAllPromoters((value) => !value)}>
            {showAllPromoters ? "Mostrar somente os 12 principais" : `Mostrando ${Math.min(12, promoterData.length)} de ${promoterData.length} promotores • ver todos`}
          </button>
        </article>

        <article className="panel intelligence-panel">
          <div className="panel-heading compact">
            <div>
              <span className="eyebrow"><Zap size={14} /> Leitura automática</span>
              <h2>Sinais da operação</h2>
            </div>
          </div>
          <div className="signal-list">
            <div className="signal-card critical">
              <span>Rede líder no recorte</span>
              <strong>{networkData[0]?.name || "Sem dados"}</strong>
              <small>{networkData[0] && networkSelloutTotal ? `${((networkData[0].sellout / networkSelloutTotal) * 100).toFixed(1).replace(".", ",")}% do ${metricName.toLowerCase()}` : "Sem participação calculada"}</small>
            </div>
            <div className={`signal-card ${zeroSelloutCnpjs > 0 ? "attention" : ""}`}>
              <span>Pontos sem {metricName.toLowerCase()}</span>
              <strong>{zeroSelloutCnpjs} CNPJs</strong>
              <small>No período selecionado e dentro dos filtros</small>
            </div>
            <div className={`signal-card ${unclassifiedCnpjs > 0 ? "attention" : ""}`}>
              <span>Cadastro de rede</span>
              <strong>{unclassifiedCnpjs} sem classificação</strong>
              <small>CNPJs que precisam de rede definida</small>
            </div>
          </div>
          <div className="privacy-card">
            <ShieldCheck size={20} />
            <div>
              <strong>Camada de privacidade ativa</strong>
              <span>CPF, RG, telefone, e-mail, endereço residencial, IMEI, férias e dados de RH não entram no painel.</span>
            </div>
          </div>
          {sourceName !== seed.meta.source && (
            <Button variant="outline" onClick={resetData} className="reset-button">
              <RefreshCcw size={15} /> Restaurar base original
            </Button>
          )}
        </article>
      </section>

      <footer className="dashboard-footer">
        <span><FileSpreadsheet size={14} /> Fonte operacional: aba Roteiro</span>
        <span><CalendarDays size={14} /> Faturamento deduplicado por CNPJ</span>
        <span><Database size={14} /> Faturamento BI distribuído por rede e CNPJ com trilha de auditoria</span>
        <span><ShieldCheck size={14} /> Dados pessoais bloqueados</span>
        <span><CircleGauge size={14} /> Frequência = visitas programadas ÷ lojas únicas</span>
      </footer>

      <Sheet open={Boolean(detailPromoter)} onOpenChange={(open) => !open && setDetailPromoter(null)}>
        <SheetContent className="detail-sheet sm:max-w-xl">
          {detailPromoter && (
            <>
              <SheetHeader>
                <Badge variant="outline" className="detail-badge">Detalhe operacional</Badge>
                <SheetTitle>{detailPromoter.name}</SheetTitle>
                <SheetDescription>
                  {detailPromoter.cities} cidades, {detailPromoter.networks} redes, {detailPromoter.cnpjs} CNPJs e {detailPromoter.visits} visitas.
                </SheetDescription>
              </SheetHeader>
              <div className="detail-kpis">
                <div><span>{metricName}</span><strong>{formatMoney(detailPromoter.sellout, true)}</strong></div>
                <div><span>Frequência</span><strong>{detailPromoter.frequency.toFixed(1).replace(".", ",")}x</strong></div>
                <div><span>Redes</span><strong>{detailPromoter.networks}</strong></div>
                <div><span>CNPJs</span><strong>{detailPromoter.cnpjs}</strong></div>
              </div>
              {detailPromoter.cities > 1 && (
                <div className="multi-city-detail">
                  <MapPin size={18} />
                  <div>
                    <strong>Atuação multicidade</strong>
                    <span>{detailPromoter.cityNames.join(" • ")}</span>
                  </div>
                </div>
              )}
              <section className="promoter-coverage-detail">
                <div className="coverage-detail-heading">
                  <div>
                    <span>Redes atendidas</span>
                    <strong>{detailPromoter.networks} redes na carteira</strong>
                  </div>
                </div>
                <div className="network-chip-list">
                  {networkBreakdown(detailPromoter.rows).map((entry) => (
                    <div key={entry.name}>
                      <span>{entry.name}</span>
                      <b>{entry.cnpjs} {entry.cnpjs === 1 ? "CNPJ" : "CNPJs"}</b>
                    </div>
                  ))}
                </div>
              </section>
              <section className="promoter-coverage-detail">
                <div className="coverage-detail-heading">
                  <div>
                    <span>CNPJs atendidos</span>
                    <strong>{detailPromoter.cnpjs} pontos de venda</strong>
                  </div>
                </div>
                <div className="cnpj-coverage-list">
                  {uniqueCnpjRows(detailPromoter.rows).map((row) => (
                    <article key={row.cnpj || row.id}>
                      <div>
                        <strong>{row.loja}</strong>
                        <span>{row.cidade} • {row.rede}</span>
                      </div>
                      <b>{formatCnpj(row.cnpj)}</b>
                    </article>
                  ))}
                </div>
              </section>
              <div className="route-list">
                {[...detailPromoter.rows]
                  .sort((a, b) => a.cidade.localeCompare(b.cidade, "pt-BR") || a.loja.localeCompare(b.loja, "pt-BR"))
                  .map((row) => (
                    <article key={row.id}>
                      <div className="route-marker"><i /></div>
                      <div className="route-info">
                        <span>{row.cidade} • {row.diaVisita}</span>
                        <strong>{row.loja}</strong>
                        <small>{row.rede} • {formatCnpj(row.cnpj)}</small>
                      </div>
                      <b>{formatMoney(row[month], true)}</b>
                    </article>
                  ))}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </main>
  );
}
