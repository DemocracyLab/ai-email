# AI Mail

AI-powered email personalization tool with Gmail and Google Sheets integration for Google Workspace organizations.

## Features

- **Google Workspace Integration**: OAuth-based authentication for secure access
- **Internal Use Only**: Configured for your organization's workspace members
- **Config Tab**: Connect Google account, configure sheets, and LLM settings
- **Context Tab**: Create and edit email templates with variable placeholders
- **Email Tab**: Generate personalized emails, send to contacts, and track status
- **Privacy Protected**: Contact data never sent to AI - only your template

## Quick Start

### For Admins/Developers (One-Time Setup)

See **[OAUTH_SETUP.md](OAUTH_SETUP.md)** for complete Google Cloud Console configuration.

**Summary:**
1. Create Google Cloud Project
2. Enable Gmail API and Google Sheets API
3. Configure OAuth consent screen as "Internal"
4. Create OAuth credentials
5. Add credentials to `.env` file
6. Build and distribute app

### For End Users

Once the app is set up by your admin:

1. Open the app and go to Configuration tab
2. Click "Connect Google Account" and authorize in browser
3. Enter your Google Sheet ID and tab name
4. Add your LLM API key (Gemini or OpenAI)
5. Create email template in Context tab
6. Start sending personalized emails!

See **[USER_GUIDE.md](USER_GUIDE.md)** for detailed instructions.

### For Developers

```bash
# Copy environment template
cp .env.example .env

# Add your OAuth credentials to .env
# See OAUTH_SETUP.md for how to get these

# Install dependencies
npm install

# Run in development mode
npm run electron:dev

# Build for production
npm run electron:build
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. User Configuration

Users configure everything through the app interface:
- Gmail address and app password
- Google Sheet share URL  
- LLM provider and API key
- Email templates

No developer setup required!

## Usage

### Development Mode

```bash
npm run electron:dev
```

This starts Vite dev server and Electron in development mode.

### Build for Production

```bash
npm run electron:build
```

This creates a distributable app in the `release` folder.

## How It Works

### 1. Configure (Config Tab):
- Enter your Gmail address
- Get Gmail App Password from Google (requires 2FA)
- Share your Google Sheet publicly
- Add LLM API key (Gemini or OpenAI)
- Set subject line template and signature

### 2. Create Template (Context Tab):
- Write your email template
- Use `{{firstName}}` and `{{lastName}}` for personalization
- Template auto-saves

### 3. Send Emails (Email Tab):
- Generate personalized email with AI
- Review and edit
- Send test to yourself
- Send to contact
- Manually update Google Sheet

## Google Sheet Structure

Required columns (A-D):
- **Email Address** (Column A)
- **First Name** (Column B)
- **Last Name** (Column C)
- **Team Member** (Column D) - Mark with your name after sending

## Privacy & Security

- **Contact data is NOT sent to LLM**: Only template sent to AI
- **Variables replaced locally**: Names filled in after generation
- **App passwords**: More secure than account password
- **Read-only sheet access**: App only reads contacts

## Multi-User Support

Multiple team members can use different instances of the app on the same Google Sheet:
- Each person manually updates "Team Member" column after sending
- App skips contacts where "Team Member" is filled
- Simple coordination without conflicts

## Tech Stack

- **Electron**: Desktop application framework
- **React**: UI framework
- **TypeScript**: Type safety
- **Vite**: Fast build tool
- **Tailwind CSS**: Styling
- **react-quill**: Rich text editor
- **nodemailer**: Gmail SMTP email sending
- **electron-store**: Secure config storage

## Troubleshooting

See [USER_SETUP_GUIDE.md](USER_SETUP_GUIDE.md) for detailed troubleshooting steps.

**Common issues:**
- Gmail connection failed → Check app password
- Sheet connection failed → Verify sheet is publicly shared
- No contacts found → Check "Team Member" column is empty for unsent

## License

MIT
