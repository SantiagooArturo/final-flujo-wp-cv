/**
 * Central configuration module
 * Exports all configuration modules from a single entry point
 */

const firebaseConfig = require('./firebase');
const telegramConfig = require('./telegram');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Application-wide configuration
const appConfig = {
  // CV analyzer service configuration
  cvAnalyzer: {
    apiUrl: process.env.CV_ANALYZER_API_URL || 'http://localhost:5000',
    timeout: parseInt(process.env.CV_ANALYZER_TIMEOUT || '60000', 10), // 60 seconds default
  },
  
  // Application environment
  environment: process.env.NODE_ENV || 'development',
  
  // Server configuration
  server: {
    port: process.env.PORT || 3000,
    host: process.env.HOST || 'localhost',
  },
  
  // File upload configuration
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10), // 10MB default
    allowedMimeTypes: [
      'application/pdf',                                              // PDF
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
      'application/msword',                                           // DOC
      'text/plain',                                                   // TXT
      'application/rtf',                                              // RTF
      'image/jpeg',                                                   // JPEG/JPG
      'image/png',                                                    // PNG
    ],
  },
};

module.exports = {
  app: appConfig,
  firebase: firebaseConfig,
  telegram: telegramConfig,
};
