const fs = require('fs-extra');
const path = require('path');
const firebaseConfig = require('../config/firebase');
const logger = require('./logger');
const { v4: uuidv4 } = require('uuid');

/**
 * Servicio para subir y gestionar archivos en almacenamiento
 */

/**
 * Sube un archivo a Firebase Storage y devuelve su URL pública
 * @param {string} filePath - Ruta del archivo local a subir
 * @param {string} destinationPath - Ruta de destino en Storage (opcional)
 * @param {Object} options - Opciones adicionales
 * @returns {Promise<string>} - URL pública del archivo
 */
const uploadFile = async (filePath, destinationPath = null, options = {}) => {
  try {
    logger.info(`Subiendo archivo a Storage: ${filePath}`);
    
    // Validar existencia del archivo
    if (!await fs.pathExists(filePath)) {
      throw new Error(`El archivo no existe: ${filePath}`);
    }
    
    // Determinar ruta de destino
    const fileName = path.basename(filePath);
    const destination = destinationPath || `uploads/${uuidv4()}_${fileName}`;
    
    // Obtener bucket de Storage
    const bucket = firebaseConfig.getStorage();
    
    // Referencia al archivo en Storage
    const fileRef = bucket.file(destination);
    
    // Leer el archivo
    const fileContent = await fs.readFile(filePath);
    
    // Subir archivo
    await fileRef.save(fileContent, {
      metadata: {
        contentType: options.contentType || detectMimeType(filePath),
      },
      public: true,
      validation: false,
    });
    
    // Hacer público el archivo si no se especificó en las opciones
    if (options.makePublic !== false) {
      await fileRef.makePublic();
    }
    
    // Obtener URL pública
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`;
    logger.info(`Archivo subido exitosamente. URL: ${publicUrl}`);
    
    return publicUrl;
  } catch (error) {
    logger.error(`Error al subir archivo a Storage: ${error.message}`);
    
    // Si Firebase no está configurado, crear una URL temporal local
    if (firebaseConfig.usingMockImplementation) {
      logger.warn('Firebase Storage no configurado, usando URL local temporal');
      return `file://${filePath}`;
    }
    
    throw error;
  }
};

/**
 * Detecta el tipo MIME de un archivo basado en su extensión
 * @param {string} filePath - Ruta del archivo
 * @returns {string} - Tipo MIME
 */
const detectMimeType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  
  const mimeTypes = {
    '.pdf': 'application/pdf',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.txt': 'text/plain',
    '.zip': 'application/zip',
    '.json': 'application/json',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript'
  };
  
  return mimeTypes[ext] || 'application/octet-stream';
};

module.exports = {
  uploadFile
}; 