Contributing to Words That Sells Website
We welcome contributions from everyone! Whether you're a seasoned developer, a budding enthusiast, or simply a user with a great idea, your input helps make the Words That Sells website better. This document outlines the guidelines for contributing to ensure a smooth and collaborative process.

🌟 Our Contribution Philosophy
At Words That Sells, we believe in:

Collaboration: Working together to build a robust and high-quality platform.

Quality: Adhering to high standards for code, documentation, and user experience.

Innovation: Embracing new ideas and technologies to enhance our AI-powered marketing solutions.

Clarity: Ensuring all contributions are well-documented and easy to understand.

🚀 Getting Started
To contribute to the Words That Sells website, follow these steps:

1. Project Setup
Fork the Repository:
Navigate to the Words That Sells GitHub repository and click the "Fork" button. This creates a copy of the repository under your GitHub account.

Clone Your Fork:
Clone your forked repository to your local machine:

git clone https://github.com/YOUR_USERNAME/wordsthatsells.website.git
cd wordsthatsells.website

Install Dependencies:
Our project uses Node.js and npm for dependency management. Ensure you have Node.js (v18+) and npm (v9+) installed.

npm install

This command will install all necessary project and development dependencies defined in package.json.

Set Up Git Remotes:
Add the original Words That Sells repository as an "upstream" remote:

git remote add upstream https://github.com/wordsthatsells/website.git

You can verify your remotes with git remote -v.

Launch Development Server:
To start the local development server with hot-reloading:

npm start

This will typically open the site in your browser at http://localhost:3000 (or similar).

2. Code Style Guidelines
We maintain a consistent code style across the project using automated tools.

ESLint (.eslintrc):
Our JavaScript code adheres to strict quality and style rules defined in .eslintrc. This includes rules for ES6+ syntax, accessibility (eslint-plugin-jsx-a11y), performance, and JSDoc comments.

To lint your code manually: npm run lint

ESLint is integrated into our pre-commit hooks to ensure compliance.

Prettier (.prettierrc):
We use Prettier for automated code formatting across HTML, CSS, JavaScript, JSON, and Markdown files. It ensures consistent indentation (2 spaces), single quotes, trailing commas (all), and a line length of 100 characters.

To format your code manually: npm run format

Prettier is also integrated into our pre-commit hooks.

EditorConfig (.editorconfig):
For cross-editor consistency, we use .editorconfig to define basic formatting rules like UTF-8 encoding, LF line endings, and 2-space indentation. Most modern IDEs and editors have built-in support or plugins for EditorConfig.

3. Git Workflow
We follow a feature branch workflow for all contributions.

Create a Feature Branch:
Always create a new branch for your feature or bug fix:

git checkout main
git pull upstream main # Sync with the latest upstream main
git checkout -b feature/your-feature-name # For new features
# OR
git checkout -b bugfix/issue-description # For bug fixes

Commit Message Format:
We use a conventional commit message format to ensure a clear and readable Git history.

Format: <type>(<scope>): <subject>

Types: feat (new feature), fix (bug fix), docs (documentation), style (code style, no functional changes), refactor (code refactoring), test (adding tests), chore (build process, auxiliary tools, libraries).

Scope (Optional): The part of the codebase affected (e.g., header, auth, 404-page, sitemap).

Subject: A brief, imperative description (max 50 chars).

Body (Optional): More detailed explanation.

