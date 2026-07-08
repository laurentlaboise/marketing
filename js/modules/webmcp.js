/**
 * WebMCP helpers — declarative form annotations + imperative tool registration.
 * Spec: https://developer.chrome.com/docs/ai/webmcp
 *
 * Lighthouse / PageSpeed Agentic Browsing audits:
 *  - webmcp-form-coverage   → every <form> needs toolname + tooldescription
 *  - webmcp-registered-tools → document.modelContext tools (declarative + imperative)
 *  - webmcp-schema-validity → toolname/tooldescription + named fields + param descriptions
 *
 * Prefer document.modelContext (Chrome 150+); navigator.modelContext is legacy.
 */

/** @type {Record<string, {toolname: string, tooldescription: string, paramDescriptions: Record<string, string>}>} */
export const TOOL_CATALOG = {
  contact: {
    toolname: 'submit_contact_request',
    tooldescription:
      'Submit a contact or consultation request to WordsThatSells digital marketing agency in Vientiane, Laos. Use for SEO, content, social, web, or automation enquiries.',
    paramDescriptions: {
      name: 'Full name of the person making the request',
      email: 'Work email address for follow-up',
      company: 'Company or business name (optional)',
      phone: 'Phone or WhatsApp number (optional)',
      service: 'Primary service or focus area requested',
      goal: 'Primary business goal (optional)',
      message: 'Details about the project, market, timeline, and success criteria',
    },
  },
  'general-inquiry': {
    toolname: 'send_general_inquiry',
    tooldescription:
      'Send a general inquiry message to WordsThatSells. Use when the user has a question that is not a formal quote request.',
    paramDescriptions: {
      name: 'Full name',
      email: 'Email address',
      company: 'Company name (optional)',
      service: 'Service or focus area of interest (optional)',
      phone: 'Phone number (optional)',
      message: 'Question or message text',
    },
  },
  consultation: {
    toolname: 'request_quote',
    tooldescription:
      'Request a tailored digital marketing quote from WordsThatSells for SEO, content, social, web, or AI services.',
    paramDescriptions: {
      name: 'Full name',
      email: 'Email address',
      company: 'Company name (optional)',
      phone: 'Phone number (optional)',
      service: 'Service of interest',
      message: 'Project details for the quote',
    },
  },
  'free-support': {
    toolname: 'request_free_support',
    tooldescription:
      'Request free digital marketing support information from WordsThatSells for SMEs in Laos and Southeast Asia.',
    paramDescriptions: {
      name: 'Full name',
      email: 'Email address',
      company: 'Business or organization name (optional)',
      phone: 'Phone number (optional)',
      message: 'Describe your business and how digital marketing can help',
    },
  },
  affiliate: {
    toolname: 'apply_affiliate_program',
    tooldescription:
      'Apply to the WordsThatSells affiliate partner program to earn commission promoting digital marketing services.',
    paramDescriptions: {
      name: 'Full name of applicant',
      email: 'Email address',
      company: 'Website, brand, or company name (optional)',
      phone: 'Phone number (optional)',
      service: 'Service area of interest (optional)',
      message: 'Background, platforms, and audience details (optional)',
    },
  },
  'white-label': {
    toolname: 'request_white_label',
    tooldescription:
      'Request a white-label agency partnership with WordsThatSells for reselling digital marketing services.',
    paramDescriptions: {
      name: 'Full name',
      email: 'Email address',
      company: 'Agency or company name (optional)',
      phone: 'Phone number (optional)',
      message: 'Services offered, client volume, and partnership goals',
    },
  },
  newsletter: {
    toolname: 'subscribe_newsletter',
    tooldescription:
      'Subscribe an email address to the WordsThatSells newsletter for AI marketing tips and case studies in Southeast Asia.',
    paramDescriptions: {
      email: 'Email address to subscribe',
    },
  },
};

const registeredToolNames = new Set();
let observerStarted = false;

