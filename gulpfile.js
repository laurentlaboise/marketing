// Gulpfile.js for WordsThatSells.website
// This file automates development and build tasks, ensuring code quality,
// performance optimization, and streamlined deployment.

// Prerequisites:
// - Node.js (v18+) and npm (v9+) installed.
// - Install Gulp CLI globally: `npm install -g gulp-cli`
// - Install project dependencies: `npm install` (from package.json)
// - Ensure .browserslistrc, .eslintrc, .prettierrc are configured in project root.

// Common Commands:
// - `gulp`: Run development server with live reload (default task)
// - `NODE_ENV=production gulp build`: Build for production with optimizations
// - `gulp deploy`: Build and deploy to Netlify (configure Netlify CLI)
// - `gulp clean`: Clean build directories
// - `gulp css`: Process CSS files
// - `gulp js`: Process JavaScript files (lint, format, transpile, minify)
// - `gulp images`: Optimize images and generate WebP
// - `gulp html`: Process HTML files
// - `gulp generateSitemap`: Generate sitemap.xml
// - `gulp validateSchema`: Validate schema.json

// --- 1. Gulp and Plugin Imports ---
const { src, dest, watch, series, parallel } = require('gulp');
const del = require('del'); // For cleaning directories
const sass = require('gulp-sass')(require('sass')); // For SCSS preprocessing (if used, otherwise just PostCSS)
const postcss = require('gulp-postcss'); // For PostCSS processing
const autoprefixer = require('autoprefixer'); // For adding vendor prefixes
const cssnano = require('cssnano'); // For CSS minification
const uglify = require('gulp-uglify'); // For JavaScript minification
const babel = require('gulp-babel'); // For ES6+ transpilation
const imagemin = require('gulp-imagemin'); // For image optimization
const webp = require('gulp-webp'); // For WebP image conversion
const htmlmin = require('gulp-htmlmin'); // For HTML minification
const sourcemaps = require('gulp-sourcemaps'); // For sourcemap generation
const browserSync = require('browser-sync').create(); // For live-reloading dev server
const eslint = require('gulp-eslint'); // For ESLint integration
const prettier = require('gulp-prettier'); // For Prettier integration
const critical = require('critical'); // For critical CSS extraction
const workboxBuild = require('workbox-build'); // For Service Worker generation
const exec = require('child_process').exec; // For running shell commands (e.g., Webpack, schema validation)
const rename = require('gulp-rename'); // For renaming files (e.g., .min.css)
const plumber = require('gulp-plumber'); // For robust error handling in pipes
const sitemap = require('gulp-sitemap'); // For sitemap generation

// --- 2. Configuration: Paths and Environment ---
const isProduction = process.env.NODE_ENV === 'production';

const paths = {
    src: {
        html: 'index.html', // Root index.html for language router
        htmlPages: ['en/**/*.html', 'lo/**/*.html', 'th/**/*.html', 'fr/**/*.html', '!index.html', '!404.html'], // All content HTML pages
        css: 'css/styles.css', // Main CSS entry point
        js: 'js/scripts.js', // Main JS entry point (for Gulp-specific tasks)
        images: 'images/**/*.{jpg,jpeg,png,gif,svg}', // All common image formats
        fonts: 'fonts/**/*.{woff,woff2,ttf,otf,eot}', // All common font formats
        static: ['favicon.ico', 'CNAME', 'robots.txt', 'manifest.json', '404.html'], // Static files to copy directly
        // Note: sitemap.xml and schema.json are now dynamically generated or validated
    },
    dist: {
        base: 'dist/',
        css: 'dist/css/',
        js: 'dist/js/',
        images: 'dist/images/',
        fonts: 'dist/fonts/',
        root: 'dist/', // For root-level files like index.html, CNAME, robots.txt
    },
    temp: '.tmp/', // Temporary directory for intermediate files
};

// Browser list for Autoprefixer (from .browserslistrc or package.json's browserslist field)
const browsers = [
    'last 2 versions',
    '> 1%',
    'not dead',
    'Firefox ESR',
    'Opera 12.1'
];

// --- 3. Gulp Tasks ---

// Task: Clean build directories
function clean() {
    return del([paths.dist.base, paths.temp]);
}

