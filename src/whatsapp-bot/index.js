const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const config = require("./config");
const bot = require("./bot");
const handlers = require("./handlers");
const logger = require("../utils/logger");
const sessionService = require("../core/sessionService");
const chatwootClient = require("../utils/chatwootClient");
const chatwootConfig = require("../config/chatwootConfig");
const { uploadFileR2 } = require("../services/s3.service");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() }); // Guarda el archivo en memoria
const cors = require("cors");

const app = express();
app.use(cors()); // Habilitar CORS
app.use(bodyParser.json());

app.post('/upload', upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ success: false, error: 'No file uploaded.' });
  }
  uploadFileR2(file, 'cvs')
    .then((url) => {
      res.status(200).json({ success: true, url });
    })
    .catch((error) => {
      logger.error('Error uploading file:', error);
      res.status(500).json({ success: false, error: 'Error uploading file.' });
    });
});

// Servir archivos estáticos desde el directorio 'public'
const publicDir = path.join(process.cwd(), "public");
app.use("/public", express.static(publicDir));
logger.info(`Sirviendo archivos estáticos desde: ${publicDir}`);

// Verificación del webhook
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  logger.info("Webhook verification request received", { mode, token });

  if (mode && token) {
    if (mode === "subscribe" && token === config.verifyToken) {
      logger.info("Webhook verified successfully");
      res.status(200).send(challenge);
    } else {
      logger.error("Webhook verification failed", { mode, token });
      res.sendStatus(403);
    }
  }
});

