import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let serverProcess;

async function createWindow() {
  const userDataPath = app.getPath('userData');
  const dataDir = path.join(userDataPath, 'BusinessData');
  
  const appPath = app.getAppPath();
  const serverPath = path.join(appPath, 'server.ts');
  
  console.log('App Path:', appPath);
  console.log('Server Path:', serverPath);
  
  // Start the server process
  // Use the local tsx binary for reliability
  const tsxPath = path.join(appPath, 'node_modules', '.bin', 'tsx' + (process.platform === 'win32' ? '.cmd' : ''));
  
  serverProcess = spawn(tsxPath, [serverPath], {
    env: { 
      ...process.env, 
      PORT: '3000',
      DATA_DIR: dataDir,
      NODE_ENV: 'production',
      ELECTRON_RUN: 'true'
    },
    shell: true,
    cwd: appPath
  });

  serverProcess.stdout.on('data', (data) => {
    const msg = data.toString();
    console.log(`Server: ${msg}`);
    // If we see the server is running, we can load the URL earlier
    if (msg.includes('Server running')) {
      if (mainWindow) mainWindow.loadURL('http://localhost:3000');
    }
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`Server Error: ${data}`);
  });

  mainWindow = new BrowserWindow({
    width: 1300,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    title: "Business Transaction Digitizer",
    backgroundColor: '#f4f4f5' // zinc-50 color
  });

  // Fallback timeout if the "Server running" message isn't caught
  const fallbackTimeout = setTimeout(() => {
    if (mainWindow && !mainWindow.webContents.getURL()) {
      mainWindow.loadURL('http://localhost:3000');
    }
  }, 5000);

  mainWindow.on('closed', () => {
    clearTimeout(fallbackTimeout);
    mainWindow = null;
  });

  // Handle load failures (e.g. server not ready)
  mainWindow.webContents.on('did-fail-load', () => {
    console.log('Failed to load, retrying in 2s...');
    setTimeout(() => {
      if (mainWindow) mainWindow.loadURL('http://localhost:3000');
    }, 2000);
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
