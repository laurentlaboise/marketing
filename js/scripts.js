/**
 * scripts.js for WordsThatSells.website
 *
 * Purpose: Interactive functionality implementation and user experience enhancement.
 * Description: Core JavaScript file handling form validation, user interactions,
 * analytics tracking, performance monitoring, dynamic content loading, and API integrations.
 * Implements modern ES6+ patterns with backward compatibility and comprehensive error handling.
 */

// --- 1. Global Constants & Configuration ---
// IMPORTANT: Replace these with your actual Supabase credentials and backend API URL.
// For security, consider loading these from environment variables in a build process,
// especially the Supabase Anon Key.
const API_BASE_URL = 'https://your-backend-api.com/api';
const SUPABASE_URL = 'https://your-supabase-url.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// Brand colors for dynamic styling if needed in JS, matching styles.css
const BRAND_COLORS = {
    accentBlue: '#3182CE',
    accentMagenta: '#D53F8C',
    charcoal: '#4A5568'
};

// --- 2. Utility Functions ---

/**
 * Debounces a function, delaying its execution until after a specified time
 * has passed since the last time it was invoked.
 * @param {Function} func - The function to debounce.
 * @param {number} delay - The delay in milliseconds.
 * @returns {Function} The debounced function.
 */
const debounce = (func, delay) => {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
};

/**
 * Sanitizes input string to prevent XSS attacks.
 * Uses DOMPurify for robust sanitization.
 * @param {string} string - The input string to sanitize.
 * @returns {string} The sanitized string.
 */
// IMPORTANT: You need to install DOMPurify: `npm install dompurify`
// and import it if using a module bundler like Webpack:
// import DOMPurify from 'dompurify';
const sanitizeInput = (string) => {
    // If DOMPurify is available (e.g., loaded via script tag or bundled)
    if (typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(string);
    }
    // Fallback basic sanitization if DOMPurify is not available
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '/': '&#x2F;',
    };
    const reg = /[&<>"'/]/ig;
    return string.replace(reg, (match) => (map[match]));
};

/**
 * Gets a URL parameter by name.
 * @param {string} name - The name of the parameter.
 * @param {string} url - The URL string (defaults to current window.location.href).
 * @returns {string|null} The parameter value or null if not found.
 */
const getUrlParameter = (name, url = window.location.href) => {
    name = name.replace(/[\[\]]/g, '\\$&');
    const regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)');
    const results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
};

/**
 * Manages cookies (set, get, delete).
 */
const CookieManager = {
    /**
     * Sets a cookie.
     * @param {string} name - The name of the cookie.
     * @param {string} value - The value of the cookie.
     * @param {number} days - Number of days until the cookie expires.
     */
    set: (name, value, days) => {
        let expires = '';
        if (days) {
            const date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            expires = '; expires=' + date.toUTCString();
        }
        document.cookie = name + '=' + (value || '') + expires + '; path=/; SameSite=Lax';
    },
    /**
     * Gets a cookie.
     * @param {string} name - The name of the cookie.
     * @returns {string|null} The cookie value or null if not found.
     */
    get: (name) => {
        const nameEQ = name + '=';
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    },
    /**
     * Deletes a cookie.
     * @param {string} name - The name of the cookie.
     */
    delete: (name) => {
        document.cookie = name + '=; Max-Age=-99999999; path=/; SameSite=Lax';
    }
};

/**
 * Basic device detection.
 */
const DeviceDetector = {
    isMobile: () => /Mobi|Android/i.test(navigator.userAgent),
    isTablet: () => /(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(navigator.userAgent),
    isDesktop: () => !DeviceDetector.isMobile() && !DeviceDetector.isTablet()
};

// --- 3. Core Functionality Modules ---

// Smooth Scrolling Navigation
const setupSmoothScrolling = () => {
    // Store event listeners in a map to allow for proper cleanup
    const handleClick = function(e) {
        e.preventDefault();
        const targetId = this.getAttribute('href').substring(1);
        const targetElement = document.getElementById(targetId);
        if (targetElement) {
            targetElement.scrollIntoView({
                behavior: 'smooth'
            });
        }
    };

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', handleClick);
        // Store the listener for potential future removal if DOM elements are dynamic
        anchor._handleClick = handleClick;
    });
};

