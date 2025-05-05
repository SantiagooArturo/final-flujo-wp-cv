const { getStorage } = require('firebase-admin/storage');
const firebaseConfig = require('../config/firebase');
const logger = require('../utils/logger');
const path = require('path');

/**
 * Sube un archivo multimedia recibido de WhatsApp a Firebase Storage
 * @param {Buffer} mediaBuffer - Buffer del archivo multimedia
 * @param {string} userId - ID del usuario (número de WhatsApp)
 * @param {string} interviewId - ID de la entrevista
 * @param {number} questionNumber - Número de pregunta
 * @param {string} mediaType - 'audio' o 'video'
 * @returns {Promise<Object>} - Información del archivo subido
 */
const uploadWhatsAppMedia = async (mediaBuffer, userId, interviewId, questionNumber, mediaType) => {
  try {
    if (!mediaBuffer) throw new Error('No se proporcionó contenido multimedia');
    
    // Definir extensión según tipo de medio
    const extension = mediaType === 'audio' ? 'mp3' : 'mp4';
    const contentType = mediaType === 'audio' ? 'audio/mpeg' : 'video/mp4';
    const timestamp = Date.now();
    
    // Crear nombre de archivo único
    const fileName = `question_${questionNumber}_${timestamp}.${extension}`;
    
    // Ruta en storage: interviews/+51998765432/interview_123456/question_1_timestamp.mp4
    const filePath = `interviews/${userId}/${interviewId}/${fileName}`;
    
    // Obtener bucket de Storage
    const storage = firebaseConfig.getStorage();
    const fileRef = storage.file(filePath);
    
    // Guardar el archivo
    await fileRef.save(mediaBuffer, {
      metadata: {
        contentType,
        customMetadata: {
          userId,
          interviewId,
          questionNumber: String(questionNumber),
          timestamp: String(timestamp)
        }
      }
    });
    // No hacer público el archivo, solo guardar la ruta de storage
    // const [signedUrl] = await fileRef.getSignedUrl({ ... }) // Si necesitas acceso temporal
    logger.info(`WhatsApp ${mediaType} uploaded successfully: ${filePath}`);
    return {
      storagePath: `gs://${storage.name}/${filePath}`,
      fileName,
      contentType,
      timestamp
    };
  } catch (error) {
    logger.error(`Error uploading WhatsApp media: ${error.message}`);
    throw error;
  }
};

module.exports = {
  uploadWhatsAppMedia
};