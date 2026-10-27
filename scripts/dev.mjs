import { spawn } from 'node:child_process';
const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const server = spawn(process.execPath, ['server/serve.mjs'], { env: { ...process.env, NODE_ENV: 'development' }, stdio: 'inherit' });
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' });
const close = () => { server.kill(); vite.kill(); };
process.on('SIGINT', close);
process.on('SIGTERM', close);
server.on('exit', () => vite.kill());
vite.on('exit', () => server.kill());
