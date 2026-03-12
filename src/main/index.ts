import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import { setupGmailHandlers } from './gmail.js';
import { setupSheetsHandlers } from './sheets.js';
import { setupSecretsHandlers } from './secrets.js';
import { fetchConfigFromScript } from './configFetcher.js';
import { AppConfig } from '../shared/types.js';
import dotenv from 'dotenv';

// Load environment variables from .env file in project root or current working directory
dotenv.config();

// Also try loading from app data path if not in dev
if (!process.env.VITE_DEV_SERVER_URL) {
  dotenv.config({ path: path.join(app.getPath('userData'), '.env') });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const store = new Store<AppConfig>({
  encryptionKey: 'ai-mail-encryption-key-change-in-production',
  defaults: {
    user: {
      name: '',
      email: ''
    },
    llm: {
      provider: 'gemini',
      apiKey: '',
      model: ''
    },
    context: {
      lastFilePath: undefined,
      content: ''
    }
  }
});

let mainWindow: BrowserWindow | null = null;
let appStarted = false;

const createWindow = () => {
  // Prevent creating multiple windows
  if (mainWindow !== null) {
    console.log('[Main] Window already exists, skipping creation');
    return;
  }
  
  const preloadPath = path.join(__dirname, 'preload.js');
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Set Content Security Policy for production builds
  // In development, the HTML meta tag CSP allows unsafe-eval for HMR
  // In production, we apply a stricter policy via session
  if (!process.env.VITE_DEV_SERVER_URL) {
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self';" +
            "script-src 'self';" +
            "style-src 'self' 'unsafe-inline';" +
            "img-src 'self' data: https:;" +
            "font-src 'self' data:;" +
            "connect-src 'self' " +
            "https://accounts.google.com " +
            "https://oauth2.googleapis.com " +
            "https://www.googleapis.com " +
            "https://generativelanguage.googleapis.com " +
            "https://api.openai.com " +
            "https://sheets.googleapis.com " +
            "https://secretmanager.googleapis.com " +
            "https://gmail.googleapis.com;"
          ]
        }
      });
    });
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    // Don't auto-open dev tools - user can open with F12 if needed
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.whenReady().then(() => {
  console.log('[Main] app.whenReady called, appStarted:', appStarted);
  
  if (appStarted) {
    console.log('[Main] App already started, exiting');
    return;
  }
  appStarted = true;
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Config handlers
ipcMain.handle('config:get', () => {
  return store.store;
});

ipcMain.handle('config:set', (_event, config: Partial<AppConfig>) => {
  store.set(config as any);
  return store.store;
});

ipcMain.handle('config:clear', () => {
  store.clear();
  return store.store;
});

ipcMain.handle('config:fetch-from-script', async (_event, scriptUrl: string) => {
  try {
    const result = await fetchConfigFromScript(scriptUrl);
    
    // Save to store
    store.set('google.clientId', result.clientId);
    store.set('google.clientSecret', result.clientSecret);
    store.set('google.scriptUrl', scriptUrl);
    store.set('llm.apiKey', result.llmApiKey);
    
    return store.store;
  } catch (error: any) {
    console.error('[Config] Error fetching config from script:', error);
    throw new Error(error.message || 'Failed to fetch configuration');
  }
});

// File handlers
ipcMain.handle('file:select', async () => {
  const { dialog } = await import('electron');
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [
      { name: 'Markdown Files', extensions: ['md'] },
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const fs = await import('fs/promises');
    const content = await fs.readFile(result.filePaths[0], 'utf-8');
    return { path: result.filePaths[0], content };
  }
  return null;
});

ipcMain.handle('file:save', async (_event, filePath: string, content: string) => {
  const fs = await import('fs/promises');
  await fs.writeFile(filePath, content, 'utf-8');
  return true;
});

// Setup Gmail and Sheets handlers
setupGmailHandlers(ipcMain, store, mainWindow);
setupSheetsHandlers(ipcMain, store);
setupSecretsHandlers(ipcMain, store);
