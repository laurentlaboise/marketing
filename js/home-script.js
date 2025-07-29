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
