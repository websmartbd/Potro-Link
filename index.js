const { initDB } = require('./src/utils/database');
const bot = require('./src/bot');
const server = require('./src/server');
const config = require('./src/config');

// Initialize database
initDB().then(() => {
  // Start the bot
  bot.launch().then(() => {
    console.log('Bot started successfully');
  }).catch((err) => {
    console.error('Error starting bot:', err);
  });
}).catch(err => {
  console.error('Error initializing database:', err);
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM')); 