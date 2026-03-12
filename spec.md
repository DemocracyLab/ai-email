# AI Mail - Specification

## Summary

An electron/react app that allows the user to send emails to a list, where the email body is ai customized based on the context in local txt file, and the contact list comes from a google sheet. The user is able to review the email generated, make modifications, and then send. Sending is done through Gmail from the user. When an email is sent, the contact entry is updated with the date sent and Gmail message ID.

**dF: This app is designed for Google Workspace organizations and uses OAuth for secure, internal-only access.**

## Technical Stack

### Core Technologies
- **Electron**: Desktop application framework
- **React**: UI framework
- **TypeScript**: Primary language
- **Vite**: Build tool for fast development
- **Tailwind CSS**: Styling

### Key Libraries
- **Email Sending**:
  - `googleapis`: Gmail API with OAuth 2.0
  - OAuth refresh tokens for authentication (Internal workspace app)
- **Google Sheets**:
  - `googleapis`: Google Sheets API with OAuth 2.0
  - Full read/write access via OAuth
  - Automatic status updates after sending
- **LLM Integration**:
  - Support for multiple providers: Google Gemini and OpenAI GPT
  - Direct API calls
- **Rich Text Editor**:
  - `react-quill` for context editing
- **State Management**: 
  - React Context API for state management
- **Data Storage**:
  - `electron-store` for secure credential storage with encryption

## Implementation Details

### Application Structure
```
ai-mail/
├── src/
│   ├── main/              # Electron main process
│   │   ├── index.ts       # Main entry point
│   │   ├── gmail.ts       # Gmail API handlers
│   │   └── sheets.ts      # Google Sheets API handlers
│   ├── renderer/          # React app
│   │   ├── components/
│   │   │   ├── ConfigTab.tsx
│   │   │   ├── ContextTab.tsx
│   │   │   └── EmailTab.tsx
│   │   ├── services/
│   │   │   ├── llm.ts     # LLM API integration
│   │   │   └── storage.ts # Config management
│   │   ├── App.tsx
│   │   └── main.tsx
│   └── shared/            # Shared types/interfaces
├── APPS_SCRIPT_SETUP.md   # Setup guide for Apps Script config
└── package.json
```

### 1. Config Tab

#### Fields
- User's full name
- User's Gmail address (workspace email)
- Google Account connection status (OAuth)
- Google Sheet ID (from spreadsheet URL)
- Google Sheet Name/Tab (default: "Sheet1")
- LLM API key (for Gemini or OpenAI)
- LLM Provider selection (Gemini or GPT)

**dF: Changed from app passwords to OAuth because app passwords are disabled in our Google Workspace.**

#### Google OAuth Setup (Internal Workspace App)
- Admin creates Google Cloud Project (one-time setup)
- Enables Gmail API and Google Sheets API
- Configures OAuth consent screen as "Internal"
- Admin deploys Apps Script web app
- Distributes Web App URL to team members
- End users enter Web App URL in app
- OAuth flow opens browser for user authentication
- User authorizes with their workspace account
- App receives authorization code
- App exchanges code for refresh token
- Refresh token stored encrypted in electron-store

**dF: This approach allows only our workspace members to use the app, no external users can access it.**

#### Google Sheets Setup (OAuth)
- User enters Sheet ID from the spreadsheet URL
- Format: `https://docs.google.com/spreadsheets/d/[SHEET_ID]/edit`
- User enters sheet name/tab (e.g., "Sheet1")
- App uses OAuth token to read contacts
- App automatically updates sheet when emails are sent
- No need for manual status updates

**dF: With OAuth, the app can write back to the sheet, so status tracking is automatic.**

#### Implementation Notes
- Store refresh token encrypted in `electron-store`
- Show connection status indicators (connected/disconnected)
- Add "Test Connection" button to verify Gmail + Sheets access
- Validate email format
- OAuth credentials in Apps Script web app (no local `.env`)

### 2. Context Tab

#### Features
- File picker to open local .txt file
- Rich text editor (react-quill)
- Auto-save on change
- Preview mode
- Single context file at a time (global for all contacts)

