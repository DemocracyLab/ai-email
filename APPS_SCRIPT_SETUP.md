# Google Apps Script Setup Guide

To avoid manually passing `.env` files and Google Cloud Secret Manager configurations to your users, this app fetches necessary environment variables (like your LLM API Key) securely from a dedicated Google Apps Script. 

By setting this script up within your Google Workspace, only authenticated users inside your organization will be able to access the API keys.

## 1. Create the Script

1. Go to [script.google.com](https://script.google.com).
2. Click **New Project**.
3. Name the project something like `AI Mail Config Provider`.
4. Replace the contents of `Code.gs` with the content found in `google-apps-script.js` in this repository.
5. In the script, replace `"YOUR_GOOGLE_CLIENT_ID_HERE"`, `"YOUR_GOOGLE_CLIENT_SECRET_HERE"`, and `"YOUR_LLM_API_KEY_HERE"` with your actual Google OAuth Client ID, Client Secret, and LLM API Key.

## 2. Deploy as a Web App

1. Click **Deploy** > **New deployment** in the top right.
2. Under "Select type", click the gear icon (⚙️) and choose **Web app**.
3. Fill out the fields:
   - **Description**: Environment Config Service
   - **Execute as**: **Me** (Your Google Workspace account, meaning the script will read your script properties / code).
   - **Who has access**: **Anyone within [Your Workspace Domain]** (This ensures that only authenticated users from your organization can reach this URL).
4. Click **Deploy**. If prompted, authorize access.
5. Copy the generated **Web app URL**.

## 3. Configure the Application

Now, instead of providing `.env` files or Google Cloud Secret Manager credentials to users, simply direct them to enter this **Web App URL** into the application's Configuration tab and click "Connect Google Account".

The application will open a browser window to the script. If they are logged into the workspace, the script will securely return the configuration (including OAuth ids and the LLM API key) directly back to the app without them ever having to handle passwords or `.env` files.e against the App Script's URL and retrieve the environment variables securely.