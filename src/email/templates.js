import Handlebars from 'handlebars';
import { getConfig } from '../utils/config.js';

// Built-in templates
const TEMPLATES = {
  cold_general: {
    subject: '{{your_skill}} engineer interested in {{company_name}}',
    body: `Hi {{first_name}},

I'm {{your_name}}, a {{your_title}} with {{years_experience}} years of experience in {{your_specialty}}.

I've been following {{company_name}}'s work{{#if specific_detail}} on {{specific_detail}}{{/if}}, and I'm impressed by what you're building.

My background includes:
• {{achievement_1}}
• {{achievement_2}}

I'd love to learn more about {{company_name}}'s technical challenges. Would you have 15 minutes for a quick chat?

Best,
{{your_name}}
{{your_linkedin}}
{{#if unsubscribe}}

---
Reply with "unsubscribe" to stop receiving emails
{{/if}}`
  },

  cold_job_specific: {
    subject: '{{job_title}} application - {{your_name}}',
    body: `Hi {{first_name}},

I saw the {{job_title}} opening at {{company_name}} and believe I'm a strong fit.

Why I'm excited about this role:
{{company_name}}'s mission resonates with me{{#if personal_reason}} because {{personal_reason}}{{/if}}.

What I bring:
• {{skill_1}}
• {{skill_2}}
• {{skill_3}}

I've attached my resume. Happy to share more details if helpful.

Looking forward to hearing from you.

Best,
{{your_name}}
{{your_portfolio}}
{{#if unsubscribe}}

---
Reply with "unsubscribe" to stop receiving emails
{{/if}}`
  },

  followup_1: {
    subject: 'Re: {{original_subject}}',
    body: `Hi {{first_name}},

Following up on my note from last week. I know inboxes get busy.

{{#if new_info}}To add some context: {{new_info}}{{/if}}

Would love to connect if there's interest.

Best,
{{your_name}}`
  },

  followup_2: {
    subject: 'Re: {{original_subject}}',
    body: `Hi {{first_name}},

One more follow-up{{#if resource}} - I wanted to share something that might be useful:

{{resource}}{{/if}}

Still interested in connecting when timing works.

Best,
{{your_name}}`
  },

  followup_final: {
    subject: 'Re: {{original_subject}}',
    body: `Hi {{first_name}},

Last note from me - I don't want to clutter your inbox.

If {{company_name}} has openings in the future that match my background ({{your_specialty}}), I'd love to hear about them.

Feel free to reach out anytime: {{your_email}}

Wishing you and the team continued success.

Best,
{{your_name}}`
  }
};

// Register Handlebars helpers
Handlebars.registerHelper('if', function(conditional, options) {
  if (conditional) {
    return options.fn(this);
  }
  return options.inverse ? options.inverse(this) : '';
});

export function getTemplate(name) {
  const template = TEMPLATES[name];
  if (!template) {
    throw new Error(`Template not found: ${name}`);
  }
  return template;
}

export function listTemplates() {
  return Object.keys(TEMPLATES);
}

export function compileTemplate(name, data) {
  const config = getConfig();
  const template = getTemplate(name);

  // Merge user config with provided data
  const mergedData = {
    your_name: config.user?.name || '',
    your_title: config.user?.title || '',
    your_specialty: config.user?.specialty || '',
    years_experience: config.user?.yearsExperience || '',
    your_linkedin: config.user?.linkedin || '',
    your_portfolio: config.user?.portfolio || '',
    your_github: config.user?.github || '',
    your_email: config.email?.from?.email || '',
    unsubscribe: config.compliance?.includeUnsubscribe || false,
    ...data
  };

  const subjectTemplate = Handlebars.compile(template.subject);
  const bodyTemplate = Handlebars.compile(template.body);

  return {
    subject: subjectTemplate(mergedData),
    body: bodyTemplate(mergedData)
  };
}

export function previewTemplate(name, data = {}) {
  const compiled = compileTemplate(name, {
    first_name: 'John',
    company_name: 'Example Corp',
    job_title: 'Software Engineer',
    specific_detail: 'your AI platform',
    achievement_1: 'Built scalable systems serving 1M+ users',
    achievement_2: 'Led a team of 5 engineers',
    skill_1: 'Python/Node.js: 5 years of production experience',
    skill_2: 'System design: Built microservices architecture',
    skill_3: 'Leadership: Mentored junior engineers',
    original_subject: 'Software Engineer interested in Example Corp',
    ...data
  });

  console.log('=== SUBJECT ===');
  console.log(compiled.subject);
  console.log('\n=== BODY ===');
  console.log(compiled.body);
  console.log('===============');

  return compiled;
}

export function addCustomTemplate(name, subject, body) {
  if (TEMPLATES[name]) {
    throw new Error(`Template already exists: ${name}`);
  }
  TEMPLATES[name] = { subject, body };
  console.log(`Template added: ${name}`);
}
