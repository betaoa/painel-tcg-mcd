"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Clock3,
  Database,
  Eye,
  FileSpreadsheet,
  LayoutDashboard,
  MapPin,
  Medal,
  Menu,
  Network,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Toaster } from "sonner";

import municipalityPayload from "@/app/data/ms-municipalities.json";
import tcgSeedPayload from "@/app/data/seed-data.json";
import mcdSeedPayload from "@/app/data/mcd-route.json";
import tcgRevenuePayload from "@/app/data/power-bi-revenue.json";
import mcdRevenuePayload from "@/app/data/mcd-power-bi-revenue.json";
import topVarejistaPayload from "@/app/data/top-varejista.json";
import {
  formatCnpj,
  formatMoney,
  normalizeCnpj,
  normalizeKey,
  POWER_BI_URL,
  RouteRow,
} from "@/app/lib/dashboard-data";
import { ALL, allocateRevenue, filterOperationalRows, hasRevenue, markerRadius, networkBilling, readingState, type Branch, type Period, type RevenuePayload } from "@/app/lib/revenue-selectors";

type PageKey = "overview" | "networks" | "top10" | "stores" | "promoters" | "program";

type ExtendedRow = RouteRow & {
  filial?: Branch;
  enderecoComercial?: string;
  diasVisita?: string[];
  frequencia?: number;
  redeConfianca?: string;
  fonteFaturamento?: string;
  revenueAvailable?: boolean;
  revenueMonths?: Array<"junho" | "julho" | "agosto">;
  networkKind?: "network" | "independent" | "pending";
};

type StoreRecord = ExtendedRow & {
  duplicateCount: number;
  promoterNames: string[];
  cityNames: string[];
  frequencyValue: number;
};

type TopVarejistaStore = {
  cnpj: string;
  razaoSocial: string;
  fantasia: string;
  rede: string;
  tier: string;
  owner: string;
  cidade: string;
  bairro: string;
  equipe: string;
  setor: string;
  status: string;
  statusGroup: "approved" | "rejected" | "pending" | "unread";
  latestCollection: null | {
    month: string;
    auditStatus: string;
    compliance: number;
    oralCare: string;
    oralReason: string;
    secondDisplay: string;
    secondReason: string;
  };
};

type TopVarejistaPayload = {
  meta: { source: string; updatedAt: string; period: string };
  summary: { stores: number; approved: number; pending: number; unread: number; read: number; gold: number; silver: number; pop: number; involves: number };
  stores: TopVarejistaStore[];
};

type MunicipalityShape = { id: string; name: string; path: string; cx: number; cy: number };
const msMap = municipalityPayload as {
  source: string;
  viewBox: [number, number, number, number];
  bounds: [number, number, number, number];
  padding: number;
  municipalities: MunicipalityShape[];
};

const tcgSeed = tcgSeedPayload as { meta: { source: string }; rows: ExtendedRow[] };
const mcdSeed = mcdSeedPayload as { meta: { source: string }; rows: ExtendedRow[] };
const revenueByBranch: Record<Branch, RevenuePayload> = {
  TCG: tcgRevenuePayload as RevenuePayload,
  MCD: mcdRevenuePayload as RevenuePayload,
};
const topVarejista = topVarejistaPayload as TopVarejistaPayload;

const PROMOTER_MONTHLY_COST = 5_000;
const INFO_NEW_ONLINE_URL = "https://triunfantecombr-my.sharepoint.com/:x:/g/personal/roberto_cavalcanti_triunfante_com_br/IQB08tA_ululTZvF6r-677xoAQMsSJNe15gyiYLT-2waHCo?e=13YdWo";
const PERIOD_LABELS: Record<Period, string> = {
  abril: "FAT JUN",
  maio: "FAT JUL",
  junho: "FAT AGO",
  media: "MÉDIA FAT.",
};
const PERIOD_SHORT: Record<Exclude<Period, "media">, string> = {
  abril: "Fat Jun",
  maio: "Fat Jul",
  junho: "Fat Ago",
};

const NAV_ITEMS = [
  { key: "overview" as const, label: "Visão geral", icon: LayoutDashboard },
  { key: "networks" as const, label: "Redes", icon: Network },
  { key: "top10" as const, label: "Top 10", icon: Medal },
  { key: "stores" as const, label: "Lojas e CNPJs", icon: Store },
  { key: "promoters" as const, label: "Promotores", icon: Users },
  { key: "program" as const, label: "Loja Perfeita", icon: Sparkles },
];

const unique = <T,>(values: T[]) => [...new Set(values)];
const numeric = (value: unknown) => Number(value) || 0;
const valueFor = (row: ExtendedRow, period: Period) => numeric(row[period]);

function formatCompact(value: number | null | undefined) {
  return typeof value === "number" ? formatMoney(value, true) : "—";
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
}

const NETWORK_NAMES_BY_CNPJ_ROOT: Record<string, string> = {
  "04757459": "REDE ABV / LEVEMAX",
  "10513998": "REDE PIRES / BONANÇA",
  "12075667": "REDE PIRES",
  "07719683": "REDE PIRES",
  "09531413": "REDE NUNES / MORENA",
  "01274396": "REDE PORTAL / PRINCESA",
  "02318826": "REDE VRA / MEGA",
  "09473933": "REDE COSTA / CENTRAL",
  "15534654": "REDE PAG POKO",
  "05348350": "REDE ATLÂNTICO / BATISTA",
  "12887219": "REDE NOVA ESTRELA",
  "33768854": "REDE THOMÉ",
  "06813685": "REDE FOGO / CHAMA",
  "46876542": "REDE FERNANDES",
  "33168717": "REDE GMAIS / SANTOS / RINCÃO",
  "07028514": "REDE CENTRAL",
  "20335148": "REDE SOL",
  "08752211": "REDE NAVIRAÍ / EXPRESS",
  "09544424": "REDE NUTRI / BENTÃO",
  "18862844": "REDE CIDADE BRANCA",
  "08931657": "REDE D KASA",
  "13425704": "REDE BIM / MARDEGAN",
  "37563265": "REDE SARAIVA",
  "08370598": "REDE LEGAL",
  "07140724": "REDE GAÚCHO",
  "10235154": "REDE SANTO ANTÔNIO / GT",
  "24678875": "REDE D CASA",
  "26552839": "REDE MONTANA",
  "37577145": "REDE PANIAGO",
};

function cnpjRoot(value: string) {
  const cnpj = normalizeCnpj(value);
  return cnpj ? cnpj.slice(0, 8) : "";
}

function formatCnpjRoot(root: string) {
  return `${root.slice(0, 2)}.${root.slice(2, 5)}.${root.slice(5, 8)}`;
}

export function classifyNetworksByCnpj(rows: ExtendedRow[]) {
  const cnpjsByRoot = new Map<string, Set<string>>();
  for (const row of rows) {
    const cnpj = normalizeCnpj(row.cnpj);
    const root = cnpjRoot(cnpj);
    if (!root) continue;
    const group = cnpjsByRoot.get(root) || new Set<string>();
    group.add(cnpj);
    cnpjsByRoot.set(root, group);
  }

  return rows.map((row) => {
    const cnpj = normalizeCnpj(row.cnpj);
    const root = cnpjRoot(cnpj);
    if (!root) {
      return { ...row, cnpj: "", cnpjFormatado: "", rede: "CNPJ pendente", networkKind: "pending" as const, redeConfianca: "cnpj_ausente" };
    }
    if ((cnpjsByRoot.get(root)?.size || 0) < 2) {
      return { ...row, cnpj, cnpjFormatado: formatCnpj(cnpj), rede: "Loja independente", networkKind: "independent" as const, redeConfianca: "cnpj_unico" };
    }
    const networkName = NETWORK_NAMES_BY_CNPJ_ROOT[root] || `GRUPO CNPJ ${formatCnpjRoot(root)}`;
    return { ...row, cnpj, cnpjFormatado: formatCnpj(cnpj), rede: networkName, networkKind: "network" as const, redeConfianca: "raiz_cnpj_8_digitos" };
  });
}

