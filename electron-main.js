import { app, BrowserWindow, dialog, shell } from "electron";
import path from "path";
import fs from "fs";
import http from "http";
import { startServer } from "./server.ts";

let mainWindow = null;
let serverHandle = null;
let isQuitting = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function isWritableDirectory(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    const probe = path.join(dirPath, `.write_test_${process.pid}`);
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function resolveDataDir() {
  if (process.env.DATA_DIR) {
    return path.resolve(process.env.DATA_DIR);
  }

  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (portableDir) {
    // 1. Existing "data" folder or running right inside the project folder
    const directData = path.join(portableDir, "data");
    if (
      (fs.existsSync(directData) || fs.existsSync(path.join(portableDir, "package.json"))) &&
      isWritableDirectory(directData)
    ) {
      return directData;
    }

    // 2. Running from release/BookKeeping.exe inside the project workspace -> share ../data
    const parentDir = path.resolve(portableDir, "..");
    if (
      path.basename(portableDir).toLowerCase() === "release" &&
      fs.existsSync(path.join(parentDir, "package.json"))
    ) {
      const workspaceData = path.join(parentDir, "data");
      if (isWritableDirectory(workspaceData)) {
        return workspaceData;
      }
    }

    // 3. Portable folder right next to BookKeeping.exe
    const portableData = path.join(portableDir, "BookKeepingData");
    if (isWritableDirectory(portableData)) {
      return portableData;
    }
  }

  if (!app.isPackaged) {
    const devData = path.join(process.cwd(), "data");
    if (isWritableDirectory(devData)) {
      return devData;
    }
  }

  // Fallback to Documents/BookKeepingData so user can always find their Excel files easily
  const docsData = path.join(app.getPath("documents"), "BookKeepingData");
  if (isWritableDirectory(docsData)) {
    return docsData;
  }

  return path.join(app.getPath("userData"), "BookKeepingData");
}

function checkExistingBookKeepingServer(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, { timeout: 800 }, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          resolve(Boolean(parsed && parsed.app === "bookkeeping-ledger"));
        } catch {
          resolve(false);
        }
      });
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function createWindow() {
  const appPath = app.getAppPath();
  const unpackedDist = path.join(appPath.replace(/app\.asar$/, "app.asar.unpacked"), "dist");
  const distDir = fs.existsSync(unpackedDist) ? unpackedDist : path.join(appPath, "dist");
  const iconPath = path.join(distDir, "icon-256.png");
  const dataDir = resolveDataDir();

  let targetUrl = "http://127.0.0.1:3000";
  const alreadyRunning = await checkExistingBookKeepingServer(3000);

  if (!alreadyRunning) {
    serverHandle = await startServer({
      port: 3000,
      dataDir,
      distDir,
      isElectron: true,
      onOpenPath: async (targetPath) => {
        await shell.openPath(targetPath);
      },
      onPickFolder: async () => {
        const result = await dialog.showOpenDialog(mainWindow, {
          title: "Select Excel Storage Folder",
          properties: ["openDirectory", "createDirectory"],
        });
        if (result.canceled || !result.filePaths[0]) {
          return null;
        }
        return result.filePaths[0];
      },
      onRenderPdf: async (htmlContent) => {
        const pdfWin = new BrowserWindow({
          show: false,
          width: 820,
          height: 1160,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
          },
        });
        try {
          await pdfWin.loadURL(
            `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`
          );
          const pdfData = await pdfWin.webContents.printToPDF({
            printBackground: true,
            pageSize: "A4",
            margins: { top: 0.35, bottom: 0.35, left: 0.35, right: 0.35 },
          });
          return Buffer.from(pdfData);
        } finally {
          pdfWin.destroy();
        }
      },
    });
    targetUrl = `http://127.0.0.1:${serverHandle.port}`;
  }

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 380,
    minHeight: 620,
    title: "BookKeeping",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    backgroundColor: "#F5F5F7",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  await mainWindow.loadURL(targetUrl);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

if (gotLock) {
  app.whenReady().then(() => {
    createWindow().catch((err) => {
      dialog.showErrorBox("Failed to Start BookKeeping", String(err?.message || err));
      app.quit();
    });
  });

  app.on("window-all-closed", async () => {
    if (isQuitting) return;
    isQuitting = true;
    if (serverHandle) {
      try {
        await serverHandle.close();
      } catch {
        // ignore shutdown error
      }
      serverHandle = null;
    }
    app.quit();
  });

  app.on("activate", () => {
    if (mainWindow === null) {
      createWindow();
    }
  });
}
