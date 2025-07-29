/**
 * scripts.js for WordsThatSells.website
 *
 * Purpose: Interactive functionality implementation and user experience enhancement.
 * Description: Core JavaScript file handling form validation, user interactions,
 * analytics tracking, performance monitoring, dynamic content loading, API integrations,
 * and social media post generation with translation capabilities.
 * Implements modern ES6+ patterns with backward compatibility and comprehensive error handling.
 */

// --- 1. Global Constants & Configuration ---
// IMPORTANT: Replace these with your actual API credentials and backend API URL.
// For security, consider loading these from environment variables in a build process.
const API_BASE_URL = 'https://your-backend-api.com/api';
const SUPABASE_URL = 'https://your-supabase-url.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
const GEMINI_API_KEY = ''; // Provided by environment for Gemini API

// Brand colors for dynamic styling, updated to match HTML's blue palette
const BRAND_COLORS = {
    primaryBase: '#1f85c9', // From HTML's --color-primary-base
    slate900: '#122a3f', // From HTML's --color-slate-900
    accentMagenta: '#d62b83', // From HTML's pink-download-button
    white: '#ffffff'
};

// Supported languages for social post translation (from HTML)
const SUPPORTED_LANGUAGES = [
    'English', 'Lao', 'Thai', 'French', 'Vietnamese',
    'Khmer', 'Malay', 'Indonesian', 'Filipino'
];

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
// and import it if using a module bundler: `import DOMPurify from 'dompurify';`
const sanitizeInput = (string) => {
    if (typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(string);
    }
    // Fallback basic sanitization
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
    set: (name, value, days) => {
        let expires = '';
        if (days) {
            const date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            expires = '; expires=' + date.toUTCString();
        }
        document.cookie = name + '=' + (value || '') + expires + '; path=/; SameSite=Lax';
    },
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
    const handleClick = function(e) {
        e.preventDefault();
        const targetId = this.getAttribute('href').substring(1);
        const targetElement = document.getElementById(targetId);
        if (targetElement) {
            targetElement.scrollIntoView({ behavior: 'smooth' });
        }
    };

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', handleClick);
        anchor._handleClick = handleClick;
    });
};

// Back-to-Top Button
const setupBackToTopButton = () => {
    const backToTopButton = document.getElementById('back-to-top');
    if (!backToTopButton) return;

    const toggleVisibility = () => {
        if (window.pageYOffset > 300) {
            backToTopButton.classList.remove('hidden');
            backToTopButton.classList.add('opacity-100', 'translate-y-0');
        } else {
            backToTopButton.classList.add('hidden', 'opacity-0', 'translate-y-4');
        }
    };

    const debouncedToggleVisibility = debounce(toggleVisibility, 100);
    window.addEventListener('scroll', debouncedToggleVisibility);
    backToTopButton.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    toggleVisibility();
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
    constructor(modalId, openButtonSelector, closeButtonSelector) {
        this.modal = document.getElementById(modalId);
        this.openButtons = document.querySelectorAll(openButtonSelector);
        this.closeButton = document.querySelector(closeButtonSelector);
        this.overlay = this.modal;

        this.boundHandleKeyDown = this.handleKeyDown.bind(this);
        this.boundHandleOverlayClick = this.handleOverlayClick.bind(this);

        if (this.modal && this.openButtons.length && this.closeButton) {
            this.openButtons.forEach(button => {
                button.addEventListener('click', this.open.bind(this, button));
            });
            this.closeButton.addEventListener('click', this.close.bind(this));
            this.modal.addEventListener('click', this.boundHandleOverlayClick);
            document.addEventListener('keydown', this.boundHandleKeyDown);
        }
    }

    open(triggerButton) {
        if (this.modal) {
            this.modal.style.display = 'flex';
            document.body.classList.add('overflow-hidden');
            this.modal.setAttribute('aria-hidden', 'false');
            this.closeButton.focus();
            this.triggerButton = triggerButton; // Store the button that opened the modal
        }
    }

    close() {
        if (this.modal) {
            this.modal.style.display = 'none';
            document.body.classList.remove('overflow-hidden');
            this.modal.setAttribute('aria-hidden', 'true');
            if (this.triggerButton) {
                this.triggerButton.focus();
            }
        }
    }

    handleKeyDown(event) {
        if (event.key === 'Escape' && this.modal.style.display === 'flex') {
            this.close();
        }
    }

    handleOverlayClick(event) {
        if (event.target === this.modal) {
            this.close();
        }
    }

    destroy() {
        this.openButtons.forEach(button => {
            button.removeEventListener('click', this.open);
        });
        if (this.closeButton) this.closeButton.removeEventListener('click', this.close);
        if (this.modal) this.modal.removeEventListener('click', this.boundHandleOverlayClick);
        document.removeEventListener('keydown', this.boundHandleKeyDown);
    }
}

