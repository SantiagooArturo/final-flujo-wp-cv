require('dotenv').config();
const { S3Client } = require('@aws-sdk/client-s3'); 

const r2Config = {
    // Configuración de R2/S3
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    bucketName: process.env.AWS_S3_BUCKET,
    endpoint: process.env.AWS_S3_ENDPOINT,
    publicUrlBase: process.env.R2_PUBLIC_URL, 
    region: process.env.AWS_REGION || 'auto',
  };

  if (!r2Config.accessKeyId || !r2Config.secretAccessKey || !r2Config.bucketName || !r2Config.endpoint) {
    console.warn(`
        *******************************************
        * ADVERTENCIA: Faltan variables de entorno R2/S3. *
        * Asegúrate de definir AWS_ACCESS_KEY_ID,      *
        * AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET,       *
        * y AWS_S3_ENDPOINT en tu archivo .env        *
        *******************************************
      `);
}

const r2Client = new S3Client({
    region: r2Config.region,
    endpoint: r2Config.endpoint,
    credentials: {
      accessKeyId: r2Config.accessKeyId,
      secretAccessKey: r2Config.secretAccessKey,
    },
    forcePathStyle: true,
  });

module.exports = {
    r2Config,
    r2Client,
};