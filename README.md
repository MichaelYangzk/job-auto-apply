# Job Auto-Apply

A compliant, small-batch job application email system for reaching out to startups. Send personalized cold emails, track followups, and auto-detect replies.

## Features

- **Send** — Template-based personalized emails via Resend, Gmail SMTP, or SendGrid
- **Read** — Check inbox and read replies via IMAP
- **Auto-detect** — Automatically find replies from contacted companies
- **Track** — SQLite database for contacts, companies, and email history
- **Safe** — Daily limits, random intervals, send window, blacklist support
- **Compliant** — CAN-SPAM headers, unsubscribe support

## Quick Start

```bash
git clone https://github.com/MichaelYangzk/job-auto-apply.git
cd job-auto-apply
npm install
cp .env.example .env   # Then follow the setup guide below
```

---

## Why Not Gmail?

If you're thinking "I'll just use my Gmail account" — don't.

I tried. My Gmail got **permanently disabled after sending just 2 emails**. Google flagged the account for "violating policies" with zero warning and no appeal. The emails weren't spam — they were personalized job application outreach to real companies.

The problem is that Gmail was never designed for programmatic sending. When you send via SMTP from a server/container environment, Google sees:
- Unfamiliar IP address (not your laptop)
- Non-browser user agent
- Repeated SMTP auth from an unusual location

This looks like a compromised account to Google's automated systems, and they kill first, ask never.

**The solution:** Use your own domain with a proper email sending API. Total cost: ~$10/year for a domain. Everything else is free tier.

---

## Setup Guide: Custom Domain Email (Free)

This guide walks you through setting up a professional email system using your own domain. The entire stack is free (minus the domain).

### What You're Building

```
You write email  →  Resend API sends it  →  recipient@company.com
                    from: you@yourdomain.com
                    reply-to: reply@yourdomain.com

Recipient replies →  reply@yourdomain.com  →  Cloudflare routes it  →  your Gmail inbox
```

**Sending** is handled by [Resend](https://resend.com) (email API, 3000 emails/month free).
**Receiving** is handled by [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/) (free, unlimited).
**DNS** is managed by [Cloudflare](https://cloudflare.com) (free).

### Platform Dependencies

| Service | Purpose | Cost |
|---------|---------|------|
| [Cloudflare](https://cloudflare.com) | DNS + email routing (receive replies) | Free |
| [Resend](https://resend.com) | Email sending API | Free (3000/month) |
| Domain registrar | Your custom domain | ~$10-15/year |
| Gmail | Where forwarded replies land | Free (you already have this) |
| [Notion](https://notion.so) | Email tracking dashboard ([email_to_notion](https://github.com/MichaelYangzk/email_to_notion)) | Free, optional |

### Step 1: Buy a Domain

Buy a domain from any registrar — Namecheap, GoDaddy, Cloudflare Registrar, etc.

Pick something professional that relates to your name:
- `yourname.dev`
- `yourname.ai`
- `firstnamelastname.com`

> Don't overthink it. Recruiters care about the email content, not whether your domain is `.com` or `.ai`.

### Step 2: Move DNS to Cloudflare

You need Cloudflare managing your DNS because we'll use their free email routing later.

1. Create a free account at [cloudflare.com](https://cloudflare.com)
2. Click **Add a Site** → enter your domain
3. Select the **Free** plan
4. Cloudflare gives you two nameservers (e.g. `anna.ns.cloudflare.com`, `bob.ns.cloudflare.com`)
5. Go to your domain registrar → find **Nameservers** settings → replace with Cloudflare's
6. Back in Cloudflare → click **Check Nameservers**
7. Wait for propagation (usually minutes, max 24 hours)

You'll know it's working when Cloudflare shows your domain status as **Active**.

### Step 3: Set Up Resend (Sending Emails)

Resend is the API that actually sends your emails. It handles SPF, DKIM, and deliverability so your emails don't land in spam.

1. Create account at [resend.com](https://resend.com)
2. Go to **Domains** → **Add Domain** → type your domain name
3. Resend shows you 3 DNS records to add. Go to **Cloudflare Dashboard** → your domain → **DNS** → **Records** and add each one:

   | Type | Name | Content | Priority | Proxy |
   |------|------|---------|----------|-------|
   | TXT | `resend._domainkey` | *(long DKIM key from Resend)* | — | DNS only |
   | MX | `send` | `feedback-smtp.us-east-1.amazonses.com` | 10 | DNS only |
   | TXT | `send` | `v=spf1 include:amazonses.com ~all` | — | DNS only |

4. Also add a DMARC record (Resend doesn't require this, but it improves deliverability):

   | Type | Name | Content | Proxy |
   |------|------|---------|-------|
   | TXT | `_dmarc` | `v=DMARC1; p=none;` | DNS only |

5. Back in Resend → click **Verify DNS** → wait for all green checkmarks
6. Go to [resend.com/api-keys](https://resend.com/api-keys) → **Create API Key** → copy it

> The DKIM record is long (300+ chars). Copy-paste carefully — one wrong character and verification fails.

### Step 4: Set Up Cloudflare Email Routing (Receiving Replies)

Your domain can now **send** emails, but it can't **receive** them yet. Cloudflare Email Routing forwards incoming emails to your Gmail for free.

1. In Cloudflare Dashboard → select your domain → left sidebar → **Email** → **Email Routing**
2. Click **Enable Email Routing** (Cloudflare auto-adds the required MX records)
3. **Destination addresses** tab → **Add destination** → enter your Gmail address → click the verification link in your Gmail
4. **Routing rules** tab → **Create rule**:
   - **Custom address**: `reply` (this becomes `reply@yourdomain.com`)
   - **Action**: Forward to
   - **Destination**: your Gmail address
   - Save

Now when a recruiter replies to your cold email, it goes to `reply@yourdomain.com` → Cloudflare → your Gmail inbox.

> Optional: Create a **Catch-all** rule to forward *any* `@yourdomain.com` address to your Gmail. Useful if someone manually types your from address instead of hitting reply.

### Step 5: Configure the App

```bash
cp .env.example .env
```

Edit `.env`:
```bash
EMAIL_PROVIDER=resend
FROM_EMAIL=yourname@yourdomain.com
FROM_NAME=Your Name
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
REPLY_TO=reply@yourdomain.com
DAILY_LIMIT=25
```

### Step 6: Verify and Send

```bash
node src/index.js verify    # Checks Resend connection
node src/index.js send      # Sends scheduled emails
```

That's it. You now have a professional email setup that:
- Sends from `yourname@yourdomain.com` (not a sketchy Gmail)
- Receives replies in your existing Gmail inbox
- Won't get your personal accounts banned
- Has proper SPF/DKIM/DMARC for deliverability
- Costs ~$10/year total

---

## Alternative: Gmail App Password (Not Recommended)

> **Warning:** Gmail may permanently disable accounts used for programmatic sending, even at very low volume (2 emails was enough to get banned in our case). Your account may not be recoverable. Use at your own risk.

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
