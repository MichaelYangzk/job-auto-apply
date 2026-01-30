import { companies, contacts, emails, blacklist } from '../db/database.js';
import { compileTemplate } from '../email/templates.js';
import { getConfig } from '../utils/config.js';
import logger from '../utils/logger.js';

export function addCompany(data) {
  const result = companies.create({
    name: data.name,
    website: data.website || null,
    industry: data.industry || null,
    size: data.size || null,
    location: data.location || 'San Francisco',
    funding_stage: data.funding_stage || null,
    source: data.source || null,
    notes: data.notes || null,
    priority: data.priority || 3
  });

  logger.success(`Company added: ${data.name} (ID: ${result.lastInsertRowid})`);
  return result.lastInsertRowid;
}

export function addContact(data) {
  // Check if already exists
  const existing = contacts.getByEmail(data.email);
  if (existing) {
    logger.warn(`Contact already exists: ${data.email}`);
    return existing.id;
  }

  // Check blacklist
  if (blacklist.check(data.email)) {
    logger.warn(`Email is blacklisted: ${data.email}`);
    return null;
  }

  // Parse name into first/last
  let firstName = data.first_name;
  let lastName = data.last_name;

  if (!firstName && data.name) {
    const parts = data.name.split(' ');
    firstName = parts[0];
    lastName = parts.slice(1).join(' ');
  }

  const result = contacts.create({
    company_id: data.company_id || null,
    name: data.name || `${firstName} ${lastName}`.trim(),
    first_name: firstName || null,
    last_name: lastName || null,
    email: data.email,
    title: data.title || null,
    linkedin: data.linkedin || null,
    source: data.source || null,
    status: 'new'
  });

  logger.success(`Contact added: ${data.email} (ID: ${result.lastInsertRowid})`);
  return result.lastInsertRowid;
}

export function scheduleEmail(contactId, templateName, customData = {}) {
  const contact = contacts.getById(contactId);
  if (!contact) {
    throw new Error(`Contact not found: ${contactId}`);
  }

  // Check blacklist
  if (blacklist.check(contact.email)) {
    logger.warn(`Cannot schedule: ${contact.email} is blacklisted`);
    return null;
  }

  // Compile template
  const templateData = {
    first_name: contact.first_name || contact.name?.split(' ')[0] || 'there',
    company_name: contact.company_name || customData.company_name || '',
    ...customData
  };

  const compiled = compileTemplate(templateName, templateData);

  // Calculate send time
  const config = getConfig();
  const scheduledAt = calculateNextSendTime(config);

  // Count existing emails to determine followup number
  const existingEmails = emails.getByContact(contactId);
  const followupNumber = existingEmails.filter(e => e.status === 'sent').length;

  const result = emails.create({
    contact_id: contactId,
    template_name: templateName,
    subject: compiled.subject,
    body: compiled.body,
    status: 'scheduled',
    scheduled_at: scheduledAt.toISOString(),
    followup_number: followupNumber
  });

  logger.success(`Email scheduled for ${contact.email} at ${scheduledAt.toISOString()}`);
  return result.lastInsertRowid;
}

export function scheduleFollowups(contactId) {
  const contact = contacts.getById(contactId);
  if (!contact) {
    throw new Error(`Contact not found: ${contactId}`);
  }

  const config = getConfig();
  const existingEmails = emails.getByContact(contactId);
  const sentCount = existingEmails.filter(e => e.status === 'sent').length;

  if (sentCount === 0) {
    logger.warn('No initial email sent yet');
    return [];
  }

  if (sentCount >= config.followup.maxFollowups + 1) {
    logger.info('Maximum followups already scheduled/sent');
    return [];
  }

  const lastSentEmail = existingEmails.find(e => e.status === 'sent');
  const lastSubject = lastSentEmail?.subject || '';

  const scheduled = [];

  // Schedule remaining followups
  for (let i = sentCount; i <= config.followup.maxFollowups; i++) {
    let templateName;
    let daysAfterInitial;

    if (i === 1) {
      templateName = 'followup_1';
      daysAfterInitial = config.followup.firstFollowupDays;
    } else if (i === 2) {
      templateName = 'followup_2';
      daysAfterInitial = config.followup.secondFollowupDays;
    } else {
      templateName = 'followup_final';
      daysAfterInitial = config.followup.finalFollowupDays;
    }

    const emailId = scheduleEmail(contactId, templateName, {
      original_subject: lastSubject,
      company_name: contact.company_name
    });

    if (emailId) {
      scheduled.push(emailId);
    }
  }

  return scheduled;
}

export function processNewContacts(limit = 10) {
  const newContacts = contacts.getByStatus('new', limit);
  logger.info(`Found ${newContacts.length} new contacts`);

  const scheduled = [];

  for (const contact of newContacts) {
    try {
      const emailId = scheduleEmail(contact.id, 'cold_general', {
        company_name: contact.company_name,
        specific_detail: '' // Should be customized manually
      });

      if (emailId) {
        scheduled.push(emailId);
      }
    } catch (error) {
      logger.error(`Failed to schedule for ${contact.email}: ${error.message}`);
    }
  }

  logger.success(`Scheduled ${scheduled.length} emails`);
  return scheduled;
}

export function markReplied(contactId) {
  contacts.updateStatus(contactId, 'replied');
  logger.success(`Contact ${contactId} marked as replied`);
}

export function markNotInterested(contactId, addToBlacklist = false) {
  const contact = contacts.getById(contactId);
  contacts.updateStatus(contactId, 'not_interested');

  if (addToBlacklist && contact) {
    blacklist.add(contact.email, 'Marked not interested');
    logger.info(`Added ${contact.email} to blacklist`);
  }

  logger.success(`Contact ${contactId} marked as not interested`);
}

function calculateNextSendTime(config) {
  const now = new Date();
  let sendTime = new Date(now);

  // Check if we're in send window
  const currentHour = sendTime.getHours();
  const startHour = parseInt(config.sending.sendWindowStart.split(':')[0]);
  const endHour = parseInt(config.sending.sendWindowEnd.split(':')[0]);

  // If after send window, move to tomorrow
  if (currentHour >= endHour) {
    sendTime.setDate(sendTime.getDate() + 1);
    sendTime.setHours(startHour, 0, 0, 0);
  }
  // If before send window, set to start
  else if (currentHour < startHour) {
    sendTime.setHours(startHour, 0, 0, 0);
  }
  // Otherwise, use now + random interval
  else {
    const minMs = config.sending.minIntervalMinutes * 60 * 1000;
    const maxMs = config.sending.maxIntervalMinutes * 60 * 1000;
    const randomDelay = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
    sendTime = new Date(now.getTime() + randomDelay);
  }

  // Skip weekends
  while (sendTime.getDay() === 0 || sendTime.getDay() === 6) {
    sendTime.setDate(sendTime.getDate() + 1);
  }

  return sendTime;
}

export function getContactSummary(contactId) {
  const contact = contacts.getById(contactId);
  if (!contact) {
    return null;
  }

  const emailHistory = emails.getByContact(contactId);

  return {
    contact,
    emailCount: emailHistory.length,
    sentCount: emailHistory.filter(e => e.status === 'sent').length,
    lastEmail: emailHistory[0] || null
  };
}
