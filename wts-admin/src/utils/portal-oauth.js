// Customer-portal social sign-in strategies.
//
// Deliberately SEPARATE from the admin's 'google'/'facebook' strategies:
// same provider credentials (one OAuth app may register several redirect
// URIs), but their own callback URLs and a verify step that resolves only
// the provider profile — the portal route upserts the CUSTOMER and mints
// the customer session. No passport session is involved ({ session:false }
// everywhere) and no admin allow-list applies: the portal is open
// self-serve by design (a social account is at least as bot-resistant as
// the magic-link mailbox), while anything that can earn or spend money
// stays behind admin-approved partner enrollment.
const passport = require('passport');

function profileEmail(profile) {
  const email = profile.emails && profile.emails[0] && profile.emails[0].value;
  return email ? String(email).trim().toLowerCase() : null;
}

function profileName(profile) {
  return profile.displayName ||
    [profile.name && profile.name.givenName, profile.name && profile.name.familyName]
      .filter(Boolean).join(' ') || null;
}

// Verify: hand the route a minimal identity — email + display name. The
// route owns customer lookup/creation so all portal account rules live in
// one place (portal.js).
const verify = (accessToken, refreshToken, profile, done) =>
  done(null, { email: profileEmail(profile), name: profileName(profile) });

function registerPortalOAuth() {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const GoogleStrategy = require('passport-google-oauth20').Strategy;
    passport.use('portal-google', new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.PORTAL_GOOGLE_CALLBACK_URL || '/portal/auth/google/callback',
    }, verify));
  }
  if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
    const FacebookStrategy = require('passport-facebook').Strategy;
    passport.use('portal-facebook', new FacebookStrategy({
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: process.env.PORTAL_FACEBOOK_CALLBACK_URL || '/portal/auth/facebook/callback',
      profileFields: ['id', 'emails', 'name', 'displayName'],
    }, verify));
  }
}

const portalOAuthEnabled = (provider) =>
  Boolean(passport._strategies && passport._strategies[`portal-${provider}`]);

module.exports = { registerPortalOAuth, portalOAuthEnabled };
