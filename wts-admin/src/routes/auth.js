const express = require('express');
const passport = require('passport');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const db = require('../../database/db');
const { sendPasswordResetEmail } = require('../utils/email');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 auth requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Validation middleware
const validateSignup = [
  body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required')
];

const validateLogin = [
  body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email'),
  body('password').notEmpty().withMessage('Password is required')
];

// Login page
router.get('/login', authLimiter, (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/dashboard');
  }
  res.render('auth/login', {
    title: 'Login - WTS Admin',
    error: req.query.error
  });
});

// Login POST
router.post('/login', authLimiter, validateLogin, (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('auth/login', {
      title: 'Login - WTS Admin',
      error: errors.array()[0].msg,
      email: req.body.email
    });
  }

  passport.authenticate('local', (err, user, info) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      return res.render('auth/login', {
        title: 'Login - WTS Admin',
        error: info?.message || 'Invalid email or password',
        email: req.body.email
      });
    }
    req.logIn(user, (err) => {
      if (err) {
        return next(err);
      }
      req.session.successMessage = 'Welcome back!';
      return res.redirect('/dashboard');
    });
  })(req, res, next);
});

// Signup page
router.get('/signup', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/dashboard');
  }
  res.render('auth/signup', {
    title: 'Sign Up - WTS Admin'
  });
});

// Signup POST
router.post('/signup', authLimiter, validateSignup, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('auth/signup', {
      title: 'Sign Up - WTS Admin',
      error: errors.array()[0].msg,
      formData: req.body
    });
  }

  const { email, password, firstName, lastName } = req.body;

  try {
    // Check if user exists
    const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existingUser.rows.length > 0) {
      return res.render('auth/signup', {
        title: 'Sign Up - WTS Admin',
        error: 'An account with this email already exists',
        formData: req.body
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create verification token
    const verificationToken = uuidv4();

    // Create user
    const result = await db.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, verification_token, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [email.toLowerCase(), passwordHash, firstName, lastName, verificationToken, 'user']
    );

    const user = result.rows[0];

    // Log in the user
    req.logIn(user, (err) => {
      if (err) {
        console.error('Login error after signup:', err);
        return res.redirect('/auth/login');
      }
      req.session.successMessage = 'Account created successfully!';
      return res.redirect('/dashboard');
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.render('auth/signup', {
      title: 'Sign Up - WTS Admin',
      error: 'An error occurred. Please try again.',
      formData: req.body
    });
  }
});

// Forgot password page
router.get('/forgot-password', (req, res) => {
  res.render('auth/forgot-password', {
    title: 'Forgot Password - WTS Admin'
  });
});

// Forgot password POST
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('auth/forgot-password', {
      title: 'Forgot Password - WTS Admin',
      error: errors.array()[0].msg
    });
  }

  const { email } = req.body;

  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);

    // Always show success message for security
    if (result.rows.length === 0) {
      return res.render('auth/forgot-password', {
        title: 'Forgot Password - WTS Admin',
        success: 'If an account exists with this email, you will receive password reset instructions.'
      });
    }

    const user = result.rows[0];

    // Generate reset token
    const resetToken = uuidv4();
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour

    await db.query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
      [resetToken, resetExpires, user.id]
    );

    // Send reset email
    try {
      await sendPasswordResetEmail(user.email, resetToken, user.first_name);
    } catch (emailError) {
      console.error('Failed to send reset email:', emailError);
    }

    res.render('auth/forgot-password', {
      title: 'Forgot Password - WTS Admin',
      success: 'If an account exists with this email, you will receive password reset instructions.'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.render('auth/forgot-password', {
      title: 'Forgot Password - WTS Admin',
      error: 'An error occurred. Please try again.'
    });
  }
});

// Reset password page
router.get('/reset-password/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const result = await db.query(
      'SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    );

    if (result.rows.length === 0) {
      return res.render('auth/reset-password', {
        title: 'Reset Password - WTS Admin',
        error: 'Invalid or expired reset link. Please request a new one.',
        invalidToken: true
      });
    }

    res.render('auth/reset-password', {
      title: 'Reset Password - WTS Admin',
      token
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.redirect('/auth/forgot-password');
  }
});

// Reset password POST
router.post('/reset-password/:token', [
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) {
      throw new Error('Passwords do not match');
    }
    return true;
  })
], async (req, res) => {
  const { token } = req.params;
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.render('auth/reset-password', {
      title: 'Reset Password - WTS Admin',
      error: errors.array()[0].msg,
      token
    });
  }

  try {
    const result = await db.query(
      'SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()',
      [token]
    );

    if (result.rows.length === 0) {
      return res.render('auth/reset-password', {
        title: 'Reset Password - WTS Admin',
        error: 'Invalid or expired reset link. Please request a new one.',
        invalidToken: true
      });
    }

    const user = result.rows[0];

    // Hash new password
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(req.body.password, salt);

    // Update password and clear reset token
    await db.query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
      [passwordHash, user.id]
    );

    req.session.successMessage = 'Password reset successful. Please log in with your new password.';
    res.redirect('/auth/login');
  } catch (error) {
    console.error('Reset password error:', error);
    res.render('auth/reset-password', {
      title: 'Reset Password - WTS Admin',
      error: 'An error occurred. Please try again.',
      token
    });
  }
});

// Google OAuth
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email']
}));

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/auth/login?error=google_auth_failed' }),
  (req, res) => {
    req.session.successMessage = 'Welcome!';
    res.redirect('/dashboard');
  }
);

// Facebook OAuth
router.get('/facebook', passport.authenticate('facebook', {
  scope: ['email', 'public_profile']
}));

router.get('/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/auth/login?error=facebook_auth_failed' }),
  (req, res) => {
    req.session.successMessage = 'Welcome!';
    res.redirect('/dashboard');
  }
);

// Logout
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    req.session.destroy(() => {
      res.redirect('/auth/login');
    });
  });
});

router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    req.session.destroy(() => {
      res.redirect('/auth/login');
    });
  });
});

module.exports = router;
