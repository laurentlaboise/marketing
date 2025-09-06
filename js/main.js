// js/main.js

// 1. UPDATED THIS LINE: Import both form handlers now.
import { handleFormSubmit, handleNewsletterSubmit } from './modules/firebase.js'; 
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
  const quoteForm = document.getElementById('quote-form');
  if (quoteForm) {
    quoteForm.addEventListener('submit', handleFormSubmit);
  }

  // --- 2. ADDED THIS BLOCK: Connect the new newsletter form ---
  const newsletterForm = document.getElementById('newsletter-form');
  if (newsletterForm) {
    newsletterForm.addEventListener('submit', handleNewsletterSubmit);
  }

  // --- Page-Specific Logic ---
  updateFooterLanguageLinks();
});


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
