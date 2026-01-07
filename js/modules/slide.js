// js/modules/slide.js
import { revealObserver } from './ui.js';

export function initSlidePanel() {
  // apply reveal to any existing .reveal nodes on this page section (idempotent)
  document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));

  // --- SLIDE-IN PANEL LOGIC ---
  const slideInPanel = document.getElementById('details-slide-in');
  const overlay = document.getElementById('details-overlay');
  const closeBtn = document.getElementById('slide-in-close');
  const learnMoreBtns = document.querySelectorAll('.btn-learn-more');
  const slideInTitle = document.getElementById('slide-in-title');
  const slideInImage = document.getElementById('slide-in-image');
  const slideInContent = document.getElementById('slide-in-content');

  if (!slideInPanel || !overlay || !slideInTitle || !slideInImage || !slideInContent) {
    // Slide-in UI not present on this page; safely exit.
    return;
  }

  /**
   * Sanitize HTML content from trusted data attributes
   * @param {HTMLElement} sourceElement - Source element with content
   * @returns {string} Sanitized HTML
   */
  function sanitizeContent(sourceElement) {
    // Clone the element to work with it safely
    const clone = sourceElement.cloneNode(true);

    // Remove any script tags
    const scripts = clone.querySelectorAll('script');
    scripts.forEach(script => script.remove());

    // Remove event handlers (onclick, onerror, etc.)
    const allElements = clone.querySelectorAll('*');
    allElements.forEach(el => {
      Array.from(el.attributes).forEach(attr => {
        if (attr.name.startsWith('on')) {
          el.removeAttribute(attr.name);
        }
      });
    });

    return clone.innerHTML;
  }

  function openPanel(serviceKey) {
    const detailsSource = document.getElementById(`details-${serviceKey}`);
    if (!detailsSource) {
      console.error(`No details found for service: ${serviceKey}`);
      return;
    }
    const title = detailsSource.dataset.title || '';
    const imgSrc = detailsSource.dataset.img || '';

    // Sanitize content before injecting to prevent XSS
    const contentHTML = sanitizeContent(detailsSource);

    slideInTitle.textContent = title; // textContent prevents XSS
    slideInImage.src = imgSrc;
    slideInImage.alt = `${title} detail image`;
    slideInContent.innerHTML = contentHTML; // Now sanitized

    document.body.classList.add('no-scroll');
    overlay.classList.add('is-open');
    slideInPanel.classList.add('is-open');
  }

  function closePanel() {
    document.body.classList.remove('no-scroll');
    overlay.classList.remove('is-open');
    slideInPanel.classList.remove('is-open');
  }

  learnMoreBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const serviceKey = btn.dataset.service;
      openPanel(serviceKey);
    });
  });

  if (closeBtn) closeBtn.addEventListener('click', closePanel);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePanel();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && slideInPanel.classList.contains('is-open')) closePanel();
  });
}
