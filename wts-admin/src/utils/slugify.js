// Build a stable, URL-safe slug. Shared by the product routes and the importer
// so a slug is always derived the same way (and "Pro+" keeps meaning as
// "pro-plus" instead of collapsing to "pro").
module.exports = function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/\+/g, '-plus')
    .replace(/&/g, '-and-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
};
