#!/usr/bin/env node

import { Command } from 'commander';
import { initDb, getStats, closeDb, contacts, companies, emails } from './db/database.js';
import { processScheduledEmails, verifyConnection } from './email/sender.js';
import { listTemplates, previewTemplate } from './email/templates.js';
import {
  addCompany,
  addContact,
  scheduleEmail,
  processNewContacts,
  markReplied,
  markNotInterested,
  getContactSummary
} from './contacts/manager.js';
import { importCompaniesFromCSV, importContactsFromCSV } from './contacts/import.js';
import { checkReplies, inbox, search, readMessage, getProfile } from './email/reader.js';
import { validateConfig, getConfig } from './utils/config.js';
import logger from './utils/logger.js';

const program = new Command();

program
  .name('job-apply')
  .description('Compliant job application email system')
  .version('0.1.0');

// Initialize database
program
  .command('init')
  .description('Initialize the database')
  .action(() => {
    try {
      initDb();
      logger.success('Database initialized');
    } catch (error) {
      logger.error('Failed to initialize:', error.message);
      process.exit(1);
    }
  });

// Show status
program
  .command('status')
  .description('Show current status and statistics')
  .action(() => {
    try {
      const stats = getStats();
      const config = getConfig();

      logger.header('Job Application System Status');

      console.log('\n📊 Contacts:');
      Object.entries(stats.contacts).forEach(([status, count]) => {
        console.log(`   ${status}: ${count}`);
      });

      console.log('\n📧 Emails:');
      Object.entries(stats.emails).forEach(([status, count]) => {
        console.log(`   ${status}: ${count}`);
      });

      console.log('\n📈 Metrics:');
      console.log(`   Sent today: ${stats.todaySent} / ${config.sending.dailyLimit}`);
      console.log(`   Reply rate: ${stats.replyRate.toFixed(1)}%`);

      logger.divider();
    } catch (error) {
      logger.error('Failed to get status:', error.message);
    }
  });

// Verify email configuration
program
  .command('verify')
  .description('Verify email configuration and connection')
  .action(async () => {
    const configValid = validateConfig();
    if (!configValid) {
      process.exit(1);
    }

    const connected = await verifyConnection();
    process.exit(connected ? 0 : 1);
  });

// Add company
program
  .command('add-company')
  .description('Add a new company')
  .requiredOption('-n, --name <name>', 'Company name')
  .option('-w, --website <url>', 'Company website')
  .option('-i, --industry <industry>', 'Industry (AI, SaaS, Fintech, etc)')
  .option('-s, --size <size>', 'Company size')
  .option('-f, --funding <stage>', 'Funding stage')
  .option('-p, --priority <number>', 'Priority 1-5', '3')
  .option('--source <source>', 'Information source')
  .action((options) => {
    try {
      addCompany({
        name: options.name,
        website: options.website,
        industry: options.industry,
        size: options.size,
        funding_stage: options.funding,
        priority: parseInt(options.priority),
        source: options.source
      });
    } catch (error) {
      logger.error('Failed to add company:', error.message);
    }
  });

// Add contact
program
  .command('add-contact')
  .description('Add a new contact')
  .requiredOption('-e, --email <email>', 'Email address')
  .option('-n, --name <name>', 'Full name')
  .option('-f, --first-name <name>', 'First name')
  .option('-c, --company <name>', 'Company name (will be created if not exists)')
  .option('-t, --title <title>', 'Job title')
  .option('-l, --linkedin <url>', 'LinkedIn URL')
  .option('--source <source>', 'How you found this contact')
  .action((options) => {
    try {
      let companyId = null;

      if (options.company) {
        // Find or create company
        const existing = companies.getAll().find(
          c => c.name.toLowerCase() === options.company.toLowerCase()
        );
        companyId = existing?.id || addCompany({ name: options.company });
      }

      addContact({
        company_id: companyId,
        name: options.name,
        first_name: options.firstName,
        email: options.email,
        title: options.title,
        linkedin: options.linkedin,
        source: options.source
      });
    } catch (error) {
      logger.error('Failed to add contact:', error.message);
    }
  });

