// Shim: the HTML localization engine's canonical home is
// wts-admin/src/lib/html-l10n.js so the deployed admin (which ships only
// the wts-admin directory) can extract page segments server-side. Root
// scripts and workflows always run from a full checkout, so this
// re-export keeps every existing require path working. The module is
// dependency-free — no node_modules needed on either side.
module.exports = require('../../wts-admin/src/lib/html-l10n');