// Social Post Handler
class SocialPostHandler {
    constructor(modalId, generateButtonSelector, copyButtonId, translateButtonId, outputId, languageSelectId, loadingIndicatorId) {
        this.modal = document.getElementById(modalId);
        this.generateButtons = document.querySelectorAll(generateButtonSelector);
        this.copyButton = document.getElementById(copyButtonId);
        this.translateButton = document.getElementById(translateButtonId);
        this.output = document.getElementById(outputId);
        this.languageSelect = document.getElementById(languageSelectId);
        this.loadingIndicator = document.querySelector(loadingIndicatorId);
        this.currentGeneratedPost = '';

        if (this.modal && this.generateButtons.length && this.copyButton && this.translateButton && this.output && this.languageSelect) {
            this.generateButtons.forEach(button => {
                button.addEventListener('click', this.handleGenerate.bind(this));
            });
            this.copyButton.addEventListener('click', this.handleCopy.bind(this));
            this.translateButton.addEventListener('click', this.handleTranslate.bind(this));
        }
    }

    async callGeminiAPI(prompt, isTranslation = false) {
        this.output.textContent = '';
        this.loadingIndicator.classList.remove('hidden');
        this.copyButton.disabled = true;
        this.translateButton.disabled = true;

        const payload = {
            contents: [{ role: "user", parts: [{ text: prompt }] }]
        };
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            if (result.candidates && result.candidates[0]?.content?.parts[0]?.text) {
                const text = result.candidates[0].content.parts[0].text;
                this.output.textContent = text;
                if (!isTranslation) {
                    this.currentGeneratedPost = text;
                }
            } else {
                this.output.textContent = this.getTranslation('apiError');
                console.error("Unexpected API response structure:", result);
                Analytics.logError('Gemini API Response Error', { result });
            }
        } catch (error) {
            this.output.textContent = this.getTranslation('apiConnectionError');
            console.error("Fetch error:", error);
            Analytics.logError('Gemini API Fetch Error', { error: error.message });
        } finally {
            this.loadingIndicator.classList.add('hidden');
            this.copyButton.disabled = false;
            this.translateButton.disabled = false;
        }
    }

    handleGenerate(event) {
        const button = event.target.closest('.generate-social-post');
        const title = button.dataset.title;
        const description = button.dataset.description;

        this.languageSelect.value = 'English';
        const prompt = `Generate a concise social media post (e.g., for LinkedIn or Instagram) for a digital marketing agency, based on the following image description. Include relevant emojis and 2-3 hashtags.\nImage Title: ${sanitizeInput(title)}\nImage Description: ${sanitizeInput(description)}\nFocus on promoting AI-powered digital marketing, SEO, and growth in Southeast Asia.`;

        this.callGeminiAPI(prompt, false);
        Analytics.trackEvent('Social Post Generated', { title, platform: 'LinkedIn/Instagram' });
    }

    handleCopy() {
        const textToCopy = this.output.textContent;
        if (!textToCopy) {
            alert(this.getTranslation('noPostToCopy'));
            return;
        }

        const textArea = document.createElement('textarea');
        textArea.value = textToCopy;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            alert(this.getTranslation('postCopied'));
            Analytics.trackEvent('Social Post Copied', { textLength: textToCopy.length });
        } catch (err) {
            console.error('Failed to copy text:', err);
            alert(this.getTranslation('copyFailed'));
            Analytics.logError('Copy Post Failed', { error: err.message });
        }
        document.body.removeChild(textArea);
    }

    handleTranslate() {
        if (!this.currentGeneratedPost) {
            alert(this.getTranslation('generateFirst'));
            return;
        }

        const targetLanguage = this.languageSelect.value;
        const translatePrompt = `Translate the following social media post into ${sanitizeInput(targetLanguage)}. Do not add any extra text, just the translation:\n\n${sanitizeInput(this.currentGeneratedPost)}`;
        this.callGeminiAPI(translatePrompt, true);
        Analytics.trackEvent('Social Post Translated', { language: targetLanguage });
    }

    getTranslation(key) {
        const lang = document.documentElement.lang || 'en';
        const translations = {
            en: {
                apiError: 'Error: Could not process request. Please try again.',
                apiConnectionError: 'Error: Failed to connect to the AI service.',
                noPostToCopy: 'No post available to copy.',
                postCopied: 'Post copied to clipboard!',
                copyFailed: 'Failed to copy post.',
                generateFirst: 'Please generate a post first before translating.',
                // Existing translations
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
                apiError: 'ຂໍ້ຜິດພາດ: ບໍ່ສາມາດດຳເນີນການຮ້ອງຂໍໄດ້. ກະລຸນາລອງໃໝ່.',
                apiConnectionError: 'ຂໍ້ຜິດພາດ: ບໍ່ສາມາດເຊື່ອມຕໍ່ກັບບໍລິການ AI ໄດ້.',
                noPostToCopy: 'ບໍ່ມີໂພສທີ່ສາມາດກອບປີ້ໄດ້.',
                postCopied: 'ໂພສຖືກກອບປີ້ໄປຍັງຄລິບບອດແລ້ວ!',
                copyFailed: 'ບໍ່ສາມາດກອບປີ້ໂພສໄດ້.',
                generateFirst: 'ກະລຸນາສ້າງໂພສກ່ອນການແປພາສາ.',
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
                apiError: 'ข้อผิดพลาด: ไม่สามารถดำเนินการตามคำขอได้ กรุณาลองใหม่',
                apiConnectionError: 'ข้อผิดพลาด: ไม่สามารถเชื่อมต่อกับบริการ AI ได้',
                noPostToCopy: 'ไม่มีโพสต์ที่สามารถคัดลอกได้',
                postCopied: 'คัดลอกโพสต์ไปยังคลิปบอร์ดแล้ว!',
                copyFailed: 'ไม่สามารถคัดลอกโพสต์ได้',
                generateFirst: 'กรุณาสร้างโพสต์ก่อนทำการแปล',
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
                apiError: 'Erreur : Impossible de traiter la demande. Veuillez réessayer.',
                apiConnectionError: 'Erreur : Échec de la connexion au service AI.',
                noPostToCopy: 'Aucun message disponible pour la copie.',
                postCopied: 'Message copié dans le presse-papiers !',
                copyFailed: 'Échec de la copie du message.',
                generateFirst: 'Veuillez générer un message avant de traduire.',
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

// Form Validation and Submission (Supabase Integration)
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
            isValid = false;
            message = this.getTranslation('invalidPhone');
        }

        if (!isValid) {
            this.showError(input, message);
        } else {
            this.hideError(input);
        }
        return isValid;
    }

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

    hideError(input) {
        input.classList.remove('border-red-500');
        input.setAttribute('aria-invalid', 'false');
        const errorElement = input.nextElementSibling;
        if (errorElement && errorElement.classList.contains('text-red-500')) {
            errorElement.classList.add('hidden');
            errorElement.textContent = '';
        }
    }

    isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    getCsrfToken() {
        const metaTag = document.querySelector('meta[name="csrf-token"]');
        return metaTag ? metaTag.content : null;
    }

    async handleSubmit(event) {
        event.preventDefault();

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
            data[key] = sanitizeInput(value);
        }

        let retries = 3;
        while (retries > 0) {
            try {
                let response;
                if (this.isSupabase && typeof createClient !== 'undefined') {
                    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                    const { data: dbData, error: dbError } = await supabase
                        .from('quote_requests')
                        .insert([data]);

                    if (dbError) throw new Error(dbError.message);
                    response = { ok: true };
                } else {
                    response = await fetch(this.submitUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'X-CSRF-Token': this.getCsrfToken()
                        },
                        body: JSON.stringify(data)
                    });
                }

                if (!response.ok) {
                    const errorResponse = await response.json();
                    throw new Error(errorResponse.message || `HTTP error! status: ${response.status}`);
                }

                this.displayMessage(this.successMessage, this.getTranslation('submissionSuccess'));
                this.form.reset();
                Analytics.trackEvent('Form Submission Success', { formId: this.form.id });
                break;

            } catch (error) {
                console.error('Form submission error:', error);
                Analytics.logError('Form Submission Failed', { formId: this.form.id, error: error.message });
                retries--;
                if (retries === 0) {
                    this.displayMessage(this.errorMessage, `${this.getTranslation('submissionFailed')}: ${error.message}. ${this.getTranslation('tryAgainLater')}`);
                } else {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } finally {
                if (retries === 0) {
                    this.setLoadingState(false);
                }
            }
        }
    }

    setLoadingState(isLoading) {
        if (this.submitButton) {
            this.submitButton.disabled = isLoading;
            this.submitButton.textContent = isLoading ? this.getTranslation('sending') : this.getTranslation('submitRequest');
            this.submitButton.classList.toggle('opacity-50', isLoading);
            this.submitButton.classList.toggle('cursor-not-allowed', isLoading);
        }
    }

    displayMessage(element, message) {
        if (element) {
            element.textContent = message;
            element.classList.remove('hidden');
            element.setAttribute('aria-live', 'polite');
        }
    }

    hideMessages() {
        if (this.successMessage) this.successMessage.classList.add('hidden');
        if (this.errorMessage) this.errorMessage.classList.add('hidden');
    }
}

