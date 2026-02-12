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

    // GA tracking
    if (typeof gtag === 'function') {
      gtag('event', 'form_submit', { event_category: 'Forms', event_label: formType });
    }

    // Show success in the modal
    const container = document.getElementById('quote-modal-container');
    if (container) {
      container.innerHTML = `
        <button id="modal-close-btn" class="modal-close" aria-label="Close" onclick="document.getElementById('quote-modal-overlay').style.display='none'">×</button>
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
