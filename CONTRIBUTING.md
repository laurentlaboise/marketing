<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Contributing to WordsThatSells.Website - Guidelines</title>
    <meta name="description" content="Guidelines for contributing to the WordsThatSells.Website website project. Learn about our philosophy, setup, code style, Git workflow, testing, and documentation standards.">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="https://wordsthatsells.website/CONTRIBUTING.html">

    <!-- Tailwind CSS CDN -->
    <script src="https://cdn.tailwindcss.com"></script>
    <!-- Google Fonts for Inter and Poppins -->
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Poppins:wght@600;700;800&display=swap" rel="stylesheet">

    <!-- Custom Styles for Branding, Animations, and Glassmorphism -->
    <style>
        /* Define Brand Colors for easy use in CSS */
        :root {
            --color-charcoal: #4A5568;
            --color-accent-blue: #3182CE;
            --color-accent-magenta: #D53F8C;
            --color-light-gray: #f7fafc;
        }

        body {
            font-family: 'Inter', sans-serif;
            /* Using brand colors for the main gradient background */
            background: linear-gradient(135deg, var(--color-accent-blue) 0%, var(--color-accent-magenta) 100%);
            min-height: 100vh;
            color: white; /* Default text color for the dark background */
        }

        h1, h2, h3 {
            font-family: 'Poppins', sans-serif;
        }

        /* Animated gradient background for the body */
        .gradient-bg {
            /* Mixing brand colors for a dynamic background */
            background: linear-gradient(-45deg, var(--color-accent-blue), var(--color-accent-magenta), rgba(49, 130, 206, 0.8), rgba(213, 63, 140, 0.8));
            background-size: 400% 400%;
            animation: gradientShift 15s ease infinite;
        }

        @keyframes gradientShift {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }

        /* Floating elements animation */
        .float {
            animation: float 6s ease-in-out infinite;
        }

        .float:nth-child(2) {
            animation-delay: -2s;
        }

        .float:nth-child(3) {
            animation-delay: -4s;
        }

        @keyframes float {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-20px) rotate(10deg); }
        }

        /* Glassmorphism effect - adapted for brand colors */
        .glass {
            background: rgba(255, 255, 255, 0.1); /* White with transparency */
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 1.5rem; /* Consistent rounded corners */
        }

        .glass-dark {
            background: rgba(0, 0, 0, 0.1); /* Black with transparency */
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 1.5rem; /* Consistent rounded corners */
        }

        /* Enhanced button effects - adapted for brand colors */
        .btn-primary {
            background: linear-gradient(45deg, var(--color-accent-blue), rgba(var(--color-accent-blue), 0.8)); /* Accent Blue to a related blue */
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
        }

        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 25px rgba(49, 130, 206, 0.4); /* Shadow based on Accent Blue */
        }

        .btn-primary::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
            transition: left 0.5s;
        }

        .btn-primary:hover::before {
            left: 100%;
        }

        .btn-secondary {
            background: linear-gradient(45deg, var(--color-accent-magenta), rgba(213, 63, 140, 0.8)); /* Accent Magenta to a related pink */
            transition: all 0.3s ease;
        }

        .btn-secondary:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 25px rgba(213, 63, 140, 0.4); /* Shadow based on Accent Magenta */
        }

        /* Card hover effects */
        .card-hover {
            transition: all 0.3s ease;
        }

        .card-hover:hover {
            transform: translateY(-8px);
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
        }

        /* Mobile menu animations */
        .mobile-menu {
            position: fixed;
            top: 0;
            right: 0;
            width: 80%;
            max-width: 350px;
            height: 100vh;
            background: rgba(255, 255, 255, 0.95); /* White with transparency */
            backdrop-filter: blur(20px);
            transform: translateX(100%);
            transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            z-index: 50;
        }

        .mobile-menu.open {
            transform: translateX(0);
        }

        .mobile-menu-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(2px);
            z-index: 40;
            opacity: 0;
            visibility: hidden;
            transition: all 0.3s ease;
        }

        .mobile-menu-overlay.open {
            opacity: 1;
            visibility: visible;
        }

        /* Pulsing effect for the 404 icon - adapted for brand colors */
        .pulse-glow {
            animation: pulseGlow 2s ease-in-out infinite alternate;
        }

        @keyframes pulseGlow {
            from {
                text-shadow: 0 0 20px rgba(49, 130, 206, 0.5); /* Accent Blue glow */
                transform: scale(1);
            }
            to {
                text-shadow: 0 0 30px rgba(49, 130, 206, 0.8), 0 0 40px rgba(213, 63, 140, 0.6); /* Accent Blue and Magenta glow */
                transform: scale(1.05);
            }
        }

        /* Disable animations for reduced motion */
        @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after {
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
                transition-duration: 0.01ms !important;
            }
        }

        /* Custom scrollbar */
        ::-webkit-scrollbar {
            width: 8px;
        }

        ::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.1);
        }

        ::-webkit-scrollbar-thumb {
            background: rgba(49, 130, 206, 0.6); /* Accent Blue thumb */
            border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: rgba(49, 130, 206, 0.8); /* Darker Accent Blue on hover */
        }

        /* Specific styles for code blocks */
        pre {
            background-color: rgba(0, 0, 0, 0.2);
            padding: 1rem;
            border-radius: 0.5rem;
            overflow-x: auto;
            margin-bottom: 1rem;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        code {
            font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
            font-size: 0.9em;
            color: #a8dadc; /* Light blue-green for code */
        }
        pre code {
            display: block; /* Ensures code block takes full width */
            white-space: pre-wrap; /* Wraps long lines */
            word-break: break-all; /* Breaks words if necessary */
        }
        /* Specific styling for list items in main content */
        .content-list li {
            margin-bottom: 0.5rem;
        }
        .content-list ul {
            list-style: disc;
            padding-left: 1.5rem;
        }
        .content-list ol {
            list-style: decimal;
            padding-left: 1.5rem;
        }
    </style>
</head>
<body class="gradient-bg text-white min-h-screen flex flex-col">
    <!-- Floating background elements for visual flair -->
    <div class="fixed inset-0 overflow-hidden pointer-events-none">
        <div class="absolute top-1/4 left-1/4 w-64 h-64 bg-white opacity-5 rounded-full float"></div>
        <div class="absolute top-3/4 right-1/4 w-32 h-32 bg-white opacity-5 rounded-full float"></div>
        <div class="absolute bottom-1/4 left-1/3 w-48 h-48 bg-white opacity-5 rounded-full float"></div>
    </div>

    <!-- No-JavaScript fallback message -->
    <noscript>
        <div class="bg-red-500 text-white p-4 text-center relative z-50">
            <p>Please enable JavaScript to experience the full functionality of this website.</p>
        </div>
    </noscript>

    <!-- Header Section -->
    <header class="relative z-30 glass rounded-b-3xl mx-4 mt-4">
        <div class="max-w-7xl mx-auto flex justify-between items-center py-6 px-8">
            <div class="flex items-center">
                <a href="/" class="flex items-center space-x-3 group">
                    <!-- Company Logo: Stylized 'W' with brand gradient -->
                    <div class="w-12 h-12 bg-gradient-to-br from-[var(--color-accent-blue)] to-[var(--color-accent-magenta)] rounded-xl flex items-center justify-center group-hover:rotate-12 transition-transform duration-300">
                        <span class="text-white font-bold text-xl">W</span>
                    </div>
                    <!-- Brand Name with gradient text -->
                    <span class="text-2xl font-bold bg-gradient-to-r from-white to-[rgba(49,130,206,0.5)] bg-clip-text text-transparent">WordsThatSells.Website</span>
                </a>
            </div>

            <!-- Desktop Navigation -->
            <nav class="hidden md:flex items-center space-x-8">
                <a href="/en/digital-marketing-services/" class="text-white/90 hover:text-white font-medium transition-all duration-300 hover:scale-105">Services</a>
                <a href="/en/company/about-us/" class="text-white/90 hover:text-white font-medium transition-all duration-300 hover:scale-105">About</a>
                <a href="/en/company/contact-us/" class="text-white/90 hover:text-white font-medium transition-all duration-300 hover:scale-105">Contact</a>
                <a href="/en/resources/" class="text-white/90 hover:text-white font-medium transition-all duration-300 hover:scale-105">Resources</a>
            </nav>

            <!-- Mobile menu button -->
            <button id="mobile-menu-button" class="md:hidden p-2 rounded-lg glass-dark hover:bg-white/20 transition-colors" aria-label="Open mobile menu">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
                </svg>
            </button>
        </div>
    </header>

    <!-- Mobile Menu Overlay -->
    <div id="mobile-menu-overlay" class="mobile-menu-overlay hidden"></div>

    <!-- Mobile Menu -->
    <div id="mobile-menu" class="mobile-menu hidden md:hidden p-6">
        <div class="flex justify-end mb-8">
            <button id="close-mobile-menu" class="p-2 rounded-lg hover:bg-gray-100 transition-colors" aria-label="Close mobile menu">
                <svg class="w-6 h-6 text-[var(--color-charcoal)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </button>
        </div>
        <nav class="flex flex-col px-6 space-y-2">
            <a href="/en/digital-marketing-services/" class="text-[var(--color-charcoal)] hover:text-[var(--color-accent-blue)] font-medium text-lg py-3 px-4 rounded-lg hover:bg-[rgba(74,85,104,0.05)] transition-all duration-300">Services</a>
            <a href="/en/company/about-us/" class="text-[var(--color-charcoal)] hover:text-[var(--color-accent-blue)] font-medium text-lg py-3 px-4 rounded-lg hover:bg-[rgba(74,85,104,0.05)] transition-all duration-300">About</a>
            <a href="/en/company/contact-us/" class="text-[var(--color-charcoal)] hover:text-[var(--color-accent-blue)] font-medium text-lg py-3 px-4 rounded-lg hover:bg-[rgba(74,85,104,0.05)] transition-all duration-300">Contact</a>
            <a href="/en/resources/" class="text-[var(--color-charcoal)] hover:text-[var(--color-accent-blue)] font-medium text-lg py-3 px-4 rounded-lg hover:bg-[rgba(74,85,104,0.05)] transition-all duration-300">Resources</a>
        </nav>
    </div>

    <!-- Main Content Area for CONTRIBUTING.md -->
    <main class="flex-grow flex justify-center p-4 py-8 relative z-20">
        <div class="max-w-5xl w-full glass rounded-3xl p-8 md:p-12 text-white/90">
            <h1 class="text-4xl md:text-5xl font-extrabold mb-8 text-center bg-gradient-to-r from-white to-[rgba(49,130,206,0.5)] bg-clip-text text-transparent">
                Contributing to WordsThatSells.Website Website
            </h1>

            <p class="text-lg mb-8 leading-relaxed">
                We welcome contributions from everyone! Whether you're a seasoned developer, a budding enthusiast, or simply a user with a great idea, your input helps make the WordsThatSells.Website website better. This document outlines the guidelines for contributing to ensure a smooth and collaborative process.
            </p>

            <h2 class="text-3xl md:text-4xl font-bold mb-6 text-white">
                <span class="text-[var(--color-accent-blue)]">🌟</span> Our Contribution Philosophy
            </h2>
            <ul class="list-none space-y-4 mb-10 content-list">
                <li class="flex items-start">
                    <svg class="w-6 h-6 mr-3 flex-shrink-0 text-[var(--color-accent-blue)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 110-2 1 1 0 012 0v2a1 1 0 11-2 0v-2zm0 8a1 1 0 110-2 1 1 0 012 0v2a1 1 0 11-2 0v-2zm-8-4a1 1 0 110-2 1 1 0 012 0h-2zm16 0a1 1 0 110-2 1 1 0 012 0h-2z"></path></svg>
                    <div>
                        <strong class="text-white">Collaboration:</strong> Working together to build a robust and high-quality platform.
                    </div>
                </li>
                <li class="flex items-start">
                    <svg class="w-6 h-6 mr-3 flex-shrink-0 text-[var(--color-accent-blue)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                    <div>
                        <strong class="text-white">Quality:</strong> Adhering to high standards for code, documentation, and user experience.
                    </div>
                </li>
                <li class="flex items-start">
                    <svg class="w-6 h-6 mr-3 flex-shrink-0 text-[var(--color-accent-blue)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <div>
                        <strong class="text-white">Innovation:</strong> Embracing new ideas and technologies to enhance our AI-powered marketing solutions.
                    </div>
                </li>
                <li class="flex items-start">
                    <svg class="w-6 h-6 mr-3 flex-shrink-0 text-[var(--color-accent-blue)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg>
                    <div>
                        <strong class="text-white">Clarity:</strong> Ensuring all contributions are well-documented and easy to understand.
                    </div>
                </li>
            </ul>

            <h2 class="text-3xl md:text-4xl font-bold mb-6 text-white">
                <span class="text-[var(--color-accent-blue)]">🚀</span> Getting Started
            </h2>
            <h3 class="text-2xl md:text-3xl font-semibold mb-4 text-white/90">1. Project Setup</h3>
            <ol class="list-decimal list-inside space-y-4 mb-10 content-list">
                <li>
                    <strong class="text-white">Fork the Repository:</strong>
                    Navigate to the <a href="https://github.com/wordsthatsells/website" target="_blank" rel="noopener noreferrer" class="text-[var(--color-accent-blue)] hover:underline">WordsThatSells.Website GitHub repository</a> and click the "Fork" button. This creates a copy of the repository under your GitHub account.
                </li>
                <li>
                    <strong class="text-white">Clone Your Fork:</strong>
                    Clone your forked repository to your local machine:
                    <pre><code class="language-bash">git clone https://github.com/YOUR_USERNAME/wordsthatsells.website.git
cd wordsthatsells.website</code></pre>
                </li>
                <li>
                    <strong class="text-white">Install Dependencies:</strong>
                    Our project uses Node.js and npm for dependency management. Ensure you have Node.js (v18+) and npm (v9+) installed.
                    <pre><code class="language-bash">npm install</code></pre>
                    This command will install all necessary project and development dependencies defined in `package.json`.
                </li>
                <li>
                    <strong class="text-white">Set Up Git Remotes:</strong>
                    Add the original WordsThatSells.Website repository as an "upstream" remote:
                    <pre><code class="language-bash">git remote add upstream https://github.com/wordsthatsells/website.git</code></pre>
                    You can verify your remotes with <code class="language-bash">git remote -v</code>.
                </li>
                <li>
                    <strong class="text-white">Launch Development Server:</strong>
                    To start the local development server with hot-reloading:
                    <pre><code class="language-bash">npm start</code></pre>
                    This will typically open the site in your browser at <a href="http://localhost:3000" target="_blank" rel="noopener noreferrer" class="text-[var(--color-accent-blue)] hover:underline">http://localhost:3000</a> (or similar).
                </li>
            </ol>

            <h2 class="text-3xl md:text-4xl font-bold mb-6 text-white">
                <span class="text-[var(--color-accent-blue)]">✨</span> Code Style Guidelines
            </h2>
            <p class="mb-4">We maintain a consistent code style across the project using automated tools.</p>
            <ul class="list-disc list-inside space-y-4 mb-10 content-list">
                <li>
                    <strong class="text-white">ESLint (<code class="language-plaintext">.eslintrc</code>):</strong>
                    Our JavaScript code adheres to strict quality and style rules defined in <code class="language-plaintext">.eslintrc</code>. This includes rules for ES6+ syntax, accessibility (<code class="language-plaintext">eslint-plugin-jsx-a11y</code>), performance, and JSDoc comments.
                    <ul class="list-disc list-inside ml-6 mt-2 content-list">
                        <li>To lint your code manually: <code class="language-bash">npm run lint</code></li>
                        <li>ESLint is integrated into our pre-commit hooks to ensure compliance.</li>
                    </ul>
                </li>
                <li>
                    <strong class="text-white">Prettier (<code class="language-plaintext">.prettierrc</code>):</strong>
                    We use Prettier for automated code formatting across HTML, CSS, JavaScript, JSON, and Markdown files. It ensures consistent indentation (2 spaces), single quotes, trailing commas (<code class="language-plaintext">all</code>), and a line length of <strong class="text-white">100 characters</strong>.
                    <ul class="list-disc list-inside ml-6 mt-2 content-list">
                        <li>To format your code manually: <code class="language-bash">npm run format</code></li>
                        <li>Prettier is also integrated into our pre-commit hooks.</li>
                    </ul>
                </li>
                <li>
                    <strong class="text-white">EditorConfig (<code class="language-plaintext">.editorconfig</code>):</strong>
                    For cross-editor consistency, we use <code class="language-plaintext">.editorconfig</code> to define basic formatting rules like UTF-8 encoding, LF line endings, and 2-space indentation. Most modern IDEs and editors have built-in support or plugins for EditorConfig.
                </li>
            </ul>

            <h2 class="text-3xl md:text-4xl font-bold mb-6 text-white">
                <span class="text-[var(--color-accent-blue)]">⚙️</span> Git Workflow
            </h2>
            <p class="mb-4">We follow a feature branch workflow for all contributions.</p>
            <h3 class="text-2xl md:text-3xl font-semibold mb-4 text-white/90">1. Create a Feature Branch</h3>
            <p class="mb-4">Always create a new branch for your feature or bug fix:</p>
            <pre><code class="language-bash">git checkout main
git pull upstream main # Sync with the latest upstream main
git checkout -b feature/your-feature-name # For new features
# OR
git checkout -b bugfix/issue-description # For bug fixes</code></pre>

            <h3 class="text-2xl md:text-3xl font-semibold mb-4 text-white/90">2. Commit Message Format</h3>
            <p class="mb-4">We use a conventional commit message format to ensure a clear and readable Git history.</p>
            <ul class="list-disc list-inside space-y-2 mb-4 content-list">
                <li><strong class="text-white">Format:</strong> <code class="language-plaintext">&lt;type&gt;(&lt;scope&gt;): &lt;subject&gt;</code></li>
                <li><strong class="text-white">Types:</strong> <code class="language-plaintext">feat</code> (new feature), <code class="language-plaintext">fix</code> (bug fix), <code class="language-plaintext">docs</code> (documentation), <code class="language-plaintext">style</code> (code style, no functional changes), <code class="language-plaintext">refactor</code> (code refactoring), <code class="language-plaintext">test</code> (adding tests), <code class="language-plaintext">chore</code> (build process, auxiliary tools, libraries).</li>
                <li><strong class="text-white">Scope (Optional):</strong> The part of the codebase affected (e.g., <code class="language-plaintext">header</code>, <code class="language-plaintext">auth</code>, <code class="language-plaintext">404-page</code>, <code class="language-plaintext">sitemap</code>).</li>
                <li><strong class="text-white">Subject:</strong> A brief, imperative description (max 50 chars).</li>
                <li><strong class="text-white">Body (Optional):</strong> More detailed explanation.</li>
                <li><strong class="text-white">Footer (Optional):</strong> References to issues (e.g., <code class="language-plaintext">Closes #123</code>).</li>
            </ul>
            <p class="mb-2"><strong class="text-white">Good Examples:</strong></p>
            <pre><code class="language-plaintext">feat(homepage): add AI-powered growth section
fix(404): correct search input placeholder color
docs(contributing): update git workflow section</code></pre>
            <p class="mb-2"><strong class="text-white">Bad Examples:</strong></p>
            <pre><code class="language-plaintext">fixed bug
updates
Added new feature for users</code></pre>

            <h3 class="text-2xl md:text-3xl font-semibold mb-4 text-white/90">3. Push Your Branch</h3>
            <pre><code class="language-bash">git push origin feature/your-feature-name</code></pre>

            <h3 class="text-2xl md:text-3xl font-semibold mb-4 text-white/90">4. Create a Pull Request (PR)</h3>
            <ul class="list-disc list-inside space-y-2 mb-4 content-list">
                <li>Go to your forked repository on GitHub and click "Compare & pull request".</li>
                <li><strong class="text-white">Title:</strong> Use the conventional commit format (e.g., <code class="language-plaintext">feat(services): implement AI copywriting section</code>).</li>
                <li><strong class="text-white">Description:</strong>
                    <ul class="list-disc list-inside ml-6 mt-2 content-list">
                        <li><strong class="text-white">What does this PR do?</strong> (Brief summary)</li>
                        <li><strong class="text-white">Why is this change necessary?</strong> (Context, problem it solves)</li>
                        <li><strong class="text-white">How was it tested?</strong> (Steps to reproduce, test results)</li>
                        <li><strong class="text-white">Screenshots (if UI changes):</strong></li>
                        <li><strong class="text-white">Related Issues:</strong> (e.g., <code class="language-plaintext">Closes #123</code>, <code class="language-plaintext">Fixes #456</code>)</li>
                    </ul>
                </li>
                <li>Request a review from a maintainer.</li>
            </ul>
            <p class="mb-2"><strong class="text-white">Responding to Reviews:</strong></p>
            <ul class="list-disc list-inside space-y-2 mb-10 content-list">
                <li>Address all reviewer comments promptly, explaining changes or justifying decisions.</li>
                <li>Resolve merge conflicts by rebasing your branch:
                    <pre><code class="language-bash">git fetch upstream
git rebase upstream/main
git push --force-with-lease # Use with caution, only on your feature branch</code></pre>
                </li>
                <li>Request re-review after addressing feedback.</li>
            </ul>

            <h2 class="text-3xl md:text-4xl font-bold mb-6 text-white">
                <span class="text-[var(--color-accent-blue)]">✅</span> Testing Requirements
            </h2>
            <p class="mb-4">All contributions must be thoroughly tested to ensure stability and prevent regressions.</p>
            <ul class="list-disc list-inside space-y-4 mb-10 content-list">
                <li>
                    <strong class="text-white">Unit Tests:</strong>
                    For JavaScript logic, create unit tests using Jest. Tests should cover all new functions, components, and critical logic.
                    <ul class="list-disc list-inside ml-6 mt-2 content-list">
                        <li>Run unit tests: <code class="language-bash">npm test</code></li>
                    </ul>
                </li>
                <li>
                    <strong class="text-white">Integration Tests:</strong>
                    For end-to-end user flows and component interactions, use Cypress. Ensure new features integrate seamlessly with existing parts of the application.
                    <ul class="list-disc list-inside ml-6 mt-2 content-list">
                        <li><strong class="text-white">Setup:</strong> If Cypress is not yet installed or configured in your local environment:
                            <pre><code class="language-bash">npm install cypress --save-dev
npx cypress install # Installs Cypress binaries
npx cypress open   # Opens the Cypress Test Runner</code></pre>
                        </li>
                        <li>Run integration tests: <code class="language-bash">npm run cypress:open</code> (interactive) or <code class="language-bash">npm run cypress:run</code> (headless).</li>
                    </ul>
                </li>
                <li>
                    <strong class="text-white">Manual Testing Checklist:</strong>
                    Before submitting a PR, ensure you have manually checked the following:
                    <ul class="list-disc list-inside ml-6 mt-2 content-list">
                        <li>[ ] <strong class="text-white">Responsiveness:</strong> Test on various screen sizes (mobile, tablet, desktop).</li>
                        <li>[ ] <strong class="text-white">Cross-Browser Compatibility:</strong> Test on Chrome, Firefox, Safari (and Edge if applicable).</li>
                        <li>[ ] <strong class="text-white">Functionality:</strong> All new features work as expected.</li>
                        <li>[ ] <strong class="text-white">Accessibility:</strong> Keyboard navigation, ARIA labels, color contrast (use browser dev tools).</li>
                        <li>[ ] <strong class="text-white">Performance:</strong> No noticeable slowdowns, especially for UI changes. (See Performance Testing below).</li>
                        <li>[ ] <strong class="text-white">Error Handling:</strong> Test edge cases and invalid inputs.</li>
                        <li>[ ] <strong class="text-white">Console Errors:</strong> Check browser console for any errors or warnings.</li>
                    </ul>
                </li>
                <li>
                    <strong class="text-white">Performance Testing:</strong>
                    <ul class="list-disc list-inside ml-6 mt-2 content-list">
                        <li>Use Lighthouse (built into Chrome DevTools) to ensure scores >90 for Performance, Accessibility, and SEO for new or modified pages.</li>
                        <li>Check Core Web Vitals (Largest Contentful Paint (LCP) &lt;2.5s, First Input Delay (FID) &lt;100ms, Cumulative Layout Shift (CLS) &lt;0.1).</li>
                        <li>Include Lighthouse reports (screenshots or JSON) in PRs for UI changes or performance-critical features.</li>
                    </ul>
                </li>
            </ul>

            <h2 class="text-3xl md:text-4xl font-bold mb-6 text-white">
                <span class="text-[var(--color-accent-blue)]">📚</span> Documentation Standards
            </h2>
            <p class="mb-4">Clear and up-to-date documentation is vital for project maintainability.</p>
            <ul class="list-disc list-inside space-y-4 mb-10 content-list">
                <li>
                    <strong class="text-white">README Files:</strong>
                    Every major directory (e.g., <code class="language-plaintext">css/</code>, <code class="language-plaintext">js/</code>, <code class="language-plaintext">en/company/about-us/</code>) should have a <code class="language-plaintext">README.md</code> explaining its purpose, structure, and content management guidelines. Update relevant <code class="language-plaintext">README.md</code> files when adding new features or changing existing structures.
                </li>
                <li>
                    <strong class="text-white">Code Comments:</strong>
                    <ul class="list-disc list-inside ml-6 mt-2 content-list">
                        <li>Use JSDoc for all JavaScript functions, classes, and complex logic to explain purpose, parameters, and return values.</li>
                        <li>Add inline comments for complex or non-obvious code sections.</li>
                        <li>For HTML, use <code class="language-plaintext">&lt;!-- comment --&gt;</code> to explain structural decisions or complex sections.</li>
                        <li>For CSS, use <code class="language-plaintext">/* comment */</code> for sectioning and explaining non-obvious styles.</li>
                    </ul>
                    <p class="mb-2 mt-4"><strong class="text-white">Good Example (JavaScript JSDoc):</strong></p>
                    <pre><code class="language-javascript">/**
 * Calculates the total price of items in a shopping cart.
 * @param {Array&lt;Object&gt;} items - An array of item objects, each with 'price' and 'quantity' properties.
 * @returns {number} The total calculated price.
 */
function calculateTotalPrice(items) {
  let total = 0;
  for (const item of items) {
    total += item.price * item.quantity;
  }
  return total;
}</code></pre>
                    <p class="mb-2"><strong class="text-white">Bad Example (JavaScript - Missing JSDoc, unclear):</strong></p>
                    <pre><code class="language-javascript">function calc(arr) { // What does arr contain? What does it return?
  let t = 0;
  for (const i of arr) {
    t += i.p * i.q; // Unclear property names
  }
  return t;
}</code></pre>
                </li>
            </ul>

            <h2 class="text-3xl md:text-4xl font-bold mb-6 text-white">
                <span class="text-[var(--color-accent-blue)]">📝</span> Issue Reporting
            </h2>
            <p class="mb-4">Found a bug or have an idea for improvement? Please open an issue!</p>
            <h3 class="text-2xl md:text-3xl font-semibold mb-4 text-white/90">Bug Report Template:</h3>
            <p class="mb-4">When reporting a bug, please include:</p>
            <ol class="list-decimal list-inside space-y-2 mb-10 content-list">
                <li><strong class="text-white">Title:</strong> Concise summary of the bug (e.g., <code class="language-plaintext">Bug: Search input not clearing after submission</code>).</li>
                <li><strong class="text-white">Description:</strong> Detailed explanation of the problem.</li>
                <li><strong class="text-white">Steps to Reproduce:</strong> Clear, numbered steps to replicate the bug.</li>
                <li><strong class="text-white">Expected Behavior:</strong> What should have happened.</li>
                <li><strong class="text-white">Actual Behavior:</strong> What actually happened.</li>
                <li><strong class="text-white">Screenshots/Videos (Optional):</strong> Visuals are very helpful.</li>
                <li><strong class="text-white">Environment:</strong> Browser, OS, device, Node.js/npm versions.</li>
            </ol>

            <h3 class="text-2xl md:text-3xl font-semibold mb-4 text-white/90">Feature Request Process:</h3>
            <p class="mb-4">When requesting a new feature:</p>
            <ol class="list-decimal list-inside space-y-2 mb-10 content-list">
                <li><strong class="text-white">Title:</strong> Clear and concise feature title (e.g., <code class="language-plaintext">Feature: Add multilingual support for contact form</code>).</li>
                <li><strong class="text-white">Description:</strong> Detailed explanation of the feature.</li>
                <li><strong class="text-white">Business Case/Problem Solved:</strong> Explain why this feature is valuable to WordsThatSells.Website or its users.</li>
                <li><strong class="text-white">Proposed Solution (Optional):</strong> How you envision the feature being implemented.</li>
                <li><strong class="text-white">User Stories (Optional):</strong> Describe how a user would interact with the feature.</li>
            </ol>

            <h2 class="text-3xl md:text-4xl font-bold mb-6 text-white">
                <span class="text-[var(--color-accent-blue)]">🔍</span> Code Review Checklist for Maintainers
            </h2>
            <p class="mb-4">Maintainers use this checklist when reviewing Pull Requests:</p>
            <ul class="list-none space-y-2 mb-10 content-list">
                <li>[ ] <strong class="text-white">Code Quality:</strong> Adheres to ESLint and Prettier rules.</li>
                <li>[ ] <strong class="text-white">Functionality:</strong> Works as expected, no regressions.</li>
                <li>[ ] <strong class="text-white">Tests:</strong> Adequate unit and integration test coverage.</li>
                <li>[ ] <strong class="text-white">Documentation:</strong> Code comments and relevant <code class="language-plaintext">README.md</code> files updated.</li>
                <li>[ ] <strong class="text-white">Performance:</strong> No negative impact on load times or responsiveness.</li>
                <li>[ ] <strong class="text-white">Accessibility:</strong> WCAG 2.1 AA compliance, keyboard navigation, ARIA.</li>
                <li>[ ] <strong class="text-white">Security:</strong> No new vulnerabilities introduced.</li>
                <li>[ ] <strong class="text-white">Git History:</strong> Clean, conventional commit messages.</li>
                <li>[ ] <strong class="text-white">Clarity:</strong> Code is readable, understandable, and maintainable.</li>
                <li>[ ] <strong class="text-white">Scope:</strong> PR addresses only the intended feature/fix.</li>
            </ul>

            <h2 class="text-3xl md:text-4xl font-bold mb-6 text-white">
                <span class="text-[var(--color-accent-blue)]">📦</span> Release Process and Versioning Strategy
            </h2>
            <p class="mb-4">We follow <a href="https://semver.org/" target="_blank" rel="noopener noreferrer" class="text-[var(--color-accent-blue)] hover:underline">Semantic Versioning (SemVer)</a> for releases: <code class="language-plaintext">MAJOR.MINOR.PATCH</code>.</p>
            <ul class="list-disc list-inside space-y-2 mb-10 content-list">
                <li><strong class="text-white">PATCH:</strong> Bug fixes, minor improvements.</li>
                <li><strong class="text-white">MINOR:</strong> New features, non-breaking changes.</li>
                <li><strong class="text-white">MAJOR:</strong> Breaking changes, significant new functionality.</li>
            </ul>
            <p class="mb-4">Releases are managed by maintainers through our CI/CD pipeline (<code class="language-plaintext">.github/workflows/main.yml</code>).</p>

            <h2 class="text-3xl md:text-4xl font-bold mb-6 text-white">
                <span class="text-[var(--color-accent-blue)]">🌐</span> Multilingual Contributions
            </h2>
            <p class="mb-4">Our website supports multiple languages (<code class="language-plaintext">en/</code>, <code class="language-plaintext">lo/</code>, <code class="language-plaintext">th/</code>, <code class="language-plaintext">fr/</code>). When contributing content or features that impact localized sections, please adhere to these guidelines:</p>
            <ul class="list-disc list-inside space-y-4 mb-10 content-list">
                <li>
                    <strong class="text-white">Content Synchronization:</strong> New content or updates to existing content (e.g., articles, service descriptions) must be synchronized across all relevant language directories.
                </li>
                <li>
                    <strong class="text-white">Translation Quality:</strong>
                    <ul class="list-disc list-inside ml-6 mt-2 content-list">
                        <li>For non-English content, prioritize professional translation or review by a native speaker.</li>
                        <li>Ensure cultural adaptation beyond literal translation (e.g., business practices for <code class="language-plaintext">lo/</code>).</li>
                        <li>Validate Unicode support and correct text direction for scripts like Lao and Thai.</li>
                    </ul>
                </li>
                <li>
                    <strong class="text-white">Translation Workflow:</strong>
                    <ol class="list-decimal list-inside ml-6 mt-2 content-list">
                        <li>Propose new content in English (<code class="language-plaintext">en/</code>) first.</li>
                        <li>Once approved, submit translations for <code class="language-plaintext">lo/</code>, <code class="language-plaintext">th/</code>, or <code class="language-plaintext">fr/</code>.</li>
                        <li>Consider using tools like DeepL or engaging a professional translator for accuracy.</li>
                    </ol>
                </li>
                <li>
                    <strong class="text-white">SEO Considerations:</strong>
                    <ul class="list-disc list-inside ml-6 mt-2 content-list">
                        <li>Ensure <code class="language-plaintext">sitemap.xml</code> is updated to include all new localized URLs.</li>
                        <li>Verify correct <code class="language-plaintext">hreflang</code> tags on relevant pages to signal language and regional targeting to search engines.</li>
                    </ul>
                </li>
            </ul>

            <h2 class="text-3xl md:text-4xl font-bold mb-6 text-white">
                <span class="text-[var(--color-accent-blue)]">📞</span> Contact Information
            </h2>
            <p class="mb-4">If you have any questions or need support, please reach out:</p>
            <ul class="list-disc list-inside space-y-2 mb-10 content-list">
                <li><strong class="text-white">GitHub Issues:</strong> For bugs and feature requests, use the <a href="https://github.com/wordsthatsells/website/issues" target="_blank" rel="noopener noreferrer" class="text-[var(--color-accent-blue)] hover:underline">Issues section</a>.</li>
                <li><strong class="text-white">Email:</strong> For general inquiries or private discussions, contact <a href="mailto:support@wordsthatsells.website" class="text-[var(--color-accent-blue)] hover:underline">support@wordsthatsells.website</a>.</li>
            </ul>

            <h2 class="text-3xl md:text-4xl font-bold mb-6 text-white">
                <span class="text-[var(--color-accent-blue)]">📊</span> Project Badges
            </h2>
            <p class="mb-4">These badges reflect the current status of our project. Please ensure these are up-to-date by integrating with the respective services.</p>
            <div class="flex flex-wrap gap-4 mb-10">
                <!-- Build Status Badge -->
                <a href="https://github.com/wordsthatsells/website/actions/workflows/main.yml" target="_blank" rel="noopener noreferrer" aria-label="Build Status">
                    <img src="https://github.com/wordsthatsells/website/actions/workflows/main.yml/badge.svg" alt="Build Status">
                </a>
                <!-- Code Coverage Badge (Placeholder - replace with actual integration) -->
                <a href="https://codecov.io/gh/wordsthatsells/website" target="_blank" rel="noopener noreferrer" aria-label="Code Coverage">
                    <img src="https://img.shields.io/badge/coverage-not%20set-lightgrey" alt="Code Coverage">
                </a>
                <!-- License Badge -->
                <a href="https://opensource.org/licenses/MIT" target="_blank" rel="noopener noreferrer" aria-label="License">
                    <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT">
                </a>
            </div>

        </div>
    </main>

    <!-- Footer Section -->
    <footer class="relative z-20 glass-dark rounded-t-3xl mx-4 mb-4 mt-8">
        <div class="max-w-7xl mx-auto py-8 px-8">
            <div class="flex flex-col md:flex-row justify-between items-center text-center md:text-left space-y-6 md:space-y-0">
                <div class="text-white/80">
                    &copy; <span id="current-year"></span> WordsThatSells.Website. All rights reserved.
                </div>
                <div class="flex space-x-6">
                    <a href="https://www.instagram.com/wordsthatsells.website.laos/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" class="text-white/70 hover:text-white hover:scale-110 transition-all duration-300">
                        <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4c0 3.2-2.6 5.8-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8C2 4.6 4.6 2 7.8 2zm-.2 2A4 4 0 0 0 4 7.8v8.4c0 2.2 1.8 4 4 4h8.4c2.2 0 4-1.8 4-4V7.8c0-2.2-1.8-4-4-4H7.6zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm6.5-3.5a1.25 1.25 0 1 0 0 2.5 1.25 1.25 0 0 0 0-2.5z"></path></svg>
                    </a>
                    <a href="https://www.linkedin.com/company/wordsthatsells" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" class="text-white/70 hover:text-white hover:scale-110 transition-all duration-300">
                        <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.564c0-1.328-.027-3.044-1.852-3.044-1.853 0-2.136 1.445-2.136 2.95v5.658H9.104V9.29h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.27 2.373 4.27 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.062-2.065 2.062 2.062 0 0 1 2.062-2.065 2.062 2.062 0 0 1 2.063 2.065 2.062 2.062 0 0 1-2.063 2.065zM3.43 9.29H7.24V20.452H3.43V9.29zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.454C23.207 24 24 23.227 24 22.271V1.729C24 .774 23.207 0 22.225 0z"></path></svg>
                    </a>
                    <a href="https://www.facebook.com/wordsthatsells/" target="_blank" rel="noopener noreferrer" aria-label="Facebook" class="text-white/70 hover:text-white hover:scale-110 transition-all duration-300">
                        <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.505 1.492-3.89 3.776-3.89 1.094 0 2.24.195 2.24.195v2.459h-1.242c-1.22 0-1.62.75-1.62 1.488V12h2.773l-.443 2.89h-2.33V22H12c5.523 0 10-4.477 10-10z"></path></svg>
                    </a>
                    <a href="https://x.com/wordsthatsells/" target="_blank" rel="noopener noreferrer" aria-label="X (Twitter)" class="text-white/70 hover:text-white hover:scale-110 transition-all duration-300">
                        <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.13l-6.067-8.52-.773.882 6.184 8.52H9.36L3.92 2.25H.616l7.228 8.26L.053 22.25H6.84l4.71-6.578 1.054 1.204-4.71 6.578h3.308l7.227-8.26L21.947 22.25H15.16l-4.71-6.578-1.054-1.204 4.71 6.578z"></path></svg>
                    </a>
                    <a href="https://www.youtube.com/@wordsthatsells" target="_blank" rel="noopener noreferrer" aria-label="YouTube" class="text-white/70 hover:text-white hover:scale-110 transition-all duration-300">
                        <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0C.997 3.432 0 4.868 0 6.677v10.646c0 1.809.997 3.245 4.385 3.492 3.604.246 11.631.245 15.23 0 3.388-.247 4.385-1.683 4.385-3.492V6.677c0-1.809-.997-3.245-4.385-3.492zM9.998 15.602V8.398l6.002 3.602-6.002 3.602z"></path></svg>
                    </a>
                </div>
            </div>
        </div>
    </footer>

    <script>
        // Dynamically update the copyright year in the footer
        document.getElementById('current-year').textContent = new Date().getFullYear();

        // JavaScript for Mobile Menu Toggle
        const mobileMenuButton = document.getElementById('mobile-menu-button');
        const closeMobileMenuButton = document.getElementById('close-mobile-menu');
        const mobileMenu = document.getElementById('mobile-menu');
        const mobileMenuOverlay = document.getElementById('mobile-menu-overlay');

        function toggleMobileMenu() {
            mobileMenu.classList.toggle('hidden');
            mobileMenu.classList.toggle('open');
            mobileMenuOverlay.classList.toggle('hidden');
            document.body.classList.toggle('overflow-hidden'); // Prevent scrolling on body when menu is open

            if (mobileMenu.classList.contains('open')) {
                closeMobileMenuButton.focus(); // Focus on the close button when menu opens for accessibility
            } else {
                mobileMenuButton.focus(); // Return focus to the open button when menu closes
            }
        }

        mobileMenuButton.addEventListener('click', toggleMobileMenu);
        closeMobileMenuButton.addEventListener('click', toggleMobileMenu);
        mobileMenuOverlay.addEventListener('click', toggleMobileMenu); // Close menu when clicking overlay

        // Keyboard navigation for mobile menu buttons
        mobileMenuButton.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault(); // Prevent default scroll behavior for spacebar
                toggleMobileMenu();
            }
        });
        closeMobileMenuButton.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
                e.preventDefault(); // Prevent default scroll behavior for spacebar/escape
                toggleMobileMenu();
            }
        });

        // Close mobile menu if resized to desktop view
        window.addEventListener('resize', () => {
            if (window.innerWidth >= 768 && mobileMenu.classList.contains('open')) {
                toggleMobileMenu();
            }
        });
    </script>
</body>
</html>
