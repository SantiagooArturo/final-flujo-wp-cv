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
      if (!Array.isArray(value.messages) || value.messages.length === 0) {
        logger.warn('Invalid webhook body structure: missing messages array');
        return null;
      }

      const message = value.messages[0];
      if (!message) {
        logger.warn('Invalid webhook body structure: missing message object');
        return null;
      }

      return {
        from: message.from,
        type: message.type,
        timestamp: message.timestamp,
        text: message.text?.body,
        document: message.document,
        image: message.image
      };
    } catch (error) {
      logger.error(`Error handling webhook: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new WhatsAppBot(); 