// Back-to-Top Button
const setupBackToTopButton = () => {
    const backToTopButton = document.getElementById('back-to-top');
    if (!backToTopButton) return;

    const toggleVisibility = () => {
        if (window.pageYOffset > 300) { // Show button after scrolling 300px
            backToTopButton.classList.remove('hidden');
            backToTopButton.classList.add('opacity-100', 'translate-y-0');
        } else {
            backToTopButton.classList.add('hidden', 'opacity-0', 'translate-y-4');
        }
    };

    const debouncedToggleVisibility = debounce(toggleVisibility, 100);
    window.addEventListener('scroll', debouncedToggleVisibility);
    backToTopButton.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });

    toggleVisibility(); // Initial check on page load
};

// FAQ Accordion Interactions
const setupFaqAccordion = () => {
    document.querySelectorAll('.faq-accordion-header').forEach(header => {
        header.addEventListener('click', () => {
            const item = header.closest('.faq-accordion-item');
            const content = item.querySelector('.faq-accordion-content');
            const icon = header.querySelector('svg');

            item.classList.toggle('active');
            if (item.classList.contains('active')) {
                content.style.maxHeight = content.scrollHeight + 'px';
                icon.classList.add('rotate-180');
            } else {
                content.style.maxHeight = '0';
                icon.classList.remove('rotate-180');
            }
        });
    });
};

// Modal Management
class ModalManager {
    constructor(modalId, openButtonId, closeButtonId) {
        this.modal = document.getElementById(modalId);
        this.openButton = document.getElementById(openButtonId);
        this.closeButton = document.getElementById(closeButtonId);
        this.overlay = this.modal ? this.modal.querySelector('.modal-overlay') : null;

        this.boundHandleKeyDown = this.handleKeyDown.bind(this); // Bind once for consistent reference

        if (this.modal && this.openButton && this.closeButton) {
            this.openButton.addEventListener('click', this.open.bind(this));
            this.closeButton.addEventListener('click', this.close.bind(this));
            if (this.overlay) {
                this.overlay.addEventListener('click', this.close.bind(this));
            }
            // Event listener for Escape key on document
            document.addEventListener('keydown', this.boundHandleKeyDown);
        }
    }

    open() {
        if (this.modal) {
            this.modal.classList.remove('hidden');
            this.modal.classList.add('flex'); // Use flex to center
            document.body.classList.add('overflow-hidden'); // Prevent body scroll
            this.modal.setAttribute('aria-hidden', 'false');
            this.closeButton.focus(); // Focus on close button for accessibility
        }
    }

    close() {
        if (this.modal) {
            this.modal.classList.add('hidden');
            this.modal.classList.remove('flex');
            document.body.classList.remove('overflow-hidden');
            this.modal.setAttribute('aria-hidden', 'true');
            this.openButton.focus(); // Return focus to the element that opened the modal
        }
    }

    handleKeyDown(event) {
        if (event.key === 'Escape' && !this.modal.classList.contains('hidden')) {
            this.close();
        }
    }

    // Optional: Cleanup method if modals are dynamically added/removed
    destroy() {
        if (this.openButton) this.openButton.removeEventListener('click', this.open);
        if (this.closeButton) this.closeButton.removeEventListener('click', this.close);
        if (this.overlay) this.overlay.removeEventListener('click', this.close);
        document.removeEventListener('keydown', this.boundHandleKeyDown);
    }
}

// Form Validation and Submission (Supabase Integration)
// IMPORTANT: Ensure `@supabase/supabase-js` is installed (`npm install @supabase/supabase-js`)
// and imported if using a module bundler: `import { createClient } from '@supabase/supabase-js';`
// For this example, we'll assume `createClient` is globally available or handled by build process.
class FormHandler {
    constructor(formId, submitUrl, successMessageId, errorMessageId, isSupabase = false) {
        this.form = document.getElementById(formId);
        if (!this.form) return;

        this.submitButton = this.form.querySelector('button[type="submit"]');
        this.successMessage = document.getElementById(successMessageId);
        this.errorMessage = document.getElementById(errorMessageId);
        this.submitUrl = submitUrl;
        this.isSupabase = isSupabase;

        this.form.addEventListener('submit', this.handleSubmit.bind(this));
        this.form.querySelectorAll('input, textarea').forEach(input => {
            input.addEventListener('input', debounce(this.validateInput.bind(this), 300));
            input.addEventListener('blur', this.validateInput.bind(this));
        });
    }

