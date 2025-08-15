const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'production',
  // Your main JS file is in the 'js' folder, not 'src'.
  entry: './js/main.js', 
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'js/[name].[contenthash].js',
    clean: true,
  },
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
      // Your main HTML file is in the root folder.
      template: './index.html', 
    }),
    new MiniCssExtractPlugin({
      filename: 'css/[name].[contenthash].css',
    }),
    // This will correctly copy your images and other assets.
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