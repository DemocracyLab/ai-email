import { IpcMain } from 'electron';
import Store from 'electron-store';
import { google } from 'googleapis';
import { AppConfig, Contact } from '../shared/types.js';

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

export function setupSheetsHandlers(ipcMain: IpcMain, store: Store<AppConfig>) {
  // Test Sheets connection and validate column headers
  ipcMain.handle('sheets:test', async () => {
    try {
      const config = store.get('google');
      if (!config?.refreshToken) {
        return { success: false, error: 'Google account not connected' };
      }
      
      if (!config?.sheetId) {
        return { success: false, error: 'Sheet URL not configured' };
      }

      const client = getOAuth2Client(store);
      client.setCredentials({
        refresh_token: config.refreshToken
      });

      const sheetName = config.sheetName || 'Sheet1';
      console.log('[Sheets Test] Testing sheet:', config.sheetId, 'tab:', sheetName);
      
      const response = await sheets.spreadsheets.values.get({
        auth: client,
        spreadsheetId: config.sheetId,
        range: `${sheetName}!A1:Z1`
      });

      const headers = response.data.values?.[0] || [];
      const headerLower = headers.map((h: any) => h.toLowerCase().trim());
      
      console.log('[Sheets Test] Found headers:', headers);
      console.log('[Sheets Test] Normalized:', headerLower);
      
      // Validate required columns
      const requiredColumns = ['email address', 'first name', 'last name'];
      const missingColumns = requiredColumns.filter(col => !headerLower.includes(col));
      
      if (missingColumns.length > 0) {
        const formatted = missingColumns.map(col => 
          col.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
        );
        return { 
          success: false, 
          error: `Missing required columns: ${formatted.join(', ')}. Required: Email Address, First Name, Last Name`
        };
      }

      console.log('[Sheets Test] All required columns found!');
      return { success: true };
    } catch (error: any) {
      console.error('[Sheets Test] Error:', error);
      return { success: false, error: error.message || 'Failed to access sheet. Check Sheet URL and permissions.' };
    }
  });

  // Get contacts
  ipcMain.handle('sheets:getContacts', async () => {
    try {
      const config = store.store;
      if (!config.google?.refreshToken || !config.google?.sheetId) {
        throw new Error('Google Sheets not configured');
      }

      const client = getOAuth2Client(store);
      client.setCredentials({
        refresh_token: config.google.refreshToken
      });

      const sheetName = config.google.sheetName || 'Sheet1';
      const response = await sheets.spreadsheets.values.get({
        auth: client,
        spreadsheetId: config.google.sheetId,
        range: `${sheetName}!A:Z`
      });

      const rows = response.data.values || [];
      if (rows.length === 0) {
        return [];
      }

      const headers = rows[0].map((h: any) => h.toLowerCase().trim());
      const emailCol = headers.indexOf('email address');
      const firstNameCol = headers.indexOf('first name');
      const lastNameCol = headers.indexOf('last name');
      const teamMemberCol = headers.indexOf('team member');
      const statusCol = headers.indexOf('status');
      const dateSentCol = headers.indexOf('date sent');
      const messageIdCol = headers.indexOf('gmail message id');

      const contacts: Contact[] = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const teamMember = teamMemberCol >= 0 ? row[teamMemberCol] : '';
        const status = statusCol >= 0 ? row[statusCol] : '';

        // Only include unsent contacts
        if (!teamMember && status !== 'sent') {
          contacts.push({
            email: row[emailCol] || '',
            firstName: firstNameCol >= 0 ? row[firstNameCol] : '',
            lastName: lastNameCol >= 0 ? row[lastNameCol] : '',
            teamMember,
            status: status as any,
            dateSent: dateSentCol >= 0 ? row[dateSentCol] : undefined,
            messageId: messageIdCol >= 0 ? row[messageIdCol] : undefined,
            rowIndex: i + 1
          });
        }
      }

      return contacts;
    } catch (error: any) {
      console.error('Get contacts error:', error);
      throw error;
    }
  });

  // Update contact
  ipcMain.handle('sheets:updateContact', async (_event, contact: Contact) => {
    try {
      const config = store.store;
      if (!config.google?.refreshToken || !config.google?.sheetId) {
        throw new Error('Google Sheets not configured');
      }

      const client = getOAuth2Client(store);
      client.setCredentials({
        refresh_token: config.google.refreshToken
      });

      const sheetName = config.google.sheetName || 'Sheet1';
      
      // Get headers to find column positions
      const headersResponse = await sheets.spreadsheets.values.get({
        auth: client,
        spreadsheetId: config.google.sheetId,
        range: `${sheetName}!1:1`
      });

      const headers = headersResponse.data.values?.[0] || [];
      const teamMemberCol = headers.findIndex((h: any) => h.toLowerCase().trim() === 'team member');
      const statusCol = headers.findIndex((h: any) => h.toLowerCase().trim() === 'status');
      const dateSentCol = headers.findIndex((h: any) => h.toLowerCase().trim() === 'date sent');
      const messageIdCol = headers.findIndex((h: any) => h.toLowerCase().trim() === 'gmail message id');

      const updates: any[] = [];

      // Update Team Member column
      if (teamMemberCol >= 0) {
        const col = String.fromCharCode(65 + teamMemberCol);
        updates.push({
          range: `${sheetName}!${col}${contact.rowIndex}`,
          values: [[config.user.name]]
        });
      }

      // Update Status column
      if (statusCol >= 0) {
        const col = String.fromCharCode(65 + statusCol);
        updates.push({
          range: `${sheetName}!${col}${contact.rowIndex}`,
          values: [[contact.status || '']]
        });
      }

      // Update Date Sent column
      if (dateSentCol >= 0) {
        const col = String.fromCharCode(65 + dateSentCol);
        updates.push({
          range: `${sheetName}!${col}${contact.rowIndex}`,
          values: [[contact.dateSent || '']]
        });
      }

      // Update Message ID column
      if (messageIdCol >= 0) {
        const col = String.fromCharCode(65 + messageIdCol);
        updates.push({
          range: `${sheetName}!${col}${contact.rowIndex}`,
          values: [[contact.messageId || '']]
        });
      }

      if (updates.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          auth: client,
          spreadsheetId: config.google.sheetId,
          requestBody: {
            data: updates,
            valueInputOption: 'RAW'
          }
        });
      }

      return true;
    } catch (error: any) {
      console.error('Update contact error:', error);
      return false;
    }
  });
}
