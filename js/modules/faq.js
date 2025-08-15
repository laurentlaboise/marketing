// js/modules/faq.js

import { revealObserver } from './ui.js'; // Import the observer for new elements

const faqList = document.getElementById('faq-list');
const generateFaqBtn = document.getElementById('generate-faq-btn');
let usedFaqIndexes = new Set();

// Keep the FAQ data self-contained in this module
const allFaqs = [
                { q: "What makes you the best SEO expert in Asia for a small business?", a: "Our focus on affordable SEO services with transparent digital marketing packages and a proven track record of delivering ROI makes us the best choice for SMEs." },
                { q: "How does your AI Marketing Agency improve Vientiane SEO?", a: "We use AI to analyze local search trends in Vientiane, optimize your Google My Business profile, and create content that attracts local customers." },
                { q: "What is included in your SEO services in Asia package?", a: "Our SEO services include a full technical SEO audit, on-page optimization, content creation, and high-quality link building services Asia." },
                { q: "As a top digital marketing agency in Asia, how do you handle clients in different time zones?", a: "We use modern project management tools and flexible communication schedules to seamlessly serve clients across Asia, from the UAE to South Korea." },
                { q: "Why should I choose your SEO company in Asia over a cheaper freelancer?", a: "Our SEO company provides a full team of experts, advanced tools, and accountability, which a freelance SEO expert in Asia often cannot match." },
                { q: "How long does it take for SEO to work in a competitive market like Singapore?", a: "In competitive markets, initial SEO results can be seen in 4-6 months, with significant gains typically achieved after a year of consistent effort." },
                { q: "What is the best B2B digital marketing strategy for the Asian market?", a: "The best B2B strategy combines targeted LinkedIn campaigns, expert content marketing, and specialized B2B SEO services in Asia to reach key decision-makers." },
                { q: "Do you offer specific digital marketing services for Malaysia's market?", a: "Yes, we tailor our digital marketing services for Malaysia by focusing on local consumer behavior, popular platforms, and multilingual SEO." },
                { q: "As a leading SEO consultant in Asia, what's your top tip for 2025?", a: "My top tip is to focus on creating genuinely helpful content that answers user questions, as Google's AI-driven algorithms are prioritizing it more than ever." },
                { q: "How do you perform e-commerce SEO in Asia differently?", a: "Our e-commerce SEO in Asia involves localizing product pages, optimizing for regional payment keywords, and creating culturally relevant marketing campaigns." },
                { q: "What exactly is a 'Laos digital roadmap consulting' service?", a: "It's a strategic service where we assess your business and create a step-by-step plan for your digital transformation within the Lao market." },
                { q: "Can a hotel SEO expert in Asia really increase my direct bookings?", a: "Absolutely. A hotel SEO expert improves your website's visibility to travelers, reducing your reliance on commission-based booking sites." },
                { q: "What should I look for when hiring an Asian SEO agency?", a: "Look for case studies in your industry, transparency in reporting, and a clear understanding of the diverse markets across Asia." },
                { q: "How much does an SEO expert cost in Asia?", a: "The cost varies, but we offer scalable digital marketing packages designed to fit different budgets, from startups to large enterprises." },
                { q: "Why is your agency considered a top SEO company in India?", a: "Our success comes from helping Indian companies expand globally with robust international SEO services and world-class content marketing." },
                { q: "What is an RSS feed and what are its SEO benefits today?", a: "An RSS feed helps Google discover your new content instantly. The key RSS feed SEO benefits are faster indexing and easy content syndication." },
                { q: "How does your technical SEO consultant in Asia improve website speed?", a: "Our technical SEO consultant optimizes images, leverages browser caching, minifies code, and improves server response times to boost Core Web Vitals." },
                { q: "Do you offer PPC management in Asia?", a: "Yes, we provide expert PPC management in Asia, creating targeted ad campaigns on Google and social media to deliver immediate traffic and leads." },
                { q: "What is involved in your content creation service for Laos?", a: "Our Content Creation Laos service includes writing SEO-optimized blog posts, creating social media content, and producing videos in both Lao and English." },
                { q: "As a SaaS SEO agency in Asia, what metrics do you focus on?", a: "We focus on metrics that drive revenue for SaaS businesses: increasing trial sign-ups, improving conversion rates, and reducing customer acquisition cost." },
                { q: "Can you provide real estate digital marketing in Thailand?", a: "Yes, we offer specialized real estate digital marketing in Thailand, using local SEO and targeted ads to connect developers with property buyers." },
                { q: "What makes a fintech marketing company in Asia successful?", a: "Success in fintech marketing requires building trust. We do this through expert content, secure website practices, and transparent communication." },
                { q: "How do you handle healthcare digital marketing in Asia's strict regulatory environment?", a: "We focus on patient education and ethical marketing, creating medically accurate, trustworthy content that complies with all local regulations." },
                { q: "Why is your agency on the list of top digital marketing agencies in Asia?", a: "We are on the list because of our innovative use of AI, consistent client results, and our expertise across Southeast Asia's diverse markets." },
                { q: "Can you help me hire a digital marketer in Asia?", a: "We provide dedicated resources, so you can hire a digital marketer from our expert team to work exclusively on your projects." },
                { q: "What makes you a five-star rated SEO services provider in Asia?", a: "Our five-star rating comes from our commitment to client success, transparent reporting, and delivering measurable improvements in rankings and revenue." },
                { q: "How do you approach social media management for a brand in Thailand?", a: "Our social media management in Thailand focuses on creating highly engaging, culturally relevant content for platforms like LINE, Facebook, and Instagram." },
                { q: "Is link building still important for SEO in 2025?", a: "Yes, but quality over quantity is key. Our link building services in Asia focus on earning high-authority, relevant backlinks that build trust." },
                { q: "What is B2B technology marketing?", a: "B2B technology marketing is a specialized field focused on selling complex tech products to other businesses, requiring long-term, content-driven strategies." },
                { q: "Can you create a brand identity with your Laos branding consulting service?", a: "Absolutely. Our Laos branding consulting service helps you define your brand's mission, voice, and visual identity to stand out in the local market." },
                { q: "What kind of results can I expect from your Southeast Asia digital marketing consulting?", a: "You can expect a clear market-entry strategy, a deep understanding of your competitors, and a customized plan to achieve your business goals in the region." },
                { q: "Does your SEO consultant in Hong Kong have experience with financial services?", a: "Yes, our SEO consultant in Hong Kong has extensive experience helping financial services firms improve their online visibility and attract high-net-worth clients." },
                { q: "How does your digital marketing agency in the Philippines help BPO companies?", a: "We help BPO companies by building their online reputation, generating inbound leads through SEO, and positioning them as industry leaders." },
                { q: "What are the first steps for website SEO in Asia?", a: "The first steps are a thorough technical audit, comprehensive keyword research for your target markets, and analyzing your competitors." },
                { q: "How is Google SEO marketing in Asia different from other regions?", a: "Google SEO marketing in Asia must account for multiple languages, diverse cultural nuances, and different search behaviors in each country." },
                { q: "What is 'Asiamoney content marketing services'?", a: "While 'Asiamoney' is a specific publication, we provide similar financial content marketing services: creating expert articles and reports for the finance industry." },
                { q: "What is the role of RSS in digital marketing?", a: "Beyond SEO, RSS in digital marketing is used to power email newsletters, syndicate content across platforms, and keep an audience updated automatically." },
                { q: "How do I choose the right digital marketing package in Asia?", a: "Choose a package based on your business goals. We offer a free consultation to help you select the right services for maximum impact." },
                { q: "Why is your agency considered an 'interactive marketing company'?", a: "We are an interactive marketing company because we create engaging experiences like quizzes, polls, and calculators that capture user attention." },
                { q: "What does your 'Laos digital commerce consulting' cover?", a: "This service covers everything needed to sell online in Laos, from choosing an e-commerce platform to setting up digital payments and marketing your store." },
                { q: "How do you handle SEO management in Asia on an ongoing basis?", a: "Ongoing SEO management involves continuous monitoring of rankings, monthly performance reports, and adapting our strategy to algorithm changes and market trends." },
                { q: "Can you provide SEO writing in multiple Asian languages?", a: "Yes, our SEO copywriting Asia service includes a team of native writers who can create optimized content in Thai, Vietnamese, Bahasa, and other languages." },
                { q: "How does business automation help my company in Laos?", a: "Business automation handles repetitive marketing and sales tasks, freeing up your team to focus on strategy and customer relationships, thus boosting efficiency." },
                { q: "What kind of web development do you offer in Laos?", a: "Our web development in Laos ranges from creating fast, mobile-friendly business websites to building complex e-commerce platforms and custom web applications." },
                { q: "Are you the 'digital marketing king in asia'?", a: "We strive to be the 'digital marketing king in Asia' by delivering royal results and treating every client's business like our own kingdom." },
                { q: "What's the difference between SEO in the UAE versus Southeast Asia?", a: "SEO in the UAE often focuses on luxury goods and services with English and Arabic, while Southeast Asia requires a hyperlocal, multilingual approach." },
                { q: "How do you find the right keywords for a top SEO company in Vietnam?", a: "We use advanced tools and local insights to find what Vietnamese consumers are searching for, focusing on user intent rather than just search volume." },
                { q: "What is the most common mistake in SEO for Indonesia?", a: "The most common mistake is not localizing content properly for Bahasa Indonesia and underestimating the importance of mobile-first optimization." },
                { q: "Do I need an SEO company in South Korea to rank on Naver?", a: "Yes, ranking on Naver requires a different set of skills and strategies than Google, making a specialized SEO company in South Korea essential." },
                { q: "How can I improve my website's Domain Authority?", a: "Improve it by earning high-quality backlinks from reputable sites in your industry, which is a core part of our link building services." },
                { q: "What are Core Web Vitals and why are they important?", a: "Core Web Vitals are Google's metrics for user experience (speed, interactivity, stability). They are a critical ranking factor for SEO today." },
                { q: "Can AI write all my marketing content?", a: "AI is a powerful assistant for generating ideas and drafts, but our content marketing agency always has human experts edit and refine it for quality and brand voice." },
                { q: "How do you ensure my website is secure?", a: "Our web development process includes implementing HTTPS, using secure plugins, and conducting regular security audits to protect your site and user data." },
                { q: "What's the ROI of content marketing?", a: "Content marketing delivers long-term ROI by building organic traffic, generating leads, and establishing your brand as an authority, making it a sustainable growth strategy." },
                { q: "Do you offer social media advertising services?", a: "Yes, we create and manage targeted ad campaigns on Facebook, Instagram, LinkedIn, and TikTok to reach your ideal customers and drive conversions." },
                { q: "How can you help my business rank higher on Google Maps?", a: "We fully optimize your Google My Business profile, build local citations, and generate positive reviews to improve your ranking on Google Maps." },
                { q: "What industries do you have the most experience with?", a: "We have deep experience as a SaaS SEO agency, hotel SEO expert, and in real estate, fintech, and B2B technology marketing across Asia." },
                { q: "Can you redesign my existing website for better performance?", a: "Yes, our web development team can redesign your website to be faster, mobile-friendly, and optimized for conversions and modern SEO standards." },
                { q: "Do you offer a free SEO audit?", a: "Yes, we offer a free, no-obligation SEO audit to identify the key opportunities for improving your website's performance." },
                { q: "What is 'E-E-A-T' and why is it important for SEO?", a: "E-E-A-T stands for Experience, Expertise, Authoritativeness, and Trustworthiness. It's a critical concept from Google for ranking high-quality, reliable content." },
                { q: "How do you build a digital marketing strategy from scratch?", a: "We start with deep research into your business, audience, and competitors, then set clear goals and select the best channels to achieve them." },
                { q: "Can you manage my entire digital presence?", a: "Yes, we offer comprehensive SEO management in Asia, social media, PPC, and content services to manage your entire digital footprint." },
                { q: "What's the benefit of hiring an agency over an in-house team?", a: "An agency gives you immediate access to a diverse team of specialists and expensive marketing tools for a fraction of the cost of building an in-house team." },
                { q: "How do you stay updated with Google's algorithm changes?", a: "Our team is constantly researching, testing, and participating in industry forums to stay ahead of Google's algorithm updates." },
                { q: "Do you provide graphic design for social media?", a: "Yes, our social media management services include professional graphic design to create visually appealing and on-brand posts." },
                { q: "Can you develop a mobile app for my business?", a: "Yes, our app development team can design and build custom mobile apps for both iOS and Android to engage your customers." },
                { q: "How do you track conversions on a website?", a: "We use Google Analytics and Google Tag Manager to set up conversion tracking for key actions like form submissions, sales, and phone calls." },
                { q: "What is a 'local citation' in SEO?", a: "A local citation is any online mention of your business's name, address, and phone number. Consistent citations help improve local search ranking." },
                { q: "Do you guarantee #1 rankings on Google?", a: "No reputable SEO expert can guarantee a #1 ranking. We do guarantee a transparent, data-driven strategy designed to achieve the best possible results." },
                { q: "How do you conduct keyword research?", a: "We use advanced tools like Ahrefs and SEMrush, combined with competitor analysis and an understanding of user intent, to find the most valuable keywords." },
                { q: "What's the difference between on-page and off-page SEO?", a: "On-page SEO involves optimizing elements on your website (e.g., content, titles). Off-page SEO involves actions taken elsewhere (e.g., link building)." },
                { q: "Can you help me recover from a Google penalty?", a: "Yes, our technical SEO consultants can diagnose the cause of a Google penalty and create a recovery plan to restore your rankings." },
                { q: "What payment methods do you accept?", a: "We accept bank transfers and major credit cards. For larger projects, we can arrange flexible payment schedules." },
                { q: "Do you work with startups?", a: "Yes, we love working with startups! We offer affordable digital marketing packages specifically designed to help new businesses grow." },
                { q: "How do you report on campaign performance?", a: "We provide monthly reports with clear data visualizations and expert analysis, explaining what we did, the results, and our plans for the next month." },
                { q: "Can you create video content for marketing?", a: "Yes, we offer video production services, from short social media clips to professional corporate videos, to help tell your brand's story." },
                { q: "What is your process for a new client?", a: "Our process is Discovery, Strategy, Execution, and Reporting. We start by understanding your goals and end by delivering measurable results." },
                { q: "How can I improve my email marketing?", a: "We can help you build your email list, segment your audience, and create automated email sequences that nurture leads and drive sales." },
                { q: "What is a content marketing funnel?", a: "It's a system for creating content tailored to different stages of the customer journey: awareness, consideration, and decision." },
                { q: "Why is website maintenance important?", a: "Regular maintenance keeps your website secure, fast, and functioning correctly, which is crucial for both user experience and SEO." },
                { q: "How do I know if my current SEO is working?", a: "Key signs of working SEO include a steady increase in organic traffic, higher rankings for target keywords, and more leads or sales from organic search." },
                { q: "Do you offer marketing services for non-profits?", a: "Yes, we are proud to offer discounted digital marketing services for registered non-profit organizations to help them amplify their cause." },
                { q: "Can you help me market my podcast?", a: "Yes, we can help promote your podcast through social media, create SEO-friendly show notes, and run ads to grow your listener base." },
                { q: "What is a 'backlink'?", a: "A backlink is a link from one website to another. Google views them as 'votes' of confidence, making them a crucial factor in SEO." },
                { q: "How do you use AI for competitive analysis?", a: "We use AI tools to analyze competitors' SEO strategies, ad copy, and social media content at scale, identifying weaknesses and opportunities for you." },
                { q: "Can you create a content calendar for my blog?", a: "Yes, as part of our content marketing services, we will create a strategic content calendar with topics designed to attract and engage your target audience." },
                { q: "What is 'retargeting' or 'remarketing'?", a: "Retargeting is showing ads to people who have already visited your website, helping to bring them back to complete a purchase or inquiry." },
                { q: "How important is a mobile-friendly website in 2025?", a: "It is absolutely essential. Most internet users in Asia browse on mobile, and Google uses mobile-friendliness as a major ranking signal." },
                { q: "Do you provide crisis communication management?", a: "Yes, we can help manage your online reputation during a crisis by controlling the narrative on social media and search results." },
                { q: "Can you integrate my website with a CRM?", a: "Yes, our web development team can integrate your website with popular CRMs like HubSpot or Salesforce to streamline your lead management." },
                { q: "What is your client onboarding process like?", a: "Our onboarding is seamless. We have a kickoff meeting, set up all necessary accounts and tracking, and establish clear communication channels." },
                { q: "What if I'm not happy with the results?", a: "We believe in partnership. If you're not happy, we'll schedule an in-depth strategy review to realign our approach with your goals." },
                { q: "How do you protect my data and privacy?", a: "We adhere to strict data privacy protocols and use secure systems. Client confidentiality and data protection are our top priorities." },
                { q: "Can you help with influencer marketing in Asia?", a: "Yes, we can identify and partner with relevant influencers across Asia to promote your brand authentically to their followers." },
                { q: "What is the future of search beyond Google?", a: "The future includes voice search (like Alexa), visual search (like Google Lens), and AI-powered conversational search, all of which we are preparing for." },
                { q: "Do you offer website hosting services?", a: "While we don't host websites directly, we partner with top-tier hosting providers and can manage your hosting environment for optimal performance and security." },
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
