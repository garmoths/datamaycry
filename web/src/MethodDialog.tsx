/**
 * "How it works" (top-right ⓘ): what the site does in plain words, how a card is calculated, the
 * extra analyses, the public API and the sources. Opens on the API tab for links ending in #api.
 * Written with AI assistance (Claude).
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { METHOD_LIMITS, METHOD_STEPS } from "./content.ts";
import { t, type Lang } from "./i18n.ts";
import { References } from "./Evidence.tsx";
import { METHOD_EXTRAS, METHOD_EXTRAS_TITLE } from "./methodExtras.ts";
import { API_ENDPOINTS, API_PARAMS, API_SAMPLE, API_TEXT, type Tx } from "./apiDocs.ts";
import { Icon } from "./icons.tsx";

export type MethodTab = "basics" | "method" | "extras" | "api" | "sources";

const TABS: { id: MethodTab; label: Tx }[] = [
  { id: "basics", label: { tr: "Kısaca", en: "In short" } },
  { id: "method", label: { tr: "Nasıl hesaplanır", en: "The calculation" } },
  { id: "extras", label: METHOD_EXTRAS_TITLE },
  { id: "api", label: { tr: "API", en: "API" } },
  { id: "sources", label: { tr: "Kaynaklar", en: "Sources" } },
];

const BASICS: { icon: "globe" | "chart" | "check"; title: Tx; body: Tx }[] = [
  {
    icon: "globe",
    title: { tr: "1 · Veri", en: "1 · Data" },
    body: {
      tr: "NASA'nın MERRA-2 verisi: 1980'den bugüne her ay, dünyanın her 55 km'lik karesi için sıcaklık, yağış, nem, rüzgâr, kar ve daha fazlası.",
      en: "NASA's MERRA-2: every month since 1980, for every 55 km square of the Earth: temperature, rain, humidity, wind, snow and more.",
    },
  },
  {
    icon: "chart",
    title: { tr: "2 · Hesap", en: "2 · Calculation" },
    body: {
      tr: "Her ay kendi normaliyle karşılaştırılır, yıllara çevrilir ve iklim biliminin standart trend testi uygulanır. Hepsi senin tarayıcında, saniyenin binde birinde.",
      en: "Each month is compared with its own normal, turned into years, and the standard trend test of climate science is run. All in your browser, in a millisecond.",
    },
  },
  {
    icon: "check",
    title: { tr: "3 · Cevap", en: "3 · Answer" },
    body: {
      tr: "Tek kelimelik özet (\"Isınıyor\"), 10 yıllık ya da toplam değişim ve ne kadar emin olduğumuz. Emin değilsek bunu söyleriz.",
      en: "A one-word summary (\"Getting warmer\"), the change per decade or in total, and how sure we are. If we are not sure, we say so.",
    },
  },
];

const LEVELS: { cls: string; name: Tx; body: Tx }[] = [
  { cls: "none", name: { tr: "Belirgin değişim yok", en: "No clear change" }, body: { tr: "Yıldan yıla iniş çıkışlar olası bir eğilimden büyük. Yön de sayı da gösterilmez.", en: "Year-to-year swings are bigger than any trend. No direction and no number are shown." } },
  { cls: "possible", name: { tr: "Muhtemel değişim", en: "Likely change" }, body: { tr: "Test anlamlı (p < 0,05) ve %95 aralık sıfırı içermiyor; ama kanıt henüz kesin değil.", en: "The test is significant (p < 0.05) and the 95 % range excludes zero, but the evidence is not conclusive yet." } },
  { cls: "strong", name: { tr: "Net değişim", en: "Clear change" }, body: { tr: "p < 0,01 ve üç ayrı kontrol aynı yönü gösteriyor. Bağımsız bir kaynak (istasyon, uydu) aynı fikirde değilse verilmez.", en: "p < 0.01 and three separate checks agree. Not given when an independent source (stations, satellites) disagrees." } },
];

export function MethodDialog({ lang, open, onClose, initialTab = "basics" }: { lang: Lang; open: boolean; onClose: () => void; initialTab?: MethodTab }) {
  const ref = useRef<HTMLDialogElement>(null);
  const reduce = useReducedMotion();
  const [tab, setTab] = useState<MethodTab>(initialTab);
  const [copied, setCopied] = useState<string | null>(null);
  const base = `${typeof location !== "undefined" ? location.origin : "https://datamaycry.vercel.app"}/api/v1`;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setTab(initialTab);
      d.showModal();
    }
    if (!open && d.open) d.close();
  }, [open, initialTab]);

  const copy = (key: string, text: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1400);
    });
  };

  const body = (() => {
    switch (tab) {
      case "basics":
        return (
          <>
            <p className="m-lead">{lang === "tr" ? "Aeolus, NASA'nın 46 yıllık iklim verisini herkesin okuyabileceği bir cevaba çevirir: bir yer seç, merak ettiğini seç, cevabı oku." : "Aeolus turns 46 years of NASA climate data into an answer anyone can read: pick a place, pick what you are curious about, read the answer."}</p>
            <div className="m-cards">
              {BASICS.map((b) => (
                <div key={b.title.en} className="m-card">
                  <span className="m-ico">
                    <Icon name={b.icon} size={18} />
                  </span>
                  <strong>{b.title[lang]}</strong>
                  <p>{b.body[lang]}</p>
                </div>
              ))}
            </div>
            <h3>{lang === "tr" ? "Ne kadar eminiz?" : "How sure are we?"}</h3>
            <div className="m-levels">
              {LEVELS.map((l) => (
                <div key={l.cls} className="m-level">
                  <span className={`m-pill ${l.cls}`}>{l.name[lang]}</span>
                  <p>{l.body[lang]}</p>
                </div>
              ))}
            </div>
            <h3>{lang === "tr" ? "Haritadaki renkler" : "Colours on the map"}</h3>
            <p className="fine">{lang === "tr" ? "Kırmızı artış, mavi azalış; renk ne kadar güçlüyse değişim o kadar büyük ve kanıt o kadar sağlam. Soluk yerlerde değişim küçük ya da belirsiz." : "Red is a rise, blue a fall; the stronger the colour, the bigger the change and the firmer the evidence. Faint places changed little or unclearly."}</p>
            <h3>{lang === "tr" ? "Neden Aeolus?" : "Why Aeolus?"}</h3>
            <p className="fine">
              {lang === "tr"
                ? "Yunan mitolojisinde Aeolus rüzgârların bekçisidir: havayı tutar, salar ve yönünü bilir. Aeolus da 46 yılın havasını izleyip iklimin ne yöne değiştiğini söyler. Data May Cry ekibinin (Enes Tekdemir, Rumet Argeş Şaşmaz) NASA Space Apps Challenge 2026 projesidir."
                : "In Greek myth Aeolus is the keeper of the winds: he holds the air, lets it go and knows where it blows. Aeolus watches 46 years of weather and tells you which way the climate is changing. A NASA Space Apps Challenge 2026 project by team Data May Cry (Enes Tekdemir, Rumet Argeş Şaşmaz)."}
            </p>
          </>
        );
      case "method":
        return (
          <>
            <ol className="steps m-timeline">
              {METHOD_STEPS.map((s, k) => (
                <motion.li key={k} initial={reduce ? false : { opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduce ? 0 : 0.05 * k, duration: 0.25 }}>
                  <strong>{s.title[lang]}</strong>
                  <p>{s.body[lang]}</p>
                </motion.li>
              ))}
            </ol>
            <h3>{t(lang, "limits")}</h3>
            <p className="fine">{METHOD_LIMITS[lang]}</p>
          </>
        );
      case "extras":
        return (
          <ul className="steps extras">
            {METHOD_EXTRAS.map((s, k) => (
              <li key={k}>
                <strong>{s.title[lang]}</strong>
                <p>{s.body[lang]}</p>
              </li>
            ))}
          </ul>
        );
      case "api":
        return (
          <>
            <p className="m-lead">{API_TEXT.intro[lang]}</p>
            <div className="m-badges">
              {API_TEXT.badges.map((b) => (
                <span key={b.en} className="m-badge">
                  {b[lang]}
                </span>
              ))}
            </div>
            <div className="m-base">
              <span>{lang === "tr" ? "Adres" : "Base URL"}</span>
              <code>{base}</code>
              <button className="m-copy" onClick={() => copy("base", base)}>
                {copied === "base" ? t(lang, "copied") : lang === "tr" ? "Kopyala" : "Copy"}
              </button>
            </div>
            <h3>{lang === "tr" ? "Uç noktalar" : "Endpoints"}</h3>
            <div className="m-endpoints">
              {API_ENDPOINTS.map((e) => {
                const url = `${base}${e.example}`;
                return (
                  <div key={e.path} className="m-endpoint">
                    <div className="m-ep-head">
                      <span className="m-get">GET</span>
                      <code>{e.path}</code>
                    </div>
                    <p>{e.what[lang]}</p>
                    <div className="m-try">
                      <code>{`curl "${url}"`}</code>
                      <button className="m-copy" onClick={() => copy(e.path, `curl "${url}"`)}>
                        {copied === e.path ? t(lang, "copied") : lang === "tr" ? "Kopyala" : "Copy"}
                      </button>
                      <a className="m-copy" href={url} target="_blank" rel="noopener">
                        {lang === "tr" ? "Dene" : "Try"} ↗
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
            <h3>{lang === "tr" ? "Parametreler" : "Parameters"}</h3>
            <table className="m-params">
              <tbody>
                {API_PARAMS.map((p) => (
                  <tr key={p.name}>
                    <th>
                      <code>{p.name}</code>
                    </th>
                    <td>{p.what[lang]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3>{lang === "tr" ? "Örnek cevap" : "Sample response"} · <code>/trend?place=TR-21&amp;var=T2M</code></h3>
            <pre className="m-json">{API_SAMPLE}</pre>
            <p className="fine">{API_TEXT.note[lang]}</p>
          </>
        );
      case "sources":
        return <References lang={lang} />;
    }
  })();

  return (
    <dialog ref={ref} className="method" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="method-inner">
        <header>
          <img src="/logo-128.png" width={30} height={30} alt="" />
          <h2>{t(lang, "howItWorks")}</h2>
          <button className="seg-btn" onClick={onClose} aria-label={t(lang, "close")}>
            <Icon name="close" size={15} />
          </button>
        </header>
        <nav className="m-tabs" role="tablist">
          {TABS.map((x) => (
            <button key={x.id} role="tab" aria-selected={tab === x.id} className={tab === x.id ? "on" : ""} onClick={() => setTab(x.id)}>
              {x.label[lang]}
            </button>
          ))}
        </nav>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            className="m-body"
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            {body}
          </motion.div>
        </AnimatePresence>
      </div>
    </dialog>
  );
}
