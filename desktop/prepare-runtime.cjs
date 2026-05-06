const fs = require('node:fs/promises');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const runtimeDir = path.join(repoRoot, 'desktop', 'runtime');
const targetNode = path.join(runtimeDir, process.platform === 'win32' ? 'node.exe' : 'node');

async function main() {
  await fs.mkdir(runtimeDir, { recursive: true });
  await fs.copyFile(process.execPath, targetNode);
  console.log(`[desktop] copied Node runtime to ${path.relative(repoRoot, targetNode)}`);
}

main().catch((err) => {
  console.error('[desktop] runtime preparation failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