Footer (Optional): References to issues (e.g., Closes #123).

Good Examples:

feat(homepage): add AI-powered growth section
fix(404): correct search input placeholder color
docs(contributing): update git workflow section

Bad Examples:

fixed bug
updates
Added new feature for users

Push Your Branch:

git push origin feature/your-feature-name

Create a Pull Request (PR):

Go to your forked repository on GitHub and click "Compare & pull request".

Title: Use the conventional commit format (e.g., feat(services): implement AI copywriting section).

Description:

What does this PR do? (Brief summary)

Why is this change necessary? (Context, problem it solves)

How was it tested? (Steps to reproduce, test results)

Screenshots (if UI changes):

Related Issues: (e.g., Closes #123, Fixes #456)

Request a review from a maintainer.

Responding to Reviews:

Address all reviewer comments promptly, explaining changes or justifying decisions.

Resolve merge conflicts by rebasing your branch:

git fetch upstream
git rebase upstream/main
git push --force-with-lease # Use with caution, only on your feature branch

Request re-review after addressing feedback.

4. Testing Requirements
All contributions must be thoroughly tested to ensure stability and prevent regressions.

Unit Tests:

For JavaScript logic, create unit tests using Jest.

Tests should cover all new functions, components, and critical logic.

Run unit tests: npm test

Integration Tests:

For end-to-end user flows and component interactions, use Cypress.

Ensure new features integrate seamlessly with existing parts of the application.

Setup: If Cypress is not yet installed or configured in your local environment:

npm install cypress --save-dev
npx cypress install # Installs Cypress binaries
npx cypress open   # Opens the Cypress Test Runner

Run integration tests: npm run cypress:open (interactive) or npm run cypress:run (headless).

Manual Testing Checklist:
Before submitting a PR, ensure you have manually checked the following:

[ ] Responsiveness: Test on various screen sizes (mobile, tablet, desktop).

[ ] Cross-Browser Compatibility: Test on Chrome, Firefox, Safari (and Edge if applicable).

[ ] Functionality: All new features work as expected.

[ ] Accessibility: Keyboard navigation, ARIA labels, color contrast (use browser dev tools).

[ ] Performance: No noticeable slowdowns, especially for UI changes. (See Performance Testing below).

[ ] Error Handling: Test edge cases and invalid inputs.

[ ] Console Errors: Check browser console for any errors or warnings.

Performance Testing:

Use Lighthouse (built into Chrome DevTools) to ensure scores >90 for Performance, Accessibility, and SEO for new or modified pages.

Check Core Web Vitals (Largest Contentful Paint (LCP) <2.5s, First Input Delay (FID) <100ms, Cumulative Layout Shift (CLS) <0.1).

Include Lighthouse reports (screenshots or JSON) in PRs for UI changes or performance-critical features.

5. Documentation Standards
Clear and up-to-date documentation is vital for project maintainability.

README Files:

Every major directory (e.g., css/, js/, en/company/about-us/) should have a README.md explaining its purpose, structure, and content management guidelines.

Update relevant README.md files when adding new features or changing existing structures.

Code Comments:

Use JSDoc for all JavaScript functions, classes, and complex logic to explain purpose, parameters, and return values.

Add inline comments for complex or non-obvious code sections.

For HTML, use <!-- comment --> to explain structural decisions or complex sections.

For CSS, use /* comment */ for sectioning and explaining non-obvious styles.

Good Example (JavaScript JSDoc):

/**
 * Calculates the total price of items in a shopping cart.
 * @param {Array<Object>} items - An array of item objects, each with 'price' and 'quantity' properties.
 * @returns {number} The total calculated price.
 */
function calculateTotalPrice(items) {
  let total = 0;
  for (const item of items) {
    total += item.price * item.quantity;
  }
  return total;
}

Bad Example (JavaScript - Missing JSDoc, unclear):

function calc(arr) { // What does arr contain? What does it return?
  let t = 0;
  for (const i of arr) {
    t += i.p * i.q; // Unclear property names
  }
  return t;
}

6. Issue Reporting
Found a bug or have an idea for improvement? Please open an issue!

Bug Report Template:
When reporting a bug, please include:

Title: Concise summary of the bug (e.g., Bug: Search input not clearing after submission).

Description: Detailed explanation of the problem.

Steps to Reproduce: Clear, numbered steps to replicate the bug.

Expected Behavior: What should have happened.

Actual Behavior: What actually happened.

Screenshots/Videos (Optional): Visuals are very helpful.

Environment: Browser, OS, device, Node.js/npm versions.

Feature Request Process:
When requesting a new feature:

Title: Clear and concise feature title (e.g., Feature: Add multilingual support for contact form).

Description: Detailed explanation of the feature.

Business Case/Problem Solved: Explain why this feature is valuable to Words That Sells or its users.

Proposed Solution (Optional): How you envision the feature being implemented.

User Stories (Optional): Describe how a user would interact with the feature.

7. Code Review Checklist for Maintainers
Maintainers use this checklist when reviewing Pull Requests:

[ ] Code Quality: Adheres to ESLint and Prettier rules.

[ ] Functionality: Works as expected, no regressions.

[ ] Tests: Adequate unit and integration test coverage.

[ ] Documentation: Code comments and relevant README.md files updated.

[ ] Performance: No negative impact on load times or responsiveness.

[ ] Accessibility: WCAG 2.1 AA compliance, keyboard navigation, ARIA.

[ ] Security: No new vulnerabilities introduced.

[ ] Git History: Clean, conventional commit messages.

[ ] Clarity: Code is readable, understandable, and maintainable.

[ ] Scope: PR addresses only the intended feature/fix.

8. Release Process and Versioning Strategy
We follow Semantic Versioning (SemVer) for releases: MAJOR.MINOR.PATCH.

PATCH: Bug fixes, minor improvements.

MINOR: New features, non-breaking changes.

MAJOR: Breaking changes, significant new functionality.

Releases are managed by maintainers through our CI/CD pipeline (.github/workflows/main.yml).

9. Multilingual Contributions
Our website supports multiple languages (en/, lo/, th/, fr/). When contributing content or features that impact localized sections, please adhere to these guidelines:

Content Synchronization: New content or updates to existing content (e.g., articles, service descriptions) must be synchronized across all relevant language directories.

Translation Quality:

For non-English content, prioritize professional translation or review by a native speaker.

Ensure cultural adaptation beyond literal translation (e.g., business practices for lo/).

Validate Unicode support and correct text direction for scripts like Lao and Thai.

Translation Workflow:

Propose new content in English (en/) first.

Once approved, submit translations for lo/, th/, or fr/.

Consider using tools like DeepL or engaging a professional translator for accuracy.

SEO Considerations:

Ensure sitemap.xml is updated to include all new localized URLs.

Verify correct hreflang tags on relevant pages to signal language and regional targeting to search engines.

10. Contact Information
If you have any questions or need support, please reach out:

GitHub Issues: For bugs and feature requests, use the Issues section.

Email: For general inquiries or private discussions, contact support@wordsthatsells.website.

📊 Project Badges
These badges reflect the current status of our project. Please ensure these are up-to-date by integrating with the respective services.

<!-- Replace with actual code coverage badge once integrated, e.g., Codecov or Coveralls -->

<!-- Example:  -->
