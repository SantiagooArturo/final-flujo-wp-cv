const bot = require('./bot');
const logger = require('../utils/logger');

const handleStart = async (from) => {
  try {
    await bot.sendTemplate(from, 'saludo');
    logger.info(`Start command handled for user ${from}`);
  } catch (error) {
    logger.error(`Error handling start command: ${error.message}`);
    throw error;
  }
};

const handleDocument = async (from, document) => {
  try {
    // Aquí implementaremos la lógica para procesar CVs
    await bot.sendMessage(from, 'Gracias por enviar tu CV. Lo analizaré y te daré retroalimentación.');
    logger.info(`Document received from user ${from}`);
  } catch (error) {
    logger.error(`Error handling document: ${error.message}`);
    throw error;
  }
};

const handleText = async (from, text) => {
  try {
    // Responder con la plantilla saludo para cualquier mensaje de texto
    await bot.sendTemplate(from, 'saludo');
    logger.info(`Text message received from user ${from}, sending saludo template`);
  } catch (error) {
    logger.error(`Error handling text message: ${error.message}`);
    throw error;
  }
};

const handleImage = async (from, image) => {
  try {
    await bot.sendMessage(
      from,
      'Para un mejor análisis, por favor envía tu CV como documento en lugar de una imagen.'
    );
    logger.info(`Image received from user ${from}`);
  } catch (error) {
    logger.error(`Error handling image: ${error.message}`);
    throw error;
  }
};

const handleUnknown = async (from) => {
  try {
    await bot.sendMessage(
      from,
      'Lo siento, no puedo procesar este tipo de mensaje. Por favor, envía tu CV como documento.'
    );
    logger.info(`Unknown message type received from user ${from}`);
  } catch (error) {
    logger.error(`Error handling unknown message type: ${error.message}`);
    throw error;
  }
};

module.exports = {
  handleStart,
  handleDocument,
  handleText,
  handleImage,
  handleUnknown
}; 