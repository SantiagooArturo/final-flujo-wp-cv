const { Client } = require('basic-ftp');
const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');

/**
 * Sube un archivo al servidor FTP y retorna la URL pública
 * @param {string} localFilePath - Ruta local del archivo a subir
 * @param {string} customFileName - Nombre personalizado para el archivo (opcional)
 * @returns {Promise<string>} - URL pública del archivo subido
 */
async function uploadFileToFTP(localFilePath, customFileName = null) {
  const client = new Client();
  let remotePath = null;

  try {
    logger.info(`Iniciando subida de archivo via FTP: ${localFilePath}`);

    // Verificar que el archivo existe
    if (!await fs.pathExists(localFilePath)) {
      throw new Error(`El archivo no existe: ${localFilePath}`);
    }

    // Configuración del cliente FTP
    client.ftp.verbose = true; // Cambiar a true para depuración

    // Conectar al servidor FTP
    logger.info(`Conectando a servidor FTP: ${process.env.FTP_HOST}`);
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER, 
      password: process.env.FTP_PASSWORD,
      port: parseInt(process.env.FTP_PORT) || 21,
      secure: false
    });

    // Preparar nombre del archivo remoto
    const fileName = customFileName || path.basename(localFilePath);
    
    // Si la ruta de destino termina en /, asegurar que se mantenga así
    const uploadDir = process.env.FTP_UPLOAD_DIR.endsWith('/') 
      ? process.env.FTP_UPLOAD_DIR 
      : `${process.env.FTP_UPLOAD_DIR}/`;
    
    // Construir la ruta remota completa
    remotePath = `${uploadDir}${fileName}`;
    
    // Verificar que estamos en el directorio raíz antes de navegar
    await client.cd('/');
    
    // Obtener directorios que necesitamos crear/verificar
    const dirParts = uploadDir.split('/').filter(Boolean);
    
    // Navegar por cada directorio en la ruta, creándolo si no existe
    let currentPath = '/';
    for (const dir of dirParts) {
      currentPath += dir + '/';
      try {
        // Intentar navegar al directorio
        await client.cd(dir);
      } catch (cdError) {
        logger.info(`Directorio ${dir} no existe, intentando crearlo`);
        try {
          // Si no existe, intentar crearlo
          await client.mkdir(dir);
          await client.cd(dir);
        } catch (mkdirError) {
          logger.error(`Error al crear directorio ${dir}: ${mkdirError.message}`);
          throw new Error(`No se pudo crear el directorio: ${dir}`);
        }
      }
    }
    
    logger.info(`Directorio de destino verificado: ${await client.pwd()}`);
    
    // Subir el archivo
    logger.info(`Subiendo archivo a: ${fileName}`);
    await client.uploadFrom(localFilePath, fileName);
    
    // Generar la URL pública
    const publicUrl = `${process.env.PDF_PUBLIC_URL}${fileName}`;
    logger.info(`Archivo subido correctamente. URL pública: ${publicUrl}`);
    
    return publicUrl;
  } catch (error) {
    logger.error(`Error al subir archivo por FTP: ${error.message}`);
    throw error;
  } finally {
    // Cerrar la conexión FTP independientemente del resultado
    client.close();
    logger.info('Conexión FTP cerrada');
  }
}

module.exports = {
  uploadFileToFTP
}; 