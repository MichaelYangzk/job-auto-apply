import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../..');

// Load .env file
dotenv.config({ path: join(PROJECT_ROOT, '.env') });

let config = null;

const DEFAULT_CONFIG = {
  email: {
    provider: process.env.EMAIL_PROVIDER || 'gmail',
    from: {
      name: process.env.FROM_NAME || 'Your Name',
      email: process.env.FROM_EMAIL || ''
    },
    replyTo: process.env.REPLY_TO || '',
    gmailAppPassword: process.env.GMAIL_APP_PASSWORD || '',
    gmail: {
      clientId: process.env.GMAIL_CLIENT_ID || '',
      clientSecret: process.env.GMAIL_CLIENT_SECRET || '',
      refreshToken: process.env.GMAIL_REFRESH_TOKEN || ''
    },
    sendgrid: {
      apiKey: process.env.SENDGRID_API_KEY || ''
    },
    resend: {
      apiKey: process.env.RESEND_API_KEY || ''
    }
  },
  sending: {
    dailyLimit: parseInt(process.env.DAILY_LIMIT) || 25,
    minIntervalMinutes: 5,
    maxIntervalMinutes: 15,
    sendWindowStart: '09:00',
    sendWindowEnd: '17:00',
    timezone: 'America/Los_Angeles',
    sendDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  },
  followup: {
    firstFollowupDays: 4,
    secondFollowupDays: 10,
    finalFollowupDays: 18,
    maxFollowups: 3
  },
  user: {
    name: process.env.FROM_NAME || '',
    title: '',
    specialty: '',
    yearsExperience: 0,
    linkedin: '',
    portfolio: '',
    github: ''
  },
  compliance: {
    includeUnsubscribe: true,
    physicalAddress: '',
    respectBlacklist: true
  }
};

export function loadConfig() {
  const configPath = join(PROJECT_ROOT, 'config/config.json');

  if (existsSync(configPath)) {
    try {
      const fileConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
      config = deepMerge(DEFAULT_CONFIG, fileConfig);
    } catch (error) {
      console.warn('Failed to load config.json, using defaults:', error.message);
      config = DEFAULT_CONFIG;
    }
  } else {
    config = DEFAULT_CONFIG;
  }

  return config;
}

export function getConfig() {
  if (!config) {
    loadConfig();
  }
  return config;
}

export function validateConfig() {
  const cfg = getConfig();
  const errors = [];

  // Required email settings
  if (!cfg.email.from.email) {
    errors.push('FROM_EMAIL is required');
  }

  if (cfg.email.provider === 'gmail-app-password') {
    if (!cfg.email.gmailAppPassword) errors.push('GMAIL_APP_PASSWORD is required');
  } else if (cfg.email.provider === 'gmail') {
    if (!cfg.email.gmail.clientId) errors.push('GMAIL_CLIENT_ID is required');
    if (!cfg.email.gmail.clientSecret) errors.push('GMAIL_CLIENT_SECRET is required');
    if (!cfg.email.gmail.refreshToken) errors.push('GMAIL_REFRESH_TOKEN is required');
  } else if (cfg.email.provider === 'sendgrid') {
    if (!cfg.email.sendgrid.apiKey) errors.push('SENDGRID_API_KEY is required');
  } else if (cfg.email.provider === 'resend') {
    if (!cfg.email.resend.apiKey) errors.push('RESEND_API_KEY is required');
  }

  // Sending limits
  if (cfg.sending.dailyLimit > 100) {
    errors.push('dailyLimit should not exceed 100 to avoid spam detection');
  }

  if (errors.length > 0) {
    console.error('Configuration errors:');
    errors.forEach(e => console.error(`  - ${e}`));
    return false;
  }

  return true;
}

function deepMerge(target, source) {
  const output = { ...target };

  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      output[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      output[key] = source[key];
    }
  }

  return output;
}

export function isWithinSendWindow() {
  const cfg = getConfig();
  const now = new Date();

  // Check day of week
  const dayName = now.toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: cfg.sending.timezone
  });

  if (!cfg.sending.sendDays.includes(dayName)) {
    return false;
  }

  // Check time window
  const timeStr = now.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    timeZone: cfg.sending.timezone
  });

  return timeStr >= cfg.sending.sendWindowStart && timeStr <= cfg.sending.sendWindowEnd;
}
