/**
 * CV Review Bot - Main Entry Point
 * 
 * This file initializes the WhatsApp bot application
 */

const express = require('express');
const cors = require('cors');
const firebaseConfig = require('./config/firebase');
const config = require('./config').app;
const logger = require('./utils/logger');
const openaiUtil = require('./utils/openaiUtil');

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

// Add OpenAI initialization
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

// Initialize WhatsApp bot
require('./whatsapp-bot');

// Handle application shutdown
const handleShutdown = () => {
  logger.info('Application shutting down...');
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
