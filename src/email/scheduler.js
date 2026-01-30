import cron from 'node-cron';
import { processScheduledEmails } from './sender.js';
import { getConfig, isWithinSendWindow } from '../utils/config.js';
import { getStats, emails } from '../db/database.js';
import logger from '../utils/logger.js';

let schedulerJob = null;

export function startScheduler() {
  const config = getConfig();

  // Run every 15 minutes during send window
  schedulerJob = cron.schedule('*/15 9-17 * * 1-5', async () => {
    if (!isWithinSendWindow()) {
      logger.debug('Outside send window, skipping');
      return;
    }

    const todayCount = emails.getTodayCount();
    if (todayCount >= config.sending.dailyLimit) {
      logger.info(`Daily limit reached (${todayCount}/${config.sending.dailyLimit})`);
      return;
    }

    logger.info('Running scheduled email send...');
    try {
      const result = await processScheduledEmails();
      if (result.sent > 0 || result.failed > 0) {
        logger.info(`Batch complete: ${result.sent} sent, ${result.failed} failed`);
      }
    } catch (error) {
      logger.error('Scheduler error:', error.message);
    }
  }, {
    timezone: config.sending.timezone
  });

  logger.success('Scheduler started (runs every 15 minutes, Mon-Fri 9AM-5PM PST)');
  return schedulerJob;
}

export function stopScheduler() {
  if (schedulerJob) {
    schedulerJob.stop();
    schedulerJob = null;
    logger.info('Scheduler stopped');
  }
}

export function getSchedulerStatus() {
  return {
    running: schedulerJob !== null,
    withinWindow: isWithinSendWindow()
  };
}

// Standalone scheduler runner
if (process.argv[1].endsWith('scheduler.js')) {
  logger.header('Job Application Email Scheduler');

  const config = getConfig();
  console.log(`Daily limit: ${config.sending.dailyLimit}`);
  console.log(`Send window: ${config.sending.sendWindowStart} - ${config.sending.sendWindowEnd}`);
  console.log(`Timezone: ${config.sending.timezone}`);
  console.log();

  startScheduler();

  // Show status every hour
  cron.schedule('0 * * * *', () => {
    const stats = getStats();
    logger.info(`Status: ${stats.todaySent} sent today, ${stats.contacts.new || 0} new contacts`);
  });

  // Keep process running
  process.on('SIGINT', () => {
    stopScheduler();
    process.exit(0);
  });
}