// Import from CSV
program
  .command('import')
  .description('Import companies or contacts from CSV')
  .argument('<type>', 'Type to import: companies or contacts')
  .argument('<file>', 'CSV file path')
  .action((type, file) => {
    try {
      if (type === 'companies') {
        importCompaniesFromCSV(file);
      } else if (type === 'contacts') {
        importContactsFromCSV(file);
      } else {
        logger.error('Invalid type. Use "companies" or "contacts"');
      }
    } catch (error) {
      logger.error('Import failed:', error.message);
    }
  });

// List templates
program
  .command('templates')
  .description('List available email templates')
  .option('-p, --preview <name>', 'Preview a specific template')
  .action((options) => {
    if (options.preview) {
      previewTemplate(options.preview);
    } else {
      const templates = listTemplates();
      console.log('\nAvailable templates:');
      templates.forEach(t => console.log(`  - ${t}`));
      console.log('\nUse --preview <name> to preview a template');
    }
  });

// Schedule email for a contact
program
  .command('schedule')
  .description('Schedule an email for a contact')
  .requiredOption('-c, --contact <id>', 'Contact ID')
  .requiredOption('-t, --template <name>', 'Template name')
  .option('-d, --data <json>', 'Custom template data as JSON')
  .action((options) => {
    try {
      const customData = options.data ? JSON.parse(options.data) : {};
      scheduleEmail(parseInt(options.contact), options.template, customData);
    } catch (error) {
      logger.error('Failed to schedule:', error.message);
    }
  });

// Process new contacts (schedule initial emails)
program
  .command('queue')
  .description('Queue emails for new contacts')
  .option('-l, --limit <number>', 'Maximum contacts to process', '10')
  .action((options) => {
    try {
      processNewContacts(parseInt(options.limit));
    } catch (error) {
      logger.error('Failed to queue:', error.message);
    }
  });

// Send scheduled emails
program
  .command('send')
  .description('Send scheduled emails')
  .option('-d, --dry-run', 'Show what would be sent without actually sending')
  .action(async (options) => {
    try {
      const config = getConfig();
      const scheduled = emails.getScheduled(10);

      if (scheduled.length === 0) {
        logger.info('No emails scheduled to send');
        return;
      }

      console.log(`\n📧 ${scheduled.length} emails ready to send:\n`);
      scheduled.forEach((e, i) => {
        console.log(`${i + 1}. To: ${e.to_email}`);
        console.log(`   Subject: ${e.subject}`);
        console.log(`   Company: ${e.company_name || 'N/A'}`);
        console.log();
      });

      if (options.dryRun) {
        logger.info('Dry run - no emails sent');
        return;
      }

      // Confirm before sending
      const todayCount = emails.getTodayCount();
      console.log(`Today's count: ${todayCount}/${config.sending.dailyLimit}`);
      console.log('\nPress Ctrl+C to cancel, or wait 5 seconds to continue...');

      await new Promise(resolve => setTimeout(resolve, 5000));

      const result = await processScheduledEmails();
      logger.success(`Sent: ${result.sent}, Failed: ${result.failed}`);
    } catch (error) {
      logger.error('Send failed:', error.message);
    }
  });

// List contacts
program
  .command('list')
  .description('List contacts')
  .option('-s, --status <status>', 'Filter by status')
  .option('-l, --limit <number>', 'Limit results', '20')
  .action((options) => {
    try {
      const list = contacts.getAll({
        status: options.status,
        limit: parseInt(options.limit)
      });

      if (list.length === 0) {
        logger.info('No contacts found');
        return;
      }

      console.log('\n');
      logger.table(list.map(c => ({
        ID: c.id,
        Name: c.name || c.first_name,
        Email: c.email,
        Company: c.company_name || '-',
        Status: c.status
      })));
    } catch (error) {
      logger.error('Failed to list:', error.message);
    }
  });