#### Editor Capabilities
- Basic formatting (bold, italic, lists)
- Variables/placeholders that will be replaced:
  - `{{firstName}}` - Contact's first name
  - `{{lastName}}` - Contact's last name

#### Implementation Notes
- Store last opened file path in config
- Keep email output simple (plain text/minimal formatting)
- Template validation (ensure variables are valid)

### 3. Email Tab

#### Contact Display
- First Name (required)
- Last Name (required)
- Email Address (required)
- Team Member (who sent the email, if already sent)
- Previous contact status (if already sent)

#### Email Generation
- Subject line (extracted from first line of LLM output, editable)
- Body (editable with rich text editor)
- From address (from config)
- **Generate button**: Call LLM with:
  - Context template
  - Contact information
  - Any additional instructions
- **Regenerate button**: Call LLM again (possibly with modification instructions)

#### Actions
1. **Send Test**: 
   - Send email to user's own email address for preview
   - Does not update Google Sheet
   - Allows verification before sending to contact

2. **Send**: 
   - Validate email content
   - Send via Gmail API
   - Update Google Sheet with:
     - Date sent (ISO 8601 format)
     - Gmail message ID
     - Status: "sent"
     - User's name in Team Member column
   - Show success message
   - Enable "Next" button

3. **Skip**:
   - Update Google Sheet with:
     - Date skipped
     - Status: "skipped"
   - Move to next contact

4. **Next**:
   - Load next unsent contact
   - Generate new email

#### Status Display
- Sending indicator (spinner/loading)
- Success message with timestamp
- Error message with details
- Retry option on failure

#### Implementation Notes
- Disable editing while sending
- Confirm dialog before skipping
- Display subject line on Email tab (extracted from LLM output first line)
- Track send history to avoid duplicates
- **FUTURE**: Track send rate and display quota usage, disable send if approaching limits

### 4. Google Sheets Integration

#### Required Columns

**Existing Columns (A-D):**
- Column A: **Email Address** (required)
- Column B: **First Name** (required)
- Column C: **Last Name** (required)
- Column D: **Team Member** (who sent the email)
  - If empty, contact has not been sent an email
  - If filled, contact has been sent an email (legacy behavior)

**New Columns (Starting after Column W):**
- **Status** (managed by app: "sent", "skipped", "error")
- **Date Sent** (ISO 8601 timestamp)
- **Gmail Message ID** (for reference)

**Notes:**
- Columns E-W are currently used for other data
- Add new app-managed columns starting at Column X or later
- For backward compatibility: If Team Member column is filled, treat as "sent"
- When sending new emails: Update both Team Member column AND new Status/Date/MessageID columns

#### Sheet Structure Example
```
| Email            | First Name | Last Name | Team Member | ... (E-W) ... | Status | Date Sent           | Message ID      |
|------------------|------------|-----------|-------------|---------------|--------|---------------------|---------------|
| john@example.com | John       | Doe       | Matt        | ...           | sent   | 2026-01-29T10:30:00 | 18c5d3e4f2... |
| jane@example.com | Jane       | Smith     |             | ...           |        |                     |               |
```

#### Implementation
- First row = headers
- Auto-detect column positions by header name (case-insensitive)
- Filter contacts for unsent emails:
  - Team Member column is empty AND
  - Status column is empty or not "sent"