    /**
     * Validates a single input field.
     * @param {Event} event - The input event.
     * @returns {boolean} True if validation passes, false otherwise.
     */
    validateInput(event) {
        const input = event.target;
        const value = input.value.trim();
        let isValid = true;
        let message = '';

        if (input.hasAttribute('required') && value === '') {
            isValid = false;
            message = this.getTranslation('requiredField');
        } else if (input.type === 'email' && !this.isValidEmail(value)) {
            isValid = false;
            message = this.getTranslation('invalidEmail');
        } else if (input.type === 'tel' && input.hasAttribute('pattern') && !new RegExp(input.pattern).test(value)) {
            // Basic phone number validation based on pattern attribute
            isValid = false;
            message = this.getTranslation('invalidPhone');
        }
        // Add more specific validation rules as needed (e.g., min/max length, custom regex)

        if (!isValid) {
            this.showError(input, message);
        } else {
            this.hideError(input);
        }
        return isValid;
    }

    /**
     * Shows an error message for a given input.
     * @param {HTMLElement} input - The input element.
     * @param {string} message - The error message.
     */
    showError(input, message) {
        input.classList.add('border-red-500');
        input.setAttribute('aria-invalid', 'true');
        let errorElement = input.nextElementSibling;
        if (errorElement && errorElement.classList.contains('text-red-500')) {
            errorElement.textContent = message;
            errorElement.classList.remove('hidden');
        } else {
            errorElement = document.createElement('p');
            errorElement.className = 'text-red-500 text-sm mt-1';
            errorElement.textContent = message;
            input.parentNode.insertBefore(errorElement, input.nextSibling);
        }
    }

    /**
     * Hides an error message for a given input.
     * @param {HTMLElement} input - The input element.
     */
    hideError(input) {
        input.classList.remove('border-red-500');
        input.setAttribute('aria-invalid', 'false');
        const errorElement = input.nextElementSibling;
        if (errorElement && errorElement.classList.contains('text-red-500')) {
            errorElement.classList.add('hidden');
            errorElement.textContent = '';
        }
    }

    /**
     * Checks if an email is valid.
     * @param {string} email - The email string.
     * @returns {boolean} True if valid, false otherwise.
     */
    isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    /**
     * Gets CSRF token from meta tag.
     * @returns {string|null} CSRF token or null if not found.
     */
    getCsrfToken() {
        const metaTag = document.querySelector('meta[name="csrf-token"]');
        return metaTag ? metaTag.content : null;
    }

