# Job Auto-Apply

A compliant, small-batch job application email system for reaching out to startups. Send personalized cold emails, track followups, and auto-detect replies.

## Features

- **Send** — Template-based personalized emails via Resend, Gmail SMTP, or SendGrid
- **Read** — Check inbox and read replies via IMAP
- **Auto-detect** — Automatically find replies from contacted companies
- **Track** — SQLite database for contacts, companies, and email history
- **Safe** — Daily limits, random intervals, send window, blacklist support
- **Compliant** — CAN-SPAM headers, unsubscribe support

## Platform Dependencies

| Service | Purpose | Free Tier | Required |
|---------|---------|-----------|----------|
| [Resend](https://resend.com) | Email sending API | 100 emails/day, 3000/month | Yes (recommended provider) |
| [Cloudflare](https://cloudflare.com) | DNS + Email Routing (receive replies) | Free | Yes |
| Domain registrar | Custom domain (e.g. `yourname.dev`) | ~$10-15/year | Yes |
| [Notion](https://notion.so) | Email tracking dashboard (via [email_to_notion](https://github.com/MichaelYangzk/email_to_notion)) | Free | Optional |

## Quick Start

```bash
git clone https://github.com/MichaelYangzk/job-auto-apply.git
cd job-auto-apply
npm install
```

## Email Provider Setup (Recommended: Resend + Custom Domain)

Using a custom domain with Resend avoids Gmail account bans and gives you full control over deliverability.

### Step 1: Buy a Domain

Buy a domain from any registrar (Namecheap, GoDaddy, Cloudflare Registrar, etc.).

> Tip: Use a domain that looks professional and relates to your name (e.g. `yourname.dev`, `yourname.ai`).

### Step 2: Move DNS to Cloudflare

1. Create a free account at [cloudflare.com](https://cloudflare.com)
2. Add your domain → Cloudflare gives you two nameservers
3. Go to your domain registrar → change nameservers to Cloudflare's
4. Wait for DNS propagation (usually < 1 hour)

### Step 3: Set Up Resend (Sending)

1. Create account at [resend.com](https://resend.com)
2. Go to **Domains** → **Add Domain** → enter your domain
3. Resend gives you 3 DNS records. Add them in Cloudflare DNS:

   | Type | Name | Content | Priority |
   |------|------|---------|----------|
   | TXT | `resend._domainkey` | `p=MIGfMA0GCS...` (DKIM key) | — |
   | MX | `send` | `feedback-smtp.us-east-1.amazonses.com` | 10 |
   | TXT | `send` | `v=spf1 include:amazonses.com ~all` | — |

4. (Recommended) Add a DMARC record:

   | Type | Name | Content |
   |------|------|---------|
   | TXT | `_dmarc` | `v=DMARC1; p=none;` |

5. Back in Resend → click **Verify DNS** → wait for green checkmarks
6. Copy your API key from [resend.com/api-keys](https://resend.com/api-keys)

### Step 4: Set Up Cloudflare Email Routing (Receiving Replies)

1. In Cloudflare Dashboard → select your domain → **Email** → **Email Routing**
2. Enable Email Routing
3. **Destination addresses** → add your personal Gmail (e.g. `you@gmail.com`) → verify via email
4. **Routing rules** → create a rule:
   - Custom address: `reply@yourdomain.com`
   - Action: Forward to → `you@gmail.com`

Now when someone replies to your cold email, it arrives in your Gmail inbox.

### Step 5: Configure .env

```bash
EMAIL_PROVIDER=resend
FROM_EMAIL=yourname@yourdomain.com
FROM_NAME=Your Name
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
REPLY_TO=reply@yourdomain.com
DAILY_LIMIT=25
```

### Step 6: Verify and Test

```bash
node src/index.js verify    # Check Resend connection
node src/index.js send      # Send scheduled emails
```

## Alternative: Gmail App Password Setup

> Warning: Gmail may disable accounts used for cold outreach, even at low volume. Use at your own risk.

1. Enable 2-Step Verification at https://myaccount.google.com/signinoptions/two-step-verification
2. Create App Password at https://myaccount.google.com/apppasswords
3. Configure `.env`:
   ```bash
   EMAIL_PROVIDER=gmail-app-password
   FROM_EMAIL=your.email@gmail.com
   FROM_NAME=Your Name
   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
   DAILY_LIMIT=25
   ```
4. Verify: `node src/index.js verify`

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

## Supported Email Providers

| Provider | Config `EMAIL_PROVIDER` | Notes |
|----------|------------------------|-------|
| **Resend** | `resend` | Recommended. Requires custom domain. |
| Gmail App Password | `gmail-app-password` | Risk of account ban. |
| SendGrid | `sendgrid` | Enterprise-grade, generous free tier. |
| Custom SMTP | `smtp` | Any SMTP server. |

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
│   │   ├── sender.js         # Email sending (Resend / SMTP)
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
