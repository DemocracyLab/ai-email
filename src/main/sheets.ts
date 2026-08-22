import { IpcMain } from 'electron';
import Store from 'electron-store';
import { google } from 'googleapis';
import { AppConfig, Contact } from '../shared/types.js';

const sheets = google.sheets('v4');

// Convert column index (0-based) to Excel column letter (A, B, ..., Z, AA, AB, ...)
function columnIndexToLetter(index: number): string {
  let letter = '';
  while (index >= 0) {
    letter = String.fromCharCode(65 + (index % 26)) + letter;
    index = Math.floor(index / 26) - 1;
  }
  return letter;
}

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
        range: `${sheetName}!A:AZ`
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
      const bounceDateCol = headers.findIndex((h: any) => h.toLowerCase().trim() === 'bounce date');
      const bounceReasonCol = headers.findIndex((h: any) => h.toLowerCase().trim() === 'bounce reason');

      const updates: any[] = [];

      // Update Team Member column
      if (teamMemberCol >= 0) {
        const col = columnIndexToLetter(teamMemberCol);
        updates.push({
          range: `${sheetName}!${col}${contact.rowIndex}`,
          values: [[config.user.name]]
        });
      }

      // Update Status column
      if (statusCol >= 0) {
        const col = columnIndexToLetter(statusCol);
        updates.push({
          range: `${sheetName}!${col}${contact.rowIndex}`,
          values: [[contact.status || '']]
        });
      }

      // Update Date Sent column
      if (dateSentCol >= 0) {
        const col = columnIndexToLetter(dateSentCol);
        updates.push({
          range: `${sheetName}!${col}${contact.rowIndex}`,
          values: [[contact.dateSent || '']]
        });
      }

      // Update Message ID column
      if (messageIdCol >= 0) {
        const col = columnIndexToLetter(messageIdCol);
        updates.push({
          range: `${sheetName}!${col}${contact.rowIndex}`,
          values: [[contact.messageId || '']]
        });
      }

      // Update Bounce Date column
      if (bounceDateCol >= 0 && contact.bounceDate) {
        const col = columnIndexToLetter(bounceDateCol);
        updates.push({
          range: `${sheetName}!${col}${contact.rowIndex}`,
          values: [[contact.bounceDate]]
        });
      }

      // Update Bounce Reason column
      if (bounceReasonCol >= 0 && contact.bounceReason) {
        const col = columnIndexToLetter(bounceReasonCol);
        updates.push({
          range: `${sheetName}!${col}${contact.rowIndex}`,
          values: [[contact.bounceReason]]
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

  // Check for required bounce tracking columns
  ipcMain.handle('sheets:checkBounceColumns', async () => {
    try {
      const config = store.get('google');
      if (!config?.refreshToken || !config?.sheetId) {
        return { exists: false, error: 'Google Sheets not configured' };
      }

      const client = getOAuth2Client(store);
      client.setCredentials({
        refresh_token: config.refreshToken
      });

      const sheetName = config.sheetName || 'Sheet1';
      
      const response = await sheets.spreadsheets.values.get({
        auth: client,
        spreadsheetId: config.sheetId,
        range: `${sheetName}!1:1`
      });

      const headers = response.data.values?.[0] || [];
      const headerLower = headers.map((h: any) => h.toLowerCase().trim());
      
      const hasBounceDate = headerLower.includes('bounce date');
      const hasBounceReason = headerLower.includes('bounce reason');

      console.log('[Sheets] Bounce columns check:', { hasBounceDate, hasBounceReason });

      return {
        exists: hasBounceDate && hasBounceReason,
        hasBounceDate,
        hasBounceReason
      };
    } catch (error: any) {
      console.error('[Sheets] Error checking bounce columns:', error);
      return { exists: false, error: error.message };
    }
  });

  // Add bounce tracking columns to sheet
  ipcMain.handle('sheets:addBounceColumns', async () => {
    try {
      const config = store.get('google');
      if (!config?.refreshToken || !config?.sheetId) {
        return { success: false, error: 'Google Sheets not configured' };
      }

      const client = getOAuth2Client(store);
      client.setCredentials({
        refresh_token: config.refreshToken
      });

      const sheetName = config.sheetName || 'Sheet1';
      
      // Get current headers and sheet metadata
      const [headersResponse, sheetMetadata] = await Promise.all([
        sheets.spreadsheets.values.get({
          auth: client,
          spreadsheetId: config.sheetId,
          range: `${sheetName}!1:1`
        }),
        sheets.spreadsheets.get({
          auth: client,
          spreadsheetId: config.sheetId
        })
      ]);

      const headers = headersResponse.data.values?.[0] || [];
      const headerLower = headers.map((h: any) => h.toLowerCase().trim());
      
      // Find the sheet ID for the specific tab
      const sheetTab = sheetMetadata.data.sheets?.find((s: any) => 
        s.properties?.title === sheetName
      );
      const sheetId = sheetTab?.properties?.sheetId;
      const currentColumnCount = sheetTab?.properties?.gridProperties?.columnCount || 26;
      
      console.log('[Sheets] Current column count:', currentColumnCount);
      console.log('[Sheets] Current headers:', headers.length);

      const updates: any[] = [];
      const columnsNeeded = headers.length + 2; // Need space for both new columns
      
      // Check which columns are missing
      const needsBounceDate = !headerLower.includes('bounce date');
      const needsBounceReason = !headerLower.includes('bounce reason');
      
      if (!needsBounceDate && !needsBounceReason) {
        console.log('[Sheets] Bounce columns already exist');
        return { success: true };
      }

      // Expand the sheet if needed
      if (columnsNeeded > currentColumnCount) {
        console.log('[Sheets] Expanding sheet from', currentColumnCount, 'to', columnsNeeded, 'columns');
        await sheets.spreadsheets.batchUpdate({
          auth: client,
          spreadsheetId: config.sheetId,
          requestBody: {
            requests: [{
              appendDimension: {
                sheetId: sheetId,
                dimension: 'COLUMNS',
                length: columnsNeeded - currentColumnCount
              }
            }]
          }
        });
        console.log('[Sheets] ✓ Sheet expanded');
      }

      // Now add the headers
      const nextColIndex = headers.length;

      if (needsBounceDate) {
        const col = columnIndexToLetter(nextColIndex);
        updates.push({
          range: `${sheetName}!${col}1`,
          values: [['Bounce Date']]
        });
        console.log('[Sheets] Adding Bounce Date column at', col);
      }

      if (needsBounceReason) {
        const col = columnIndexToLetter(nextColIndex + (updates.length > 0 ? 1 : 0));
        updates.push({
          range: `${sheetName}!${col}1`,
          values: [['Bounce Reason']]
        });
        console.log('[Sheets] Adding Bounce Reason column at', col);
      }

      if (updates.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          auth: client,
          spreadsheetId: config.sheetId,
          requestBody: {
            data: updates,
            valueInputOption: 'RAW'
          }
        });
        console.log('[Sheets] ✓ Bounce column headers added successfully');
      }

      return { success: true };
    } catch (error: any) {
      console.error('[Sheets] Error adding bounce columns:', error);
      return { success: false, error: error.message };
    }
  });

  // Process bounce results and update sheet
  ipcMain.handle('sheets:processBounces', async (_event, bounces: any[]) => {
    try {
      if (!bounces || bounces.length === 0) {
        return { success: true, updated: 0 };
      }

      const config = store.get('google');
      if (!config?.refreshToken || !config?.sheetId) {
        return { success: false, error: 'Google Sheets not configured', updated: 0 };
      }

      const client = getOAuth2Client(store);
      client.setCredentials({
        refresh_token: config.refreshToken
      });

      const sheetName = config.sheetName || 'Sheet1';
      
      // Get all contacts from sheet (extended range to support columns beyond Z)
      const response = await sheets.spreadsheets.values.get({
        auth: client,
        spreadsheetId: config.sheetId,
        range: `${sheetName}!A:AZ`
      });

      const rows = response.data.values || [];
      if (rows.length === 0) {
        return { success: true, updated: 0 };
      }

      const headers = rows[0].map((h: any) => h.toLowerCase().trim());
      const emailCol = headers.indexOf('email address');
      const statusCol = headers.indexOf('status');
      const bounceDateCol = headers.indexOf('bounce date');
      const bounceReasonCol = headers.indexOf('bounce reason');

      console.log('[Sheets] Headers found:', headers);
      console.log('[Sheets] Column indexes:', { emailCol, statusCol, bounceDateCol, bounceReasonCol });

      if (emailCol < 0 || statusCol < 0 || bounceDateCol < 0 || bounceReasonCol < 0) {
        const missing = [];
        if (emailCol < 0) missing.push('Email Address');
        if (statusCol < 0) missing.push('Status');
        if (bounceDateCol < 0) missing.push('Bounce Date');
        if (bounceReasonCol < 0) missing.push('Bounce Reason');
        console.warn('[Sheets] Missing required columns:', missing);
        return { success: false, error: `Missing required columns: ${missing.join(', ')}`, updated: 0 };
      }

      const updates: any[] = [];
      let updatedCount = 0;

      // For each bounce, find matching contact in sheet
      for (const bounce of bounces) {
        const email = bounce.originalRecipient.toLowerCase().trim();
        
        // Find row with this email
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const rowEmail = (row[emailCol] || '').toLowerCase().trim();
          
          if (rowEmail === email) {
            const rowNum = i + 1;
            
            // Update status
            updates.push({
              range: `${sheetName}!${columnIndexToLetter(statusCol)}${rowNum}`,
              values: [[bounce.bounceType]]
            });
            
            // Update bounce date
            updates.push({
              range: `${sheetName}!${columnIndexToLetter(bounceDateCol)}${rowNum}`,
              values: [[bounce.bounceDate]]
            });
            
            // Update bounce reason
            updates.push({
              range: `${sheetName}!${columnIndexToLetter(bounceReasonCol)}${rowNum}`,
              values: [[bounce.bounceReason]]
            });
            
            updatedCount++;
            console.log('[Sheets] Marking bounce:', email, '-', bounce.bounceType);
            break; // Move to next bounce
          }
        }
      }

      if (updates.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          auth: client,
          spreadsheetId: config.sheetId,
          requestBody: {
            data: updates,
            valueInputOption: 'RAW'
          }
        });
        console.log('[Sheets] ✓ Updated', updatedCount, 'bounced contacts');
      }

      return { success: true, updated: updatedCount };
    } catch (error: any) {
      console.error('[Sheets] Error processing bounces:', error);
      return { success: false, error: error.message, updated: 0 };
    }
  });

  // Count bounces from today in the sheet
  ipcMain.handle('sheets:getTodayBounceCount', async () => {
    try {
      const config = store.get('google');
      if (!config?.refreshToken || !config?.sheetId) {
        return 0;
      }

      const client = getOAuth2Client(store);
      client.setCredentials({
        refresh_token: config.refreshToken
      });

      const sheetName = config.sheetName || 'Sheet1';
      
      // Get all contacts from sheet
      const response = await sheets.spreadsheets.values.get({
        auth: client,
        spreadsheetId: config.sheetId,
        range: `${sheetName}!A:AZ`
      });

      const rows = response.data.values || [];
      if (rows.length === 0) {
        return 0;
      }

      const headers = rows[0].map((h: any) => h.toLowerCase().trim());
      const bounceDateCol = headers.indexOf('bounce date');
      const statusCol = headers.indexOf('status');

      if (bounceDateCol < 0) {
        console.log('[Sheets] Bounce Date column not found');
        return 0;
      }

      const today = new Date().toISOString().split('T')[0];
      let count = 0;

      console.log('[Sheets] Looking for bounces dated:', today);
      console.log('[Sheets] Total rows to check:', rows.length - 1);

      // Count rows with bounce date matching today
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const bounceDate = (row[bounceDateCol] || '').trim();
        const status = statusCol >= 0 ? (row[statusCol] || '').trim() : '';
        
        if (bounceDate || status.includes('bounce')) {
          console.log(`[Sheets] Row ${i}: Status = "${status}", Bounce Date = "${bounceDate}"`);
          
          if (bounceDate && bounceDate.startsWith(today)) {
            count++;
          }
        }
      }

      console.log('[Sheets] Found', count, 'bounces dated today');
      return count;
    } catch (error: any) {
      console.error('[Sheets] Error counting bounces:', error);
      return 0;
    }
  });
}
