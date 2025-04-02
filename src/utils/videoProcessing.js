/**
 * Video processing utilities
 * Provides functions to process videos and extract audio
 */

const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const axios = require('axios');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Descargar un archivo desde una URL
 * @param {string} url - URL del archivo a descargar
 * @param {string} outputPath - Ruta donde guardar el archivo
 * @returns {Promise<string>} - Ruta del archivo descargado
 */
const downloadFile = async (url, outputPath) => {
  try {
    logger.info(`Intentando descargar archivo desde: ${url}`);
    
    // Asegurarse de que la URL sea válida
    if (!url || typeof url !== 'string') {
      throw new Error('URL inválida');
    }
    
    // Asegurarse de que la URL esté codificada correctamente
    const encodedUrl = encodeURI(url);
    logger.info(`URL codificada: ${encodedUrl}`);
    
    // Realizar la solicitud con axios que maneja redirecciones automáticamente
    const response = await axios({
      method: 'GET',
      url: encodedUrl,
      responseType: 'arraybuffer',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`
      },
      // Opciones adicionales para manejar URLs problemáticas
      maxRedirects: 10, // Permitir hasta 10 redirecciones
      timeout: 30000,
      validateStatus: function (status) {
        return status >= 200 && status < 400; // Aceptar códigos 2xx y 3xx
      }
    });
    
    // Guardar el archivo descargado
    await fs.promises.writeFile(outputPath, Buffer.from(response.data));
    
    logger.info(`Archivo descargado exitosamente en: ${outputPath}`);
    return outputPath;
  } catch (error) {
    if (error.response) {
      logger.error(`Error al descargar el archivo - Status: ${error.response.status}`);
    } else if (error.request) {
      logger.error(`Error al descargar el archivo - No se recibió respuesta: ${error.message}`);
    } else {
      logger.error(`Error al descargar el archivo: ${error.message}`);
    }
    throw error;
  }
};

/**
 * Extraer el audio de un video
 * @param {string} videoPath - Ruta del video
 * @param {string} outputPath - Ruta donde guardar el audio
 * @returns {Promise<string>} - Ruta del archivo de audio
 */
const extractAudio = (videoPath, outputPath) => {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .output(outputPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .on('end', () => {
        logger.info(`Audio extraído en: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        logger.error(`Error al extraer audio: ${err.message}`);
        reject(err);
      })
      .run();
  });
};

/**
 * Procesa un video desde una URL y extrae el audio
 * @param {string} fileUrl - URL del video
 * @returns {Promise<Buffer>} - Buffer del audio extraído
 */
const processVideoFromUrl = async (fileUrl) => {
  let videoPath = null;
  let audioPath = null;
  
  try {
    logger.info(`Iniciando procesamiento de video desde URL: ${fileUrl}`);
    
    const tempDir = path.join(process.cwd(), 'temp');
    
    // Crear directorio temporal si no existe
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      logger.info(`Directorio temporal creado: ${tempDir}`);
    }
    
    // Generar nombres de archivo únicos basados en timestamp
    const timestamp = Date.now();
    videoPath = path.join(tempDir, `video_${timestamp}.mp4`);
    audioPath = path.join(tempDir, `audio_${timestamp}.mp3`);
    
    logger.info(`Descargando video a ${videoPath}`);
    
    // Descargar el video con el nuevo método que maneja redirecciones
    await downloadFile(fileUrl, videoPath);
    
    // Verificar que el archivo de video existe
    if (!fs.existsSync(videoPath)) {
      throw new Error(`El archivo de video no se descargó correctamente: ${videoPath}`);
    }
    
    logger.info(`Video descargado, extrayendo audio a ${audioPath}`);
    
    // Extraer el audio
    await extractAudio(videoPath, audioPath);
    
    // Verificar que el archivo de audio existe
    if (!fs.existsSync(audioPath)) {
      throw new Error(`El archivo de audio no se extrajo correctamente: ${audioPath}`);
    }
    
    logger.info(`Audio extraído, leyendo como buffer`);
    
    // Leer el archivo de audio como buffer
    const audioBuffer = await fs.promises.readFile(audioPath);
    
    logger.info(`Audio convertido a buffer, tamaño: ${audioBuffer.length} bytes`);
    
    return audioBuffer;
  } catch (error) {
    logger.error(`Error al procesar video: ${error.message}`);
    throw error;
  } finally {
    // Limpiar archivos temporales
    try {
      if (videoPath && fs.existsSync(videoPath)) {
        await fs.promises.unlink(videoPath);
        logger.info(`Archivo temporal eliminado: ${videoPath}`);
      }
      
      if (audioPath && fs.existsSync(audioPath)) {
        await fs.promises.unlink(audioPath);
        logger.info(`Archivo temporal eliminado: ${audioPath}`);
      }
    } catch (err) {
      logger.warn(`Error al eliminar archivos temporales: ${err.message}`);
    }
  }
};

module.exports = {
  processVideoFromUrl
}; 