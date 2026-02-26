# Google Cloud Secret Manager Setup

This guide explains how to set up Google Cloud Secret Manager to securely share the LLM API key across all internal users of the AI Mail app.

## Overview

Instead of each user entering their own Gemini API key, the app now retrieves a shared key from Google Cloud Secret Manager using the user's Google OAuth credentials. This provides:

- ✅ Centralized key management (rotate in one place)
- ✅ Granular access control via Google Cloud IAM
- ✅ No API key stored on user machines
- ✅ Audit logs of all API key access
- ✅ Uses existing Google OAuth (no additional authentication)

## Prerequisites

- Google Cloud Project (free tier available at https://console.cloud.google.com)
- Admin access to configure Secret Manager
- Users must have Google accounts in your organization

## Step 1: Enable Secret Manager API

### Option A: Using Google Cloud Console (Web UI)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project (or create a new one)
3. Navigate to **APIs & Services** → **Library**
4. Search for "Secret Manager API"
5. Click **Enable**

### Option B: Using gcloud CLI (Command Line)

```bash
gcloud services enable secretmanager.googleapis.com
```

## Step 2: Create the Secret

### Option A: Using Google Cloud Console (Web UI)

1. Go to [Secret Manager](https://console.cloud.google.com/security/secret-manager)
2. Click **"Create Secret"**
3. **Name:** `llm-api-key`
4. **Secret value:** Paste your Gemini API key (get from https://aistudio.google.com/app/apikey)
5. **Replication:** Choose "Automatic" (recommended)
6. Click **"Create Secret"**

### Option B: Using gcloud CLI (Command Line)

```bash
# Create the secret
gcloud secrets create llm-api-key --replication-policy="automatic"

# Add the API key value (replace with your actual key)
echo -n "AIzaSyC_your_actual_gemini_key_here" | \\
    gcloud secrets versions add llm-api-key --data-file=-
```

## Step 3: Grant Access to Users

You need to grant your users permission to read the secret.

### Option A: Grant access to entire domain

```bash
# Replace yourcompany.com with your actual domain
gcloud secrets add-iam-policy-binding llm-api-key \\
    --member="domain:yourcompany.com" \\
    --role="roles/secretmanager.secretAccessor"
```

### Option B: Grant access to specific users

```bash
# Replace with actual email addresses
gcloud secrets add-iam-policy-binding llm-api-key \\
    --member="user:alice@yourcompany.com" \\
    --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding llm-api-key \\
    --member="user:bob@yourcompany.com" \\
    --role="roles/secretmanager.secretAccessor"
```

### Option C: Grant access via Google Group

```bash
# Replace with your Google Group email
gcloud secrets add-iam-policy-binding llm-api-key \\
    --member="group:ai-mail-users@yourcompany.com" \\
    --role="roles/secretmanager.secretAccessor"
```

### Option D: Use Google Cloud Console (Web UI)

1. Go to [Secret Manager](https://console.cloud.google.com/security/secret-manager)
2. Click on the **llm-api-key** secret
3. Click on the **"Permissions"** tab
4. Click **"Grant Access"**
5. **Add principals:** Enter user emails, groups, or your domain
6. **Role:** Select **"Secret Manager Secret Accessor"**
7. Click **"Save"**

## Step 4: Update .env File

Update your `.env` file with your Google Cloud Project ID:

```env
# Find your project ID at: https://console.cloud.google.com/
GCP_PROJECT_ID=your-project-id-here
```

**To find your project ID:**
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click the project dropdown at the top
3. Copy the **Project ID** (not the project name)

## Step 5: Reconnect Google Account (Existing Users)

If you've already connected your Google account before this update, you need to reconnect to grant the new Secret Manager permissions:

1. Open the AI Mail app
2. Go to **Configuration** tab
3. Click **"Disconnect"** under Google Account Connection
4. Click **"Connect Google Account"** again
5. Authorize the new permissions in your browser

## How It Works

1. User connects their Google account (OAuth 2.0)
2. App requests additional `cloud-platform` scope for Secret Manager access
3. When generating emails, app calls `window.electronAPI.getLLMApiKey()`
4. Main process uses user's OAuth token to fetch secret from Google Cloud
5. Google Cloud IAM checks if user has permission
6. If authorized, API key is returned (kept in memory only, never stored)
7. LLM API call is made with the retrieved key

## Security Notes

- ✅ API key is **never stored** on the user's machine
- ✅ Key exists only in memory during email generation
- ✅ Each access is logged in Google Cloud audit logs
- ✅ Revoke access instantly by removing IAM permissions
- ✅ Rotate key in one place without redistributing the app

## Cost

Google Cloud Secret Manager pricing:
- **First 6 secret versions:** FREE
- **Secret access:** $0.03 per 10,000 accesses

For typical internal team usage, this is effectively **free** (well within free tier).

## Troubleshooting

### "Access denied" error

The user's Google account doesn't have permission to access the secret.

**Solution:** Grant access via IAM (see Step 3)

### "LLM API key not found in Secret Manager"

The secret doesn't exist or is named incorrectly.

**Solution:** Verify secret exists and is named exactly `llm-api-key`

```bash
gcloud secrets list
```

### "GCP_PROJECT_ID not configured"

The `.env` file is missing the project ID.

**Solution:** Add `GCP_PROJECT_ID=your-project-id` to `.env` file

### "Not authenticated with Google"

User hasn't connected their Google account, or needs to reconnect.

**Solution:** Go to Config tab → Connect Google Account

## Rotating the API Key

When you need to rotate the Gemini API key:

1. Generate a new API key at https://aistudio.google.com/app/apikey
2. Update the secret:

```bash
echo -n "NEW_API_KEY_HERE" | \\
    gcloud secrets versions add llm-api-key --data-file=-
```

Or via Console:
1. Go to [Secret Manager](https://console.cloud.google.com/security/secret-manager)
2. Click on **llm-api-key**
3. Click **"New Version"**
4. Paste new API key
5. Click **"Add New Version"**

**All users automatically use the new key** on their next email generation - no app update needed!

## Audit Logs

View who accessed the API key:

1. Go to [Cloud Logging](https://console.cloud.google.com/logs)
2. Filter: `resource.type="secretmanager.googleapis.com/Secret"`
3. See timestamp, user email, and access result

## Alternative: Environment Variable (Not Recommended)

If you prefer not to use Secret Manager, you can embed the API key in the build:

```bash
# Add to .env
VITE_GEMINI_API_KEY=your-key-here

# Build with embedded key
npm run build
```

⚠️ **Warning:** Key can be extracted from the built app - not secure for untrusted environments.

---

## Next Steps

After setup is complete:

1. ✅ Secret created in Google Cloud
2. ✅ Users granted IAM permissions
3. ✅ GCP_PROJECT_ID added to .env
4. ✅ Users reconnected Google accounts

Your team can now generate AI emails without managing individual API keys!
