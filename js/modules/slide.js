/*js/modules/slide.js*/
document.addEventListener('DOMContentLoaded', () => {
    // --- On-scroll reveal animations ---
    // This looks for elements with the class 'reveal' and adds the 'visible'
    // class when they scroll into view, triggering a CSS animation.
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, {
        threshold: 0.1
    });
    document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

    // --- SLIDE-IN PANEL LOGIC ---
    // Getting references to all the necessary DOM elements for the panel
    const slideInPanel = document.getElementById('details-slide-in');
    const overlay = document.getElementById('details-overlay');
    const closeBtn = document.getElementById('slide-in-close');
    const learnMoreBtns = document.querySelectorAll('.btn-learn-more');
    const slideInTitle = document.getElementById('slide-in-title');
    const slideInImage = document.getElementById('slide-in-image');
    const slideInContent = document.getElementById('slide-in-content');

    /**
     * Opens the slide-in panel and populates it with content from a hidden div in the HTML.
     * @param {string} serviceKey - The key from the button's data-service attribute (e.g., 'copywriting').
     */
    function openPanel(serviceKey) {
        // Find the hidden source div using the serviceKey (e.g., id="details-copywriting")
        const detailsSource = document.getElementById(`details-${serviceKey}`);

        if (!detailsSource) {
            console.error(`No details found for service: ${serviceKey}`);
            return;
        }

        // Extract data from the hidden div's 'data-*' attributes and its inner HTML
        const title = detailsSource.dataset.title;
        const imgSrc = detailsSource.dataset.img;
        const contentHTML = detailsSource.innerHTML;
        
        // Populate the visible slide-in panel with the extracted data
        slideInTitle.textContent = title;
        slideInImage.src = imgSrc;
        slideInImage.alt = `${title} detail image`;
        slideInContent.innerHTML = contentHTML;

        // Add 'is-open' classes to show the panel and overlay, and lock body scroll
        document.body.classList.add('no-scroll');
        overlay.classList.add('is-open');
        slideInPanel.classList.add('is-open');
    }

    /**
     * Closes the slide-in panel and overlay.
     */
    function closePanel() {
        // Remove classes to hide the panel and overlay, and unlock body scroll
        document.body.classList.remove('no-scroll');
        overlay.classList.remove('is-open');
        slideInPanel.classList.remove('is-open');
    }

    // --- Event Listeners ---

    // Attach a click event listener to every "Learn More" button
    learnMoreBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            // Get the service key from the button's 'data-service' attribute
            const serviceKey = btn.dataset.service;
            openPanel(serviceKey);
        });
    });

    // Listen for clicks on the close button and the overlay to close the panel
    closeBtn.addEventListener('click', closePanel);
    overlay.addEventListener('click', closePanel);

    // Listen for the 'Escape' key to close the panel
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && slideInPanel.classList.contains('is-open')) {
            closePanel();
        }
    });
});
