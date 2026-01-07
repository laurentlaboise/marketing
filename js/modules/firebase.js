// js/modules/firebase.js
// Production-grade Firebase integration with Circuit Breaker and Fallback Queue

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { CircuitBreaker, RetryWithBackoff } from '../utils/circuit-breaker.js';
import { formSubmissionQueue, newsletterQueue } from '../utils/submission-queue.js';

// SECURITY NOTE: In production, move these to environment variables
// For client-side apps, Firebase API keys are safe to expose IF Firestore Security Rules are properly configured
// See: https://firebase.google.com/docs/projects/api-keys
const firebaseConfig = {
  apiKey: import.meta.env?.VITE_FIREBASE_API_KEY || "AIzaSyB3ZGL1BHhZ-uk1-ZsR0-uoQ6qKroa-HLw",
  authDomain: import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN || "wordsthatsells-website.firebaseapp.com",
  projectId: import.meta.env?.VITE_FIREBASE_PROJECT_ID || "wordsthatsells-website",
  storageBucket: import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET || "wordsthatsells-website.firebasestorage.app",
  messagingSenderId: import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID || "926017355408",
  appId: import.meta.env?.VITE_FIREBASE_APP_ID || "1:926017355408:web:e9740dbc89ad4fa2b5a215",
  measurementId: import.meta.env?.VITE_FIREBASE_MEASUREMENT_ID || "G-9EWB7GS931"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Initialize Circuit Breakers
const formCircuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 60000, // 1 minute
  requestTimeout: 5000 // 5 seconds
});

const newsletterCircuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 60000,
  requestTimeout: 5000
});

const retryHelper = new RetryWithBackoff(2, 1000); // 2 retries, 1s base delay

// Initialize auto-sync for queued submissions
formSubmissionQueue.startAutoSync(async (data) => {
  await addDoc(collection(db, "submissions"), data);
});

newsletterQueue.startAutoSync(async (data) => {
  await addDoc(collection(db, "newsletterSignups"), data);
});

/**
 * Show user-friendly notification
 * @param {string} message - Message to display
 * @param {string} type - 'success', 'error', or 'warning'
 */
function showNotification(message, type = 'success') {
  // Replace alert() with better UX
  // TODO: Implement toast notification system
  if (type === 'success') {
    alert(message);
  } else if (type === 'warning') {
    alert('⚠️ ' + message);
  } else {
    alert('❌ ' + message);
  }
}

/**
 * Sanitize user input to prevent XSS
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeInput(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Handle main Affiliate Program form submission with resilience
 * @param {Event} event - Form submit event
 */
export async function handleFormSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const submitButton = form.querySelector('button[type="submit"]');

  // Disable button during submission
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Submitting...';
  }

  const formData = new FormData(form);
  const submissionData = {
    name: sanitizeInput(formData.get('name')),
    email: sanitizeInput(formData.get('email')),
    company: sanitizeInput(formData.get('company')),
    service: sanitizeInput(formData.get('service')),
    message: sanitizeInput(formData.get('message')),
    submittedAt: new Date(),
    userAgent: navigator.userAgent,
    url: window.location.href
  };

  try {
    // Execute with circuit breaker and retry logic
    await formCircuitBreaker.execute(
      async () => {
        await retryHelper.execute(async () => {
          await addDoc(collection(db, "submissions"), submissionData);
        });
      },
      async () => {
        // Fallback: Queue for later sync
        const queued = formSubmissionQueue.enqueue(submissionData);
        if (queued) {
          console.info('[Firebase] Form queued locally. Will sync when service is available.');
          showNotification(
            'Your submission has been saved and will be sent once our service is back online. Thank you!',
            'warning'
          );
        } else {
          throw new Error('Failed to queue submission. Please try again later.');
        }
      }
    );

    // Success - immediate or queued
    if (formCircuitBreaker.getMetrics().state === 'CLOSED') {
      showNotification('Thank you for your submission! We will get back to you soon.', 'success');
    }

    form.reset();
  } catch (error) {
    console.error('[Firebase] Critical error in form submission:', error);

    // Report to monitoring service
    if (window.Sentry) {
      window.Sentry.captureException(error, {
        tags: { component: 'form-submission' },
        extra: { formData: submissionData }
      });
    }

    showNotification(
      'We encountered an issue saving your submission. Please try again or contact us directly.',
      'error'
    );
  } finally {
    // Re-enable button
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Submit';
    }
  }
}

/**
 * Handle Newsletter form submission with resilience
 * @param {Event} event - Form submit event
 */
export async function handleNewsletterSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const submitButton = form.querySelector('button[type="submit"]');

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Subscribing...';
  }

  const formData = new FormData(form);
  const submissionData = {
    email: sanitizeInput(formData.get('email')),
    signedUpAt: new Date(),
    source: window.location.pathname
  };

  try {
    await newsletterCircuitBreaker.execute(
      async () => {
        await retryHelper.execute(async () => {
          await addDoc(collection(db, "newsletterSignups"), submissionData);
        });
      },
      async () => {
        // Fallback: Queue for later sync
        const queued = newsletterQueue.enqueue(submissionData);
        if (queued) {
          console.info('[Firebase] Newsletter signup queued locally.');
          showNotification(
            'Your subscription has been saved! You will be subscribed once our service is back online.',
            'warning'
          );
        } else {
          throw new Error('Failed to queue subscription.');
        }
      }
    );

    if (newsletterCircuitBreaker.getMetrics().state === 'CLOSED') {
      showNotification('Thanks for subscribing! Check your inbox for updates.', 'success');
    }

    form.reset();
  } catch (error) {
    console.error('[Firebase] Critical error in newsletter signup:', error);

    if (window.Sentry) {
      window.Sentry.captureException(error, {
        tags: { component: 'newsletter-signup' },
        extra: { email: submissionData.email }
      });
    }

    showNotification(
      'Subscription failed. Please try again later or contact support.',
      'error'
    );
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Subscribe';
    }
  }
}

/**
 * Get Circuit Breaker metrics for monitoring
 * @returns {Object} Combined metrics
 */
export function getFirebaseMetrics() {
  return {
    formSubmissions: formCircuitBreaker.getMetrics(),
    newsletter: newsletterCircuitBreaker.getMetrics(),
    queues: {
      formQueue: formSubmissionQueue.getStatus(),
      newsletterQueue: newsletterQueue.getStatus()
    }
  };
}

// Expose metrics to window for debugging
if (typeof window !== 'undefined') {
  window.__firebaseMetrics = getFirebaseMetrics;
}
