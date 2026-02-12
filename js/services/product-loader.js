/**
 * Product Loader for Service Pages
 * Fetches products from the WTS Admin API and renders them as service cards.
 * Also dynamically generates the slide-in detail panels and handles Stripe checkout.
 *
 * Preserves static HTML content as fallback if the API is unreachable or returns no data.
 */

const ADMIN_API_BASE = 'https://admin.wordsthatsells.website/api/public';
const PAYMENTS_API_BASE = 'https://admin.wordsthatsells.website/api/payments';

/**
 * Load products for a given service page and render them into the grid.
 * Static HTML content is preserved as fallback.
 * @param {string} servicePage - The service_page value (e.g. 'content-creation')
 * @param {HTMLElement} gridContainer - The .service-grid element to populate
 */
export async function loadProducts(servicePage, gridContainer) {
  if (!gridContainer) return;

  // Save the original static content so we can restore it on failure
  const staticContent = gridContainer.innerHTML;

  try {
    console.log(`[ProductLoader] Fetching products for service_page="${servicePage}"...`);
    const response = await fetch(`${ADMIN_API_BASE}/products?service_page=${encodeURIComponent(servicePage)}`);

    if (!response.ok) {
      console.warn(`[ProductLoader] API returned HTTP ${response.status} — keeping static content`);
      return; // Keep original static content
    }

    const products = await response.json();
    console.log(`[ProductLoader] Received ${products.length} product(s) from API`);

    if (!products || products.length === 0) {
      // No products in the database for this service page — keep static content
      console.log('[ProductLoader] No products found in API — keeping static content as fallback');
      return;
    }

    // We got products from the API — render them
    renderProducts(products, gridContainer);
    renderDetailStorage(products);
    bindLearnMoreButtons();
    bindBuyButtons();

  } catch (error) {
    console.warn('[ProductLoader] API unavailable — keeping static content:', error.message);
    // Restore static content if it was somehow lost
    if (!gridContainer.innerHTML || gridContainer.querySelector('.loading-products')) {
      gridContainer.innerHTML = staticContent;
    }
  }
}

/**
 * Render product cards into the grid
 */
function renderProducts(products, container) {
  container.innerHTML = '';

  products.forEach((product, index) => {
    const delayClass = index > 0 ? ` reveal-delay-${Math.min(index, 8)}` : '';
    const priceHtml = product.price
      ? `<span class="product-price" style="display:block;margin:0.5rem 0;font-weight:600;color:var(--accent-color,#d62b83);">$${product.price.toFixed(2)} ${product.currency}</span>`
      : '';

    const buyBtnHtml = product.has_stripe && product.price
      ? `<button class="btn btn-accent-magenta btn-buy-now" data-product-id="${product.id}" style="margin-left:0.5rem;">Buy Now</button>`
      : '';

    const card = document.createElement('div');
    card.className = `service-card reveal${delayClass}`;
    card.innerHTML = `
      <div class="icon ${product.animation_class}"><i class="${product.icon_class}"></i></div>
      <h3 class="service-title">${escapeHtml(product.name)}</h3>
      <p class="service-description">${escapeHtml(product.description || '')}</p>
      ${priceHtml}
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;justify-content:center;margin-top:auto;">
        <button class="btn btn-premium btn-learn-more" data-service="${product.slug || product.id}">Learn More</button>
        ${buyBtnHtml}
      </div>
    `;
    container.appendChild(card);
  });

  // Trigger reveal animations for newly added elements
  triggerRevealAnimations(container);
}

/**
 * Render the hidden detail storage divs for the slide-in panel
 */
function renderDetailStorage(products) {
  let storage = document.querySelector('.service-details-storage');
  if (!storage) {
    storage = document.createElement('div');
    storage.className = 'service-details-storage';
    storage.style.display = 'none';
    document.body.appendChild(storage);
  }

  // Clear only dynamic product details (keep any static ones)
  storage.querySelectorAll('[data-dynamic-product]').forEach(el => el.remove());

  products.forEach(product => {
    const detailId = `details-${product.slug || product.id}`;
    // Skip if a static version already exists
    if (document.getElementById(detailId)) return;

    const slideIn = product.slide_in || {};
    const title = slideIn.title || product.name;
    const imgUrl = slideIn.image || product.image_url || `https://placehold.co/800x400/667eea/ffffff?text=${encodeURIComponent(product.name)}`;

    let contentHtml = '';

    if (slideIn.subtitle) {
      contentHtml += `<p class="service-description" style="font-size: var(--font-size-lg);">${slideIn.subtitle}</p>`;
    }

    if (slideIn.video) {
      contentHtml += `<div class="feature-visual" style="margin-bottom: var(--spacing-2xl);"><iframe width="100%" height="400" src="${escapeHtml(slideIn.video)}" title="${escapeHtml(title)}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="border-radius: var(--border-radius-lg);"></iframe></div>`;
    }

    if (slideIn.content) {
      contentHtml += `<div class="feature-content">${slideIn.content}</div>`;
    }

    if (product.features && product.features.length > 0) {
      contentHtml += `<div class="feature-content" style="margin-top: var(--spacing-xl);"><h3 class="service-title">Features</h3><ul>${product.features.map(f => `<li>${escapeHtml(f)}</li>`).join('')}</ul></div>`;
    }

    if (product.has_stripe && product.price) {
      contentHtml += `<div style="margin-top:2rem;text-align:center;"><button class="btn btn-accent-magenta btn-buy-now" data-product-id="${product.id}" style="font-size:1.1rem;padding:0.8rem 2rem;">Purchase - $${product.price.toFixed(2)} ${product.currency}</button></div>`;
    }

    const detailDiv = document.createElement('div');
    detailDiv.id = detailId;
    detailDiv.setAttribute('data-dynamic-product', 'true');
    detailDiv.setAttribute('data-title', title);
    detailDiv.setAttribute('data-img', imgUrl);
    detailDiv.innerHTML = `
      <section class="service-section section-alt">
        <div class="container">
          <div class="section-header">
            <center><div class="heading-accent-line"></div></center>
            <h2>${escapeHtml(title)}</h2>
            ${contentHtml}
          </div>
        </div>
      </section>
    `;
    storage.appendChild(detailDiv);
  });
}

