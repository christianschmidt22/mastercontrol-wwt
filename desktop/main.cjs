const { app, BrowserWindow, Menu, shell } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const APP_ID = 'com.wwt.mastercontrol.work';
const APP_NAME = 'MasterControl_work';
const BACKEND_HOST = '127.0.0.1';
const devUrl = getCliArg('--dev-url=');
const BACKEND_PORT = devUrl ? 3001 : 30011;
const FRONTEND_PORT = 51730;
const BACKEND_ORIGIN = `http://${BACKEND_HOST}:${BACKEND_PORT}`;
const HEALTH_URL = `${BACKEND_ORIGIN}/api/health`;

let mainWindow = null;
let backendProcess = null;
let frontendServer = null;
let frontendOrigin = null;
let appIsQuitting = false;

function getCliArg(prefix) {
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function iconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app', 'desktop', 'assets', 'icon.png')
    : path.join(app.getAppPath(), 'desktop', 'assets', 'icon.png');
}

function backendEntryPath() {
  return path.join(app.getAppPath(), 'backend', 'dist', 'index.js');
}

function backendRuntimePath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'node', process.platform === 'win32' ? 'node.exe' : 'node');
  }
  return process.execPath;
}

function backendDatabasePath() {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  if (process.env.MASTERCONTROL_DB_PATH) return process.env.MASTERCONTROL_DB_PATH;

  const repoDatabasePath = path.join('C:\\', 'mastercontrol', 'database', 'mastercontrol.db');
  if (fs.existsSync(path.dirname(repoDatabasePath))) return repoDatabasePath;

  return path.join(app.getPath('userData'), 'database', 'mastercontrol.db');
}

function statePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function logDirectory() {
  return path.join(app.getPath('userData'), 'logs');
}

function desktopLogPath() {
  return path.join(logDirectory(), 'desktop.log');
}

async function appendDesktopLog(message) {
  await fsp.mkdir(logDirectory(), { recursive: true });
  await fsp.appendFile(desktopLogPath(), `[${new Date().toISOString()}] ${message}\n`);
}

function readWindowState() {
  try {
    const raw = fs.readFileSync(statePath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed;
  } catch {
    return {};
  }
}

async function writeWindowState(window) {
  if (!window || window.isDestroyed()) return;
  const bounds = window.getBounds();
  const state = {
    ...bounds,
    isMaximized: window.isMaximized(),
  };
  await fsp.mkdir(app.getPath('userData'), { recursive: true });
  await fsp.writeFile(statePath(), JSON.stringify(state, null, 2));
}

function startupHtml(message = 'Starting MasterControl...') {
  const iconUrl = pathToFileURL(iconPath()).href;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${APP_NAME}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0e1714;
      --surface: #17382b;
      --rule: #2d5b48;
      --ink: #f2ead2;
      --muted: #9fb3a7;
      --accent: #f07c67;
    }
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      background: var(--bg);
      color: var(--ink);
      font-family: "Segoe UI", sans-serif;
    }
    body {
      display: grid;
      place-items: center;
    }
    main {
      display: grid;
      gap: 18px;
      justify-items: center;
      padding: 36px;
      border: 1px solid var(--rule);
      background: var(--surface);
      border-radius: 10px;
      min-width: 320px;
    }
    img {
      width: 64px;
      height: 64px;
      image-rendering: auto;
    }
    h1 {
      margin: 0;
      font-family: Georgia, serif;
      font-size: 28px;
      font-weight: 700;
    }
    p {
      margin: 0;
      color: var(--muted);
      font-size: 14px;
    }
    .bar {
      width: 180px;
      height: 3px;
      overflow: hidden;
      border-radius: 999px;
      background: #10251d;
    }
    .bar::after {
      content: "";
      display: block;
      width: 70px;
      height: 100%;
      background: var(--accent);
      animation: load 1.2s ease-in-out infinite;
    }
    @keyframes load {
      0% { transform: translateX(-80px); }
      100% { transform: translateX(210px); }
    }
  </style>
</head>
<body>
  <main>
    <img src="${iconUrl}" alt="" />
    <h1>${APP_NAME}</h1>
    <p>${message}</p>
    <div class="bar" aria-hidden="true"></div>
  </main>
