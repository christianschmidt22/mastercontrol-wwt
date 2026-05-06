const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '..');
const migrationsSource = path.join(backendRoot, 'src', 'db', 'migrations');
const migrationsTarget = path.join(backendRoot, 'dist', 'db', 'migrations');
const scriptsSource = path.join(backendRoot, 'src', 'scripts');
const scriptsTarget = path.join(backendRoot, 'dist', 'scripts');

fs.rmSync(migrationsTarget, { recursive: true, force: true });
fs.mkdirSync(path.dirname(migrationsTarget), { recursive: true });
fs.cpSync(migrationsSource, migrationsTarget, { recursive: true });

fs.rmSync(scriptsTarget, { recursive: true, force: true });
fs.mkdirSync(path.dirname(scriptsTarget), { recursive: true });
fs.cpSync(scriptsSource, scriptsTarget, { recursive: true });

console.log(`[backend] copied migrations to ${path.relative(backendRoot, migrationsTarget)}`);
console.log(`[backend] copied scripts to ${path.relative(backendRoot, scriptsTarget)}`);