// Task: Process CSS (Sass, PostCSS, Autoprefixer, Minification, Critical CSS)
function css() {
    const plugins = [
        autoprefixer({ overrideBrowserslist: browsers }),
        // Only minify CSS in production
        isProduction && cssnano()
    ].filter(Boolean); // Filter out false values (i.e., cssnano in dev)

    return src(paths.src.css)
        .pipe(plumber()) // Prevent Gulp from crashing on errors
        .pipe(sourcemaps.init()) // Initialize sourcemaps
        .pipe(sass().on('error', sass.logError)) // Compile Sass (if you use SCSS)
        .pipe(postcss(plugins)) // Apply PostCSS plugins
        .pipe(rename({ suffix: '.min' })) // Add .min suffix for minified CSS
        .pipe(sourcemaps.write('.')) // Write sourcemaps to the same directory
        .pipe(dest(paths.dist.css))
        .pipe(browserSync.stream()); // Inject CSS changes into browser
}

// Task: Webpack Build (for complex JS bundling)
// This task will execute Webpack, which handles bundling, transpilation, and minification
// for main application JavaScript.
function webpackBuild(cb) {
    console.log('Running Webpack build...');
    // Execute Webpack CLI command. Adjust if your webpack.config.js is not in the root.
    exec('npx webpack --config webpack.config.js --mode ' + (isProduction ? 'production' : 'development'), (err, stdout, stderr) => {
        if (stdout) process.stdout.write(stdout);
        if (stderr) process.stderr.write(stderr);
        cb(err); // Pass error to Gulp if Webpack fails
    });
}

// Task: Process JavaScript (ESLint, Prettier)
// This task now primarily handles linting and formatting of source JS files.
// The actual bundling and minification for `js/scripts.js` is handled by Webpack.
function js() {
    return src(paths.src.js)
        .pipe(plumber()) // Prevent Gulp from crashing on errors
        .pipe(eslint()) // Run ESLint for code quality
        .pipe(eslint.format()) // Format ESLint results
        .pipe(eslint.failAfterError()) // Fail task if ESLint errors are found
        .pipe(prettier({
            // Ensure Prettier uses project config from .prettierrc
        }))
        // No Babel or Uglify here, as Webpack handles the main bundling and minification.
        // If you have other utility JS files not bundled by Webpack that need processing,
        // you might add babel/uglify here and adjust paths.
        .pipe(dest('js/')) // Write formatted JS back to source or a temp folder
        .pipe(browserSync.stream());
}

// Task: Optimize Images and generate WebP
function images() {
    return src(paths.src.images)
        .pipe(plumber())
        .pipe(imagemin([
            imagemin.gifsicle({ interlaced: true }),
            imagemin.mozjpeg({ quality: 75, progressive: true }),
            imagemin.optipng({ optimizationLevel: 5 }),
            imagemin.svgo({
                plugins: [
                    { removeViewBox: true },
                    { cleanupIDs: false }
                ]
            })
        ]))
        .pipe(dest(paths.dist.images)) // Output optimized original formats
        .pipe(webp()) // Convert to WebP
        .pipe(dest(paths.dist.images)) // Output WebP variants
        .pipe(browserSync.stream());
}

// Task: Copy and optimize fonts
function fonts() {
    return src(paths.src.fonts)
        .pipe(dest(paths.dist.fonts))
        .pipe(browserSync.stream());
}

// Task: Process HTML (minify, inject assets, critical CSS)
function html() {
    return src([paths.src.html, ...paths.src.htmlPages]) // Include root index.html and all language pages
        .pipe(plumber())
        .pipe(isProduction ? htmlmin({
            collapseWhitespace: true,
            removeComments: true,
            minifyCSS: true,
            minifyJS: true
        }) : dest(paths.dist.root)) // Minify HTML in production
        .pipe(dest(paths.dist.root))
        .pipe(browserSync.stream());
}

// Task: Extract Critical CSS and inline it into HTML
// This should run AFTER CSS and HTML tasks, and before final HTML output.
function criticalCss() {
    return src(paths.dist.root + '**/*.html')
        .pipe(plumber())
        .pipe(critical.stream({
            base: paths.dist.root,
            inline: true, // Inline critical CSS into HTML
            css: [paths.dist.css + 'styles.min.css'], // Path to your minified CSS
            dimensions: [
                { width: 320, height: 480 }, // Small mobile
                { width: 375, height: 667 }, // iPhone
                { width: 768, height: 1024 }, // Tablet
                { width: 1200, height: 900 }, // Desktop
                { width: 1920, height: 1080 } // Large desktop
            ],
            // Uncomment if you want to extract and save critical CSS to a file
            // dest: 'critical.css'
        }))
        .pipe(dest(paths.dist.root));
}

