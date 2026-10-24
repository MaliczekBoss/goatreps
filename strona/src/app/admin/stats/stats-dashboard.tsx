"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AgentLogo } from "@/components/agent-logo";
import { NO_TRACK_KEY } from "@/components/analytics";
import MagicBento, { type MagicBentoItem } from "@/components/magic-bento";
import { isSource, sources, type Range } from "@/lib/analytics/shared";
import type { Bucket, StatsReport } from "@/lib/analytics/stats";
import { AGENTS } from "@/lib/settings";
import { AGENT_KEYS, type AgentKey } from "@/lib/types";
import { AdminHeader } from "../admin-header";

export type CatalogSummary = {
  products: number;
  categories: number;
  pricesSynced: number;
  pricesFresh: number;
  qcChecked: number;
  qcWithPhotos: number;
  qcPhotos: number;
};

const RANGES: { id: Range; label: string; period: string }[] = [
  { id: "today", label: "Dziś", period: "Dziś" },
  { id: "yesterday", label: "Wczoraj", period: "Wczoraj" },
  { id: "7d", label: "7 dni", period: "Ostatnie 7 dni" },
  { id: "30d", label: "30 dni", period: "Ostatnie 30 dni" },
];
const PREV_LABEL: Record<Range, string> = { today: "Wczoraj", yesterday: "Przedwczoraj", "7d": "Poprzednie 7 dni", "30d": "Poprzednie 30 dni" };
const REFRESH_MS = 30_000;

const nf = new Intl.NumberFormat("pl-PL");
const compact = new Intl.NumberFormat("pl-PL", { notation: "compact", maximumFractionDigits: 1 });
const countries = new Intl.DisplayNames(["pl"], { type: "region" });

const num = (n: number) => (n >= 10_000 ? compact.format(n) : nf.format(Math.round(n)));
const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "0%");
const duration = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m ? `${m}m ${sec}s` : `${sec}s`;
};

type Metric = {
  id: string;
  label: string;
  value: (t: StatsReport["totals"]) => number;
  bucket: (b: Bucket) => number;
  format: (n: number) => string;
  lowerIsBetter?: boolean;
};

const bounce = (s: number, ms: number) => (s ? Math.max(0, 1 - ms / s) * 100 : 0);

const METRICS: Metric[] = [
  { id: "uv", label: "Unikalni odwiedzający", value: (t) => t.uv, bucket: (b) => b.uv, format: num },
  { id: "s", label: "Sesje", value: (t) => t.s, bucket: (b) => b.s, format: num },
  { id: "pv", label: "Odsłony", value: (t) => t.pv, bucket: (b) => b.pv, format: num },
  { id: "pps", label: "Stron na sesję", value: (t) => ratio(t.pv, t.s), bucket: (b) => ratio(b.pv, b.s), format: (n) => n.toFixed(1).replace(".", ",") },
  {
    id: "bounce",
    label: "Odrzucenia",
    value: (t) => bounce(t.s, t.ms),
    bucket: (b) => bounce(b.s, b.ms),
    format: (n) => `${n.toFixed(1).replace(".", ",")}%`,
    lowerIsBetter: true,
  },
  { id: "dur", label: "Średni czas sesji", value: (t) => ratio(t.dur, t.s), bucket: (b) => ratio(b.dur, b.s), format: duration },
  { id: "out", label: "Kliknięcia do agentów", value: (t) => t.out, bucket: (b) => b.out, format: num },
  { id: "promo", label: "Oferta KakoBuy (−50%)", value: (t) => t.promo, bucket: (b) => b.promo, format: num },
  { id: "search", label: "Wyszukiwania", value: (t) => t.search, bucket: (b) => b.search, format: num },
];

const PAGE_LABELS: Record<string, string> = {
  "/": "Strona główna",
  "/products": "Produkty",
  "/qc-finder": "QC Finder",
  "/link-converter": "Konwerter linków",
  "/tracking": "Śledzenie paczek",
  "/shipping": "Kalkulator wysyłki",
  "/tools": "Narzędzia",
  "/photo-search": "Szukaj po zdjęciu",
  "/inne": "Inne strony",
};

