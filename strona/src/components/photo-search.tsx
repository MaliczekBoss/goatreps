"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageSearchResult } from "@/lib/image-search";
import { Kbd } from "./kbd";
import { ProductCard } from "./product-card";
import RefineFrame, { type RefineStatus } from "./refine-frame";

const MAX_SIDE = 1024; // tyle wystarcza modelowi; mniejszy plik = szybciej i taniej
const MAX_FILE = 20 * 1024 * 1024;

const ERRORS: Record<string, string> = {
  "not-configured": "Wyszukiwanie po zdjęciu jest chwilowo wyłączone.",
  "rate-limited": "Za dużo wyszukiwań z Twojego adresu. Spróbuj ponownie za godzinę.",
  busy: "AI jest teraz przeciążone. Spróbuj za chwilę.",
  "bad-image": "Tego zdjęcia nie da się odczytać – użyj JPG, PNG albo WebP.",
  upstream: "Nie udało się rozpoznać zdjęcia. Spróbuj ponownie.",
};

/** Zmniejsza zdjęcie w przeglądarce i zapisuje jako JPEG – przy okazji znikają metadane (np. lokalizacja z telefonu). */
async function shrink(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

function Chip({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-neutral-900/70 px-3 py-1 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </span>
  );
}

function Grid({ title, note, items }: { title: string; note?: string; items: ImageSearchResult["related"] }) {
  if (!items.length) return null;
  return (
    <section className="mt-12">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-bold tracking-tight text-white">{title}</h2>
        {note ? <p className="text-sm text-zinc-500">{note}</p> : null}
      </div>
      <ul className="products-grid">
        {items.map((p) => (
          <li key={p.id}>
            <ProductCard product={p} named={false} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PhotoSearch() {
  const [image, setImage] = useState<string | null>(null);
  const [status, setStatus] = useState<RefineStatus>("queued");
  const [result, setResult] = useState<ImageSearchResult | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const run = useRef(0);

  const search = useCallback(async (dataUrl: string) => {
    const id = ++run.current;
    setResult(null);
    setError("");
    setStatus("queued");
    // etapy w ramce: czytanie zdjęcia, potem szukanie w katalogu (serwer robi oba kroki w jednym zapytaniu)
    const t1 = setTimeout(() => run.current === id && setStatus("generating"), 250);
    const t2 = setTimeout(() => run.current === id && setStatus("refining"), 3200);
    try {
      const res = await fetch("/api/image-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const data = await res.json().catch(() => ({ error: "upstream" }));
      if (run.current !== id) return;
      if (!res.ok) {
        setError(ERRORS[data.error] ?? ERRORS.upstream);
        setStatus("error");
        return;
      }
      setResult(data as ImageSearchResult);
      setStatus("complete");
    } catch {
      if (run.current !== id) return;
      setError("Brak połączenia. Sprawdź internet i spróbuj ponownie.");
      setStatus("error");
    } finally {
      clearTimeout(t1);
      clearTimeout(t2);
    }
  }, []);

  const pick = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      if (!file.type.startsWith("image/") || file.size > MAX_FILE) {
        setImage(null);
        setError("Wybierz zdjęcie (JPG, PNG, WebP, HEIC) do 20 MB.");
        return;
      }
      try {
        const dataUrl = await shrink(file);
        setImage(dataUrl);
        search(dataUrl);
      } catch {
        setImage(null);
        setError("Nie udało się otworzyć tego zdjęcia. Spróbuj innego pliku albo zrób screena.");
      }
    },
    [search],
  );

  // wklejanie zrzutu ekranu (Ctrl+V) w dowolnym miejscu strony
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (file) {
        e.preventDefault();
        pick(file);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [pick]);

  const reset = () => {
    run.current++;
    setImage(null);
    setResult(null);
    setError("");
    fileInput.current?.click();
  };

  const exact = result?.matches.filter((m) => m.match === "exact").map((m) => m.product) ?? [];
  const similar = result?.matches.filter((m) => m.match === "similar").map((m) => m.product) ?? [];
  const busy = image && (status === "queued" || status === "generating" || status === "refining");

  return (
    <div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {!image ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            pick(e.dataTransfer.files?.[0]);
          }}
          className={`relative flex flex-col items-center justify-center rounded-[24px] border border-dashed px-6 py-16 text-center transition-colors sm:py-20 ${
            dragging ? "border-white/60 bg-white/[0.06]" : "border-white/15 bg-neutral-950/50"
          }`}
        >
          <span className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-neutral-900 text-white">
            <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
              <path
                d="M4 8h3l2-3h6l2 3h3v11H4zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <h2 className="mt-5 text-xl font-bold text-white">{dragging ? "Upuść zdjęcie tutaj" : "Wrzuć zdjęcie produktu"}</h2>
          <p className="mt-2 max-w-[44ch] text-sm text-zinc-400">
            Przeciągnij plik, wybierz z dysku albo wklej screena <Kbd size="sm">Ctrl</Kbd> <Kbd size="sm">V</Kbd>. Na telefonie zrób zdjęcie albo wybierz z galerii.
          </p>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-[14px] bg-white px-5 text-sm font-semibold text-black transition-[background-color,scale] hover:bg-zinc-200 active:scale-[0.97]"
          >
            Wybierz zdjęcie
          </button>
          {error ? (
            <p role="alert" className="mt-4 text-sm text-red-400">
              {error}
            </p>
          ) : null}
          <p className="mt-6 text-xs text-zinc-600">Zdjęcie trafia tylko do rozpoznania przez AI – nie zapisujemy go.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div>
            <RefineFrame
              status={status}
              aspectRatio="1 / 1"
              width={420}
              radius={22}
              background="#18181b"
              color="#fafafa"
              onRetry={() => search(image)}
              className="w-full"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt="Twoje zdjęcie" />
            </RefineFrame>
            <button
              type="button"
              onClick={reset}
              disabled={Boolean(busy)}
              className="mt-3 inline-flex h-10 items-center gap-2 rounded-[14px] border border-white/10 bg-neutral-900/70 px-4 text-sm text-zinc-300 transition-colors hover:border-white/25 hover:text-white disabled:opacity-50"
            >
              Inne zdjęcie
            </button>
          </div>

          <div aria-live="polite" className="min-w-0">
            {status === "error" ? (
              <div className="rounded-[22px] border border-white/10 bg-neutral-950/60 p-6">
                <h2 className="text-xl font-bold text-white">Coś poszło nie tak</h2>
                <p className="mt-2 text-zinc-400">{error}</p>
              </div>
            ) : result ? (
              <div className="rounded-[22px] border border-white/10 bg-neutral-950/60 p-6">
                <p className="text-sm text-zinc-500">Na zdjęciu jest</p>
                <h2 className="mt-1 text-2xl leading-snug font-bold tracking-tight text-white sm:text-3xl">{result.description || "Nie udało się nazwać produktu"}</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Chip label="Marka" value={result.read.brand} />
                  <Chip label="Model" value={result.read.model} />
                  <Chip label="Typ" value={result.read.type} />
                  <Chip label="Kolor" value={result.read.color} />
                </div>
                <p className="mt-5 text-sm text-zinc-400">
                  {exact.length
                    ? `Mamy ${exact.length === 1 ? "ten produkt" : `${exact.length} oferty tego produktu`} w katalogu.`
                    : similar.length
                      ? "Nie mamy dokładnie tego, ale są podobne findy."
                      : "Nie znaleźliśmy tego w katalogu."}
                  {result.category ? (
                    <>
                      {" "}
                      <Link href={`/products?category=${encodeURIComponent(result.category.slug)}`} className="text-white underline underline-offset-4 hover:text-zinc-300">
                        Zobacz wszystkie: {result.category.name}
                      </Link>
                    </>
                  ) : null}
                </p>
              </div>
            ) : (
              <div className="rounded-[22px] border border-white/10 bg-neutral-950/60 p-6">
                <p className="text-sm text-zinc-500">{status === "refining" ? "Porównuję ze zdjęciami z katalogu…" : "Rozpoznaję produkt…"}</p>
                <div className="mt-3 space-y-2.5" aria-hidden>
                  <div className="h-7 w-3/4 animate-pulse rounded-lg bg-white/[0.06]" />
                  <div className="flex gap-2">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-7 w-24 animate-pulse rounded-full bg-white/[0.05]" />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {result ? (
        <>
          <Grid title="Ten sam produkt" items={exact} />
          <Grid title={exact.length ? "Podobne" : "Najbardziej podobne"} items={similar} />
          {result.category ? <Grid title={`Popularne: ${result.category.name}`} note="Najlepiej oceniane w tej kategorii" items={result.related} /> : null}
        </>
      ) : null}
    </div>
  );
}
