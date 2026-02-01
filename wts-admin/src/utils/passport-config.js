const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const bcrypt = require('bcryptjs');
const db = require('../../database/db');

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const result = await db.query('SELECT * FROM users WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return done(null, false);
    }
    done(null, result.rows[0]);
  } catch (error) {
    done(error, null);
  }
});

// Local Strategy
passport.use(new LocalStrategy(
  { usernameField: 'email' },
  async (email, password, done) => {
    try {
      const result = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);

      if (result.rows.length === 0) {
        return done(null, false, { message: 'Invalid email or password' });
      }

      const user = result.rows[0];

      if (!user.password_hash) {
        return done(null, false, { message: 'Please use social login for this account' });
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);

      if (!isMatch) {
        return done(null, false, { message: 'Invalid email or password' });
      }

      // Update last login
      await db.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }
));

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback'
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Check if user exists
      let result = await db.query(
        'SELECT * FROM users WHERE provider = $1 AND provider_id = $2',
        ['google', profile.id]
      );

      if (result.rows.length > 0) {
        // Update last login
        await db.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [result.rows[0].id]);
        return done(null, result.rows[0]);
      }

      // Check if email exists with different provider
      const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
      if (email) {
        result = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
        if (result.rows.length > 0) {
          // Link Google account to existing user
          await db.query(
            'UPDATE users SET provider = $1, provider_id = $2, avatar_url = $3, last_login = CURRENT_TIMESTAMP WHERE id = $4',
            ['google', profile.id, profile.photos?.[0]?.value, result.rows[0].id]
          );
          const updatedUser = await db.query('SELECT * FROM users WHERE id = $1', [result.rows[0].id]);
          return done(null, updatedUser.rows[0]);
        }
      }

      // Create new user
      const newUser = await db.query(
        `INSERT INTO users (email, first_name, last_name, avatar_url, provider, provider_id, email_verified, last_login)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
         RETURNING *`,
        [
          email?.toLowerCase(),
          profile.name?.givenName || profile.displayName,
          profile.name?.familyName || '',
          profile.photos?.[0]?.value,
          'google',
          profile.id,
          true
        ]
      );

      return done(null, newUser.rows[0]);
    } catch (error) {
      return done(error, null);
    }
  }));
}

// Facebook OAuth Strategy
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: process.env.FACEBOOK_CALLBACK_URL || '/auth/facebook/callback',
    profileFields: ['id', 'emails', 'name', 'displayName', 'picture.type(large)']
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Check if user exists
      let result = await db.query(
        'SELECT * FROM users WHERE provider = $1 AND provider_id = $2',
        ['facebook', profile.id]
      );

      if (result.rows.length > 0) {
        await db.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [result.rows[0].id]);
        return done(null, result.rows[0]);
      }

      // Check if email exists with different provider
      const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
      if (email) {
        result = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
        if (result.rows.length > 0) {
          await db.query(
            'UPDATE users SET provider = $1, provider_id = $2, avatar_url = $3, last_login = CURRENT_TIMESTAMP WHERE id = $4',
            ['facebook', profile.id, profile.photos?.[0]?.value, result.rows[0].id]
          );
          const updatedUser = await db.query('SELECT * FROM users WHERE id = $1', [result.rows[0].id]);
          return done(null, updatedUser.rows[0]);
        }
      }

      // Create new user
      const newUser = await db.query(
        `INSERT INTO users (email, first_name, last_name, avatar_url, provider, provider_id, email_verified, last_login)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
         RETURNING *`,
        [
          email?.toLowerCase(),
          profile.name?.givenName || profile.displayName,
          profile.name?.familyName || '',
          profile.photos?.[0]?.value,
          'facebook',
          profile.id,
          true
        ]
      );

      return done(null, newUser.rows[0]);
    } catch (error) {
      return done(error, null);
    }
  }));
}

module.exports = passport;