/**
 * Simple URL safety check for image sources.
 * Allows http(s) URLs and relative paths; rejects javascript:, data:, etc.
 */
function isSafeImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) return false;
  if (lower.startsWith('/') || !lower.includes(':')) return true;
  try {
    const parsed = new URL(trimmed, window.location.origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

/**
 * Sanitize an image URL. Returns a safe http(s) URL string or null.
 */
function sanitizeImageUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed, window.location.origin);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
  } catch (e) { /* unsafe */ }
  return null;
}

/**
 * Bind learn more buttons to the existing slide-in functionality
 */
function bindLearnMoreButtons() {
  document.querySelectorAll('.btn-learn-more[data-service]').forEach(btn => {
    btn.addEventListener('click', function() {
      const serviceKey = this.getAttribute('data-service');
      const detailEl = document.getElementById(`details-${serviceKey}`);

      if (detailEl) {
        const title = detailEl.getAttribute('data-title') || 'Service Details';
        const img = detailEl.getAttribute('data-img') || '';
        const content = detailEl.innerHTML;

        const slideInTitle = document.getElementById('slide-in-title');
        const slideInImage = document.getElementById('slide-in-image');
        const slideInContent = document.getElementById('slide-in-content');
        const slideIn = document.getElementById('details-slide-in');
        const overlay = document.getElementById('details-overlay');

        if (slideInTitle) slideInTitle.textContent = title;
        if (slideInImage) {
          const safeImgUrl = sanitizeImageUrl(img);
          if (isSafeImageUrl(img) && safeImgUrl) {
            slideInImage.src = safeImgUrl;
          } else {
            slideInImage.removeAttribute('src');
          }
          slideInImage.alt = title;
        }
        if (slideInContent) slideInContent.innerHTML = content;

        if (slideIn) slideIn.classList.add('active');
        if (overlay) overlay.classList.add('active');

        // Re-bind buy buttons inside the slide-in
        bindBuyButtons();
      }
    });
  });
}

/**
 * Bind buy now buttons to Stripe checkout
 */
function bindBuyButtons() {
  document.querySelectorAll('.btn-buy-now[data-product-id]').forEach(btn => {
    // Avoid binding twice
    if (btn.dataset.bound) return;
    btn.dataset.bound = 'true';

    btn.addEventListener('click', async function(e) {
      e.preventDefault();
      e.stopPropagation();

      const productId = this.getAttribute('data-product-id');
      const originalText = this.innerHTML;

      this.disabled = true;
      this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

      try {
        const response = await fetch(`${PAYMENTS_API_BASE}/create-checkout-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_id: productId })
        });

        const data = await response.json();

        if (data.url) {
          window.location.href = data.url;
        } else {
          throw new Error(data.error || 'Failed to create checkout session');
        }
      } catch (error) {
        console.error('Checkout error:', error);
        alert('Unable to process payment. Please try again later.');
        this.disabled = false;
        this.innerHTML = originalText;
      }
    });
  });
}

/**
 * Load sidebar items for a section
 */
export async function loadSidebar(section, sidebarContainer) {
  if (!sidebarContainer) return;

  try {
    const response = await fetch(`${ADMIN_API_BASE}/sidebar?section=${encodeURIComponent(section)}`);
    if (!response.ok) return; // Fail silently - keep static sidebar

    const items = await response.json();
    if (!items || items.length === 0) return;

    // Build sidebar HTML
    const listHtml = items.map(item => {
      const target = item.open_in_new_tab ? ' target="_blank" rel="noopener noreferrer"' : '';
      const cssClass = item.css_class ? ` ${item.css_class}` : '';
      return `<li class="sidebar-item${cssClass}"><a href="${escapeHtml(item.url || '#')}"${target}><i class="${escapeHtml(item.icon_class)}"></i> ${escapeHtml(item.label)}</a></li>`;
    }).join('');

    sidebarContainer.innerHTML = `<ul class="sidebar-list">${listHtml}</ul>`;
  } catch (error) {
    // Fail silently - keep static sidebar content
    console.error('Failed to load sidebar:', error);
  }
}

/**
 * Simple HTML escaping
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Trigger reveal animations for dynamically added elements
 */
function triggerRevealAnimations(container) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  container.querySelectorAll('.reveal').forEach(el => {
    observer.observe(el);
  });
}

/**
 * Auto-initialize on DOM ready
 */
document.addEventListener('DOMContentLoaded', () => {
  const grid = document.querySelector('.service-grid[data-service-page]');
  if (grid) {
    const servicePage = grid.getAttribute('data-service-page');
    loadProducts(servicePage, grid);
  }

  const sidebar = document.querySelector('[data-sidebar-section]');
  if (sidebar) {
    const section = sidebar.getAttribute('data-sidebar-section');
    loadSidebar(section, sidebar);
  }
});