function storeRecords(rows: ExtendedRow[]): StoreRecord[] {
  const grouped = new Map<string, ExtendedRow[]>();
  for (const row of rows) {
    const key = row.cnpj || row.id;
    grouped.set(key, [...(grouped.get(key) || []), row]);
  }
  return [...grouped.values()].map((group) => {
    const preferred = group.find((row) => row.promotor !== "VAGA EM ABERTO") || group[0];
    const embeddedFrequency = Math.max(...group.map((row) => row.diasVisita?.length || 0));
    const routeFrequency = unique(group.map((row) => normalizeKey(row.diaVisita)).filter(Boolean)).length;
    return {
      ...preferred,
      duplicateCount: group.length,
      promoterNames: unique(group.map((row) => row.promotor)),
      cityNames: unique(group.map((row) => row.cidade)),
      frequencyValue: embeddedFrequency || routeFrequency || 1,
    };
  });
}

function aggregate(rows: ExtendedRow[], period: Period, field: "cidade" | "rede" | "promotor") {
  const grouped = new Map<string, ExtendedRow[]>();
  for (const row of rows) grouped.set(row[field] || "Não informado", [...(grouped.get(row[field] || "Não informado") || []), row]);
  return [...grouped.entries()].map(([name, group]) => {
    const stores = storeRecords(group);
    return {
      name,
      rows: group,
      stores,
      cnpjs: stores.length,
      cities: unique(group.map((row) => row.cidade)).length,
      promoters: unique(group.map((row) => row.promotor).filter((name) => name !== "VAGA EM ABERTO")).length,
      networks: unique(group.map((row) => row.rede)).length,
      visits: stores.reduce((sum, store) => sum + store.frequencyValue, 0),
      value: stores.reduce((sum, store) => sum + valueFor(store, period), 0),
    };
  }).sort((a, b) => b.value - a.value || b.cnpjs - a.cnpjs || a.name.localeCompare(b.name, "pt-BR"));
}

function Kpi({ label, value, detail, icon: Icon, accent = false }: { label: string; value: string; detail: string; icon: typeof Store; accent?: boolean }) {
  return <article className={`v2-kpi ${accent ? "accent" : ""}`}><div className="v2-kpi-icon"><Icon size={19} /></div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>;
}

