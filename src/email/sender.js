import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { emails, contacts, blacklist } from '../db/database.js';
import { getConfig } from '../utils/config.js';

let transporter = null;
let resendClient = null;

export function createTransporter() {
  const config = getConfig();
  const provider = config.email.provider;

  if (provider === 'resend') {
    resendClient = new Resend(config.email.resend.apiKey);
    return resendClient;
  } else if (provider === 'gmail-app-password') {
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: config.email.from.email,
        pass: config.email.gmailAppPassword
      }
    });
  } else if (provider === 'sendgrid') {
    transporter = nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: {
        user: 'apikey',
        pass: config.email.sendgrid.apiKey
      }
    });
  } else if (provider === 'smtp') {
    transporter = nodemailer.createTransport({
      host: config.email.smtp.host,
      port: config.email.smtp.port,
      secure: config.email.smtp.secure,
      auth: {
        user: config.email.smtp.user,
        pass: config.email.smtp.pass
      }
    });
  } else {
    throw new Error(`Unknown email provider: ${provider}`);
  }

  return transporter;
}

export function getTransporter() {
  const config = getConfig();
  if (config.email.provider === 'resend') {
    if (!resendClient) createTransporter();
    return resendClient;
  }
  if (!transporter) {
    createTransporter();
  }
  return transporter;
}

export async function sendEmail(emailRecord) {
  const config = getConfig();
  const transport = getTransporter();

  // Check blacklist
  if (blacklist.check(emailRecord.to_email)) {
    console.log(`⊘ Skipped (blacklisted): ${emailRecord.to_email}`);
    emails.markFailed(emailRecord.id, 'Email is blacklisted');
    return { success: false, reason: 'blacklisted' };
  }

  // Check daily limit
  const todayCount = emails.getTodayCount();
  if (todayCount >= config.sending.dailyLimit) {
    console.log(`⊘ Daily limit reached (${todayCount}/${config.sending.dailyLimit})`);
    return { success: false, reason: 'daily_limit' };
  }

  const fromAddr = config.email.from.email;
  const fromName = config.email.from.name;
  const replyTo = config.email.replyTo || fromAddr;

  try {
    let messageId;

    if (config.email.provider === 'resend') {
      // Resend API
      const { data, error } = await resendClient.emails.send({
        from: `${fromName} <${fromAddr}>`,
        to: [emailRecord.to_email],
        replyTo: replyTo,
        subject: emailRecord.subject,
        text: emailRecord.body,
        html: emailRecord.body.replace(/\n/g, '<br>'),
        headers: config.compliance?.includeUnsubscribe ? {
          'List-Unsubscribe': `<mailto:${replyTo}?subject=Unsubscribe>`
        } : undefined,
      });

      if (error) throw new Error(error.message);
      messageId = data.id;
    } else {
      // Nodemailer (SMTP)
      const mailOptions = {
        from: `"${fromName}" <${fromAddr}>`,
        to: emailRecord.to_email,
        subject: emailRecord.subject,
        text: emailRecord.body,
        html: emailRecord.body.replace(/\n/g, '<br>')
      };

      if (config.compliance?.includeUnsubscribe) {
        mailOptions.headers = {
          'List-Unsubscribe': `<mailto:${fromAddr}?subject=Unsubscribe>`
        };
      }

      const info = await transport.sendMail(mailOptions);
      messageId = info.messageId;
    }

    console.log(`✓ Sent to ${emailRecord.to_email} (${messageId})`);

    emails.markSent(emailRecord.id);

    const followupNumber = emailRecord.followup_number || 0;
    let newStatus;
    if (followupNumber === 0) {
      newStatus = 'contacted';
    } else if (followupNumber === 1) {
      newStatus = 'followup_1';
    } else if (followupNumber === 2) {
      newStatus = 'followup_2';
    } else {
      newStatus = 'followup_final';
    }
    contacts.updateStatus(emailRecord.contact_id, newStatus);

    return { success: true, messageId };
  } catch (error) {
    console.error(`✗ Failed to send to ${emailRecord.to_email}:`, error.message);
    emails.markFailed(emailRecord.id, error.message);
    return { success: false, reason: error.message };
  }
}

export async function processScheduledEmails() {
  const config = getConfig();
  const scheduled = emails.getScheduled(10);

  if (scheduled.length === 0) {
    console.log('No scheduled emails to send');
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const email of scheduled) {
    const result = await sendEmail(email);

    if (result.success) {
      sent++;
    } else {
      if (result.reason === 'daily_limit') {
        console.log('Stopping: daily limit reached');
        break;
      }
      failed++;
    }

    // Random delay between emails
    const minInterval = config.sending.minIntervalMinutes * 60 * 1000;
    const maxInterval = config.sending.maxIntervalMinutes * 60 * 1000;
    const delay = Math.floor(Math.random() * (maxInterval - minInterval)) + minInterval;

    if (scheduled.indexOf(email) < scheduled.length - 1) {
      console.log(`Waiting ${Math.round(delay / 1000)}s before next email...`);
      await sleep(delay);
    }
  }

  return { sent, failed };
}

export async function verifyConnection() {
  const config = getConfig();

  if (config.email.provider === 'resend') {
    try {
      if (!resendClient) createTransporter();
      const apiKey = config.email.resend.apiKey;
      if (!apiKey || !apiKey.startsWith('re_')) {
        throw new Error('Invalid Resend API key format');
      }
      console.log(`✓ Resend configured`);
      console.log(`  From: ${config.email.from.email}`);
      console.log(`  API Key: ${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`);
      console.log(`  Tip: Send a test email to verify delivery`);
      return true;
    } catch (error) {
      console.error('✗ Resend connection failed:', error.message);
      return false;
    }
  }

  const transport = getTransporter();
  try {
    await transport.verify();
    console.log(`✓ SMTP connected: ${config.email.from.email}`);
    return true;
  } catch (error) {
    console.error('✗ Email connection failed:', error.message);
    return false;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
