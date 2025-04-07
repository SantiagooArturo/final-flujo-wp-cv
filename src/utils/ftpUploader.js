const FTP = require('basic-ftp');
const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');
const config = require('../config');
const { v4: uuidv4 } = require('uuid');
const os = require('os');

/**
 * Sube un archivo al servidor FTP y retorna la URL pública
 * @param {string} localFilePath - Ruta local del archivo a subir
 * @param {string} customFileName - Nombre personalizado para el archivo (opcional)
 * @returns {Promise<string>} - URL pública del archivo subido
 */
async function uploadFileToFTP(localFilePath, customFileName = null) {
  const client = new FTP.Client();
  let remotePath = null;

  try {
    logger.info(`Iniciando subida de archivo via FTP: ${localFilePath}`);

    // Verificar que el archivo existe
    if (!await fs.pathExists(localFilePath)) {
      logger.error(`Error en uploadFileToFTP: El archivo no existe: ${localFilePath}`);
      throw new Error(`El archivo no existe: ${localFilePath}`);
    }

    // Verificar que el archivo es un string y no un objeto
    if (typeof localFilePath !== 'string') {
      logger.error(`Error en uploadFileToFTP: La ruta del archivo no es válida, es un: ${typeof localFilePath}`);
      throw new Error(`La ruta del archivo no es válida: ${localFilePath}`);
    }

    // Configuración del cliente FTP
    client.ftp.verbose = true; // Cambiar a true para depuración

    // Verificar variables de entorno
    logger.info(`Configuración FTP - HOST: ${process.env.FTP_HOST}, USER: ${process.env.FTP_USER}, DIR: ${process.env.FTP_UPLOAD_DIR}`);

    // Conectar al servidor FTP
    logger.info(`Conectando a servidor FTP: ${process.env.FTP_HOST}`);
    try {
      await client.access({
        host: process.env.FTP_HOST,
        user: process.env.FTP_USER, 
        password: process.env.FTP_PASSWORD,
        port: parseInt(process.env.FTP_PORT) || 21,
        secure: false
      });
      logger.info(`Conexión FTP establecida correctamente con ${process.env.FTP_HOST}`);
    } catch (accessError) {
      logger.error(`Error al conectar al servidor FTP: ${accessError.message}`);
      throw new Error(`Error de conexión FTP: ${accessError.message}`);
    }

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
    logger.info(`Directorio actual FTP: ${await client.pwd()}`);
    
    // Intentar navegar directamente al directorio de carga
    // Esto funcionará si el directorio ya existe
    try {
      logger.info(`Intentando navegar directamente a: ${uploadDir}`);
      await client.cd(uploadDir);
      logger.info(`Navegación directa exitosa a: ${uploadDir}`);
    } catch (directCdError) {
      logger.warn(`No se pudo navegar directamente a ${uploadDir}, intentando por partes... Error: ${directCdError.message}`);
      
      // Si falla, volvemos a la raíz e intentamos por partes
      await client.cd('/');
      
      // Obtener directorios que necesitamos crear/verificar
      const dirParts = uploadDir.split('/').filter(Boolean);
      
      // Navegar por cada directorio en la ruta, creándolo si no existe
      let currentPath = '/';
      for (const dir of dirParts) {
        currentPath += dir + '/';
        try {
          // Intentar navegar al directorio
          logger.info(`Intentando navegar al directorio: ${dir}`);
          await client.cd(dir);
          logger.info(`Navegación exitosa a: ${dir}`);
        } catch (cdError) {
          logger.info(`Directorio ${dir} no existe, intentando crearlo`);
          try {
            // Si no existe, intentar crearlo
            await client.mkdir(dir);
            logger.info(`Directorio ${dir} creado correctamente`);
            await client.cd(dir);
            logger.info(`Navegación exitosa a directorio recién creado: ${dir}`);
          } catch (mkdirError) {
            logger.error(`Error al crear directorio ${dir}: ${mkdirError.message}`);
            throw new Error(`No se pudo crear el directorio: ${dir}`);
          }
        }
      }
    }
    
    logger.info(`Directorio de destino verificado: ${await client.pwd()}`);
    
    // Subir el archivo
    logger.info(`Subiendo archivo a: ${fileName}`);
    try {
      await client.uploadFrom(localFilePath, fileName);
      logger.info(`Archivo subido correctamente como: ${fileName}`);
    } catch (uploadError) {
      logger.error(`Error al subir archivo: ${uploadError.message}`);
      throw new Error(`Error al subir archivo: ${uploadError.message}`);
    }
    
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

/**
 * Upload a file to FTP server
 * @param {Buffer} fileBuffer - File content as buffer
 * @param {string} originalFilename - Original filename
 * @returns {Promise<string>} Public URL of the uploaded file
 */
const uploadToFTP = async (fileBuffer, originalFilename) => {
  // Generar un nombre de archivo único
  const fileExtension = path.extname(originalFilename) || '.pdf';
  const filename = `cv_${Date.now()}_${uuidv4().substring(0, 8)}${fileExtension}`;
  
  // Crear una ruta temporal para guardar el archivo temporalmente
  const tempDir = os.tmpdir();
  const tempFilePath = path.join(tempDir, filename);
  
  try {
    // Guardar el buffer como archivo temporal
    await fs.writeFile(tempFilePath, fileBuffer);
    logger.info(`Temporary file created at: ${tempFilePath}`);
    
    // Conectar al servidor FTP
    const client = new FTP.Client();
    client.ftp.verbose = false;
    
    await client.access({
      host: config.ftp.host,
      user: config.ftp.user,
      password: config.ftp.password,
      port: config.ftp.port,
      secure: false
    });
    
    logger.info(`Connected to FTP server: ${config.ftp.host}`);
    
    // Navegar al directorio de destino
    await client.ensureDir(config.ftp.uploadDir);
    logger.info(`Navigated to directory: ${config.ftp.uploadDir}`);
    
    // Subir el archivo
    await client.uploadFrom(tempFilePath, filename);
    logger.info(`File uploaded to FTP: ${filename}`);
    
    // Cerrar la conexión
    client.close();
    
    // Generar la URL pública
    const publicUrl = `${config.ftp.publicUrl}${filename}`;
    logger.info(`Public URL generated: ${publicUrl}`);
    
    return publicUrl;
  } catch (error) {
    logger.error(`Error uploading file to FTP: ${error.message}`);
    throw new Error(`FTP upload failed: ${error.message}`);
  } finally {
    // Eliminar el archivo temporal
    try {
      await fs.remove(tempFilePath);
      logger.info(`Temporary file removed: ${tempFilePath}`);
    } catch (cleanupError) {
      logger.warn(`Failed to remove temporary file: ${cleanupError.message}`);
    }
  }
};

module.exports = {
  uploadFileToFTP,
  uploadToFTP
}; 