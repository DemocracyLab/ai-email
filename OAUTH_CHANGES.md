# OAuth Implementation Summary

## What Changed

Your AI Mail application has been updated to use OAuth 2.0 authentication instead of Gmail app passwords. This was necessary because your Google Workspace has app passwords disabled.

## Why OAuth with "Internal" Setup

- **Internal** means only members of your Google Workspace can use the app
- No app verification process required (since it's internal-only)
- More secure than app passwords
- Allows full Gmail and Google Sheets API access
- Each user authenticates with their own Google account

## Files Updated

### Core OAuth Implementation
- **src/main/gmail.ts**: Restored Gmail API with OAuth2Client
  - `gmail:authorize` - Opens browser for Google authentication
  - `gmail:saveTokens` - Exchanges auth code for refresh token
  - `gmail:test` - Tests Gmail connection
  - `gmail:send` - Sends email via Gmail API
  
- **src/main/sheets.ts**: Restored Google Sheets API with OAuth
  - `sheets:getContacts` - Reads contacts from sheet
  - `sheets:updateContact` - Updates sheet after sending email
  - `sheets:test` - Tests Sheets connection
  
- **src/main/preload.ts**: Added OAuth methods to IPC bridge
  - `authorizeGmail()` - Starts OAuth flow
  - `saveGmailTokens(code)` - Completes OAuth flow

### UI Updates
- **src/renderer/components/ConfigTab.tsx**: Complete OAuth UI
  - "Connect Google Account" button
  - Authorization code input field
  - Connection status indicator
  - Sheet ID input (instead of URL)
  - Sheet name/tab input

### Configuration
- **src/shared/types.ts**: Updated AppConfig interface
  - Removed: `user.gmailAppPassword`
  - Added: `google.refreshToken` (OAuth token)
  - Changed: `google.sheetUrl` → `google.sheetId` + `google.sheetName`

- **package.json**: Dependencies restored
  - Added: `googleapis` (Gmail + Sheets API)
  - Added: `google-auth-library` (OAuth support)
  - Removed: `nodemailer`, `csv-parse`

### Documentation
- **.env.example**: Template for OAuth credentials
- **OAUTH_SETUP.md**: Complete setup guide for admins
- **README.md**: Updated for OAuth approach
- **spec.md**: Updated with OAuth details
- **.gitignore**: Added `.env` to prevent credential leaks

## Next Steps for You

### 1. One-Time Admin Setup (See OAUTH_SETUP.md)

You'll need to:
1. Create a Google Cloud Project
2. Enable Gmail API and Google Sheets API
3. Configure OAuth consent screen as "Internal"
4. Create OAuth credentials (Desktop app)
5. Copy credentials to `.env` file

This is a **one-time setup**. Once done, all workspace members can use the app.

### 2. Install Dependencies

```bash
cd c:\Users\ddfri\git\democracy-lab\ai-mail
npm install
```

### 3. Configure OAuth Credentials

Create a `.env` file:
```bash
cp .env.example .env
```

Edit `.env` and add your credentials from Google Cloud Console:
```
GOOGLE_CLIENT_ID=your-actual-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-actual-client-secret
```

### 4. Test the Application

```bash
npm run electron:dev
```

## User Flow

1. User opens app, goes to Configuration tab
2. Clicks "Connect Google Account"
3. Browser opens to Google authorization page
4. User logs in with workspace account
5. Google redirects to `http://localhost:3000/oauth2callback?code=...`
6. User copies the `code` from the URL
7. User pastes code in app and clicks "Save Authorization"
8. App exchanges code for refresh token
9. Refresh token stored encrypted in electron-store
10. User can now send emails and access sheets!

## OAuth Scopes Requested

- `https://www.googleapis.com/auth/gmail.send` - Send emails
- `https://www.googleapis.com/auth/spreadsheets` - Read/write sheets

## Security Notes

- ✅ OAuth tokens stored encrypted via electron-store
- ✅ `.env` file gitignored (never commit credentials!)
- ✅ Internal-only app (workspace members only)
- ✅ Each user has their own OAuth token
- ✅ Refresh tokens allow long-term access without re-auth

## Troubleshooting

### "Cannot find module 'googleapis'"
Run: `npm install`

### "Access blocked: This app's request is invalid"
- Make sure OAuth consent screen is "Internal"
- Use your workspace email, not personal Gmail

### "Redirect URI mismatch"
- Desktop apps should auto-allow localhost redirects
- If issues, manually add `http://localhost:3000/oauth2callback` in OAuth client settings

## What's Different from App Password Approach

| Feature | App Passwords | OAuth (Current) |
|---------|--------------|-----------------|
| Authentication | SMTP with password | Gmail API with token |
| Setup Complexity | Simple (user only) | Moderate (admin + user) |
| Workspace Compatible | ❌ (disabled) | ✅ Yes |
| Sheet Updates | ❌ Manual | ✅ Automatic |
| Security | Medium | High |
| Access Scope | Full account | Limited scopes |

## Questions?

- See **OAUTH_SETUP.md** for detailed admin setup
- See **README.md** for development instructions
- All OAuth code is in `src/main/gmail.ts` and `src/main/sheets.ts`