// Newsletter Subscription Handler
class NewsletterHandler extends FormHandler {
    constructor(formId, submitUrl, successMessageId, errorMessageId) {
        super(formId, submitUrl, successMessageId, errorMessageId);
    }

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

// Intersection Observer for Scroll Animations
const setupScrollAnimations = () => {
    const animatedElements = document.querySelectorAll('.animate-on-scroll');

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in-up');
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });

    animatedElements.forEach(element => observer.observe(element));
};

// Lazy Loading for Images and Iframes
const setupLazyLoading = () => {
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
        rootMargin: '0px 0px 200px 0px'
    });

    lazyElements.forEach(el => lazyLoadObserver.observe(el));
};

// Keyboard Navigation Support
const setupKeyboardNavigation = () => {
    document.querySelectorAll('.faq-accordion-header').forEach(header => {
        header.setAttribute('tabindex', '0');
        header.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                header.click();
            }
        });
    });

    document.querySelectorAll('.generate-social-post').forEach(button => {
        button.setAttribute('tabindex', '0');
        button.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                button.click();
            }
        });
    });
};

// --- 5. Analytics ---
const Analytics = {
    trackEvent: (eventName, eventData) => {
        console.log(`Analytics Event: ${eventName}`, eventData);
    },
    trackPageView: (path = window.location.pathname) => {
        console.log(`Analytics Page View: ${path}`);
    },
    logError: (message, details) => {
        console.error(`Analytics Error: ${message}`, details);
    },
    getAbTestVariant: (experimentName) => {
        console.log(`A/B Test: ${experimentName} - Variant A (placeholder)`);
        return 'A';
    }
};

