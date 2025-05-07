const userService = require('./src/core/userService'); // Ajusta la ruta si es necesario
const { testFirebaseConnection } = require('./src/test/test-connection-firebase'); // Ajusta la ruta si es necesario

async function checkUserSize() {
  const userId = '51991835651';
  const estimatedSize = await userService.estimateUserDocumentSize(userId);

  if (estimatedSize !== -1) {
    console.log(`El tamaño estimado del documento para el usuario ${userId} es: ${estimatedSize} bytes.`);
    // Convertir a KB si prefieres
    console.log(`Equivalente a: ${(estimatedSize / 1024).toFixed(2)} KB.`);
  } else {
    console.log(`No se pudo estimar el tamaño para el usuario ${userId}.`);
  }
}

checkUserSize();
testFirebaseConnection();