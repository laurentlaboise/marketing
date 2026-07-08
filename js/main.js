// js/main.js

import { handleFormSubmit, handleNewsletterSubmit, loadQuoteFormTemplate, initStickyFormTabs, mountAdminForms } from './modules/firebase.js';
import { initScrollReveal, initModalsAndButtons } from './modules/ui.js';
import { initFaqSection } from './modules/faq.js';
import { initSlidePanel } from './modules/slide.js';

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
  document.querySelectorAll('#newsletter-form, form.newsletter-form').forEach(form => {
    form.addEventListener('submit', handleNewsletterSubmit);
  });

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