// --- 6. Security Considerations ---
// Input Sanitization: Implemented in `sanitizeInput` and used in `SocialPostHandler` and `FormHandler`.
// XSS Prevention: Sanitizing inputs for social posts and form submissions.
// CSRF Token Handling: Implemented in `FormHandler.getCsrfToken`.
// Secure API Communication: Using HTTPS for Gemini API and other API calls.

// --- 7. Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    console.log('WordsThatSells scripts loaded.');

    setupSmoothScrolling();
    setupBackToTopButton();
    setupFaqAccordion();
    setupScrollAnimations();
    setupLazyLoading();
    setupKeyboardNavigation();

    const socialPostModal = new ModalManager(
        'socialPostModal',
        '.generate-social-post',
        '.close-button'
    );

    const socialPostHandler = new SocialPostHandler(
        'socialPostModal',
        '.generate-social-post',
        'copyPostButton',
        'translateButton',
        'socialPostOutput',
        'languageSelect',
        '.loading-indicator'
    );

    const quoteFormHandler = new FormHandler(
        'quote-request-form',
        `${API_BASE_URL}/quote-requests`,
        'quote-success-message',
        'quote-error-message',
        true
    );

    const newsletterHandler = new NewsletterHandler(
        'newsletter-form',
        `${API_BASE_URL}/newsletter-subscriptions`,
        'newsletter-success-message',
        'newsletter-error-message'
    );

    Analytics.trackPageView();
});

// Google Analytics
window.dataLayer = window.dataLayer || [];
function gtag() {
  dataLayer.push(arguments);
}
gtag("js", new Date());
gtag("config", "G-LMRKC1VBBB");

