/**
 * Variable section: the chosen variable explained, all nine grouped as tiles,
 * and the "What are you curious about?" questions. The highlight slides between
 * tiles (motion layoutId); the explanation fades in (Magic UI "blur-fade" idea).
 * Written with AI assistance (Claude).
 */
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { VarId, VariableInfo } from "./data.ts";
import { QUESTIONS, VAR_GROUPS, VAR_ICONS, type Question } from "./content.ts";
import { Icon } from "./icons.tsx";
import { t, unitLabel, type Lang } from "./i18n.ts";

interface Props {
  lang: Lang;
  variables: VariableInfo[];
  value: VarId;
  onChange: (id: VarId) => void;
}

export function VariablePicker({ lang, variables, value, onChange }: Props) {
  const reduce = useReducedMotion();
  const [question, setQuestion] = useState<Question | null>(null);
  // open on desktop, folded on phones where the globe needs the room
  const [open, setOpen] = useState(() => window.innerWidth > 900);
  const byId = new Map(variables.map((v) => [v.id, v]));
  const cur = byId.get(value);

  const ask = (q: Question) => {
    setQuestion(q.id === question?.id ? null : q);
    if (q.id !== question?.id) onChange(q.vars[0]);
  };

  return (
    <section className="vars" aria-label={t(lang, "variable")}>
      <button className="vars-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="vars-icon" aria-hidden>
          <Icon name={VAR_ICONS[value]} size={22} />
        </span>
        <span className="vars-title">
          <small>{t(lang, "variable")}</small>
          <strong>
            {cur?.name[lang]} <em>{cur && unitLabel(cur.unit, lang)}</em>
          </strong>
        </span>
        <Icon name="chevron" size={18} className={`chev ${open ? "up" : ""}`} />
      </button>

      {open && (
        <div className="vars-body">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={value}
              className="vars-desc"
              initial={reduce ? false : { opacity: 0, y: 6, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={reduce ? undefined : { opacity: 0, y: -4, filter: "blur(4px)" }}
              transition={{ duration: 0.22 }}
            >
              {cur?.description[lang]}
              {cur?.land_only && <span className="tag">{t(lang, "landOnly")}</span>}
            </motion.p>
          </AnimatePresence>

          {VAR_GROUPS.map((g) => (
            <div key={g.title.en} className="vgroup">
              <h4>{g.title[lang]}</h4>
              <div className="vgrid" role="radiogroup" aria-label={g.title[lang]}>
                {g.ids.map((id) => {
                  const v = byId.get(id);
                  if (!v) return null;
                  const on = id === value;
                  const suggested = question?.vars.includes(id) && !on;
                  return (
                    <button
                      key={id}
                      role="radio"
                      aria-checked={on}
                      className={`vtile ${on ? "on" : ""} ${suggested ? "suggested" : ""}`}
                      onClick={() => onChange(id)}
                      title={v.description[lang]}
                    >
                      {on && (
                        <motion.span
                          layoutId="var-active"
                          className="vtile-glow"
                          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 36 }}
                        />
                      )}
                      <span className="vtile-icon" aria-hidden>
                        <Icon name={VAR_ICONS[id]} size={22} />
                      </span>
                      <span className="vtile-name">{v.name[lang]}</span>
                      <span className="vtile-unit">{unitLabel(v.unit, lang)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <h4>{t(lang, "curious")}</h4>
          <div className="questions">
            {QUESTIONS.map((q) => (
              <button key={q.id} className={`qchip ${question?.id === q.id ? "on" : ""}`} onClick={() => ask(q)}>
                <Icon name={q.icon} size={15} /> {q.q[lang]}
              </button>
            ))}
          </div>
          <AnimatePresence>
            {question && (
              <motion.p
                key={question.id}
                className="qtip"
                initial={reduce ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={reduce ? undefined : { opacity: 0, height: 0 }}
              >
                💡 {question.tip[lang]}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}
