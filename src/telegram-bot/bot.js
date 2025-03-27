/**
 * Telegram bot main module
 * Initializes the bot and registers all event handlers
 */

const { createBot } = require('../config/telegram');
const handlers = require('./handlers');
const logger = require('../utils/logger');

/**
 * Initialize the Telegram bot and register all event handlers
 * @returns {Object} - The configured bot instance
 */
const initializeBot = () => {
  try {
    // Create bot instance
    const bot = createBot();
    logger.info('Telegram bot created');
    
    // Register command handlers
    bot.onText(/\/start/, (msg) => handlers.handleStart(bot, msg));
    bot.onText(/\/help/, (msg) => handlers.handleHelp(bot, msg));
    bot.onText(/\/about/, (msg) => handlers.handleAbout(bot, msg));
    bot.onText(/\/status/, (msg) => handlers.handleStatus(bot, msg));
    
    // Register document handler (for CV files)
    bot.on('document', (msg) => handlers.handleDocument(bot, msg));
    
    // Register photo handler (for CV images)
    bot.on('photo', (msg) => {
      bot.sendMessage(
        msg.chat.id,
        'For best results, please send your CV as a document rather than a photo. ' +
        'This ensures better analysis accuracy. You can convert images to PDF using online tools.',
      );
    });
    
    // Register callback query handler (for interactive buttons)
    bot.on('callback_query', (callbackQuery) => handlers.handleCallbackQuery(bot, callbackQuery));
    
    // Handle errors
    bot.on('polling_error', (error) => {
      logger.error(`Polling error: ${error.message}`);
    });
    
    bot.on('webhook_error', (error) => {
      logger.error(`Webhook error: ${error.message}`);
    });
    
    // Handle all other messages
    bot.on('message', (msg) => {
      // Skip command and document messages (they're handled above)
      if (msg.text && msg.text.startsWith('/')) return;
      if (msg.document) return;
      if (msg.photo) return;
      
      // Handle text messages (could be job descriptions or questions)
      if (msg.text) {
        bot.sendMessage(
          msg.chat.id,
          'Please send your CV as a document file (PDF, DOCX, etc.). ' +
          'Type /help to see all available commands.',
        );
      }
    });
    
    logger.info('All bot event handlers registered');
    return bot;
  } catch (error) {
    logger.error(`Error initializing bot: ${error.message}`);
    throw error;
  }
};

module.exports = {
  initializeBot,
};
