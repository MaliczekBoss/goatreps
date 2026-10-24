"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type Option = { value: string; label: string };

/**
 * Rozwijana lista w stylu strony zamiast natywnego <select> (ten na Windowsie otwierał się na biało).
 * Obsługa klawiatury jak w listbox: strzałki, Home/End, Enter/spacja, Esc, pierwsza litera nazwy.
 */
export function Select({
  options,
  value,
  onChange,
  label,
  icon,
  className = "",
}: {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  /** Etykieta dla czytników ekranu. */
  label: string;
  icon?: ReactNode;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const selected = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  const show = () => {
    setActive(selected);
    setOpen(true);
  };
  const close = (focusButton = true) => {
    setOpen(false);
    if (focusButton) button.current?.focus();
  };
  const choose = (i: number) => {
    const o = options[i];
    if (o) onChange(o.value);
    close();
  };

  useEffect(() => {
    if (!open) return;
    list.current?.focus({ preventScroll: true });
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // przewijamy tylko samą listę (scrollIntoView ruszałby też całą stronę)
  useEffect(() => {
    const ul = list.current;
    const li = ul?.querySelector<HTMLElement>(`[data-i="${active}"]`);
    if (!open || !ul || !li) return;
    if (li.offsetTop < ul.scrollTop) ul.scrollTop = li.offsetTop - 4;
    else if (li.offsetTop + li.offsetHeight > ul.scrollTop + ul.clientHeight) ul.scrollTop = li.offsetTop + li.offsetHeight - ul.clientHeight + 4;
  }, [open, active]);

  const onListKey = (e: React.KeyboardEvent) => {
    const last = options.length - 1;
    if (e.key === "ArrowDown") setActive((i) => Math.min(last, i + 1));
    else if (e.key === "ArrowUp") setActive((i) => Math.max(0, i - 1));
    else if (e.key === "Home") setActive(0);
    else if (e.key === "End") setActive(last);
    else if (e.key === "Enter" || e.key === " ") choose(active);
    else if (e.key === "Escape") close();
    else if (e.key === "Tab") return setOpen(false);
    else if (e.key.length === 1 && /\p{L}/u.test(e.key)) {
      // skok do kolejnego kraju na tę literę
      const ch = e.key.toLocaleLowerCase("pl");
      const order = [...options.slice(active + 1), ...options.slice(0, active + 1)];
      const hit = order.find((o) => o.label.toLocaleLowerCase("pl").startsWith(ch));
      if (hit) setActive(options.indexOf(hit));
    } else return;
    e.preventDefault();
  };

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={`${label}: ${options[selected]?.label ?? ""}`}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            show();
          }
        }}
        className={`flex h-11 w-full items-center gap-2 rounded-[14px] border bg-neutral-900/70 px-3 text-left text-sm text-white outline-none transition-colors focus-visible:border-white/40 ${open ? "border-white/30" : "border-white/10 hover:border-white/20"}`}
      >
        {icon ? <span className="text-zinc-500">{icon}</span> : null}
        <span className="min-w-0 flex-1 truncate">{options[selected]?.label}</span>
        <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${id}-${active}`}
          onKeyDown={onListKey}
          className="pop-in absolute top-full left-0 z-30 mt-2 max-h-72 w-full min-w-52 origin-top-left overflow-y-auto overscroll-contain rounded-[14px] border border-white/10 bg-neutral-900/95 p-1 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.9)] backdrop-blur-xl outline-none"
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-${i}`}
              data-i={i}
              role="option"
              aria-selected={i === selected}
              onPointerEnter={() => setActive(i)}
              onClick={() => choose(i)}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-[10px] px-3 py-2 text-sm transition-colors ${i === active ? "bg-white/[0.08]" : ""} ${i === selected ? "text-white" : "text-zinc-400"}`}
            >
              {o.label}
              {i === selected ? (
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden>
                  <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