function guessFormKind(form) {
  if (!form) return null;
  const type =
    (form.dataset && form.dataset.formType) ||
    (form.querySelector('input[name="form_type"]') || {}).value ||
    '';
  if (type && TOOL_CATALOG[type]) return type;

  const toolname = form.getAttribute('toolname');
  if (toolname) {
    const byTool = Object.entries(TOOL_CATALOG).find(([, m]) => m.toolname === toolname);
    if (byTool) return byTool[0];
  }

  if (form.id === 'newsletter-form' || form.classList.contains('newsletter-form')) return 'newsletter';
  if (form.id === 'form-consultation') return 'consultation';
  if (form.id === 'form-free-support') return 'free-support';
  if (form.id === 'form-affiliate') return 'affiliate';
  if (form.id === 'form-white-label') return 'white-label';
  if (form.id === 'quote-form') {
    const overlay = document.getElementById('quote-modal-overlay');
    const ft = overlay && overlay.dataset.formType;
    if (ft && TOOL_CATALOG[ft]) return ft;
    return 'general-inquiry';
  }
  if (form.id && form.id.startsWith('dynamic-form-')) {
    const ft = form.id.replace('dynamic-form-', '');
    if (TOOL_CATALOG[ft]) return ft;
  }
  if (form.closest('[data-wts-form]')) {
    const ft = form.closest('[data-wts-form]').getAttribute('data-wts-form');
    if (ft && TOOL_CATALOG[ft]) return ft;
  }
  // Heuristic: email-only => newsletter
  const fields = [...form.querySelectorAll('input,select,textarea')].filter(
    (el) => el.name && el.type !== 'hidden' && el.type !== 'submit'
  );
  if (fields.length === 1 && fields[0].type === 'email') return 'newsletter';
  return null;
}

/**
 * Apply declarative WebMCP attributes to a form element.
 * Attributes: toolname, tooldescription, toolparamdescription on fields.
 * @returns {boolean} true if annotated
 */
export function annotateFormForWebMCP(form, kindHint) {
  if (!form || form.nodeName !== 'FORM') return false;
  const kind = kindHint || guessFormKind(form);
  const meta = kind ? TOOL_CATALOG[kind] : null;

  // If already annotated with both attrs, still refresh field param descriptions when meta known
  if (!meta) {
    // Keep existing toolname/tooldescription; ensure fields have some description
    if (!form.getAttribute('toolname') || !form.getAttribute('tooldescription')) {
      return false;
    }
    form.querySelectorAll('input, select, textarea').forEach((el) => {
      if (!el.name || el.type === 'hidden' || el.type === 'submit') return;
      if (el.getAttribute('toolparamdescription')) return;
      const desc =
        el.getAttribute('aria-label') ||
        el.getAttribute('aria-description') ||
        el.placeholder ||
        el.name;
      el.setAttribute('toolparamdescription', desc);
      if (!el.getAttribute('aria-label') && !el.getAttribute('aria-description')) {
        el.setAttribute('aria-description', desc);
      }
    });
    return true;
  }

  form.setAttribute('toolname', meta.toolname);
  form.setAttribute('tooldescription', meta.tooldescription);
  // Prefer human confirmation for commercial forms (no toolautosubmit)
  form.removeAttribute('toolautosubmit');
  if (!form.dataset.formType) form.dataset.formType = kind;

  form.querySelectorAll('input, select, textarea').forEach((el) => {
    if (!el.name || el.type === 'hidden' || el.type === 'submit') return;
    const desc =
      (meta.paramDescriptions && meta.paramDescriptions[el.name]) ||
      el.getAttribute('toolparamdescription') ||
      el.getAttribute('aria-label') ||
      el.getAttribute('aria-description') ||
      el.placeholder ||
      el.name;
    el.setAttribute('toolparamdescription', desc);
    // Lighthouse schema validity also accepts aria-description / label text
    if (!el.getAttribute('aria-label') && !el.getAttribute('aria-description')) {
      el.setAttribute('aria-description', desc);
    }
  });

  return true;
}

