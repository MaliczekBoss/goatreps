import type { Metadata } from "next";
import { PhotoSearch } from "@/components/photo-search";
import { ToolHeader } from "@/components/tool-header";

export const metadata: Metadata = {
  title: "Szukaj po zdjęciu",
  description: "Wrzuć zdjęcie albo screen produktu – AI rozpozna markę i model i znajdzie go w katalogu Goat Reps.",
};

export default function PhotoSearchPage() {
  return (
    <div className="site-container pt-6 pb-16">
      <ToolHeader
        title="Szukaj"
        accent="po zdjęciu"
        description="Wrzuć zdjęcie albo screen z TikToka czy Instagrama. AI rozpozna produkt i pokaże go w naszym katalogu – ten sam albo najbardziej podobny."
      />
      <PhotoSearch />
    </div>
  );
}
