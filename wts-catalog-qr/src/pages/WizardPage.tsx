import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ProductCard } from '../components/ProductCard';
import {
  BUDGET_OPTIONS,
  emptyAnswers,
  GOAL_OPTIONS,
  INDUSTRY_OPTIONS,
  LANGUAGE_OPTIONS,
  rankProducts,
  WEBSITE_OPTIONS,
} from '../lib/wizard';
import { useCatalog } from '../state';
import type { WizardAnswers } from '../types';

const STEPS: { key: keyof WizardAnswers; title: string; options: readonly { id: string; label: string; th?: string }[] }[] = [
  { key: 'industry', title: 'What kind of business is this?', options: INDUSTRY_OPTIONS },
  { key: 'goal', title: 'What should this catalog trip do first?', options: GOAL_OPTIONS },
  { key: 'hasWebsite', title: 'Do you already have a website?', options: WEBSITE_OPTIONS },
  { key: 'budget', title: 'Rough budget for this first cart?', options: BUDGET_OPTIONS },
  { key: 'languages', title: 'Which languages matter?', options: LANGUAGE_OPTIONS },
];

export function WizardPage() {
  const { catalog, add } = useCatalog();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<WizardAnswers>(emptyAnswers);

  const current = STEPS[step];
  const done = step >= STEPS.length;
  const ranked = useMemo(
    () => (done && catalog ? rankProducts(catalog.products, answers) : []),
    [done, catalog, answers],
  );

  function pick(id: string) {
    setAnswers((prev) => ({ ...prev, [current.key]: id }));
    setStep((s) => s + 1);
  }

  return (
    <main className="page">
      <p className="kicker">Wizard · 5 questions</p>
      <h1>{done ? 'Recommended tools' : current.title}</h1>
      {!done && (
        <>
          <div className="steps" aria-hidden="true">
            {STEPS.map((s, i) => (
              <div key={s.key} className={`step-dot${i <= step ? ' on' : ''}`} />
            ))}
          </div>
          <p className="lede">Answer in order. We rank printed SKUs by industry rules, then goal, site, budget, and language.</p>
          <div className="choice-grid">
            {current.options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`choice${answers[current.key] === opt.id ? ' selected' : ''}`}
                onClick={() => pick(opt.id)}
              >
                <strong>{opt.label}</strong>
                {'th' in opt && opt.th ? <small>{opt.th}</small> : null}
              </button>
            ))}
          </div>
          {step > 0 && (
            <button className="btn ghost" type="button" style={{ marginTop: '1rem' }} onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
          )}
        </>
      )}

      {done && (
        <>
          <p className="lede">
            Prices below follow the live portal when the API answered; otherwise the printed seed.
            Add more than one — the cart keeps Buy and Quote in separate buckets.
          </p>
          <div className="stack">
            {ranked.map((r) => (
              <ProductCard
                key={r.product.slug}
                product={r.product}
                reason={r.reasons[0]}
                action={
                  <div className="row" style={{ marginTop: '0.7rem' }}>
                    <button
                      className="btn primary"
                      type="button"
                      onClick={() =>
                        add({
                          slug: r.product.slug,
                          qty: 1,
                          option_key: r.product.default_option_key,
                          billing_period: null,
                        })
                      }
                    >
                      Add
                    </button>
                    <Link className="btn ghost" to={`/q/${r.product.slug}`}>
                      Configure
                    </Link>
                  </div>
                }
              />
            ))}
            {ranked.length === 0 && <p className="empty">No strong matches. Try a broader budget or industry.</p>}
          </div>
          <div className="row" style={{ marginTop: '1rem' }}>
            <button
              className="btn ghost"
              type="button"
              onClick={() => {
                setAnswers(emptyAnswers);
                setStep(0);
              }}
            >
              Restart
            </button>
            <Link className="btn secondary" to="/cart">
              View cart
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
