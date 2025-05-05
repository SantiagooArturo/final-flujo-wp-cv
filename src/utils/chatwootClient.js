const axios = require('axios');
const logger = require('./logger');
const chatwootConfig = require('../config/chatwootConfig');

// Configuración desde variables de entorno
const CHATWOOT_API_URL = process.env.CHATWOOT_API_URL || '';
const CHATWOOT_API_TOKEN = process.env.CHATWOOT_API_TOKEN || '';
const CHATWOOT_ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID || '1';

class ChatwootClient {
  constructor() {
    // Asegurarse de que la URL base no termine con una barra
    this.apiUrl = CHATWOOT_API_URL.endsWith('/') ? CHATWOOT_API_URL.slice(0, -1) : CHATWOOT_API_URL;
    this.token = CHATWOOT_API_TOKEN;
    this.accountId = CHATWOOT_ACCOUNT_ID;
    this.headers = {
      'Content-Type': 'application/json',
      'api_access_token': this.token
    };

    // Verificar configuración
    if (!this.apiUrl || !this.token) {
      logger.warn('ChatwootClient: API URL o token no configurados');
    } else {
      // logger.info(`ChatwootClient inicializado con URL: ${this.apiUrl}`); // Quitado logger info
    }
  }

  /**
   * Busca o crea un contacto en Chatwoot basado en su número de WhatsApp
   * @param {string} phoneNumber - Número de teléfono (WhatsApp ID)
   * @param {string} name - Nombre del contacto
   * @returns {Promise<Object|null>} - Contacto encontrado o creado, o null si falla la creación
   */
  async findOrCreateContact(phoneNumber, name) {
    try {
      if (!this.apiUrl || !this.token) {
        throw new Error('Chatwoot no está configurado correctamente');
      }
      if (!process.env.CHATWOOT_WHATSAPP_INBOX_ID) {
        throw new Error('ID de bandeja de WhatsApp no configurado');
      }

      const normalizedPhone = phoneNumber.replace(/\+|\s/g, '');

      // Intentar buscar por número de teléfono primero
      try {
        const contactsUrl = `${this.apiUrl}/accounts/${this.accountId}/contacts/search`;
        const searchResponse = await axios.get(contactsUrl, {
          headers: this.headers,
          params: { q: normalizedPhone }
        });

        if (searchResponse.data?.payload?.length > 0) {
          // logger.info(`Contacto encontrado: ${searchResponse.data.payload[0].id}`); // Quitado logger info
          return searchResponse.data.payload[0];
        }
      } catch (searchError) {
        // No es crítico si la búsqueda falla (ej. 404), proceder a crear
        logger.warn(`Error o no se encontró contacto al buscar: ${searchError.message}`);
      }

      // Si no se encuentra, crear nuevo contacto
      // logger.info(`Creando nuevo contacto para ${name} (${normalizedPhone})`); // Quitado logger info
      const createUrl = `${this.apiUrl}/accounts/${this.accountId}/contacts`;

      const inboxId = parseInt(chatwootConfig.whatsappInboxId, 10);
      if (isNaN(inboxId)) {
        throw new Error('CHATWOOT_WHATSAPP_INBOX_ID no es un número válido en la configuración');
      }

      const createPayload = {
        inbox_id: inboxId,
        name: name || `WhatsApp ${normalizedPhone}`,
        phone_number: `+${normalizedPhone}`,
        identifier: normalizedPhone,
        custom_attributes: {
          whatsappId: normalizedPhone
        }
      };

      const createResponse = await axios.post(createUrl, createPayload, { headers: this.headers });

      // Acceder al objeto 'contact' dentro de 'payload'
      const contactPayload = createResponse.data?.payload?.contact;

      if (!contactPayload || !contactPayload.id) {
         logger.error(`Error: No se encontró 'payload.contact.id' en la respuesta de creación de contacto. Respuesta: ${JSON.stringify(createResponse.data)}`);
         return null; // Indicar fallo
      }

      // logger.info(`Contacto creado con ID: ${contactPayload.id}`); // Quitado logger info
      return contactPayload; // Devolver el objeto 'contact' completo

    } catch (error) {
      if (error.response) {
        logger.error(`Error en findOrCreateContact: ${error.message} - Status: ${error.response.status} - Data: ${JSON.stringify(error.response.data)}`);
      } else {
        logger.error(`Error en findOrCreateContact: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Busca o crea una conversación para un contacto en una bandeja de entrada específica
   * @param {number} contactId - ID del contacto en Chatwoot
   * @param {number | string} inboxIdInput - ID de la bandeja de entrada (puede ser string o number)
   * @returns {Promise<Object>} - Conversación encontrada o creada
   */
  async findOrCreateConversation(contactId, inboxIdInput) {
    try {
      if (!this.apiUrl || !this.token) {
        throw new Error('Chatwoot no está configurado correctamente');
      }

      if (!contactId) {
        throw new Error('Se requiere ID de contacto');
      }
      const inboxId = parseInt(inboxIdInput, 10);
      if (isNaN(inboxId)) {
        throw new Error('ID de bandeja de entrada no es un número válido');
      }

      // Intentar buscar conversación existente
      try {
        const convUrl = `${this.apiUrl}/accounts/${this.accountId}/contacts/${contactId}/conversations`;
        const searchResponse = await axios.get(convUrl, { headers: this.headers });

        if (searchResponse.data?.payload?.length > 0) {
          const conversation = searchResponse.data.payload.find(conv => conv.inbox_id === inboxId);
          if (conversation) {
            // logger.info(`Conversación encontrada: ${conversation.id}`); // Quitado logger info
            return conversation;
          }
        }
      } catch (searchError) {
        logger.warn(`Error o no se encontró conversación al buscar: ${searchError.message}`);
      }

      // Si no se encuentra, crear nueva conversación
      // logger.info(`Creando nueva conversación para contacto ${contactId} en bandeja ${inboxId}`); // Quitado logger info
      const createUrl = `${this.apiUrl}/accounts/${this.accountId}/conversations`;

      const createPayload = {
        inbox_id: inboxId,
        contact_id: contactId,
        status: 'open'
      };

      const createResponse = await axios.post(createUrl, createPayload, { headers: this.headers });

      // Asumiendo que la creación devuelve el objeto conversación directamente o en payload
      const createdConversation = createResponse.data?.payload || createResponse.data;

      if (!createdConversation || !createdConversation.id) {
        logger.error(`Error: No se encontró ID en la respuesta de creación de conversación. Respuesta: ${JSON.stringify(createResponse.data)}`);
        throw new Error('No se pudo obtener el ID de la conversación creada desde Chatwoot');
      }

      // logger.info(`Conversación creada: ${createdConversation.id}`); // Quitado logger info
      return createdConversation; // Devolver el objeto conversación

    } catch (error) {
      if (error.response) {
        logger.error(`Error en findOrCreateConversation: ${error.message} - Status: ${error.response.status} - Data: ${JSON.stringify(error.response.data)}`);
      } else {
        logger.error(`Error en findOrCreateConversation: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Crea un mensaje entrante en una conversación (del usuario al bot)
   * @param {number} conversationId - ID de la conversación
   * @param {string} content - Contenido del mensaje
   * @returns {Promise<Object>} - Mensaje creado
   */
  async createIncomingMessage(conversationId, content) {
    try {
      if (!this.apiUrl || !this.token) {
        throw new Error('Chatwoot no está configurado correctamente');
      }
      if (!conversationId) {
        throw new Error('Se requiere ID de conversación');
      }
      if (!content) {
        // Podríamos decidir no lanzar error si el contenido está vacío,
        // pero sí registrar un warning y no hacer la llamada.
        logger.warn('Se intentó crear mensaje entrante sin contenido.');
        return null; // O devolver algo que indique que no se hizo nada
      }

      const url = `${this.apiUrl}/accounts/${this.accountId}/conversations/${conversationId}/messages`;
      const response = await axios.post(url, {
        content,
        message_type: 'incoming',
        private: false
      }, { headers: this.headers });

      // Asumiendo que la respuesta contiene el mensaje creado directamente o en payload
      const createdMessage = response.data?.payload || response.data;

      if (!createdMessage || !createdMessage.id) {
         logger.error(`Error: No se encontró ID en la respuesta de creación de mensaje entrante. Respuesta: ${JSON.stringify(response.data)}`);
         throw new Error('No se pudo obtener el ID del mensaje creado desde Chatwoot');
      }

      // logger.info(`Mensaje entrante creado: ${createdMessage.id}`); // Quitado logger info
      return createdMessage;

    } catch (error) {
      if (error.response) {
        logger.error(`Error en createIncomingMessage: ${error.message} - Status: ${error.response.status} - Data: ${JSON.stringify(error.response.data)}`);
      } else {
        logger.error(`Error en createIncomingMessage: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Crea un mensaje saliente en una conversación (del bot al usuario)
   * @param {number} conversationId - ID de la conversación
   * @param {string} content - Contenido del mensaje
   * @returns {Promise<Object>} - Mensaje creado
   */
  async createOutgoingMessage(conversationId, content) {
    try {
      if (!this.apiUrl || !this.token) {
        throw new Error('Chatwoot no está configurado correctamente');
      }
      if (!conversationId) {
        throw new Error('Se requiere ID de conversación');
      }
      if (!content) {
        logger.warn('Se intentó crear mensaje saliente sin contenido.');
        return null;
      }

      const url = `${this.apiUrl}/accounts/${this.accountId}/conversations/${conversationId}/messages`;
      const response = await axios.post(url, {
        content,
        message_type: 'outgoing',
        private: false
      }, { headers: this.headers });

      const createdMessage = response.data?.payload || response.data;

       if (!createdMessage || !createdMessage.id) {
         logger.error(`Error: No se encontró ID en la respuesta de creación de mensaje saliente. Respuesta: ${JSON.stringify(response.data)}`);
         throw new Error('No se pudo obtener el ID del mensaje saliente creado desde Chatwoot');
      }

      // logger.info(`Mensaje saliente creado: ${createdMessage.id}`); // Quitado logger info
      return createdMessage;

    } catch (error) {
       if (error.response) {
        logger.error(`Error en createOutgoingMessage: ${error.message} - Status: ${error.response.status} - Data: ${JSON.stringify(error.response.data)}`);
      } else {
        logger.error(`Error en createOutgoingMessage: ${error.message}`);
      }
      throw error;
    }
  }
}

module.exports = new ChatwootClient();