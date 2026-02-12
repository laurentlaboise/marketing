// js/modules/firebase.js
// Form submissions — sends to WTS Admin backend API

const API_BASE = 'https://admin.wordsthatsells.website/api/public';

/**
 * Detect form_type from the modal title text.
 * "Apply for Affiliate Program" → affiliate
 * "leave a quick message" / anything else → general-inquiry
 */
function detectFormType() {
  const modalTitle = document.querySelector('#quote-modal-container .modal-title');
  if (modalTitle) {
    const text = modalTitle.textContent.toLowerCase();
    if (text.includes('affiliate')) return 'affiliate';
  }
  return 'general-inquiry';
}

// ============================================================
// Dynamic form rendering from admin-built templates
// ============================================================

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

/**
 * Render a form template into a container element.
 * Returns the created <form> element, or null if template not found.
 */
function renderFormTemplate(template, container) {
  if (!template || !container) return null;

  container.innerHTML = '';

  // Title
  if (template.title) {
    const h2 = document.createElement('h2');
    h2.className = 'modal-title';
    h2.textContent = template.title;
    container.appendChild(h2);
  }

  // Subtitle
  if (template.subtitle) {
    const p = document.createElement('p');
    p.className = 'modal-subtitle';
    p.textContent = template.subtitle;
    container.appendChild(p);
  }

  // Form
  const form = document.createElement('form');
  form.className = 'modal-form';
  form.id = 'dynamic-form-' + template.form_type;
  form.dataset.formType = template.form_type;
  form.dataset.successMessage = template.success_message || 'Thank you! Your request has been submitted.';

  const fieldsDiv = document.createElement('div');
  fieldsDiv.className = 'form-fields';

  (template.fields || []).forEach(field => {
    let el;
    if (field.type === 'textarea') {
      el = document.createElement('textarea');
      el.rows = 4;
    } else if (field.type === 'select') {
      el = document.createElement('select');
      // Default option
      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.textContent = field.placeholder || 'Select...';
      el.appendChild(defaultOpt);
      (field.options || []).forEach(opt => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        el.appendChild(option);
      });
    } else {
      el = document.createElement('input');
      el.type = field.type || 'text';
    }

    el.name = field.name;
    if (field.placeholder && field.type !== 'select') el.placeholder = field.placeholder;
    if (field.required) el.required = true;

    fieldsDiv.appendChild(el);
  });

  form.appendChild(fieldsDiv);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn btn-accent-blue';
  submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> ' + escapeHtml(template.submit_button_text || 'Submit');
  form.appendChild(submitBtn);

  container.appendChild(form);

  // Bind submit handler
  form.addEventListener('submit', handleDynamicFormSubmit);

  return form;
}

/**
 * Try to load a form template from the API and render it into the quote modal.
 * Returns true if a template was loaded, false otherwise.
 */
export async function loadQuoteFormTemplate() {
  const container = document.getElementById('quote-modal-container');
  if (!container) return false;

  const formType = detectFormType();

  try {
    const res = await fetch(`${API_BASE}/form-template/${formType}`);
    if (!res.ok) return false;
    const data = await res.json();
    if (!data.fields || data.fields.length === 0) return false;

    // Add close button first
    const closeBtn = document.createElement('button');
    closeBtn.id = 'modal-close-btn';
    closeBtn.className = 'modal-close';
    closeBtn.setAttribute('aria-label', 'Close quote form');
    closeBtn.textContent = '\u00d7';
    closeBtn.addEventListener('click', () => {
      document.getElementById('quote-modal-overlay').style.display = 'none';
    });

    container.innerHTML = '';
    container.appendChild(closeBtn);

    const formWrapper = document.createElement('div');
    container.appendChild(formWrapper);
    renderFormTemplate(data, formWrapper);

    return true;
  } catch (e) {
    console.warn('[Forms] Could not load template for', formType, e.message);
    return false;
  }
}

/**
 * Submit handler for dynamically rendered forms
 */
