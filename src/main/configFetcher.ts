import { BrowserWindow, shell } from 'electron';
import http from 'http';
import url from 'url';

let activeServer: http.Server | null = null;
let activeTimeout: NodeJS.Timeout | null = null;
let activeReject: ((reason?: any) => void) | null = null;

const cleanupActive = () => {
  if (activeServer) {
    try { activeServer.close(); } catch (e) {}
    activeServer = null;
  }
  if (activeTimeout) {
    clearTimeout(activeTimeout);
    activeTimeout = null;
  }
  if (activeReject) {
    activeReject(new Error('Connection attempt was cancelled.'));
    activeReject = null;
  }
};

export async function fetchConfigFromScript(scriptUrl: string): Promise<{ clientId: string; clientSecret: string; llmApiKey: string }> {
  return new Promise((resolve, reject) => {
    // Clean up any previously hanging server/promise
    cleanupActive();

    activeReject = reject;

    const cleanup = () => {
      if (activeServer) {
        try { activeServer.close(); } catch (e) {}
        activeServer = null;
      }
      if (activeTimeout) {
        clearTimeout(activeTimeout);
        activeTimeout = null;
      }
      activeReject = null;
    };

    activeServer = http.createServer((req, res) => {
      try {
        const parsedUrl = new URL(req.url || '', 'http://localhost:3001');
        
        if (parsedUrl.pathname === '/setup') {
          const dataParam = parsedUrl.searchParams.get('data');
          
          if (!dataParam) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h1>Error: No data parameter found</h1><p>You can close this window and try again.</p>');
            cleanup();
            reject(new Error('No data parameter found in redirect URL.'));
            return;
          }

          const decodedData = Buffer.from(decodeURIComponent(dataParam), 'base64').toString('utf8');
          const configData = JSON.parse(decodedData);

          if (!configData.clientId || !configData.clientSecret || !configData.llmApiKey) {
             res.writeHead(400, { 'Content-Type': 'text/html' });
             res.end('<h1>Error: Missing required configuration data</h1><p>You can close this window and try again.</p>');
             cleanup();
             reject(new Error('Incomplete configuration received from Apps Script.'));
             return;
          }

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body>
                <h1>Configuration Successful!</h1>
                <p>You can safely close this browser window and return to the AI Mail app.</p>
                <script>window.close();</script>
              </body>
            </html>
          `);

          cleanup();
          resolve({
            clientId: configData.clientId,
            clientSecret: configData.clientSecret,
            llmApiKey: configData.llmApiKey
          });
        } else {
          res.writeHead(404);
          res.end();
        }
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('<h1>Internal Server Error processing configuration</h1>');
        cleanup();
        reject(new Error(`Failed to parse configuration: ${err.message}`));
      }
    });

    activeServer.on('error', (err: any) => {
      cleanup();
      // If port 3001 is already in use
      if (err.code === 'EADDRINUSE') {
         reject(new Error('Port 3001 is already in use. Please close any other setup processes and try again.'));
      } else {
         reject(err);
      }
    });

    activeServer.listen(3001, async () => {
      try {
        // Open the Apps script URL so the user can authenticate
        await shell.openExternal(scriptUrl);
        
        // Timeout after 5 minutes if they don't complete the login
        activeTimeout = setTimeout(() => {
          cleanup();
          reject(new Error('Configuration timed out. Please try again.'));
        }, 5 * 60 * 1000); // 5 minutes
      } catch (err: any) {
        cleanup();
        reject(new Error(`Failed to open browser: ${err.message}`));
      }
    });
  });
}