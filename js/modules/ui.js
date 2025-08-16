// js/modules/ui.js

// --- On-Scroll Reveal Animations ---
const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
        }
    });
}, { threshold: 0.1 });

export function initScrollReveal() {
    document.querySelectorAll('.reveal').forEach(elem => {
        revealObserver.observe(elem);
    });
}

// Re-export for use in other modules if needed
export { revealObserver };

// --- Floating Buttons & Modal Logic ---
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

 // --- Footer multi-language link rewriting logic ---
            const pathParts = window.location.pathname.split('/');
            const currentLang = pathParts[1] || 'en';
            const linkContainers = document.querySelectorAll('[data-i18n-links]');
            linkContainers.forEach(container => {
                container.querySelectorAll('a').forEach(link => {
                    const href = link.getAttribute('href');
                    if (href && href.startsWith('/')) {
                        link.setAttribute('href', `/${currentLang}${href}`);
                    }