async function handleDynamicFormSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const formType = form.dataset.formType;
  const successMessage = form.dataset.successMessage;

  const formData = new FormData(form);
  const data = {};
  const metadata = {};

  // Extract known fields and put extras in metadata
  const knownFields = ['name', 'email', 'company', 'phone', 'message'];
  for (const [key, value] of formData.entries()) {
    const val = (value || '').trim();
    if (!val) continue;
    if (knownFields.includes(key)) {
      data[key] = val;
    } else {
      metadata[key] = val;
    }
  }

  if (!data.name || !data.email) {
    alert('Please fill in the required fields.');
    return;
  }

  const payload = {
    form_type: formType,
    ...data,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined
  };

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
  }

  try {
    const res = await fetch(`${API_BASE}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Submission failed.');
    }

    if (typeof gtag === 'function') {
      gtag('event', 'form_submit', { event_category: 'Forms', event_label: formType });
    }

    // Show success in place of the form
    const parent = form.parentElement;
    form.style.display = 'none';
    const successDiv = document.createElement('div');
    successDiv.style.cssText = 'text-align:center;padding:2rem 1rem;';
    successDiv.innerHTML = `
      <i class="fas fa-check-circle" style="font-size:3rem;color:#10b981;margin-bottom:1rem;display:block;"></i>
      <h2 style="margin-bottom:0.5rem;">Thank You!</h2>
      <p style="color:#64748b;">${escapeHtml(successMessage)}</p>
    `;
    parent.appendChild(successDiv);
    form.reset();
  } catch (e) {
    console.error('Dynamic form submission error:', e);
    alert(e.message || 'There was an error. Please try again.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit';
    }
  }
}

// ============================================================
// Static form handlers (fallback when no template exists)
// ============================================================

// Function for the main quote/affiliate form (present on every page)
export async function handleFormSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const formData = new FormData(form);

  const name = (formData.get('name') || '').trim();
  const email = (formData.get('email') || '').trim();
  const company = (formData.get('company') || '').trim();
  const service = (formData.get('service') || '').trim();
  const message = (formData.get('message') || '').trim();

  if (!name || !email) {
    alert('Please fill in your name and email.');
    return;
  }

  const formType = detectFormType();
  const payload = {
    form_type: formType,
    name,
    email,
    company: company || undefined,
    message: message || undefined,
    metadata: service ? { service } : undefined
  };

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
  }

  try {
    const res = await fetch(`${API_BASE}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Submission failed.');
    }

    if (typeof gtag === 'function') {
      gtag('event', 'form_submit', { event_category: 'Forms', event_label: formType });
    }

    // Show success in the modal
    const container = document.getElementById('quote-modal-container');
    if (container) {
      container.innerHTML = `
        <button id="modal-close-btn" class="modal-close" aria-label="Close" onclick="document.getElementById('quote-modal-overlay').style.display='none'">\u00d7</button>
        <div style="text-align:center;padding:2rem 1rem;">
          <i class="fas fa-check-circle" style="font-size:3rem;color:#10b981;margin-bottom:1rem;display:block;"></i>
          <h2 style="margin-bottom:0.5rem;">Thank You!</h2>
          <p style="color:#64748b;">Your request has been submitted successfully. Our team will get back to you shortly.</p>
        </div>
      `;
    }

    form.reset();
  } catch (e) {
    console.error('Form submission error:', e);
    alert(e.message || 'There was an error submitting your form. Please try again.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Request';
    }
  }
}

// Function for the Newsletter form
export async function handleNewsletterSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const formData = new FormData(form);
  const email = (formData.get('email') || '').trim();

  if (!email) {
    alert('Please enter your email address.');
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subscribing...';
  }

  try {
    const res = await fetch(`${API_BASE}/submissions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        form_type: 'newsletter',
        name: email.split('@')[0],
        email,
        metadata: { source: window.location.pathname }
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Subscription failed.');
    }

    if (typeof gtag === 'function') {
      gtag('event', 'form_submit', { event_category: 'Newsletter', event_label: 'subscribe' });
    }

    alert('Thanks for subscribing! You\'ll hear from us soon.');
    form.reset();
  } catch (e) {
    console.error('Newsletter signup error:', e);
    alert(e.message || 'Subscription failed. Please try again.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Subscribe';
    }
  }
}
