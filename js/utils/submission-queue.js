// js/utils/submission-queue.js
// Eventual Consistency Queue for Form Submissions
// Implements localStorage fallback with automatic sync

const QUEUE_KEY = 'pendingSubmissions';
const NEWSLETTER_QUEUE_KEY = 'pendingNewsletterSignups';
const MAX_QUEUE_SIZE = 100;
const SYNC_INTERVAL = 30000; // 30 seconds

export class SubmissionQueue {
  constructor(storageKey = QUEUE_KEY) {
    this.storageKey = storageKey;
    this.syncCallback = null;
    this.syncIntervalId = null;
  }

  /**
   * Add submission to queue
   * @param {Object} data - Form data to queue
   * @returns {boolean} Success status
   */
  enqueue(data) {
    try {
      const queue = this._getQueue();

      // Prevent queue overflow
      if (queue.length >= MAX_QUEUE_SIZE) {
        console.error('[Queue] Maximum queue size reached. Cannot add more submissions.');
        return false;
      }

      const submission = {
        id: this._generateId(),
        data: data,
        timestamp: Date.now(),
        attempts: 0,
        status: 'pending'
      };

      queue.push(submission);
      this._saveQueue(queue);

      console.info(`[Queue] Submission ${submission.id} queued. Queue size: ${queue.length}`);
      return true;
    } catch (error) {
      console.error('[Queue] Failed to enqueue submission:', error);
      return false;
    }
  }

  /**
   * Get next submission to process
   * @returns {Object|null} Next submission or null
   */
  dequeue() {
    try {
      const queue = this._getQueue();
      if (queue.length === 0) return null;

      const submission = queue.shift();
      this._saveQueue(queue);

      return submission;
    } catch (error) {
      console.error('[Queue] Failed to dequeue submission:', error);
      return null;
    }
  }

  /**
   * Mark submission as failed and re-queue
   * @param {Object} submission - Submission to retry
   */
  retry(submission) {
    try {
      submission.attempts++;
      submission.lastAttempt = Date.now();

      // Max 3 retry attempts
      if (submission.attempts >= 3) {
        console.error(`[Queue] Submission ${submission.id} exceeded max retries. Moving to failed queue.`);
        this._moveToFailedQueue(submission);
        return;
      }

      const queue = this._getQueue();
      queue.push(submission);
      this._saveQueue(queue);

      console.warn(`[Queue] Submission ${submission.id} re-queued (attempt ${submission.attempts}/3)`);
    } catch (error) {
      console.error('[Queue] Failed to retry submission:', error);
    }
  }

  /**
   * Get current queue status
   * @returns {Object} Queue statistics
   */
  getStatus() {
    const queue = this._getQueue();
    const failedQueue = this._getFailedQueue();

    return {
      pending: queue.length,
      failed: failedQueue.length,
      oldestSubmission: queue.length > 0 ? new Date(queue[0].timestamp).toISOString() : null,
      queueHealthy: queue.length < MAX_QUEUE_SIZE * 0.8 // 80% threshold
    };
  }

  /**
   * Start automatic sync with callback
   * @param {Function} syncCallback - Function to process submissions
   */
  startAutoSync(syncCallback) {
    if (this.syncIntervalId) {
      console.warn('[Queue] Auto-sync already running.');
      return;
    }

    this.syncCallback = syncCallback;
    this.syncIntervalId = setInterval(() => {
      this._processQueue();
    }, SYNC_INTERVAL);

    console.info('[Queue] Auto-sync started. Interval: 30s');

    // Process immediately on start
    this._processQueue();
  }

  /**
   * Stop automatic sync
   */
  stopAutoSync() {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
      console.info('[Queue] Auto-sync stopped.');
    }
  }

  /**
   * Process all queued submissions
   */
  async _processQueue() {
    const queue = this._getQueue();
    if (queue.length === 0) return;

    console.info(`[Queue] Processing ${queue.length} queued submission(s)...`);

    let processed = 0;
    let failed = 0;

    while (queue.length > 0) {
      const submission = this.dequeue();
      if (!submission) break;

      try {
        if (this.syncCallback) {
          await this.syncCallback(submission.data);
          processed++;
          console.info(`[Queue] Submission ${submission.id} synced successfully.`);
        }
      } catch (error) {
        failed++;
        console.error(`[Queue] Failed to sync submission ${submission.id}:`, error);
        this.retry(submission);
      }
    }

    if (processed > 0 || failed > 0) {
      console.info(`[Queue] Sync complete. Processed: ${processed}, Failed: ${failed}`);
    }
  }

  /**
   * Clear all queued submissions (use with caution)
   */
  clearQueue() {
    try {
      localStorage.removeItem(this.storageKey);
      console.info('[Queue] Queue cleared.');
    } catch (error) {
      console.error('[Queue] Failed to clear queue:', error);
    }
  }

  // Private helper methods

  _getQueue() {
    try {
      const data = localStorage.getItem(this.storageKey);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('[Queue] Failed to read queue:', error);
      return [];
    }
  }

  _saveQueue(queue) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(queue));
    } catch (error) {
      // Handle quota exceeded
      if (error.name === 'QuotaExceededError') {
        console.error('[Queue] localStorage quota exceeded. Removing oldest items...');
        queue.shift(); // Remove oldest
        this._saveQueue(queue);
      } else {
        console.error('[Queue] Failed to save queue:', error);
      }
    }
  }

  _getFailedQueue() {
    try {
      const data = localStorage.getItem(this.storageKey + '_failed');
      return data ? JSON.parse(data) : [];
    } catch (error) {
      return [];
    }
  }

  _moveToFailedQueue(submission) {
    try {
      const failedQueue = this._getFailedQueue();
      submission.status = 'failed';
      failedQueue.push(submission);
      localStorage.setItem(this.storageKey + '_failed', JSON.stringify(failedQueue));
    } catch (error) {
      console.error('[Queue] Failed to move submission to failed queue:', error);
    }
  }

  _generateId() {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instances
export const formSubmissionQueue = new SubmissionQueue(QUEUE_KEY);
export const newsletterQueue = new SubmissionQueue(NEWSLETTER_QUEUE_KEY);
