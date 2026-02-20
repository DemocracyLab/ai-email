import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import { setupGmailHandlers } from './gmail.js';
import { setupSheetsHandlers } from './sheets.js';
import { AppConfig } from '../shared/types.js';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

console.log('[Main] Environment variables loaded');
console.log('[Main] GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? 'SET' : 'NOT SET');
console.log('[Main] GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 'SET' : 'NOT SET');

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
  console.log('[Main] createWindow called, current mainWindow:', mainWindow !== null ? 'EXISTS' : 'NULL');
  console.log('[Main] Stack trace:', new Error().stack);
  
  // Prevent creating multiple windows
  if (mainWindow !== null) {
    console.log('[Main] Window already exists, skipping creation');
    return;
  }
  
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('[Main] Preload path:', preloadPath);
  console.log('[Main] __dirname:', __dirname);
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

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
