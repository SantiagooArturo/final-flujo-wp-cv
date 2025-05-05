const { PutObjectCommand } = require('@aws-sdk/client-s3');
const logger = require('../utils/logger');
const { r2Client, r2Config } = require('../config/r2Config');

const uploadFileR2 = async (file, folder = '') => {
  if (!file || !file.buffer) {
    throw new Error('No se encontró el buffer del archivo.');
  }

  try {
    const numeroRandom = new Date().getTime() + Math.floor(Math.random() * 1000);
    const originalFilename = file.originalname || 'archivo-sin-nombre';
    const parts = originalFilename.split('.');
    const extension = parts.length > 1 ? parts.pop() : 'bin';
    const uniqueKey = `${folder ? folder + '/' : ''}${numeroRandom}.${extension}`;

    const bucketName = r2Config.bucketName;
    if (!bucketName) {
      throw new Error('El nombre del bucket R2 no está configurado.');
    }

    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: uniqueKey,
      Body: file.buffer,
      ContentType: file.mimetype || undefined,
    });

    logger.info(`Subiendo archivo a R2 bucket: ${bucketName}, Key: ${uniqueKey}`);
    await r2Client.send(putCommand);

    const publicUrlBase = r2Config.publicUrlBase;
    if (!publicUrlBase) {
      logger.warn(`La URL pública base de R2 (R2_PUBLIC_URL) no está configurada en .env. La URL devuelta podría no ser accesible.`);
      throw new Error('La URL pública base de R2 no está configurada.');
    }

    const publicUrl = `${publicUrlBase.replace(/\/$/, '')}/${uniqueKey}`;
    logger.info(`Archivo subido exitosamente a R2: ${publicUrl}`);

    return publicUrl;

  } catch (error) {
    logger.error('Error al subir archivo a R2:', error);
    throw new Error(`Error al subir el archivo a R2: ${error.message || error}`);
  }
};

module.exports = {
    uploadFileR2,
};