// js/main.js
// Production-grade entry point with observability and resilience

import { handleFormSubmit, handleNewsletterSubmit } from './modules/firebase.js';
import { initScrollReveal, initModalsAndButtons } from './modules/ui.js';
import { initFaqSection } from './modules/faq.js';
import { initSlidePanel } from './modules/slide.js';
import { initObservability } from './utils/observability.js';

// Initialize observability FIRST (before any other code runs)
initObservability();

document.addEventListener('DOMContentLoaded', () => {
  try {
    // Initialize UI modules
    initScrollReveal();
    initModalsAndButtons();
    initFaqSection();
    initSlidePanel();

    // Connect the Affiliate Form
    const quoteForm = document.getElementById('quote-form');
    if (quoteForm) {
      quoteForm.addEventListener('submit', handleFormSubmit);
    }

    // Connect the Newsletter form
    const newsletterForm = document.getElementById('newsletter-form');
    if (newsletterForm) {
      newsletterForm.addEventListener('submit', handleNewsletterSubmit);
    }

    updateFooterLanguageLinks();

    console.info('[App] Initialization complete. All systems operational.');
  } catch (error) {
    console.error('[App] Critical initialization error:', error);

    // Report to Sentry
    if (window.Sentry) {
      window.Sentry.captureException(error, {
        tags: { component: 'app-initialization' },
      });
    }
  }
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

// Expose debug utilities in development
if (import.meta.env?.MODE !== 'production') {
  window.__debugUtils = {
    getFirebaseMetrics: () => window.__firebaseMetrics?.(),
    resetCircuitBreaker: () => {
      console.warn('[Debug] Manual circuit breaker reset not yet implemented');
    },
    clearQueue: () => {
      localStorage.removeItem('pendingSubmissions');
      localStorage.removeItem('pendingNewsletterSignups');
      console.info('[Debug] All queues cleared');
    }
  };

  console.info('[Debug] Debug utilities available via window.__debugUtils');
}
