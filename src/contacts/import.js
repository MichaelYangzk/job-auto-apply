import { readFileSync } from 'fs';
import { addCompany, addContact } from './manager.js';
import { companies } from '../db/database.js';
import logger from '../utils/logger.js';

export function importCompaniesFromCSV(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length < 2) {
    throw new Error('CSV file must have a header and at least one data row');
  }

  const headers = parseCSVLine(lines[0]);
  const results = { added: 0, failed: 0, errors: [] };

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const data = {};

    headers.forEach((header, index) => {
      data[header.trim()] = values[index]?.trim() || null;
    });

    try {
      addCompany({
        name: data.name,
        website: data.website,
        industry: data.industry,
        size: data.size,
        funding_stage: data.funding_stage,
        source: data.source,
        notes: data.notes,
        priority: parseInt(data.priority) || 3
      });
      results.added++;
    } catch (error) {
      results.failed++;
      results.errors.push(`Row ${i + 1}: ${error.message}`);
    }
  }

  logger.info(`Imported ${results.added} companies, ${results.failed} failed`);
  return results;
}

export function importContactsFromCSV(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length < 2) {
    throw new Error('CSV file must have a header and at least one data row');
  }

  const headers = parseCSVLine(lines[0]);
  const results = { added: 0, skipped: 0, failed: 0, errors: [] };

  // Get all companies for matching
  const allCompanies = companies.getAll();
  const companyMap = new Map(allCompanies.map(c => [c.name.toLowerCase(), c.id]));

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const data = {};

    headers.forEach((header, index) => {
      data[header.trim()] = values[index]?.trim() || null;
    });

    if (!data.email) {
      results.failed++;
      results.errors.push(`Row ${i + 1}: Missing email`);
      continue;
    }

    try {
      // Try to match company
      let companyId = null;
      if (data.company_name) {
        companyId = companyMap.get(data.company_name.toLowerCase());

        // If company doesn't exist, create it
        if (!companyId) {
          companyId = addCompany({ name: data.company_name });
          companyMap.set(data.company_name.toLowerCase(), companyId);
        }
      }

      const contactId = addContact({
        company_id: companyId,
        name: data.name,
        first_name: data.first_name,
        email: data.email,
        title: data.title,
        linkedin: data.linkedin,
        source: data.source
      });

      if (contactId) {
        results.added++;
      } else {
        results.skipped++;
      }
    } catch (error) {
      results.failed++;
      results.errors.push(`Row ${i + 1}: ${error.message}`);
    }
  }

  logger.info(`Imported ${results.added} contacts, ${results.skipped} skipped, ${results.failed} failed`);
  return results;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

export function exportContactsToCSV(status = null) {
  const contactList = status
    ? contacts.getByStatus(status)
    : contacts.getAll();

  const headers = ['id', 'company_name', 'name', 'email', 'title', 'status', 'linkedin', 'source', 'created_at'];
  const lines = [headers.join(',')];

  for (const contact of contactList) {
    const row = headers.map(h => {
      const value = contact[h] || '';
      // Escape quotes and wrap in quotes if contains comma
      if (value.includes(',') || value.includes('"')) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    lines.push(row.join(','));
  }

  return lines.join('\n');
}
