'use strict';

/**
 * Unique English reviews for six GSC AI-tool URLs.
 * Seed-specific facts only. No invented prices, ratings, or features.
 */

const visitEn = (href) => `<div class="cta-bar">
        <a class="btn btn-primary" href="${href}" target="_blank" rel="noopener noreferrer"><i class="fas fa-globe"></i> Visit website</a>
      </div>`;

module.exports = [
  {
    rel: 'en/resources/ai-tools/groq/index.html',
    meta: 'Groq review for SEA marketers: LPU inference hardware plus a hosted, OpenAI-compatible API. Confirm the live model list and limits on groq.com — this is not a writing studio.',
    lead: 'Groq sells inference speed: Language Processing Unit hardware and a hosted API that runs models you pick from the current catalog. It will not draft a campaign for you unless a developer wires it into something you already own.',
    sections: `
    <section>
      <h2>What is Groq?</h2>
      <div class="card">
        <p><a href="https://groq.com" target="_blank" rel="noopener noreferrer">Groq</a> is an inference company. It designs Language Processing Unit (LPU) chips and runs a hosted API so applications can call language models with low latency. If you opened this page expecting a browser writing studio — a place to type a brief and export a landing page — close that mental tab. Groq is the layer underneath an app: you send a request, a model in Groq’s current catalog answers, and your code decides what to do with the text.</p>
        <p>Official docs present an OpenAI-compatible API. The documented base URL is <code>https://api.groq.com/openai/v1</code>. Teams that already call another provider can often swap the host and the key, then retest. That compatibility is a convenience, not a promise that every OpenAI feature exists on Groq or that every model name matches. Read the Groq console for the routes you actually need (chat, audio, or others listed there this quarter).</p>
        <p>The catalog is not a frozen menu. Groq lists models through the API; names that show up in last year’s blog posts may already be gone. Do not write Llama, Qwen, or any other family into a client statement of work as if Groq will host that exact checkpoint forever. Call the models endpoint, pin the identifier you tested, and schedule a quarterly check.</p>
        <p>For WordsThatSells clients in Vientiane, Bangkok, and Ho Chi Minh City, Groq matters when a product already has a developer and a defined job: a site FAQ bot, an internal helper that comments analytics scripts, a batch rewrite tool. It does not replace a bilingual copywriter, and it does not know your hotel’s wet-season closure dates unless you supply them.</p>
        <p>Developer trial access plus paid usage is how the directory classifies Groq (freemium). Caps, eligible models, and billing live in the account. Treat any third-party latency chart as a snapshot, not a contract.</p>
      </div>
    </section>
    <section>
      <h2>What Groq actually announces</h2>
      <div class="card">
        <ul>
          <li>Hosted inference on Groq LPU hardware, sold around speed and throughput</li>
          <li>OpenAI-style API routes so existing SDKs can often retarget the Groq host</li>
          <li>A live model list you can query via the API rather than a brochure PDF</li>
          <li>Additional endpoints (including audio, when a model is exposed) documented in the console</li>
          <li>A developer trial or free tier with limits, then metered paid usage — confirm both in-account</li>
        </ul>
        <p>Connectors, agent recipes, and playground extras appear in Groq’s docs at different times. Validate each one in your project before you put it on a client roadmap. Product surfaces move.</p>
      </div>
    </section>
    <section class="cols">
      <div>
        <h2>Good fit</h2>
        <div class="card">
          <ul>
            <li>A landing-page FAQ bot that must answer in under a beat during a sales demo</li>
            <li>An internal helper that drafts analytics-script comments or event-name suggestions for a developer to review</li>
            <li>Side-by-side tests of whichever open-weight models Groq currently hosts, on the same API contract</li>
          </ul>
        </div>
      </div>
      <div>
        <h2>Honest limits</h2>
        <div class="card">
          <ul>
            <li>Not a CMS, not an SEO editor, not a place non-technical marketers live all day</li>
            <li>Data-handling terms, rate limits, and model availability change — read the current terms</li>
            <li>Fast tokens can still invent visa rules, room rates, or Lao place names</li>
          </ul>
        </div>
      </div>
    </section>
    <section>
      <h2>How English-language SEA teams actually wire it</h2>
      <div class="card">
        <p>Start with a landing-page FAQ bot, not a vague “content engine.” An English-language tour operator in Bangkok or a riverside hotel near Vientiane often already has a services page with ten questions sales hears every week: transfer time from the airport, deposit rules, whether the pool is adults-only. Put those answers in a small approved store (even a JSON file the marketer can edit). The Groq call should retrieve or stay close to that store. Latency helps the chat feel alive on a phone over hotel Wi-Fi. It does not create truth. If you skip the store, the bot will invent a spa package you do not sell.</p>
        <p>A second practical job is an analytics-script helper. Growth teams in Ho Chi Minh City and English-speaking operators who share one GA4 or Mixpanel property often argue about event names. A tiny internal tool can paste a draft snippet — say a WhatsApp click or a booking-form submit — and ask the model to propose a consistent name, a comment block, and a list of properties the developer should not forget (currency, language, city). A human still pastes the snippet. Groq is only speeding the first draft of the comment and the naming conversation. Do not let the model invent tracking IDs that never get implemented.</p>
        <p>Before you put Thai or Lao strings into any of those tools, run a tokenization and rendering check. Thai has no spaces between words; Lao has its own vowel placement. A model that streams quickly can still split a brand name, drop a tone mark, or invent a Bangkok district. Build a short gold set: five product names, five street names, five sentences your receptionist actually says. Send them through the model you pinned. If the output breaks glyphs or “corrects” a Lao hotel name into Thai, change models or keep a native reviewer in the publish path. Speed does not fix a weak tokenizer.</p>
        <p>English-language operators in the region still sit next to LINE Official Accounts and Facebook inboxes. Groq does not replace those channels. It can sit behind a web widget on an English landing page while the Thai-speaking team keeps answering LINE by hand. Do not promise a unified inbox. If the client’s buyers live in LINE, a fast English FAQ on the website is a support, not a substitute.</p>
        <p>Rate limits and model deprecations are operational facts, not footnotes. When a campaign landing page suddenly gets ad traffic, a generous playground experiment can trip a cap. Document the exact model identifier in the repository — not the word Groq. Re-list models from the API when you reopen a project after Songkran or Tet, the same way you would re-check a payment gateway. Blog roundups go stale.</p>
        <p>If the team has no developer, Groq is the wrong first tab. A marketer who needs a headline today should use a consumer chat product and a human editor. Come back to Groq when you are repeating the same prompt inside code: the FAQ bot, the snippet helper, a nightly rewrite of product titles. Until that loop exists, you are paying for an API you will not operate.</p>
        <p>Keep keys on a server. A static marketing site should never embed a Groq token in the browser. Forms that collect guest names or passport hints in Laos or Thailand belong under your published privacy policy; do not dump identity documents into a prompt. WordsThatSells treats Groq as infrastructure behind a client build, not as a field the client types into during a workshop.</p>
        <p>A useful pairing session: the marketer brings the approved FAQ and the gold-language set; the developer brings the existing OpenAI-shaped client. You retarget the host, time the first useful token on the same prompt, and decide whether the latency change is worth another vendor in the stack. If the demo feels the same, stay with the provider the team already bills. Groq’s value is felt in the product, not in a slide that says ultra-fast.</p>
      </div>
    </section>
    <section>
      <h2>Pricing</h2>
      <div class="card">
        <p>This directory lists Groq as freemium: a developer trial or free allowance, then paid usage. We do not copy token prices here because the grid moves when models enter or leave the catalog. Confirm caps, included models, and invoices on <a href="https://groq.com" target="_blank" rel="noopener noreferrer">groq.com</a> and in the console.</p>
      </div>
    </section>
    <section>
      <h2>Get Groq</h2>
      ${visitEn('https://groq.com')}
    </section>`,
  },
  {
    rel: 'en/resources/ai-tools/openai-platform/index.html',
    meta: 'OpenAI Platform review for SME marketers: pay-as-you-go APIs for the GPT family, image, audio, embeddings, batch, and tools. Not ChatGPT Plus — keep keys on a server and read usage policies on openai.com.',
    lead: 'OpenAI Platform is the developer dashboard and API at platform.openai.com — models and tools you call from your own software, billed as you go. It is not the ChatGPT Plus consumer subscription.',
    sections: `
    <section>
      <h2>What is OpenAI Platform?</h2>
      <div class="card">
        <p><a href="https://platform.openai.com" target="_blank" rel="noopener noreferrer">OpenAI Platform</a> is the API product: you create a project, add a payment method in the dashboard, and your application calls documented endpoints. The GPT family is the headline, but the same account can expose image generation, audio (text-to-speech and speech-to-text), embeddings, batch jobs, fine-tuning where OpenAI still documents it for your account, and tool-using interfaces — Assistants or the newer Responses API, depending on what the docs show when you build. Check the current reference rather than a slide from last year.</p>
        <p>This is not ChatGPT in a browser with a monthly seat. ChatGPT Plus is a separate consumer product. Platform usage is metered in the API dashboard. A marketer at a Bangkok SME can use ChatGPT for one-off drafts; the Platform is what you choose when a website, a CRM helper, or a nightly catalog rewrite needs a key that lives on a server.</p>
        <p>Keys belong on a server. Pasting a secret into a landing-page script, a no-code “custom JS” box, or a shared Notion page is how accounts get drained and how guest data leaks. WordsThatSells treats the Platform as something a developer or a trusted automation host calls. The marketer still owns the brief, the approved facts, and the publish decision.</p>
        <p>Thai and Lao quality is not guaranteed by the logo. Evaluate the specific model you intend to ship: tone marks, hotel names in Vientiane, Thai product titles that should not be “helpfully” spaced. Run that eval before production, not after a client sees a broken glyph on mobile. Vietnamese operators in HCMC should do the same for diacritics and local brand spelling.</p>
        <p>Usage policies live on openai.com, not in this review. If your workflow includes medical claims, political ads, or scraping inboxes, read those policies yourself. We will not invent a permission that the vendor did not grant.</p>
      </div>
    </section>
    <section>
      <h2>What the platform actually documents</h2>
      <div class="card">
        <ul>
          <li>Text models in the GPT family for chat, classification, and structured outputs as currently listed</li>
          <li>Image endpoints for generation (and related image tools the docs still publish)</li>
          <li>Audio: speech-to-text and text-to-speech for voice notes, IVR experiments, or course explainers</li>
          <li>Embeddings for search and clustering, plus a Batch API for jobs that can wait</li>
          <li>Tool-calling surfaces — Assistants and/or the Responses API — plus fine-tuning eligibility that you must confirm in-account</li>
        </ul>
        <p>OpenAI retires models and renames product surfaces. Fine-tuning access in particular has changed for some accounts. Build against the live docs and the dashboard, not against a directory paragraph.</p>
      </div>
    </section>
    <section class="cols">
      <div>
        <h2>Good fit</h2>
        <div class="card">
          <ul>
            <li>A server-side helper that drafts English FAQs or meta descriptions from a locked fact sheet</li>
            <li>Embeddings search over your own help center so a site bot cites pages you wrote</li>
            <li>Batch rewrites of a product catalog when a human still approves the file before it goes live</li>
          </ul>
        </div>
      </div>
      <div>
        <h2>Honest limits</h2>
        <div class="card">
          <ul>
            <li>Not a replacement for ChatGPT Plus if you only need a chat window</li>
            <li>Thai, Lao, and Vietnamese still need a native pass before anything customer-facing ships</li>
            <li>Policies, rate limits, and model IDs change — budget time to retest each quarter</li>
          </ul>
        </div>
      </div>
    </section>
    <section>
      <h2>Using the API in a SEA marketing stack</h2>
      <div class="card">
        <p>A common WordsThatSells pattern is a fact sheet plus a server function. The marketer maintains a short document: room types, visa notes you are willing to publish, the English name of the Lao dish on the menu. The function sends that sheet and a task (FAQ draft, alt text, email snippet). The model never becomes the source of prices. If a number is missing, the output should say so rather than guess. That discipline matters more in tourism and education than a prettier system prompt.</p>
        <p>Speech endpoints earn their keep when English-language course sellers or hotel training teams already record WhatsApp voice notes. Speech-to-text can turn a manager’s walkthrough into a draft SOP; text-to-speech can narrate a lesson the team already wrote. Neither step should skip a listen-through. Accents from Isan, Lao, or southern Vietnam can confuse a model that was not evaluated on your files. Keep a two-minute sample set and replay it whenever you change models.</p>
        <p>Embeddings are the quiet win for support. If you already have English help articles — refund windows, pickup points, how to add LINE — embed those pages and retrieve them before the model answers. That is different from letting the model invent a pickup point on Thanon Samsenthai. Retrieval does not require a science team; it does require clean URLs and a developer who will refresh the index when you edit the site.</p>
        <p>Batch jobs fit catalog work: a hundred English titles that need a consistent voice, or alt text for a HCMC F&amp;B shoot. Because batch is designed to wait, it is a poor fit for a live chat on a landing page and a good fit for a Tuesday night export. Download the result, diff it, and reject rows that added adjectives you do not use (“luxurious,” “hidden gem”) unless the brand actually talks that way.</p>
        <p>Tool-calling (Assistants or Responses, as documented) can look like magic in a demo: the model decides to look up a booking, then replies. In production you still define the tools. A tool that hits your real reservation system needs authentication and a narrow schema. Do not expose a generic “browse the web” tool on a client site and hope it stays on-brand. If you only need a scripted FAQ, a retrieval bot is simpler to explain to the hotel owner.</p>
        <p>Fine-tuning is not the first lever for an SME. Most tone problems die when you put the fact sheet in the prompt and add three approved examples. Fine-tuning, where still offered to your project, means datasets, evals, and a plan for when the base model is retired. Ask whether you are solving a style issue or a missing-facts issue. Missing facts do not get fixed by training on last year’s emails.</p>
        <p>Compliance is local even when the vendor is not. Thailand’s PDPA and Vietnam’s data rules care about what you send abroad. If a form collects guest IDs, do not pipe the raw upload into an API call. Mask, minimize, and say so in the privacy policy you already publish. Usage policies on openai.com are a second gate: they can forbid use cases your client casually requested in a briefing. Read both before you quote a build.</p>
        <p>English-language operators sometimes assume “the API is better at English, so we skip QA.” Skip that assumption. Brand voice in hospitality English from Laos is not Silicon Valley English. Keep a reviewer who knows whether “temple visit” should name a specific wat. The Platform accelerates drafts. It does not sign the page.</p>
      </div>
    </section>
    <section>
      <h2>Pricing</h2>
      <div class="card">
        <p>The Platform is pay-as-you-go in the API dashboard. We do not reprint unit prices or estimate monthly spend. Open the billing pages on <a href="https://platform.openai.com" target="_blank" rel="noopener noreferrer">platform.openai.com</a> for the models you actually call. Set usage limits in the project so a leaked key or a loop cannot surprise the finance lead.</p>
      </div>
    </section>
    <section>
      <h2>Get OpenAI Platform</h2>
      ${visitEn('https://platform.openai.com')}
    </section>`,
  },
  {
    rel: 'en/resources/ai-tools/pitch/index.html',
    meta: 'Pitch review for remote SEA teams: collaborative decks, templates, sharing with view analytics as Pitch documents, plus advertised AI writing assist. Freemium — still export PDF for clients who live in Google Slides.',
    lead: 'Pitch is a modern presentation workspace for teams who build, comment, and share decks in the browser — not a thin PowerPoint clone. Use it for English brand pitches, then export when the client’s world is still Slides or PDF.',
    sections: `
    <section>
      <h2>What is Pitch?</h2>
      <div class="card">
        <p><a href="https://pitch.com" target="_blank" rel="noopener noreferrer">Pitch</a> is collaborative presentation software. You work in a shared workspace: decks, templates, comments, and roles for people who are not sitting in the same room. That is the product, even before anyone mentions AI. If your mental model is “PowerPoint, but in a tab,” you will miss why remote teams keep a second tool. Pitch is built around living decks that teammates edit together, then share as links rather than as orphan files in an email thread.</p>
        <p>Templates and brand kits (as Pitch documents them) exist so a Vientiane studio and a Bangkok freelancer can stay on the same typefaces without mailing a .potx around. Sharing options include links; Pitch also documents analytics on views — who opened the deck, which slides they lingered on — for links you configure that way. Treat those analytics as a sales signal, not as a scientific study of the buyer’s heart.</p>
        <p>Pitch advertises AI writing assist (and related agent-style help inside the editor). It can draft or tighten slide copy when you ask. It does not know high season in Luang Prabang, Songkran traffic in Bangkok, or when a HCMC client actually takes meetings unless you put that in the brief. AI here is a copy intern, not a market researcher.</p>
        <p>The model is freemium: a usable free layer and paid workspace features. Seat limits, analytics-link caps, and AI credit rules belong on pitch.com. We will not invent a price. Export to PDF or PowerPoint remains part of a grown-up workflow because many brand-side teams in Southeast Asia still live in Google Slides and will not create a Pitch account to leave a comment.</p>
        <p>English-language operators pitching a hotel or a campaign to a regional brand will feel the collaboration features first: one deck, two time zones, comments instead of v5_FINAL_really.pptx. The AI features are optional sugar on that workflow.</p>
      </div>
    </section>
    <section>
      <h2>What Pitch actually advertises</h2>
      <div class="card">
        <ul>
          <li>Browser decks with real-time workspace collaboration and commenting</li>
          <li>Template and brand-kit workflows so teams reuse layouts instead of restyling every slide</li>
          <li>Share links, including analytics on views as Pitch documents them</li>
          <li>AI writing assist and related in-editor AI actions the vendor currently promotes</li>
          <li>Export paths (PDF / PowerPoint-type files) so you can leave the walled garden when the client needs a file</li>
        </ul>
        <p>Feature names (Pitch Agent, credit packs, deal rooms) shift. Confirm what your workspace plan includes before you promise a client a live analytics link on every send.</p>
      </div>
    </section>
    <section class="cols">
      <div>
        <h2>Good fit</h2>
        <div class="card">
          <ul>
            <li>Remote agency and client pairs who need one deck, not a folder of conflicting files</li>
            <li>English hotel or campaign pitches to a brand team that will open a link</li>
            <li>Teams that still export PDF for stakeholders who will only annotate in Slides or email</li>
          </ul>
        </div>
      </div>
      <div>
        <h2>Honest limits</h2>
        <div class="card">
          <ul>
            <li>AI copy will miss local seasonality, public holidays, and unwritten brand taboos unless you brief it</li>
            <li>Some buyers will never leave Google Slides — plan the export, do not argue theology</li>
            <li>View analytics are only as good as the link type you created and the consent settings you chose</li>
          </ul>
        </div>
      </div>
    </section>
    <section>
      <h2>Pitching from Vientiane, Bangkok, and HCMC</h2>
      <div class="card">
        <p>A concrete job: you are pitching an English-language hotel campaign to a regional brand manager who works out of Singapore or Bangkok and reads decks on a phone in the grab car. Build the story in Pitch so the designer in HCMC and the strategist in Vientiane comment on the same slides. Keep the claim set in a sidebar note the AI is not allowed to “improve”: occupancy context you actually have, channel mix you can deliver (Meta, Google, LINE), and what you will not promise. Then let AI tighten a headline, not invent a wet-season occupancy number.</p>
        <p>Local seasonality is where AI decks go wrong. A model will cheerfully write “perfect for summer holidays” for a Mekong property whose high season is cool-and-dry, or it will treat Songkran as a generic water festival without the transport and staffing reality. Brief the tool with a three-line calendar: when guests actually come, when the hotel closes a wing, when the brand’s fiscal quarter ends. If you skip that brief, you will spend the meeting apologizing for a slide the intern-AI invented.</p>
        <p>Still export. Many brand marketing teams run their life in Google Slides. They will ask for a file they can drop into an existing all-hands deck. Pitch’s collaboration is for your team; the PDF or exported file is for their world. Send the analytics link when the buyer is comfortable opening it, and attach the PDF when they are not. Do not make the format a loyalty test.</p>
        <p>View analytics help you see whether the budget slide was opened. They do not tell you the buyer agreed. In SEA sales cycles, a deck often gets forwarded to a finance lead who never clicks your pretty link. Follow up in LINE, WhatsApp, or email with the same numbers in a short note. Treat Pitch analytics as one signal next to the human reply.</p>
        <p>Templates save time only if someone owns the brand kit. A WordsThatSells workspace can hold English and bilingual masters: one for tourism, one for education, one for F&amp;B. Lock the colors. Train the freelancer to duplicate, not to restyle from a blank canvas. AI that “matches the website” is a starting point; a Lao hotel site may use a decorative font that becomes unreadable at slide size. Check contrast on a phone.</p>
        <p>Comments replace some meetings. They do not replace a native review of Thai or Vietnamese slides. If you add a local-language appendix, have a speaker of that language read it. Pitch’s AI writing assist is strongest in English and still capable of confident mistakes in any language. Mark slides that contain legal or price claims as human-only.</p>
        <p>Remote does not mean asynchronous forever. Use Pitch to arrive at a shared draft, then run a live walkthrough. Analytics will not hear the brand manager say “we cannot show beer on that slide.” Capture that note in the deck, not in a chat that disappears. The workspace is the record.</p>
        <p>If your only presentation need is a five-slide internal stand-up, Google Slides is already paid for and everyone knows it. Pitch earns a seat when several people design together across cities and you care about a consistent template plus optional view tracking. Buy the collaboration, not the AI headline.</p>
      </div>
    </section>
    <section>
      <h2>Pricing</h2>
      <div class="card">
        <p>Pitch is freemium. We do not list seat prices or AI credit packs. Open <a href="https://pitch.com" target="_blank" rel="noopener noreferrer">pitch.com</a> for the current free workspace limits, paid plans, and anything the vendor bundles with analytics links or AI actions. Recheck before you put a line item on a client retainer.</p>
      </div>
    </section>
    <section>
      <h2>Get Pitch</h2>
      ${visitEn('https://pitch.com')}
    </section>`,
  },
  {
    rel: 'en/resources/ai-tools/surfer-content-editor/index.html',
    meta: 'Surfer Content Editor review for SEA writers: SERP-based content scoring, NLP terms, outlines, and AI writing features Surfer documents. Paid plans — a high score is not a ranking guarantee, and Thai SERP terms are not English terms.',
    lead: 'Surfer Content Editor is the on-page writing and scoring workspace inside Surfer, built from the search results you point it at. It is not a full-suite audit of your domain, and the score is not a promise from Google.',
    sections: `
    <section>
      <h2>What is Surfer Content Editor?</h2>
      <div class="card">
        <p>The <a href="https://surferseo.com" target="_blank" rel="noopener noreferrer">Surfer</a> Content Editor is a SERP-based writing surface. You choose a query, a location, and a device context; Surfer looks at pages that already rank and turns that into guidelines: terms, structure hints, length ranges, and a content score that moves as you type. This page is about that editor — not Surfer’s site audit, rank tracker, or other modules that live in the same subscription family. Those tools exist; they are not this review.</p>
        <p>Surfer documents NLP-style term lists (words and entities that appear on competing pages), outline helpers, and AI writer features inside or beside the editor (including assistant-style rewrite tools the vendor currently names on its site). Use them as research compression. They are not a substitute for knowing whether a Vientiane clinic can legally say what the SERP average says.</p>
        <p>The editor is trained on the SERPs you choose. A query scoped to Thailand is not the same document as the same words scoped to the United States or to English worldwide. Thai SERP terms will include phrases that look like stuffing if you paste them into an English article. English SERP terms will miss the words Thai searchers actually type. Pick the locale on purpose.</p>
        <p>Access is paid, through Surfer plans. We do not print dollar figures. Credits, editor seats, and which AI actions consume quota are on surferseo.com and in the billing screen. If your team writes two articles a month, do the math on whether a full Surfer seat is the right object — this review will not invent a cheaper unofficial path.</p>
        <p>WordsThatSells uses the editor when a client already has a keyword and a human writer. The score is a conversation with the SERP, not a grade that Google will honor.</p>
      </div>
    </section>
    <section>
      <h2>What the Content Editor actually offers</h2>
      <div class="card">
        <ul>
          <li>A live content score against a SERP you configured (query, location, device as the product allows)</li>
          <li>Suggested terms and entities, including NLP-oriented lists Surfer documents</li>
          <li>Outline / structure helpers drawn from competing pages and Surfer’s own generators</li>
          <li>In-editor AI writing or rewrite features the vendor currently ships (names change)</li>
          <li>Import and share flows so a writer and an SEO can sit in the same draft</li>
        </ul>
        <p>Auto-optimize and AI-draft buttons are optional accelerators. They will push terms in. You still decide whether the paragraph is readable to a hotel owner in English or a parent in Thai.</p>
      </div>
    </section>
    <section class="cols">
      <div>
        <h2>Good fit</h2>
        <div class="card">
          <ul>
            <li>English service pages where you already know the query and have a subject-matter reviewer</li>
            <li>Teams that want a shared checklist of competing headings without copying those pages</li>
            <li>Re-optimizing an old article when the SERP has moved and you need a structured diff</li>
          </ul>
        </div>
      </div>
      <div>
        <h2>Honest limits</h2>
        <div class="card">
          <ul>
            <li>Score is not a ranking guarantee and not a substitute for links, crawl health, or usefulness</li>
            <li>Thai terms from a Thai SERP do not belong stuffed into English copy until the sentence dies</li>
            <li>This editor is not the whole Surfer suite — do not expect audit or rank-tracking coverage from this page</li>
          </ul>
        </div>
      </div>
    </section>
    <section>
      <h2>Writing for Bangkok, Vientiane, and HCMC without stuffing</h2>
      <div class="card">
        <p>Set the SERP the way the buyer searches. If the page is English for expats booking a Bangkok clinic, use the English query and a locale that matches that SERP. If the page is Thai for the same clinic, open a separate editor with the Thai query. Mixing those term lists in one draft is how you get bilingual porridge: English sentences interrupted by Thai strings the writer does not understand. Two editors, two publish paths, or one language with a human translation after the English score is “good enough.”</p>
        <p>Do not chase the last ten terms. Surfer will keep offering words that appear on ranking pages. Some are relevant (neighborhood names, treatment types). Some are junk that ranking pages stuffed years ago. A readable English paragraph that misses a low-value term will serve the guest better than a sentence that names every synonym for “affordable.” WordsThatSells would rather ship a clear page at a mid score than an unreadable page at a high one.</p>
        <p>Outlines from the SERP are a map of what Google already rewarded, which means they are also a map of sameness. Add the sections a SERP in California will never mention: how to pay in kip or baht, whether you need a passport copy on LINE, which floor the clinic is on in a shophouse, weekend hours around a public holiday. Those headings will not always raise the score. They close the booking. Leave them in.</p>
        <p>AI writer features inside Surfer will draft fluent English that sounds like every other SaaS blog. For a Lao tourism page, that voice is often wrong: too many “immersive experiences,” too few bus times. Use the AI to break a blank page, then overwrite with facts from the operator. If you auto-optimize after that, read the diff. NLP insertion loves to drop a term into a sentence that already said the same thing in human language.</p>
        <p>Vietnamese and Thai word boundaries confuse tools that were tuned on space-separated English. If you score a Vietnamese draft against an English SERP, the term list is almost meaningless. If you score Vietnamese against a Vietnamese SERP, still have a native editor judge whether suggested phrases are how people speak or how SEOs talk to each other. The Content Editor does not know your brand’s decision to avoid certain medical adjectives.</p>
        <p>Agencies sometimes show the score in a client slide as if it were a KPI. It is a process metric. Rankings move for reasons the editor cannot see: a better backlink, a Google change, a competitor’s new page. When a client asks why a 80-scoring article did not enter the top three, answer with Search Console and the real SERP, not with a promise to add three more terms.</p>
        <p>LINE and Facebook still carry a lot of the conversion in this region. A page that ranks and then sends the reader to a dead form is a wasted editor credit. Put the next step the sales team actually uses — a LINE add, a WhatsApp number, a booking engine — in the draft before you sweat the last NLP term. Surfer will not remind you.</p>
        <p>If you also use Surfer’s audit or rank tracker, keep the jobs separate in your weekly ritual: tracker for movement, editor for the draft in front of you. This page will not teach those other modules. Opening every Surfer product at once is how small teams drown. One query, one editor, one human pass, then publish.</p>
      </div>
    </section>
    <section>
      <h2>Pricing</h2>
      <div class="card">
        <p>Surfer Content Editor ships inside paid Surfer plans. We do not quote package prices or credit packs. Confirm editor limits, AI actions, and whether your seat includes only the editor or the wider suite on <a href="https://surferseo.com" target="_blank" rel="noopener noreferrer">surferseo.com</a>.</p>
      </div>
    </section>
    <section>
      <h2>Get Surfer Content Editor</h2>
      ${visitEn('https://surferseo.com')}
    </section>`,
  },
  {
    rel: 'en/resources/ai-tools/mixpanel/index.html',
    meta: 'Mixpanel review for SEA product teams: event analytics, funnels, retention, and cohorts, plus AI analysis features listed on mixpanel.com. Freemium — you need an event taxonomy; this is not Similarweb or GA4.',
    lead: 'Mixpanel is product analytics for events you define: funnels, retention, and cohorts on users who actually use a product. It is the wrong instrument for a five-page brochure site and a different instrument from GA4 or Similarweb.',
    sections: `
    <section>
      <h2>What is Mixpanel?</h2>
      <div class="card">
        <p><a href="https://mixpanel.com" target="_blank" rel="noopener noreferrer">Mixpanel</a> is a product-analytics platform. You send events (signup, lesson_started, booking_confirmed) with properties you choose. The product then lets you build funnels, retention charts, and cohorts from those events. If you cannot name the ten events that matter, you are not ready to pay for Mixpanel. The software will not invent a clean taxonomy for a messy app.</p>
        <p>Mixpanel documents AI-assisted analysis and report help. Older materials talked about Spark; current pages describe Mixpanel Agent and related AI analysis features. Names move. This review will not freeze a codename. If you want the assistant, look at what mixpanel.com lists for your workspace today and treat it as a layer on top of events you already trust. AI that explains a broken funnel cannot fix an event that never fired.</p>
        <p>The commercial model is freemium: a free tier with limits and paid plans as volume and features grow. We do not print MTU prices or event caps. Read the current plan page. Implementation cost — a developer and a naming meeting — is usually larger than the first invoice for a small product.</p>
        <p>Do not confuse Mixpanel with Similarweb. Similarweb estimates traffic and competitive reach; it does not see your logged-in users. Do not confuse it with GA4 either. GA4 is web (and app) analytics with Google’s event model, sessions, and advertising joins. Mixpanel is at its best when people sign in and you care about paths through a product: a course platform, a booking app, a membership. A five-page hotel brochure with a phone number does not need this stack.</p>
        <p>English-language operators who ship a real app or a logged-in student portal in this region will get value. A restaurant microsite will not. WordsThatSells will say no when the brief is “we want Mixpanel because it sounds advanced.”</p>
      </div>
    </section>
    <section>
      <h2>What Mixpanel actually ships</h2>
      <div class="card">
        <ul>
          <li>Event tracking with properties, plus boards you can share with a team</li>
          <li>Funnels so you can see where people drop between steps you defined</li>
          <li>Retention and cohort tools for behavior over time, not just last-click</li>
          <li>AI analysis features listed on mixpanel.com (Spark historically; confirm the current name in-product)</li>
          <li>A free tier and paid upgrades — limits belong on the official pricing page</li>
        </ul>
        <p>Session replay, experiments, and flags appear in Mixpanel’s broader catalog depending on plan. Do not assume every logo on a marketing page is in your contract.</p>
      </div>
    </section>
    <section class="cols">
      <div>
        <h2>Good fit</h2>
        <div class="card">
          <ul>
            <li>Logged-in products: courses, memberships, booking or delivery apps with repeat use</li>
            <li>Teams willing to write and defend an event taxonomy before the first dashboard</li>
            <li>Marketers who will read funnels weekly and change an onboarding step, not just screenshot a chart</li>
          </ul>
        </div>
      </div>
      <div>
        <h2>Honest limits</h2>
        <div class="card">
          <ul>
            <li>Overkill for a five-page brochure or a Facebook-only business</li>
            <li>Not Similarweb (competitor estimates) and not GA4 (different web-analytics model)</li>
            <li>AI commentary is only as honest as the events; garbage names in, confident nonsense out</li>
          </ul>
        </div>
      </div>
    </section>
    <section>
      <h2>Events, LINE, and when to stay on GA4</h2>
      <div class="card">
        <p>Write the taxonomy on a sheet before anyone installs a SDK. For an English course business run from Bangkok or HCMC, a sane starter set might be: account_created, lesson_opened, lesson_completed, checkout_started, purchase_succeeded, plus properties for course_id, language, and city. For a hotel app: search_submitted, room_viewed, booking_started, booking_completed, and a property for length_of_stay. If two people on the team would name the same action differently, stop and decide. Mixpanel cannot reconcile signup vs register vs create_account after six months of mixed data.</p>
        <p>Funnels should match a decision you can still make. “People drop between lesson two and lesson three” can become a rewrite or a WhatsApp nudge. “People drop between landing page and LINE” may not even be in Mixpanel if the click lives only in a Pixel. Do not expect Mixpanel to see a LINE Official Account chat. You can send a line_click event from the website; you cannot replay the conversation inside Mixpanel unless you built that pipe yourself.</p>
        <p>Retention charts earn their keep on products people reopen. A one-time visa-information page does not have retention in the product sense. If your “product” is a brochure, GA4 (or even Search Console plus a call log) is the honest stack. Mixpanel starts to make sense when a student comes back next week or a guest uses an app for a second stay.</p>
        <p>Cohorts are how you talk to a group without guessing. “Completed lesson one, never purchased, language = English” is a cohort you might email. Building that cohort still requires the events above. Exporting it into Kit, a CRM, or an ads audience is a separate integration. Mixpanel is not your ESP.</p>
        <p>AI analysis features can draft a sentence about why a funnel broke. Ask them to show the report, then look at the event volume yourself. A holiday week in Thailand will drop weekday lesson_opened counts; that is not a product regression. A renamed event will look like a collapse. Humans who know Songkran and Tet should sit next to the AI summary. The vendor’s assistant does not have your calendar.</p>
        <p>Implementation in SEA often fails on the webview problem: a lot of traffic arrives inside Facebook or LINE in-app browsers. Test that your SDK still fires there. Also test Thai device times and UTC. A funnel that looks broken at 8:00 in San Francisco may be healthy at 21:00 in Vientiane. Set the project timezone on purpose.</p>
        <p>Privacy is not optional. Event properties should not include passport numbers, raw chat transcripts, or a child’s name from an education product. PDPA-style notices need to mention analytics if you identify users. Server-side sending can reduce leaky browser tags, but it does not remove the duty to say what you collect.</p>
        <p>If you already run GA4 well and you only need session-level marketing reports, stay there. Add Mixpanel when a product manager and a marketer share the same event list and will meet every two weeks to change the product. Buying both and ignoring Mixpanel is a common and expensive hobby. WordsThatSells would rather instrument five events cleanly than fifty events that nobody trusts.</p>
      </div>
    </section>
    <section>
      <h2>Pricing</h2>
      <div class="card">
        <p>Mixpanel is freemium. We do not reprint event or MTU prices. Confirm the free-tier ceiling, paid plan metrics, and which AI analysis features are included on <a href="https://mixpanel.com" target="_blank" rel="noopener noreferrer">mixpanel.com</a>. Recheck when your user count crosses the next obvious threshold — the vendor’s grid is the source, not this paragraph.</p>
      </div>
    </section>
    <section>
      <h2>Get Mixpanel</h2>
      ${visitEn('https://mixpanel.com')}
    </section>`,
  },
  {
    rel: 'en/resources/ai-tools/convertkit/index.html',
    meta: 'Kit (formerly ConvertKit) review for SEA creators: email sequences, forms, landing pages, tagging, recommendations, and creator commerce as kit.com documents. Freemium with an advertised trial — still a human for subject lines and PDPA consent.',
    lead: 'ConvertKit publicly rebranded to Kit. It is still a creator-focused email platform — forms, sequences, tagging, and the commerce features kit.com lists — not a LINE Official Account replacement and not Mailchimp with a new coat of paint.',
    sections: `
    <section>
      <h2>What is ConvertKit (now Kit)?</h2>
      <div class="card">
        <p><a href="https://convertkit.com" target="_blank" rel="noopener noreferrer">convertkit.com</a> redirects to <a href="https://kit.com" target="_blank" rel="noopener noreferrer">kit.com</a>. The company kept the product and changed the public name: Kit is the creator email platform formerly sold as ConvertKit. If your bookmarks, invoices, or SOPs still say ConvertKit, you are looking at the same lineage. New docs, apps, and the MCP experiment live under Kit.</p>
        <p>What the vendor documents is familiar to newsletter people: landing pages, embeddable forms, broadcasts, sequences (automations), tagging and segments, creator recommendations, and creator-commerce add-ons (subscriptions, digital products, or similar tools as currently listed). The point of the suite is a list you own and a set of emails you send on purpose — not a social algorithm.</p>
        <p>Kit advertises a free trial on the official site. Confirm the current length and whether a card is required on kit.com; those details have been marketed as a short trial without a card, and marketing pages change. After the trial, the product is freemium: a free or starter layer and paid creator plans. We do not print subscriber-tier prices here.</p>
        <p>Kit currently advertises an MCP connection so assistants (Claude, ChatGPT, and similar clients) can talk to a Kit account. Treat that as an optional, vendor-promoted integration — useful if you already live in an assistant, easy to over-trust if you let it tag or schedule without a human click. You do not need MCP to send a Friday newsletter.</p>
        <p>This is not LINE OA, and it is not a full retail ESP for a 20-SKU shop that lives on Shopee. English-language course and newsletter businesses are the natural fit. A neighborhood shop that only chats on LINE will feel like they bought the wrong pipe.</p>
      </div>
    </section>
    <section>
      <h2>What Kit actually documents</h2>
      <div class="card">
        <ul>
          <li>Email broadcasts plus visual sequences / automations for welcome and nurture flows</li>
          <li>Forms and landing pages aimed at growing a creator-owned list</li>
          <li>Tagging, segments, and recommendation-style growth features the vendor still publishes</li>
          <li>Creator commerce tools as listed on kit.com (digital products, subscriptions, or equivalents)</li>
          <li>An advertised MCP so compatible assistants can read or act in the account — optional, confirm access on the plan you buy</li>
        </ul>
        <p>AI subject-line or content helpers, when shown in the editor, are drafts. A human still sends. Feature names around AI and MCP will keep moving; the list you own is the durable asset.</p>
      </div>
    </section>
    <section class="cols">
      <div>
        <h2>Good fit</h2>
        <div class="card">
          <ul>
            <li>English-language newsletters, courses, and creator businesses that need sequences and tags</li>
            <li>Operators who want forms and simple landing pages in the same vendor as the inbox</li>
            <li>Teams that will collect consent on purpose and keep a human on every send</li>
          </ul>
        </div>
      </div>
      <div>
        <h2>Honest limits</h2>
        <div class="card">
          <ul>
            <li>LINE Official Account remains the daily channel for many Thai and Lao buyers — Kit does not replace it</li>
            <li>AI subject lines can sound American or spammy; they do not know your festival calendar</li>
            <li>MCP and assistant write-access are extra surface area — review every proposed tag or broadcast</li>
          </ul>
        </div>
      </div>
    </section>
    <section>
      <h2>Newsletters next to LINE, and consent that would survive a question</h2>
      <div class="card">
        <p>Decide the job of email versus LINE before you import a spreadsheet. In Bangkok and Vientiane, LINE OA is where people ask “are you open on Saturday?” Email is where an English-language course, a monthly essay, or a paid community can arrive without fighting the chat scroll. Kit is strong at the second job. Using it to nag a Thai guest who already lives in LINE usually means unsubscribes and a support headache. Run both if you truly have two audiences; do not force one audience into both.</p>
        <p>Sequences work when the first emails answer a real next step: here is the PDF you asked for, here is lesson zero, here is how to book a call. They fail when they are seven letters of autobiography. For a HCMC English teacher selling a writing cohort, a three-step welcome that restates the start date and the refund rule will outperform a vague “journey.” Write the dates yourself. Do not let an assistant invent a start Monday.</p>
        <p>Tagging is the adult feature. Tag the form that said “Bangkok meetup,” the click that said “Lao hotel ops,” the purchase that said “cohort 2026.” Then your next broadcast can skip people who already bought. Without tags you will send the same launch to everyone and train them to ignore you. Kit’s recommendations and discovery features (as documented) can bring subscribers from other creators; they will not clean a list you never tagged.</p>
        <p>Creator commerce on kit.com is for people whose product is a newsletter, a download, or a simple subscription. If your real checkout is a local payment slip, a Stripe invoice you already run, or a Facebook Shop, you may only need Kit for the email layer. Do not migrate commerce for the logo. Confirm payout countries and tax paperwork on the official site before you promise a Lao creator they can charge in kip.</p>
        <p>Consent is not a footer decoration. Thailand’s PDPA and common-sense practice in Vietnam and Laos still want a clear yes. A form should say what they will get and how to leave. Buying a scraped expat list and uploading it is how you burn the domain. Double-check that imports came from people who asked. WordsThatSells will not green-light a “growth hack” that is just someone else’s spreadsheet.</p>
        <p>AI subject lines need a human who has opened email on AIS and True networks at lunch. What looks clever in a US case study can look like phishing next to a bank SMS. Avoid fake urgency and fake personalization (“re: your stay”) unless the stay is real. Read the preview text. If the assistant wrote “unlock your potential,” delete it and name the object: the worksheet, the date, the room type.</p>
        <p>If you try the advertised Kit MCP, give the assistant read access first and watch what it proposes. Drafting a broadcast in chat can be fast. Letting it apply tags or schedule to the whole list is how a typo becomes 8 a.m. regret. Keep a second pair of eyes — especially when the copy mixes English with a Thai greeting the model romanized badly.</p>
        <p>Deliverability still depends on who clicks. Warm a new domain, send to people who opted in, and do not blast daily “value” that is actually a pitch. Kit cannot save a list that never wanted you. For SME marketers working with WordsThatSells, the honest stack is often: LINE for local service questions, Kit for the English list you intend to keep for years, and a human on the send button every time.</p>
      </div>
    </section>
    <section>
      <h2>Pricing</h2>
      <div class="card">
        <p>Kit is freemium and advertises a free trial on the official site — confirm length and card rules there, not here. We do not copy subscriber-tier prices. Open <a href="https://kit.com" target="_blank" rel="noopener noreferrer">kit.com</a> (or the <a href="https://convertkit.com" target="_blank" rel="noopener noreferrer">convertkit.com</a> redirect) for current plans, commerce add-ons, and whether MCP is in the plan you are buying.</p>
      </div>
    </section>
    <section>
      <h2>Get Kit (formerly ConvertKit)</h2>
      ${visitEn('https://kit.com')}
    </section>`,
  },
];
