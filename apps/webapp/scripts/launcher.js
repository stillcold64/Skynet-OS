import { spawn } from 'child_process';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webappDir = path.resolve(__dirname, '..');

console.log('===================================================');
console.log('      ⚡ Skynet OS - Master Process Launcher');
console.log('===================================================');

let webProcess = null;
let botProcess = null;
let isShuttingDown = false;
let browserOpened = false;

// 1. Start Next.js Server
function startWebServer() {
  if (isShuttingDown) return;
  console.log('[*] Starting Next.js Web Server on http://localhost:3000...');

  const nextBin = path.join(webappDir, 'node_modules', 'next', 'dist', 'bin', 'next');
  webProcess = spawn(process.execPath, [nextBin, 'start'], {
    cwd: webappDir,
    stdio: 'inherit',
    env: { ...process.env, PORT: '3000', NODE_ENV: 'production' },
  });

  webProcess.on('exit', (code, signal) => {
    if (!isShuttingDown) {
      console.warn(`[WARN] Next.js exited (code: ${code}, signal: ${signal}). Restarting in 2s...`);
      setTimeout(startWebServer, 2000);
    }
  });
}

// 2. Start Telegram Bot
function startTelegramBot() {
  if (isShuttingDown) return;
  console.log('[*] Starting Telegram Bot Worker...');

  const botScript = path.join(webappDir, 'scripts', 'telegram_bot.js');
  botProcess = spawn(process.execPath, [botScript], {
    cwd: webappDir,
    stdio: 'inherit',
    env: process.env,
  });

  botProcess.on('exit', (code, signal) => {
    if (!isShuttingDown) {
      console.warn(`[WARN] Telegram Bot exited (code: ${code}, signal: ${signal}). Restarting in 2s...`);
      setTimeout(startTelegramBot, 2000);
    }
  });
}

// 3. Poll for port 3000 ready and open browser
function openBrowserWhenReady(retries = 30) {
  if (retries <= 0 || isShuttingDown || browserOpened) return;

  const req = http.get('http://localhost:3000/api/transactions', (res) => {
    if (!browserOpened) {
      browserOpened = true;
      console.log('===================================================');
      console.log(' [OK] Skynet OS is Online!');
      console.log('      - Dashboard : http://localhost:3000');
      console.log('      - Bot       : @my_skynet_money_bot');
      console.log('===================================================');
      spawn('cmd', ['/c', 'start', 'http://localhost:3000'], { stdio: 'ignore' });
    }
  });

  req.on('error', () => {
    setTimeout(() => openBrowserWhenReady(retries - 1), 500);
  });
}

// Clean shutdown handlers
function shutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('\n[*] Shutting down Skynet OS services...');
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
