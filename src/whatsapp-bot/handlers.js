const bot = require('./bot');
const logger = require('../utils/logger');
const cvService = require('../core/cvService');
const interviewService = require('../core/interviewService');

const handleStart = async (from) => {
  try {
    // Register user
    await cvService.registerUser({
      id: from,
      phoneNumber: from,
      language: 'es'
    });

    // Send welcome message using template
    await bot.sendTemplate(from, 'saludo');
    logger.info(`Start command handled for user ${from}`);
  } catch (error) {
    logger.error(`Error handling start command: ${error.message}`);
    throw error;
  }
};

const handleDocument = async (from, document) => {
  try {
    // Send initial response
    await bot.sendMessage(from, 'Gracias por enviar tu CV. Lo analizaré y te daré retroalimentación.');
    logger.info('Sent initial response to user');

    // Get document URL
    if (!document) {
      logger.error('Document object is null or undefined');
      throw new Error('Documento no recibido');
    }

    logger.info(`Document object received: ${JSON.stringify(document, null, 2)}`);

    if (!document.id) {
      logger.error('Document ID is missing');
      throw new Error('ID de documento no válido');
    }

    logger.info(`Getting document URL for ID: ${document.id}`);
    
    // Get document URL from WhatsApp
    const documentUrl = await bot.getDocumentUrl(document.id);
    
    if (!documentUrl) {
      logger.error('Document URL is null or empty');
      throw new Error('No se pudo obtener la URL del documento');
    }

    logger.info(`Document URL obtained: ${documentUrl}`);

    // Process the CV
    logger.info(`Processing CV for user ${from} with URL: ${documentUrl}`);
    const analysis = await cvService.processCV(documentUrl, from);
    logger.info(`CV processing completed: ${JSON.stringify(analysis, null, 2)}`);

    // Format and send analysis results
    const analysisMessage = formatAnalysisResults(analysis);
    await bot.sendMessage(from, analysisMessage);

    logger.info(`Document processed successfully for user ${from}`);
  } catch (error) {
    logger.error(`Error handling document: ${error.message}`, { error });
    await bot.sendMessage(from, 'Lo siento, hubo un error al procesar tu CV. Por favor, intenta nuevamente.');
    throw error;
  }
};

const handleText = async (from, text) => {
  try {
    // Check if it's a command
    if (text.startsWith('!')) {
      const command = text.slice(1).toLowerCase();
      switch (command) {
        case 'start':
          await handleStart(from);
          break;
        case 'help':
          await handleHelp(from);
          break;
        case 'interview':
          await handleInterview(from);
          break;
        default:
          await bot.sendMessage(from, 'Por favor, envía tu CV como documento para que pueda analizarlo.');
      }
    } else {
      await bot.sendMessage(from, 'Por favor, envía tu CV como documento para que pueda analizarlo.');
    }
    logger.info(`Text message received from user ${from}`);
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

const handleHelp = async (from) => {
  try {
    const helpMessage = `
*Comandos disponibles:*

!start - Iniciar el bot
!help - Mostrar esta ayuda
!interview - Iniciar simulación de entrevista

*Funcionalidades:*
- Análisis de CV
- Simulación de entrevista
- Retroalimentación personalizada

Para comenzar, envía tu CV como documento.
    `;
    await bot.sendMessage(from, helpMessage);
  } catch (error) {
    logger.error(`Error handling help command: ${error.message}`);
    throw error;
  }
};

const handleInterview = async (from) => {
  try {
    const question = await interviewService.generateInterviewQuestion('default');
    await bot.sendMessage(from, `*Pregunta de entrevista:*\n\n${question.question}`);
  } catch (error) {
    logger.error(`Error handling interview command: ${error.message}`);
    throw error;
  }
};

const formatAnalysisResults = (analysis) => {
  return `
*Análisis de tu CV*

*Puntuación general:* ${analysis.score}/100

*Fortalezas:*
${analysis.strengths.map(s => `- ${s}`).join('\n')}

*Áreas de mejora:*
${analysis.improvements.map(i => `- ${i}`).join('\n')}

*Recomendaciones:*
${analysis.recommendations.map(r => `- ${r}`).join('\n')}
  `;
};

module.exports = {
  handleStart,
  handleDocument,
  handleText,
  handleImage,
  handleUnknown,
  handleHelp,
  handleInterview
}; 