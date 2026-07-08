// js/modules/ui.js

// --- Shared On-Scroll Reveal Observer (singleton) ---
// rootMargin pre-reveals content slightly before it enters the viewport so
// below-the-fold sections (forms, FAQs) are not stuck at opacity:0 after jump links.
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: 0.05, rootMargin: '0px 0px 20% 0px' });

export { revealObserver };

// Initialize reveal on all current .reveal elements
export function initScrollReveal() {
  document.querySelectorAll('.reveal').forEach((el) => {
    // Hero / above-the-fold: mark visible without reading layout (avoids forced reflow + CLS)
    if (el.classList.contains('reveal-instant') || el.closest('.hero-section')) {
      el.classList.add('visible');
      return;
    }
    // Already in (or near) the viewport on load — show immediately (IO can miss these).
    // Use a single rAF so we batch after paint instead of forcing reflow mid-setup.
    const revealIfNear = () => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      if (rect.top < vh * 1.15 && rect.bottom > 0) {
        el.classList.add('visible');
      }
      revealObserver.observe(el);
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(revealIfNear);
    } else {
      revealIfNear();
    }
  });
}

// --- Floating Buttons & Quote Modal ---
// The floating "quote / Affiliate Application" tab is no longer hard-coded in the
// page markup — it is now an admin-managed sticky form button rendered by
// js/modules/firebase.js (initStickyFormTabs). This keeps the back-to-top button
// and the shared quote modal's close handlers, which the dynamic system still
// opens via window.WTSQuote.open().
export function initModalsAndButtons() {
  const backToTopButton = document.querySelector('.back-to-top');
  const modalOverlay = document.getElementById('quote-modal-overlay');
  const closeModalBtn = document.getElementById('modal-close-btn');

  const handleFloatingButtons = () => {
    const shouldShow = window.scrollY > 300;
    if (backToTopButton) backToTopButton.classList.toggle('show', shouldShow);
  };

  const closeModal = () => {
    if (!modalOverlay) return;
    // Full cleanup so the page never stays scroll-locked after closing: clear
    // the .active class and release the body scroll-lock as well as hiding.
    modalOverlay.classList.remove('active');
    modalOverlay.style.display = 'none';
    document.body.classList.remove('no-scroll');
  };

  window.addEventListener('scroll', handleFloatingButtons);

  // Back to top: scroll smoothly and hide the button immediately. Relying only
  // on a trailing scroll event left it visible over the hero header in some
  // cases; this guarantees it disappears and doesn't leave a #top hash behind.
  if (backToTopButton) {
    backToTopButton.addEventListener('click', (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      backToTopButton.classList.remove('show');
    });
  }
  if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeModal();
    });
  }

  // Escape closes the quote modal when it's open (covers the third close path).
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !modalOverlay) return;
    if (getComputedStyle(modalOverlay).display !== 'none') closeModal();
  });
}
