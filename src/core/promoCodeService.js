const admin = require('firebase-admin'); // <--- AÑADIR ESTA LÍNEA
const { getFirestore } = require('../config/firebase'); // Asumiendo que así obtienes getFirestore
const logger = require('../utils/logger'); // Asumiendo que así obtienes logger
// ...otros require que puedas tener...

const PROMO_CODES_COLLECTION = 'promotionalCodes'; // Asegúrate que esta constante esté definida
const USERS_COLLECTION = 'users'; // Asegúrate que esta constante esté definida

/**
 * Valida un código promocional.
 * @param {string} code - Código a validar.
 * @returns {Promise<object|null>} - Datos del código si es válido y no usado, o null.
 */
const validateCode = async (code) => {
  try {
    const db = getFirestore();
    const codeRef = db.collection(PROMO_CODES_COLLECTION).doc(code);
    const docSnap = await codeRef.get();
    if (!docSnap.exists) return null;
    const codeData = docSnap.data();
    // Modificación: Se elimina la comprobación de codeData.usedBy aquí.
    // La lógica de si un usuario específico ya usó el código está en redeemCode.
    if (!codeData.estado) return null; 
    return { id: docSnap.id, ...codeData };
  } catch (error) {
    logger.error(`Error validating promo code ${code}: ${error.message}`);
    return null;
  }
};

/**
 * Canjea un código promocional para un usuario (habilitado para múltiples usos).
 * @param {string} userId
 * @param {object} codeData
 * @returns {Promise<boolean>} True si el canje fue exitoso
 */
const redeemCode = async (userId, codeData) => {
  try {
    const db = getFirestore();
    const userRef = db.collection(USERS_COLLECTION).doc(userId);

    await db.runTransaction(async (transaction) => {
      const userSnap = await transaction.get(userRef);

      // Verificar si el usuario ya ha redimido este código
      if (userSnap.exists && userSnap.data().redeemedPromoCodes?.includes(codeData.id)) {
        throw new Error(`El usuario ${userId} ya ha redimido el código ${codeData.id}`);
      }

      // Actualizar el usuario con el código redimido
      transaction.set(
        userRef,
        {
          hasUnlimitedAccess: true,
          redeemedPromoCodes: admin.firestore.FieldValue.arrayUnion(codeData.id),
          promoSource: codeData.source,
          lastUpdatedAt: new Date(), // Considera usar admin.firestore.Timestamp.now() para consistencia
        },
        { merge: true }
      );
    });

    logger.info(`Promo code ${codeData.id} redeemed by user ${userId}`);
    return true;
  } catch (error) {
    logger.error(`Error redeeming promo code ${codeData.id} for user ${userId}: ${error.message}`);
    return false;
  }
};

// ...resto de tus funciones como ensurePromoCodeExists, etc.

module.exports = {
  validateCode,
  redeemCode,
  // ...otras funciones que exportes
};