document.addEventListener("DOMContentLoaded", () => {
  // Back to Top button logic
  const backToTopButton = document.querySelector(".back-to-top");
  window.addEventListener("scroll", () => {
    if (window.scrollY > 300) {
      backToTopButton.classList.add("show");
    } else {
      backToTopButton.classList.remove("show");
    }
  });

  // On-scroll reveal animations
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
        }
      });
    },
    { threshold: 0.1 }
  );
  document.querySelectorAll(".reveal").forEach((elem) => {
    revealObserver.observe(elem);
  });

  // "Get a Quote" Modal Logic
  const quoteTab = document.getElementById("quote-tab");
  const modalOverlay = document.getElementById("quote-modal-overlay");
  const modalContainer = document.getElementById("quote-modal-container");
  const closeModalBtn = document.getElementById("modal-close-btn");
  const quoteForm = document.getElementById("quote-form");
  const openModal = () => (modalOverlay.style.display = "flex");
  const closeModal = () => (modalOverlay.style.display = "none");
  quoteTab.addEventListener("click", openModal);
  closeModalBtn.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) {
      closeModal();
    }
  });
  quoteForm.addEventListener("submit", (e) => {
    e.preventDefault();
    // The Supabase script will handle the submission.
    // This part just updates the UI.
    modalContainer.innerHTML = `<h2 class="modal-title">Thank You!</h2><p>Your quote request has been sent. We will get back to you within 24 hours.</p>`;
    setTimeout(closeModal, 3000);
  });

  // Interactive FAQ Section
  const faqList = document.getElementById("faq-list");
  const generateFaqBtn = document.getElementById("generate-faq-btn");
  const allFaqs = [
    {
      q: "What services does your agency offer?",
      a: "We provide AI-driven SEO, content creation, social media management, web development, graphic design, app development, and business automation for SMEs in Southeast Asia.",
    },
    {
      q: "How does AI improve my marketing results?",
      a: "AI helps automate tasks, analyze data, and personalize campaigns, resulting in faster execution, better targeting, and higher ROI for your business.",
    },
    {
      q: "Can you help with local SEO for my business?",
      a: "Yes! We optimize your Google profile, build local citations, and create location-based content to boost your visibility in local search results.",
    },
    {
      q: "How do I get started?",
      a: "Simply click the 'Get a Quote' tab or fill out our contact form. We'll discuss your goals and recommend the best solutions for your business.",
    },
    {
      q: "How do you measure the success of a campaign?",
      a: "We track KPIs such as traffic, conversions, engagement, and ROI using analytics tools and provide transparent reports.",
    },
    {
      q: "Can you help with multilingual marketing?",
      a: "Yes, we offer content creation and SEO in multiple languages to help you reach international audiences.",
    },
    {
      q: "Do you provide training for in-house teams?",
      a: "We offer workshops and training sessions to empower your staff with the latest digital marketing and AI tools.",
    },
    {
      q: "What makes your agency different from others?",
      a: "We combine local expertise with advanced AI technology, delivering personalized strategies and measurable results.",
    },
  ];
  let usedFaqIndexes = new Set();

  function addFaqToDom(faq) {
    const details = document.createElement("details");
    details.className = "faq-item reveal"; // Using new semantic class
    details.innerHTML = `
                <summary class="faq-question">
                    <h3>${faq.q}</h3>
                    <i class="fas fa-chevron-down icon"></i>
                </summary>
                <p class="faq-answer">${faq.a}</p>`;
    faqList.appendChild(details);
    revealObserver.observe(details);
  }

  function generateInitialFaqs() {
    allFaqs.slice(0, 4).forEach((faq, index) => {
      addFaqToDom(faq);
      usedFaqIndexes.add(index);
    });
  }

  generateFaqBtn.addEventListener("click", () => {
    let availableIndexes = allFaqs
      .map((_, i) => i)
      .filter((i) => !usedFaqIndexes.has(i));
    if (availableIndexes.length === 0) {
      faqList.innerHTML = "";
      usedFaqIndexes.clear();
      generateInitialFaqs();
      return;
    }
    let newIndex =
      availableIndexes[Math.floor(Math.random() * availableIndexes.length)];
    addFaqToDom(allFaqs[newIndex]);
    usedFaqIndexes.add(newIndex);
  });

  generateInitialFaqs();
});

// Supabase form submission
(async () => {
  try {
    const { createClient } = await import(
      "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm"
    );

    const supabaseUrl = "https://msivaavxwszurzopourl.supabase.co";
    const supabaseKey =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zaXZhYXZ4d3N6dXJ6b3BvdXJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyNTAzMDAsImV4cCI6MjA2ODgyNjMwMH0.BznUDkfio5o83f7ZsYyTgrN-oa8NkPy5I1Wqiq46x78";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const quoteForm = document.getElementById("quote-form");
    if (quoteForm) {
      quoteForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const formData = new FormData(quoteForm);
        const submission = Object.fromEntries(formData.entries());

        const { data, error } = await supabase
          .from("GET A QUOTE WTS")
          .insert([submission]);

        if (error) {
          console.error("Supabase submission error:", error.message);
        } else {
          console.log("Supabase submission successful:", data);
        }
      });
    }
  } catch (e) {
    console.error(
      "Could not load Supabase client. Form submission will not be saved.",
      e
    );
  }
})();
