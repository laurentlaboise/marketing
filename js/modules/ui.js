// js/modules/ui.js

// --- Shared On-Scroll Reveal Observer (singleton) ---
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.1 });

export { revealObserver };

// Initialize reveal on all current .reveal elements
export function initScrollReveal() {
  document.querySelectorAll('.reveal').forEach((el) => revealObserver.observe(el));
}

// --- Floating Buttons & Quote Modal ---
export function initModalsAndButtons() {
  const backToTopButton = document.querySelector('.back-to-top');
  const quoteTab = document.getElementById('quote-tab');
  const modalOverlay = document.getElementById('quote-modal-overlay');
  const closeModalBtn = document.getElementById('modal-close-btn');

  const handleFloatingButtons = () => {
    const shouldShow = window.scrollY > 300;
    if (backToTopButton) backToTopButton.classList.toggle('show', shouldShow);
    if (quoteTab) quoteTab.classList.toggle('show', shouldShow);
  };

  const openModal = () => {
    if (modalOverlay) modalOverlay.style.display = 'flex';
  };
  const closeModal = () => {
    if (modalOverlay) modalOverlay.style.display = 'none';
  };

  window.addEventListener('scroll', handleFloatingButtons);
  if (quoteTab) quoteTab.addEventListener('click', openModal);
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });
  }
}
