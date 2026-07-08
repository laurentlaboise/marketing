/**
 * Lightweight WebMCP bootstrap for pages that do not load main.js
 * (e.g. pricing page with its own form scripts).
 * Annotates declarative forms and registers imperative tools when supported.
 */
import { initWebMCP } from './modules/webmcp.js';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initWebMCP().catch((e) => console.warn('[WebMCP]', e));
  });
} else {
  initWebMCP().catch((e) => console.warn('[WebMCP]', e));
}
