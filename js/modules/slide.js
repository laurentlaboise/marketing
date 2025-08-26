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

  function openPanel(serviceKey) {
    const detailsSource = document.getElementById(`details-${serviceKey}`);
    if (!detailsSource) {
      console.error(`No details found for service: ${serviceKey}`);
      return;
    }
    const title = detailsSource.dataset.title || '';
    const imgSrc = detailsSource.dataset.img || '';
    const contentHTML = detailsSource.innerHTML || '';

    slideInTitle.textContent = title;
    slideInImage.src = imgSrc;
    slideInImage.alt = `${title} detail image`;
    slideInContent.innerHTML = contentHTML;

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
