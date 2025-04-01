const axios = require('axios');
const config = require('./config');
const logger = require('../utils/logger');

class WhatsAppBot {
  constructor() {
    this.apiUrl = `${config.apiUrl}/${config.apiVersion}/${config.phoneNumberId}`;
    this.headers = {
      'Authorization': `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    };
  }

  async sendMessage(to, message) {
    try {
      const response = await axios.post(
        `${this.apiUrl}/messages`,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: message }
        },
        { headers: this.headers }
      );
      logger.info(`Message sent successfully to ${to}`);
      return response.data;
    } catch (error) {
      logger.error(`Error sending message: ${error.message}`);
      throw error;
    }
  }

  async sendTemplate(to, templateName, languageCode = 'es') {
    try {
      const response = await axios.post(
        `${this.apiUrl}/messages`,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: templateName,
            language: {
              code: languageCode
            }
          }
        },
        { headers: this.headers }
      );
      logger.info(`Template ${templateName} sent successfully to ${to}`);
      return response.data;
    } catch (error) {
      logger.error(`Error sending template: ${error.message}`);
      throw error;
    }
  }

  async sendDocument(to, documentUrl, caption = '') {
    try {
      const response = await axios.post(
        `${this.apiUrl}/messages`,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'document',
          document: {
            link: documentUrl,
            caption
          }
        },
        { headers: this.headers }
      );
      logger.info(`Document sent successfully to ${to}`);
      return response.data;
    } catch (error) {
      logger.error(`Error sending document: ${error.message}`);
      throw error;
    }
  }

  async getDocumentUrl(documentId) {
    try {
      logger.info(`Getting document URL for ID: ${documentId}`);
      
      // Construir URL para obtener medio
      const mediaUrl = `https://graph.facebook.com/${config.apiVersion}/${documentId}`;
      logger.info(`Media URL: ${mediaUrl}`);
      
      // Mostrar headers para debugging
      const headers = {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json'
      };
      logger.info(`Headers: ${JSON.stringify(headers, null, 2)}`);
      
      // Primer intento: usar la URL del media directamente
      try {
        logger.info('Trying to get media URL with document ID directly...');
        const response = await axios.get(
          mediaUrl,
          { headers }
        );
        
        logger.info(`Media API Response: ${JSON.stringify(response.data, null, 2)}`);
        
        if (response.data && response.data.url) {
          logger.info(`Document URL found: ${response.data.url}`);
          return response.data.url;
        } else {
          logger.warn('No URL found in media API response');
        }
      } catch (mediaError) {
        logger.error(`Error getting media directly: ${mediaError.message}`);
        logger.error(`Media error status: ${mediaError.response?.status}`);
        logger.error(`Media error data: ${JSON.stringify(mediaError.response?.data, null, 2)}`);
      }
      
      // Segundo intento: usar la URL del mensaje
      try {
        logger.info('Trying to get document URL from message...');
        const messageUrl = `${this.apiUrl}/messages/${documentId}`;
        logger.info(`Message URL: ${messageUrl}`);
        
        const response = await axios.get(
          messageUrl,
          { headers }
        );
        
        logger.info(`Message API Response: ${JSON.stringify(response.data, null, 2)}`);
        
        if (response.data && response.data.document && response.data.document.url) {
          logger.info(`Document URL found in message: ${response.data.document.url}`);
          return response.data.document.url;
        } else {
          logger.warn('No document URL found in message API response');
          throw new Error('No se encontró la URL del documento en la respuesta');
        }
      } catch (messageError) {
        logger.error(`Error getting document from message: ${messageError.message}`);
        logger.error(`Message error status: ${messageError.response?.status}`);
        logger.error(`Message error data: ${JSON.stringify(messageError.response?.data, null, 2)}`);
        throw messageError;
      }
    } catch (error) {
      logger.error(`Error getting document URL: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener URL de medios (audio, video, imagen)
   * @param {string} mediaId - ID del medio
   * @returns {Promise<string>} URL del medio
   */
  async getMediaUrl(mediaId) {
    try {
      logger.info(`Getting media URL for ID: ${mediaId}`);
      
      // URL para obtener medio
      const mediaUrl = `https://graph.facebook.com/${config.apiVersion}/${mediaId}`;
      
      const headers = {
        'Authorization': `Bearer ${config.token}`,
        'Content-Type': 'application/json'
      };
      
      const response = await axios.get(
        mediaUrl,
        { headers }
      );
      
      if (response.data && response.data.url) {
        logger.info(`Media URL found: ${response.data.url}`);
        return response.data.url;
      } else {
        logger.warn('No URL found in media API response');
        throw new Error('No se encontró la URL del medio en la respuesta');
      }
    } catch (error) {
      logger.error(`Error getting media URL: ${error.message}`);
      throw error;
    }
  }

  async handleWebhook(body) {
    try {
      // Validar que el body tenga la estructura esperada
      if (!body || !Array.isArray(body.entry) || body.entry.length === 0) {
        logger.warn('Invalid webhook body structure: missing entry array');
        return null;
      }

      const entry = body.entry[0];
      if (!entry || !Array.isArray(entry.changes) || entry.changes.length === 0) {
        logger.warn('Invalid webhook body structure: missing changes array');
        return null;
      }

      const changes = entry.changes[0];
      if (!changes || !changes.value) {
        logger.warn('Invalid webhook body structure: missing value object');
        return null;
      }

      const value = changes.value;
      
      // Si incluye statuses, es una notificación de estado, no un mensaje
      if (value.statuses) {
        logger.info('Status notification received, not a message');
        return null;
      }
      
      if (!Array.isArray(value.messages) || value.messages.length === 0) {
        logger.warn('Invalid webhook body structure: missing messages array');
        return null;
      }

      const message = value.messages[0];
      if (!message) {
        logger.warn('Invalid webhook body structure: missing message object');
        return null;
      }

      const messageType = message.type;
      logger.info(`Message type received: ${messageType}`);
      
      // Construir objeto de retorno según el tipo de mensaje
      const baseMessage = {
        from: message.from,
        type: messageType,
        timestamp: message.timestamp
      };
      
      // Agregar datos específicos según el tipo de mensaje
      switch (messageType) {
        case 'text':
          return {
            ...baseMessage,
            text: message.text?.body
          };
        case 'document':
          return {
            ...baseMessage,
            document: message.document
          };
        case 'image':
          return {
            ...baseMessage,
            image: message.image
          };
        case 'audio':
          return {
            ...baseMessage,
            audio: message.audio
          };
        case 'video':
          return {
            ...baseMessage,
            video: message.video
          };
        case 'button':
          return {
            ...baseMessage,
            button: message.button,
            text: message.button?.text
          };
        case 'interactive':
          return {
            ...baseMessage,
            interactive: message.interactive,
            text: 
              message.interactive?.button_reply?.title || 
              message.interactive?.list_reply?.title
          };
        default:
          logger.warn(`Unhandled message type: ${messageType}`);
          return baseMessage;
      }
    } catch (error) {
      logger.error(`Error handling webhook: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new WhatsAppBot(); 