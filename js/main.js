// js/main.js
import { handleFormSubmit } from './modules/firebase.js'; // <-- 1. Switched to Firebase
import { initScrollReveal, initModalsAndButtons } from './modules/ui.js';
import { initFaqSection } from './modules/faq.js';
import { initSlidePanel } from './modules/slide.js';

document.addEventListener('DOMContentLoaded', () => {
  // --- Initialize UI Components ---
  initScrollReveal();
  initModalsAndButtons();
  initFaqSection();
  initSlidePanel();

  // --- Connect the Affiliate Form to Firebase ---
  const quoteForm = document.getElementById('quote-form'); // <-- 2. Find the form
  if (quoteForm) {
    quoteForm.addEventListener('submit', handleFormSubmit); // <-- 3. Connect it
  }

  // --- Page-Specific Logic ---
  updateFooterLanguageLinks();
});


// --- The old handleAffiliateFormSubmission() function is now removed ---
// --- All form logic is now handled in js/modules/firebase.js ---


// --- Footer Multi-language Link Logic (This function remains unchanged) ---
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
