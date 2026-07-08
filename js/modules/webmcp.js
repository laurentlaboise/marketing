/**
 * WebMCP helpers — declarative form annotations + imperative tool registration.
 * Spec: https://developer.chrome.com/docs/ai/webmcp
 * Uses document.modelContext when available (Chrome WebMCP origin trial / flags).
 */

const TOOL_CATALOG = {
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
  affiliate: {
    toolname: 'apply_affiliate_program',
    tooldescription:
      'Apply to the WordsThatSells affiliate partner program to earn commission promoting digital marketing services.',
    paramDescriptions: {
      name: 'Full name of applicant',
      email: 'Email address',
      company: 'Company or brand name (optional)',
      service: 'Service area of interest',
      message: 'Background or partnership details (optional)',
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

function guessFormKind(form) {
  if (!form) return null;
  const type =
    (form.dataset && form.dataset.formType) ||
    (form.querySelector('input[name="form_type"]') || {}).value ||
    '';
  if (type && TOOL_CATALOG[type]) return type;
  if (form.id === 'newsletter-form' || form.classList.contains('newsletter-form')) return 'newsletter';
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
 */
export function annotateFormForWebMCP(form, kindHint) {
  if (!form || form.nodeName !== 'FORM') return false;
  const kind = kindHint || guessFormKind(form);
  const meta = kind ? TOOL_CATALOG[kind] : null;
  if (!meta) return false;

  form.setAttribute('toolname', meta.toolname);
  form.setAttribute('tooldescription', meta.tooldescription);
  // Prefer human confirmation for contact / commercial forms
  form.removeAttribute('toolautosubmit');

  form.querySelectorAll('input, select, textarea').forEach((el) => {
    if (!el.name || el.type === 'hidden' || el.type === 'submit') return;
    const desc =
      (meta.paramDescriptions && meta.paramDescriptions[el.name]) ||
      el.getAttribute('aria-label') ||
      el.placeholder ||
      el.name;
    el.setAttribute('toolparamdescription', desc);
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

function buildInputSchemaFromForm(form, meta) {
  const properties = {};
  const required = [];
  form.querySelectorAll('input, select, textarea').forEach((el) => {
    if (!el.name || el.type === 'hidden' || el.type === 'submit') return;
    const prop = {
      type: 'string',
      description:
        (meta.paramDescriptions && meta.paramDescriptions[el.name]) ||
        el.getAttribute('toolparamdescription') ||
        el.placeholder ||
        el.name,
    };
    if (el.tagName === 'SELECT') {
      const opts = [...el.options]
        .map((o) => o.value)
        .filter((v) => v !== '');
      if (opts.length) prop.enum = opts;
    }
    properties[el.name] = prop;
    if (el.required) required.push(el.name);
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
    el.value = value == null ? '' : String(value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

/**
 * Register imperative WebMCP tools for annotated forms (when API is available).
 * Falls back silently if the browser does not support WebMCP.
 */
export async function registerWebMCPToolsFromForms() {
  // Prefer document.modelContext (navigator.modelContext is deprecated in Chrome 150+)
  const ctx =
    (typeof document !== 'undefined' && document.modelContext) ||
    (typeof navigator !== 'undefined' && navigator.modelContext) ||
    null;
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

    try {
      await ctx.registerTool({
        name,
        description,
        inputSchema,
        annotations: {
          readOnlyHint: false,
          untrustedContentHint: false,
        },
        execute: async (args) => {
          fillFormFromArgs(form, args || {});
          try {
            form.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } catch (_) {
            /* ignore */
          }
          // Declarative tools prefer human confirm (no toolautosubmit).
          // Imperative path fills fields; site submit handlers still process real posts.
          form.dispatchEvent(
            new Event('submit', { bubbles: true, cancelable: true })
          );
          // Chrome WebMCP execute should return a string (or serializable result)
          return `Filled the "${name}" form. A human may still need to confirm submit.`;
        },
      });
      registered += 1;
    } catch (e) {
      console.warn('[WebMCP] registerTool failed for', name, e && e.message);
    }
  }

  if (!seen.has('list_site_services')) {
    try {
      await ctx.registerTool({
        name: 'list_site_services',
        description:
          'List primary WordsThatSells service areas and key URLs for digital marketing in Laos and Southeast Asia.',
        inputSchema: {
          type: 'object',
          properties: {},
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
              services:
                'https://wordsthatsells.website/en/digital-marketing-services/',
              pricing:
                'https://wordsthatsells.website/en/digital-marketing-services/prices/',
              contact:
                'https://wordsthatsells.website/en/company/contact-us/',
            },
          }),
      });
      registered += 1;
    } catch (e) {
      console.warn('[WebMCP] list_site_services failed', e && e.message);
    }
  }

  return { supported: true, registered };
}

/**
 * Full init: annotate forms then register tools.
 * Safe to call multiple times after dynamic form mounts.
 */
export async function initWebMCP() {
  // Expose for dynamically rendered forms (firebase renderFormTemplate)
  if (typeof window !== 'undefined') {
    window.__wtsAnnotateForm = annotateFormForWebMCP;
  }
  annotateAllFormsForWebMCP();
  return registerWebMCPToolsFromForms();
}
