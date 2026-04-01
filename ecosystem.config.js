const fs = require('fs');
const path = require('path');

const envFile = path.join(__dirname, '.env.runtime');
const env = {};

if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    env[key] = value;
  }
}

module.exports = {
  apps: [
    {
      name: 'api-server',
      script: 'api-server.js',
      cwd: '/home/ubuntu/medagent-hub',
      env,
    }
  ]
};
