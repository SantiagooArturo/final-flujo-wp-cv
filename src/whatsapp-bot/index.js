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
    // Extraer los datos del evento
    const data = req.body;
    logger.info(`Webhook payload received (truncated): ${JSON.stringify(data).substring(0, 500)}...`);

    if (!data || !data.object) {
      logger.warn('No data or object property in webhook payload');
      return res.sendStatus(400);
    }

    // Verificar si es una notificación de mensaje
    if (data.object === 'whatsapp_business_account') {
      // Procesar cada entrada
      for (const entry of data.entry || []) {
        // Procesar cada cambio
        for (const change of entry.changes || []) {
          if (!change.value || !change.value.messages) {
            continue;
          }

          // Procesar cada mensaje
          for (const message of change.value.messages) {
            logger.info(`Processing message of type: ${message.type}`);

            const metadata = change.value.metadata || {};
            const from = metadata.phone_number_id;
            const to = message.from;

            if (!from || !to) {
              logger.warn('Missing from or to in message');
              continue;
            }

            logger.info(`Message from ${from} to ${to}`);

            // Manejar diferentes tipos de mensajes
            try {
              // Registrar o actualizar usuario al recibir cualquier mensaje
              const userService = require('../core/userService');
              await userService.registerOrUpdateUser(to);
              
              if (message.type === 'text') {
                await handlers.handleText(to, message.text.body);
              } else if (message.type === 'interactive') {
                if (message.interactive.type === 'button_reply') {
                  await handlers.handleButtonReply(to, message.interactive.button_reply.id);
                } else if (message.interactive.type === 'list_reply') {
                  // Para list_reply, actualizamos la sesión con la información de la selección
                  const sessionService = require('../core/sessionService');
                  const session = await sessionService.getOrCreateSession(to);
                  await sessionService.updateSession(to, { 
                    interactive: message.interactive 
                  });
                  
                  // Verificar si estamos en el estado de selección de paquetes
                  if (session.state === 'selecting_premium_package') {
                    // Enviar directamente a handlePackageSelection con el ID de la selección
                    await handlers.handlePackageSelection(to, message.interactive.list_reply.id);
                  } else {
                    // Para otros casos de list_reply, tratar como botón
                    await handlers.handleButtonReply(to, message.interactive.list_reply.id);
                  }
                }
              } else if (message.type === 'document') {
                await handlers.handleDocument(to, message.document);
              } else if (message.type === 'image') {
                await handlers.handleImage(to, message.image);
              } else if (message.type === 'audio') {
                await handlers.handleAudio(to, message.audio);
              } else if (message.type === 'video') {
                await handlers.handleVideo(to, message.video);
              } else {
                logger.warn(`Unsupported message type: ${message.type}`);
              }
            } catch (error) {
              logger.error(`Error handling message: ${error.message}`);
            }
          }

          // Procesar respuestas de botones
          if (change.value.statuses) {
            for (const status of change.value.statuses) {
              logger.info(`Message status: ${status.status}`);
            }
          }
        }
      }

      res.sendStatus(200);
    } else {
      logger.warn(`Unexpected object: ${data.object}`);
      res.sendStatus(400);
    }
  } catch (error) {
    logger.error(`Error processing webhook: ${error.message}`);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`WhatsApp bot server is running on port ${PORT}`);
});

// Exponer funciones para su uso en otros módulos
module.exports = {
  sendMessage: bot.sendMessage,
  sendTemplate: bot.sendTemplate,
  sendButtonMessage: bot.sendButtonMessage,
  getDocumentUrl: bot.getDocumentUrl
}; 