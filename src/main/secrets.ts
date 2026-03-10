import { IpcMain } from 'electron';
import Store from 'electron-store';
import { google } from 'googleapis';
import { AppConfig } from '../shared/types.js';

function getOAuth2Client(store: Store<AppConfig>) {
  const config = store.store as AppConfig;
  const clientId = config.google?.clientId || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = config.google?.clientSecret || process.env.GOOGLE_CLIENT_SECRET;

  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    'http://localhost:3000/oauth2callback'
  );
}

export function setupSecretsHandlers(ipcMain: IpcMain, store: Store<AppConfig>) {
  // Get LLM API key from Google Cloud Secret Manager
  ipcMain.handle('secrets:get-llm-key', async () => {
    const config = store.store as AppConfig;
    
    if (!config?.google?.refreshToken) {
      throw new Error('Not authenticated with Google. Please connect your Google account first.');
    }

    const gcpProjectId = config.google?.gcpProjectId || process.env.GCP_PROJECT_ID;
    if (!gcpProjectId) {
      throw new Error('GCP Project ID not configured. Please set it in the Configuration tab.');
    }

    try {
      const client = getOAuth2Client(store);
      client.setCredentials({
        refresh_token: config.google.refreshToken
      });

      // Get fresh access token
      const { token } = await client.getAccessToken();
      
      if (!token) {
        throw new Error('Failed to get access token. Please reconnect your Google account.');
      }

      // Fetch secret from Secret Manager
      const secretName = `projects/${gcpProjectId}/secrets/llm-api-key/versions/latest`;
      const response = await fetch(
        `https://secretmanager.googleapis.com/v1/${secretName}:access`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if (response.status === 403) {
          throw new Error('Access denied. Your Google account does not have permission to access the LLM API key. Please contact your administrator.');
        } else if (response.status === 404) {
          throw new Error('LLM API key not found in Secret Manager. Please ensure the secret "llm-api-key" exists in your GCP project.');
        }
        
        throw new Error(`Failed to access secret: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      
      // Decode base64 payload
      if (!data.payload?.data) {
        throw new Error('Invalid secret format received from Secret Manager.');
      }
      
      const apiKey = Buffer.from(data.payload.data, 'base64').toString('utf8');
      
      console.log('[Secrets] LLM API key retrieved successfully from Secret Manager');
      
      return apiKey;
    } catch (error: any) {
      console.error('[Secrets] Failed to retrieve LLM API key:', error);
      throw new Error(`Failed to retrieve LLM API key: ${error.message}`);
    }
  });
}
