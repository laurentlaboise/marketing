// js/utils/circuit-breaker.js
// Circuit Breaker Pattern for Firebase Resilience
// Based on Netflix Hystrix architecture

export class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 60000; // 1 minute
    this.requestTimeout = options.requestTimeout || 5000; // 5 seconds

    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptTime = Date.now();

    // Metrics for observability
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      fallbackRequests: 0,
      lastFailure: null,
      lastSuccess: null
    };
  }

  async execute(operation, fallback) {
    this.metrics.totalRequests++;

    // If circuit is OPEN, check if enough time has passed
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptTime) {
        console.warn(`[Circuit Breaker] Circuit is OPEN. Using fallback. Next attempt at ${new Date(this.nextAttemptTime).toISOString()}`);
        this.metrics.fallbackRequests++;
        return fallback();
      }
      // Transition to HALF_OPEN to test the service
      this.state = 'HALF_OPEN';
      console.info('[Circuit Breaker] Circuit is now HALF_OPEN. Testing service...');
    }

    try {
      // Execute operation with timeout
      const result = await this._executeWithTimeout(operation);
      this._onSuccess();
      return result;
    } catch (error) {
      this._onFailure(error);

      // Use fallback if circuit is OPEN
      if (this.state === 'OPEN') {
        console.warn('[Circuit Breaker] Operation failed. Using fallback.', error);
        this.metrics.fallbackRequests++;
        return fallback();
      }

      throw error;
    }
  }

  async _executeWithTimeout(operation) {
    return Promise.race([
      operation(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), this.requestTimeout)
      )
    ]);
  }

  _onSuccess() {
    this.failureCount = 0;
    this.metrics.successfulRequests++;
    this.metrics.lastSuccess = new Date().toISOString();

    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        console.info('[Circuit Breaker] Circuit is now CLOSED. Service restored.');
        this.state = 'CLOSED';
        this.successCount = 0;
      }
    }
  }

  _onFailure(error) {
    this.failureCount++;
    this.metrics.failedRequests++;
    this.metrics.lastFailure = {
      timestamp: new Date().toISOString(),
      error: error.message
    };

    console.error(`[Circuit Breaker] Failure detected (${this.failureCount}/${this.failureThreshold}):`, error.message);

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptTime = Date.now() + this.timeout;
      console.error(`[Circuit Breaker] Circuit is now OPEN. Failover to fallback until ${new Date(this.nextAttemptTime).toISOString()}`);
    }

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.successCount = 0;
      this.nextAttemptTime = Date.now() + this.timeout;
      console.error('[Circuit Breaker] Service still failing. Circuit reopened.');
    }
  }

  getMetrics() {
    return {
      ...this.metrics,
      state: this.state,
      failureCount: this.failureCount,
      successRate: this.metrics.totalRequests > 0
        ? (this.metrics.successfulRequests / this.metrics.totalRequests * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptTime = Date.now();
    console.info('[Circuit Breaker] Circuit manually reset.');
  }
}

// Retry with exponential backoff utility
export class RetryWithBackoff {
  constructor(maxRetries = 3, baseDelay = 1000) {
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
  }

  async execute(operation) {
    let lastError;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (attempt < this.maxRetries) {
          const delay = this.baseDelay * Math.pow(2, attempt);
          const jitter = Math.random() * 1000; // Add jitter to prevent thundering herd
          const waitTime = delay + jitter;

          console.warn(`[Retry] Attempt ${attempt + 1} failed. Retrying in ${Math.round(waitTime)}ms...`);
          await this._sleep(waitTime);
        }
      }
    }

    throw lastError;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
