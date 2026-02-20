# OAuth Setup Guide for Internal Workspace Use

This guide will help you set up the Google OAuth integration for your organization's internal use. This is a **one-time setup** that needs to be done by a developer or admin. Once configured, all members of your Google Workspace can use the app.

## Why OAuth (Internal Mode)?

Your organization's Google Workspace has app passwords disabled. OAuth with "Internal" user type is the secure alternative that:
- Only allows members of your workspace to use the app
- Doesn't require individual app passwords
- Provides secure, token-based authentication
- Allows the app to send emails and access sheets on behalf of each user

## Prerequisites

- Google Workspace account (not free Gmail)
- Access to [Google Cloud Console](https://console.cloud.google.com/)
- Admin permissions (or ability to create a Cloud Project)

## Step-by-Step Setup

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" dropdown at the top
3. Click "New Project"
4. Enter project name: `AI Mail App`
5. Select your organization
6. Click "Create"

### 2. Enable Required APIs

1. In the left sidebar, go to "APIs & Services" > "Library"
2. Search for "Gmail API" and click on it
3. Click "Enable"
4. Go back to the Library
5. Search for "Google Sheets API" and click on it
6. Click "Enable"

### 3. Configure OAuth Consent Screen

1. Go to "APIs & Services" > "OAuth consent screen"
2. **User Type**: Select **"Internal"** (this is critical!)
   - Internal means only users in your organization can use the app
   - No verification process required for Internal apps
3. Click "Create"
4. Fill in the required Application information:
   - **App name**: Use a specific name for your organization, for example:
     - `Democracy Lab Outreach Tool`
     - `DemLab Email Manager`
     - `Contact Outreach App`
     - **Avoid**: Generic terms like "AI Mail", "Email App", or anything with "Google" or "Gmail" - these may be rejected as abusive
   - **User support email**: Select your email from dropdown
   - **Developer contact information**: Enter your email
   - Note: Google may not show optional fields like App logo or Application home page for Internal apps - this is normal!
5. Click "Save and Continue"
6. **Scopes**: You should now be on the Scopes page. Look for the "ADD OR REMOVE SCOPES" button (it may be styled as a button or link). Click it.
   - In the filter box, search for: `gmail.send`
   - Check the box for: `https://www.googleapis.com/auth/gmail.send`
   - In the filter box, search for: `gmail.readonly`
   - Check the box for: `https://www.googleapis.com/auth/gmail.readonly`
   - In the filter box, search for: `spreadsheets`
   - Check the box for: `https://www.googleapis.com/auth/spreadsheets`
7. Click "Update" then "Save and Continue"
8. **Summary**: Review your settings
9. Click "Back to Dashboard"

**Note**: If you see a notification banner about the OAuth consent screen, it's just confirming your settings were saved.

### 4. Create OAuth Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. **Application type**: "Desktop app"
4. **Name**: `AI Mail Desktop Client`
5. Click "Create"
6. A dialog will show your Client ID and Client Secret
7. **IMPORTANT**: Copy both values immediately

### 5. Configure the App

1. In the ai-mail folder, copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and paste your credentials:
   ```
   GOOGLE_CLIENT_ID=your-actual-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-actual-client-secret
   ```

3. **Security Note**: Never commit the `.env` file to git. It's already in `.gitignore`.

### 6. Install and Run

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the app in dev mode:
   ```bash
   npm run electron:dev
   ```

3. Or build for production:
   ```bash
   npm run electron:build
   ```

## User Flow

Once set up, each user will:

1. Open the app and go to the Configuration tab
2. Click "Connect Google Account"
3. Authorize in their browser (they'll see your Internal app consent screen)
4. Copy the authorization code from the redirect URL
5. Paste it in the app to complete the connection
6. The app stores their refresh token securely

## Troubleshooting

### "Access blocked: This app's request is invalid"
- Make sure OAuth consent screen is set to "Internal"
- Ensure you're signed in with a workspace account (not free Gmail)

### "Redirect URI mismatch"
- The app uses `http://localhost:3000/oauth2callback`
- This should be automatically allowed for desktop apps
- If issues persist, add it manually in OAuth client settings

### "API not enabled"
- Make sure both Gmail API and Google Sheets API are enabled
- Wait a few minutes after enabling for changes to propagate

### "Invalid client"
- Double-check your Client ID and Client Secret in `.env`
- Make sure there are no extra spaces or quotes

## Security Best Practices

- ✅ Use "Internal" user type (workspace only)
- ✅ Keep `.env` file secret (never commit to git)
- ✅ Only grant necessary scopes (gmail.send, spreadsheets)
- ✅ Refresh tokens are stored encrypted by electron-store
- ✅ Each user authenticates with their own Google account

## Distribution

When distributing the built app to your organization:

1. Build the app: `npm run electron:build`
2. The built app will be in `dist/` folder
3. Users install the app on their machines
4. The `.env` values are bundled into the app during build
5. Each user still needs to authenticate with their own Google account

## Support

If users have issues:
- Make sure they're using their workspace email (not personal Gmail)
- Verify they have access to the Google Sheet
- Check that their account has not been suspended or restricted
- Try disconnecting and reconnecting their Google account in the app