const DEVICE_LABELS: Record<string, string> = { mobile: "Telefon", desktop: "Komputer", tablet: "Tablet" };

const isAgent = (v: string): v is AgentKey => (AGENT_KEYS as readonly string[]).includes(v);

// tło kart w kolorach strony (domyślne MagicBento jest lekko fioletowe)
const BENTO_STYLE = {
  "--mb-surface": "linear-gradient(180deg, rgb(24 24 27 / 0.92) 0%, rgb(12 12 14 / 0.94) 100%)",
  "--mb-edge": "rgba(255, 255, 255, 0.08)",
  "--mb-highlight": "rgba(255, 255, 255, 0.05)",
} as React.CSSProperties;

export function StatsDashboard({ catalog }: { catalog: CatalogSummary }) {
  const [range, setRange] = useState<Range>("today");
  const [report, setReport] = useState<StatsReport | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const load = useCallback(
    (r: Range) =>
      fetch(`/api/admin/stats?range=${r}`, { cache: "no-store" })
        .then(async (res) => {
          if (res.status === 401) return router.replace("/admin/login");
          if (!res.ok) throw new Error(String(res.status));
          setReport(await res.json());
          setError(false);
        })
        .catch(() => setError(true))
        .finally(() => setLoading(false)),
    [router],
  );

  useEffect(() => {
    load(range);
    const timer = window.setInterval(() => document.visibilityState === "visible" && load(range), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [range, load]);

  const period = RANGES.find((r) => r.id === range)!;
  const time = report ? new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(report.updatedAt) : "";

  const items: MagicBentoItem[] = [
    ...METRICS.slice(0, 3).map((m) => ({ id: m.id, content: <StatTile metric={m} report={report} period={period.period} /> })),
    { id: "live", content: <LiveTile report={report} /> },
    ...METRICS.slice(3).map((m) => ({ id: m.id, content: <StatTile metric={m} report={report} period={period.period} /> })),
    { id: "catalog", colSpan: 2, content: <CatalogTile catalog={catalog} /> },
    {
      id: "chart",
      colSpan: 4,
      rowSpan: 2,
      content: (
        <section aria-labelledby="chart-title" className="flex h-full min-h-0 flex-col">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="chart-title" className="font-semibold text-white">
              Unikalni odwiedzający
            </h2>
            <div className="flex gap-4 text-xs text-zinc-400">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-0.5 w-4 rounded bg-zinc-100" />
                {period.period}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-0.5 w-4 rounded bg-zinc-600" />
                {PREV_LABEL[range]}
              </span>
            </div>
          </div>
          {report ? <LineChart report={report} /> : <div className="mt-4 min-h-0 flex-1 animate-pulse rounded-xl bg-white/[0.03]" />}
        </section>
      ),
    },
    {
      id: "pages",
      colSpan: 2,
      rowSpan: 2,
      content: (
        <Breakdown
          title="Najczęściej oglądane strony"
          rows={report?.breakdown.pages}
          render={(path) => {
            const id = path.match(/^\/item\/details\/(\d+)$/)?.[1];
            return <span className="truncate">{id ? (report?.productNames[id] ?? path) : (PAGE_LABELS[path] ?? path)}</span>;
          }}
        />
      ),
    },
    {
      id: "products",
      colSpan: 2,
      rowSpan: 2,
      content: (
        <Breakdown
          title="Najpopularniejsze produkty"
          rows={report?.breakdown.products}
          empty="Nikt jeszcze nie oglądał produktów w tym okresie."
          render={(id) => (
            <Link href={`/item/details/${id}`} target="_blank" className="truncate hover:text-white hover:underline">
              {report?.productNames[id] ?? `Produkt ${id}`}
            </Link>
          )}
        />
      ),
    },
    {
      id: "sources",
      colSpan: 2,
      rowSpan: 2,
      content: (
        <Breakdown
          title="Źródła ruchu"
          rows={report?.breakdown.sources}
          render={(id) => (
            <span className="flex min-w-0 items-center gap-2.5">
              <SourceMark id={id} />
              <span className="truncate">{isSource(id) ? sources[id].label : id}</span>
            </span>
          )}
        />
      ),
    },
    {
      id: "searches",
      colSpan: 2,
      rowSpan: 2,
      content: (
        <Breakdown
          title="Czego szukają"
          rows={report?.breakdown.searches}
          empty="Brak wyszukiwań w tym okresie."
          render={(q) => (
            <Link href={`/products?q=${encodeURIComponent(q)}`} target="_blank" className="truncate hover:text-white hover:underline">
              {q}
            </Link>
          )}
        />
      ),
    },
    {
      id: "agents",
      colSpan: 2,
      rowSpan: 2,
      content: (
        <Breakdown
          title="Kliknięcia do agentów"
          rows={report?.breakdown.agents}
          empty="Nikt jeszcze nie kliknął linku do agenta w tym okresie."
          render={(id) => (
            <span className="flex min-w-0 items-center gap-2.5">
              {isAgent(id) ? <AgentLogo agent={id} className="h-5 w-5" /> : <span aria-hidden className="grid h-5 w-5 place-items-center rounded-[6px] bg-white/[0.06] text-[10px]">↗</span>}
              <span className="truncate">{isAgent(id) ? AGENTS[id].name : id === "oryginal" ? "Oryginalna aukcja" : id}</span>
            </span>
          )}
        />
      ),
    },
    {
      id: "countries",
      colSpan: 1,
      rowSpan: 2,
      content: <Breakdown title="Kraje" rows={report?.breakdown.countries} render={(cc) => <span className="truncate">{cc === "XX" ? "Nieznany" : (countries.of(cc) ?? cc)}</span>} />,
    },
    {
      id: "devices",
      colSpan: 1,
      rowSpan: 2,
      content: <Breakdown title="Urządzenia" rows={report?.breakdown.devices} render={(d) => <span>{DEVICE_LABELS[d] ?? d}</span>} />,
    },
    { id: "notrack", colSpan: 4, content: <TrackingToggle /> },
  ];

  return (
    <div className="pt-2">
      <AdminHeader />

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Okres" className="flex rounded-[14px] border border-white/10 bg-neutral-900/70 p-[3px]">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              aria-pressed={range === r.id}
              onClick={() => {
                setLoading(true);
                setRange(r.id);
              }}
              className={`rounded-[10px] px-3 py-1.5 text-sm font-medium transition-colors ${range === r.id ? "bg-white text-black" : "text-zinc-400 hover:text-white"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            load(range);
          }}
          className="inline-flex h-10 items-center gap-2 rounded-[14px] border border-white/10 bg-neutral-900/70 px-3 text-sm text-zinc-400 transition-colors hover:border-white/20 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className={`h-[15px] w-[15px] ${loading ? "animate-spin" : ""}`} aria-hidden>
            <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="hidden sm:inline">{time ? `Zaktualizowano ${time}` : "Odśwież"}</span>
        </button>
        <div className="ml-auto inline-flex h-10 items-center gap-2.5 rounded-[14px] border border-white/10 bg-neutral-900/70 px-3.5 text-sm" aria-live="polite">
          <span aria-hidden className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </span>
          <span className="font-semibold text-white tabular-nums">{report ? num(report.live.count) : "–"}</span>
          <span className="text-zinc-400">na stronie</span>
        </div>
      </div>

      {report?.storage === "memory" && (
        <p className="mt-4 rounded-[14px] border border-amber-300/25 bg-amber-300/[0.06] px-4 py-3 text-sm text-amber-100/90">
          Statystyki są teraz tylko w pamięci serwera i znikną po restarcie – nie da się zapisać pliku <code>data/statystyki.json</code>. Sprawdź, czy
          katalog <code>data</code> na serwerze jest zapisywalny dla procesu strony.
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-[14px] border border-white/10 bg-neutral-900/70 px-4 py-3 text-sm text-zinc-400">
          Nie udało się pobrać statystyk. Spróbujemy ponownie za chwilę.
        </p>
      )}

      <MagicBento
        items={items}
        columns={4}
        rowHeight={172}
        gap={12}
        radius={20}
        glowColor="#ffffff"
        spotlightRadius={320}
        enableStars
        particleCount={18}
        textAutoHide={false}
        className="mt-5"
        style={BENTO_STYLE}
      />
    </div>
  );
}

function Change({ cur, prev, lowerIsBetter }: { cur: number; prev: number; lowerIsBetter?: boolean }) {
  if (!prev && !cur) return null;
  if (!prev) return <span className="rounded-md bg-emerald-400/15 px-1.5 py-0.5 text-xs font-semibold text-emerald-300">nowe</span>;
  const change = ((cur - prev) / prev) * 100;
  if (!Number.isFinite(change) || Math.abs(change) < 0.05)
    return <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-xs font-semibold text-zinc-400">0%</span>;
  const good = lowerIsBetter ? change < 0 : change > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${good ? "bg-emerald-400/15 text-emerald-300" : "bg-red-500/15 text-red-400"}`}
    >
      <svg viewBox="0 0 24 24" className={`h-3 w-3 ${change < 0 ? "rotate-180" : ""}`} aria-hidden>
        <path d="M12 19V5M6 11l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {Math.abs(change).toFixed(1).replace(".", ",")}%
    </span>
  );
}

function Bars({ values, future = [] }: { values: number[]; future?: boolean[] }) {
  const max = Math.max(...values, 0);
  return (
    <div aria-hidden className="mt-3 flex h-11 items-end gap-[2px]">
      {values.map((v, i) => (
        <span
          key={i}
          className={`flex-1 rounded-t-[2px] ${future[i] ? "bg-white/[0.04]" : v > 0 ? "bg-zinc-100/85" : "bg-white/[0.08]"}`}
          style={{ height: future[i] || !max || v === 0 ? "2px" : `${Math.max(6, (v / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

function Tile({ label, badge, value, sub, children }: { label: string; badge?: ReactNode; value: string; sub: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-[13px] text-zinc-400">{label}</p>
        {badge}
      </div>
      <p className="mt-1.5 text-[1.75rem] leading-tight font-semibold tracking-[-0.03em] text-white tabular-nums">{value}</p>
      <div className="text-xs text-zinc-500">{sub}</div>
      <div className="mt-auto">{children}</div>
    </div>
  );
}

function StatTile({ metric, report, period }: { metric: Metric; report: StatsReport | null; period: string }) {
  if (!report)
    return (
      <Tile label={metric.label} value="–" sub={period}>
        <Bars values={Array(24).fill(0)} />
      </Tile>
    );
  const cur = metric.value(report.totals);
  const prev = metric.value(report.previousTotals);
  return (
    <Tile label={metric.label} badge={<Change cur={cur} prev={prev} lowerIsBetter={metric.lowerIsBetter} />} value={metric.format(cur)} sub={period}>
      <Bars values={report.current.map(metric.bucket)} future={report.current.map((b) => b.future)} />
    </Tile>
  );
}

function LiveTile({ report }: { report: StatsReport | null }) {
  return (
    <Tile
      label="Na żywo · ostatnie 30 min"
      badge={<span aria-hidden className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />}
      value={report ? num(report.live.count) : "–"}
      sub={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {report?.live.sources.slice(0, 4).map(([id, n]) => (
            <span key={id} className="inline-flex items-center gap-1 text-zinc-400">
              <SourceMark id={id} small />
              <span className="tabular-nums">{n}</span>
            </span>
          ))}
          {report && report.live.count === 0 && "Nikogo w tej chwili"}
        </span>
      }
    >
      <Bars values={report?.live.perMinute ?? Array(30).fill(0)} />
    </Tile>
  );
}

function CatalogTile({ catalog }: { catalog: CatalogSummary }) {
  const rows: [string, string, string][] = [
    ["Produkty", nf.format(catalog.products), `${catalog.categories} kategorii`],
    ["Ceny sprawdzone", nf.format(catalog.pricesSynced), `${nf.format(catalog.pricesFresh)} świeżych (do 3 dni)`],
    ["Zdjęcia QC", nf.format(catalog.qcWithPhotos), `${pct(catalog.qcWithPhotos, catalog.qcChecked)} z ${nf.format(catalog.qcChecked)} · ${nf.format(catalog.qcPhotos)} zdjęć`],
  ];
  return (
    <div className="flex h-full min-w-0 flex-col">
      <p className="text-[13px] text-zinc-400">Katalog</p>
      <dl className="mt-2 flex flex-1 flex-col justify-between">
        {rows.map(([label, value, note]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="min-w-0">
              <span className="block text-sm text-zinc-200">{label}</span>
              <span className="block truncate text-[11px] text-zinc-500">{note}</span>
            </dt>
            <dd className="font-semibold text-white tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SourceMark({ id, small = false }: { id: string; small?: boolean }) {
  const s = isSource(id) ? sources[id] : sources.other;
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full leading-none font-bold ${small ? "h-4 w-4 text-[9px]" : "h-5 w-5 text-[11px]"}`}
      style={{ background: s.color, color: ["#ffffff", "#e7e9ea", "#25f4ee"].includes(s.color) ? "#111112" : "#ffffff" }}
    >
      {s.mark}
    </span>
  );
}

const PAD = { top: 12, right: 12, bottom: 28, left: 40 };

function LineChart({ report }: { report: StatsReport }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 260 });
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setSize({ width: Math.max(280, entry.contentRect.width), height: Math.max(160, entry.contentRect.height) }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { width, height } = size;
  const cur = report.current.map((b) => (b.future ? null : b.uv));
  const prev = report.previous.map((b) => b.uv);
  const n = Math.max(cur.length, 2);
  const { max, step: tickStep } = niceScale(Math.max(...prev, ...cur.map((v) => v ?? 0), 4));
  const x = (i: number) => PAD.left + (i / (n - 1)) * (width - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v / max) * (height - PAD.top - PAD.bottom);

  const line = (vals: (number | null)[]) => vals.reduce<string>((d, v, i) => (v === null ? d : `${d}${d ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`), "");
  const lastCur = cur.reduce<number>((last, v, i) => (v === null ? last : i), 0);
  const area = `${line(cur)}L${x(lastCur).toFixed(1)},${y(0)}L${x(0)},${y(0)}Z`;

  const label = (key: string) => (report.granularity === "hour" ? `${key.slice(8, 10)}:00` : `${Number(key.slice(6, 8))}.${key.slice(4, 6)}`);
  const step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((width - PAD.left - PAD.right) / 56))));
  const labelled = new Set(Array.from({ length: n }, (_, i) => i).filter((i) => i % step === 0));
  if (!labelled.has(n - 1)) {
    if (n - 1 - Math.max(...labelled) < step * 0.75) labelled.delete(Math.max(...labelled));
    labelled.add(n - 1);
  }
  const ticks = Array.from({ length: Math.round(max / tickStep) + 1 }, (_, i) => i * tickStep);

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - rect.left) / rect.width) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  };

  return (
    <div ref={box} className="relative mt-4 min-h-0 flex-1">
      <svg width={width} height={height} role="img" aria-label="Wykres unikalnych odwiedzających" className="absolute inset-0 block max-w-full">
        <defs>
          <linearGradient id="uv-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f4f4f5" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#f4f4f5" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="#27272a" strokeDasharray={t ? "3 4" : undefined} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="fill-zinc-500 text-[11px] tabular-nums">
              {num(t)}
            </text>
          </g>
        ))}
        {report.current.map((b, i) =>
          labelled.has(i) ? (
            <text key={b.key} x={x(i)} y={height - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="fill-zinc-500 text-[11px]">
              {label(b.key)}
            </text>
          ) : null,
        )}
        <path d={line(prev)} fill="none" stroke="#52525b" strokeWidth={1.5} strokeDasharray="4 4" />
        {cur.some((v) => v !== null) && <path d={area} fill="url(#uv-fill)" />}
        <path d={line(cur)} fill="none" stroke="#f4f4f5" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={height - PAD.bottom} stroke="#3f3f46" />
            {cur[hover] !== null && <circle cx={x(hover)} cy={y(cur[hover]!)} r={4} fill="#f4f4f5" />}
            <circle cx={x(hover)} cy={y(prev[hover] ?? 0)} r={3} fill="#52525b" />
          </g>
        )}
        <rect
          x={PAD.left}
          y={0}
          width={Math.max(0, width - PAD.left - PAD.right)}
          height={height}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute top-2 rounded-xl border border-white/10 bg-[#18181b] px-3 py-2 text-xs shadow-[0_12px_30px_-10px_rgb(0_0_0/0.9)]"
          style={{ left: Math.min(Math.max(x(hover) - 70, 0), width - 150) }}
        >
          <p className="text-zinc-400">{label(report.current[hover].key)}</p>
          <p className="mt-1 flex justify-between gap-6 text-white">
            <span>Ten okres</span>
            <span className="tabular-nums">{cur[hover] === null ? "–" : num(cur[hover]!)}</span>
          </p>
          <p className="flex justify-between gap-6 text-zinc-400">
            <span>Poprzedni</span>
            <span className="tabular-nums">{num(prev[hover] ?? 0)}</span>
          </p>
        </div>
      )}
    </div>
  );
}

