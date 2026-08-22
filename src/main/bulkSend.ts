import { IpcMain } from 'electron';
import Store from 'electron-store';
import { google } from 'googleapis';
import { AppConfig, BulkSendState } from '../shared/types.js';
import { validateEmailDomain } from './domainValidator.js';
import { checkForBounces } from './bounceDetector.js';

const sheets = google.sheets('v4');

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

export function setupBulkSendHandlers(ipcMain: IpcMain, store: Store<AppConfig>) {
  // Read persisted bulk send state
  ipcMain.handle('bulkSend:getState', () => {
    return store.get('bulkSend') as BulkSendState | undefined;
  });

  // Write persisted bulk send state
  ipcMain.handle('bulkSend:setState', (_event, state: BulkSendState) => {
    store.set('bulkSend', state);
    return true;
  });

  // Count contacts sent in the last 24 hours from the sheet (used on first run)
  ipcMain.handle('bulkSend:getSentCountFromSheet', async () => {
    try {
      const config = store.store;
      if (!config.google?.refreshToken || !config.google?.sheetId) {
        return 0;
      }

      const client = getOAuth2Client(store);
      client.setCredentials({ refresh_token: config.google.refreshToken });

      const sheetName = config.google.sheetName || 'Sheet1';
      const response = await sheets.spreadsheets.values.get({
        auth: client,
        spreadsheetId: config.google.sheetId,
        range: `${sheetName}!A:AZ`
      });

      const rows = response.data.values || [];
      if (rows.length === 0) return 0;

      const headers = rows[0].map((h: any) => h.toLowerCase().trim());
      const statusCol = headers.indexOf('status');
      const dateSentCol = headers.indexOf('date sent');

      if (statusCol < 0 || dateSentCol < 0) return 0;

      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      let count = 0;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const status = (row[statusCol] ?? '').toLowerCase();
        const dateSent = row[dateSentCol];
        if (status === 'sent' && dateSent) {
          const ts = new Date(dateSent).getTime();
          if (!isNaN(ts) && ts > cutoff) count++;
        }
      }

      return count;
    } catch (error: any) {
      console.error('[BulkSend] getSentCountFromSheet error:', error);
      return 0;
    }
  });

  // Count remaining unsent contacts (lightweight — no full payload)
  ipcMain.handle('bulkSend:getRemainingCount', async () => {
    try {
      const config = store.store;
      if (!config.google?.refreshToken || !config.google?.sheetId) {
        return 0;
      }

      const client = getOAuth2Client(store);
      client.setCredentials({ refresh_token: config.google.refreshToken });

      const sheetName = config.google.sheetName || 'Sheet1';
      const response = await sheets.spreadsheets.values.get({
        auth: client,
        spreadsheetId: config.google.sheetId,
        range: `${sheetName}!A:AZ`,
      });

      const rows = response.data.values || [];
      if (rows.length === 0) return 0;

      const headers = rows[0].map((h: any) => h.toLowerCase().trim());
      const teamMemberCol = headers.indexOf('team member');
      const statusCol = headers.indexOf('status');

      let count = 0;
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const teamMember = teamMemberCol >= 0 ? row[teamMemberCol] : '';
        const status = statusCol >= 0 ? row[statusCol] : '';
        if (!teamMember && status !== 'sent') count++;
      }

      return count;
    } catch (error: any) {
      console.error('[BulkSend] getRemainingCount error:', error);
      return 0;
    }
  });

  // Validate email domain
  ipcMain.handle('bulkSend:validateDomain', async (_event, email: string) => {
    try {
      const validation = await validateEmailDomain(email);
      return validation;
    } catch (error: any) {
      console.error('[BulkSend] validateDomain error:', error);
      return {
        valid: false,
        error: error.message,
        errorType: 'domain-error-temporary'
      };
    }
  });

  // Check for bounces
  ipcMain.handle('bulkSend:checkBounces', async (_event, options?: { daysBack?: number; labelName?: string }) => {
    try {
      const daysBack = options?.daysBack || 7;
      const labelName = options?.labelName;
      
      const config = store.get('google');
      if (!config?.refreshToken) {
        throw new Error('Google account not connected');
      }

      const client = getOAuth2Client(store);
      client.setCredentials({
        refresh_token: config.refreshToken
      });

      // Calculate "since" date
      const since = new Date();
      since.setDate(since.getDate() - daysBack);

      console.log('[BulkSend] Checking for bounces in last', daysBack, 'days');
      if (labelName) {
        console.log('[BulkSend] Searching in label:', labelName);
      }
      const bounces = await checkForBounces(client, since, labelName);
      
      return { success: true, bounces };
    } catch (error: any) {
      console.error('[BulkSend] checkBounces error:', error);
      return { success: false, error: error.message, bounces: [] };
    }
  });
}
