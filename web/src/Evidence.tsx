/**
 * Small, honest building blocks for the inspector:
 *  - Provenance: dataset, data period, test years, baseline, processing date
 *  - References: the full source list, grouped
 * Written with AI assistance (Claude).
 */
import type { VariablesFile } from "./data.ts";
import { monthLabel, REFERENCE_GROUPS, REFERENCES, type Reference } from "./content.ts";
import type { Lang } from "./i18n.ts";

/** Where the numbers come from, and when. */
export function Provenance({ variables, lang }: { variables: VariablesFile; lang: Lang }) {
  const tr = lang === "tr";
  const p = variables.period;
  const processed = variables.processed_at && variables.processed_at !== "mock" ? variables.processed_at.slice(0, 10) : null;
  return (
    <dl className="prov">
      <div>
        <dt>{tr ? "Veri" : "Data"}</dt>
        <dd>{variables.is_mock ? (tr ? "Demo (sahte) veri — MERRA-2 v5.12.4 düzeni" : "Demo (mock) data — MERRA-2 v5.12.4 layout") : variables.dataset}</dd>
      </div>
      <div>
        <dt>{tr ? "Dönem" : "Period"}</dt>
        <dd>
          {monthLabel(p.start, lang)} – {monthLabel(p.end, lang)} · {p.months} {tr ? "ay" : "months"}
        </dd>
      </div>
      <div>
        <dt>{tr ? "Test edilen" : "Tested"}</dt>
        <dd>
          {variables.test_years.start}–{variables.test_years.end} {tr ? "(sadece tam yıllar)" : "(complete years only)"}
        </dd>
      </div>
      <div>
        <dt>{tr ? "Referans" : "Baseline"}</dt>
        <dd>
          {variables.baseline_years.start}–{variables.baseline_years.end} {tr ? "(WMO iklim normali)" : "(WMO climate normal)"}
        </dd>
      </div>
      <div>
        <dt>{tr ? "İşlenme" : "Processed"}</dt>
        <dd>{processed ?? (tr ? "demo veri" : "demo data")}</dd>
      </div>
    </dl>
  );
}

/** The full source list, grouped. */
export function References({ lang }: { lang: Lang }) {
  const groups = Object.keys(REFERENCE_GROUPS) as Reference["group"][];
  return (
    <div className="refs">
      {groups.map((g) => (
        <div key={g}>
          <h4>{REFERENCE_GROUPS[g][lang]}</h4>
          <ol>
            {REFERENCES.filter((r) => r.group === g).map((r) => (
              <li key={r.url + r.text}>
                {r.text}{" "}
                <a href={r.url} target="_blank" rel="noreferrer noopener">
                  {r.url.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                </a>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

/** One province of the chosen country (from its border file). */
export interface ProvinceItem {
  id: string;
  name: Record<Lang, string>;
  /** has its own monthly series in the data */
  hasSeries: boolean;
  lowRes: boolean;
}