    /**
     * Handles form submission.
     * @param {Event} event - The submit event.
     */
    async handleSubmit(event) {
        event.preventDefault(); // Prevent default form submission

        // Validate all fields before submission
        let formIsValid = true;
        this.form.querySelectorAll('input, textarea').forEach(input => {
            if (!this.validateInput({ target: input })) {
                formIsValid = false;
            }
        });

        if (!formIsValid) {
            this.displayMessage(this.errorMessage, this.getTranslation('formErrors'));
            return;
        }

        this.setLoadingState(true);
        this.hideMessages();

        const formData = new FormData(this.form);
        const data = {};
        for (let [key, value] of formData.entries()) {
            data[key] = sanitizeInput(value); // Sanitize all input
        }

        let retries = 3;
        while (retries > 0) {
            try {
                let response;
                if (this.isSupabase && typeof createClient !== 'undefined') {
                    // Supabase integration
                    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                    const { data: dbData, error: dbError } = await supabase
                        .from('quote_requests') // Or your table name
                        .insert([data]);

                    if (dbError) throw new Error(dbError.message);
                    response = { ok: true }; // Simulate a successful response
                } else {
                    // Standard fetch to backend API
                    response = await fetch(this.submitUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'X-CSRF-Token': this.getCsrfToken() // Include CSRF token if applicable
                        },
                        body: JSON.stringify(data)
                    });
                }


                if (!response.ok) {
                    const errorResponse = await response.json();
                    throw new Error(errorResponse.message || `HTTP error! status: ${response.status}`);
                }

                this.displayMessage(this.successMessage, this.getTranslation('submissionSuccess'));
                this.form.reset(); // Clear form on success
                break; // Exit retry loop on success

            } catch (error) {
                console.error('Form submission error:', error);
                Analytics.logError('Form Submission Failed', { formId: this.form.id, error: error.message });
                retries--;
                if (retries === 0) {
                    this.displayMessage(this.errorMessage, `${this.getTranslation('submissionFailed')}: ${error.message}. ${this.getTranslation('tryAgainLater')}`);
                } else {
                    console.log(`Retrying... (${retries} attempts left)`);
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait before retrying
                }
            } finally {
                if (retries === 0) { // Only set loading state to false after all retries
                    this.setLoadingState(false);
                }
            }
        }
    }

    /**
     * Sets the loading state of the form.
     * @param {boolean} isLoading - True to show loading, false otherwise.
     */
    setLoadingState(isLoading) {
        if (this.submitButton) {
            this.submitButton.disabled = isLoading;
            this.submitButton.textContent = isLoading ? this.getTranslation('sending') : this.getTranslation('submitRequest'); // Update button text
            this.submitButton.classList.toggle('opacity-50', isLoading);
            this.submitButton.classList.toggle('cursor-not-allowed', isLoading);
        }
    }

    /**
     * Displays a message (success or error).
     * @param {HTMLElement} element - The message element.
     * @param {string} message - The message text.
     */
    displayMessage(element, message) {
        if (element) {
            element.textContent = message;
            element.classList.remove('hidden');
            element.setAttribute('aria-live', 'polite'); // Announce message to screen readers
        }
    }

    /**
     * Hides all messages.
     */
    hideMessages() {
        if (this.successMessage) this.successMessage.classList.add('hidden');
        if (this.errorMessage) this.errorMessage.classList.add('hidden');
    }

    /**
     * Gets translated strings based on current language.
     * @param {string} key - The translation key.
     * @returns {string} The translated string.
     */
    getTranslation(key) {
        const lang = document.documentElement.lang || 'en'; // Get current HTML lang attribute
        const translations = {
            en: {
                requiredField: 'This field is required.',
                invalidEmail: 'Please enter a valid email address.',
                invalidPhone: 'Please enter a valid phone number (e.g., +1234567890).',
                formErrors: 'Please correct the errors in the form.',
                submissionSuccess: 'Your request has been sent successfully!',
                submissionFailed: 'Submission failed',
                tryAgainLater: 'Please try again later.',
                sending: 'Sending...',
                submitRequest: 'Submit Request',
                subscribing: 'Subscribing...',
                subscribe: 'Subscribe'
            },
            lo: {
                requiredField: 'ຊ່ອງນີ້ຕ້ອງການ.',
                invalidEmail: 'ກະລຸນາໃສ່ທີ່ຢູ່ອີເມວທີ່ຖືກຕ້ອງ.',
                invalidPhone: 'ກະລຸນາໃສ່ເບີໂທລະສັບທີ່ຖືກຕ້ອງ (ຕົວຢ່າງ: +1234567890).',
                formErrors: 'ກະລຸນາແກ້ໄຂຂໍ້ຜິດພາດໃນແບບຟອມ.',
                submissionSuccess: 'ຄຳຮ້ອງຂໍຂອງທ່ານຖືກສົ່ງສຳເລັດແລ້ວ!',
                submissionFailed: 'ການສົ່ງລົ້ມເຫລວ',
                tryAgainLater: 'ກະລຸນາລອງໃໝ່ອີກຄັ້ງພາຍຫຼັງ.',
                sending: 'ກຳລັງສົ່ງ...',
                submitRequest: 'ສົ່ງຄຳຮ້ອງຂໍ',
                subscribing: 'ກຳລັງສະໝັກ...',
                subscribe: 'ສະໝັກ'
            },
            th: {
                requiredField: 'ช่องนี้จำเป็นต้องกรอก',
                invalidEmail: 'กรุณาใส่อีเมลที่ถูกต้อง',
                invalidPhone: 'กรุณาใส่เบอร์โทรศัพท์ที่ถูกต้อง (เช่น +1234567890).',
                formErrors: 'กรุณาแก้ไขข้อผิดพลาดในแบบฟอร์ม',
                submissionSuccess: 'ส่งคำขอของคุณเรียบร้อยแล้ว!',
                submissionFailed: 'การส่งล้มเหลว',
                tryAgainLater: 'กรุณาลองใหม่อีกครั้งในภายหลัง',
                sending: 'กำลังส่ง...',
                submitRequest: 'ส่งคำขอ',
                subscribing: 'กำลังสมัคร...',
                subscribe: 'สมัคร'
            },
            fr: {
                requiredField: 'Ce champ est obligatoire.',
                invalidEmail: 'Veuillez entrer une adresse e-mail valide.',
                invalidPhone: 'Veuillez entrer un numéro de téléphone valide (ex: +1234567890).',
                formErrors: 'Veuillez corriger les erreurs dans le formulaire.',
                submissionSuccess: 'Votre demande a été envoyée avec succès !',
                submissionFailed: 'Échec de la soumission',
                tryAgainLater: 'Veuillez réessayer plus tard.',
                sending: 'Envoi en cours...',
                submitRequest: 'Envoyer la demande',
                subscribing: 'Abonnement en cours...',
                subscribe: 'S\'abonner'
            }
        };
        return translations[lang] && translations[lang][key] ? translations[lang][key] : translations.en[key];
    }
}


