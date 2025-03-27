/**
 * CV Review Bot - Main Entry Point
 * 
 * This file initializes the entire application, connecting all components:
 * - Firebase database (optional)
 * - Telegram bot
 * - Express server for webhooks (in production)
 */

const express = require('express');
const cors = require('cors');
const firebaseConfig = require('./config/firebase');
const config = require('./config').app;
const logger = require('./utils/logger');
const openaiUtil = require('./utils/openaiUtil');
const TelegramBot = require('node-telegram-bot-api');
const handlers = require('./telegram-bot/handlers');

// Initialize Firebase if configured
try {
  if (process.env.FIREBASE_PROJECT_ID) {
    firebaseConfig.initializeFirebase();
    logger.info('Firebase initialized');
  } else {
    logger.warn('Firebase credentials not configured - running without Firebase integration');
  }
} catch (error) {
  logger.error(`Error initializing Firebase: ${error.message}`);
  logger.warn('Continuing without Firebase integration');
}

/**
 * Initialize Telegram bot and register event handlers
 * @returns {TelegramBot} - Initialized bot instance
 */
const initializeBot = () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token) {
    logger.error('TELEGRAM_BOT_TOKEN is not set');
    throw new Error('TELEGRAM_BOT_TOKEN is required');
  }
  
  const options = {
    polling: !config.isProd || process.env.USE_POLLING === 'true'
  };
  
  const bot = new TelegramBot(token, options);
  
  // Register command handlers
  bot.onText(/\/start/, (msg) => handlers.handleStart(bot, msg));
  bot.onText(/\/help/, (msg) => handlers.handleHelp(bot, msg));
  bot.onText(/\/about/, (msg) => handlers.handleAbout(bot, msg));
  bot.onText(/\/status/, (msg) => handlers.handleStatus(bot, msg));
  
  // Register document handler (for CV files)
  bot.on('document', (msg) => handlers.handleDocument(bot, msg));
  
  // Register video handler (for interview responses)
  bot.on('video', (msg) => handlers.handleVideo(bot, msg));
  
  // Register callback query handler (for button clicks)
  bot.on('callback_query', (callbackQuery) => handlers.handleCallbackQuery(bot, callbackQuery));
  
  console.log('Telegram bot started in polling mode');
  logger.info('All bot event handlers registered');
  
  return bot;
};

// Initialize Telegram bot
const bot = initializeBot();
logger.info('Telegram bot initialized');

// Add OpenAI initialization
// Initialize OpenAI if API key is provided
if (process.env.OPENAI_API_KEY) {
  const initialized = openaiUtil.initializeOpenAI(process.env.OPENAI_API_KEY);
  if (initialized) {
    logger.info('OpenAI inicializado correctamente');
  } else {
    logger.warn('No se pudo inicializar OpenAI con la clave proporcionada');
  }
} else {
  logger.warn('No se encontró la clave API de OpenAI, las respuestas no serán mejoradas con IA');
}

// If in production, set up Express server for webhooks
if (config.environment === 'production') {
  const app = express();
  
  // Middleware
  app.use(cors());
  app.use(express.json());
  
  // Webhook route for Telegram
  app.post(`/webhook/${bot.token}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  });
  
  // Health check route
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', environment: config.environment });
  });
  
  // Start server
  app.listen(config.server.port, config.server.host, () => {
    logger.info(`Server running on http://${config.server.host}:${config.server.port}`);
  });
} else {
  // In development mode, just log that the bot is running
  logger.info('Bot is running in development mode using polling');
}

// Handle application shutdown
const handleShutdown = () => {
  logger.info('Application shutting down...');
  // Close any open connections, etc.
  process.exit(0);
};

process.on('SIGINT', handleShutdown);
process.on('SIGTERM', handleShutdown);

// Log any unhandled exceptions or promise rejections
process.on('uncaughtException', (error) => {
  logger.error(`Uncaught Exception: ${error.message}`, { stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', { reason });
});