// View contact details
program
  .command('view <id>')
  .description('View contact details and email history')
  .action((id) => {
    try {
      const summary = getContactSummary(parseInt(id));
      if (!summary) {
        logger.error('Contact not found');
        return;
      }

      logger.header(`Contact: ${summary.contact.name || summary.contact.email}`);
      console.log(`Email: ${summary.contact.email}`);
      console.log(`Company: ${summary.contact.company_name || 'N/A'}`);
      console.log(`Title: ${summary.contact.title || 'N/A'}`);
      console.log(`Status: ${summary.contact.status}`);
      console.log(`Emails sent: ${summary.sentCount}`);

      if (summary.lastEmail) {
        console.log(`\nLast email: ${summary.lastEmail.subject}`);
        console.log(`Sent at: ${summary.lastEmail.sent_at || 'Not sent'}`);
      }
    } catch (error) {
      logger.error('Failed to view:', error.message);
    }
  });

// Mark contact as replied
program
  .command('replied <id>')
  .description('Mark a contact as replied')
  .action((id) => {
    try {
      markReplied(parseInt(id));
    } catch (error) {
      logger.error('Failed to update:', error.message);
    }
  });

// Mark contact as not interested
program
  .command('not-interested <id>')
  .description('Mark a contact as not interested')
  .option('-b, --blacklist', 'Also add to blacklist')
  .action((id, options) => {
    try {
      markNotInterested(parseInt(id), options.blacklist);
    } catch (error) {
      logger.error('Failed to update:', error.message);
    }
  });

// Check inbox
program
  .command('inbox')
  .description('Show recent inbox messages')
  .option('-n, --count <number>', 'Number of messages', '10')
  .option('-q, --query <query>', 'Gmail search query')
  .action(async (options) => {
    try {
      const messages = options.query
        ? await search(options.query, parseInt(options.count))
        : await inbox(parseInt(options.count));

      if (messages.length === 0) {
        logger.info('No messages found');
        return;
      }

      console.log(`\n📬 ${messages.length} messages:\n`);
      messages.forEach((msg, i) => {
        const unread = msg.labels.includes('UNREAD') ? ' [NEW]' : '';
        console.log(`${i + 1}. ${msg.subject}${unread}`);
        console.log(`   From: ${msg.from}`);
        console.log(`   Date: ${msg.date}`);
        console.log(`   ID: ${msg.id}`);
        console.log();
      });
    } catch (error) {
      logger.error('Failed to read inbox:', error.message);
    }
  });

// Read a specific message
program
  .command('read <messageId>')
  .description('Read a specific email message')
  .action(async (messageId) => {
    try {
      const msg = await readMessage(messageId);

      logger.header(msg.subject);
      console.log(`From: ${msg.from}`);
      console.log(`To: ${msg.to}`);
      console.log(`Date: ${msg.date}`);
      console.log();
      console.log(msg.body);
      logger.divider();
    } catch (error) {
      logger.error('Failed to read message:', error.message);
    }
  });

// Check for replies from contacts
program
  .command('check-replies')
  .description('Auto-detect replies from contacted companies')
  .action(async () => {
    try {
      const replies = await checkReplies();

      if (replies.length === 0) {
        logger.info('No new replies detected');
        return;
      }

      console.log(`\n📩 ${replies.length} replies found:\n`);
      replies.forEach((r, i) => {
        console.log(`${i + 1}. ${r.contact.email} (${r.contact.company_name || 'N/A'})`);
        console.log(`   Subject: ${r.message.subject}`);
        console.log(`   Snippet: ${r.message.snippet}`);
        console.log();
      });
    } catch (error) {
      logger.error('Failed to check replies:', error.message);
    }
  });

// Show Gmail profile
program
  .command('profile')
  .description('Show connected Gmail account info')
  .action(async () => {
    try {
      const p = await getProfile();
      console.log(`\nEmail: ${p.emailAddress}`);
      console.log(`Messages: ${p.messagesTotal}`);
      console.log(`Threads: ${p.threadsTotal}`);
    } catch (error) {
      logger.error('Failed to get profile:', error.message);
    }
  });

// Parse and run
program.parse();

// Cleanup on exit
process.on('exit', () => {
  closeDb();
});

process.on('SIGINT', () => {
  closeDb();
  process.exit(0);
});
