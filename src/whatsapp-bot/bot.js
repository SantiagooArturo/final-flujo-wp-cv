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

  async handleWebhook(body) {
    try {
      const entry = body.entry[0];
      const changes = entry.changes[0];
      const value = changes.value;
      const message = value.messages[0];

      if (!message) {
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