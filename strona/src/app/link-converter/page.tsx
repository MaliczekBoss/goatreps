import type { Metadata } from "next";
import { ToolHeader } from "@/components/tool-header";
import { LinkConverter } from "@/components/link-converter";

export const metadata: Metadata = {
  title: "Konwerter linków",
  description: "Zamień link z Weidiana, Taobao, 1688 albo od dowolnego agenta na link do KakoBuy, USFans, AllChinaBuy, ACBuy, LitBuy, CNFans i innych.",
};

export default function LinkConverterPage() {
  return (
    <div className="site-container max-w-5xl pt-6">
      <ToolHeader title="Link" accent="Converter" description="Wklej link z Weidiana, Taobao, Tmalla, 1688 albo od agenta – dostaniesz ten sam produkt u każdego agenta, Twój jest na górze." />
      <div>
        <LinkConverter />
      </div>
    </div>
  );
}