</body>
</html>`;
}

function errorHtml(message) {
  return startupHtml(message).replace('class="bar" aria-hidden="true"', 'class="bar" aria-hidden="true" style="display:none"');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestOk(url, timeoutMs = 1_500) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 500));
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

async function waitForHealth(timeoutMs = 45_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await requestOk(HEALTH_URL)) return true;
    if (backendProcess?.exitCode !== null) return false;
    await sleep(500);
  }
  return false;
}

async function startBackend() {
  if (await requestOk(HEALTH_URL)) {
    console.log('[desktop] reusing existing MasterControl backend');
    return;
  }

  const backendEntry = backendEntryPath();
  if (!fs.existsSync(backendEntry)) {
    throw new Error(`Backend entry not found: ${backendEntry}`);
  }

  const runtime = backendRuntimePath();
  if (!fs.existsSync(runtime)) {
    throw new Error(`Node runtime not found: ${runtime}`);
  }

  await fsp.mkdir(logDirectory(), { recursive: true });
  const dbPath = backendDatabasePath();
  if (dbPath !== ':memory:') {
    await fsp.mkdir(path.dirname(dbPath), { recursive: true });
  }
  await appendDesktopLog(`starting backend runtime=${runtime} entry=${backendEntry} port=${BACKEND_PORT} db=${dbPath}`);
  const stdoutLog = fs.createWriteStream(path.join(logDirectory(), 'backend.out.log'), { flags: 'a' });
  const stderrLog = fs.createWriteStream(path.join(logDirectory(), 'backend.err.log'), { flags: 'a' });

  backendProcess = spawn(runtime, [backendEntry], {
    cwd: app.getAppPath(),
    env: {
      ...process.env,
      DB_PATH: dbPath,
      NODE_ENV: 'production',
      PORT: String(BACKEND_PORT),
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  backendProcess.stdout.on('data', (chunk) => {
    console.log(`[backend] ${String(chunk).trimEnd()}`);
    stdoutLog.write(chunk);
  });
  backendProcess.stderr.on('data', (chunk) => {
    console.warn(`[backend] ${String(chunk).trimEnd()}`);
    stderrLog.write(chunk);
  });
  backendProcess.on('exit', (code, signal) => {
    stdoutLog.end();
    stderrLog.end();
    if (!appIsQuitting) {
      console.warn(`[desktop] backend exited unexpectedly: code=${code} signal=${signal}`);
      void appendDesktopLog(`backend exited unexpectedly: code=${code} signal=${signal}`);
    }
    backendProcess = null;
  });

  if (!(await waitForHealth())) {
    throw new Error(`Backend did not become healthy before timeout. Logs: ${logDirectory()}`);
  }
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.png':
      return 'image/png';
    case '.ico':
      return 'image/x-icon';
    case '.svg':
      return 'image/svg+xml';
    case '.woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
}

function proxyApi(req, res) {
  const origin = req.headers.origin;
  if (origin && origin !== frontendOrigin) {
    res.writeHead(403, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: `origin not allowed: ${origin}` }));
    return;
  }

  const headers = { ...req.headers };
  delete headers.origin;
  delete headers.referer;
  headers.host = `${BACKEND_HOST}:${BACKEND_PORT}`;

  const proxyReq = http.request(
    {
      hostname: BACKEND_HOST,
      port: BACKEND_PORT,
      path: req.url,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on('error', () => {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'MasterControl backend is not available.' }));
  });

  req.pipe(proxyReq);
}

async function serveStaticFile(staticRoot, req, res) {
  const requestUrl = new URL(req.url, frontendOrigin);
  let pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname === '/') pathname = '/index.html';

  const requestedPath = path.normalize(path.join(staticRoot, pathname));
  const staysInsideRoot = requestedPath.startsWith(staticRoot);
  const candidatePath = staysInsideRoot ? requestedPath : path.join(staticRoot, 'index.html');

  try {
    const stat = await fsp.stat(candidatePath);
    if (!stat.isFile()) throw new Error('not a file');
    res.writeHead(200, {
      'content-type': contentTypeFor(candidatePath),
      'cache-control': candidatePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    fs.createReadStream(candidatePath).pipe(res);
  } catch {
    const indexPath = path.join(staticRoot, 'index.html');
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-cache',
    });
    fs.createReadStream(indexPath).pipe(res);
  }
}

async function startFrontendServer() {
  const staticRoot = path.join(app.getAppPath(), 'frontend', 'dist');
  const indexPath = path.join(staticRoot, 'index.html');
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Frontend build not found: ${indexPath}`);
  }

  frontendServer = http.createServer((req, res) => {
    if (!req.url) {
      res.writeHead(400);
      res.end();
      return;
    }
    if (req.url.startsWith('/api/')) {
      proxyApi(req, res);
      return;
    }
    void serveStaticFile(staticRoot, req, res);
  });

  await new Promise((resolve, reject) => {
    frontendServer.once('error', reject);
    frontendServer.listen(FRONTEND_PORT, BACKEND_HOST, resolve);
  });

  const address = frontendServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not determine desktop frontend server port.');
  }
  frontendOrigin = `http://${BACKEND_HOST}:${address.port}`;
  console.log(`[desktop] frontend listening on ${frontendOrigin}`);
  return frontendOrigin;
}

function createWindow() {
  const state = readWindowState();
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: Number(state.width) || 1280,
    height: Number(state.height) || 820,
    x: Number.isInteger(state.x) ? state.x : undefined,
    y: Number.isInteger(state.y) ? state.y : undefined,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#0e1714',
    icon: iconPath(),
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  if (state.isMaximized) mainWindow.maximize();

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', () => {
    void writeWindowState(mainWindow);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedOrigin = devUrl ? new URL(devUrl).origin : frontendOrigin;
    if (allowedOrigin && new URL(url).origin === allowedOrigin) return;
    event.preventDefault();
    void shell.openExternal(url);
  });

  void mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(startupHtml())}`);
  return mainWindow;
}

async function boot() {
  Menu.setApplicationMenu(null);
  const window = createWindow();

  try {
    if (devUrl) {
      await window.loadURL(devUrl);
      return;
    }

    await startBackend();
    const frontendUrl = await startFrontendServer();
    await window.loadURL(frontendUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[desktop] boot failed:', message);
    await appendDesktopLog(`boot failed: ${message}`);
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(errorHtml(`Could not start MasterControl: ${message}`))}`);
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.setName(APP_NAME);
  app.setAppUserModelId(APP_ID);

  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.on('before-quit', () => {
    appIsQuitting = true;
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('will-quit', () => {
    if (frontendServer) frontendServer.close();
    if (backendProcess) backendProcess.kill();
  });

  void app.whenReady().then(boot);
}
