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

// 2. Implementar en el flujo de handleText:
if (/¡*hola,*\s*worky!*\s*soy\s*estudiante\s*de\s*(la\s*)*ucal/i.test(text.trim())) {
  const code = 'UCAL20';
  logger.info(`Activando código UCAL automáticamente para ${from}`);
  
  try {
    // Asegurar que el código existe
    await ensurePromoCodeExists(code, {
      estado: true,
      description: 'Acceso ilimitado para estudiantes UCAL',
      source: 'UCAL',
      universidad: 'UCAL'
    });
    
    const userDoc = await userService.registerOrUpdateUser(from);
    if (userDoc.hasUnlimitedAccess) {
      await bot.sendMessage(from, '✨ ¡Ya tienes acceso ilimitado activado como estudiante UCAL!');
      return;
    }
    
    if (userDoc.redeemedPromoCode) {
      await bot.sendMessage(from, `⚠️ Ya has canjeado un código promocional (${userDoc.redeemedPromoCode}). Solo se permite un código por usuario.`);
      return;
    }
    
    const codeData = await promoCodeService.validateCode(code);
    if (!codeData) {
      logger.error(`Código UCAL20 no encontrado o inactivo en Firebase`);
      await bot.sendMessage(from, '❌ Error al activar código UCAL. Por favor contacta a soporte mencionando "error UCAL20".');
      return;
    }
    
    const redeemed = await promoCodeService.redeemCode(from, codeData);
    if (redeemed) {
      // Añadir créditos
      const creditsAdded = await userService.addCVCredits(from, 99);
      
      // Guardar información adicional del estudiante
      await userService.registerOrUpdateUser(from, {
        universidad: 'UCAL',
        codigoActivadoVia: 'mensaje_automatico',
        fechaActivacionCodigo: new Date(),
        tieneAccesoUCAL: true,
        creditosDisponibles: creditsAdded
      });
      
      // Mensaje personalizado para estudiantes UCAL
      await bot.sendMessage(from, `✅ *¡Bienvenido estudiante de UCAL!*\n\nHemos activado tu código promocional *${codeData.id}* con éxito.\n\n✨ Ahora tienes:\n• Acceso ilimitado\n• 99 créditos para análisis de CV\n\n¡Comencemos tu camino profesional! Puedes enviar tu CV como documento PDF para analizarlo.`);
      
      logger.info(`Usuario ${from} activó código UCAL exitosamente con ${creditsAdded} créditos`);
      return;
    } else {
      await bot.sendMessage(from, '⚠️ Hubo un problema al activar tu código UCAL. Por favor, contacta a soporte mencionando "error activación UCAL20".');
      return;
    }
  } catch (error) {
    logger.error(`Error procesando activación UCAL: ${error.message}`);
    await bot.sendMessage(from, '⚠️ Ocurrió un error inesperado. Por favor, intenta nuevamente o contacta a soporte.');
    return;
  }
}
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
};
