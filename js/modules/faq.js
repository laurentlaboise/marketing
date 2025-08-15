// js/modules/faq.js

import { revealObserver } from './ui.js'; // Import the observer for new elements

const faqList = document.getElementById('faq-list');
const generateFaqBtn = document.getElementById('generate-faq-btn');
let usedFaqIndexes = new Set();

// Keep the FAQ data self-contained in this module
const allFaqs = [
    { q: "What makes you the best SEO expert in Asia for a small business?", a: "Our focus on affordable SEO services with transparent digital marketing packages and a proven track record of delivering ROI makes us the best choice for SMEs." },
    { q: "How does your AI Marketing Agency improve Vientiane SEO?", a: "We use AI to analyze local search trends in Vientiane, optimize your Google My Business profile, and create content that attracts local customers." },
    // ... (include all your other FAQ objects here) ...
    { q: "How can I get started with your agency?", a: "It's easy! Just visit our contact page, fill out the short form, and our team will schedule a free consultation to discuss your needs." }
];

function addFaqToDom(faq) {
    const details = document.createElement('details');
    details.className = "accordion-item reveal";
    details.innerHTML = `
        <summary class="accordion-summary">
            <h3>${faq.q}</h3>
            <i class="fas fa-chevron-down icon"></i>
        </summary>
        <p class="accordion-content">${faq.a}</p>`;
    faqList.appendChild(details);
    revealObserver.observe(details); // Apply reveal animation to the new FAQ
}

function generateInitialFaqs() {
    if (!faqList) return;
    faqList.innerHTML = '';
    usedFaqIndexes.clear();
    const shuffledFaqs = [...allFaqs].sort(() => 0.5 - Math.random());
    shuffledFaqs.slice(0, 5).forEach(faq => {
        addFaqToDom(faq);
        const originalIndex = allFaqs.findIndex(item => item.q === faq.q);
        usedFaqIndexes.add(originalIndex);
    });
}

function addNewFaq() {
    let availableIndexes = allFaqs.map((_, i) => i).filter(i => !usedFaqIndexes.has(i));
    if (availableIndexes.length === 0) {
        generateInitialFaqs(); // Reset if all questions have been shown
        return;
    }
    let newIndex = availableIndexes[Math.floor(Math.random() * availableIndexes.length)];
    addFaqToDom(allFaqs[newIndex]);
    usedFaqIndexes.add(newIndex);
    faqList.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function initFaqSection() {
    if (faqList && generateFaqBtn) {
        generateInitialFaqs();
        generateFaqBtn.addEventListener('click', addNewFaq);
    }
}
