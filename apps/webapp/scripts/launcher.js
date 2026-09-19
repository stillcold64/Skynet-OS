import { spawn } from 'child_process';
import path from 'path';
import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webappDir = path.resolve(__dirname, '..');
const logsDir = path.join(webappDir, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFilePath = path.join(logsDir, 'launcher.log');
const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });

function log(msg) {
  const line = `[${new Date().toLocaleString('th-TH')}] ${msg}`;
  console.log(line);
  try {
    logStream.write(line + '\n');
  } catch (e) {}
}

log('===================================================');
log('      ⚡ Skynet OS - Master Process Launcher');
log('===================================================');

process.on('uncaughtException', (err) => {
  log(`[CRITICAL] Uncaught Exception in launcher: ${err.stack || err.message}`);
});
process.on('unhandledRejection', (reason) => {
  log(`[CRITICAL] Unhandled Rejection in launcher: ${reason}`);
});

let webProcess = null;
let botProcess = null;
let isShuttingDown = false;
let browserOpened = false;

// 1. Start Next.js Server
function startWebServer() {
  if (isShuttingDown) return;
  log('[*] Starting Next.js Web Server on http://localhost:3000...');

  const nextBin = path.join(webappDir, 'node_modules', 'next', 'dist', 'bin', 'next');
  webProcess = spawn(process.execPath, [nextBin, 'start'], {
    cwd: webappDir,
    stdio: 'inherit',
    env: { ...process.env, PORT: '3000', NODE_ENV: 'production' },
  });

  webProcess.on('exit', (code, signal) => {
    if (!isShuttingDown) {
      log(`[WARN] Next.js exited (code: ${code}, signal: ${signal}). Restarting in 3s...`);
      setTimeout(startWebServer, 3000);
    }
  });
}

// 2. Start Telegram Bot
function startTelegramBot() {
  if (isShuttingDown) return;
  log('[*] Starting Telegram Bot Worker...');

  const botScript = path.join(webappDir, 'scripts', 'telegram_bot.js');
  botProcess = spawn(process.execPath, [botScript], {
    cwd: webappDir,
    stdio: 'inherit',
    env: process.env,
  });

  botProcess.on('exit', (code, signal) => {
    if (!isShuttingDown) {
      log(`[WARN] Telegram Bot exited (code: ${code}, signal: ${signal}). Restarting in 3s...`);
      setTimeout(startTelegramBot, 3000);
    }
  });
}

// 3. Poll for port 3000 ready and open browser
function openBrowserWhenReady(retries = 30) {
  if (retries <= 0 || isShuttingDown || browserOpened) return;

  const req = http.get('http://localhost:3000/api/transactions', (res) => {
    if (!browserOpened) {
      browserOpened = true;
      log('===================================================');
      log(' [OK] Skynet OS is Online!');
      log('      - Dashboard : http://localhost:3000');
      log('      - Bot       : @my_skynet_money_bot');
      log('===================================================');
      if (process.env.AUTO_OPEN_BROWSER !== '0') {
        spawn('cmd', ['/c', 'start', 'http://localhost:3000'], { stdio: 'ignore' });
      }
    }
  });

  req.on('error', () => {
    setTimeout(() => openBrowserWhenReady(retries - 1), 1000);
  });
}

// Clean shutdown handlers
function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  log('\n[*] Shutting down Skynet OS services...');
  if (webProcess) webProcess.kill('SIGTERM');
  if (botProcess) botProcess.kill('SIGTERM');
  setTimeout(() => process.exit(0), 1000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Launch everything
startWebServer();
startTelegramBot();
openBrowserWhenReady();

