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
  // Get LLM API key from store (fetched previously from Apps Script).
  // Resolves from apiKeyByProvider[provider] first, with legacy apiKey fallback.
  ipcMain.handle('secrets:get-llm-key', async () => {
    const config = store.store as AppConfig;

    if (!config?.google?.refreshToken) {
      throw new Error('Not authenticated with Google. Please connect your Google account first.');
    }

    const provider = config?.llm?.provider;
    const apiKey =
      (provider && (config?.llm?.apiKeyByProvider as any)?.[provider]) ||
      config?.llm?.apiKey;

    if (!apiKey) {
      throw new Error(`LLM API key not found for provider "${provider}". Please fetch config from the Script URL first.`);
    }

    return apiKey;
  });
}
