#!/usr/bin/env node

/**
 * Gmail OAuth2 Setup Helper
 *
 * This script helps you obtain a refresh token for Gmail API access.
 *
 * Prerequisites:
 *   1. Go to https://console.cloud.google.com/
 *   2. Create a new project (or select existing)
 *   3. Enable Gmail API:
 *      - APIs & Services → Library → search "Gmail API" → Enable
 *   4. Create OAuth2 credentials:
 *      - APIs & Services → Credentials → Create Credentials → OAuth Client ID
 *      - Application type: "Desktop app"
 *      - Download the JSON or copy Client ID + Client Secret
 *   5. Configure OAuth consent screen:
 *      - APIs & Services → OAuth consent screen
 *      - User Type: External (or Internal if Google Workspace)
 *      - Add your email as a test user
 *
 * Usage:
 *   node scripts/gmail-auth.js --client-id YOUR_ID --client-secret YOUR_SECRET
 */

import { google } from 'googleapis';
import http from 'http';
import { URL } from 'url';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify'
];
const REDIRECT_PORT = 3000;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;

// Parse arguments
const args = process.argv.slice(2);
let clientId = '';
let clientSecret = '';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--client-id' && args[i + 1]) {
    clientId = args[i + 1];
    i++;
  } else if (args[i] === '--client-secret' && args[i + 1]) {
    clientSecret = args[i + 1];
    i++;
  } else if (args[i] === '--help') {
    printHelp();
    process.exit(0);
  }
}

// Try loading from .env if not provided as args
if (!clientId || !clientSecret) {
  const envPath = join(PROJECT_ROOT, '.env');
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf-8');
    const envVars = {};
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^#=]+)=(.*)$/);
      if (match) {
        envVars[match[1].trim()] = match[2].trim();
      }
    });
    clientId = clientId || envVars.GMAIL_CLIENT_ID || '';
    clientSecret = clientSecret || envVars.GMAIL_CLIENT_SECRET || '';
  }
}

if (!clientId || !clientSecret) {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║         Gmail OAuth2 Setup Helper                 ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log();
  console.log('Missing credentials. Please provide Client ID and Secret.');
  console.log();
  printHelp();
  process.exit(1);
}

async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║         Gmail OAuth2 Setup Helper                 ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log();

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });

  console.log('Step 1: Open this URL in your browser to authorize:\n');
  console.log(`  ${authUrl}\n`);

  // Start local server to catch the redirect
  const code = await waitForAuthCode();

  console.log('\nStep 2: Exchanging authorization code for tokens...\n');

  try {
    const { tokens } = await oauth2Client.getToken(code);

    console.log('✓ Tokens obtained successfully!\n');
    console.log('─────────────────────────────────────────');
    console.log('Add these to your .env file:\n');
    console.log(`GMAIL_CLIENT_ID=${clientId}`);
    console.log(`GMAIL_CLIENT_SECRET=${clientSecret}`);
    console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('─────────────────────────────────────────\n');

    // Offer to write to .env
    const envPath = join(PROJECT_ROOT, '.env');
    if (existsSync(envPath)) {
      let envContent = readFileSync(envPath, 'utf-8');

      envContent = replaceOrAppendEnv(envContent, 'GMAIL_CLIENT_ID', clientId);
      envContent = replaceOrAppendEnv(envContent, 'GMAIL_CLIENT_SECRET', clientSecret);
      envContent = replaceOrAppendEnv(envContent, 'GMAIL_REFRESH_TOKEN', tokens.refresh_token);

      writeFileSync(envPath, envContent);
      console.log('✓ Updated .env file automatically\n');
    } else {
      const envContent = [
        'EMAIL_PROVIDER=gmail',
        `FROM_EMAIL=`,
        `FROM_NAME=`,
        `GMAIL_CLIENT_ID=${clientId}`,
        `GMAIL_CLIENT_SECRET=${clientSecret}`,
        `GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`,
        'DAILY_LIMIT=25'
      ].join('\n') + '\n';

      writeFileSync(envPath, envContent);
      console.log('✓ Created .env file\n');
      console.log('⚠ Remember to fill in FROM_EMAIL and FROM_NAME in .env\n');
    }

    // Test the connection
    console.log('Step 3: Testing Gmail connection...\n');

    oauth2Client.setCredentials(tokens);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });

    console.log(`✓ Connected as: ${profile.data.emailAddress}`);
    console.log(`  Total messages: ${profile.data.messagesTotal}\n`);

    // Update FROM_EMAIL if not set
    if (existsSync(envPath)) {
      let envContent = readFileSync(envPath, 'utf-8');
      if (envContent.includes('FROM_EMAIL=\n') || envContent.includes('FROM_EMAIL=your')) {
        envContent = replaceOrAppendEnv(envContent, 'FROM_EMAIL', profile.data.emailAddress);
        writeFileSync(envPath, envContent);
        console.log(`✓ Set FROM_EMAIL to ${profile.data.emailAddress}\n`);
      }
    }

    console.log('Setup complete! You can now use the email system.');

  } catch (error) {
    console.error('✗ Failed to obtain tokens:', error.message);
    console.error('\nCommon issues:');
    console.error('  - Client ID/Secret are incorrect');
    console.error('  - Gmail API is not enabled in Google Cloud Console');
    console.error('  - Your email is not added as a test user in OAuth consent screen');
    process.exit(1);
  }
}

function waitForAuthCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);

      if (url.pathname === '/callback') {
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<h1>Authorization failed</h1><p>You can close this tab.</p>');
          server.close();
          reject(new Error(`Authorization denied: ${error}`));
          return;
        }

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html><body style="font-family:sans-serif;text-align:center;padding:50px">
              <h1>Authorization successful!</h1>
              <p>You can close this tab and return to the terminal.</p>
            </body></html>
          `);
          server.close();
          resolve(code);
        }
      }
    });

    server.listen(REDIRECT_PORT, () => {
      console.log(`Waiting for authorization on http://localhost:${REDIRECT_PORT}/callback ...\n`);
      console.log('(If the browser does not open automatically, copy the URL above)\n');
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authorization timed out (5 minutes)'));
    }, 5 * 60 * 1000);
  });
}

function replaceOrAppendEnv(content, key, value) {
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    return content.replace(regex, `${key}=${value}`);
  }
  return content.trimEnd() + `\n${key}=${value}\n`;
}

function printHelp() {
  console.log('Usage:');
  console.log('  node scripts/gmail-auth.js --client-id ID --client-secret SECRET');
  console.log();
  console.log('Or set in .env file:');
  console.log('  GMAIL_CLIENT_ID=your-client-id');
  console.log('  GMAIL_CLIENT_SECRET=your-client-secret');
  console.log();
  console.log('How to get credentials:');
  console.log('  1. Go to https://console.cloud.google.com/');
  console.log('  2. Create project → Enable Gmail API');
  console.log('  3. Credentials → Create → OAuth Client ID → Desktop app');
  console.log('  4. Copy Client ID and Client Secret');
  console.log('  5. OAuth consent screen → Add your email as test user');
}

main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
