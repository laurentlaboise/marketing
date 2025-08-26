// js/main.js
import { supabase } from './modules/supabase.js';
import { initScrollReveal, initModalsAndButtons } from './modules/ui.js';
import { initFaqSection } from './modules/faq.js';
import { initSlidePanel } from './modules/slide.js';

document.addEventListener('DOMContentLoaded', () => {
  // --- Initialize UI Components ---
  initScrollReveal();
  initModalsAndButtons();
  initFaqSection();
  initSlidePanel();

  // --- Page-Specific Logic ---
  handleAffiliateFormSubmission();
  updateFooterLanguageLinks();
});

// --- Affiliate Form Submission Handler ---
function handleAffiliateFormSubmission() {
  const quoteForm = document.getElementById('quote-form');
  if (!quoteForm) return;

  quoteForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitButton = quoteForm.querySelector('button[type="submit"]');
    const modalContainer = document.getElementById('quote-modal-container');
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Submitting...`;
    }

    const formData = new FormData(quoteForm);
    const submission = Object.fromEntries(formData.entries());

    let data, error;
    try {
      const result = await supabase.from('GET A QUOTE WTS').insert([submission]);
      data = result.data;
      error = result.error;
    } catch (err) {
      error = err;
    }

    if (modalContainer) {
      if (error) {
        console.error('Supabase error:', error.message || error);
        modalContainer.innerHTML = `<h2 class="modal-title">Error!</h2><p>Something went wrong. Please try again.</p>`;
      } else {
        console.log('Supabase success:', data);
        modalContainer.innerHTML = `<h2 class="modal-title">Thank You!</h2><p>Your application is sent. We'll reply within 24 hours.</p>`;
      }
    }

    // Close the modal after a delay if it exists
    setTimeout(() => {
      const overlay = document.getElementById('quote-modal-overlay');
      if (overlay) overlay.style.display = 'none';
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.innerHTML = `Submit`;
      }
      quoteForm.reset();
    }, 4000);
  });
}

// --- Footer Multi-language Link Logic ---
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
