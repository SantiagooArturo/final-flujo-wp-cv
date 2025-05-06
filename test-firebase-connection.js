// Asegúrate de que la ruta a firebaseConfig sea correcta según la ubicación de este archivo.
// Si este archivo está en la raíz del proyecto, y firebase.js está en src/config/firebase.js:
const firebaseConfig = require('./src/config/firebase'); 
const logger = require('./src/utils/logger'); // Asumiendo que logger está en src/utils

// Cargar variables de entorno (si no se cargan automáticamente al requerir firebaseConfig)
// require('dotenv').config(); // Descomenta si es necesario y firebaseConfig no lo hace.

const runTest = async () => {
  console.log('--- Iniciando Prueba de Conexión a Firebase ---');

  try {
    // 1. Intentar inicializar Firebase
    // La función initializeFirebase en tu módulo ya maneja la lógica de no reinicializar
    // y lanza errores si las variables de entorno no están configuradas.
    console.log('Paso 1: Intentando inicializar Firebase...');
    firebaseConfig.initializeFirebase(); // Esto puede lanzar un error si las env vars no están.
    console.log('Firebase `initializeFirebase()` llamada. Estado `isInitialized()`:', firebaseConfig.isInitialized());

    if (firebaseConfig.usingMockImplementation) {
      console.warn('ADVERTENCIA: Firebase está configurado para usar la implementación MOCK.');
      console.log('Esto significa que las credenciales reales de Firebase no se usaron o falló la inicialización.');
      console.log('La prueba con Firestore real no se ejecutará.');
      console.log('--- Prueba de Conexión a Firebase Finalizada (con MOCK) ---');
      return;
    }

    if (!firebaseConfig.isInitialized()) {
      console.error('ERROR: `firebaseConfig.isInitialized()` devolvió false después de llamar a `initializeFirebase()`.');
      console.log('Verifica los logs de `initializeFirebase` para más detalles (puede ser un error silencioso o un mock activado).');
      console.log('--- Prueba de Conexión a Firebase Finalizada (con ERROR DE INICIALIZACIÓN) ---');
      return;
    }
    console.log('Paso 1: Firebase parece estar inicializado.');

    // 2. Intentar obtener la instancia de Firestore
    console.log('\nPaso 2: Intentando obtener la instancia de Firestore...');
    const db = firebaseConfig.getFirestore();

    if (!db || typeof db.collection !== 'function') {
      console.error('ERROR CRÍTICO: `getFirestore()` no devolvió una instancia de Firestore válida.');
      console.log(`Tipo de 'db' recibido: ${typeof db}`);
      if (db) {
        console.log(`Propiedades de 'db': ${Object.keys(db).join(', ')}`);
      }
      console.log('--- Prueba de Conexión a Firebase Finalizada (con ERROR EN GETFIRESTORE) ---');
      return;
    }
    console.log('Paso 2: Instancia de Firestore obtenida correctamente.');

    // 3. Intentar una operación de lectura simple
    console.log('\nPaso 3: Intentando una operación de lectura en Firestore...');
    // Usaremos una colección y documento que probablemente no existen para no afectar datos reales.
    // El objetivo es solo verificar si la llamada al servicio de Firestore se puede realizar.
    const testCollection = '__test_connection_script__';
    const testDoc = 'test_document_123';
    const docRef = db.collection(testCollection).doc(testDoc);
    
    console.log(`Intentando leer el documento: ${testCollection}/${testDoc}`);
    const docSnap = await docRef.get();

    if (docSnap.exists) {
      console.log(`Documento de prueba '${testDoc}' encontrado (inesperado, pero la lectura funcionó). Data:`, docSnap.data());
    } else {
      console.log(`Documento de prueba '${testDoc}' no encontrado (esperado, y la lectura funcionó).`);
    }
    console.log('Paso 3: Operación de lectura en Firestore completada exitosamente.');

    console.log('\n--- ¡ÉXITO! La conexión a Firebase y Firestore parece estar funcionando correctamente. ---');

  } catch (error) {
    console.error('\n--- ¡FALLO! Ocurrió un error durante la prueba de conexión a Firebase: ---');
    console.error('Mensaje de Error:', error.message);
    console.error('Stack del Error:', error.stack);

    if (error.message.includes("Firebase environment variables not configured")) {
        console.error("\nDETALLE ADICIONAL: Este error indica que las variables de entorno FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, o FIREBASE_CLIENT_EMAIL no están configuradas. Asegúrate de que tu archivo .env esté presente y cargado, o que las variables estén configuradas en tu entorno de ejecución.");
    } else if (error.message.includes("Failed to parse private key")) {
        console.error("\nDETALLE ADICIONAL: El error 'Failed to parse private key' usualmente indica un problema con el formato de la variable de entorno FIREBASE_PRIVATE_KEY. Asegúrate de que los saltos de línea (\\n) estén correctos y que la clave completa esté presente.");
    } else if (error.message.includes("Could not load the default credentials")) {
        console.error("\nDETALLE ADICIONAL: El error 'Could not load the default credentials' puede indicar que las variables de entorno para la autenticación no están configuradas o accesibles correctamente.");
    } else if (error.message.includes("7 PERMISSION_DENIED")) {
        console.error("\nDETALLE ADICIONAL: PERMISSION_DENIED: El servicio de Firebase denegó el acceso. Verifica los permisos de la cuenta de servicio asociada a tus credenciales y asegúrate de que las APIs necesarias (como Firestore API) estén habilitadas en Google Cloud Console para tu proyecto.");
    } else if (error.message.includes("Cannot read properties of undefined (reading 'prototype')")) {
        console.error("\nDETALLE ADICIONAL: El error 'Cannot read properties of undefined (reading 'prototype')' sugiere que la instancia 'db' de Firestore es undefined. Esto puede pasar si `admin.firestore()` es llamado antes de que `admin` esté completamente inicializado o si `getFirestore()` devuelve `undefined` por alguna razón interna.");
    }
  } finally {
    // Si tienes alguna lógica de cierre o limpieza, puedes ponerla aquí.
    // Por ejemplo, si tu logger necesita ser cerrado:
    // if (logger && typeof logger.close === 'function') {
    //   logger.close();
    // }
    // En un script simple, process.exit() puede no ser necesario si Node.js termina naturalmente.
  }
};

// Ejecutar la prueba
runTest();