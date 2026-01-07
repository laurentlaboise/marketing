// js/utils/observability.js
// Observability: Error Tracking + Performance Monitoring (Four Golden Signals)

import * as Sentry from '@sentry/browser';
import { getCLS, getFID, getLCP, getFCP, getTTFB } from 'web-vitals';

/**
 * Initialize Sentry for error tracking
 * Following Zero Trust principles - only send essential data
 */
export function initSentry() {
  // Only initialize in production
  if (import.meta.env?.VITE_SENTRY_DSN && import.meta.env?.MODE === 'production') {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE || 'production',

      // Performance Monitoring
      integrations: [
        new Sentry.BrowserTracing({
          tracingOrigins: ['wordsthatsells.website', /^\//],
        }),
      ],

      // Sample rate for performance monitoring (10% of transactions)
      tracesSampleRate: 0.1,

      // Sample rate for error tracking (100% in production)
      sampleRate: 1.0,

      // Filter sensitive data before sending
      beforeSend(event, hint) {
        // Remove cookies and auth headers
        if (event.request) {
          delete event.request.cookies;
          delete event.request.headers?.Authorization;
        }

        // Remove sensitive form data
        if (event.extra?.formData) {
          const sanitized = { ...event.extra.formData };
          if (sanitized.email) {
            sanitized.email = sanitized.email.replace(/(.{3}).*(@.*)/, '$1***$2');
          }
          event.extra.formData = sanitized;
        }

        return event;
      },

      // Ignore expected errors
      ignoreErrors: [
        'Non-Error promise rejection captured',
        'ResizeObserver loop limit exceeded',
        'Network request failed', // Expected when offline
      ],
    });

    console.info('[Sentry] Error tracking initialized.');
  } else {
    console.info('[Sentry] Skipped (not in production or DSN not configured).');
  }
}

/**
 * Initialize Core Web Vitals monitoring
 * Tracks the Four Golden Signals: Latency, Traffic, Errors, Saturation
 */
export function initCoreWebVitals() {
  // Helper to send metrics to Google Analytics
  function sendToAnalytics({ name, delta, id, value }) {
    // Send to Google Analytics if available
    if (typeof gtag === 'function') {
      gtag('event', name, {
        event_category: 'Web Vitals',
        event_label: id,
        value: Math.round(name === 'CLS' ? delta * 1000 : delta),
        non_interaction: true,
        metric_id: id,
        metric_value: value,
        metric_delta: delta,
      });
    }

    // Also send to Sentry for correlation with errors
    if (window.Sentry) {
      Sentry.setMeasurement(name, value, 'millisecond');
    }

    // Log to console in development
    if (import.meta.env?.MODE !== 'production') {
      console.info(`[Web Vitals] ${name}:`, {
        value: Math.round(value),
        delta: Math.round(delta),
        rating: getRating(name, value),
      });
    }
  }

  // Get performance rating for each metric
  function getRating(name, value) {
    const thresholds = {
      CLS: [0.1, 0.25],
      FID: [100, 300],
      LCP: [2500, 4000],
      FCP: [1800, 3000],
      TTFB: [800, 1800],
    };

    const [good, needsImprovement] = thresholds[name] || [0, 0];

    if (value <= good) return 'good';
    if (value <= needsImprovement) return 'needs-improvement';
    return 'poor';
  }

  // Track all Core Web Vitals
  getCLS(sendToAnalytics);
  getFID(sendToAnalytics);
  getLCP(sendToAnalytics);
  getFCP(sendToAnalytics);
  getTTFB(sendToAnalytics);

  console.info('[Web Vitals] Performance monitoring initialized.');
}

/**
 * Track custom business metrics
 */
export function trackFormSubmissionMetrics() {
  // Expose Firebase metrics to monitoring
  const metricsInterval = setInterval(() => {
    if (typeof window.__firebaseMetrics === 'function') {
      const metrics = window.__firebaseMetrics();

      // Log circuit breaker state
      if (metrics.formSubmissions.state !== 'CLOSED') {
        console.warn('[Metrics] Form submission circuit breaker is OPEN:', metrics.formSubmissions);

        // Send alert to Sentry
        if (window.Sentry) {
          Sentry.captureMessage('Circuit breaker OPEN for form submissions', {
            level: 'warning',
            extra: metrics,
          });
        }
      }

      // Log queue health
      const formQueueStatus = metrics.queues.formQueue;
      if (!formQueueStatus.queueHealthy) {
        console.error('[Metrics] Form queue unhealthy:', formQueueStatus);

        if (window.Sentry) {
          Sentry.captureMessage('Form submission queue unhealthy', {
            level: 'error',
            extra: formQueueStatus,
          });
        }
      }

      // Send metrics to analytics
      if (typeof gtag === 'function') {
        gtag('event', 'circuit_breaker_status', {
          event_category: 'System Health',
          event_label: 'Form Submissions',
          value: metrics.formSubmissions.state === 'CLOSED' ? 1 : 0,
          success_rate: metrics.formSubmissions.successRate,
        });

        gtag('event', 'queue_status', {
          event_category: 'System Health',
          event_label: 'Pending Submissions',
          value: formQueueStatus.pending,
          queue_healthy: formQueueStatus.queueHealthy ? 1 : 0,
        });
      }
    }
  }, 60000); // Check every 60 seconds

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    clearInterval(metricsInterval);
  });
}

/**
 * Track errors globally
 */
export function initGlobalErrorHandling() {
  // Catch unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[Global Error] Unhandled promise rejection:', event.reason);

    if (window.Sentry) {
      Sentry.captureException(event.reason);
    }
  });

  // Catch global errors
  window.addEventListener('error', (event) => {
    console.error('[Global Error]:', event.error || event.message);

    if (window.Sentry) {
      Sentry.captureException(event.error || new Error(event.message));
    }
  });

  console.info('[Error Handling] Global error handlers initialized.');
}

/**
 * Initialize all observability features
 */
export function initObservability() {
  initSentry();
  initCoreWebVitals();
  initGlobalErrorHandling();
  trackFormSubmissionMetrics();

  console.info('[Observability] All monitoring systems active.');
}