function TerritoryMap({ cityData, selectedCity, onSelect, branch }: { cityData: ReturnType<typeof aggregate>; selectedCity: string; onSelect: (city: string) => void; branch: Branch }) {
  const [zoom, setZoom] = useState(1);
  const [tilt, setTilt] = useState(true);
  const [rotation, setRotation] = useState(-12);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean; city: string | null } | null>(null);
  const byCity = new Map(cityData.map(item => [normalizeKey(item.name), item]));
  const covered = cityData.filter(item => item.cnpjs > 0);
  const maxVolume = Math.max(1, ...covered.map(item => item.value > 0 ? item.value : item.cnpjs));
  const labelled = new Set([...covered].sort((a, b) => b.cnpjs - a.cnpjs).slice(0, 10).map(item => normalizeKey(item.name)));
  const [, , width, height] = msMap.viewBox;
  const angle = rotation * Math.PI / 180;
  const squash = tilt ? .72 : 1;
  const a = Math.cos(angle), b = Math.sin(angle) * squash, c = -Math.sin(angle), d = Math.cos(angle) * squash;
  const tx = width / 2 - a * width / 2 - c * height / 2;
  const ty = height / 2 - b * width / 2 - d * height / 2;
  const project = (x: number, y: number) => ({ x: a*x+c*y+tx, y:b*x+d*y+ty });
  const matrix = `matrix(${a} ${b} ${c} ${d} ${tx} ${ty})`;
  const selectedData = byCity.get(normalizeKey(selectedCity));
  const labelBoxes: Array<{x:number;y:number;w:number}> = [];
  const markerShapes = [...msMap.municipalities].sort((x,y) => Number(normalizeKey(y.name) === normalizeKey(selectedCity)) - Number(normalizeKey(x.name) === normalizeKey(selectedCity)) || (byCity.get(normalizeKey(y.name))?.cnpjs || 0) - (byCity.get(normalizeKey(x.name))?.cnpjs || 0));
  const clampPan = (x: number, y: number, level = zoom) => ({ x: Math.max(-width * (level - 1) / 2, Math.min(width * (level - 1) / 2, x)), y: Math.max(-height * (level - 1) / 2, Math.min(height * (level - 1) / 2, y)) });
  const point = (x: number, y: number) => {
    const matrix = svgRef.current?.getScreenCTM();
    return matrix ? new DOMPoint(x, y).matrixTransform(matrix.inverse()) : { x, y };
  };
  const changeZoom = (level: number) => {
    const next = Math.max(1, Math.min(3, level));
    const selected = msMap.municipalities.find(shape => normalizeKey(shape.name) === normalizeKey(selectedCity));
    const center = selected ? project(selected.cx, selected.cy) : null;
    setPan(zoom === 1 && center && next > 1 ? clampPan((width / 2 - center.x) * next, (height / 2 - center.y) * next, next) : clampPan(pan.x * next / zoom, pan.y * next / zoom, next));
    setZoom(next);
  };
  return <div className="v2-map-stage">
    <svg ref={svgRef} className="v2-map" viewBox={msMap.viewBox.join(" ")} role="group" aria-label="Mapa de Mato Grosso do Sul. Selecione uma cidade com toque ou Enter." style={{ touchAction: zoom > 1 ? "none" : "pan-y", cursor: zoom > 1 ? "grab" : "default" }}
      onPointerDown={event => {
        const p = point(event.clientX, event.clientY);
        drag.current = { ...p, panX: pan.x, panY: pan.y, moved: false, city: (event.target as Element).closest("[data-city]")?.getAttribute("data-city") || null };
        if (zoom > 1) event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        if (!drag.current) return;
        const p = point(event.clientX, event.clientY), dx = p.x - drag.current.x, dy = p.y - drag.current.y;
        if (Math.hypot(dx, dy) > 5) drag.current.moved = true;
        if (zoom > 1 && drag.current.moved) setPan(clampPan(drag.current.panX + dx, drag.current.panY + dy));
      }}
      onPointerUp={event => {
        const current = drag.current; drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        if (current?.city && !current.moved) onSelect(current.city);
      }}
      onPointerCancel={() => { drag.current = null; }}>
      <g transform={`translate(${width / 2 + pan.x} ${height / 2 + pan.y}) scale(${zoom}) translate(${-width / 2} ${-height / 2})`}>
        {tilt && [22, 15, 8].map(depth => <g key={depth} transform={`translate(0 ${depth})`} className="v3-depth" aria-hidden="true"><g transform={matrix}>{msMap.municipalities.map(shape => <path key={shape.id} d={shape.path} />)}</g></g>)}
        <g className="v2-map-top" transform={matrix}>{msMap.municipalities.map(shape => {
          const item = byCity.get(normalizeKey(shape.name)), active = normalizeKey(selectedCity) === normalizeKey(shape.name);
          return <path key={shape.id} d={shape.path} data-city={item?.name} role={item ? "button" : undefined} tabIndex={item ? 0 : undefined} aria-label={item ? `${item.name}, ${item.cnpjs} lojas` : undefined} aria-pressed={item ? active : undefined}
            className={`${item ? "covered" : ""} ${active ? "selected" : ""}`} onKeyDown={event => { if (item && ["Enter", " "].includes(event.key)) { event.preventDefault(); onSelect(item.name); } }}>
            <title>{item ? `${item.name}: ${item.cnpjs} CNPJs` : `${shape.name}: sem roteiro`}</title>
          </path>;
        })}</g>
        <g className="v2-map-markers">{markerShapes.map(shape => {
          const item = byCity.get(normalizeKey(shape.name));
          if (!item) return null;
          const radius = markerRadius(item.value, item.cnpjs, maxVolume) / Math.sqrt(zoom);
          const active = normalizeKey(selectedCity) === normalizeKey(item.name);
          const status = item.value < 0 ? "negative" : item.value > 0 ? "live" : "pending";
          const p = project(shape.cx, shape.cy);
          const mast = tilt ? (active ? 34 : 18) / Math.sqrt(zoom) : 0;
          const fontSize = 13 / Math.sqrt(zoom), labelWidth = item.name.length * fontSize * .57;
          const label = {x:p.x + radius + 6, y:p.y - mast - radius - 3, w:labelWidth};
          const showLabel = (active || zoom >= 1.75 || labelled.has(normalizeKey(item.name))) && !labelBoxes.some(box => Math.abs(box.y-label.y) < fontSize*1.5 && box.x < label.x+label.w && label.x < box.x+box.w);
          if (showLabel) labelBoxes.push(label);
          return <g key={shape.id} data-city={item.name} className={`v2-map-marker ${active ? "active" : ""}`}>
            <title>{item.name}: {item.cnpjs} CNPJs</title>
            <circle cx={p.x} cy={p.y} r={radius + 5} className="halo" />
            {tilt && <line x1={p.x} y1={p.y} x2={p.x} y2={p.y-mast} className="v3-pin-stem" />}
            <circle cx={p.x} cy={p.y-mast} r={radius+8/zoom} fill="transparent" />
            <circle cx={p.x} cy={p.y-mast} r={radius} className={status} />
            {showLabel && <text x={label.x} y={label.y} style={{ fontSize }}>{item.name}</text>}
          </g>;
        })}</g>
      </g>
    </svg>
    <div className="v2-map-controls" aria-label="Controles do mapa">
      <button onClick={() => changeZoom(zoom + .25)} disabled={zoom >= 3} aria-label="Ampliar mapa"><ZoomIn size={18} /></button>
      <button onClick={() => changeZoom(zoom - .25)} disabled={zoom <= 1} aria-label="Reduzir mapa"><ZoomOut size={18} /></button>
      <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); setRotation(-12); setTilt(true); }} aria-label="Restaurar enquadramento"><RotateCcw size={17} /></button>
      <span aria-live="polite">{Math.round(zoom * 100)}%</span>
      <button className="v3-map-mode" onClick={() => setTilt(!tilt)} aria-pressed={tilt} aria-label="Alternar visão 3D e planta">{tilt ? "3D" : "2D"}</button>
      <button onClick={() => setRotation(value => value - 15)} aria-label="Girar mapa à esquerda">↶</button>
      <button onClick={() => setRotation(value => value + 15)} aria-label="Girar mapa à direita">↷</button>
    </div>
    {zoom > 1 && <div className="v2-map-pan" aria-label="Mover mapa"><button aria-label="Mover para a esquerda" onClick={() => setPan(clampPan(pan.x + 70, pan.y))}>←</button><button aria-label="Mover para cima" onClick={() => setPan(clampPan(pan.x, pan.y + 70))}>↑</button><button aria-label="Mover para baixo" onClick={() => setPan(clampPan(pan.x, pan.y - 70))}>↓</button><button aria-label="Mover para a direita" onClick={() => setPan(clampPan(pan.x - 70, pan.y))}>→</button><small>Arraste para explorar</small></div>}
    <div className="v2-map-legend"><span><i className="live" /> saldo positivo</span><span><i className="negative" /> saldo negativo</span><span><i className="pending" /> sem valor disponível</span><b>{covered.length} cidades</b></div>
    <div className="v2-map-badge">{branch} • MS</div>
    <div className="v3-territory-caption"><span>{selectedData ? "CIDADE SELECIONADA" : "MATO GROSSO DO SUL"}</span><strong>{selectedData?.name || "79 municípios. Um território."}</strong><p>{selectedData ? `${selectedData.cnpjs} lojas · ${selectedData.promoters} promotores · ${selectedData.visits} visitas/semana` : "Selecione um município para acompanhar sua operação em todas as páginas."}</p></div>
  </div>;
}

