/**
 * Telegram configuration module
 * Manages Telegram bot configuration and initialization
 */

const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv');

dotenv.config();

// Validate that the Telegram token is available
const validateConfig = () => {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN environment variable is not set');
  }
};

/**
 * Bot configuration options
 */
const botConfig = {
  polling: process.env.NODE_ENV !== 'production',
  // Default webhook configuration if running in production
  webHook: process.env.NODE_ENV === 'production' ? {
    port: process.env.PORT || 8443,
    host: process.env.HOST || '0.0.0.0',
  } : undefined,
};

/**
 * Create and initialize the Telegram bot
 * @returns {TelegramBot} Configured Telegram Bot instance
 */
const createBot = () => {
  validateConfig();
  
  const token = process.env.TELEGRAM_BOT_TOKEN;
  let bot;
  
  if (process.env.NODE_ENV === 'production') {
    // In production, use webhook to receive updates
    const webhookUrl = process.env.WEBHOOK_URL;
    if (!webhookUrl) {
      throw new Error('WEBHOOK_URL environment variable is required in production');
    }
    
    bot = new TelegramBot(token, { webHook: botConfig.webHook });
    bot.setWebHook(webhookUrl);
    console.log(`Telegram bot webhook set to ${webhookUrl}`);
  } else {
    // In development, use polling to receive updates
    bot = new TelegramBot(token, { polling: true });
    console.log('Telegram bot started in polling mode');
  }
  
  return bot;
};

module.exports = {
  createBot,
  validateConfig,
  botConfig,
};
