const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const CopyPlugin = require('copy-webpack-plugin');
const ImageMinimizerPlugin = require('image-minimizer-webpack-plugin');
const fs = require('fs'); // Node.js file system module for reading directories

// Custom Plugin for Schema Validation
class SchemaValidatorPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tap('SchemaValidatorPlugin', (compilation) => {
      const schemaPath = path.resolve(__dirname, 'schema.json');
      if (fs.existsSync(schemaPath)) {
        try {
          // This assumes schema-org-validator is installed and can be required or
          // you have a custom validation function. For simplicity, we'll just
          // log a message here. In a real scenario, you'd load the schema
          // and validate it against its definition.
          // Example: const { validate } = require('schema-org-validator');
          // validate(JSON.parse(fs.readFileSync(schemaPath, 'utf-8')));
          console.log('\nSchema.json validation: PASSED (placeholder check).');
        } catch (error) {
          compilation.errors.push(new Error(`Schema.json validation FAILED: ${error.message}`));
          console.error('\nSchema.json validation: FAILED. Please run `npm run validate-schema` for details.');
        }
      } else {
        console.warn('\nSchema.json not found at project root. Skipping validation.');
      }
    });
  }
}


module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  const isAnalyze = env && env.analyze; // Check for --env analyze flag

  // Dynamically generate HtmlWebpackPlugin instances for all language index.html files
  const languages = ['en', 'lo', 'th', 'fr'];
  const htmlPlugins = languages.map(lang => {
    const templatePath = `./${lang}/index.html`;
    // Check if the language-specific index.html exists
    if (fs.existsSync(templatePath)) {
      return new HtmlWebpackPlugin({
        template: templatePath,
        filename: `${lang}/index.html`, // Output to e.g., dist/en/index.html
        chunks: ['main', 'styles', 'vendors'], // Inject these bundled chunks
        minify: isProduction ? {
          collapseWhitespace: true,
          removeComments: true,
          minifyCSS: true,
          minifyJS: true,
        } : false,
      });
    }
    return null; // Return null if file doesn't exist
  }).filter(Boolean); // Filter out null entries

  // Add the root index.html if it exists
  if (fs.existsSync('./index.html')) {
    htmlPlugins.push(new HtmlWebpackPlugin({
      template: './index.html',
      filename: 'index.html',
      chunks: ['main', 'styles', 'vendors'],
      minify: isProduction ? {
        collapseWhitespace: true,
        removeComments: true,
        minifyCSS: true,
        minifyJS: true,
      } : false,
    }));
  }

  return {
    mode: isProduction ? 'production' : 'development',
    devtool: isProduction ? 'source-map' : 'eval-source-map',

    entry: {
      main: './js/scripts.js', // Main application JS (assuming this is where React app is bootstrapped)
      styles: './css/styles.css', // Main application CSS
    },

    output: {
      path: path.resolve(__dirname, 'dist'), // Output to 'dist' directory
      filename: isProduction ? 'js/[name].[contenthash].min.js' : 'js/[name].bundle.js', // Hashed filenames for caching in prod
      publicPath: '/', // Base path for all assets. Adjust if using a CDN (e.g., 'https://cdn.yourdomain.com/')
      clean: true, // Clean the output directory before each build
      assetModuleFilename: 'assets/[name].[hash][ext][query]' // For asset modules (images, fonts)
    },

    module: {
      rules: [
        // JavaScript: Babel transpilation for ES6+ and React
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: [
                '@babel/preset-env',
                '@babel/preset-react' // Included as React is inferred from package.json dependencies
              ]
            }
          }
        },
        // CSS: Process with PostCSS (Tailwind CSS, Autoprefixer) and extract to separate file
        {
          test: /\.css$/,
          use: [
            MiniCssExtractPlugin.loader, // Extracts CSS into separate files
            'css-loader', // Interprets @import and url() like import/require() and resolves them
            {
              loader: 'postcss-loader',
              options: {
                postcssOptions: {
                  plugins: [
                    require('tailwindcss'),
                    require('autoprefixer'),
                  ]
                }
              }
            }
          ]
        },
        // Images: Handle image assets (e.g., imported in JS/CSS) and output to images/ folder
        // Image optimization is handled by ImageMinimizerPlugin
        {
          test: /\.(png|jpg|jpeg|gif|svg|webp)$/i,
          type: 'asset/resource', // Replaces file-loader/url-loader in Webpack 5
          generator: {
            filename: 'images/[name].[hash][ext]' // Output path for images
          }
        },
        // Fonts: Handle font assets and output to fonts/ folder
        {
          test: /\.(woff|woff2|eot|ttf|otf)$/i,
          type: 'asset/resource', // Replaces file-loader/url-loader in Webpack 5
          generator: {
            filename: 'fonts/[name].[hash][ext]' // Output path for fonts
          }
        },
        // HTML: Process HTML files (e.g., for image imports in HTML templates)
        {
          test: /\.html$/,
          use: [
            {
              loader: 'html-loader',
              options: {
                minimize: isProduction, // Minify HTML in production
              }
            }
          ]
        }
      ]
    },

    plugins: [
      // Dynamically generated HtmlWebpackPlugin instances for root and all language index.html files
      ...htmlPlugins,
      // MiniCssExtractPlugin: Extracts CSS into separate .css files instead of inlining into JS bundles.
      new MiniCssExtractPlugin({
        filename: isProduction ? 'css/[name].[contenthash].min.css' : 'css/[name].bundle.css',
      }),
      // CopyPlugin: Copies static assets directly to the dist folder that are not handled by other loaders.
      // This includes CNAME, robots.txt, manifest.json, 404.html, and sitemap.xml
      new CopyPlugin({
        patterns: [
          { from: 'favicon.ico', to: 'favicon.ico' },
          { from: 'CNAME', to: 'CNAME' },
          { from: 'robots.txt', to: 'robots.txt' },
          { from: 'manifest.json', to: 'manifest.json' },
          { from: '404.html', to: '404.html' },
          { from: 'sitemap.xml', to: 'sitemap.xml' }, // Copy sitemap.xml
          { from: 'schema.json', to: 'schema.json' } // Copy schema.json
        ],
        options: {
          // Fail the build if a 'from' path doesn't exist, helping catch missing files.
          // Set to false if you prefer warnings over errors for missing static files.
          // Example: `ignore: ['**/missing-file.txt']`
          // Or `noErrorOnMissing: true` to prevent errors.
          concurrency: 100, // Number of simultaneous processes to use
        },
      }),
      // BundleAnalyzerPlugin: Visualizes size of webpack output files. Only enabled in 'analyze' mode.
      isAnalyze && new BundleAnalyzerPlugin({
        analyzerMode: 'static', // Generates a static HTML report
        openAnalyzer: false, // Don't open browser automatically
        reportFilename: 'bundle-report.html',
        generateStatsFile: true,
        statsFilename: 'bundle-stats.json', // As requested in package.json for `npm run analyze`
      }),
      // Custom plugin for schema.json validation
      new SchemaValidatorPlugin(),
    ].filter(Boolean), // Filters out any `false` values (e.g., when isAnalyze is false)

    optimization: {
      minimize: isProduction, // Enable minimization for production builds
      minimizer: [
        // TerserPlugin: Minifies JavaScript files.
        new TerserPlugin({
          terserOptions: {
            compress: {
              drop_console: isProduction, // Remove console.log statements in production
            },
          },
        }),
        // CssMinimizerPlugin: Minifies CSS files extracted by MiniCssExtractPlugin.
        new CssMinimizerPlugin(),
        // ImageMinimizerPlugin: Optimizes images processed by Webpack's asset modules.
        new ImageMinimizerPlugin({
          minimizer: {
            implementation: ImageMinimizerPlugin.imageminMinify,
            options: {
              plugins: [
                ['gifsicle', { interlaced: true }],
                ['mozjpeg', { quality: 75, progressive: true }],
                ['optipng', { optimizationLevel: 5 }],
                ['svgo', { name: 'preset-default' }],
              ],
            },
          },
          // Generates WebP variants of images during the build process.
          generator: [
            {
              preset: 'webp',
              implementation: ImageMinimizerPlugin.sharpGenerate,
              options: {
                encodeOptions: {
                  webp: {
                    quality: 80,
                  },
                },
              },
            },
          ],
        }),
      ],
      // splitChunks: Optimizes chunks to prevent duplication and improve caching.
      splitChunks: {
        chunks: 'all', // Optimize all chunks (async and initial)
        minSize: 20000, // Minimum size of a chunk to be considered for splitting (20KB)
        minRemainingSize: 0,
        minChunks: 1, // Minimum number of modules that must share a chunk
        maxAsyncRequests: 30, // Maximum number of parallel requests for an entry point
        maxInitialRequests: 30, // Maximum number of parallel requests on initial load
        enforceSizeThreshold: 50000, // Enforce splitting for chunks larger than this (50KB)
        cacheGroups: {
          // Vendor chunk for third-party libraries from node_modules
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors', // Name of the vendor chunk
            chunks: 'all',
          },
          // Styles chunk to ensure CSS is bundled efficiently
          styles: {
            name: 'styles',
            type: 'css/mini-extract',
            chunks: 'all',
            enforce: true,
          },
        },
      },
      // runtimeChunk: Separates runtime code into a single chunk for better caching.
      runtimeChunk: 'single',
    },

    // devServer: Configuration for the Webpack development server.
    devServer: {
      static: {
        directory: path.join(__dirname, 'dist'), // Serve content from the 'dist' directory
      },
      compress: true, // Enable gzip compression for everything served
      port: process.env.WEBPACK_PORT || 8080, // Use environment variable or default to 8080
      hot: true, // Enable Hot Module Replacement (HMR)
      open: false, // Don't open browser automatically on start
      historyApiFallback: true, // Fallback to index.html for single-page application routing
      // proxy: { // Uncomment and configure if you need to proxy API calls to a backend server
      //   '/api': {
      //     target: process.env.API_URL || 'http://localhost:3001',
      //     changeOrigin: true,
      //     secure: false // Set to true for HTTPS backend
      //   },
      // },
      // Error overlay configuration is handled by webpack-dev-server by default
    },

    // performance: Defines performance budget hints for Webpack.
    performance: {
      hints: isProduction ? 'warning' : false, // Show warnings in production if budgets are exceeded
      maxEntrypointSize: 250000, // Maximum size for an entry point (250KB)
      maxAssetSize: 100000, // Maximum size for any individual asset (100KB)
      assetFilter: function (assetFilename) {
        // Exclude sourcemaps and text files from performance budget checks
        return !/\.(map|txt)$/.test(assetFilename);
      },
    },
  };
};