// Newsletter Subscription Handler (Uses FormHandler for consistency)
// This class is simplified as it can largely reuse FormHandler's logic
// with specific messages.
class NewsletterHandler extends FormHandler {
    constructor(formId, submitUrl, successMessageId, errorMessageId) {
        super(formId, submitUrl, successMessageId, errorMessageId); // Call parent constructor
        // Override or add specific newsletter logic if needed
    }

    // Overrides parent's submit button text for newsletter specific wording
    setLoadingState(isLoading) {
        if (this.submitButton) {
            this.submitButton.disabled = isLoading;
            this.submitButton.textContent = isLoading ? this.getTranslation('subscribing') : this.getTranslation('subscribe');
            this.submitButton.classList.toggle('opacity-50', isLoading);
            this.submitButton.classList.toggle('cursor-not-allowed', isLoading);
        }
    }
}


// --- 4. User Experience Enhancements ---

// Intersection Observer for Scroll Animations (e.g., for sections revealing on scroll)
const setupScrollAnimations = () => {
    // Add 'animate-on-scroll' class to elements you want to animate.
    // Define 'fade-in-up' (or other animation classes) in your CSS (e.g., styles.css).
    const animatedElements = document.querySelectorAll('.animate-on-scroll');

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in-up'); // Example animation class (define in CSS)
                observer.unobserve(entry.target); // Stop observing once animated
            }
        });
    }, {
        threshold: 0.1, // Trigger when 10% of element is visible
        rootMargin: '0px 0px -50px 0px' // Adjust trigger point (e.g., trigger before element enters viewport)
    });

    animatedElements.forEach(element => observer.observe(element));
};

// Lazy Loading for Images and Iframes
const setupLazyLoading = () => {
    // Add 'lazyload' class and 'data-src'/'data-srcset' attributes to images/iframes.
    const lazyElements = document.querySelectorAll('img.lazyload, iframe.lazyload');

    const lazyLoadObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const lazyElement = entry.target;
                if (lazyElement.tagName === 'IMG') {
                    if (lazyElement.dataset.src) {
                        lazyElement.src = lazyElement.dataset.src;
                    }
                    if (lazyElement.dataset.srcset) {
                        lazyElement.srcset = lazyElement.dataset.srcset;
                    }
                } else if (lazyElement.tagName === 'IFRAME') {
                    if (lazyElement.dataset.src) {
                        lazyElement.src = lazyElement.dataset.src;
                    }
                }
                lazyElement.classList.remove('lazyload');
                observer.unobserve(lazyElement);
            }
        });
    }, {
        rootMargin: '0px 0px 200px 0px' // Load elements when they are 200px from viewport
    });

    lazyElements.forEach(el => lazyLoadObserver.observe(el));
};

// Keyboard Navigation Support (beyond basic HTML elements)
const setupKeyboardNavigation = () => {
    // Enhance accordion keyboard navigation (already in FAQ setup, but here for general principle)
    document.querySelectorAll('.faq-accordion-header').forEach(header => {
        header.setAttribute('tabindex', '0'); // Make header focusable
        header.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault(); // Prevent default scroll behavior for spacebar
                header.click(); // Trigger click event
            }
        });
    });

    // General best practice: Ensure all interactive elements (buttons, links, form fields)
    // are reachable via Tab key and operable with Enter/Space.
    // Modals (ModalManager) already handle focus trapping for accessibility.
};

