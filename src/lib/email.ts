import nodemailer from 'nodemailer';
import { logger } from '@/lib/logger';
import path from 'path';

interface MailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: Array<{
    filename: string;
    path?: string;
    content?: Buffer;
    cid?: string;
  }>;
}

// Configure the transporter using environment variables
const transporter = nodemailer.createTransport({
  host: process.env.AUTH_SMTP_HOST,
  port: parseInt(process.env.AUTH_SMTP_PORT || '587'), // Default to 587 if not set
  secure: parseInt(process.env.AUTH_SMTP_PORT || '587') === 465, // true for 465, false for other ports
  auth: {
    user: process.env.AUTH_SMTP_USER,
    pass: process.env.AUTH_SMTP_PASS,
  },
  // Optional: Add TLS options if needed, e.g., for self-signed certs
  // tls: {
  //     rejectUnauthorized: process.env.NODE_ENV === 'production' // Allow self-signed in dev
  // }
});



/**
 * Gets the InstradaOGM logo as an inline attachment for email embedding.
 * Uses CID (Content-ID) which is the most reliable method for email images.
 * PNG format is used instead of SVG for maximum email client compatibility.
 * @returns Attachment object for Nodemailer with CID reference
 */
function getLogoAttachment() {
  const logoPath = path.join(process.cwd(), 'public', 'images', 'InstradaOGM-logo.png');

  return {
    filename: 'instrada-logo.png',
    path: logoPath,
    cid: 'instrada-logo' // This is the CID we'll reference in the HTML as cid:instrada-logo
  };
}

/**
 * Sends an email using the configured Nodemailer transporter.
 *
 * @param mailOptions - An object containing the recipient, subject, text, and HTML content.
 * @returns A promise that resolves when the email is sent or rejects on error.
 */
export async function sendEmail(mailOptions: MailOptions): Promise<void> {
  const fromAddress = process.env.AUTH_SMTP_FROM_EMAIL;

  if (!fromAddress) {
    logger.error("Email sending failed: SMTP_FROM_EMAIL environment variable is not set.");
    throw new Error("Email 'From' address is not configured.");
  }
  if (!process.env.AUTH_SMTP_HOST) {
    logger.error("Email sending failed: SMTP_HOST environment variable is not set.");
    throw new Error("SMTP host is not configured.");
  }

  const optionsWithFrom = {
    ...mailOptions,
    from: fromAddress,
  };

  try {
    logger.info(`Attempting to send email to ${mailOptions.to} with subject "${mailOptions.subject}"`);
    const info = await transporter.sendMail(optionsWithFrom);
    logger.info('Email sent successfully: %s', info.messageId);
    // logger.debug('Preview URL: %s', nodemailer.getTestMessageUrl(info)); // Only works with ethereal.email test accounts
  } catch (error) {
    logger.error('Error sending email:', error);
    // Rethrow the error so the caller knows sending failed
    throw new Error(`Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Example Usage:
/*
await sendEmail({
    to: 'recipient@example.com',
    subject: 'Test Email',
    text: 'This is a plain text email.',
    html: '<p>This is an <b>HTML</b> email.</p>'
});
*/
/**
 * Sends a password reset email to the user.
 *
 * @param email - The recipient's email address.
 * @param resetUrl - The URL for the password reset confirmation page, including the reset token.
 * @returns A promise that resolves when the email is sent or rejects on error.
 */
export async function sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
  const subject = 'Password Reset Request - InstradaOGM';
  const text = `You requested a password reset for your InstradaOGM account. Please use the following link to reset your password: ${resetUrl}\n\nThis link will expire in 1 hour.\n\nIf you did not request this password reset, please ignore this email.`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset Request</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .logo { max-width: 80px; height: auto; margin-bottom: 2px; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 8px; margin-bottom: 20px; }
        .button { display: inline-block; background: #06b6d4 !important; color: white !important; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .footer { text-align: center; font-size: 12px; color: #666; margin-top: 30px; }
        .warning { background: #fef3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 6px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="cid:instrada-logo" alt="InstradaOGM" class="logo">
        <h1>Password Reset Request</h1>
      </div>

      <div class="content">
        <p>You requested a password reset for your InstradaOGM account.</p>
        <p>Click the button below to reset your password:</p>
        <p style="text-align: center;">
          <a href="${resetUrl}" class="button" style="background: #06b6d4 !important; color: white !important; text-decoration: none;">Reset Password</a>
        </p>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; background: #f0f0f0; padding: 10px; border-radius: 4px;">${resetUrl}</p>

        <div class="warning">
          <strong>Important:</strong> This link will expire in 1 hour for security reasons.
        </div>

        <p>If you did not request this password reset, please ignore this email. Your password will remain unchanged.</p>
      </div>

      <div class="footer">
        <p>This email was sent by InstradaOGM</p>
        <p>Please do not reply to this email.</p>
      </div>
    </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject,
    text,
    html,
    attachments: [getLogoAttachment()]
  });
}

/**
 * Sends an email verification email to the user.
 *
 * @param email - The recipient's email address.
 * @param verificationUrl - The URL for email verification, including the verification token.
 * @returns A promise that resolves when the email is sent or rejects on error.
 */
export async function sendVerificationEmail(email: string, verificationUrl: string): Promise<void> {
  const subject = 'Verify Your Email Address - InstradaOGM';
  const text = `Welcome to InstradaOGM! Please verify your email address by clicking the following link: ${verificationUrl}\n\nThis link will expire in 24 hours.\n\nIf you did not create an account, please ignore this email.`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify Your Email Address</title>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; }
        .logo { max-width: 80px; height: auto; margin-bottom: 2px; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 8px; margin-bottom: 20px; }
        .button { display: inline-block; background: #06b6d4 !important; color: white !important; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .footer { text-align: center; font-size: 12px; color: #666; margin-top: 30px; }
        .info { background: #dbeafe; border: 1px solid #93c5fd; padding: 15px; border-radius: 6px; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="cid:instrada-logo" alt="InstradaOGM" class="logo">
        <h1>Welcome to InstradaOGM!</h1>
      </div>

      <div class="content">
        <p>Thank you for creating an account with InstradaOGM.</p>
        <p>To complete your registration, please verify your email address by clicking the button below:</p>
        <p style="text-align: center;">
          <a href="${verificationUrl}" class="button" style="background: #06b6d4 !important; color: white !important; text-decoration: none;">Verify Email Address</a>
        </p>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; background: #f0f0f0; padding: 10px; border-radius: 4px;">${verificationUrl}</p>

        <div class="info">
          <strong>Note:</strong> This verification link will expire in 24 hours for security reasons.
        </div>

        <p>If you did not create an account, please ignore this email.</p>
      </div>

      <div class="footer">
        <p>This email was sent by InstradaOGM</p>
        <p>Please do not reply to this email.</p>
      </div>
    </body>
    </html>
  `;

  await sendEmail({
    to: email,
    subject,
    text,
    html,
    attachments: [getLogoAttachment()]
  });
}