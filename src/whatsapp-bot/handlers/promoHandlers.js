// Handlers relacionados a la gestión de códigos promocionales
const promoCodeService = require('../../core/promoCodeService');
const userService = require('../../core/userService');
const bot = require('../bot');

/**
 * Maneja el canje de códigos promocionales por WhatsApp
 * @param {string} from - ID del usuario (número de WhatsApp)
 * @param {string} code - Código promocional ingresado
 */
const handlePromoCode = async (from, code) => {
  if (!code) {
    await bot.sendMessage(from, 'Por favor, proporciona un código promocional. Usa: !promo TU_CODIGO');
    return;
  }
  // Verificar si el usuario ya tiene acceso ilimitado o ya canjeó un código
  const userDoc = await userService.registerOrUpdateUser(from);
  if (userDoc.hasUnlimitedAccess) {
    await bot.sendMessage(from, '✨ ¡Ya tienes acceso ilimitado activado!');
    return;
  }
  if (userDoc.redeemedPromoCode) {
    await bot.sendMessage(from, `⚠️ Ya has canjeado un código promocional (${userDoc.redeemedPromoCode}). Solo se permite un código por usuario.`);
    return;
  }
  // Validar el código
  const codeData = await promoCodeService.validateCode(code);
  if (!codeData) {
    await bot.sendMessage(from, '❌ El código promocional no es válido, ya ha sido usado o ha expirado.');
    return;
  }
  // Intentar canjear el código
  const redeemed = await promoCodeService.redeemCode(from, codeData);
  if (redeemed) {
    await bot.sendMessage(from, `✅ ¡Código promocional *${codeData.id}* activado con éxito! Ahora tienes acceso ilimitado.\nOrigen: ${codeData.source} (${codeData.description || ''})`);
  } else {
    await bot.sendMessage(from, '⚠️ Hubo un problema al intentar canjear el código. Puede que alguien más lo haya usado justo ahora. Intenta de nuevo o contacta soporte.');
  }
};

module.exports = {
  handlePromoCode,
};
