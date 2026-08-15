#!/usr/bin/env node
/**
 * Asserts GSC-safe sitemap-google.xml + well-formed sitemap siblings.
 * Run after `node scripts/generate-sitemap.js`.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const GOOGLE = path.join(ROOT, 'sitemap-google.xml');
const FULL = path.join(ROOT, 'sitemap.xml');
const INDEX = path.join(ROOT, 'sitemap-index.xml');
const IMAGES = path.join(ROOT, 'sitemap-images.xml');
const HOME = 'https://wordsthatsells.website/en/';

function xml(file) {
  return fs.readFileSync(file, 'utf8');
}

test('sitemap-google.xml is English-only urlset 0.9 and includes /en/', () => {
  const body = xml(GOOGLE);
  assert.match(body, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  assert.doesNotMatch(body, /<!--/);
  assert.doesNotMatch(body, /<image:/);
  assert.doesNotMatch(body, /hreflang/);
  assert.doesNotMatch(body, /xmlns:xhtml|xmlns:image/);
  assert.ok(body.includes(`<loc>${HOME}</loc>`), 'sitemap-google must include /en/');
  const firstLoc = /<loc>([^<]+)<\/loc>/.exec(body)[1];
  assert.equal(firstLoc, HOME, 'homepage must be the first URL');
  assert.doesNotMatch(body, /https:\/\/wordsthatsells\.website\/(th|la|fr|lo)\//);
});

test('sitemaps contain no 404/noindex/redirect-stub markers in loc text', () => {
  const body = xml(GOOGLE);
  assert.doesNotMatch(body, /\/en\/blog\/|\/en\/shop\/|\/lo\//);
  assert.doesNotMatch(body, /checkout\//);
  assert.doesNotMatch(body, /<loc>https:\/\/wordsthatsells\.website\/search/);
});

test('sitemap-index.xml is comment-free and lists the three children', () => {
  const body = xml(INDEX);
  assert.doesNotMatch(body, /<!--/);
  assert.match(body, /<sitemapindex xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  assert.match(body, /sitemap-google\.xml/);
  assert.match(body, /sitemap\.xml/);
  assert.match(body, /sitemap-images\.xml/);
});

test('sitemap.xml stays well-formed urlset', () => {
  const body = xml(FULL);
  assert.match(body, /<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"/);
  assert.doesNotMatch(body, /<!--/);
  assert.ok(body.includes(`<loc>${HOME}</loc>`), 'sitemap.xml must include /en/');
});

test('xmllint --noout passes on the three submitted sitemaps', () => {
  for (const file of [GOOGLE, FULL, INDEX, IMAGES]) {
    execFileSync('xmllint', ['--noout', file], { stdio: 'pipe' });
  }
});
