// js/main.js

import { handleFormSubmit, handleNewsletterSubmit } from './modules/firebase.js'; 
import { initScrollReveal, initModalsAndButtons } from './modules/ui.js';
import { initFaqSection } from './modules/faq.js';
import { initSlidePanel } from './modules/slide.js';

document.addEventListener('DOMContentLoaded', () => {
  initScrollReveal();
  initModalsAndButtons();
  initFaqSection();
  initSlidePanel();

  // Connect the Affiliate Form
  const quoteForm = document.getElementById('quote-form');
  if (quoteForm) {
    quoteForm.addEventListener('submit', handleFormSubmit);
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
