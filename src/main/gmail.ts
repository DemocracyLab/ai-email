import { IpcMain } from 'electron';
import Store from 'electron-store';
import { google } from 'googleapis';
import { AppConfig, EmailData } from '../shared/types.js';
import http from 'http';
import { parse } from 'url';

const gmail = google.gmail('v1');
let oauthServer: http.Server | null = null;
let oauthReject: ((reason?: any) => void) | null = null;

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

function createOAuthServer(store: Store<AppConfig>, mainWindow: any): Promise<string> {
  return new Promise((resolve, reject) => {
    // Close existing server if any
    if (oauthServer) {
      try { oauthServer.close(); } catch (e) {}
      oauthServer = null;
    }
    if (oauthReject) {
      oauthReject(new Error('Connection attempt was cancelled.'));
      oauthReject = null;
    }
    
    oauthReject = reject;

    oauthServer = http.createServer(async (req, res) => {
      const url = parse(req.url!, true);
      
      if (url.pathname === '/oauth2callback') {
        const code = url.query.code as string;
        
        if (code) {
          // Send success response to browser
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <head><title>Authorization Successful</title></head>
              <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h1>Authorization Successful!</h1>
                <p>You can close this window and return to the app.</p>
                <script>window.close();</script>
              </body>
            </html>
          `);
          
          // Close server
          if (oauthServer) {
            try { oauthServer.close(); } catch (e) {}
            oauthServer = null;
          }
          oauthReject = null;

          resolve(code);
        } else {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Missing authorization code');
          reject(new Error('Missing authorization code'));
        }
      }
    });

    oauthServer.listen(3000, () => {
      console.log('[OAuth] Server listening on port 3000');
    });

    oauthServer.on('error', (err: any) => {
      console.error('[OAuth] Server error:', err);
      if (oauthServer) {
        try { oauthServer.close(); } catch (e) {}
        oauthServer = null;
      }
      oauthReject = null;
      if (err.code === 'EADDRINUSE') {
        reject(new Error('Port 3000 is already in use. Please close any other authorization tabs.'));
      } else {
        reject(err);
      }
    });
  });
}

export function setupGmailHandlers(ipcMain: IpcMain, store: Store<AppConfig>, mainWindow: any) {
  // Authorize Gmail
  ipcMain.handle('gmail:authorize', async () => {
    try {
      const client = getOAuth2Client(store);

      // Generate auth URL
      const authUrl = client.generateAuthUrl({
        access_type: 'offline',
        scope: [
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/spreadsheets'
        ],
        prompt: 'consent'
      });

      // Start local server to catch callback
      const codePromise = createOAuthServer(store, mainWindow);

      // Open browser for OAuth
      const { shell } = await import('electron');
      await shell.openExternal(authUrl);

      // Wait for callback (with timeout)
      const code = await Promise.race([
        codePromise,
        new Promise<string>((_, reject) => 
          setTimeout(() => reject(new Error('Authorization timeout')), 120000)
        )
      ]);

      // Exchange code for tokens
      const { tokens } = await client.getToken(code);
      client.setCredentials(tokens);

      // Store refresh token
      if (tokens.refresh_token) {
        const config = store.store;
        await store.set('google', {
          ...config.google,
          refreshToken: tokens.refresh_token,
          sheetId: config.google?.sheetId || '',
          sheetName: config.google?.sheetName || 'Sheet1'
        } as any);
      }

      return { success: true };
    } catch (error: any) {
      console.error('Gmail authorization error:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle OAuth callback (store tokens)
  ipcMain.handle('gmail:saveTokens', async (_event, code: string) => {
    try {
      const client = getOAuth2Client(store);
      const { tokens } = await client.getToken(code);
      client.setCredentials(tokens);

      // Store refresh token
      if (tokens.refresh_token) {
        const config = store.store;
        await store.set('google', {
          ...config.google,
          refreshToken: tokens.refresh_token,
          sheetId: config.google?.sheetId || '',
          sheetName: config.google?.sheetName || 'Sheet1'
        } as any);
      }

      return { success: true };
    } catch (error: any) {
      console.error('Token save error:', error);
      return { success: false, error: error.message };
    }
  });

  // Test Gmail connection
  ipcMain.handle('gmail:test', async () => {
    try {
      const config = store.get('google');
      if (!config?.refreshToken) {
        return false;
      }

      const client = getOAuth2Client(store);
      client.setCredentials({
        refresh_token: config.refreshToken
      });

      await gmail.users.getProfile({
        auth: client,
        userId: 'me'
      });

      return true;
    } catch (error) {
      console.error('Gmail test error:', error);
      return false;
    }
  });

  // Send email
  ipcMain.handle('gmail:send', async (_event, emailData: EmailData) => {
    try {
      const config = store.store;
      if (!config.google?.refreshToken) {
        throw new Error('Gmail not authorized. Please connect your Google account.');
      }

      const client = getOAuth2Client(store);
      client.setCredentials({
        refresh_token: config.google.refreshToken
      });

      // Create email
      const message = [
        `From: ${config.user.name} <${config.user.email}>`,
        `To: ${emailData.to}`,
        `Subject: ${emailData.subject}`,
        'Content-Type: text/html; charset=utf-8',
        '',
        emailData.body
      ].join('\n');

      const encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const response = await gmail.users.messages.send({
        auth: client,
        userId: 'me',
        requestBody: {
          raw: encodedMessage
        }
      });

      return {
        success: true,
        messageId: response.data.id
      };
    } catch (error: any) {
      console.error('Gmail send error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });
}