// --- 5. Performance Optimizations (beyond Gulp/Webpack) ---
// Debounced event handlers are used in scroll and input validation (`debounce` utility).
// Efficient DOM manipulation: Batch DOM updates where possible, avoid excessive reflows.
// Memory leak prevention: Remove event listeners when elements are removed from DOM (if dynamically added/removed).
// Example: if a component is removed, ensure its event listeners are cleaned up.
// For static pages, browser handles most cleanup on navigation.

// --- 6. Analytics (Placeholders) ---
const Analytics = {
    /**
     * Tracks a custom event.
     * @param {string} eventName - Name of the event.
     * @param {object} eventData - Data associated with the event.
     */
    trackEvent: (eventName, eventData) => {
        console.log(`Analytics Event: ${eventName}`, eventData);
        // IMPORTANT: Replace with actual Google Analytics 4 (gtag.js) or other analytics integration.
        // Example for gtag.js:
        // if (typeof gtag === 'function') {
        //     gtag('event', eventName, eventData);
        // }
    },
    /**
     * Tracks page views.
     * @param {string} path - The page path.
     */
    trackPageView: (path = window.location.pathname) => {
        console.log(`Analytics Page View: ${path}`);
        // IMPORTANT: Replace with actual Google Analytics 4 (gtag.js) or other analytics integration.
        // Example for gtag.js:
        // if (typeof gtag === 'function') {
        //     gtag('config', 'G-XXXXXXX', { 'page_path': path }); // Replace G-XXXXXXX with your GA4 Measurement ID
        // }
    },
    /**
     * Logs errors for monitoring.
     * @param {string} message - Error message.
     * @param {object} details - Error details.
     */
    logError: (message, details) => {
        console.error(`Analytics Error: ${message}`, details);
        // Send error to a logging service (e.g., Sentry, custom backend)
    },
    /**
     * Supports A/B testing (placeholder).
     * @param {string} experimentName - Name of the experiment.
     * @returns {string} The variant assigned to the user.
     */
    getAbTestVariant: (experimentName) => {
        // Logic to assign user to a variant (e.g., from a cookie, backend, or A/B testing tool)
        console.log(`A/B Test: ${experimentName} - Variant A (placeholder)`);
        return 'A'; // Placeholder
    }
};

// --- 7. Security Considerations (Client-Side Best Practices) ---
// Note: Many security measures (CSRF, comprehensive XSS, CSP) are primarily server-side or HTTP header configurations.
// This section focuses on client-side contributions to security.

// Input Sanitization: Implemented in `sanitizeInput` function and used in `FormHandler`.
// XSS Prevention: Sanitizing user-generated content before displaying it on the page.
// CSRF Token Handling: Implemented in `FormHandler.getCsrfToken` and used in `FormHandler.handleSubmit`.
// Content Security Policy (CSP) Compliance: Ensure all inline scripts/styles are removed or hashed, and external resources are whitelisted in your server's CSP header (e.g., in .htaccess). This JS won't directly enforce CSP but should comply.
// Secure API Communication: Always use HTTPS for all API calls (implied by API_BASE_URL).

// --- 8. Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log('WordsThatSells scripts loaded.');

    // Initialize core functionality
    setupSmoothScrolling();
    setupBackToTopButton();
    setupFaqAccordion();
    setupScrollAnimations();
    setupLazyLoading();
    setupKeyboardNavigation();

    // Initialize Modal Managers
    // Ensure corresponding HTML elements with these IDs exist for modals to work.
    const quoteModal = new ModalManager('quote-modal', 'get-quote-button', 'close-quote-modal');

    // Initialize Form Handlers
    // Ensure corresponding HTML forms and message elements with these IDs exist.
    // Set `isSupabase` to `true` if you intend to use Supabase for this form.
    const quoteFormHandler = new FormHandler(
        'quote-request-form',
        `${API_BASE_URL}/quote-requests`, // Example API endpoint for quotes
        'quote-success-message',
        'quote-error-message',
        true // Set to true if this form submits to Supabase
    );

    const newsletterHandler = new NewsletterHandler(
        'newsletter-form',
        `${API_BASE_URL}/newsletter-subscriptions`, // Example API endpoint for newsletter
        'newsletter-success-message',
        'newsletter-error-message'
    );

    // Initial analytics page view tracking
    Analytics.trackPageView();

    // Example of tracking a button click (uncomment and adjust as needed)
    // document.getElementById('get-quote-button').addEventListener('click', () => {
    //     Analytics.trackEvent('Quote Request Initiated', { location: 'Homepage Hero' });
    // });
});

