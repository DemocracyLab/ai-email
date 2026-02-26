# AI Email

AI-powered email personalization tool with Gmail and Google Sheets integration for Google Workspace organizations.

## Features

- **Google Cloud Secret Manager**: Centralized LLM API key management for team-wide use
- **Google Workspace Integration**: OAuth-based authentication for Gmail and Sheets APIs
- **Internal Use Only**: Configured for your organization's workspace members
- **Smart Navigation**: Auto-opens the right tab based on setup completion
- **Auto-Save Configuration**: All settings save automatically on blur
- **Config Tab**: Connect Google account, configure sheets, and select LLM model
- **Context Tab**: Create and edit email templates with variable placeholders
- **Email Tab**: Generate personalized emails, send to contacts, and track status
- **Privacy Protected**: Contact data never sent to AI - only your template
- **Persistent Storage**: Configuration and model selections saved across restarts

## Quick Start

### For Admins/Developers (One-Time Setup)

**Prerequisites:**
1. Google Workspace organization
2. Google Cloud Project with billing enabled
3. Admin access to configure OAuth and Secret Manager

**Setup Steps:**

1. **OAuth Configuration** - See [OAUTH_SETUP.md](OAUTH_SETUP.md)
   - Create Google Cloud Project
   - Enable Gmail API, Google Sheets API, and Secret Manager API
   - Configure OAuth consent screen as "Internal"
   - Create OAuth credentials
   - Add credentials to `.env` file

2. **Secret Manager Setup** - See [SECRET_MANAGER_SETUP.md](SECRET_MANAGER_SETUP.md)
   - Create secret `llm-api-key` in Secret Manager
   - Store your Gemini API key (or OpenAI key)
   - Grant IAM permissions to users
   - Update `GCP_PROJECT_ID` in `.env`

3. **Build and Distribute**
   ```bash
   npm install
   npm run electron:build
   ```
   - Distribute the packaged app to team members
   - Users will authenticate via OAuth on first run

### For End Users

Once the app is set up by your admin:

1. **Launch the app** - It will open on the Configuration tab
2. **Connect Google Account**:
   - Click "Connect Google Account"
   - Authorize in your browser
   - Grant permissions for Gmail, Sheets, and Secret Manager
3. **Configure Integration**:
   - Enter your name and Gmail address (auto-saves on blur)
   - Paste your Google Sheet URL
   - Test the sheet connection
4. **Select LLM Model**:
   - Click "Fetch Models" to load available Gemini models
   - Select your preferred model (e.g., gemini-1.5-flash)
   - Settings save automatically
5. **Create Template** - Navigate to Context tab
   - Write your email template
   - Use `{{firstName}}` and `{{lastName}}` placeholders
6. **Send Emails** - Navigate to Email tab
   - Generate personalized emails with AI
   - Review, edit, and send

The app will remember your settings and automatically open the Email tab on next launch.

See [USER_SETUP_GUIDE.md](USER_SETUP_GUIDE.md) for detailed instructions and troubleshooting.

### For Developers

```bash
# Copy environment template
cp .env.example .env

# Add your OAuth credentials and GCP project ID to .env:
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GCP_PROJECT_ID=your-project-id

# Install dependencies
npm install

# Run in development mode
npm run electron:dev

# Build for production
npm run electron:build
```

## Architecture

### Security Model

- **OAuth 2.0**: All Google API access via user's OAuth tokens
- **Secret Manager**: LLM API key stored centrally, fetched per-request
- **Encrypted Storage**: Configuration stored using electron-store encryption
- **Content Security Policy**: Strict CSP in production, relaxed for HMR in dev
- **Context Isolation**: Electron security best practices enabled

See [SECURITY.md](SECURITY.md) for detailed security architecture.

### Key Components

- **Main Process** (`src/main/`):
  - `index.ts` - Electron app lifecycle and window management
  - `gmail.ts` - Gmail API OAuth and email sending
  - `sheets.ts` - Google Sheets API integration
  - `secrets.ts` - Secret Manager API client
  - `preload.ts` - Secure IPC bridge

- **Renderer Process** (`src/renderer/`):
  - `App.tsx` - Main app with smart tab navigation
  - `components/ConfigTab.tsx` - Auto-save configuration UI
  - `components/ContextTab.tsx` - Template editor
  - `components/EmailTab.tsx` - Email generation and sending
  - `services/llm.ts` - LLM API integration (Gemini/OpenAI)

## Installation & Setup

### For End Users (Download & Run)

