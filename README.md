# Job Auto-Apply

A compliant, small-batch job application email system for reaching out to startups. Send personalized cold emails, track followups, and auto-detect replies.

## Features

- **Send** — Template-based personalized emails via Gmail SMTP
- **Read** — Check inbox and read replies via IMAP
- **Auto-detect** — Automatically find replies from contacted companies
- **Track** — SQLite database for contacts, companies, and email history
- **Safe** — Daily limits, random intervals, send window, blacklist support
- **Compliant** — CAN-SPAM headers, unsubscribe support

## Quick Start (One Command Setup)

```bash
git clone https://github.com/shuaiyy-ux/job-auto-apply.git
cd job-auto-apply
npm install
npm run setup     # Interactive wizard — walks you through everything
```

The setup wizard will:
1. Ask for your Gmail address
2. Guide you to create a Gmail App Password
3. Write your `.env` config
4. Initialize the database
5. Verify your connection
6. Optionally send a test email

### Manual Setup (if you prefer)

```bash
cp .env.example .env     # Edit with your credentials
npm run init-db          # Initialize database
node src/index.js verify # Test connection
```

## Gmail App Password Setup

1. **Enable 2-Step Verification**
   - Go to https://myaccount.google.com/signinoptions/two-step-verification
   - Follow the steps to enable

2. **Create App Password**
   - Go to https://myaccount.google.com/apppasswords
   - App name: `Job Apply`
   - Copy the 16-character password

3. **Configure .env**
   ```bash
   EMAIL_PROVIDER=gmail-app-password
   FROM_EMAIL=your.email@gmail.com
   FROM_NAME=Your Name
   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
   DAILY_LIMIT=25
   ```

4. **Verify connection**
   ```bash
   node src/index.js verify
   ```

## Commands

### Sending
| Command | Description |
|---------|-------------|
| `send` | Send scheduled emails |
| `send --dry-run` | Preview without sending |
| `schedule -c <id> -t <template>` | Schedule email for a contact |
| `queue` | Auto-schedule emails for new contacts |
| `verify` | Test email connection |

### Reading
| Command | Description |
|---------|-------------|
| `inbox` | Show recent inbox messages |
| `inbox -n 20` | Show last 20 messages |
| `inbox -q "keyword"` | Search inbox |
| `read <uid>` | Read full email by UID |
| `check-replies` | Auto-detect replies from contacts |
| `profile` | Show Gmail account info |

### Contacts & Companies
| Command | Description |
|---------|-------------|
| `add-company -n "Name" -i "AI" -p 5` | Add a company |
| `add-contact -e email -n "Name" -c "Company"` | Add a contact |
| `import companies <file.csv>` | Import companies from CSV |
| `import contacts <file.csv>` | Import contacts from CSV |
| `list` | List all contacts |
| `list -s new` | List by status |
| `view <id>` | View contact details |
| `replied <id>` | Mark as replied |
| `not-interested <id>` | Mark as not interested |

### Other
| Command | Description |
|---------|-------------|
| `init` | Initialize database |
| `status` | Show statistics |
| `templates` | List email templates |
| `templates --preview <name>` | Preview a template |

## Email Templates

| Template | Use Case |
|----------|----------|
| `cold_general` | General exploratory email |
| `cold_job_specific` | Applying for a specific role |
| `followup_1` | First followup (3-5 days) |
| `followup_2` | Second followup (8-10 days) |
| `followup_final` | Final followup (15-20 days) |

Customize template data with JSON:
```bash
node src/index.js schedule -c 1 -t cold_general \
  -d '{"specific_detail": "your AI platform", "achievement_1": "Built ML pipelines at scale"}'
```

## CSV Import Format

**companies.csv**
```csv
name,website,industry,size,funding_stage,source,notes,priority
Cool AI,https://cool.ai,AI,30,Series A,YC Directory,Building dev tools,5
```

**contacts.csv**
```csv
company_name,name,first_name,email,title,linkedin,source
Cool AI,Jane Doe,Jane,jane@cool.ai,CTO,https://linkedin.com/in/jane,Company website
```

## Safety Limits

| Setting | Default | Description |
|---------|---------|-------------|
| Daily limit | 25 | Max emails per day |
| Send window | Mon-Fri 9AM-5PM PST | When emails can be sent |
| Interval | 5-15 min (random) | Delay between emails |
| Max followups | 3 | Per contact |
| Blacklist | Enabled | Respects unsubscribe |

## Project Structure

```
job-auto-apply/
├── src/
│   ├── index.js              # CLI entry point
│   ├── db/
│   │   ├── database.js       # SQLite operations
│   │   ├── init.js           # DB initialization
│   │   └── schema.sql        # Table definitions
│   ├── email/
│   │   ├── sender.js         # SMTP sending
│   │   ├── reader.js         # IMAP reading
│   │   ├── templates.js      # Handlebars templates
│   │   └── scheduler.js      # Cron scheduler
│   ├── contacts/
│   │   ├── manager.js        # Contact/company management
│   │   └── import.js         # CSV import/export
│   └── utils/
│       ├── config.js         # Configuration loader
│       └── logger.js         # Colored logging
├── scripts/
│   └── gmail-auth.js         # OAuth2 setup helper (optional)
├── data/
│   ├── templates/            # Email template docs
│   ├── companies_template.csv
│   ├── contacts_template.csv
│   └── SF_STARTUP_SOURCES.md # Startup research sources
├── config/
│   └── config.example.json   # Extended config template
├── .env.example              # Environment template
└── SPEC.md                   # Full project specification
```

## Database Migrations

When updating to a new version, run migrations to update your database schema:

```bash
node src/db/migrate.js
```

To add a new migration, create a file in `src/db/migrations/`:
```
src/db/migrations/002_add_tags.sql
```

## Compliance

This tool is designed for **personal job searching**, not marketing.

- Every email must be personalized
- Respect unsubscribe requests immediately
- Only use publicly available contact info
- Keep volume low — quality over quantity
- No deceptive subject lines

## License

MIT
