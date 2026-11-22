// pm2: Catflix website + backend. Deploy: npm ci && npm run build && pm2 restart catflix
// Settings live in .env next to this file (see .env.example).
module.exports = {
  apps: [
    {
      name: "catflix",
      cwd: __dirname,
      script: "./server/index.mjs",
      node_args: "--no-warnings=ExperimentalWarning",
      max_memory_restart: "300M",
      exp_backoff_restart_delay: 200,
      autorestart: true,
      watch: false,
    },
  ],
};
