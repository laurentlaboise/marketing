fonts/README.md - Typography Asset Management and Optimization Guidelines
This document provides comprehensive guidelines for implementing, optimizing, and managing the typography assets used on the WordsThatSells.Website website. Adhering to these standards ensures consistent branding, optimal performance, and enhanced accessibility across all language versions.

Fonts for WordsThatSells.website
Code File in Docs: fonts/README.md

Code File in GitHub: [https://github.com/WordsThatSells/website/tree/main/fonts/README.md](http://github.com/laurentlaboise/marketing/edit/main/fonts/fonts-README.md)

Purpose: Typography asset management and optimization guidelines.

Description: Comprehensive documentation for custom font implementation, loading optimization strategies, fallback font definitions, licensing compliance, and performance best practices for web font loading and rendering.

1. FONT SYSTEM OVERVIEW
The typography system for WordsThatSells.website ensures consistent, accessible, and performant text rendering across multilingual pages (en, lo, th, fr) while aligning with the brand’s modern aesthetic.

1.1. Typography Hierarchy and Usage Guidelines
We use a clear typographic hierarchy to guide users through content and emphasize key information.

Headings (H1-H6): Used for titles, section headers, and prominent marketing copy.

Body Text: Used for paragraphs, long-form content, and general UI elements.

Call-to-Actions (CTAs): Designed to stand out and guide user actions.

1.2. Primary Fonts
Primary Font (Body Text): Inter

Purpose: Highly legible and versatile, ideal for extensive body text, technical content, and user interface elements.

Weight Variations: Light (300), Regular (400), Medium (500), SemiBold (600), Bold (700), ExtraBold (800). Use Regular for standard paragraphs, Medium for emphasis, and SemiBold/Bold for specific UI elements or strong statements.

Usage: Default font for all paragraphs, lists, form inputs, and general UI text.

Secondary Font (Headings): Poppins

Purpose: Modern and impactful, perfect for headlines, marketing copy, and brand messaging.

Weight Variations: SemiBold (600), Bold (700), ExtraBold (800). Use SemiBold for H3-H6, Bold for H1-H2, and ExtraBold for hero headlines or very prominent text.

Usage: Exclusively for all heading tags (H1-H6) and key marketing phrases.

1.3. Typography Scale (defined in styles.css)
Base: 1rem (16px)

Small: 0.875rem (14px) to 1.125rem (18px)

Headings: 1.25rem (20px) to 3.75rem (60px)

Responsive adjustments at md (768px) and lg (1024px) breakpoints.

1.4. Weight Variations and Use Cases
Inter (Variable Font, 300–800):

300 (Light): Subtle text, e.g., captions or secondary information.

400 (Regular): Default body text for paragraphs and UI.

600 (Semi-Bold): Strong emphasis in body text or form labels.

800 (Bold): Highlighted UI elements or strong calls-to-action.

Poppins (Variable Font, 600–800):

600 (Semi-Bold): Default for h3–h6 headings.

700 (Bold): Used for h1–h2 headings for prominence.

800 (Extra-Bold): Hero sections or brand slogans.

Usage Notes:

Use lighter weights for larger text to maintain readability.

Reserve bold weights for emphasis to avoid visual clutter.

1.5. Character Set Support for Multilingual Content
Both fonts support extended Latin, Thai, Lao, and French character sets, aligning with sitemap.xml’s multilingual URLs.

Inter: Includes glyphs for Latin, Thai, and Lao scripts (verified via Google Fonts character set).

Poppins: Supports Latin, Thai, and Lao, with robust diacritic support for French.

Fallback Fonts: System fonts (Arial, sans-serif) ensure compatibility for unsupported scripts.

1.6. Font Pairing Principles and Combinations
Primary Pairing: Inter (body) + Poppins (headings) for a modern, professional contrast.

Principles:

Contrast: Poppins’ rounded, bold style contrasts with Inter’s clean geometry.

Consistency: Both fonts share a modern aesthetic, ensuring brand cohesion.

Readability: Inter’s neutral design enhances long-form text; Poppins adds personality to headings.

Alternative Pairings: Use system fonts (Arial for body, Helvetica for headings) as fallbacks for performance.

2. IMPLEMENTATION
Fonts are implemented via self-hosted files in the fonts/ directory, processed by webpack.config.js’s asset modules and optimized by Gulpfile.js.

2.1. Google Fonts Integration Methods
We primarily use Google Fonts for ease of integration and broad character set support.

Self-Hosted Fonts (Preferred):

Fonts are downloaded from Google Fonts and stored in fonts/ as WOFF2 and WOFF files.

Implemented in styles.css:

@font-face {
  font-family: 'Inter';
  src: url('../fonts/Inter-VariableFont.woff2') format('woff2'),
       url('../fonts/Inter-VariableFont.woff') format('woff');
  font-weight: 300 800;
  font-display: swap;
}

Google Fonts CDN (Fallback for Development):

Use <link> tags in index.html for testing:

<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300..800&family=Poppins:wght@600..800&display=swap" rel="stylesheet">

2.2. Font Display Optimization
Font-Display: Swap:

Ensures text is visible during font loading to prevent FOUT: font-display: swap;

Preload Critical Fonts:

Preload Inter (400, 600) and Poppins (700) in index.html to prioritize above-the-fold text:

<link rel="preload" href="/fonts/Inter-VariableFont.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/Poppins-VariableFont.woff2" as="font" type="font/woff2" crossorigin>

2.3. Fallback Font Stack Definitions
Always define a robust fallback font stack in styles.css to ensure consistent rendering even if custom fonts fail to load.

Inter: font-family: 'Inter', Arial, sans-serif;

Poppins: font-family: 'Poppins', Helvetica, Arial, sans-serif;

Defined in styles.css:

body {
    font-family: var(--font-family-body), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
}
h1, h2, h3, h4, h5, h6 {
    font-family: var(--font-family-heading), "Arial Black", Gadget, sans-serif;
}

2.4. FOUT Prevention
font-display: swap is the primary method for FOUT prevention. Additionally:

Preload: As mentioned above, preload critical fonts.

Critical CSS: Ensure that the CSS defining font families for above-the-fold content is part of the critical CSS, inlined in the HTML.

3. PERFORMANCE OPTIMIZATION
Font files can be significant contributors to page load time. Optimize them to improve Core Web Vitals and overall user experience.

3.1. Font Subsetting for Reduced File Sizes
If only a subset of characters is needed (e.g., Latin characters for English/French, plus specific Lao/Thai characters), subsetting the fonts can drastically reduce file size.

Google Fonts: Offers subsetting options directly in their CDN URLs (e.g., &subset=latin,thai,lao).

Self-Hosting: Use tools like fonttools (Python library) or online font subsetters to create custom subsets.

Example using glyphhanger:

glyphhanger --subset=Inter-VariableFont.ttf --latin --thai --lao --output=fonts/

3.2. Unicode Range Specifications
For self-hosted fonts, use the unicode-range CSS descriptor in @font-face rules to specify which Unicode characters a font supports. This allows the browser to download only the necessary font files for specific scripts.

@font-face {
  font-family: 'LaoFont';
  src: url('LaoFont.woff2') format('woff2');
  unicode-range: U+0E80-0EFF; /* Unicode range for Lao script */
  font-display: swap;
}

3.3. Lazy Loading for Non-Critical Fonts
If certain fonts are only used on specific, non-critical sections of the site (e.g., a special font for a unique heading far down the page), consider lazy loading them via JavaScript after the initial page load.

Example in scripts.js:

// scripts.js
const loadNonCriticalFonts = () => {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/css/non-critical-fonts.css'; // A separate CSS file for non-critical fonts
  document.head.appendChild(link);
};
window.addEventListener('load', loadNonCriticalFonts);

3.4. Caching Strategies and CDN Usage
Self-Hosted Fonts: Configure server-side caching (e.g., via .htaccess or server settings) for font files with long Cache-Control headers (e.g., 1 year).

Example in .htaccess:

<FilesMatch "\.(woff2?|woff)$">
  Header set Cache-Control "max-age=31536000, public"
</FilesMatch>

CDN Usage: Serve fonts via a CDN (configurable in webpack.config.js’s publicPath):

publicPath: 'https://cdn.wordsthatsells.website/'

3.5. Core Web Vitals Impact Considerations
LCP (Largest Contentful Paint): Font loading can block rendering. font-display: swap and preload help mitigate this.

CLS (Cumulative Layout Shift): Ensure font loading doesn't cause layout shifts. font-display: swap is generally good, but preloading and consistent font metrics (e.g., using size-adjust or ascent-override in @font-face) can further prevent shifts.

FCP (First Contentful Paint): Subset fonts and minimize file sizes.

4. ACCESSIBILITY
Ensuring fonts are accessible is crucial for all users, including those with visual impairments or reading difficulties.

4.1. Minimum Font Size Requirements
Body Text: Maintain a minimum font size of 14px (--font-size-sm) for body text to ensure readability.

Headings: 20px+ (--font-size-xl to --font-size-6xl) for prominence.

Responsiveness: Implement responsive font sizing using rem units and media queries to scale text appropriately across devices.

4.2. Line Height and Spacing Guidelines
Line Height: Set line-height for body text between 1.5 and 1.8 for optimal readability.

Paragraph Spacing: Use consistent margin-bottom for paragraphs to provide adequate visual separation.

Letter Spacing: Avoid overly tight or loose letter spacing, as it can hinder readability.

Defined in styles.css:

body { line-height: 1.6; letter-spacing: 0.01em; }
h1, h2, h3, h4, h5, h6 { line-height: 1.2; }
p { margin-bottom: var(--spacing-md); }

4.3. Color Contrast with Background Colors
All text must have a sufficient color contrast ratio against its background to meet WCAG (Web Content Accessibility Guidelines) 2.1 AA standards.

Normal Text: Minimum contrast ratio of 4.5:1.

Large Text (18pt/24px or 14pt/18.66px bold): Minimum contrast ratio of 3:1.

Tools: Use online contrast checkers (e.g., WebAIM Contrast Checker) during design and development.

Example:

Text: --color-charcoal (#4A5568) on --color-white (#FFFFFF) → Contrast ratio: 7.2:1 (passes).

4.4. Dyslexia-Friendly Considerations
While we don't use specific "dyslexia fonts," we ensure our chosen fonts are highly readable:

Clear Letterforms: Inter and Poppins have distinct letterforms that are less prone to confusion.

Adequate Spacing: Ensure sufficient letter and word spacing.

User Preferences: Respect user browser settings for font preferences.

Avoid Justified Text: To prevent uneven spacing that can hinder readability for some users.

4.5. High Contrast Mode Compatibility
Ensure the website remains usable and legible in high contrast modes (e.g., Windows High Contrast Mode).

Avoid relying solely on color: Use borders, underlines, or icons to convey information that might be lost if colors are overridden.

Use forced-colors media query: Adjust styles specifically for forced colors mode if necessary (as seen in styles.css).

@media (forced-colors: active) {
  body { color: CanvasText; background: Canvas; } /* System colors */
}

5. LICENSING
Understanding and complying with font licenses is critical for legal use.

5.1. Google Fonts License Compliance
Open Font License (OFL): Most Google Fonts, including Inter and Poppins, are released under the Open Font License (OFL). This permits free use, study, modification, and distribution, even for commercial purposes.

Requirements: No attribution required for web usage.

License File: Include the license file (OFL.txt) in the fonts/ directory for each font:

cp Inter-OFL.txt fonts/
cp Poppins-OFL.txt fonts/

5.2. Commercial Usage Permissions
Confirm that all fonts used are licensed for commercial use, which is essential for WordsThatSells.Website as a business.

5.3. Distribution and Modification Rights
Understand the rights to distribute font files (e.g., self-hosting) and modify them (e.g., subsetting). OFL generally permits these actions.

5.4. Third-Party Font Legal Considerations
If any third-party (non-Google) fonts are introduced, thoroughly review their EULAs (End User License Agreements) for:

Webfont licensing: Specific licenses for web use.

Self-hosting restrictions: Whether self-hosting is permitted.

Traffic limits: Any restrictions based on website traffic.

Attribution: Any specific legal notices required.

Tools: Verify third-party fonts via FontSquirrel Matcherator or WhatTheFont.

6. TROUBLESHOOTING
This section provides guidance for common font-related issues.

6.1. Common Font Loading Issues
Issue: Fonts fail to load.

Solution: Check file paths in @font-face rules and ensure WOFF2/WOFF files exist in dist/fonts/ after build.

Issue: CORS Issues.

Solution: Ensure Access-Control-Allow-Origin headers are correctly configured on your server if fonts are hosted on a different domain/CDN.

Issue: Network Failures.

Solution: Implement robust fallback font stacks.

6.2. Cross-Browser Compatibility Problems
Issue: Fonts not rendering in older browsers (e.g., IE11).

Solution: Include WOFF fallbacks and test with BrowserStack.

Issue: Variable fonts not supported (e.g., Safari < 11).

Solution: Provide static font files as fallbacks (e.g., Inter-Regular.woff for font-weight: 400).

@font-face {
  font-family: 'Inter';
  src: url('../fonts/Inter-Regular.woff') format('woff');
  font-weight: 400; /* Specific static weight */
}

Issue: @font-face Syntax.

Solution: Use a consistent and widely supported @font-face syntax.

Issue: Browser-Specific Bugs.

Solution: Test font rendering on major browsers (Chrome, Firefox, Safari, Edge) and common mobile devices.

6.3. Performance Debugging Techniques
Tool: Browser DevTools.

Solution: Use the "Network" tab to monitor font loading times and "Performance" tab to identify rendering-blocking fonts.

Tool: Lighthouse.

Solution: Run Lighthouse audits to identify font-related performance issues (e.g., large font files, FOUT).

Tool: WebPageTest.

Solution: Analyze waterfall charts for font loading sequence.

6.4. Fallback Font Testing Procedures
Test: Temporarily disable @font-face rules in browser dev tools to verify how fallback fonts (Arial, Helvetica) render.

Tool: Lighthouse.

Solution: Use Lighthouse to check CLS with fallbacks.

Test: Simulate slow networks using network throttling in dev tools to test FOUT and font loading behavior.

6.5. Mobile Device Considerations
Issue: Font rendering issues on low-end Android devices.

Solution: Use font-display: swap and test with real devices via BrowserStack.

Issue: Large font files slow down mobile loading.

Solution: Subset fonts for Latin, Thai, and Lao only.

Issue: Touch Target Size.

Solution: Ensure text is large enough to be legible on small screens without zooming.

Issue: Network Conditions.

Solution: Account for varying network speeds in Southeast Asia.

7. Usage Instructions
7.1. Install Fonts
Download Inter and Poppins from Google Fonts or use provided files in fonts/.

Run npm run build to process fonts via Webpack/Gulp.

7.2. Test Fonts
Use npm run start to preview with Webpack dev server.

Verify rendering with axe DevTools for accessibility.

7.3. Optimize Fonts
Run glyphhanger for subsetting:

glyphhanger --subset=fonts/Inter-VariableFont.ttf --latin --thai --lao --output=fonts/

7.4. Deploy
Ensure dist/fonts/ includes WOFF2/WOFF files and OFL.txt for each font.

Configure CDN caching in webpack.config.js’s publicPath.

8. Additional Notes
Fonts are processed by webpack.config.js’s asset modules:

{
  test: /\.(woff|woff2)$/i,
  type: 'asset/resource',
  generator: { filename: 'fonts/[name].[hash][ext]' }
}

Gulpfile.js handles font copying if not processed by Webpack.

Regularly audit fonts with Lighthouse to ensure Core Web Vitals compliance.

For multilingual additions, verify character support with Google Fonts’ glyph explorer.
