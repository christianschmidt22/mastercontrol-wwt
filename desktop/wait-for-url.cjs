const http = require('node:http');
const https = require('node:https');

const url = process.argv[2];
const timeoutMs = Number(process.argv[3] ?? 60_000);
const intervalMs = 500;
const startedAt = Date.now();

if (!url) {
  console.error('Usage: node desktop/wait-for-url.cjs <url> [timeoutMs]');
  process.exit(1);
}

function requestOnce(targetUrl) {
  const client = targetUrl.startsWith('https:') ? https : http;
  return new Promise((resolve) => {
    const req = client.get(targetUrl, { timeout: 2_000 }, (res) => {
      res.resume();
      resolve(res.statusCode !== undefined && res.statusCode < 500);
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

async function main() {
  while (Date.now() - startedAt < timeoutMs) {
    if (await requestOnce(url)) {
      console.log(`[desktop] ready: ${url}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  console.error(`[desktop] timed out waiting for ${url}`);
  process.exitCode = 1;
}

void main();