/** Annotate every known form currently in the document. */
export function annotateAllFormsForWebMCP() {
  let count = 0;
  document.querySelectorAll('form').forEach((form) => {
    if (annotateFormForWebMCP(form)) count += 1;
  });
  return count;
}

function fieldSchemaType(el) {
  const t = (el.type || '').toLowerCase();
  if (t === 'number' || t === 'range') return 'number';
  if (t === 'checkbox') return 'boolean';
  return 'string';
}

function buildInputSchemaFromForm(form, meta) {
  const properties = {};
  const required = [];
  form.querySelectorAll('input, select, textarea').forEach((el) => {
    if (!el.name || el.type === 'hidden' || el.type === 'submit') return;
    const description =
      (meta.paramDescriptions && meta.paramDescriptions[el.name]) ||
      el.getAttribute('toolparamdescription') ||
      el.getAttribute('aria-description') ||
      el.getAttribute('aria-label') ||
      el.placeholder ||
      el.name;

    /** @type {Record<string, unknown>} */
    const prop = {
      type: fieldSchemaType(el),
      description,
    };

    if (el.type === 'email') {
      prop.type = 'string';
      prop.format = 'email';
    }

    if (el.tagName === 'SELECT') {
      const opts = [...el.options]
        .map((o) => ({ const: o.value, title: (o.textContent || '').trim() }))
        .filter((o) => o.const !== '');
      if (opts.length) {
        prop.enum = opts.map((o) => o.const);
        prop.anyOf = opts.map((o) => ({
          type: 'string',
          const: o.const,
          title: o.title || o.const,
        }));
      }
    }

    properties[el.name] = prop;
    if (el.required) required.push(el.name);
  });

  const schema = { type: 'object', properties };
  if (required.length) schema.required = required;
  return schema;
}

function buildInputSchemaFromCatalog(kind) {
  const meta = TOOL_CATALOG[kind];
  if (!meta) return { type: 'object', properties: {} };
  const properties = {};
  const required = [];
  Object.entries(meta.paramDescriptions || {}).forEach(([name, description]) => {
    const prop = { type: 'string', description };
    if (name === 'email') prop.format = 'email';
    properties[name] = prop;
    if (name === 'name' || name === 'email' || name === 'message') {
      // newsletter only requires email
      if (kind === 'newsletter') {
        if (name === 'email') required.push(name);
      } else if (name === 'name' || name === 'email') {
        required.push(name);
      }
    }
  });
  const schema = { type: 'object', properties };
  if (required.length) schema.required = required;
  return schema;
}