// Manejo de mensajes
app.post("/webhook", async (req, res) => {
  try {
    // Extraer los datos del evento
    const data = req.body;
    // logger.info(`Webhook payload received (truncated): ${JSON.stringify(data).substring(0, 500)}...`);

    if (!data || !data.object) {
      logger.warn("No data or object property in webhook payload");
      return res.sendStatus(400);
    }

    // Verificar si es una notificación de mensaje
    if (data.object === "whatsapp_business_account") {
      // Procesar cada entrada
      for (const entry of data.entry || []) {
        // Procesar cada cambio
        for (const change of entry.changes || []) {
          if (!change.value || !change.value.messages) {
            continue;
          }

          // Procesar cada mensaje
          for (const message of change.value.messages) {

            const metadata = change.value.metadata || {};
            const from = metadata.phone_number_id;
            const to = message.from;

            if (!from || !to) {
              logger.warn("Missing from or to in message");
              continue;
            }

            // --- INICIO: Reportar mensaje ENTRANTE a Chatwoot ---
            try {
              const contactName =
                change.value?.contacts?.[0]?.profile?.name || `WhatsApp ${to}`;
              let messageContent = "";

              // Extraer el contenido del mensaje y obtener URL si es multimedia
              if (message.type === "text") {
                messageContent =
                  message.text?.body || "[Mensaje de texto vacío]";
              } else if (message.type === "interactive") {
                if (message.interactive.type === "button_reply") {
                  // Mejorar el formato para Chatwoot - mostrar ID y texto del botón
                  messageContent = `${message.interactive.button_reply.title}`;
                } else if (message.interactive.type === "list_reply") {
                  // Mejorar el formato para Chatwoot - mostrar ID y texto de la lista
                  messageContent = `${message.interactive.list_reply.title}`;
                } else {
                  messageContent = `[Mensaje interactivo de tipo: ${message.interactive.type}]`;
                }
              } else if (message.type === "document" && message.document?.id) {
                try {
                  attachmentUrl = await bot.getDocumentUrl(message.document.id);
                  const filename =
                    message.document?.filename || "Documento recibido";
                  // Siempre incluir la URL aunque no haya filename
                  messageContent = `[Documento: ${filename}]`;
                  if (attachmentUrl) {
                    messageContent += `\n${attachmentUrl}`;
                  }
                } catch (docError) {
                  logger.error(
                    `Error getting document URL for Chatwoot: ${docError.message}`
                  );
                  messageContent = `[Documento: ${
                    message.document?.filename || "Error al obtener URL"
                  }]`;
                }
              } else if (message.type === "image" && message.image?.id) {
                try {
                  // Obtener URL de la imagen
                  attachmentUrl = await bot.getMediaUrl(message.image.id);
                  const caption = message.image?.caption || "Imagen";
                  messageContent = `[${caption}]`;
                  if (attachmentUrl) {
                    messageContent += `\n${attachmentUrl}`;
                  }
                } catch (imgError) {
                  logger.error(
                    `Error getting image URL for Chatwoot: ${imgError.message}`
                  );
                  messageContent = `[Imagen: ${
                    message.image?.caption || "Error al obtener URL"
                  }]`;
                }
              } else if (message.type === "audio" && message.audio?.id) {
                try {
                  attachmentUrl = await bot.getMediaUrl(message.audio.id);
                  messageContent = `[Audio]`;
                  if (attachmentUrl) messageContent += `\n${attachmentUrl}`;
                } catch (audioError) {
                  logger.error(
                    `Error getting audio URL for Chatwoot: ${audioError.message}`
                  );
                  messageContent = `[Audio: Error al obtener URL]`;
                }
              } else if (message.type === "video" && message.video?.id) {
                try {
                  attachmentUrl = await bot.getMediaUrl(message.video.id);
                  const caption = message.video?.caption || "Video";
                  messageContent = `[${caption}]`;
                  if (attachmentUrl) messageContent += `\n${attachmentUrl}`;
                } catch (videoError) {
                  logger.error(
                    `Error getting video URL for Chatwoot: ${videoError.message}`
                  );
                  messageContent = `[Video: ${
                    message.video?.caption || "Error al obtener URL"
                  }]`;
                }
              } else {
                messageContent = `[Mensaje de tipo: ${message.type}]`;
              }

              // Verificar si Chatwoot está configurado correctamente
              if (
                chatwootConfig.apiUrl &&
                chatwootConfig.apiToken &&
                chatwootConfig.whatsappInboxId
              ) {
                // Crear o encontrar el contacto en Chatwoot
                const contact = await chatwootClient.findOrCreateContact(
                  to,
                  contactName
                );
                const inboxIdToUse = chatwootConfig.whatsappInboxId;

                if (contact && contact.id) {
                  // Crear o encontrar la conversación
                  const conversation = await chatwootClient.findOrCreateConversation(
                    contact.id,
                    inboxIdToUse
                  );
                  
                  if (conversation && conversation.id) {
                    
                    // Guardar el ID de conversación en la sesión para usarlo al enviar respuestas
                    try {
                      await sessionService.updateSession(to, {
                        chatwootConversationId: conversation.id,
                      });
                    } catch (sessionError) {
                      logger.error(`Error saving conversation ID to session: ${sessionError.message}`);
                    }
                  
                    
                    // Crear mensaje entrante en Chatwoot si hay contenido
                    if (messageContent) {
                      await chatwootClient.createIncomingMessage(conversation.id, messageContent);
                    } else {
                      logger.warn('No message content extracted, skipping createIncomingMessage.');
                    }
                  } else {
                    logger.warn(
                      `Could not find or create Chatwoot conversation for contact ${
                        contact.id
                      }. Conversation object: ${JSON.stringify(conversation)}`
                    );
                  }
                  // ...
                }
              } else {
                logger.warn(
                  "Chatwoot integration not configured, skipping message reporting"
                );
              }
            } catch (chatwootError) {
              logger.error(
                `Failed to report incoming message to Chatwoot: ${chatwootError.message}`
              );
              // Continuar con el procesamiento normal del mensaje
            }
            // --- FIN: Reportar mensaje ENTRANTE a Chatwoot ---

            // Manejar diferentes tipos de mensajes
            try {
              // Registrar o actualizar usuario al recibir cualquier mensaje
              const userService = require("../core/userService");
              await userService.registerOrUpdateUser(to);

              if (message.type === "text") {
                await handlers.handleText(to, message.text.body);
              } else if (message.type === "interactive") {
                if (message.interactive.type === "button_reply") {
                  
                  await handlers.handleButtonReply(
                    to,
                    message.interactive.button_reply.id
                  );
                } else if (message.interactive.type === "list_reply") {

                  // Para list_reply, actualizamos la sesión con la información de la selección
                  const sessionService = require("../core/sessionService");
                  const session = await sessionService.getOrCreateSession(to);
                  await sessionService.updateSession(to, {
                    interactive: message.interactive,
                  });

                  // Verificar si estamos en el estado de selección de paquetes
                  if (session.state === "selecting_premium_package") {
                    // Enviar directamente a handlePackageSelection con el ID de la selección
                    await handlers.handlePackageSelection(
                      to,
                      message.interactive.list_reply.id
                    );
                  } else {
                    // Para otros casos de list_reply, tratar como botón
                    await handlers.handleButtonReply(
                      to,
                      message.interactive.list_reply.id
                    );
                  }
                }
              } else if (message.type === "document") {
                await handlers.handleDocument(to, message.document);
              } else if (message.type === "image") {
                await handlers.handleImage(to, message.image);
              } else if (message.type === "audio") {
                await handlers.handleAudio(to, message.audio);
              } else if (message.type === "video") {
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
  getDocumentUrl: bot.getDocumentUrl,
};
