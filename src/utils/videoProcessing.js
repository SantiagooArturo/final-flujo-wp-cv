/**
 * Video processing utilities
 * Provides functions to process videos and extract audio
 */

const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const https = require('https');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Descargar un archivo desde una URL
 * @param {string} url - URL del archivo a descargar
 * @param {string} outputPath - Ruta donde guardar el archivo
 * @returns {Promise<string>} - Ruta del archivo descargado
 */
const downloadFile = (url, outputPath) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);
    
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Error al descargar el archivo: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close(() => {
          logger.info(`Archivo descargado en: ${outputPath}`);
          resolve(outputPath);
        });
      });
      
      file.on('error', (err) => {
        fs.unlink(outputPath, () => {
          reject(err);
        });
      });
    }).on('error', (err) => {
      fs.unlink(outputPath, () => {
        reject(err);
      });
    });
  });
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
  try {
    const tempDir = path.join(process.cwd(), 'temp');
    
    // Crear directorio temporal si no existe
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Generar nombres de archivo únicos basados en timestamp
    const timestamp = Date.now();
    const videoPath = path.join(tempDir, `video_${timestamp}.mp4`);
    const audioPath = path.join(tempDir, `audio_${timestamp}.mp3`);
    
    // Descargar el video
    await downloadFile(fileUrl, videoPath);
    
    // Extraer el audio
    await extractAudio(videoPath, audioPath);
    
    // Leer el archivo de audio como buffer
    const audioBuffer = await fs.promises.readFile(audioPath);
    
    // Limpiar archivos temporales
    try {
      await fs.promises.unlink(videoPath);
      await fs.promises.unlink(audioPath);
    } catch (err) {
      logger.warn(`Error al eliminar archivos temporales: ${err.message}`);
    }
    
    return audioBuffer;
  } catch (error) {
    logger.error(`Error al procesar video: ${error.message}`);
    throw error;
  }
};

module.exports = {
  processVideoFromUrl
}; 