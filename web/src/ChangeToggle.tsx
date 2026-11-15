/**
 * "Per decade / Total" switch. The choice is shared by the whole app (changeView.ts).
 * Written with AI assistance (Claude).
 */
import { useChangeView } from "./changeView.ts";
import { t, type Lang } from "./i18n.ts";

export function ChangeToggle({ lang }: { lang: Lang }) {
  const [view, setView] = useChangeView();
  return (
    <span className="seg small change-toggle" role="group" aria-label={t(lang, "changeView")}>
      {(["decade", "total"] as const).map((x) => (
        <button key={x} className={view === x ? "on" : ""} aria-pressed={view === x} onClick={() => setView(x)}>
          {t(lang, x === "decade" ? "perDecadeShort" : "totalShort")}
        </button>
      ))}
    </span>
  );
}