// Task: Generate Service Worker using Workbox
function generateServiceWorker() {
    // This task will generate a service worker based on your dist folder content.
    // Ensure your manifest.json is correctly configured and icons are present.
    return workboxBuild.generateSW({
        cacheId: 'words-that-sells-pwa',
        globDirectory: paths.dist.base,
        globPatterns: [
            '**/*.{html,css,js,png,jpg,jpeg,svg,webp,woff,woff2,ttf,eot,json}'
        ],
        swDest: `${paths.dist.base}sw.js`,
        clientsClaim: true,
        skipWaiting: true,
        // Define runtime caching strategies for different asset types
        runtimeCaching: [
            {
                urlPattern: /\.(?:html)$/,
                handler: 'NetworkFirst', // Prioritize network, fallback to cache
                options: {
                    cacheName: 'html-cache',
                    expiration: {
                        maxEntries: 50,
                        maxAgeSeconds: 24 * 60 * 60 // 1 Day
                    }
                }
            },
            {
                // Example for API calls, adjust URL pattern to your actual API endpoints
                urlPattern: /^https:\/\/wordsthatsells\.website\/api\//,
                handler: 'NetworkFirst',
                options: {
                    cacheName: 'api-cache',
                    expiration: {
                        maxEntries: 20,
                        maxAgeSeconds: 24 * 60 * 60 // 1 Day
                    }
                }
            },
            {
                urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
                handler: 'CacheFirst',
                options: {
                    cacheName: 'images-cache',
                    expiration: {
                        maxEntries: 50,
                        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
                    },
                },
            },
            {
                urlPattern: /\.(?:css|js)$/,
                handler: 'StaleWhileRevalidate',
                options: {
                    cacheName: 'static-resources-cache',
                    expiration: {
                        maxEntries: 50,
                        maxAgeSeconds: 7 * 24 * 60 * 60, // 7 Days
                    },
                },
            },
            {
                urlPattern: /https:\/\/fonts\.googleapis\.com\//,
                handler: 'StaleWhileRevalidate',
                options: {
                    cacheName: 'google-fonts-stylesheets',
                },
            },
            {
                urlPattern: /https:\/\/fonts\.gstatic\.com\//,
                handler: 'CacheFirst',
                options: {
                    cacheName: 'google-fonts-webfonts',
                    cacheableResponse: {
                        statuses: [0, 200],
                    },
                    expiration: {
                        maxEntries: 30,
                        maxAgeSeconds: 365 * 24 * 60 * 60, // 1 Year
                    },
                },
            },
        ],
    }).then(({ warnings }) => {
        // Any warnings from workbox-build will be logged.
        if (warnings.length > 0) {
            console.warn('Workbox warnings:', warnings.join('\n'));
        }
        console.log('Service worker generation completed.');
    }).catch((error) => {
        console.error('Service worker generation failed:', error);
    });
}

// Task: Copy static files (favicon, CNAME, robots.txt, manifest.json, 404.html)
function copyStatic() {
    return src(paths.src.static)
        .pipe(dest(paths.dist.root))
        .pipe(browserSync.stream());
}

// Task: Sitemap Generation
// This task dynamically generates sitemap.xml based on HTML files in dist/.
function generateSitemap() {
    return src([paths.dist.root + '**/*.html', `!${paths.dist.root}404.html`], {
        read: false // Don't read file contents, just path
    })
    .pipe(plumber())
    .pipe(sitemap({
        siteUrl: 'https://wordsthatsells.website',
        // Dynamic changefreq and priority based on URL patterns
        changefreq: 'weekly',
        priority: url => {
            if (url.includes('/en/index.html') || url === 'https://wordsthatsells.website/en/') return 1.0; // Homepage
            if (url.includes('/digital-marketing-services/')) return 0.9; // Main services
            if (url.includes('/company/')) return 0.8; // Company pages
            if (url.includes('/resources/')) return 0.7; // Resources
            if (url.includes('/articles/')) return 0.6; // Articles
            return 0.5; // Default
        },
        // Hreflang mappings for multilingual pages
        mappings: [
            // Example for main language pages
            {
                url: 'https://wordsthatsells.website/en/',
                alternates: [
                    { lang: 'lo', url: 'https://wordsthatsells.website/lo/' },
                    { lang: 'th', url: 'https://wordsthatsells.website/th/' },
                    { lang: 'fr', url: 'https://wordsthatsells.website/fr/' }
                ]
            },
            // Add similar mappings for other key multilingual pages
            // Example for a service page:
            {
                url: 'https://wordsthatsells.website/en/digital-marketing-services/',
                alternates: [
                    { lang: 'lo', url: 'https://wordsthatsells.website/lo/digital-marketing-services/' },
                    { lang: 'th', url: 'https://wordsthatsells.website/th/digital-marketing-services/' },
                    { lang: 'fr', url: 'https://wordsthatsells.website/fr/digital-marketing-services/' }
                ]
            }
            // ... more mappings as needed for all multilingual pages
        ],
        // You can also add custom lastmod dates if your CMS provides them
        // lastmod: file => file.stat.mtime.toISOString().split('T')[0]
    }))
    .pipe(dest(paths.dist.root));
}

