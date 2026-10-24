import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Panel admina",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="pb-16">{children}</div>;
}
