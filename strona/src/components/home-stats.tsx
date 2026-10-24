"use client";

import CountUp from "./count-up";

type Stat = { value: number; label: string; decimals?: number; suffix?: string };

/** Pasek liczników pod hero – cyfry kręcą się jak licznik, gdy pasek wjedzie na ekran. */
export function HomeStats({ products, agents, categories }: { products: number; agents: number; categories: number }) {
  const stats: Stat[] = [
    { value: products, label: "findów z Weidiana i Taobao" },
    { value: agents, label: "agentów z linkami" },
    { value: categories, label: "kategorii" },
    { value: 4.5, label: "osób na Discordzie", decimals: 1, suffix: "K" },
  ];

  return (
    <dl className="grid grid-cols-2 border-y border-neutral-800/80 lg:grid-cols-4">
      {stats.map((s, i) => (
        <div
          key={s.label}
          // 2 kolumny na telefonie, 4 na dużym ekranie – kreski tylko między komórkami
          className={[
            "flex flex-col gap-1 border-neutral-800/80 py-5 sm:py-6",
            i % 2 ? "border-l pl-5 sm:pl-6" : "pr-5 sm:pr-6",
            i < 2 ? "border-b lg:border-b-0" : "",
            i === 2 ? "lg:border-l lg:pl-6" : "",
            i > 0 ? "lg:pl-6" : "",
          ].join(" ")}
        >
          <dt className="order-2 text-sm text-zinc-500">{s.label}</dt>
          <dd className="order-1 text-3xl font-bold tracking-[-0.03em] text-white tabular-nums sm:text-4xl">
            <CountUp
              to={s.value}
              mode="roll"
              easing="expo"
              duration={2.2}
              delay={i * 0.12}
              separator={" "}
              decimalMark=","
              decimals={s.decimals}
              suffix={s.suffix}
            />
          </dd>
        </div>
      ))}
    </dl>
  );
}
