const nodemailer = require('nodemailer');

// Create transporter
const createTransporter = () => {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  // Use Ethereal for development/testing
  return nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    auth: {
      user: 'test@ethereal.email',
      pass: 'test'
    }
  });
};

const sendPasswordResetEmail = async (email, token, firstName) => {
  const transporter = createTransporter();
  const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/auth/reset-password/${token}`;

  const mailOptions = {
    from: process.env.EMAIL_FROM || 'WTS Admin <noreply@wordsthatsells.website>',
    to: email,
    subject: 'Reset Your Password - Words That Sells',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f4f4f4;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <tr>
            <td style="padding: 40px 30px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Words That Sells</h1>
              <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0;">Admin Dashboard</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="color: #333; margin: 0 0 20px 0;">Reset Your Password</h2>
              <p style="color: #666; margin: 0 0 20px 0;">Hi ${firstName || 'there'},</p>
              <p style="color: #666; margin: 0 0 20px 0;">We received a request to reset your password. Click the button below to create a new password:</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 20px 0; text-align: center;">
                    <a href="${resetUrl}" style="display: inline-block; padding: 14px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">Reset Password</a>
                  </td>
                </tr>
              </table>
              <p style="color: #666; margin: 0 0 10px 0;">This link will expire in 1 hour.</p>
              <p style="color: #666; margin: 0 0 20px 0;">If you didn't request this password reset, you can safely ignore this email.</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
              <p style="color: #999; font-size: 12px; margin: 0;">If the button doesn't work, copy and paste this link into your browser:</p>
              <p style="color: #667eea; font-size: 12px; word-break: break-all; margin: 10px 0 0 0;">${resetUrl}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 30px; background-color: #f8f9fa; text-align: center;">
              <p style="color: #999; font-size: 12px; margin: 0;">&copy; ${new Date().getFullYear()} Words That Sells. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
    text: `
Reset Your Password

Hi ${firstName || 'there'},

We received a request to reset your password. Click the link below to create a new password:

${resetUrl}

This link will expire in 1 hour.

If you didn't request this password reset, you can safely ignore this email.

- Words That Sells Team
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Password reset email sent:', info.messageId);
    return info;
  } catch (error) {
    console.error('Failed to send password reset email:', error);
    throw error;
  }
};

const sendWelcomeEmail = async (email, firstName) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: process.env.EMAIL_FROM || 'WTS Admin <noreply@wordsthatsells.website>',
    to: email,
    subject: 'Welcome to Words That Sells Admin',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Welcome</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #f4f4f4;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <tr>
            <td style="padding: 40px 30px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
              <h1 style="color: #ffffff; margin: 0;">Welcome to WTS Admin!</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="color: #666;">Hi ${firstName},</p>
              <p style="color: #666;">Your account has been created successfully. You can now access the Words That Sells admin dashboard.</p>
              <p style="color: #666;">Happy marketing!</p>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
  } catch (error) {
    console.error('Failed to send welcome email:', error);
  }
};

module.exports = {
  sendPasswordResetEmail,
  sendWelcomeEmail
};
