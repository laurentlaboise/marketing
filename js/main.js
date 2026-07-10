// js/main.js

import {
  handleFormSubmit,
  handleNewsletterSubmit,
  handleDynamicFormSubmit,
  loadQuoteFormTemplate,
  initStickyFormTabs,
  mountAdminForms,
} from './modules/firebase.js';
import { initScrollReveal, initModalsAndButtons } from './modules/ui.js';
import { initFaqSection } from './modules/faq.js';
import { initSlidePanel } from './modules/slide.js';
import { initWebMCP } from './modules/webmcp.js';
import { initLangSwitcher } from './modules/lang-switcher.js';

// Enable the scroll-reveal hidden start-state only once this module is actually
// running. If main.js ever fails to load/execute, .js-reveal is never set and
// every .reveal element stays at its visible default — content is never trapped
// invisible. Set at module top level (before DOMContentLoaded) to minimise any
// flash of the pre-animation state.
document.documentElement.classList.add('js-reveal');

document.addEventListener('DOMContentLoaded', async () => {
  initScrollReveal();
  initModalsAndButtons();
  initFaqSection();
  initSlidePanel();
  initStickyFormTabs();
  initLangSwitcher();

  // Annotate static forms early (Lighthouse form coverage / schema validity).
  // __wtsAnnotateForm is exposed for dynamic mounts that follow.
  await initWebMCP();

  // On-page admin forms (e.g. contact page: data-wts-form="contact")
  await mountAdminForms();

  // Try to load a dynamic form template from the admin.
  // If a template exists for this page's form type, it replaces the hardcoded form.
  // If not, fall back to the static #quote-form handler.
  const dynamicLoaded = await loadQuoteFormTemplate();
  if (!dynamicLoaded) {
    const quoteForm = document.getElementById('quote-form');
    if (quoteForm) {
      quoteForm.addEventListener('submit', handleFormSubmit);
    }
  }

  // Connect all Newsletter forms (by ID or class)
  document.querySelectorAll('#newsletter-form, form.newsletter-form').forEach((form) => {
    form.addEventListener('submit', handleNewsletterSubmit);
  });

  // Static contact / page forms that still need a submit handler
  document.querySelectorAll('#contact-static-form, form.wts-page-form').forEach((form) => {
    if (form.dataset.wtsBound) return;
    form.dataset.wtsBound = '1';
    form.addEventListener('submit', handleDynamicFormSubmit);
  });

  // Re-annotate + register after dynamic mounts so tools match final DOM
  await initWebMCP();

  updateFooterLanguageLinks();
});

function updateFooterLanguageLinks() {
  const pathParts = window.location.pathname.split('/');
  const currentLang = pathParts[1] || 'en';
  const linkContainers = document.querySelectorAll('[data-i18n-links]');
  linkContainers.forEach((container) => {
    container.querySelectorAll('a').forEach((link) => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('/') && !href.startsWith(`/${currentLang}/`)) {
        link.setAttribute('href', `/${currentLang}${href}`);
      }
    });
  });
}