function fillFormFromArgs(form, args) {
  if (!args || typeof args !== 'object') return;
  Object.entries(args).forEach(([key, value]) => {
    const el = form.querySelector(`[name="${CSS.escape(key)}"]`);
    if (!el) return;
    if (el.type === 'checkbox') {
      el.checked = Boolean(value);
    } else {
      el.value = value == null ? '' : String(value);
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function openModalIfNeeded(form) {
  const overlay =
    form.closest('.modal-overlay') ||
    form.closest('.form-modal-overlay') ||
    document.getElementById('quote-modal-overlay');
  if (overlay) {
    overlay.classList.add('active');
    overlay.style.display = 'flex';
    document.body.classList.add('no-scroll');
  }
}

/**
 * Resolve modelContext (Chrome 150+: document; legacy: navigator).
 * @returns {{ registerTool: Function } | null}
 */
export function getModelContext() {
  if (typeof document !== 'undefined' && document.modelContext) {
    return document.modelContext;
  }
  if (typeof navigator !== 'undefined' && navigator.modelContext) {
    return navigator.modelContext;
  }
  return null;
}

async function registerOneTool(ctx, def) {
  if (!ctx || typeof ctx.registerTool !== 'function') return false;
  if (!def || !def.name || registeredToolNames.has(def.name)) return false;
  try {
    await ctx.registerTool(def);
    registeredToolNames.add(def.name);
    return true;
  } catch (e) {
    // Already registered is fine
    const msg = (e && e.message) || String(e);
    if (/already|duplicate|exist/i.test(msg)) {
      registeredToolNames.add(def.name);
      return true;
    }
    console.warn('[WebMCP] registerTool failed for', def.name, msg);
    return false;
  }
}

/**
 * Register imperative WebMCP tools for annotated forms (when API is available).
 * Falls back silently if the browser does not support WebMCP.
 */
export async function registerWebMCPToolsFromForms() {
  const ctx = getModelContext();
  if (!ctx || typeof ctx.registerTool !== 'function') {
    return { supported: false, registered: 0 };
  }

  let registered = 0;
  const forms = [...document.querySelectorAll('form[toolname]')];
  const seen = new Set();

  for (const form of forms) {
    const name = form.getAttribute('toolname');
    const description = form.getAttribute('tooldescription') || '';
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const kind = guessFormKind(form);
    const meta = (kind && TOOL_CATALOG[kind]) || {
      toolname: name,
      tooldescription: description,
      paramDescriptions: {},
    };
    const inputSchema = buildInputSchemaFromForm(form, meta);

    const ok = await registerOneTool(ctx, {
      name,
      description,
      inputSchema,
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: false,
      },
      execute: async (args) => {
        openModalIfNeeded(form);
        fillFormFromArgs(form, args || {});
        try {
          form.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (_) {
          /* ignore */
        }

        // Prefer agent-aware submit path when the page handlers support it
        return new Promise((resolve) => {
          let settled = false;
          const finish = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
          };

          try {
            const submitter = form.querySelector('button[type="submit"], input[type="submit"]');
            const event =
              typeof SubmitEvent === 'function'
                ? new SubmitEvent('submit', {
                    bubbles: true,
                    cancelable: true,
                    submitter: submitter || undefined,
                  })
                : new Event('submit', { bubbles: true, cancelable: true });

            try {
              Object.defineProperty(event, 'agentInvoked', {
                value: true,
                configurable: true,
              });
            } catch (_) {
              event.agentInvoked = true;
            }

            if (typeof event.respondWith !== 'function') {
              event.respondWith = (promise) => {
                Promise.resolve(promise)
                  .then((v) =>
                    finish(
                      typeof v === 'string' ? v : JSON.stringify(v || { ok: true })
                    )
                  )
                  .catch((err) =>
                    finish(JSON.stringify({ ok: false, error: err.message || String(err) }))
                  );
              };
            }

            form.dispatchEvent(event);

            // If handlers did not call respondWith, report filled form for human confirm
            setTimeout(() => {
              finish(
                `Filled the "${name}" form with the provided fields. A human may still need to confirm submit if the page did not auto-respond.`
              );
            }, 2500);
          } catch (err) {
            finish(
              `Filled the "${name}" form. Submit manually if needed. (${err && err.message})`
            );
          }
        });
      },
    });
    if (ok) registered += 1;
  }

  // Read-only site info tool (always useful for agents)
  if (!seen.has('list_site_services') && !registeredToolNames.has('list_site_services')) {
    const ok = await registerOneTool(ctx, {
      name: 'list_site_services',
      description:
        'List primary WordsThatSells service areas and key URLs for digital marketing in Laos and Southeast Asia.',
      inputSchema: {
        type: 'object',
        properties: {
          locale: {
            type: 'string',
            description: 'Optional locale prefix (default en)',
            enum: ['en'],
          },
        },
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: false,
      },
      execute: async () =>
        JSON.stringify({
          brand: 'WordsThatSells',
          location: 'Vientiane, Laos',
          services: [
            'SEO & local visibility',
            'Content & brand storytelling',
            'Social media growth',
            'Web development',
            'AI business tools & automation',
          ],
          urls: {
            home: 'https://wordsthatsells.website/en/',
            services: 'https://wordsthatsells.website/en/digital-marketing-services/',
            pricing: 'https://wordsthatsells.website/en/digital-marketing-services/prices/',
            contact: 'https://wordsthatsells.website/en/company/contact-us/',
            about: 'https://wordsthatsells.website/en/company/about-us/',
          },
          contact: {
            email: 'info@wordsthatsells.website',
            whatsapp: 'https://wa.me/8562055528034',
          },
        }),
    });
    if (ok) registered += 1;
  }

  // Catalog fallback tools for kinds not present as live forms on this page
  // (helps agents discover capabilities from any marketing URL)
  for (const kind of ['contact', 'newsletter', 'consultation']) {
    const meta = TOOL_CATALOG[kind];
    if (!meta || registeredToolNames.has(meta.toolname) || seen.has(meta.toolname)) continue;
    // Only register contact/newsletter fallbacks when no matching form exists
    const hasForm = forms.some((f) => f.getAttribute('toolname') === meta.toolname);
    if (hasForm) continue;

    const ok = await registerOneTool(ctx, {
      name: meta.toolname,
      description: `${meta.tooldescription} (opens the preferred URL if this page has no matching form)`,
      inputSchema: buildInputSchemaFromCatalog(kind),
      annotations: {
        readOnlyHint: false,
        untrustedContentHint: false,
      },
      execute: async (args) => {
        const urls = {
          contact: 'https://wordsthatsells.website/en/company/contact-us/',
          newsletter: 'https://wordsthatsells.website/en/',
          consultation: 'https://wordsthatsells.website/en/digital-marketing-services/prices/',
        };
        const target = urls[kind] || 'https://wordsthatsells.website/en/company/contact-us/';
        // Prefer in-page form if it appears later
        const live = document.querySelector(`form[toolname="${meta.toolname}"]`);
        if (live) {
          fillFormFromArgs(live, args || {});
          openModalIfNeeded(live);
          return `Filled on-page form "${meta.toolname}". Confirm submit if needed.`;
        }
        return JSON.stringify({
          ok: true,
          action: 'navigate',
          url: target,
          message: `No "${meta.toolname}" form on this page. Open ${target} and use the annotated form there.`,
          suggestedArgs: args || {},
        });
      },
    });
    if (ok) registered += 1;
  }

  return { supported: true, registered };
}

function ensureToolActiveStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('wts-webmcp-styles')) return;
  const style = document.createElement('style');
  style.id = 'wts-webmcp-styles';
  style.textContent = `
    form:tool-form-active {
      outline: 2px dashed #2563eb;
      outline-offset: 4px;
      border-radius: 8px;
    }
    button:tool-submit-active,
    input:tool-submit-active {
      outline: 2px dashed #e91e8c;
      outline-offset: 2px;
    }
  `;
  document.head.appendChild(style);
}

function startFormObserver() {
  if (observerStarted || typeof MutationObserver === 'undefined' || !document.body) return;
  observerStarted = true;
  let scheduled = false;
  const obs = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(async () => {
      scheduled = false;
      annotateAllFormsForWebMCP();
      await registerWebMCPToolsFromForms();
    });
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

/**
 * Full init: annotate forms then register tools.
 * Safe to call multiple times after dynamic form mounts.
 */
export async function initWebMCP() {
  if (typeof window !== 'undefined') {
    window.__wtsAnnotateForm = annotateFormForWebMCP;
    window.__wtsInitWebMCP = initWebMCP;
  }
  ensureToolActiveStyles();
  const annotated = annotateAllFormsForWebMCP();
  const result = await registerWebMCPToolsFromForms();
  startFormObserver();
  return { ...result, annotated };
}