// Task: Schema Validation (using an external CLI tool for schema.json)
function validateSchema(cb) {
    console.log('Running schema validation for schema.json...');
    // This assumes you have 'schema-org-validator' or a similar tool installed globally or locally
    // e.g., `npm install -g schema-org-validator` or `npm install --save-dev schema-org-validator`
    exec('npx schema-org-validator schema.json', (err, stdout, stderr) => {
        if (stdout) process.stdout.write(stdout);
        if (stderr) process.stderr.write(stderr);
        if (err) {
            console.error('Schema validation failed!');
            return cb(err); // Indicate failure to Gulp
        }
        console.log('Schema validated successfully.');
        src('schema.json') // Copy schema.json to dist after validation
            .pipe(dest(paths.dist.root));
        cb();
    });
}

// Task: Development server with live reload
function serve(cb) {
    browserSync.init({
        server: {
            baseDir: paths.dist.base // Serve from the 'dist' directory
        },
        port: process.env.PORT || 3000, // Use environment variable or default to 3000
        open: false // Don't open browser automatically
    });
    cb();
}

// Task: Watch for file changes
function watchFiles() {
    watch(paths.src.css, series(css));
    // Watch JS source, then run webpackBuild to re-bundle, and js to lint/format
    watch(paths.src.js, series(webpackBuild, js));
    watch(paths.src.images, series(images));
    watch(paths.src.fonts, series(fonts));
    // Watch all HTML files including root and language subdirectories
    watch([paths.src.html, ...paths.src.htmlPages], series(html));
    watch(paths.src.static, series(copyStatic));
    // Watch for changes in sitemap.xml or schema.json if they are manually updated
    // (though generateSitemap and validateSchema now handle their own copying)
    watch('sitemap.xml', series(generateSitemap));
    watch('schema.json', series(validateSchema));
}

// --- 4. Gulp Commands (Exports) ---

// Default task (development)
exports.default = series(
    clean,
    parallel(css, series(webpackBuild, js), images, fonts, html, copyStatic), // Run webpackBuild and js in series
    generateSitemap, // Ensure sitemap is generated
    validateSchema,   // Ensure schema is validated
    serve,
    watchFiles
);

// Build task (production)
exports.build = series(
    clean,
    parallel(css, series(webpackBuild, js), images, fonts, html, copyStatic), // Run webpackBuild and js in series
    criticalCss, // Inline critical CSS for production
    generateServiceWorker, // Generate service worker for PWA
    generateSitemap, // Generate sitemap for production
    validateSchema // Validate schema for production
);

// Deploy task (example for Netlify deployment)
// Requires Netlify CLI: `npm install -g netlify-cli` and `netlify login`
function deploy(cb) {
    console.log('Running pre-deployment checks and initiating Netlify deployment...');
    // Ensure build is run before deployment
    series(exports.build, (buildCb) => {
        if (buildCb) return buildCb(); // If build failed, stop deployment
        exec('npx netlify deploy --prod --dir=dist', (err, stdout, stderr) => {
            if (stdout) process.stdout.write(stdout);
            if (stderr) process.stderr.write(stderr);
            if (err) {
                console.error('Netlify deployment failed!', err);
                return cb(err);
            }
            console.log('Netlify deployment completed successfully.');
            cb();
        });
    })();
}
exports.deploy = deploy;

// Individual tasks for specific needs
exports.clean = clean;
exports.css = css;
exports.js = series(webpackBuild, js); // Export js task to include webpack build
exports.images = images;
exports.fonts = fonts;
exports.html = html;
exports.serve = serve;
exports.watch = watchFiles;
exports.criticalCss = criticalCss;
exports.generateServiceWorker = generateServiceWorker;
exports.generateSitemap = generateSitemap;
exports.validateSchema = validateSchema;
exports.copyStatic = copyStatic;