export function DashboardV2() {
  const [branch, setBranch] = useState<Branch>("TCG");
  const [showEntrance, setShowEntrance] = useState(true);
  const [activePage, setActivePage] = useState<PageKey>("overview");
  const [period, setPeriod] = useState<Period>("media");
  const [rankingMode, setRankingMode] = useState<"stores" | "networks">("stores");
  const [city, setCity] = useState(ALL);
  const [network, setNetwork] = useState(ALL);
  const [promoter, setPromoter] = useState(ALL);
  const [query, setQuery] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState<string | null>(null);
  const [selectedStore, setSelectedStore] = useState<StoreRecord | null>(null);
  const [urlReady, setUrlReady] = useState(false);
  const [retailerStatus, setRetailerStatus] = useState(ALL);
  const programRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const operation = params.get("filial");
    if (operation === "TCG" || operation === "MCD") {
      setBranch(operation); setShowEntrance(false);
      const page = params.get("pagina");
      if (NAV_ITEMS.some(item => item.key === page)) setActivePage(page as PageKey);
      setCity(params.get("cidade") || ALL); setNetwork(params.get("rede") || ALL);
      setPromoter(params.get("promotor") || ALL); setQuery(params.get("busca") || "");
      const month = params.get("periodo");
      if (month && Object.hasOwn(PERIOD_LABELS, month)) setPeriod(month as Period);
    }
    setUrlReady(true);
  }, []);
  useEffect(() => {
    if (!urlReady) return;
    const params = new URLSearchParams();
    if (!showEntrance) {
      params.set("filial", branch); params.set("pagina", activePage); params.set("periodo", period);
      if (city !== ALL) params.set("cidade", city);
      if (network !== ALL) params.set("rede", network);
      if (promoter !== ALL) params.set("promotor", promoter);
      if (query) params.set("busca", query);
    }
    window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
  }, [urlReady, branch, showEntrance, activePage, period, city, network, promoter, query]);

  const payload = revenueByBranch[branch];
  const revenueReady = hasRevenue(payload, branch);
  const rows = useMemo(() => allocateRevenue(classifyNetworksByCnpj(branch === "TCG" ? tcgSeed.rows : mcdSeed.rows), payload, branch), [branch, payload]);
  const options = useMemo(() => ({
    cities: unique(rows.map((row) => row.cidade)).sort((a, b) => a.localeCompare(b, "pt-BR")),
    networks: unique(rows.filter((row) => row.networkKind === "network").map((row) => row.rede)).sort((a, b) => a.localeCompare(b, "pt-BR")),
    promoters: unique(rows.map((row) => row.promotor)).sort((a, b) => a.localeCompare(b, "pt-BR")),
  }), [rows]);
  const filteredRows = useMemo(() => filterOperationalRows(rows, { city, network, promoter, query }), [rows, city, network, promoter, query]);
  const hasFilters = city !== ALL || network !== ALL || promoter !== ALL || Boolean(query);
  const sendProgramScope = () => programRef.current?.contentWindow?.postMessage({ type: "ms-dashboard-scope", active: hasFilters,
    label: [city !== ALL ? city : "", network !== ALL ? network : "", promoter !== ALL ? promoter : "", query].filter(Boolean).join(" • "),
    stores: filteredRows.map(row => ({ cnpj: row.cnpj, names: [row.loja, row.razaoSocial], promoter: row.promotor })),
    catalog: rows.map(row => ({ cnpj: row.cnpj, names: [row.loja, row.razaoSocial] })),
  }, window.location.origin);
  useEffect(() => {
    sendProgramScope();
    const ready = (event: MessageEvent) => { if (event.origin === window.location.origin && event.source === programRef.current?.contentWindow && event.data?.type === "loja-perfeita-ready") sendProgramScope(); };
    window.addEventListener("message", ready);
    return () => window.removeEventListener("message", ready);
  }, [filteredRows, hasFilters, activePage]);

  const stores = useMemo(() => storeRecords(filteredRows).sort((a, b) => valueFor(b, period) - valueFor(a, period)), [filteredRows, period]);
  const cities = useMemo(() => aggregate(filteredRows, period, "cidade"), [filteredRows, period]);
  const networks = useMemo(() => aggregate(filteredRows.filter((row) => row.networkKind === "network"), period, "rede"), [filteredRows, period]);
  const promoters = useMemo(() => aggregate(filteredRows, period, "promotor"), [filteredRows, period]);
  const mapCities = useMemo(() => aggregate(filterOperationalRows(rows, { city: ALL, network, promoter, query }), period, "cidade"), [rows, network, promoter, query, period]);
  const selectedNetworkName = selectedNetwork || (network !== ALL ? network : networks[0]?.name);
  const selectedNetworkData = networks.find((item) => item.name === selectedNetworkName) || networks[0];
  const totalValue = stores.reduce((sum, store) => sum + valueFor(store, period), 0);
  const activePromoters = unique(filteredRows.map((row) => row.promotor).filter((name) => name !== "VAGA EM ABERTO")).length;
  const frequency = stores.length ? Math.round(stores.reduce((sum, store) => sum + store.frequencyValue, 0) / stores.length) : 0;
  const vacancyStores = storeRecords(filteredRows.filter((row) => row.promotor === "VAGA EM ABERTO")).length;
  const promoterCost = activePromoters * PROMOTER_MONTHLY_COST;
  const costPerStore = stores.length ? promoterCost / stores.length : 0;
  const revenuePerPromoter = activePromoters ? totalValue / activePromoters : 0;
  const costShare = totalValue ? (promoterCost / totalValue) * 100 : 0;
  const duplicateCnpjs = storeRecords(filteredRows).filter((store) => store.duplicateCount > 1).length;
  const fullPromoters = useMemo(() => aggregate(rows, period, "promotor"), [rows, period]);
  const multiCityPromoters = fullPromoters.filter(item => item.cities > 1 && item.name !== "VAGA EM ABERTO" && promoters.some(visible => visible.name === item.name));
  const cityRevenueDrops = useMemo(() => {
    const grouped = new Map<string, StoreRecord[]>();
    for (const store of storeRecords(filteredRows)) grouped.set(store.cidade, [...(grouped.get(store.cidade) || []), store]);
    return [...grouped.entries()].map(([name, cityStores]) => {
      const july = cityStores.reduce((sum, store) => sum + numeric(store.maio), 0);
      const august = cityStores.reduce((sum, store) => sum + numeric(store.junho), 0);
      return { name, july, august, drop: july > 0 ? ((july - august) / july) * 100 : 0 };
    }).filter((item) => item.july >= 10_000 && item.drop >= 60).sort((a, b) => b.drop - a.drop);
  }, [filteredRows]);
  const topCityDrop = cityRevenueDrops[0];
  const topVarejistaStores = useMemo(() => {
    const routeCnpjs = new Set(filteredRows.map((row) => normalizeCnpj(row.cnpj)).filter(Boolean));
    return topVarejista.stores.filter((store) => {
      if (city !== ALL && normalizeKey(store.cidade) !== normalizeKey(city)) return false;
      if ((network !== ALL || promoter !== ALL) && !routeCnpjs.has(normalizeCnpj(store.cnpj))) return false;
      if (query && !routeCnpjs.has(normalizeCnpj(store.cnpj)) && ![store.fantasia, store.razaoSocial, store.cidade, store.rede, store.cnpj, formatCnpj(store.cnpj)].some(value => normalizeKey(value).includes(normalizeKey(query)))) return false;
      return true;
    });
  }, [filteredRows, city, network, promoter, query]);
  const topVarejistaSummary = useMemo(() => topVarejistaStores.reduce((result, store) => {
    const state = readingState(store);
    result[state.group] += 1;
    result.read += state.group === "unread" ? 0 : 1;
    return result;
  }, { approved: 0, rejected: 0, pending: 0, unread: 0, read: 0 }), [topVarejistaStores]);
  const monthlyTotals = { junho: revenueReady ? stores.reduce((sum, row) => sum + row.abril, 0) : null, julho: revenueReady ? stores.reduce((sum, row) => sum + row.maio, 0) : null, agosto: revenueReady ? stores.reduce((sum, row) => sum + row.junho, 0) : null };
  const officialAverage = revenueReady ? stores.reduce((sum, row) => sum + row.media, 0) : null;
  const rankedStores = revenueReady ? stores.filter(store => store.cnpj && store.revenueAvailable && valueFor(store, period) > 0) : [];
  const missingRevenue = stores.filter(store => !store.revenueAvailable).length;
  const rootBilling = selectedNetworkData ? networkBilling(payload, branch, unique(selectedNetworkData.stores.map(store => cnpjRoot(store.cnpj))), new Set(rows.map(row => normalizeCnpj(row.cnpj)))) : [];
  const outsideRoute = rootBilling.filter(row => !row.inRoute);
  const trend = selectedNetworkData ? [
    { month: "FAT JUN", value: revenueReady ? selectedNetworkData.stores.reduce((sum, row) => sum + row.abril, 0) : null },
    { month: "FAT JUL", value: revenueReady ? selectedNetworkData.stores.reduce((sum, row) => sum + row.maio, 0) : null },
    { month: "FAT AGO", value: revenueReady ? selectedNetworkData.stores.reduce((sum, row) => sum + row.junho, 0) : null },
  ] : [];

  const resetFilters = () => { setCity(ALL); setNetwork(ALL); setPromoter(ALL); setQuery(""); setSelectedNetwork(null); };
  const selectCity = (name: string) => { setCity((current) => normalizeKey(current) === normalizeKey(name) ? ALL : name); setSelectedNetwork(null); setSelectedStore(null); };
  const changeBranch = (next: Branch) => { setBranch(next); resetFilters(); setActivePage("overview"); setSelectedStore(null); setShowEntrance(false); };
  const openPage = (page: PageKey) => { setActivePage(page); setMobileNav(false); };
  const openNetwork = (name: string) => { setSelectedNetwork(name); setNetwork(ALL); setActivePage("networks"); };

  const pageTitle: Record<PageKey, [string, string]> = {
    overview: ["Visão geral", "Território, faturamento e exceções no mesmo comando"],
    networks: ["Redes e faturamento", "Clique na rede para abrir seus CNPJs e a evolução lado a lado"],
    top10: ["Top 10", "Lojas e redes que lideram o faturamento"],
    stores: ["Lojas e CNPJs", "Cliente, rede, território e faturamento por CNPJ"],
    promoters: ["Promotores", "Cobertura, frequência inteira e atuação multicidade"],
    program: [branch === "TCG" ? "Loja Perfeita" : "Top Varejista", branch === "TCG" ? "Execução de gôndola, checkstand e terminais ativos" : "Execução de varejo e cobertura dos pontos prioritários"],
  };

  const renderOverview = () => <>
    <section className="v2-bi-strip">
      <div className="v2-bi-source"><Database size={20} /><div><span>POWER BI • MONDELEZ</span><strong>{branch} / FATURAMENTO</strong><small>{revenueReady ? `Exportado em ${payload.meta.updatedAt || "data não informada"} • jun–ago/2026` : "Aguardando exportação autorizada MCD MS"}</small></div></div>
      <div className="v2-bi-average"><span>MÉDIA DO RECORTE</span><strong>{formatCompact(officialAverage)}</strong><small>{revenueReady ? "CNPJs do roteiro MS • acompanha os filtros" : "Nenhum valor de planilha é usado como substituto"}</small></div>
      <div className="v2-bi-months"><div><span>FAT JUN</span><strong>{formatCompact(monthlyTotals.junho)}</strong></div><div><span>FAT JUL</span><strong>{formatCompact(monthlyTotals.julho)}</strong></div><div><span>FAT AGO</span><strong>{formatCompact(monthlyTotals.agosto)}</strong></div></div>
      <a href={POWER_BI_URL} target="_blank" rel="noreferrer">Abrir BI <ArrowUpRight size={15} /></a>
    </section>
    <div className="v2-revenue-note" role="status"><Database size={17} /><p>{revenueReady ? <>Fonte exclusiva: exportação do Power BI TCG, cruzada pelo CNPJ completo com o roteiro MS. <b>{missingRevenue} CNPJs sem correspondência</b>. Média dos três meses exportados; fechamento mensal não confirmado. Esta versão não é uma conexão em tempo real.</> : <>Faturamento MCD indisponível até receber uma exportação da filial MCD, fornecedor Mondelez e UF MS. <b>Valores TCG e valores da planilha não são usados como substitutos.</b></>}</p></div><section className="v2-kpi-grid">
      <Kpi accent label={PERIOD_LABELS[period]} value={revenueReady ? formatCompact(totalValue) : "—"} detail={`${stores.length - missingRevenue}/${stores.length} CNPJs encontrados no BI`} icon={BarChart3} />
      <Kpi label="Promotores ativos" value={formatInteger(activePromoters)} detail={`${multiCityPromoters.length} com atuação multicidade`} icon={Users} />
      <Kpi label="Lojas / CNPJs" value={formatInteger(stores.length)} detail={`${duplicateCnpjs} CNPJs duplicados na origem`} icon={Store} />
      <Kpi label="Cidades" value={formatInteger(cities.length)} detail={`${networks.length} redes no recorte`} icon={MapPin} />
      <Kpi label="Frequência" value={`${frequency}X`} detail="Média semanal arredondada" icon={CircleGauge} />
      <Kpi label="Custo promotores" value={formatCompact(promoterCost)} detail={`${activePromoters} × R$ 5 mil/mês`} icon={Users} />
    </section>
    <section className="v2-overview-grid">
      <article className="v2-card v2-map-card"><header><div><span className="v2-eyebrow">PRESENÇA OPERACIONAL</span><h2>Mapa 3D por cidade</h2></div><small>Toque em uma cidade para filtrar todas as páginas</small></header><TerritoryMap key={branch} cityData={mapCities} selectedCity={city} onSelect={selectCity} branch={branch} /></article>
      <aside className="v2-overview-side">
        <article className="v2-card"><header><div><span className="v2-eyebrow">AÇÃO IMEDIATA</span><h2>Exceções do roteiro</h2></div></header><div className="v2-signal-list">
          <button onClick={() => { setPromoter("VAGA EM ABERTO"); openPage("stores"); }}><AlertTriangle size={18} /><span><strong>{vacancyStores} lojas sem promotor</strong><small>Abrir lista por CNPJ</small></span><ChevronRight size={16} /></button>
          {topCityDrop && <button onClick={() => { setCity(topCityDrop.name); openPage("stores"); }}><AlertTriangle size={18} /><span><strong>{topCityDrop.name}: queda de {formatInteger(topCityDrop.drop)}%</strong><small>FAT AGO contra FAT JUL • abrir CNPJs</small></span><ChevronRight size={16} /></button>}
          <button onClick={() => openPage("promoters")}><MapPin size={18} /><span><strong>{multiCityPromoters.length} promotores multicidade</strong><small>Ver cidades e redes atendidas</small></span><ChevronRight size={16} /></button>
          <button onClick={() => openPage("stores")}><Database size={18} /><span><strong>{duplicateCnpjs} CNPJs duplicados</strong><small>Conferir cadastros do roteiro</small></span><ChevronRight size={16} /></button>
        </div></article>
        <article className="v2-card v2-cnpj-rank"><header><div><span className="v2-eyebrow">RANKING POR CNPJ</span><h2>CNPJs que mais faturaram</h2></div><small>{PERIOD_LABELS[period]}</small></header>{!rankedStores.length && <p className="v2-empty">{revenueReady ? "Sem saldo positivo no recorte." : "Aguardando faturamento BI MCD MS."}</p>}<div className="v2-cnpj-rank-list">{rankedStores.slice(0, 8).map((store, index) => <button key={store.cnpj || store.id} onClick={() => setSelectedStore(store)}><b>{String(index + 1).padStart(2, "0")}</b><span><strong>{store.loja}</strong><small>{formatCnpj(store.cnpj)} • {store.cidade}</small></span><em>{formatCompact(valueFor(store, period))}</em><ChevronRight size={15} /></button>)}</div></article>
      </aside>
    </section>
    <section className="v2-cost-strip" aria-label="Custo de promotores comparado ao roteiro">
      <div><span>CUSTO X ROTEIRO</span><strong>{formatCompact(promoterCost)}</strong><small>Custo mensal da equipe ativa</small></div>
      <div><span>CUSTO POR CNPJ</span><strong>{formatCompact(costPerStore)}</strong><small>{stores.length} lojas únicas no recorte</small></div>
      <div><span>FATURAMENTO / PROMOTOR</span><strong>{revenueReady ? formatCompact(revenuePerPromoter) : "—"}</strong><small>Produtividade comercial média</small></div>
      <div><span>CUSTO SOBRE FAT.</span><strong>{revenueReady && totalValue > 0 ? `${costShare.toFixed(1).replace(".", ",")}%` : "—"}</strong><small>Quanto a equipe representa no faturamento</small></div>
      <div><span>VAGAS NO ROTEIRO</span><strong>{formatInteger(vacancyStores)}</strong><small>Lojas ainda sem promotor</small></div>
    </section>
  </>;

  const renderNetworks = () => <section className="v2-master-detail">
    <article className="v2-card v2-master-list"><header><div><span className="v2-eyebrow">TOP REDES</span><h2>{networks.length} redes no recorte</h2></div></header><div>{networks.map((item, index) => <button key={item.name} className={selectedNetworkData?.name === item.name ? "active" : ""} onClick={() => setSelectedNetwork(item.name)}><b>{String(index + 1).padStart(2, "0")}</b><span><strong>{item.name}</strong><small>{item.cnpjs} CNPJs • {item.cities} cidades</small></span><em>{revenueReady ? formatCompact(item.value) : `${item.cnpjs} lojas`}</em><ChevronRight size={15} /></button>)}</div></article>
    <article className="v2-card v2-detail-panel">{selectedNetworkData ? <><header><div><span className="v2-eyebrow">REDE SELECIONADA • LOJAS DO RECORTE</span><h2>{selectedNetworkData.name}</h2></div><strong>{revenueReady ? formatCompact(selectedNetworkData.value) : "Faturamento pendente"}</strong></header><div className="v2-detail-kpis"><div><span>CNPJs</span><b>{selectedNetworkData.cnpjs}</b></div><div><span>Cidades</span><b>{selectedNetworkData.cities}</b></div><div><span>Promotores</span><b>{selectedNetworkData.promoters}</b></div><div><span>Visitas/semana</span><b>{selectedNetworkData.visits}</b></div></div><div className="v2-network-evolution"><div><span className="v2-eyebrow">EVOLUÇÃO DE FATURAMENTO</span><h3>{selectedNetworkData.name}</h3></div><ResponsiveContainer width="100%" height={230}><AreaChart data={trend} margin={{ left: 8, right: 8, top: 8 }}><defs><linearGradient id="v2area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--v2-accent)" stopOpacity={0.42} /><stop offset="100%" stopColor="var(--v2-accent)" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid vertical={false} stroke="var(--v2-grid)" /><XAxis dataKey="month" axisLine={false} tickLine={false} stroke="var(--v2-muted)" /><YAxis hide /><Tooltip formatter={(value) => formatMoney(Number(value))} contentStyle={{ background: "var(--v2-elevated)", border: "1px solid var(--v2-border)", borderRadius: 12 }} /><Area isAnimationActive={false} dataKey="value" stroke="var(--v2-accent)" strokeWidth={3} fill="url(#v2area)" dot={{ fill: "var(--v2-surface)", stroke: "var(--v2-accent)", strokeWidth: 3, r: 5 }} /></AreaChart></ResponsiveContainer></div>{outsideRoute.length > 0 && <details className="v2-billing-context"><summary><AlertTriangle size={17} /> {outsideRoute.length} CNPJ(s) da mesma raiz fora do roteiro</summary><p>Estes lançamentos estão no arquivo BI, mas não são atribuídos a uma loja, cidade ou promotor deste roteiro. Não entram nos KPIs filtrados. A UF desses CNPJs não está informada na exportação.</p><div className="v2-billing-table"><div><b>CNPJ fora do roteiro</b><b>FAT JUN</b><b>FAT JUL</b><b>FAT AGO</b></div>{outsideRoute.map(item => <div key={item.cnpj}><span>{formatCnpj(item.cnpj)}</span><strong>{formatMoney(item.abril)}</strong><strong>{formatMoney(item.maio)}</strong><strong>{formatMoney(item.junho)}</strong></div>)}</div></details>}<div className="v2-cnpj-list"><div className="v2-list-head"><span>Cliente e CNPJ</span><span>Cidade</span><span>{PERIOD_LABELS[period]}</span></div>{[...selectedNetworkData.stores].sort((a, b) => valueFor(b, period) - valueFor(a, period)).map((store) => <button key={store.cnpj || store.id} onClick={() => setSelectedStore(store)}><span><strong>{store.loja}</strong><small>{formatCnpj(store.cnpj)}</small></span><span>{store.cidade}</span><b>{store.revenueAvailable ? formatCompact(valueFor(store, period)) : "Sem valor BI"}</b></button>)}</div></> : <div className="v2-empty">Selecione uma rede.</div>}</article>
  </section>;

  const renderTop10 = () => {
    const leaders = rankingMode === "stores"
      ? rankedStores.slice(0,10).map(store => ({ id: store.cnpj || store.id, name:store.loja, subtitle:`${formatCnpj(store.cnpj)} · ${store.rede}`, context:store.cidade, value:valueFor(store,period), open:() => setSelectedStore(store) }))
      : networks.filter(item => item.value > 0).slice(0,10).map(item => ({ id:item.name, name:item.name, subtitle:`${item.cnpjs} CNPJs · ${item.cities} cidades`, context:`${item.promoters} promotores`, value:item.value, open:() => openNetwork(item.name) }));
    const maximum = Math.max(1,...leaders.map(item => item.value));
    return <section className="v2-card v2-ranking-page v3-leaderboard"><header><div><span className="v2-eyebrow">LIDERANÇA COMERCIAL</span><h2>Quem mais fatura no recorte</h2></div><small>{PERIOD_LABELS[period]} · {branch} MS</small></header>
      <div className="v3-ranking-switch" aria-label="Tipo de ranking"><button aria-pressed={rankingMode === "stores"} onClick={() => setRankingMode("stores")}><Store size={17}/>Top 10 lojas</button><button aria-pressed={rankingMode === "networks"} onClick={() => setRankingMode("networks")}><Network size={17}/>Top 10 redes</button></div>
      {!revenueReady ? <div className="v3-pending"><Database size={32}/><h3>Pronto para receber o faturamento MCD</h3><p>O ranking será preenchido quando a base Mondelez de MS estiver disponível. Lojas, roteiro e promotores já podem ser consultados.</p><button onClick={() => openPage("stores")}>Explorar lojas e CNPJs <ChevronRight size={17}/></button></div> : !leaders.length ? <div className="v2-empty">Nenhum saldo positivo neste recorte.</div> : <div className="v3-rank-rows">{leaders.map((item,index) => <button key={item.id} onClick={item.open}><b>{String(index+1).padStart(2,"0")}</b><div><strong>{item.name}</strong><small>{item.subtitle}</small><div className="v3-rank-track"><i style={{width:`${item.value/maximum*100}%`}}/></div></div><span>{item.context}</span><em>{formatCompact(item.value)}</em><ChevronRight size={18}/></button>)}</div>}
    </section>;
  };

  const renderStores = () => <section className="v2-card v2-ranking-page"><header><div><span className="v2-eyebrow">RANKING POR CNPJ</span><h2>{stores.length} lojas no recorte</h2></div><small>Clique para abrir os dados do cliente</small></header><div className="v2-store-table"><div className="v2-store-head"><span>#</span><span>Cliente / CNPJ</span><span>Rede</span><span>Cidade</span><span>Promotor</span><span>{PERIOD_LABELS[period]}</span></div>{stores.map((store, index) => <button key={`${store.cnpj}-${index}`} onClick={() => setSelectedStore(store)}><b>{String(index + 1).padStart(2, "0")}</b><span><strong>{store.loja}</strong><small>{formatCnpj(store.cnpj)}{store.duplicateCount > 1 ? ` • ${store.duplicateCount} cadastros` : ""}</small></span><span>{store.rede}</span><span>{store.cidade}</span><span>{store.promoterNames.join(" • ")}</span><strong>{store.revenueAvailable ? formatCompact(valueFor(store, period)) : "Sem valor BI"}</strong></button>)}</div></section>;

  const renderPromoters = () => <section className="v2-card v2-ranking-page"><header><div><span className="v2-eyebrow">COBERTURA DE CAMPO</span><h2>{promoters.filter((item) => item.name !== "VAGA EM ABERTO").length} promotores</h2></div><small>R$ 5 mil mensais por promotor • frequência sem casas decimais</small></header>{multiCityPromoters.length > 0 && <div className="v2-multicity"><MapPin size={18} /><div><strong>{multiCityPromoters.length} promotores atendem mais de uma cidade</strong><span>{multiCityPromoters.slice(0, 5).map((item) => `${item.name} (${item.cities})`).join(" • ")}</span></div></div>}<div className="v2-promoter-grid">{promoters.map((item) => { const frequencyValue = item.stores.length ? Math.round(item.visits / item.stores.length) : 0; const isVacancy = item.name === "VAGA EM ABERTO"; const full = fullPromoters.find(person => person.name === item.name); return <article key={item.name} className={isVacancy ? "vacancy" : ""}><div className="v2-avatar">{isVacancy ? "!" : item.name.slice(0, 2)}</div><div><strong>{item.name}</strong><span>{item.cities} cidades • {item.cnpjs} CNPJs • {item.networks} rede(s)</span>{full && full.cities > 1 && <small><MapPin size={12} /> Também atende: {unique(full.rows.map(row => row.cidade)).join(" • ")}</small>}</div><b>{frequencyValue}X</b><div className="v2-promoter-metrics"><em>{revenueReady ? formatCompact(item.value) : `${item.visits} visitas`}</em><small>{isVacancy ? "Custo ainda não contratado" : "Custo R$ 5 mil/mês"}</small></div></article>; })}</div></section>;

  const renderProgram = () => branch === "TCG"
    ? <section className="v2-program-embed"><iframe ref={programRef} src="/loja-perfeita.html?embedded=1" title="Painel Loja Perfeita" onLoad={sendProgramScope} /></section>
    : <section className="v2-program-page">
      <div className="v2-program-hero"><span>TOP VAREJISTA • MCD MS</span><h2>Quem leu, quem está pendente</h2><p>Última cópia disponível do controle de lojas Ouro e Prata. Os status vêm da última coleta, não da aprovação do cadastro.</p><small><FileSpreadsheet size={14} /> {topVarejista.meta.source} • atualizado em {topVarejista.meta.updatedAt}</small></div>
      <div className="v2-program-kpis"><Kpi label="Lojas no programa" value={formatInteger(topVarejistaStores.length)} detail={`${topVarejistaStores.filter(store => normalizeKey(store.tier) === "OURO").length} Ouro • ${topVarejistaStores.filter(store => normalizeKey(store.tier) === "PRATA").length} Prata`} icon={Store} /><Kpi label="Lojas lidas" value={formatInteger(topVarejistaSummary.read)} detail={`${topVarejistaStores.length ? Math.round(topVarejistaSummary.read / topVarejistaStores.length * 100) : 0}% do recorte`} icon={Eye} /><Kpi label="Aprovadas" value={formatInteger(topVarejistaSummary.approved)} detail="Leitura concluída" icon={CheckCircle2} /><Kpi label="Reprovadas" value={formatInteger(topVarejistaSummary.rejected)} detail="Precisam de correção" icon={AlertTriangle} /><Kpi label="Sem leitura" value={formatInteger(topVarejistaSummary.unread)} detail={`${topVarejistaSummary.pending} em aprovação`} icon={Clock3} /></div>
      <article className="v2-card v2-read-progress"><div><span className="v2-eyebrow">COBERTURA DA LEITURA</span><h3>{topVarejistaSummary.read} de {topVarejistaStores.length} lojas lidas</h3><p>Status da coleta • período {topVarejista.meta.period}</p></div><div className="v2-progress-track"><i style={{ width: `${topVarejistaStores.length ? topVarejistaSummary.read / topVarejistaStores.length * 100 : 0}%` }} /></div></article>
      <article className="v2-card v2-top-retailers"><header><div><span className="v2-eyebrow">LEITURA POR LOJA</span><h2>{topVarejistaStores.length} varejistas no recorte</h2></div><small>CNPJ, rede, cidade e última coleta</small></header><div className="v2-status-filters" aria-label="Filtrar situação da leitura">{[{ key: ALL, label: "Todas", count: topVarejistaStores.length }, { key: "rejected", label: "Reprovadas", count: topVarejistaSummary.rejected }, { key: "approved", label: "Aprovadas", count: topVarejistaSummary.approved }, { key: "unread", label: "Sem leitura", count: topVarejistaSummary.unread }, { key: "pending", label: "Em aprovação", count: topVarejistaSummary.pending }].map(item => <button key={item.key} className={`${item.key} ${retailerStatus === item.key ? "active" : ""}`} aria-pressed={retailerStatus === item.key} onClick={() => setRetailerStatus(item.key)}>{item.label} <b>{item.count}</b></button>)}</div><div className="v2-retailer-head"><span>Status</span><span>Cliente / CNPJ</span><span>Rede</span><span>Cidade</span><span>Nível</span><span>Última coleta</span></div><div className="v2-retailer-list">{[...topVarejistaStores].filter(store => retailerStatus === ALL || readingState(store).group === retailerStatus).sort((a, b) => ({ rejected: 0, unread: 1, pending: 2, approved: 3 }[readingState(a).group] - { rejected: 0, unread: 1, pending: 2, approved: 3 }[readingState(b).group]) || a.fantasia.localeCompare(b.fantasia, "pt-BR")).map((store) => { const state = readingState(store); return <article key={store.cnpj} className={`status-${state.group}`}><span className={`v2-reading-status ${state.group}`}>{state.label}</span><span><strong>{store.fantasia}</strong><small>{formatCnpj(store.cnpj)}</small></span><span>{store.rede}</span><span>{store.cidade}<small>{store.bairro}</small></span><b>{store.tier}</b><span>{store.latestCollection ? <><strong>{store.latestCollection.auditStatus || "Coleta registrada"}</strong><small>{Math.round(store.latestCollection.compliance * 100)}% de cumprimento</small></> : <><strong>Sem leitura</strong><small>Aguardando coleta</small></>}</span></article>; })}</div></article>
    </section>;

  if (showEntrance) {
    return <main className="v2-landing">
      <div className="v2-landing-glow" />
      <header><span>MS INTELLIGENCE</span><h1>Escolha a operação</h1><p>Dois centros de comando, uma leitura completa do território.</p></header>
      <section className="v2-portal-grid">
        <button className="v2-portal-card tcg" onClick={() => changeBranch("TCG")}>
          <div className="v2-portal-logos"><img src="/triunfante-logo.png" alt="Triunfante" /><i /><img src="/mondelez-logo.png" alt="Mondelez International" /></div>
          <span>FILIAL TCG</span><h2>Loja Perfeita</h2><p>Faturamento, redes, CNPJs, promotores e execução de gôndola.</p><strong>Entrar no painel <ChevronRight size={19} /></strong>
        </button>
        <button className="v2-portal-card mcd" onClick={() => changeBranch("MCD")}>
          <div className="v2-portal-logos"><img src="/triunfante-logo.png" alt="Triunfante" /><i /><img src="/mondelez-logo.png" alt="Mondelez International" /></div>
          <span>FILIAL MCD</span><h2>Top Varejista</h2><p>Roteiro, faturamento, lojas lidas, terminais e checkstand.</p><strong>Entrar no painel <ChevronRight size={19} /></strong>
        </button>
      </section>
      <footer><ShieldCheck size={15} /> Acesso público por endereço • dados pessoais bloqueados</footer>
    </main>;
  }

  return <main className={`v2-root branch-${branch.toLowerCase()}`}>
    <Toaster theme="dark" position="top-right" richColors />
    <aside className={`v2-sidebar ${mobileNav ? "open" : ""}`}>
      <div className="v2-brand"><div className="v2-brand-mark">{branch === "TCG" ? <Sparkles size={22} /> : <span>M</span>}</div><div><strong>{branch === "TCG" ? "Loja Perfeita" : "MCD Intelligence"}</strong><small>{branch === "TCG" ? "TRIUNFANTE • MS" : "FIELD COMMAND • MS"}</small></div><button onClick={() => setMobileNav(false)} aria-label="Fechar menu"><X size={18} /></button></div>
      <button className="v2-change-operation" onClick={() => setShowEntrance(true)}><Building2 size={16} /><span>Trocar operação</span><b>{branch}</b></button>
      <nav>{NAV_ITEMS.map((item) => { const Icon = item.icon; const label = item.key === "program" ? (branch === "TCG" ? "Loja Perfeita" : "Top Varejista") : item.key === "top10" ? "Top 10 lojas e redes" : item.label; return <button key={item.key} className={activePage === item.key ? "active" : ""} onClick={() => openPage(item.key)}><Icon size={18} /><span>{label}</span>{item.key === "top10" && <b>10</b>}<ChevronRight size={15} /></button>; })}</nav>
      <div className="v2-sidebar-source"><span>ROTEIRO ATIVO</span><strong>{branch === "TCG" ? "Info Geral New • cópia do roteiro" : mcdSeed.meta.source}</strong><small>{branch === "MCD" ? "179 linhas • 176 CNPJs únicos" : `${tcgSeed.rows.length} linhas operacionais`}</small>{branch === "TCG" && <a href={INFO_NEW_ONLINE_URL} target="_blank" rel="noreferrer"><FileSpreadsheet size={15} /> Abrir roteiro online</a>}<em>Faturamento: somente Power BI por CNPJ.</em></div>
    </aside>
    {mobileNav && <button className="v2-backdrop" onClick={() => setMobileNav(false)} aria-label="Fechar menu" />}
    <section className="v2-workspace">
      <header className="v2-topbar"><button className="v2-menu" onClick={() => setMobileNav(true)} aria-label="Abrir menu"><Menu size={20} /></button><div><span>{branch} • COMMAND CENTER</span><h1>{pageTitle[activePage][0]}</h1><p>{pageTitle[activePage][1]}</p></div><div className="v2-top-actions"><a href={POWER_BI_URL} target="_blank" rel="noreferrer">Power BI <ArrowUpRight size={15} /></a><div className={`v2-status ${revenueReady ? "ready" : "pending"}`}><i />{revenueReady ? "BI • exportação" : "BI pendente"}</div></div></header>
      <section className="v2-filters"><div className="v2-search"><Search size={16} /><input aria-label="Buscar loja, CNPJ, rede, cidade ou promotor" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar loja, CNPJ, rede, cidade ou promotor" />{query && <button onClick={() => setQuery("")}><X size={15} /></button>}</div><select aria-label="Cidade" value={city} onChange={(event) => { setCity(event.target.value); setSelectedNetwork(null); setSelectedStore(null); }}><option value={ALL}>Todas as cidades</option>{options.cities.map((name) => <option key={name}>{name}</option>)}</select><select aria-label="Rede" value={network} onChange={(event) => { setNetwork(event.target.value); setSelectedNetwork(null); }}><option value={ALL}>Todas as redes</option>{options.networks.map((name) => <option key={name}>{name}</option>)}</select><select aria-label="Promotor" value={promoter} onChange={(event) => { setPromoter(event.target.value); setSelectedNetwork(null); }}><option value={ALL}>Todos os promotores</option>{options.promoters.map((name) => <option key={name}>{name}</option>)}</select><div className="v2-periods">{(["abril", "maio", "junho", "media"] as Period[]).map((key) => <button key={key} className={period === key ? "active" : ""} onClick={() => setPeriod(key)}>{key === "media" ? "Média" : PERIOD_SHORT[key]}</button>)}</div>{(query || city !== ALL || network !== ALL || promoter !== ALL) && <button className="v2-clear" onClick={resetFilters}><X size={14} /> Limpar</button>}</section>
      {(city !== ALL || network !== ALL || promoter !== ALL || query) && <div className="v2-active-scope"><b>FILTRO ATIVO EM TODAS AS PÁGINAS</b><span>{[city !== ALL ? city : "", network !== ALL ? network : "", promoter !== ALL ? promoter : "", query].filter(Boolean).join(" • ")}</span><button onClick={resetFilters}><X size={14} /> Limpar</button></div>}
      <div className="v2-page">{activePage === "overview" && renderOverview()}{activePage === "networks" && renderNetworks()}{activePage === "top10" && renderTop10()}{activePage === "stores" && renderStores()}{activePage === "promoters" && renderPromoters()}{activePage === "program" && renderProgram()}</div>
      <footer className="v2-footer"><span><ShieldCheck size={14} /> Dados pessoais bloqueados</span><span><Database size={14} /> Faturamento deduplicado por CNPJ</span><span><CircleGauge size={14} /> Frequência exibida em número inteiro</span></footer>
    </section>
    {selectedStore && <div className="v2-drawer-wrap"><button className="v2-drawer-backdrop" onClick={() => setSelectedStore(null)} aria-label="Fechar detalhe" /><aside className="v2-store-drawer" role="dialog" aria-modal="true" aria-label="Detalhe do cliente"><button className="v2-drawer-close" aria-label="Fechar detalhe do cliente" onClick={() => setSelectedStore(null)}><X size={19} /></button><span className="v2-eyebrow">DETALHE DO CLIENTE</span><h2>{selectedStore.loja}</h2><p>{selectedStore.razaoSocial || "Razão social não informada"}</p><div className="v2-drawer-value"><span>{PERIOD_LABELS[period]}</span><strong>{selectedStore.revenueAvailable ? formatCompact(valueFor(selectedStore, period)) : "Sem valor BI disponível"}</strong><small>{selectedStore.fonteFaturamento || "Fonte operacional"}</small></div><div className="v3-client-months">{(["abril","maio","junho"] as const).map(month => <div key={month}><span>{PERIOD_LABELS[month]}</span><strong>{selectedStore.revenueAvailable ? formatMoney(valueFor(selectedStore,month)) : "Pendente"}</strong></div>)}</div><dl><div><dt>CNPJ</dt><dd>{formatCnpj(selectedStore.cnpj) || "CNPJ pendente na base"}</dd></div><div><dt>Rede</dt><dd>{selectedStore.rede}</dd></div><div><dt>Cidade</dt><dd>{selectedStore.cityNames.join(" • ")}</dd></div><div><dt>Promotor</dt><dd>{selectedStore.promoterNames.join(" • ")}</dd></div><div><dt>Frequência</dt><dd>{selectedStore.frequencyValue}X</dd></div>{selectedStore.enderecoComercial && <div><dt>Endereço comercial</dt><dd>{selectedStore.enderecoComercial}</dd></div>}{selectedStore.duplicateCount > 1 && <div className="warning"><dt>Conferência</dt><dd>Este CNPJ aparece em {selectedStore.duplicateCount} cadastros no roteiro.</dd></div>}</dl>{selectedStore.networkKind === "network" && <button className="v2-open-network" onClick={() => { openNetwork(selectedStore.rede); setSelectedStore(null); }}><Network size={16} /> Abrir rede e todos os CNPJs</button>}</aside></div>}
  </main>;
}
