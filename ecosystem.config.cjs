// pm2: catflix web (catflix.my.id). Deploy: npm ci && npm run build && pm2 restart catflix
module.exports = { apps: [{ name: 'catflix', cwd: __dirname, script: './server.mjs', env: { PORT: 8110 },
  max_memory_restart: '200M', exp_backoff_restart_delay: 200, autorestart: true, watch: false }] };