- Update row after each send/skip:
  - Write to Team Member column (user's name from config)
  - Write to Status, Date Sent, and Message ID columns
- Refresh sheet data before each email generation (to get latest data)
- Support multiple users working on same sheet:
  - Each user checks Team Member column before sending
  - If another user filled it while current user was editing, skip to next
- Single sheet/tab support only

### 5. LLM Integration

#### Prompt Structure
```
System: You are an email writing assistant. Generate a personalized email 
based on the provided context template. 

Context Template:
{context_from_file}

Generate a professional, personalized email. The FIRST LINE should be the subject line.
Do not include "Subject:" prefix - just the subject text.
The rest should be the email body with paragraphs separated by blank lines.
The template may contain placeholders like {{firstName}} and {{lastName}} - leave these 
as-is in your output, they will be replaced later.
```

**Privacy Protection**: Contact information (name, email) is NOT sent to the LLM. 
Variable replacement happens locally after LLM generates the email.

#### Configuration
- **Supported LLM Providers**:
  - Google Gemini (gemini-pro or gemini-1.5-pro)
  - OpenAI GPT (gpt-4 or gpt-3.5-turbo)
  - User selects provider in Config tab
- Model parameters:
  - Temperature: ~0.7 for creativity
  - Max tokens: ~1000
- **Privacy**: Contact information is NOT sent to LLM (see Prompt Structure above)
- Cost per email depends on selected provider/model

#### Error Handling
- Network errors
- API key invalid
- Rate limiting
- Fallback: Allow user to write manually

### 6. Configuration Storage

#### config.json Structure
```json
{
  "user": {
    "name": "User Name",
    "email": "user@example.com"
  },
  "google": {
    "refreshToken": "encrypted_token",
    "sheetId": "spreadsheet_id",
    "sheetName": "Sheet1"
  },
  "llm": {
    "provider": "gemini",
    "apiKey": "encrypted_key",
    "model": "gemini-1.5-pro"
  },
  "context": {
    "lastFilePath": "/path/to/context.txt"
  }
}
```

#### Security
- Use `electron-store` with encryption
- Never commit config.json to git
- Mask sensitive values in UI

## User Flow

### First-Time Setup
1. Launch app
2. Show Config tab
3. User enters name and email
4. User clicks "Connect Google Account" → OAuth flow
5. User enters/selects Google Sheet URL
6. User enters LLM API key
7. Click "Save" → validate and store config
8. Navigate to Context tab

### Normal Operation
1. Context tab: Load/edit context template
2. Email tab: 
   - Load first unsent contact
   - Click "Generate" → AI creates email
   - Review/edit email
   - Click "Send" → Gmail sends, Sheet updates
   - Click "Next" → load next contact
3. Repeat until all contacts processed

## Design Decisions Summary

1. **LLM Provider**: Support both Google Gemini and OpenAI GPT, configurable by user
2. **Subject Line**: Extracted from first line of LLM-generated output, editable before sending
3. **Context Files**: Single global file for all contacts
4. **Contact Fields**: Email Address, First Name, Last Name, Team Member (from existing sheet structure)
5. **Email History**: Not tracked
6. **Attachments**: Not supported
7. **Multi-Sheet**: Single sheet/tab only
8. **Scheduling**: Immediate send only
9. **Preview Mode**: "Send Test" button sends to user's own email
10. **Undo**: Not supported (Gmail API doesn't support recall)

## Technical Concerns & Solutions

1. **Gmail API Quotas**: 
   - Typical limit: 100-500 emails/day depending on account
   - **FUTURE**: Display quota usage in UI, warn when approaching limit
   - Human-in-the-loop design naturally throttles sends
   
2. **Rate Limiting**: 
   - No artificial delays needed (human review provides natural throttling)
   - One-at-a-time processing only
   
3. **Error Recovery**: 
   - App tracks sends in Google Sheet
   - On restart, automatically resume from next unsent contact
   - Team Member column prevents duplicate sends
   
4. **Data Privacy**: 
   - **CRITICAL**: Do NOT send contact names/emails to LLM
   - LLM generates email template, variables replaced locally
   - Contact list: Legacy contacts from before opt-in requirements
   - Email purpose: Invite to opt-in to email list
   - Comply with CAN-SPAM Act requirements
   
5. **Token Refresh**: 
   - Implement automatic Google OAuth token refresh
   - Handle refresh failures gracefully with re-auth flow
   
6. **Multi-User Concurrent Access**: 
   - Multiple users can run app on same sheet
   - Refresh sheet data before each email generation
   - Check Team Member column before sending (skip if filled by another user)
   - Don't handle manual concurrent edits (use latest data available)

## Future Enhancements

- Email templates library
- A/B testing different email versions
- Analytics (open rates, response rates) via Gmail API
- Bulk operations (generate all, review, then send all)
- Export sent emails log
- Integration with other email providers (Outlook, etc.)
- Desktop notifications on send completion