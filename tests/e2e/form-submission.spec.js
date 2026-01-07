// tests/e2e/form-submission.spec.js
// E2E Tests for Form Submission with Circuit Breaker and Fallback

import { test, expect } from '@playwright/test';

test.describe('Form Submission - Happy Path', () => {
  test('should submit contact form successfully', async ({ page }) => {
    await page.goto('/en/');

    // Open the quote modal
    await page.click('#quote-tab');

    // Wait for modal to be visible
    await expect(page.locator('#quote-modal-overlay')).toBeVisible();

    // Fill out the form
    await page.fill('input[name="name"]', 'Test User');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.fill('input[name="company"]', 'Test Company');
    await page.selectOption('select[name="service"]', { index: 1 });
    await page.fill('textarea[name="message"]', 'This is a test message');

    // Submit the form
    await page.click('button[type="submit"]');

    // Wait for success message
    await expect(page.locator('text=/Thank you for your submission/i')).toBeVisible({ timeout: 10000 });

    // Verify form is reset
    await expect(page.locator('input[name="name"]')).toHaveValue('');
  });

  test('should subscribe to newsletter successfully', async ({ page }) => {
    await page.goto('/en/');

    // Find newsletter form
    await page.fill('#newsletter-form input[name="email"]', 'newsletter@example.com');

    // Submit
    await page.click('#newsletter-form button[type="submit"]');

    // Wait for success message
    await expect(page.locator('text=/Thanks for subscribing/i')).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Form Submission - Circuit Breaker & Fallback', () => {
  test('should queue submission when Firebase is down', async ({ page, context }) => {
    // Mock Firebase failure by blocking all firestore requests
    await context.route('**/firestore.googleapis.com/**', route => {
      route.abort('failed');
    });

    await page.goto('/en/');

    // Open modal
    await page.click('#quote-tab');
    await expect(page.locator('#quote-modal-overlay')).toBeVisible();

    // Fill and submit form
    await page.fill('input[name="name"]', 'Offline User');
    await page.fill('input[name="email"]', 'offline@example.com');
    await page.fill('input[name="company"]', 'Offline Company');
    await page.selectOption('select[name="service"]', { index: 1 });
    await page.fill('textarea[name="message"]', 'Testing fallback');

    await page.click('button[type="submit"]');

    // Should show fallback message
    await expect(page.locator('text=/saved.*sent once.*service.*back online/i')).toBeVisible({ timeout: 10000 });

    // Verify data is in localStorage queue
    const queueData = await page.evaluate(() => {
      return localStorage.getItem('pendingSubmissions');
    });

    expect(queueData).toBeTruthy();
    const queue = JSON.parse(queueData);
    expect(queue.length).toBeGreaterThan(0);
    expect(queue[0].data.email).toBe('offline@example.com');
  });

  test('should retry submission with exponential backoff', async ({ page, context }) => {
    let attemptCount = 0;

    // Mock Firebase to fail first 2 times, then succeed
    await context.route('**/firestore.googleapis.com/**', route => {
      attemptCount++;
      if (attemptCount <= 2) {
        route.abort('failed');
      } else {
        route.continue();
      }
    });

    await page.goto('/en/');

    await page.click('#quote-tab');
    await expect(page.locator('#quote-modal-overlay')).toBeVisible();

    await page.fill('input[name="name"]', 'Retry User');
    await page.fill('input[name="email"]', 'retry@example.com');
    await page.fill('input[name="company"]', 'Retry Co');
    await page.selectOption('select[name="service"]', { index: 1 });
    await page.fill('textarea[name="message"]', 'Testing retry');

    await page.click('button[type="submit"]');

    // Should eventually succeed after retries
    await expect(page.locator('text=/Thank you for your submission/i')).toBeVisible({ timeout: 15000 });

    // Verify retry attempts
    expect(attemptCount).toBeGreaterThan(1);
  });

  test('should handle timeout gracefully', async ({ page, context }) => {
    // Mock Firebase to timeout
    await context.route('**/firestore.googleapis.com/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 10000)); // 10s delay
      route.continue();
    });

    await page.goto('/en/');

    await page.click('#quote-tab');
    await page.fill('input[name="name"]', 'Timeout User');
    await page.fill('input[name="email"]', 'timeout@example.com');
    await page.fill('input[name="company"]', 'Timeout Corp');
    await page.selectOption('select[name="service"]', { index: 1 });
    await page.fill('textarea[name="message"]', 'Testing timeout');

    await page.click('button[type="submit"]');

    // Should fallback after timeout (5s)
    await expect(page.locator('text=/saved.*sent once/i')).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Form Submission - Security', () => {
  test('should sanitize user input to prevent XSS', async ({ page }) => {
    await page.goto('/en/');

    await page.click('#quote-tab');
    await expect(page.locator('#quote-modal-overlay')).toBeVisible();

    // Try to inject XSS payload
    const xssPayload = '<script>alert("XSS")</script>';
    await page.fill('input[name="name"]', xssPayload);
    await page.fill('input[name="email"]', 'xss@test.com');
    await page.fill('input[name="company"]', xssPayload);
    await page.selectOption('select[name="service"]', { index: 1 });
    await page.fill('textarea[name="message"]', xssPayload);

    await page.click('button[type="submit"]');

    // Wait for submission
    await page.waitForTimeout(2000);

    // Verify no script execution (page should not have alert)
    const dialogPromise = page.waitForEvent('dialog', { timeout: 1000 }).catch(() => null);
    const dialog = await dialogPromise;

    // If dialog appeared from XSS, fail the test
    if (dialog && dialog.message() === 'XSS') {
      await dialog.dismiss();
      throw new Error('XSS vulnerability detected!');
    }

    // Check localStorage for sanitized data
    const queueData = await page.evaluate(() => {
      return localStorage.getItem('pendingSubmissions');
    });

    if (queueData) {
      const queue = JSON.parse(queueData);
      // Should contain escaped HTML entities, not raw script tags
      expect(queue[0].data.name).not.toContain('<script>');
      expect(queue[0].data.name).toContain('&lt;script&gt;');
    }
  });

  test('should disable submit button during submission', async ({ page }) => {
    await page.goto('/en/');

    await page.click('#quote-tab');
    await page.fill('input[name="name"]', 'Button Test');
    await page.fill('input[name="email"]', 'button@test.com');
    await page.fill('input[name="company"]', 'Button Corp');
    await page.selectOption('select[name="service"]', { index: 1 });
    await page.fill('textarea[name="message"]', 'Testing button state');

    const submitButton = page.locator('button[type="submit"]');

    // Click submit
    await submitButton.click();

    // Immediately check if button is disabled
    await expect(submitButton).toBeDisabled();
    await expect(submitButton).toContainText(/submitting/i);

    // Wait for completion
    await page.waitForTimeout(3000);

    // Button should be re-enabled
    await expect(submitButton).toBeEnabled();
  });
});

test.describe('Form Submission - Accessibility', () => {
  test('should be keyboard navigable', async ({ page }) => {
    await page.goto('/en/');

    // Tab to quote button
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab'); // Adjust based on your layout

    // Open modal with Enter/Space
    await page.keyboard.press('Enter');

    // Modal should be visible
    await expect(page.locator('#quote-modal-overlay')).toBeVisible();

    // Tab through form fields
    await page.keyboard.press('Tab');
    await page.keyboard.type('Keyboard User');

    await page.keyboard.press('Tab');
    await page.keyboard.type('keyboard@test.com');

    // Close modal with Escape
    await page.keyboard.press('Escape');

    // Modal should close
    await expect(page.locator('#quote-modal-overlay')).not.toBeVisible();
  });

  test('should have proper ARIA labels', async ({ page }) => {
    await page.goto('/en/');

    await page.click('#quote-tab');

    // Check for ARIA attributes on modal
    const modal = page.locator('#quote-modal-overlay');
    await expect(modal).toHaveAttribute('role', 'dialog');
    await expect(modal).toHaveAttribute('aria-modal', 'true');

    // Check form inputs have labels
    const nameInput = page.locator('input[name="name"]');
    const nameLabel = await nameInput.evaluate(input => {
      const labelElement = document.querySelector(`label[for="${input.id}"]`);
      return labelElement ? labelElement.textContent : null;
    });

    expect(nameLabel).toBeTruthy();
  });
});

test.describe('Performance', () => {
  test('should load page within acceptable time', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/en/');

    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;

    // Should load within 3 seconds
    expect(loadTime).toBeLessThan(3000);
  });

  test('should track Core Web Vitals', async ({ page }) => {
    await page.goto('/en/');

    // Wait for page load
    await page.waitForLoadState('networkidle');

    // Check if web-vitals tracking is active
    const vitalsTracked = await page.evaluate(() => {
      return typeof window.getCLS !== 'undefined' ||
             typeof window.gtag !== 'undefined';
    });

    expect(vitalsTracked).toBeTruthy();
  });
});
