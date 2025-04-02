const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const config = require('./config');
const bot = require('./bot');
const handlers = require('./handlers');
const logger = require('../utils/logger');
const sessionService = require('../core/sessionService');

const app = express();
app.use(bodyParser.json());

// Servir archivos estáticos desde el directorio 'public'
const publicDir = path.join(process.cwd(), 'public');
app.use('/public', express.static(publicDir));
logger.info(`Sirviendo archivos estáticos desde: ${publicDir}`);

// Verificación del webhook
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  logger.info('Webhook verification request received', { mode, token });

  if (mode && token) {
    if (mode === 'subscribe' && token === config.verifyToken) {
      logger.info('Webhook verified successfully');
      res.status(200).send(challenge);
    } else {
      logger.error('Webhook verification failed', { mode, token });
      res.sendStatus(403);
    }
  }
});

// Manejo de mensajes
app.post('/webhook', async (req, res) => {
  try {
    logger.info('========== WEBHOOK REQUEST BODY ============');
    logger.info(JSON.stringify(req.body, null, 2));
    logger.info('===========================================');
    
    const message = await bot.handleWebhook(req.body);
    
    if (!message) {
      logger.info('No message to process');
      return res.sendStatus(200);
    }

    logger.info('Processing message', { message });

    const { from, type, text, document, image, audio, video } = message;
    
    if (document) {
      logger.info('Document details:', JSON.stringify(document, null, 2));
    }

    switch (type) {
      case 'text':
        logger.info('Handling text message', { from, text });
        if (text === '!start') {
          // Verificar si el usuario está en medio de una entrevista antes de reiniciar
          const session = await sessionService.getOrCreateSession(from);
          
          // Si el usuario está en medio de una entrevista, enviar mensaje informativo
          const interviewStates = [
            sessionService.SessionState.POSITION_RECEIVED,
            sessionService.SessionState.INTERVIEW_STARTED,
            sessionService.SessionState.QUESTION_ASKED,
            sessionService.SessionState.ANSWER_RECEIVED
          ];
          
          if (interviewStates.includes(session.state)) {
            await bot.sendMessage(from, 'Ya tienes una entrevista en curso. Para reiniciar, envía !reset primero.');
          } else {
            await handlers.handleStart(from);
          }
        } else {
          await handlers.handleText(from, text);
        }
        break;
      case 'document':
        logger.info('Handling document message', { from, document });
        await handlers.handleDocument(from, document);
        break;
      case 'image':
        logger.info('Handling image message', { from, image });
        await handlers.handleImage(from, image);
        break;
      case 'audio':
        logger.info('Handling audio message', { from, audio });
        await handlers.handleAudio(from, audio);
        break;
      case 'video':
        logger.info('Handling video message', { from, video });
        await handlers.handleVideo(from, video);
        break;
      case 'button':
      case 'interactive':
        logger.info('Handling interactive message', { from, text });
        // Procesar interacciones de botones
        const session = await sessionService.getOrCreateSession(from);
        
        // Obtener el ID del botón seleccionado
        let buttonId = null;
        if (message.interactive && message.interactive.button_reply) {
          buttonId = message.interactive.button_reply.id;
        } else if (message.button && message.button.payload) {
          buttonId = message.button.payload;
        }
        
        logger.info(`Button interaction detected, ID: ${buttonId}`);
        
        // Si estamos en el estado de selección de menú y tenemos un ID de botón
        if (session.state === sessionService.SessionState.MENU_SELECTION && buttonId) {
          // Manejar la selección del menú
          await handlers.handleMenuSelection(from, buttonId);
        } 
        // Si estamos en el estado de opciones post-CV y tenemos un ID de botón
        else if (session.state === sessionService.SessionState.POST_CV_OPTIONS && buttonId) {
          if (buttonId === 'start_interview') {
            // Iniciar simulación de entrevista
            await handlers.handleInterview(from);
          } else if (buttonId === 'review_cv_again') {
            // Reiniciar el proceso para revisar otro CV, manteniendo el puesto
            await sessionService.updateSession(from, { cvProcessed: false });
            await bot.sendMessage(from, 'Por favor, envía el nuevo CV que deseas analizar.');
            await sessionService.updateSessionState(from, 'waiting_for_cv');
          } else if (buttonId === 'premium_required') {
            // Mostrar información sobre la versión premium
            await handlers.handlePremiumInfo(from);
          }
        }
        // Si estamos en el estado de espera de confirmación de entrevista
        else if (session.state === sessionService.SessionState.WAITING_INTERVIEW_CONFIRMATION && buttonId) {
          if (buttonId === 'start_interview_now') {
            // El usuario confirmó que está listo para iniciar la entrevista
            await handlers.startInterviewQuestions(from);
          } else if (buttonId === 'cancel_interview') {
            // El usuario canceló la entrevista
            await bot.sendMessage(from, 'Entrevista cancelada. Si deseas volver a intentarlo, envía !start para comenzar de nuevo.');
            await sessionService.updateSessionState(from, sessionService.SessionState.INITIAL);
          }
        }
        // Si estamos en estado de respuesta recibida (después de mostrar feedback)
        else if (session.state === sessionService.SessionState.ANSWER_RECEIVED && buttonId) {
          if (buttonId === 'continue_interview') {
            // El usuario quiere continuar con la siguiente pregunta
            await handlers.handleNextQuestion(from);
          } else if (buttonId === 'stop_interview') {
            // El usuario quiere detener la entrevista
            await bot.sendMessage(from, 'Entrevista detenida. Si deseas volver a intentarlo, envía !start para comenzar de nuevo.');
            await sessionService.updateSessionState(from, sessionService.SessionState.INITIAL);
          }
        }
        else {
          // Manejar como mensaje de texto regular
          await handlers.handleText(from, text || 'Mensaje interactivo');
        }
        break;
      default:
        logger.info('Handling unknown message type', { from, type });
        await handlers.handleUnknown(from);
    }

    res.sendStatus(200);
  } catch (error) {
    logger.error(`Error processing webhook: ${error.message}`, { error });
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`WhatsApp bot server is running on port ${PORT}`);
}); 