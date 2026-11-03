/**
 * Configurazione PM2 (alternativa a systemd: usa UNO dei due, non entrambi).
 * Estensione .cjs perché il progetto usa ES Modules ("type": "module").
 *
 *   sudo npm install -g pm2
 *   pm2 start ecosystem.config.cjs
 *   pm2 save                 # memorizza la lista dei processi
 *   pm2 startup systemd      # stampa un comando sudo da eseguire: avvio al boot
 *   pm2 logs smart-frame     # log in tempo reale
 */
module.exports = {
  apps: [
    {
      name: 'smart-frame',
      script: 'server/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,          // riparte in caso di crash
      restart_delay: 5000,        // attende 5 s prima di ripartire
      max_restarts: 50,
      exp_backoff_restart_delay: 1000,
      max_memory_restart: '400M', // riavvia se supera 400 MB
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      time: true,                 // timestamp nei log
    },
  ],
};
