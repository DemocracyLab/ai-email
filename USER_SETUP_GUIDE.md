# AI Mail - User Setup Guide

This guide will help you set up AI Mail to send personalized emails to your contact list.

## What You'll Need

1. A Gmail account
2. A Google Sheet with your contacts
3. An API key for AI (Gemini or OpenAI)

---

## Step 1: Enable 2-Factor Authentication on Gmail

AI Mail uses Gmail App Passwords for secure email sending. To use app passwords, you need 2-Factor Authentication (2FA) enabled.

### Enable 2FA:

1. Go to **[Google Account Security](https://myaccount.google.com/security)**
2. Under "How you sign in to Google", click **2-Step Verification**
3. Click **Get Started**
4. Follow the on-screen instructions to set up 2FA
   - You'll need your phone to receive verification codes
   - Can use SMS, Google Authenticator, or other methods

---

## Step 2: Generate Gmail App Password

Once 2FA is enabled, you can create an app password.

### Get Your App Password:

1. Go to **[Google App Passwords](https://myaccount.google.com/apppasswords)**
   - Or: Google Account → Security → 2-Step Verification → App Passwords

2. You may need to sign in again

3. Under "Select app", choose **Mail**

4. Under "Select device", choose **Windows Computer** (or Other)

5. Click **Generate**

6. Google will display a 16-character password like: `abcd efgh ijkl mnop`

7. **Copy this password** - you'll need it in Step 5

**Note:** You can't view this password again, but you can always generate a new one.

---

## Step 3: Prepare Your Google Sheet

Your contact list must be in a Google Sheet with specific columns.

### Required Columns (in this order):

| Column A | Column B | Column C | Column D |
|----------|----------|----------|----------|
| Email Address | First Name | Last Name | Team Member |

**Example:**

| Email Address | First Name | Last Name | Team Member |
|---------------|------------|-----------|-------------|
| john@example.com | John | Doe | |
| jane@example.com | Jane | Smith | |

### Share Your Sheet:

1. Open your Google Sheet
2. Click the **Share** button (top right)
3. Click **Change to anyone with the link**
4. Set permission to **Viewer**
5. Click **Copy link**
6. Save this link - you'll need it in Step 5

**Why Viewer?** The app only needs to read contacts. You'll manually update the "Team Member" column after sending emails.

---

## Step 4: Get an AI API Key

The app uses AI to generate personalized emails. Choose one:

### Option A: Google Gemini (Recommended)

1. Go to **[Google AI Studio](https://makersuite.google.com/app/apikey)**
2. Click **Create API Key**
3. Select a project (or create new)
4. Click **Create API key in existing project**
5. **Copy the API key** - you'll need it in Step 5

**Cost:** Free tier includes generous quota

### Option B: OpenAI GPT

1. Go to **[OpenAI Platform](https://platform.openai.com/api-keys)**
2. Sign up or sign in
3. Click **Create new secret key**
4. Name it "AI Mail"
5. **Copy the API key** - you'll need it in Step 5

**Cost:** Pay-as-you-go, approximately $0.01-0.05 per email

---

## Step 5: Configure AI Mail

Now you're ready to set up the application!

1. **Open AI Mail** application

2. **Go to Configuration Tab** (should open automatically)

3. **Enter User Information:**
   - Full Name: Your name (will appear in emails)
   - Gmail Address: Your Gmail address
   - Gmail App Password: Paste the 16-character password from Step 2
   - Click **Test Gmail Connection** to verify

4. **Enter Google Sheets Information:**
   - Sheet URL: Paste the share link from Step 3
   - Click **Test Sheet Connection** to verify

5. **Enter LLM Configuration:**
   - Provider: Choose Gemini or OpenAI
   - API Key: Paste the key from Step 4
   - Model: Leave default (optional)

6. **Configure Email Settings:**
   - Subject Line Template: e.g., "Hello {{firstName}}"
     - Use `{{firstName}}` and `{{lastName}}` to personalize
   - Email Signature: Your closing (e.g., "Best regards,\nJohn")

7. **Click Save Configuration**

---

## Step 6: Create Your Email Template

1. **Go to Context Template Tab**

2. **Click "Open File"** to create or load a template

3. **Write your email template:**
   ```
   Hi {{firstName}},

   I hope this email finds you well. I wanted to reach out because...

   [Your message here]

   Looking forward to hearing from you!
   ```

4. Use `{{firstName}}` and `{{lastName}}` to personalize

5. Template **auto-saves** every 2 seconds

---

## Step 7: Send Emails

1. **Go to Send Emails Tab**

2. You'll see the first unsent contact from your sheet

3. **Click "Generate Email"**
   - AI creates a personalized email based on your template
   - Variables are replaced with contact's name

4. **Review the email:**
   - Edit subject and body as needed
   - Check for accuracy

5. **Click "Send Test to Self"** (recommended first time)
   - Sends to your email so you can preview
   - Doesn't update the sheet

6. **Click "Send Email"** when ready
   - Confirms before sending
   - Sends via Gmail
   - Shows success/error status

7. **After sending:**
   - Manually update "Team Member" column in Google Sheet with your name
   - Click **"Next"** to move to next contact
   - Repeat steps 3-7

---

## Tips & Best Practices

### Sending Emails:
- ✅ Always send a test to yourself first
- ✅ Review each email before sending
- ✅ Take breaks - don't rush
- ✅ Keep track in your Google Sheet
- ⚠️ Gmail has daily sending limits (typically 100-500/day)

### Template Tips:
- Keep it personal and conversational
- Be clear about why you're reaching out
- Include a call-to-action
- Test different approaches

### Privacy & Compliance:
- Contact data is NOT sent to AI (privacy protected)
- Only the template goes to AI, names filled in locally
- Include unsubscribe option in emails
- Follow CAN-SPAM Act guidelines
- Respect recipients who ask to be removed

---

## Troubleshooting

### "Gmail connection failed"
- ✓ Check your Gmail address is correct
- ✓ Verify app password (16 characters, no spaces)
- ✓ Make sure 2FA is enabled
- ✓ Generate a new app password if needed

### "Sheets connection failed"
- ✓ Check sheet URL is correct
- ✓ Verify sheet is shared with "Anyone with link"
- ✓ Make sure permission is at least "Viewer"
- ✓ Try opening the link in a private browser window

### "No unsent contacts found"
- ✓ Check "Team Member" column is empty for unsent contacts
- ✓ Verify column headers match exactly (A: Email Address, B: First Name, C: Last Name, D: Team Member)
- ✓ Make sure there's data below the header row

### "LLM generation failed"
- ✓ Check API key is correct
- ✓ Verify you have credits/quota with provider
- ✓ Check internet connection
- ✓ Try the other provider (Gemini vs OpenAI)

---

## Support

If you continue having issues:
1. Check the error message carefully
2. Verify each setup step above
3. Try restarting the application
4. Check your internet connection

---

## Quick Reference Links

- **Gmail 2FA:** https://myaccount.google.com/security
- **App Passwords:** https://myaccount.google.com/apppasswords
- **Google Gemini API:** https://makersuite.google.com/app/apikey
- **OpenAI API:** https://platform.openai.com/api-keys
- **Share Google Sheet:** Click Share button in your sheet

---

**Ready to start?** Follow Step 1 above and you'll be sending personalized emails in no time!
