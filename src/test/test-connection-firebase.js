const firebaseConfig = require('../config/firebase');
const logger = require('../utils/logger');

const testFirebaseConnection = async () => {
  try {
    if (!firebaseConfig.isInitialized()) {
      logger.error('Firebase no está inicializado. Verifica las credenciales en el archivo .env.');
      return;
    }

    const db = firebaseConfig.getFirestore();
    const testCollection = db.collection('test_connection');
    const testDoc = testCollection.doc('test_doc');

    // Escribir un documento de prueba
    await testDoc.set({
      message: 'Test de conexión exitoso',
      timestamp: new Date(),
    });
    logger.info('Documento de prueba escrito correctamente en Firestore.');

    // Leer el documento de prueba
    const docSnapshot = await testDoc.get();
    if (docSnapshot.exists) {
      const data = docSnapshot.data();
      logger.info('Documento de prueba leído correctamente:', data);
    } else {
      logger.warn('El documento de prueba no existe.');
    }

    // Eliminar el documento de prueba
    await testDoc.delete();
    logger.info('Documento de prueba eliminado correctamente.');

    logger.info('Test de conexión a Firebase completado exitosamente.');
  } catch (error) {
    logger.error(`Error durante el test de conexión a Firebase: ${error.message}`);
  }
};

module.exports = { testFirebaseConnection };