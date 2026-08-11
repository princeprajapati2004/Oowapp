'use strict';
const path = require('path');

// nvm stores Node binaries under $HOME/.nvm. Using process.env.HOME makes
// this work on any host path (including UUID-based shared-hosting home dirs)
// without hardcoding a server-specific absolute path.
const HOME = process.env.HOME;
if (!HOME) throw new Error('HOME environment variable is not set');

// Node version where PM2 is installed — update this if you upgrade via nvm.
const NVM_NODE_VERSION = 'v26.5.0';
const NODE_BIN = path.join(HOME, '.nvm', 'versions', 'node', NVM_NODE_VERSION, 'bin', 'node');

module.exports = {
  apps: [
    {
      name: 'oowapp',

      // Run next/dist/bin/next directly as a Node.js script — no npm, no
      // shell wrapper, no PATH dependency.  The interpreter line below pins
      // the exact Node binary so PM2 can (re)start the process even when
      // the shell that launched the PM2 daemon had a different nvm alias.
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: __dirname,
      interpreter: NODE_BIN,

      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',

      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
    },
  ],
};
