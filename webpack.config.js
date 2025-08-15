const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: './js/main.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'js/[name].[contenthash].js',
    clean: true,
  },
  // =================================================================
  // START OF THE FIX
  // This new section tells Webpack how to handle modern JavaScript
  target: 'web',
  experiments: {
    outputModule: true,
  },
  externalsType: 'module',
  externals: {
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm': 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'
  },
  // END OF THE FIX
  // =================================================================
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader', 'postcss-loader'],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './index.html',
    }),
    new MiniCssExtractPlugin({
      filename: 'css/[name].[contenthash].css',
    }),
    new CopyPlugin({
        patterns: [
            { from: 'public', to: 'public' },
            { from: 'images', to: 'images' }
        ]
    })
  ],
  optimization: {
    minimizer: [
      new CssMinimizerPlugin(),
    ],
  },
};