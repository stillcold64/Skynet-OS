module.exports = {
  apps: [
    {
      name: 'skynet-web',
      cwd: 'C:/Users/Win10/Desktop/UHNWI/apps/webapp',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      autorestart: true,
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    },
    {
      name: 'skynet-bot',
      cwd: 'C:/Users/Win10/Desktop/UHNWI/apps/webapp',
      script: 'scripts/telegram_bot.js',
      autorestart: true,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