1. **Download the app**:
   - Go to the **Releases** page: [https://github.com/democracy-lab/ai-mail/releases](https://github.com/democracy-lab/ai-mail/releases)
   - Look for the latest release (e.g., `v1.0.0`).
   - Download the `ai-mail-setup-X.X.X.exe` (NSIS Installer) or `ai-mail-portable-X.X.X.exe` (Run without installing).

2. **First-time setup**:
   - Launch the app. The "Smart Navigation" will guide you through the initial configuration:
     - **User Info**: Enter your name and work email.
     - **Google Account**: Sign in with your work account (OAuth).
     - **Google Sheet**: Paste the link to your contact spreadsheet.
     - **LLM**: Select your preferred AI model (Gemini/OpenAI).

3. **Secure API Access**:
   The app uses Google Cloud Secret Manager to fetch the shared API key. Ensure your Google account has been granted the `Secret Manager Secret Accessor` role in the GCP project.

### For Developers (Local Build)

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/democracy-lab/ai-email.git
    cd ai-email
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Environment Setup**:
    - Copy `.env.example` to `.env`.
    - Configure `GCP_PROJECT_ID=ai-mail-app-486520`.
    - Follow [OAUTH_SETUP.md](OAUTH_SETUP.md) for Google credentials.

4.  **Run in Development**:
    ```bash
    npm run dev
    ```

5.  **Build for Production**:
    - On Windows, enable **Developer Mode** in settings to allow symbolic links.
    - Run: `npm run electron:build`.

## Usage Guide (Email Workflow)

### 1. Configure Settings (Config Tab)
The app validates and auto-saves all settings:

- **User Information**: Name and Gmail address (validates email format)
- **Google Account**: OAuth connection with test button
- **Google Sheets**: 
  - Paste full spreadsheet URL (auto-extracts ID)
  - Specify sheet tab name
  - Validates required columns
- **LLM Configuration**:
  - Fetch available models from API
  - Select model (saves with cached model list)
  - API key managed centrally via Secret Manager

Status messages appear inline with each section showing success/error feedback.

### 2. Create Template (Context Tab)

- Write your email template in the rich text editor
- Use placeholders: `{{firstName}}`, `{{lastName}}`
- Template auto-saves as you type
- Placeholders replaced locally after AI generation

**Important**: Only the template is sent to the LLM. Contact names are filled in afterwards, preserving privacy.

### 3. Send Emails (Email Tab)

1. **Load Contacts**: Fetches from Google Sheets via API
2. **Generate Email**: 
   - Sends template to LLM
   - LLM creates personalized email structure
   - Placeholders replaced with contact info
3. **Review & Edit**: Full rich-text editing before sending
4. **Send**:
   - Test button sends to yourself
   - Send button uses Gmail API
   - Updates sheet with status and Gmail Message ID
5. **Navigate**: Previous/Next buttons to process multiple contacts

## Google Sheet Structure

**Required columns:**
- `Email Address` - Contact's email
- `First Name` - For {{firstName}} placeholder
- `Last Name` - For {{lastName}} placeholder

**Optional columns** (auto-created if missing):
- `Team Member` - Who sent the email (your name)
- `Status` - sent/skipped/error
- `Date Sent` - Timestamp
- `Gmail Message ID` - For tracking

The app validates column presence and shows clear error messages if sheet structure is incorrect.

## Multi-User Support

Multiple team members can use the app simultaneously:

- Each person authenticates with their own Google account
- Shared LLM API key accessed via Secret Manager (requires IAM permission)
- App updates "Team Member" column after sending
- Contacts with filled "Team Member" column are skipped
- No conflicts or overwrites between users

## Tech Stack

### Core
- **Electron** - Desktop application framework
- **React 18** - UI framework
- **TypeScript** - Type safety throughout
- **Vite** - Fast build tool with HMR

### UI & Styling
- **Tailwind CSS** - Utility-first styling
- **react-quill** - Rich text email editor

### Google Integration
- **googleapis** - Gmail and Sheets API clients
- **google-auth-library** - OAuth 2.0 authentication
- **@google-cloud/secret-manager** - Centralized API key storage

### Storage & Security
- **electron-store** - Encrypted local configuration
- **Content Security Policy** - XSS protection

## Development

### Environment Variables

Required in `.env`:
```env
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx
GCP_PROJECT_ID=your-gcp-project
```

### OAuth Scopes

The app requests these scopes:
- `https://www.googleapis.com/auth/gmail.send` - Send emails
- `https://www.googleapis.com/auth/gmail.readonly` - Test connection
- `https://www.googleapis.com/auth/spreadsheets` - Read/write sheets
- `https://www.googleapis.com/auth/cloud-platform` - Access Secret Manager

### CSP Configuration

- **Development**: Relaxed CSP allows `unsafe-eval` for Vite HMR
- **Production**: Strict CSP with no eval, whitelisted API domains
- See [SECURITY.md](SECURITY.md) for details

## Troubleshooting

### Configuration Issues

**Google Account won't connect**
- Check OAuth credentials in `.env`
- Verify OAuth consent screen is set to "Internal"
- Ensure user is part of your Google Workspace

**Can't access Secret Manager**
- Verify user has "Secret Manager Secret Accessor" IAM role
- Check secret name is exactly `llm-api-key`
- Confirm `GCP_PROJECT_ID` matches your GCP project

**Sheet validation fails**
- Required columns must be exact: `Email Address`, `First Name`, `Last Name`
- Column headers must be in the first row
- Verify user's Google account has edit access to sheet

**Model fetch fails**
- Ensure Secret Manager connection works
- Check API key in Secret Manager is valid
- Try disconnecting and reconnecting Google account

### Email Generation Issues

**LLM errors**
- Verify model is selected in Configuration
- Check API key in Secret Manager is valid
- For Gemini: ensure model name format is correct (e.g., `gemini-1.5-flash`)

**List formatting problems**
- LLM uses single newlines for list items
- Double newlines create paragraph breaks
- Check generated email preview before sending

See [USER_SETUP_GUIDE.md](USER_SETUP_GUIDE.md) for more troubleshooting steps.

## Documentation Files

- **[README.md](README.md)** - This file, overview and quick start
- **[OAUTH_SETUP.md](OAUTH_SETUP.md)** - Complete OAuth configuration guide
- **[SECRET_MANAGER_SETUP.md](SECRET_MANAGER_SETUP.md)** - Secret Manager setup instructions
- **[SECURITY.md](SECURITY.md)** - Security architecture and CSP details
- **[USER_SETUP_GUIDE.md](USER_SETUP_GUIDE.md)** - End-user setup and troubleshooting
- **[spec.md](spec.md)** - Technical specification and architecture

## License

MIT