function niceScale(v: number) {
  const rough = v / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const n = rough / pow;
  const step = Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow);
  return { step, max: Math.ceil(v / step) * step };
}

function Breakdown({
  title,
  rows,
  render,
  empty = "Brak danych w tym okresie.",
}: {
  title: string;
  rows?: [string, number][];
  render: (key: string) => ReactNode;
  empty?: string;
}) {
  const top = useMemo(() => (rows ?? []).slice(0, 8), [rows]);
  const max = top[0]?.[1] ?? 0;
  const total = (rows ?? []).reduce((s, [, v]) => s + v, 0);

  return (
    <section className="flex h-full min-h-0 flex-col">
      <h2 className="font-semibold text-white">{title}</h2>
      {!rows ? (
        <div className="mt-4 space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-8 animate-pulse rounded-lg bg-white/[0.03]" />
          ))}
        </div>
      ) : top.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">{empty}</p>
      ) : (
        <ul className="mt-3 min-h-0 space-y-1 overflow-y-auto">
          {top.map(([key, value]) => (
            <li key={key} className="relative flex items-center justify-between gap-4 overflow-hidden rounded-lg px-2.5 py-1.5 text-sm text-zinc-200">
              <span aria-hidden className="absolute inset-y-0 left-0 rounded-lg bg-white/[0.06]" style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
              <span className="relative flex min-w-0 items-center">{render(key)}</span>
              <span className="relative shrink-0 text-white tabular-nums">
                {num(value)}
                <span className="ml-2 inline-block w-10 text-right text-xs text-zinc-500">{total ? `${Math.round((value / total) * 100)}%` : ""}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const readNoTrack = () => {
  try {
    return localStorage.getItem(NO_TRACK_KEY) === "1";
  } catch {
    return false;
  }
};
const noTrackListeners = new Set<() => void>();
const subscribeNoTrack = (fn: () => void) => {
  noTrackListeners.add(fn);
  window.addEventListener("storage", fn);
  return () => {
    noTrackListeners.delete(fn);
    window.removeEventListener("storage", fn);
  };
};

function TrackingToggle() {
  const off = useSyncExternalStore(subscribeNoTrack, readNoTrack, () => false);

  const toggle = () => {
    try {
      if (off) localStorage.removeItem(NO_TRACK_KEY);
      else localStorage.setItem(NO_TRACK_KEY, "1");
    } catch {}
    noTrackListeners.forEach((fn) => fn());
  };

  return (
    <section className="flex h-full items-center justify-between gap-6">
      <div>
        <h2 className="font-semibold text-white">Nie licz moich wizyt</h2>
        <p className="mt-1 max-w-[60ch] text-sm text-zinc-400">
          Twoje wejścia z tej przeglądarki nie będą wliczane do statystyk. Panel admina nigdy nie jest liczony.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={off}
        aria-label="Nie licz moich wizyt"
        onClick={toggle}
        className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${off ? "border-white bg-white" : "border-white/20 bg-neutral-900"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full transition-[left,background-color] ${off ? "left-6 bg-black" : "left-0.5 bg-zinc-400"}`} />
      </button>
    </section>
  );
}
