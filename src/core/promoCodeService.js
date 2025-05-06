const { getFirestore } = require('../config/firebase');
const logger = require('../utils/logger');

const PROMO_CODES_COLLECTION = 'promotionalCodes';
const USERS_COLLECTION = 'users';

const ensurePromoCodeExists = async (codeId, defaultData) => {
  try {
    const db = getFirestore();
    const codeRef = db.collection('promotionalCodes').doc(codeId);
    const docSnap = await codeRef.get();
    
    if (!docSnap.exists) {
      logger.info(`Creando código promocional ${codeId} en Firebase`);
      await codeRef.set({
        ...defaultData,
        createdAt: new Date()
      });
      return true;
    }
    return true;
  } catch (error) {
    logger.error(`Error al verificar/crear código promocional: ${error.message}`);
    return false;
  }
};

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
    // Cambia 'isActive' por 'estado'
    if (!codeData.estado || codeData.usedBy) return null;
    return { id: docSnap.id, ...codeData };
  } catch (error) {
    logger.error(`Error validating promo code ${code}: ${error.message}`);
    return null;
  }
};

/**
 * Canjea un código promocional para un usuario (solo una vez).
 * @param {string} userId
 * @param {object} codeData
 * @returns {Promise<boolean>} True si el canje fue exitoso
 */
const redeemCode = async (userId, codeData) => {
  try {
    const db = getFirestore();
    const codeRef = db.collection(PROMO_CODES_COLLECTION).doc(codeData.id);
    const userRef = db.collection(USERS_COLLECTION).doc(userId);
    await db.runTransaction(async (transaction) => {
      const codeSnap = await transaction.get(codeRef);
      if (!codeSnap.exists || codeSnap.data().usedBy) throw new Error('Código ya canjeado');
      transaction.update(codeRef, {
        usedBy: userId,
        redeemedAt: new Date(),
        isActive: false,
      });
      transaction.set(userRef, {
        hasUnlimitedAccess: true,
        redeemedPromoCode: codeData.id,
        promoSource: codeData.source,
        lastUpdatedAt: new Date(),
      }, { merge: true });
    });
    logger.info(`Promo code ${codeData.id} redeemed by user ${userId}`);
    return true;
  } catch (error) {
    logger.error(`Error redeeming promo code ${codeData.id} for user ${userId}: ${error.message}`);
    return false;
  }
};

module.exports = {
  validateCode,
  redeemCode,
  ensurePromoCodeExists,
};