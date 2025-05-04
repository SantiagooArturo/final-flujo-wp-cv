const bot = require('./bot');
const logger = require('../utils/logger');
const cvService = require('../core/cvService');
const interviewService = require('../core/interviewService');
const sessionService = require('../core/sessionService');
const videoProcessing = require('../utils/videoProcessing');
const openaiUtil = require('../utils/openaiUtil');
const fileProcessing = require('../utils/fileProcessing');
const { generateCVAnalysisPDF } = require('../utils/pdfGenerator');
const storageService = require('../utils/storageService');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const userService = require('../core/userService');
const promoCodeService = require('../core/promoCodeService');

const handleStart = async (from) => {
  try {
    logger.info('Firebase already initialized');

    // Obtener la sesión actual antes de resetearla
    const currentSession = await sessionService.getOrCreateSession(from);

    // Estados que indican que está en medio de una entrevista
    const interviewStates = [
      sessionService.SessionState.POSITION_RECEIVED,
      sessionService.SessionState.INTERVIEW_STARTED,
      sessionService.SessionState.QUESTION_ASKED,
      sessionService.SessionState.ANSWER_RECEIVED
    ];

    // Si está en medio de una entrevista, notificar y no resetear
    if (interviewStates.includes(currentSession.state)) {
      await bot.sendMessage(from, '⚠️ *¡Espera un momento!* Ya tienes una entrevista en curso. Para reiniciar, envía *!reset* primero. ¡Ánimo con tu entrevista actual! 🚀');
      logger.info(`Start command ignored for user ${from} due to active interview session`);
      return;
    }

    // Si no está en entrevista, proceder con el reseteo normal
    await sessionService.resetSession(from);
    logger.info(`Session reset for user ${from}`);

    // Primero mostrar los términos y condiciones
    await handleTermsAndConditions(from);
  } catch (error) {
    logger.error(`Error in handleStart: ${error.message}`);
    await bot.sendMessage(from, '😓 Lo siento, ha ocurrido un error al iniciar. Por favor, intenta nuevamente enviando *!start*.');
  }
};

/**
 * Manejar la selección del menú inicial
 * @param {string} from - ID del usuario
 * @param {string} selection - Opción seleccionada
 * @returns {Promise<void>}
 */
const handleMenuSelection = async (from, selection) => {
  try {
    logger.info(`Menu selection received from user ${from}: ${selection}`);

    switch (selection) {
      case 'review_cv':
        // Verificar si ya realizó un análisis de CV anteriormente (usando userService)
        const shouldPay = await userService.shouldUserPayForCVAnalysis(from);

        if (shouldPay) {
          // Si ya analizó un CV anteriormente y no tiene créditos, mostrar mensaje claro
          // con opciones de comprar o volver al menú
          const remainingCredits = await userService.getRemainingCVCredits(from);

          if (remainingCredits <= 0) {
            // No tiene créditos, mostrar mensaje claro
            const noCreditsButtons = [
              { id: 'buy_credits', text: '💰 Comprar revisiones' },
              { id: 'back_to_main_menu', text: '🔙 Volver al Menú' }
            ];

            await bot.sendButtonMessage(
              from,
              '⚠️ *Se te acabaron las revisiones de CV*\n\nActualmente no tienes créditos disponibles para analizar más CVs. ¿Quieres comprar más revisiones o volver al menú principal?',
              noCreditsButtons,
              'Sin créditos disponibles'
            );
          } else {
            // Tiene créditos premium, mostrar información normal de premium
            await handlePremiumInfo(from);
          }
        } else {
          // Primero preguntar por el puesto al que aspira
          await bot.sendMessage(from, '¿A qué puesto aspiras? Describe brevemente el puesto y la industria. \n\n 📝(Ejemplo: “Practicante de ventas en Coca Cola o Analista de marketing en banca”).');
          // Crear un estado intermedio para indicar que estamos esperando el puesto antes del CV
          await sessionService.updateSessionState(from, 'waiting_for_position_before_cv');
          logger.info(`Asked for position before CV for user ${from}`);
        }
        break;

      case 'interview_simulation':
        // Para simulación de entrevista, siempre preguntar por el puesto de trabajo
        // antes de comenzar, sin importar si ha analizado CV previamente o no
        await bot.sendMessage(from, '¿A qué puesto aspiras? Describe brevemente el puesto y la industria. \n\n 📝(Ejemplo: “Practicante de ventas en Coca Cola o Analista de marketing en banca”).');
        await sessionService.updateSessionState(from, 'waiting_for_position_before_interview');
        logger.info(`Asked for position before interview for user ${from}`);
        break;

      default:
        // Opción no reconocida, mostrar menú de nuevo
        const menuButtons = [
          { id: 'review_cv', text: '📋 Revisar mi CV' },
          { id: 'interview_simulation', text: '🎯 Simular entrevista' },
          { id: 'personalized_advice', text: '👨‍💼 Asesoría' }
        ];

        await bot.sendButtonMessage(
          from,
          'No reconozco esa opción. Si quieres simular una entrevista dale a Simular entrevista, si quieres analizar otro CV dale a Premium',
          menuButtons,
          '¿Ahora cómo te ayudo?'
        );
        logger.info(`Invalid selection, menu re-sent to user ${from}`);
        break;
    }
  } catch (error) {
    logger.error(`Error handling menu selection: ${error.message}`);
    await bot.sendMessage(from, 'Lo siento, hubo un error al procesar tu selección. Por favor, intenta nuevamente con !start.');
  }
};

const handleDocument = async (from, document) => {
  try {
    // Obtener sesión del usuario
    const session = await sessionService.getOrCreateSession(from);

    // Verificar si ya se procesó este CV
    if (session.cvProcessed) {
      logger.info(`CV already processed for user ${from}`);
      return;
    }

    // Verificar si ya tiene análisis previos (usando userService)
    const shouldPay = await userService.shouldUserPayForCVAnalysis(from);

    if (shouldPay) {
      logger.info(`User ${from} has already analyzed a CV and needs to pay for more`);
      await handlePremiumInfo(from);
      return;
    }

    // Verificar si necesita usar un crédito
    const analysisCount = await userService.getCVAnalysisCount(from);
    if (analysisCount > 0) {
      // No es su primer análisis, así que debe tener créditos (comprobado en shouldUserPayForCVAnalysis)
      // Usar un crédito
      await userService.useCVCredit(from);
      logger.info(`Used 1 credit for user ${from} for CV analysis`);
    }

    // Validar documento
    if (!document) {
      logger.error('Document object is null or undefined');
      throw new Error('Documento no recibido');
    }

    logger.info(`Document object received: ${JSON.stringify(document, null, 2)}`);

    if (!document.id) {
      logger.error('Document ID is missing');
      throw new Error('ID de documento no válido');
    }

    // Marcar que estamos procesando un CV y guardarlo en la sesión
    await sessionService.updateSession(from, {
      cvProcessed: true,
      processingCV: true,
      processingStartTime: Date.now(),
      lastDocumentId: document.id
    });

    // Enviar mensaje de procesamiento
    await bot.sendMessage(from, '📄 *¡Gracias por compartir tu CV!* 🙏\n\nEstoy analizándolo detalladamente para ofrecerte retroalimentación valiosa. Este proceso puede tomar entre 2-3 minutos... ⏳\n\nEl análisis se está realizando en un servidor externo, por favor ten paciencia.');

    // Obtener el puesto de trabajo si existe
    const jobPosition = session.jobPosition || 'Puesto no especificado';

    // Obtener la URL del documento usando el MediaProcessor de WhatsApp
    const mediaUrl = await bot.getMediaUrl(document.id);
    if (!mediaUrl) {
      throw new Error('No se pudo obtener la URL del documento');
    }

    logger.info(`Document media URL obtained: ${mediaUrl}`);
    document.url = mediaUrl;

    try {
      // Procesar el CV usando el endpoint real
      const cvService = require('../core/cvService');
      const analysis = await cvService.processCV(document, from, jobPosition);

      // Extraer solo la URL del análisis para guardar
      let analysisUrl;
      if (typeof analysis === 'string') {
        analysisUrl = analysis;
      } else if (analysis && analysis.pdfUrl) {
        analysisUrl = analysis.pdfUrl;
      } else if (analysis && analysis.url) {
        analysisUrl = analysis.url;
      } else {
        // URL de respaldo si no se pudo extraer del análisis
        analysisUrl = `https://myworkinpe.lat/pdfs/cv_${Date.now()}.pdf`;
        logger.info(`No URL found in analysis response, using fallback URL: ${analysisUrl}`);
      }

      logger.info(`Analysis URL extracted: ${analysisUrl}`);

      // Guardar solo la URL del análisis en la sesión, NO el análisis completo
      await sessionService.saveCVAnalysis(from, analysisUrl);

      // Actualizar la sesión solo con la URL, no con el objeto de análisis completo
      await sessionService.updateSession(from, {
        previousAnalysis: session.previousAnalysis ? [...session.previousAnalysis, analysisUrl] : [analysisUrl],
        processingCV: false,  // Marcar como finalizado el procesamiento
        lastPdfUrl: analysisUrl  // Guardar la URL para fácil acceso
      });

      // Registrar el análisis en el historial permanente de usuario (solo URL)
      await userService.recordCVAnalysis(from, { url: analysisUrl }, jobPosition);

      // Enviar mensaje de análisis completado
      await bot.sendMessage(from, '✅ *¡Análisis completado!* 🎉\n\nHe revisado tu CV y he preparado un informe detallado con todas mis observaciones.');

      try {
        // Esperar un momento antes de enviar el enlace para evitar problemas de límites de velocidad
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Enviar SOLO la URL sin formato adicional
        logger.info(`Intentando enviar URL simple: ${analysisUrl}`);
        await bot.sendMessage(from, analysisUrl);

        // Esperar antes de enviar las opciones
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Enviar mensaje adicional con instrucciones
        await bot.sendMessage(from, 'Haz clic en el enlace anterior para ver tu análisis completo en PDF');

        // Enviar opciones post-análisis como texto simple
        await sendPostCVOptions(from);
      } catch (messageError) {
        logger.error(`Error sending PDF link message: ${messageError.message}`);
        // En caso de error al enviar el enlace, intentar con un formato aún más simple
        try {
          logger.info('Intentando enviar URL con formato alternativo');
          await bot.sendMessage(from, analysisUrl);
        } catch (simpleMessageError) {
          logger.error(`Error sending alternate link: ${simpleMessageError.message}`);
        }
      }

      logger.info(`CV analysis process completed for user ${from}. PDF URL: ${analysisUrl}`);
      return analysisUrl;
    } catch (error) {
      // En caso de error, asegurarse de marcar el procesamiento como finalizado
      await sessionService.updateSession(from, { processingCV: false });
      throw error;
    }
  } catch (error) {
    logger.error(`Error handling document: ${error.message}`);
    await bot.sendMessage(from, `⚠️ Lo siento, ocurrió un error al procesar tu CV: ${error.message}. Por favor, intenta nuevamente más tarde.`);
  }
};

const handleText = async (from, text) => {
  try {
    logger.info('Firebase already initialized');
    const session = await sessionService.getOrCreateSession(from);
    logger.info(`Session retrieved for user: ${from}, state: ${session.state}`);

    logger.info(`Handling text message from user ${from} in state: ${session.state}`);

    // Si es un usuario nuevo o está en estado inicial y es su primer mensaje
    if (session.state === sessionService.SessionState.INITIAL && !session.hasReceivedWelcomeMessage) {
      // Marcar que ya recibió el mensaje de bienvenida
      await sessionService.updateSession(from, { hasReceivedWelcomeMessage: true });

      // Mostrar mensaje de bienvenida como si hubiera enviado !start
      await handleStart(from);
      return;
    }

    // Manejar comandos especiales primero
    if (text.toLowerCase().startsWith('!')) {
      const command = text.toLowerCase().substring(1);
      switch (command) {
        case 'start':
          await handleStart(from);
          return;
        case 'help':
          await handleHelp(from);
          return;
        case 'reset':
          await sessionService.resetSession(from);
          await handleStart(from);
          return;
        case 'clearsession':
          // Comando especial para limpiar la sesión cuando está muy grande
          await sessionService.resetSession(from);
          await bot.sendMessage(from, '✅ Tu sesión ha sido reiniciada correctamente. Ahora puedes continuar usando el bot normalmente. Usa !start para comenzar de nuevo.');
          return;
        case 'pdf':
        case 'url':
        case 'link':
          // Enviar la URL del último PDF generado
          if (session.lastPdfUrl) {
            await bot.sendMessage(from, `📊 *Aquí está el enlace a tu PDF de análisis:*\n\n${session.lastPdfUrl}`);
          } else {
            await bot.sendMessage(from, 'No tienes ningún PDF generado recientemente. Envía tu CV para generar un análisis.');
          }
          return;
        default:
          await bot.sendMessage(from, 'Comando no reconocido. Usa !help para ver los comandos disponibles.');
          return;
      }
    }

    // Comprobar si el texto pide la URL del PDF
    if (text.toLowerCase().includes('url') &&
      (text.toLowerCase().includes('pdf') || text.toLowerCase().includes('análisis') || text.toLowerCase().includes('analisis'))) {
      // Enviar la URL del último PDF generado
      if (session.lastPdfUrl) {
        await bot.sendMessage(from, `📊 *Aquí está el enlace a tu PDF de análisis:*\n\n${session.lastPdfUrl}`);
      } else {
        await bot.sendMessage(from, 'No tienes ningún PDF generado recientemente. Envía tu CV para generar un análisis.');
      }
      return;
    }

    // --- NUEVO: Gestión de códigos promocionales ---
    if (text.toLowerCase().startsWith('!promo ')) {
      const code = text.substring(7).trim();
      if (!code) {
        await bot.sendMessage(from, 'Por favor, proporciona un código promocional. Usa: !promo TU_CODIGO');
        return;
      }
      // Verificar si el usuario ya tiene acceso ilimitado
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
        logger.info(`User ${from} successfully redeemed promo code ${codeData.id} from source ${codeData.source}`);
      } else {
        await bot.sendMessage(from, '⚠️ Hubo un problema al intentar canjear el código. Puede que alguien más lo haya usado justo ahora. Intenta de nuevo o contacta soporte.');
      }
      return;
    }

    // Manejar mensajes normales según el estado
    switch (session.state) {
      case 'initial':
        // Si el usuario está en estado inicial, mostrar el menú de opciones
        const menuButtons = [
          { id: 'review_cv', text: 'Revisar mi CV' },
          { id: 'interview_simulation', text: 'Simular entrevista' },
          { id: 'personalized_advice', text: '👨‍💼 Asesoría' }
        ];

        await bot.sendButtonMessage(
          from,
          'Selecciona una opción para continuar:',
          menuButtons,
          '¿En qué puedo ayudarte hoy?'
        );
        await sessionService.updateSessionState(from, sessionService.SessionState.MENU_SELECTION);
        break;
      case 'terms_acceptance':
        // Si el usuario está en el estado de aceptación de términos
        if (text.toLowerCase().includes('si') ||
          text.toLowerCase().includes('sí') ||
          text.toLowerCase().includes('acepto')) {
          // Usuario acepta los términos por texto
          logger.info(`User ${from} accepted terms and conditions via text`);
          await showWelcomeMessage(from);
        } else if (text.toLowerCase().includes('no') ||
          text.toLowerCase().includes('rechazo')) {
          // Usuario rechaza los términos por texto
          logger.info(`User ${from} rejected terms and conditions via text`);
          await bot.sendMessage(from, 'Para utilizar nuestros servicios es necesario aceptar los términos y condiciones. Sin esta aceptación, no podemos continuar.');
          await handleTermsAndConditions(from);
        } else {
          // Mensaje no reconocido, volver a mostrar los términos
          await bot.sendMessage(from, 'Por favor, responde "Sí" si aceptas los términos y condiciones o "No" si los rechazas.');
          await handleTermsAndConditions(from);
        }
        break;
      case sessionService.SessionState.MENU_SELECTION:
        // Intentar interpretar el texto como una opción del menú
        if (text.toLowerCase().includes('revisar') || text.toLowerCase().includes('cv')) {
          await handleMenuSelection(from, 'review_cv');
        } else if (text.toLowerCase().includes('simular') || text.toLowerCase().includes('entrevista')) {
          await handleMenuSelection(from, 'interview_simulation');
        } else if (text.toLowerCase().includes('asesor') || text.toLowerCase().includes('personal')) {
          await handleButtonReply(from, 'personalized_advice');
        } else {
          // Si no se reconoce la opción, mostrar el menú nuevamente
          const menuButtons = [
            { id: 'review_cv', text: 'Revisar mi CV' },
            { id: 'interview_simulation', text: 'Simular entrevista' },
            { id: 'personalized_advice', text: '👨‍💼 Asesoría' }
          ];

          await bot.sendButtonMessage(
            from,
            'No reconozco esa opción. Por favor, selecciona una de las siguientes:',
            menuButtons,
            '¿En qué puedo ayudarte hoy?'
          );
        }
        break;
      case sessionService.SessionState.WAITING_INTERVIEW_CONFIRMATION:
        // Usuario confirmando si quiere comenzar la entrevista
        if (text.toLowerCase() === 'sí' || text.toLowerCase() === 'si' ||
          text.toLowerCase().includes('listo') || text.toLowerCase().includes('comenzar')) {
          await startInterviewQuestions(from);
        } else if (text.toLowerCase() === 'no' || text.toLowerCase().includes('cancel')) {
          await bot.sendMessage(from, 'Entrevista cancelada. Si deseas volver a intentarlo, envía !start para comenzar de nuevo.');
          await sessionService.updateSessionState(from, sessionService.SessionState.INITIAL);
        } else {
          await bot.sendMessage(from, 'Por favor, responde "sí" si estás listo para comenzar la entrevista o "no" para cancelar.');
        }
        break;
      case sessionService.SessionState.POST_CV_OPTIONS:
        // Manejar opciones después del análisis del CV
        if (text.toLowerCase() === 'sí' || text.toLowerCase() === 'si' ||
          text.toLowerCase().includes('simular') || text.toLowerCase().includes('entrevista')) {
          // Iniciar simulación de entrevista
          await sessionService.updateSessionState(from, sessionService.SessionState.POSITION_RECEIVED);
          await handleInterview(from);
        } else if (text.toLowerCase().includes('revisar') || text.toLowerCase().includes('otro cv') ||
          text.toLowerCase().includes('nuevo cv')) {

          // Verificar historial de análisis (usando userService)
          const shouldPay = await userService.shouldUserPayForCVAnalysis(from);

          if (shouldPay) {
            // Mostrar mensaje de versión premium
            await handlePremiumInfo(from);
          } else {
            // Reiniciar el proceso para revisar otro CV, manteniendo el puesto
            await sessionService.updateSession(from, { cvProcessed: false });
            await bot.sendMessage(from, 'Por favor, envía el nuevo CV que deseas analizar.');
            await sessionService.updateSessionState(from, 'waiting_for_cv');
          }
        } else if (text.toLowerCase().includes('premium')) {
          // Mostrar información sobre la versión premium
          await handlePremiumInfo(from);
        } else {
          // No se reconoce el comando, mostrar opciones disponibles
          const totalAnalysisCount = await userService.getCVAnalysisCount(from);
          const hasAnalyzedCVBefore = totalAnalysisCount > 1;

          let menuButtons = [
            { id: 'start_interview', text: '🎯 Simular entrevista' }
          ];

          if (hasAnalyzedCVBefore) {
            //Cambiar el Premium por Otro CV pero igual
            menuButtons.push({ id: 'premium_required', text: '✨ Premium' });
          } else {
            menuButtons.push({ id: 'review_cv_again', text: '📋 Otro CV' });
          }

          await bot.sendButtonMessage(
            from,
            'No reconozco esa opción. ¿Qué te gustaría hacer ahora?',
            menuButtons,
            'Opciones disponibles:'
          );
        }
        break;
      case sessionService.SessionState.WAITING_FOR_POSITION_BEFORE_CV:
        // El usuario está enviando la posición antes de enviar el CV
        // Guardar la posición en la sesión
        await sessionService.saveJobPosition(from, text);
        logger.info(`Job position saved before CV for user ${from}: ${text}`);

        // Solicitar el CV
        await bot.sendMessage(from, `Gracias por indicar el puesto de ${text}. Ahora, por favor envía tu CV en formato **PDF** como documento para analizarlo en relación con este puesto.`);
        await sessionService.updateSessionState(from, 'waiting_for_cv');
        break;

      case 'waiting_for_position_before_interview':
        // El usuario está enviando la posición antes de la simulación de entrevista
        // Guardar la posición en la sesión
        await sessionService.saveJobPosition(from, text);
        logger.info(`Job position saved before interview for user ${from}: ${text}`);

        // Actualizar estado y continuar con la entrevista
        await sessionService.updateSessionState(from, sessionService.SessionState.POSITION_RECEIVED);

        // Iniciar la entrevista con el puesto proporcionado
        await handleInterview(from);
        break;
      case sessionService.SessionState.POSITION_ASKED:
        // Usuario respondiendo a la pregunta sobre el puesto
        await handleJobPosition(from, text);
        break;
      case sessionService.SessionState.POSITION_RECEIVED:
        // Usuario confirmando que quiere comenzar la entrevista
        if (text.toLowerCase() === 'sí' || text.toLowerCase() === 'si') {
          await handleInterview(from);
        } else {
          await bot.sendMessage(from, 'Para comenzar la entrevista, responde "sí". Si deseas reiniciar el proceso, envía !reset.');
        }
        break;
      case sessionService.SessionState.ANSWER_RECEIVED:
        // Usuario confirmando que quiere continuar con la siguiente pregunta
        if (text.toLowerCase() === 'sí' || text.toLowerCase() === 'si') {
          await handleNextQuestion(from);
        } else {
          await bot.sendMessage(from, 'Para continuar con la siguiente pregunta, responde "sí". Si deseas reiniciar el proceso, envía !reset.');
        }
        break;
      case sessionService.SessionState.QUESTION_ASKED:
        // Usuario respondiendo a una pregunta de entrevista con texto (no ideal)
        await bot.sendMessage(from, '🎤 *¡Prefiero escucharte!* Por favor, responde a la pregunta con un mensaje de *audio* o *video* para que pueda evaluar mejor tu respuesta. ¡Esto hará el análisis mucho más completo! 😊');
        break;
      case sessionService.SessionState.INTERVIEW_COMPLETED:
        // Cuando recibimos cualquier mensaje después de completar la entrevista,
        // automáticamente reiniciamos el proceso como si el usuario hubiera enviado !reset
        logger.info(`User ${from} sent a message after interview completion. Auto-resetting session.`);
        await sessionService.resetSession(from);
        await handleStart(from);
        break;
      case 'selecting_premium_package':
        // Verificar si es una respuesta a la lista interactiva
        if (session.interactive && session.interactive.list_reply) {
          const selectedId = session.interactive.list_reply.id;
          await handlePackageSelection(from, selectedId);
        } else if (text.toLowerCase().includes('menu') ||
          text.toLowerCase().includes('regresar') ||
          text.toLowerCase().includes('volver') ||
          text.toLowerCase().includes('atras') ||
          text.toLowerCase().includes('atrás') ||
          text.toLowerCase().includes('inicio')) {
          // El usuario quiere volver al menú principal
          await sessionService.resetSession(from);
          await handleStart(from);
        } else {
          // Intentar procesar la selección - si no coincide con un paquete,
          // handlePackageSelection se encargará de volver a mostrar las opciones
          await handlePackageSelection(from, text);
        }
        break;
      case 'confirming_payment':
        if (text.toLowerCase().includes('pag') || text.toLowerCase().includes('ya pag')) {
          await handlePaymentConfirmation(from);
        } else if (text.toLowerCase().includes('volver') || text.toLowerCase().includes('atrás') || text.toLowerCase().includes('atras')) {
          await handlePremiumInfo(from);
        } else {
          await bot.sendMessage(from, 'Por favor, confirma si has realizado el pago o si deseas volver a la selección de paquetes.');
        }
        break;
      case 'advisor_service_selection':
        if (text.toLowerCase().includes('acept') || text.toLowerCase() === 'si' || text.toLowerCase() === 'sí') {
          // Usuario acepta la asesoría por texto
          await handleButtonReply(from, 'accept_advisor');
        } else if (text.toLowerCase().includes('regres') || text.toLowerCase().includes('volver') ||
          text.toLowerCase().includes('menu') || text.toLowerCase().includes('cancel')) {
          // Usuario quiere volver al menú principal
          await sessionService.resetSession(from);
          await handleStart(from);
        } else {
          await bot.sendMessage(from, 'Por favor, responde "ACEPTAR" si deseas continuar con la asesoría o "REGRESAR" para volver al menú principal.');
        }
        break;
      case 'selecting_advisor_type':
        if (text.toLowerCase().includes('cv') || text.toLowerCase().includes('revisar')) {
          // Usuario quiere asesoría para revisión de CV
          await handleButtonReply(from, 'advisor_cv_review');
        } else if (text.toLowerCase().includes('entrevista') || text.toLowerCase().includes('simular')) {
          // Usuario quiere asesoría para simulación de entrevista
          await handleButtonReply(from, 'advisor_interview');
        } else if (text.toLowerCase().includes('regres') || text.toLowerCase().includes('volver') ||
          text.toLowerCase().includes('menu') || text.toLowerCase().includes('cancel')) {
          // Usuario quiere volver al menú principal
          await sessionService.resetSession(from);
          await handleStart(from);
        } else {
          await bot.sendMessage(from, 'Por favor, indica si deseas asesoría para "Revisar CV" o "Simular Entrevista", o escribe "regresar" para volver al menú principal.');
        }
        break;
      case 'confirming_advisor_payment':
        if (text.toLowerCase().includes('pag') || text.toLowerCase().includes('ya pag')) {
          await handleAdvisorPaymentConfirmation(from);
        } else if (text.toLowerCase().includes('volver') || text.toLowerCase().includes('atrás') ||
          text.toLowerCase().includes('atras') || text.toLowerCase().includes('cancel')) {
          await handleAdvisorService(from);
        } else {
          await bot.sendMessage(from, 'Por favor, confirma si has realizado el pago o si deseas volver a la información de asesoría.');
        }
        break;
      default:
        await bot.sendMessage(from, 'Por favor, envía tu CV como documento para que pueda analizarlo.');
    }

    logger.info(`Text message handled for user ${from}`);
  } catch (error) {
    logger.error(`Error handling text message: ${error.message}`);
    await bot.sendMessage(from, 'Lo siento, hubo un error al procesar tu mensaje. Por favor, intenta nuevamente.');
  }
};

const handleJobPosition = async (from, positionText) => {
  try {
    // Guardar puesto en la sesión
    await sessionService.saveJobPosition(from, positionText);
    logger.info(`Job position saved for user ${from}: ${positionText}`);

    // Confirmar recepción y explicar próximos pasos
    const confirmMessage = `
Gracias por proporcionar el puesto de trabajo: *${positionText}*

Ahora comenzaremos con la simulación de entrevista. Te haré 4 preguntas relacionadas con el puesto.

Para cada pregunta:
1. Responde con un mensaje de audio o video
2. Yo analizaré tu respuesta y te daré retroalimentación
3. Luego pasaremos a la siguiente pregunta

¿Estás listo/a para comenzar la entrevista? Responde "sí" para continuar.
    `;

    await bot.sendMessage(from, confirmMessage);
    logger.info(`Sent interview introduction to user ${from}`);
  } catch (error) {
    logger.error(`Error handling job position: ${error.message}`);
    await bot.sendMessage(from, 'Lo siento, hubo un error al procesar tu respuesta. Por favor, intenta nuevamente.');
    throw error;
  }
};

const handleImage = async (from, image) => {
  try {
    logger.info(`Received image from user ${from}: ${JSON.stringify(image, null, 2)}`);

    // Obtener la sesión del usuario
    const session = await sessionService.getOrCreateSession(from);
    logger.info(`User session state when receiving image: ${session.state}`);

    // Verificar estado para determinar qué hacer con la imagen
    if (session.state === 'waiting_payment_screenshot') {
      // Procesar captura de pantalla para pago de premium
      logger.info(`Processing payment screenshot for user ${from}`);
      await verifyPaymentScreenshot(from, image);
    } else if (session.state === 'waiting_advisor_payment_screenshot') {
      // Procesar captura de pantalla para pago de asesoría
      logger.info(`Processing advisor payment screenshot for user ${from}`);
      await verifyAdvisorPaymentScreenshot(from, image);
    } else {
      // Para debugging: mostrar el estado actual
      logger.info(`Image received but user ${from} is not in payment verification flow. Current state: ${session.state}`);

      // Si estamos en estado de confirmación de pago, asumimos que la imagen es un comprobante
      if (session.state === 'confirming_payment') {
        logger.info(`User ${from} is in confirming_payment state, treating image as payment screenshot`);
        // Actualizar el estado a waiting_payment_screenshot
        await sessionService.updateSessionState(from, 'waiting_payment_screenshot');
        // Procesar la imagen como comprobante de pago
        await verifyPaymentScreenshot(from, image);
      } else if (session.state === 'confirming_advisor_payment') {
        logger.info(`User ${from} is in confirming_advisor_payment state, treating image as advisor payment screenshot`);
        // Actualizar el estado a waiting_advisor_payment_screenshot
        await sessionService.updateSessionState(from, 'waiting_advisor_payment_screenshot');
        // Procesar la imagen como comprobante de pago de asesoría
        await verifyAdvisorPaymentScreenshot(from, image);
      } else {
        // No estamos esperando una imagen específica, informar al usuario
        await bot.sendMessage(from, 'Gracias por la imagen. Por favor, envía !start si deseas comenzar a usar el bot o !help para obtener ayuda.');
      }
    }
  } catch (error) {
    logger.error(`Error handling image: ${error.message}`);
    await bot.sendMessage(from, 'Lo siento, hubo un error al procesar tu imagen. Por favor, intenta nuevamente.');
  }
};

const handleAudio = async (from, audio) => {
  try {
    // Obtener sesión del usuario
    const session = await sessionService.getOrCreateSession(from);

    if (session.state !== sessionService.SessionState.QUESTION_ASKED) {
      await bot.sendMessage(from, 'Por favor, espera a que te haga una pregunta antes de enviar una respuesta de audio.');
      return;
    }

    // Enviar mensaje de procesamiento
    await bot.sendMessage(from, 'Estoy procesando tu respuesta. Esto puede tomar unos momentos...');

    // Obtener URL del audio
    const audioUrl = await bot.getMediaUrl(audio.id);

    if (!audioUrl) {
      throw new Error('No se pudo obtener la URL del audio');
    }

    logger.info(`Audio URL obtenida: ${audioUrl}`);

    try {
      // Descargar el archivo de audio
      logger.info(`Descargando audio para usuario ${from}`);
      const audioBuffer = await fileProcessing.downloadFile(audioUrl);
      logger.info(`Audio descargado, tamaño: ${audioBuffer.length} bytes`);

      // Obtener la pregunta actual
      const currentQuestion = session.questions[session.currentQuestion];
      let transcription = null;
      let analysis = null;
      let errorOccurred = false;

      // Transcribir el audio con Whisper
      try {
        logger.info('Transcribiendo audio con Whisper...');
        transcription = await openaiUtil.transcribeAudio(audioBuffer, {
          language: "es",
          prompt: "Esta es una respuesta a una pregunta de entrevista de trabajo."
        });

        if (transcription) {
          logger.info(`Audio transcrito exitosamente: ${transcription.length} caracteres`);

          // Analizar la transcripción
          logger.info('Analizando respuesta de entrevista...');
          analysis = await openaiUtil.analyzeInterviewResponse(transcription, currentQuestion.question);
          logger.info('Análisis de respuesta completado');
        } else {
          errorOccurred = true;
          logger.error("Error al transcribir el audio");
        }
      } catch (transcriptError) {
        errorOccurred = true;
        logger.error(`Error durante la transcripción/análisis: ${transcriptError.message}`);
      }

      // Si hay un error o no se puede hacer análisis real, usar simulación
      if (errorOccurred || !analysis) {
        logger.info('Usando análisis simulado debido a error o falta de configuración');
        analysis = interviewService.generateMockInterviewAnalysis(currentQuestion);

        if (!transcription) {
          transcription = "Transcripción no disponible. Usando análisis simulado.";
        }
      }

      // Guardar respuesta y análisis
      const answer = {
        transcription: transcription,
        analysis: analysis,
        timestamp: new Date()
      };

      await sessionService.saveInterviewAnswer(from, answer);
      logger.info('Respuesta y análisis guardados en la sesión');

      // Enviar feedback
      const feedbackMessage = formatInterviewFeedback(analysis, currentQuestion);
      await bot.sendMessage(from, feedbackMessage);

      // Verificar si debemos seguir con más preguntas
      const updatedSession = await sessionService.getOrCreateSession(from);

      if (updatedSession.currentQuestion >= 3 || updatedSession.state === sessionService.SessionState.INTERVIEW_COMPLETED) {
        // Entrevista completada
        await sessionService.updateSessionState(from, sessionService.SessionState.INTERVIEW_COMPLETED);
        await showPostInterviewMenu(from);
      } else {
        // Preguntar si quiere continuar usando botones
        await bot.sendButtonMessage(
          from,
          '¿Quieres continuar con la siguiente pregunta? 🤔',
          [
            { id: 'continue_interview', text: '✅ Sí, continuar' },
            { id: 'stop_interview', text: '❌ Detener' }
          ],
          '🎯 Progreso de entrevista'
        );
      }
    } catch (processingError) {
      logger.error(`Error procesando audio: ${processingError.message}`);
      await bot.sendMessage(from, '😓 Lo siento, hubo un error al procesar tu respuesta. ¿Podrías intentar nuevamente? Asegúrate de que el audio/video sea claro. ¡Gracias por tu paciencia! 🙏');
    }
  } catch (error) {
    logger.error(`Error handling audio: ${error.message}`);
    await bot.sendMessage(from, 'Lo siento, hubo un error al procesar tu audio. Por favor, intenta nuevamente.');
    throw error;
  }
};

const handleVideo = async (from, video) => {
  try {
    // Obtener sesión del usuario
    const session = await sessionService.getOrCreateSession(from);

    if (session.state !== sessionService.SessionState.QUESTION_ASKED) {
      //await bot.sendMessage(from, 'Por favor, espera a que te haga una pregunta antes de enviar una respuesta en video.');
      return;
    }

    // Enviar mensaje de procesamiento
    await bot.sendMessage(from, 'Estoy procesando tu respuesta en video. Esto puede tomar unos momentos...');

    // Obtener URL del video
    const videoUrl = await bot.getMediaUrl(video.id);

    if (!videoUrl) {
      throw new Error('No se pudo obtener la URL del video');
    }

    logger.info(`Video URL obtenida: ${videoUrl}`);

    try {
      // Procesar el video y extraer el audio
      logger.info(`Procesando video para usuario ${from}`);
      const audioBuffer = await videoProcessing.processVideoFromUrl(videoUrl);
      logger.info(`Audio extraído del video, tamaño: ${audioBuffer.length} bytes`);

      // Obtener la pregunta actual
      const currentQuestion = session.questions[session.currentQuestion];
      let transcription = null;
      let analysis = null;
      let errorOccurred = false;

      // Transcribir el audio con Whisper
      try {
        logger.info('Transcribiendo audio con Whisper...');
        transcription = await openaiUtil.transcribeAudio(audioBuffer, {
          language: "es",
          prompt: "Esta es una respuesta a una pregunta de entrevista de trabajo."
        });

        if (transcription) {
          logger.info(`Audio transcrito exitosamente: ${transcription.length} caracteres`);

          // Analizar la transcripción
          logger.info('Analizando respuesta de entrevista...');
          analysis = await openaiUtil.analyzeInterviewResponse(transcription, currentQuestion.question);
          logger.info('Análisis de respuesta completado');
        } else {
          errorOccurred = true;
          logger.error("Error al transcribir el audio");
        }
      } catch (transcriptError) {
        errorOccurred = true;
        logger.error(`Error durante la transcripción/análisis: ${transcriptError.message}`);
      }

      // Si hay un error o no se puede hacer análisis real, usar simulación
      if (errorOccurred || !analysis) {
        logger.info('Usando análisis simulado debido a error o falta de configuración');
        analysis = interviewService.generateMockInterviewAnalysis(currentQuestion);

        if (!transcription) {
          transcription = "Transcripción no disponible. Usando análisis simulado.";
        }
      }

      // Guardar respuesta y análisis
      const answer = {
        transcription: transcription,
        analysis: analysis,
        timestamp: new Date()
      };

      await sessionService.saveInterviewAnswer(from, answer);
      logger.info('Respuesta y análisis guardados en la sesión');

      // Enviar feedback
      const feedbackMessage = formatInterviewFeedback(analysis, currentQuestion);
      await bot.sendMessage(from, feedbackMessage);

      // Verificar si debemos seguir con más preguntas
      const updatedSession = await sessionService.getOrCreateSession(from);

      if (updatedSession.currentQuestion >= 3 || updatedSession.state === sessionService.SessionState.INTERVIEW_COMPLETED) {
        // Entrevista completada
        await sessionService.updateSessionState(from, sessionService.SessionState.INTERVIEW_COMPLETED);
        await showPostInterviewMenu(from);
      } else {
        // Preguntar si quiere continuar usando botones
        await bot.sendButtonMessage(
          from,
          '¿Quieres continuar con la siguiente pregunta? 🤔',
          [
            { id: 'continue_interview', text: '✅ Sí, continuar' },
            { id: 'stop_interview', text: '❌ Detener' }
          ],
          '🎯 Progreso de entrevista'
        );
      }
    } catch (processingError) {
      logger.error(`Error procesando video: ${processingError.message}`);
      await bot.sendMessage(from, 'Lo siento, hubo un error al procesar tu video. Por favor, intenta nuevamente.');
    }
  } catch (error) {
    logger.error(`Error handling video: ${error.message}`);
    await bot.sendMessage(from, 'Lo siento, hubo un error al procesar tu video. Por favor, intenta nuevamente.');
  }
};

const handleSimulatedAnswer = async (from, session) => {
  try {
    // Simular un análisis de respuesta
    const currentQuestion = session.questions[session.currentQuestion];
    const mockAnalysis = interviewService.generateMockInterviewAnalysis(currentQuestion);

    // Guardar respuesta y análisis
    const answer = {
      transcription: "Respuesta simulada para demostración",
      analysis: mockAnalysis,
      timestamp: new Date()
    };

    await sessionService.saveInterviewAnswer(from, answer);

    // Enviar feedback
    const feedbackMessage = formatInterviewFeedback(mockAnalysis, currentQuestion);
    await bot.sendMessage(from, feedbackMessage);

    // Verificar si debemos seguir con más preguntas
    const updatedSession = await sessionService.getOrCreateSession(from);

    if (updatedSession.state === sessionService.SessionState.INTERVIEW_COMPLETED) {
      // Entrevista completada
      await showPostInterviewMenu(from);
    } else {
      // Preguntar si quiere continuar usando botones
      await bot.sendButtonMessage(
        from,
        '¿Quieres continuar con la siguiente pregunta? 🤔',
        [
          { id: 'continue_interview', text: '✅ Sí, continuar' },
          { id: 'stop_interview', text: '❌ Detener' }
        ],
        '🎯 Progreso de entrevista'
      );
    }

  } catch (error) {
    logger.error(`Error in simulated answer: ${error.message}`);
    throw error;
  }
};

const handleUnknown = async (from) => {
  try {
    await bot.sendMessage(
      from,
      'Lo siento, no puedo procesar este tipo de mensaje. Por favor, envía tu CV como documento.'
    );
    logger.info(`Unknown message type received from user ${from}`);
  } catch (error) {
    logger.error(`Error handling unknown message type: ${error.message}`);
    throw error;
  }
};

const handleHelp = async (from) => {
  try {
    const helpText = `🤖 *Comandos disponibles:*

!start - Inicia o reinicia el bot
!help - Muestra esta lista de comandos
!reset - Elimina tu sesión actual y reinicia el bot
!url - Obtiene el enlace directo al último PDF de análisis de CV generado
!promo [código] - Activa una promoción especial (si aplica)

📄 *Para revisar tu CV:*
1. Elige "Revisar mi CV" en el menú principal
2. Envía tu CV como archivo PDF o Word
3. El bot analizará tu CV y generará un PDF personalizado con sugerencias

🎤 *Para simular una entrevista:*
1. Elige "Simular entrevista" en el menú principal
2. Proporciona el nombre del puesto al que estás aplicando
3. Responde las preguntas de la entrevista

Si necesitas ayuda adicional, escribe !help o contacta a nuestro equipo de soporte.`;

    await bot.sendMessage(from, helpText);
  } catch (error) {
    logger.error(`Error handling help command: ${error.message}`);
    await bot.sendMessage(from, 'Lo siento, hubo un error al mostrar la ayuda. Por favor, intenta nuevamente más tarde.');
  }
};

const handleInterview = async (from) => {
  try {
    // Obtener sesión del usuario
    const session = await sessionService.getOrCreateSession(from);

    // Obtener puesto de trabajo
    const jobPosition = session.jobPosition || 'software';

    // Preguntar al usuario si está listo para comenzar la entrevista
    try {
      const readyButtons = [
        { id: 'start_interview_now', text: 'Estoy listo' },
        { id: 'cancel_interview', text: 'Cancelar' }
      ];

      await bot.sendButtonMessage(
        from,
        `Vamos a comenzar una simulación de entrevista para el puesto de ${jobPosition}. Te haré 4 preguntas y deberás responder con mensajes de audio o video.`,
        readyButtons,
        '¿Estás listo para comenzar?'
      );

      // Actualizar estado para esperar confirmación
      await sessionService.updateSessionState(from, sessionService.SessionState.WAITING_INTERVIEW_CONFIRMATION);
      logger.info(`Asked user ${from} if ready to start interview`);
    } catch (buttonError) {
      logger.warn(`Failed to send button message, using text message instead: ${buttonError.message}`);
      await bot.sendMessage(from, `Vamos a comenzar una simulación de entrevista para el puesto de ${jobPosition}. Te haré 4 preguntas y deberás responder con mensajes de audio o video.`);
      await bot.sendMessage(from, '¿Estás listo para comenzar? Responde "sí" para iniciar la entrevista o "no" para cancelar.');
      await sessionService.updateSessionState(from, sessionService.SessionState.WAITING_INTERVIEW_CONFIRMATION);
    }
  } catch (error) {
    logger.error(`Error preparing interview: ${error.message}`);
    await bot.sendMessage(from, 'Lo siento, hubo un error al preparar la entrevista. Por favor, intenta nuevamente con !start.');
  }
};

/**
 * Inicia la primera pregunta de la entrevista
 * @param {string} from - ID del usuario
 * @returns {Promise<void>}
 */
const startInterviewQuestions = async (from) => {
  try {
    // Obtener sesión del usuario
    const session = await sessionService.getOrCreateSession(from);

    // Iniciar entrevista
    await sessionService.startInterview(from);

    // Obtener puesto de trabajo
    const jobPosition = session.jobPosition || 'software';

    // Para la primera pregunta, enfocarse en la experiencia y presentación
    const questionPrompt = `Pregunta inicial específica para alguien que aspira a un puesto de ${jobPosition} sobre experiencia profesional y trayectoria relevante para el puesto. Pregunta corta y directa como si fueras un entrevistador profesional.`;

    // Generar primera pregunta (con fallback a pregunta por defecto)
    let questionData;
    try {
      // Intentar usar OpenAI si está disponible
      if (openaiUtil.generateInterviewQuestion) {
        questionData = await openaiUtil.generateInterviewQuestion(jobPosition, questionPrompt);
      } else {
        // Si no está disponible la función, usar pregunta predefinida
        throw new Error("Función generateInterviewQuestion no disponible");
      }
    } catch (error) {
      logger.error(`Error generating interview question: ${error.message}`);
      // Usar preguntas predefinidas en caso de error
      questionData = interviewService.getDefaultQuestion(jobPosition);
      logger.info(`Using default question: ${questionData.question}`);
    }

    // Guardar pregunta en la sesión
    await sessionService.saveInterviewQuestion(from, questionData);

    // Formatear mensaje
    const questionMessage = `
*Pregunta 1 de 4:*

${questionData.question}

Por favor, responde con un mensaje de audio o video.
`;

    // Enviar pregunta
    await bot.sendMessage(from, questionMessage);
    logger.info(`Sent first interview question to user ${from}`);

    // Actualizar estado
    await sessionService.updateSessionState(from, sessionService.SessionState.QUESTION_ASKED);
  } catch (error) {
    logger.error(`Error starting interview: ${error.message}`);
    await bot.sendMessage(from, 'Lo siento, hubo un error al iniciar la entrevista. Por favor, intenta nuevamente con !start.');
  }
};

const formatAnalysisResults = (analysis) => {
  // Función para agregar emojis según categoría
  const getCategoryEmoji = (category) => {
    const emojis = {
      experience: '💼',
      education: '🎓',
      skills: '🔧',
      softSkills: '🤝',
      projects: '🚀',
      improvements: '📈',
      recommendations: '💡',
      alignment: '🎯'
    };
    return emojis[category] || '✨';
  };

  return `
✨ *ANÁLISIS DE TU CURRÍCULUM* ✨

📊 *Puntuación:* ${analysis.score}/100

📝 *Resumen Ejecutivo:*
${analysis.summary}

${getCategoryEmoji('experience')} *Experiencia Relevante:*
${analysis.experience.map(exp => `• ${exp}`).join('\n')}

${getCategoryEmoji('education')} *Formación Académica:*
${analysis.education.map(edu => `• ${edu}`).join('\n')}

${getCategoryEmoji('skills')} *Habilidades Técnicas:*
${analysis.skills.map(skill => `• ${skill}`).join('\n')}

${getCategoryEmoji('softSkills')} *Habilidades Blandas:*
${analysis.softSkills.map(skill => `• ${skill}`).join('\n')}

${getCategoryEmoji('projects')} *Proyectos Destacados:*
${analysis.projects.map(p => `• ${p}`).join('\n')}

${getCategoryEmoji('improvements')} *Oportunidades de Mejora:*
${analysis.improvements.map(i => `• ${i}`).join('\n')}

${getCategoryEmoji('recommendations')} *Recomendaciones Personalizadas:*
${analysis.recommendations.map(r => `• ${r}`).join('\n')}

${getCategoryEmoji('alignment')} *Análisis de Alineación con el Puesto:*
${analysis.alignment}

¡Ánimo! Con pequeños ajustes, tu CV puede tener un gran impacto. 💪
  `;
};

const formatInterviewFeedback = (feedback, question) => {
  // Obtener emoji para la calificación
  const getScoreEmoji = (score) => {
    if (score >= 9) return '🌟';
    if (score >= 7) return '✅';
    if (score >= 5) return '⚠️';
    return '❗';
  };

  const scoreEmoji = getScoreEmoji(feedback.score);

  return `
✨ *ANÁLISIS DE TU RESPUESTA* ✨

🎯 *Pregunta:* 
${question.question}

${scoreEmoji} *Calificación: ${feedback.score}/10*

📝 *Resumen:* 
${feedback.summary}

💪 *Fortalezas:*
${feedback.strengths.map(s => `• ✓ ${s}`).join('\n')}

🔍 *Oportunidades de mejora:*
${feedback.weaknesses.map(w => `• ${w}`).join('\n')}

💡 *Recomendaciones:*
${feedback.suggestions.map(s => `• 💡 ${s}`).join('\n')}

¡Sigue practicando, vas por buen camino! 🚀
  `;
};

/**
 * Genera y envía la siguiente pregunta de la entrevista
 * @param {string} from - ID del usuario
 * @returns {Promise<void>}
 */
const handleNextQuestion = async (from) => {
  try {
    // Obtener sesión del usuario
    const session = await sessionService.getOrCreateSession(from);

    // Verificar si ya se completaron todas las preguntas
    if (session.currentQuestion >= 3) {
      // Actualizar estado antes de mostrar el menú post-entrevista
      await sessionService.updateSessionState(from, sessionService.SessionState.INTERVIEW_COMPLETED);

      // Mostrar menú post-entrevista en lugar de solo un mensaje de felicitación
      await showPostInterviewMenu(from);
      return;
    }

    // Incrementar contador de preguntas
    const nextQuestionNumber = session.currentQuestion + 1;

    // Obtener puesto de trabajo
    const jobPosition = session.jobPosition || 'software';

    // Definir diferentes tipos de preguntas según el número de pregunta
    let questionType = jobPosition;
    let questionPrompt = '';

    switch (nextQuestionNumber) {
      case 1: // Segunda pregunta - enfoque en habilidades técnicas/profesionales
        questionPrompt = `Pregunta específica y desafiante para un puesto de ${jobPosition} sobre habilidades profesionales o conocimientos técnicos relevantes para este rol`;
        break;
      case 2: // Tercera pregunta - enfoque en trabajo en equipo o gestión
        questionPrompt = `Pregunta específica sobre trabajo en equipo, colaboración o gestión de proyectos para alguien en el puesto de ${jobPosition}`;
        break;
      case 3: // Cuarta pregunta - enfoque en resolución de problemas
        questionPrompt = `Pregunta sobre manejo de situaciones complejas, resolución de problemas o toma de decisiones para un profesional en ${jobPosition}`;
        break;
      default:
        questionPrompt = `Pregunta específica para un profesional en ${jobPosition} sobre habilidades, experiencia o conocimientos relevantes para este puesto`;
    }

    // Generar siguiente pregunta con el tipo específico
    let questionData;
    try {
      // Intentar usar OpenAI si la función está disponible
      if (openaiUtil.generateInterviewQuestion) {
        questionData = await openaiUtil.generateInterviewQuestion(questionType, questionPrompt);

        // Verificar que la pregunta no sea igual a las anteriores
        if (session.questions && session.questions.length > 0) {
          const previousQuestions = session.questions.map(q => q.question);
          let attempts = 0;

          // Si la pregunta es igual a alguna anterior, generar una nueva (máx 3 intentos)
          while (previousQuestions.includes(questionData.question) && attempts < 3) {
            logger.info(`Pregunta repetida detectada, generando nueva pregunta (intento ${attempts + 1})`);
            questionData = await openaiUtil.generateInterviewQuestion(questionType, questionPrompt + " (diferente a las preguntas anteriores)");
            attempts++;
          }
        }
      } else {
        // Si la función no está disponible, lanzar error para usar las predefinidas
        throw new Error("Función generateInterviewQuestion no disponible");
      }
    } catch (error) {
      logger.error(`Error generating next question: ${error.message}`);

      // Usar preguntas predefinidas específicas para Tech Lead en caso de error
      questionData = interviewService.getDefaultQuestion(jobPosition);
      logger.info(`Using default question: ${questionData.question}`);

      // Asegurarse de que no se repita la pregunta
      if (session.questions && session.questions.length > 0) {
        const previousQuestions = session.questions.map(q => q.question);
        let attempts = 0;

        // Intentar hasta 5 veces encontrar una pregunta no repetida
        while (previousQuestions.includes(questionData.question) && attempts < 5) {
          questionData = interviewService.getDefaultQuestion(jobPosition);
          attempts++;
        }
      }
    }

    // Guardar pregunta en la sesión
    await sessionService.saveInterviewQuestion(from, questionData);

    // Formatear mensaje
    const questionMessage = `
*Pregunta ${nextQuestionNumber + 1} de 4:*

${questionData.question}

Por favor, responde con un mensaje de audio o video.
`;

    // Enviar pregunta
    await bot.sendMessage(from, questionMessage);
    logger.info(`Sent question ${nextQuestionNumber + 1} to user ${from}: "${questionData.question}"`);

    // Actualizar estado
    await sessionService.updateSessionState(from, sessionService.SessionState.QUESTION_ASKED);
  } catch (error) {
    logger.error(`Error handling next question: ${error.message}`);
    await bot.sendMessage(from, 'Lo siento, hubo un error al generar la siguiente pregunta. Por favor, intenta nuevamente con !interview.');
  }
};

/**
 * Maneja la información sobre la versión premium
 * @param {string} from - Número de teléfono del usuario
 */
const handlePremiumInfo = async (from) => {
  try {
    // Primero enviar información sobre la revisión avanzada
    await bot.sendMessage(from, '*Mas reivisiones* 😊\n\n¡Excelente!');
    await bot.sendMessage(from, `Las revisiones incluyen:\n\n☑️ Análisis de gaps en el CV\n☑️ Fortalezas y debilidades\n☑️ Perfil profesional\n☑️ Experiencia de trabajo\n☑️ Verbos de acción\n☑️ Estructura del CV\n☑️ Relevancia\n☑️ Y más...`);
    await bot.sendMessage(from, `Puedes adquirir paquetes de revisiones desde S/ 4.00\n\nLas revisiones las puedes usar para tu CV u otros CVs.`);

    // Crear la estructura para el mensaje de lista de paquetes
    try {
      // Definir secciones con los paquetes disponibles
      const packageSections = [
        {
          title: "Paquetes",
          rows: [
            {
              id: "package_1",
              title: "1 Revisión",
              description: "S/ 4 – 1 revisión"
            },
            {
              id: "package_3",
              title: "3 Revisiones",
              description: "S/ 7 – 3 revisiones"
            },
            {
              id: "package_6",
              title: "6 Revisiones",
              description: "S/ 10 – 6 revisiones"
            },
            /* {
              id: "package_10",
              title: "10 Revisiones",
              description: "S/ 15 – 10 revisiones"
            } */
          ]
        }
      ];

      // Enviar mensaje con lista de paquetes
      await bot.sendListMessage(
        from,
        "Revisión Avanzada",
        "Selecciona el paquete que deseas adquirir para continuar con tu análisis de CV",
        "Paquetes",
        packageSections
      );

      // Añadir botón para regresar al menú principal
      await bot.sendButtonMessage(
        from,
        "¿No quieres comprar créditos ahora?",
        [{ id: "back_to_main_menu", text: "🔙 Regresar al menú principal" }],
        "Otras opciones"
      );

      // Actualizar estado para manejar selección de paquete
      await sessionService.updateSessionState(from, 'selecting_premium_package');

    } catch (listError) {
      logger.warn(`Failed to send list message: ${listError.message}`);

      // En lugar de enviar una versión de texto plano del mensaje y un botón separado,
      // enviar directamente los botones con opciones de paquetes
      const packageButtons = [
        { id: 'package_1', text: 'S/ 4 – 1 revisión' },
        { id: 'package_3', text: 'S/ 7 – 3 revisiones' },
        { id: 'package_6', text: 'S/ 10 – 6 revisiones' },
        { id: 'back_to_main_menu', text: '🔙 Regresar al menú' }
      ];

      await bot.sendButtonMessage(
        from,
        "Selecciona un paquete de revisiones:",
        packageButtons,
        "Paquetes disponibles"
      );

      // Actualizar estado de la sesión para manejar la selección
      await sessionService.updateSessionState(from, 'selecting_premium_package');
    }

  } catch (error) {
    logger.error(`Error handling premium info: ${error.message}`, { error });
    throw error;
  }
};

/**
 * Maneja la selección de un paquete premium
 * @param {string} from - Número de teléfono del usuario
 * @param {string} text - Texto del mensaje (selección del paquete)
 */
const handlePackageSelection = async (from, text) => {
  try {
    let packageName = '';
    let packagePrice = '';
    let packageReviews = '';

    // Determinar qué paquete seleccionó el usuario
    if (text.toLowerCase().includes('4') || text.toLowerCase().includes('1 revisión') || text.toLowerCase().includes('1 revision')) {
      packageName = '1 Revisión';
      packagePrice = 'S/4';
      packageReviews = '1';
    } else if (text.toLowerCase().includes('7') || text.toLowerCase().includes('3 revisiones')) {
      packageName = '3 Revisiones';
      packagePrice = 'S/7';
      packageReviews = '3';
    } else if (text.toLowerCase().includes('10') || text.toLowerCase().includes('6 revisiones')) {
      packageName = '6 Revisiones';
      packagePrice = 'S/10';
      packageReviews = '6';
    } else if (text.toLowerCase().includes('15') || text.toLowerCase().includes('10 revisiones')) {
      packageName = '10 Revisiones';
      packagePrice = 'S/15';
      packageReviews = '10';
    } else if (text.toLowerCase().includes('package_1')) {
      packageName = '1 Revisión';
      packagePrice = 'S/4';
      packageReviews = '1';
    } else if (text.toLowerCase().includes('package_3')) {
      packageName = '3 Revisiones';
      packagePrice = 'S/7';
      packageReviews = '3';
    } else if (text.toLowerCase().includes('package_6')) {
      packageName = '6 Revisiones';
      packagePrice = 'S/10';
      packageReviews = '6';
    } else if (text.toLowerCase().includes('package_10')) {
      packageName = '10 Revisiones';
      packagePrice = 'S/15';
      packageReviews = '10';
    } else {
      // Si no se reconoce el paquete, volver a mostrar las opciones sin mensaje de error
      await handlePremiumInfo(from);
      return;
    }

    // Guardar la selección del paquete en la sesión
    await sessionService.updateSession(from, {
      selectedPackage: packageName,
      packagePrice: packagePrice,
      packageReviews: packageReviews
    });

    // Enviar mensaje confirmando la selección y dando instrucciones de pago
    await bot.sendMessage(from, `*${packageReviews} Revisiones*\n${packageReviews} revisiones por ${packagePrice}`);

    await bot.sendMessage(from, `Yapea o Plinea ${packagePrice} a este número:\n954600805\n\nEstá a nombre de "Francesco Lucchesi"`);

    // Enviar opciones para confirmar el pago o volver atrás
    const paymentButtons = [
      { id: 'payment_confirmed', text: '¡Ya pagué!' },
      { id: 'payment_back', text: 'Volver atrás' }
    ];

    try {
      await bot.sendButtonMessage(
        from,
        `✅ Después de realizar el pago presiona el botón ¡Ya pagué!\n\n🔄 Si quieres cambiar tu paquete de créditos, presiona el botón Volver atrás`,
        paymentButtons,
        'Confirmación de pago'
      );

      // Actualizar estado para manejar la confirmación de pago
      await sessionService.updateSessionState(from, 'confirming_payment');

    } catch (buttonError) {
      logger.warn(`Failed to send payment confirmation buttons: ${buttonError.message}`);
      await bot.sendMessage(from, 'Después de realizar el pago, responde con "pagado". Si quieres cambiar tu paquete, responde con "volver".');
      await sessionService.updateSessionState(from, 'confirming_payment');
    }

  } catch (error) {
    logger.error(`Error handling package selection: ${error.message}`);
    // En lugar de mostrar un mensaje de error, volver a las opciones de paquetes
    await handlePremiumInfo(from);
  }
};

/**
 * Maneja la confirmación de pago
 * @param {string} from - Número de teléfono del usuario
 */
const handlePaymentConfirmation = async (from) => {
  try {
    const session = await sessionService.getOrCreateSession(from);
    const packageReviews = session.packageReviews || '1';
    const packagePrice = session.packagePrice || 'S/4';

    // Solicitar captura de pantalla del pago en lugar de confirmar automáticamente
    await bot.sendMessage(from, `✅ *Por favor, envía una captura de pantalla de tu pago de ${packagePrice}*\n\nNecesito verificar:\n• El Nro de operacion"\n• La fecha y hora`);

    // Actualizar el estado de la sesión para esperar la captura
    await sessionService.updateSessionState(from, 'waiting_payment_screenshot');

  } catch (error) {
    logger.error(`Error handling payment confirmation: ${error.message}`);
    await bot.sendMessage(from, 'Ocurrió un error al procesar tu confirmación. Por favor, contacta con nuestro soporte.');
  }
};

/**
 * Verifica la captura de pantalla del pago y acredita los créditos
 * @param {string} from - Número de teléfono del usuario
 * @param {Object} image - Objeto con la información de la imagen
 */
const verifyPaymentScreenshot = async (from, image) => {
  try {
    const session = await sessionService.getOrCreateSession(from);
    const packageReviews = session.packageReviews || '1';
    const packagePrice = session.packagePrice || 'S/4';

    logger.info(`Received payment screenshot from ${from} for ${packageReviews} reviews`);

    // Obtener la URL de la imagen
    let imageUrl;
    try {
      imageUrl = await bot.getMediaUrl(image.id);
      if (!imageUrl) {
        throw new Error('No se pudo obtener la URL de la imagen');
      }
      logger.info(`Payment image URL obtained: ${imageUrl}`);
    } catch (mediaError) {
      logger.error(`Error obtaining image URL: ${mediaError.message}`);
      await bot.sendMessage(from, 'No pudimos acceder a tu imagen. Por favor, intenta enviarla nuevamente.');
      return;
    }

    // Descargar la imagen
    let imageBuffer;
    try {
      imageBuffer = await fileProcessing.downloadFile(imageUrl);
      logger.info(`Payment image downloaded, size: ${imageBuffer.length} bytes`);
    } catch (downloadError) {
      logger.error(`Error downloading image: ${downloadError.message}`);
      await bot.sendMessage(from, 'Hubo un problema al descargar tu imagen. Por favor, intenta enviarla nuevamente.');
      return;
    }

    // Verificar la imagen utilizando OpenAI
    let isValidPayment = false;

    try {
      // Mensaje al usuario indicando que se está verificando el pago
      await bot.sendMessage(from, '⏳ Estamos verificando tu comprobante de pago...');

      // Convertir imagen a base64
      const imageBase64 = imageBuffer.toString('base64');

      // Consultar a OpenAI para verificar la imagen
      const systemPrompt = `Eres un asistente especializado en verificar comprobantes de pago. Necesitas verificar si la imagen es un comprobante de pago válido y contiene los siguientes elementos:
1. Debe ser un comprobante de pago de Yape, Plin o alguna otra billetera digital peruana
2. El pago debe ser a nombre de "Francesco Lucchesi" o similar
3. El monto debe ser ${packagePrice} soles
4. La fecha debe ser reciente (del mes actual o últimos 5 días)

Analiza cuidadosamente la fecha en el comprobante y extrae:
- Día (número)
- Mes (nombre o número)
- Año (número completo)

Responde con un JSON que tenga los siguientes campos:
- isValid: true/false según si la imagen cumple con todos los requisitos
- recipientName: nombre del destinatario que aparece en el comprobante (si está visible)
- amount: monto del pago (si está visible)
- date: fecha del pago en formato completo (si está visible)
- day: día del mes extraído (número)
- month: mes extraído (nombre o número)
- year: año extraído (número)
- reason: razón por la que es válido o inválido`;

      const userPrompt = `Verifica si esta imagen es un comprobante de pago válido de ${packagePrice} a Francesco Lucchesi o Francesco Lucchesi V. Se considera válido si el pago se realizó recientemente (este mes o en los últimos 5 días).`;

      // Llamar a la API de OpenAI para analizar la imagen
      const imageAnalysis = await openaiUtil.analyzeImage(imageBase64, systemPrompt, userPrompt);

      // Parsear la respuesta
      logger.info(`Payment image analysis: ${imageAnalysis}`);

      let analysisResult;
      try {
        // Buscar un JSON en la respuesta
        const jsonMatch = imageAnalysis.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysisResult = JSON.parse(jsonMatch[0]);
          logger.info(`Parsed analysis result: ${JSON.stringify(analysisResult)}`);
        } else {
          // Si no encuentra JSON, intentar extraer la validez de la respuesta
          logger.warn("No JSON found in OpenAI response, using text analysis fallback");
          isValidPayment = imageAnalysis.toLowerCase().includes('válido') ||
            imageAnalysis.toLowerCase().includes('valido') ||
            imageAnalysis.toLowerCase().includes('correcto') ||
            imageAnalysis.toLowerCase().includes('francesco lucchesi');

          // Crear un objeto con la información disponible
          analysisResult = {
            isValid: isValidPayment,
            reason: imageAnalysis
          };
        }
      } catch (parseError) {
        logger.error(`Error parsing analysis result: ${parseError.message}`);
        // Intentar determinar si es válido basado en el texto
        isValidPayment = imageAnalysis.toLowerCase().includes('válido') ||
          imageAnalysis.toLowerCase().includes('valido') ||
          imageAnalysis.toLowerCase().includes('correcto');

        analysisResult = {
          isValid: isValidPayment,
          reason: 'No se pudo analizar la respuesta en formato JSON'
        };
      }

      // Como fallback adicional, verificar si la imagen muestra los elementos críticos
      // incluso si OpenAI dijo que no era válido
      if (!analysisResult.isValid) {
        logger.info("Payment marked as invalid by OpenAI, checking for critical elements");

        // Verificar si la respuesta menciona los elementos críticos de forma positiva
        const hasCorrectName = analysisResult.recipientName &&
          analysisResult.recipientName.toLowerCase().includes('francesco');

        const hasCorrectAmount = analysisResult.amount &&
          analysisResult.amount.includes(packagePrice.replace('S/', ''));

        const isYapeOrPlin = imageAnalysis.toLowerCase().includes('yape') ||
          imageAnalysis.toLowerCase().includes('plin');

        // MODIFICACIÓN: Ya no verificamos la fecha, solo el nombre y el monto
        // Nombre: Francesco o Francesco Lucchesi
        // Monto: debe coincidir con el precio del paquete

        // Si tiene el nombre y monto correctos, considerarlo válido
        // Ya no verificamos la fecha ni la plataforma
        if ((hasCorrectName || imageAnalysis.toLowerCase().includes('francesco')) &&
          (hasCorrectAmount || imageAnalysis.toLowerCase().includes(packagePrice))) {
          logger.info("Critical elements found (name and amount), overriding OpenAI result to VALID");
          analysisResult.isValid = true;
          analysisResult.reason = "Pago verificado: contiene el nombre y monto correctos";
        }
      }

      isValidPayment = analysisResult.isValid;

      if (isValidPayment) {
        logger.info(`Payment validated successfully for user ${from}`);

        // Extraer el monto del precio (convertir 'S/4' a 4)
        const priceValue = parseFloat(packagePrice.replace('S/', ''));

        // Actualizar el contador de créditos del usuario
        await userService.addCVCredits(from, parseInt(packageReviews));

        // Registrar la transacción
        await userService.recordTransaction(
          from,
          priceValue,
          'cv_credits',
          `Compra de ${packageReviews} créditos para análisis de CV`
        );

        // Enviar confirmación de que el pago ha sido verificado
        await bot.sendMessage(from, `✅ *¡Pago verificado!*\n\nSe han añadido ${packageReviews} créditos a tu cuenta. Ya puedes analizar más CVs.`);

        // Restablecer el estado de CV procesado para permitir un nuevo análisis
        await sessionService.updateSession(from, { cvProcessed: false });

        // Ofrecer botones para elegir si revisar CV inmediatamente o ir al menú principal
        const postPaymentButtons = [
          { id: 'review_cv', text: '📋 Revisar mi CV' },
          { id: 'back_to_main_menu', text: '🏠 Ir al Menú' }
        ];

        try {
          await bot.sendButtonMessage(
            from,
            '¿Qué deseas hacer ahora? Puedes revisar tu CV en este momento o volver al menú principal para usar tus créditos más tarde.',
            postPaymentButtons,
            'Opciones después del pago'
          );

          // Actualizar el estado de la sesión a "payment_completed"
          await sessionService.updateSessionState(from, 'payment_completed');
        } catch (buttonError) {
          logger.warn(`Failed to send post-payment buttons: ${buttonError.message}`);
          // Si no se pueden enviar los botones, enviar mensaje normal
          await bot.sendMessage(from, 'Para usar tus créditos, simplemente envía el CV que deseas analizar o escribe !start para ir al menú principal.');
          await sessionService.updateSessionState(from, 'waiting_for_cv');
        }
      } else {
        // El pago no es válido
        logger.warn(`Invalid payment image from user ${from}: ${analysisResult.reason}`);

        // Informar al usuario por qué el pago fue rechazado
        let rejectionReason = "no pudimos verificar que cumpla con los requisitos";

        if (analysisResult.reason) {
          rejectionReason = analysisResult.reason;
        } else {
          // Intentar determinar la razón específica
          if (analysisResult.amount && analysisResult.amount !== packagePrice.replace('S/', '')) {
            rejectionReason = `el monto no coincide con el precio del paquete (${packagePrice})`;
          } else if (analysisResult.recipientName && !analysisResult.recipientName.toLowerCase().includes('francesco')) {
            rejectionReason = "el destinatario no parece ser Francesco Lucchesi";
          } else {
            rejectionReason = "no pudimos verificar claramente el pago";
          }
        }

        // Mensaje para el usuario
        await bot.sendMessage(from, `⚠️ *No pudimos verificar tu pago*\n\nMotivo: ${rejectionReason}\n\nPor favor, asegúrate de que:\n• El pago sea a Francesco Lucchesi\n• El monto sea de ${packagePrice}\n\nEnvía una nueva captura cuando lo hayas corregido.`);

        // Mantener al usuario en el mismo estado para que pueda volver a intentar
        await sessionService.updateSessionState(from, 'waiting_payment_screenshot');
      }
    } catch (aiError) {
      logger.error(`Error verifying payment with OpenAI: ${aiError.message}`);

      // Informar al usuario del error técnico
      await bot.sendMessage(from, "❌ Lo sentimos, tuvimos un problema técnico al verificar tu pago. Por favor, intenta nuevamente en unos minutos o contacta a soporte si el problema persiste.");

      // Mantener al usuario en el mismo estado para que pueda volver a intentar
      await sessionService.updateSessionState(from, 'waiting_payment_screenshot');
    }

  } catch (error) {
    logger.error(`Error verifying payment screenshot: ${error.message}`);
    await bot.sendMessage(from, 'Ocurrió un error al verificar tu pago. Por favor, contacta con nuestro soporte.');
  }
};

/**
 * Manejar la respuesta de un botón
 * @param {string} from - ID del usuario
 * @param {string} buttonId - ID del botón presionado
 * @returns {Promise<void>}
 */
const handleButtonReply = async (from, buttonId) => {
  logger.info(`Button reply received from user ${from}: ${buttonId}`);

  try {
    // Obtener el estado actual de la sesión
    const session = await sessionService.getOrCreateSession(from);
    const currentState = session.state;
    logger.info(`Session retrieved for user: ${from}, state: ${currentState}`);

    // Si el ID comienza con 'package_', redirigir a handlePackageSelection
    if (buttonId.startsWith('package_')) {
      logger.info(`Redirecting package selection from button handler: ${buttonId}`);
      await handlePackageSelection(from, buttonId);
      return;
    }

    // Manejar los diferentes botones según su ID
    switch (buttonId) {
      case 'review_cv':
        await handleMenuSelection(from, 'review_cv');
        break;
      case 'interview_simulation':
        await handleMenuSelection(from, 'interview_simulation');
        break;
      case 'back_to_main_menu':
        await sessionService.resetSession(from);
        await handleStart(from);
        break;
      case 'buy_credits':
        await handlePremiumInfo(from);
        break;
      case 'start_interview_now':
        await startInterviewQuestions(from);
        break;
      case 'cancel_interview':
        await sessionService.resetSession(from);
        await handleStart(from);
        break;
      case 'start_interview':
        await sessionService.updateSessionState(from, sessionService.SessionState.POSITION_RECEIVED);
        await handleInterview(from);
        break;
      case 'accept_terms':
        // Usuario acepta los términos y condiciones
        logger.info(`User ${from} accepted terms and conditions`);

        // En lugar de guardarlo en la sesión, simplemente mostramos el mensaje de bienvenida
        await showWelcomeMessage(from);
        break;
      case 'reject_terms':
        // Usuario rechaza los términos y condiciones
        logger.info(`User ${from} rejected terms and conditions`);

        // Informar al usuario que debe aceptar los términos para usar el servicio
        await bot.sendMessage(from, 'Para utilizar nuestros servicios es necesario aceptar los términos y condiciones. Sin esta aceptación, no podemos continuar.');

        // Volver a mostrar los términos y condiciones
        await handleTermsAndConditions(from);
        break;
      case 'continue_interview':
        await handleNextQuestion(from);
        break;
      case 'stop_interview':
        await bot.sendMessage(from, 'Has detenido la entrevista. Si deseas volver a intentarlo, envía !start para comenzar de nuevo.');
        await sessionService.resetSession(from);
        await handleStart(from);
        break;
      case 'personalized_advice':
        await handleAdvisorService(from);
        break;
      case 'accept_advisor':
        await bot.sendMessage(from, `Yapea o Plinea S/60 a este número:\n954600805\n\nEstá a nombre de "Francesco Lucchesi"`);

        const paymentButtons = [
          { id: 'advisor_payment_confirmed', text: '¡Ya pagué!' },
          { id: 'back_to_advisor', text: 'Volver atrás' }
        ];

        try {
          await bot.sendButtonMessage(
            from,
            `✅ Después de realizar el pago presiona el botón ¡Ya pagué!\n\n🔄 Si quieres cancelar, presiona el botón Volver atrás`,
            paymentButtons,
            'Confirmación de pago'
          );

          await sessionService.updateSessionState(from, 'confirming_advisor_payment');

        } catch (buttonError) {
          logger.warn(`Failed to send payment confirmation buttons: ${buttonError.message}`);
          await bot.sendMessage(from, 'Después de realizar el pago, responde con "pagado". Si quieres volver, responde con "volver".');
          await sessionService.updateSessionState(from, 'confirming_advisor_payment');
        }
        break;
      case 'advisor_cv_review':
      case 'advisor_interview':
        const advisorType = buttonId === 'advisor_cv_review' ? 'Revisión de CV' : 'Simulación de Entrevista';

        await sessionService.updateSession(from, {
          advisorType: advisorType
        });

        logger.info(`User ${from} selected advisor type: ${advisorType}`);

        const serviceDescription = buttonId === 'advisor_cv_review'
          ? '• Evaluación profesional de tu CV\n• Recomendaciones para estructura y contenido\n• Consejos para destacar tus logros\n• Corrección de errores comunes'
          : '• Práctica realista de entrevistas\n• Feedback detallado sobre tu desempeño\n• Consejos para responder preguntas difíciles\n• Técnicas para destacar tus habilidades';

        const advisorMessage = `
*🌟 ASESORÍA PERSONALIZADA EN ${advisorType.toUpperCase()} 🌟*

Conéctate con uno de nuestros especialistas en Recursos Humanos de élite que trabajan con las empresas más prestigiosas del mercado.

*✅ Este servicio incluye:*
${serviceDescription}

*💰 Inversión: S/60*

¿Deseas agendar esta asesoría personalizada?
`;

        const advisorButtons = [
          { id: 'accept_advisor', text: 'ACEPTAR' },
          { id: 'back_to_advisor', text: 'Regresar' }
        ];

        try {
          await bot.sendButtonMessage(
            from,
            advisorMessage,
            advisorButtons,
            'Asesoría Personalizada'
          );

          await sessionService.updateSessionState(from, 'advisor_service_selection');

        } catch (buttonError) {
          logger.warn(`Failed to send advisor service buttons: ${buttonError.message}`);

          await bot.sendMessage(from, `${advisorMessage}\n\nPara continuar, responde "ACEPTAR" o "REGRESAR".`);
          await sessionService.updateSessionState(from, 'advisor_service_selection');
        }
        break;
      case 'advisor_payment_confirmed':
        await handleAdvisorPaymentConfirmation(from);
        break;
      case 'back_to_advisor':
        await handleAdvisorService(from);
        break;
      case 'payment_back':
        logger.info(`User ${from} wants to go back to package selection`);
        await handlePremiumInfo(from);
        break;
      case 'payment_confirmed':
        logger.info(`User ${from} confirmed payment`);
        await handlePaymentConfirmation(from);
        break;
      case 'new_interview':
        await handleInterview(from);
        break;
      default:
        logger.warn(`Unrecognized button ID: ${buttonId}`);
        await bot.sendMessage(from, 'No reconocí esa opción. Por favor, envía !start para comenzar de nuevo.');
    }
  } catch (error) {
    logger.error(`Error handling button reply: ${error.message}`);
    //await bot.sendMessage(from, 'Lo siento, hubo un error al procesar tu selección. Por favor, intenta nuevamente.');
  }
};

/**
 * Muestra los botones de opciones después del análisis de CV
 * @param {string} from - Número de teléfono del usuario
 * @param {Object} analysis - Resultados del análisis (opcional)
 */
const sendPostCVOptions = async (from, analysis = null) => {
  try {
    // Verificar si el usuario ya ha analizado un CV antes
    const totalAnalysisCount = await userService.getCVAnalysisCount(from);
    const hasAnalyzedCVBefore = totalAnalysisCount > 1;
    logger.info(`Session retrieved for user: ${from}, state: ${await sessionService.getOrCreateSession(from).then(session => session.state)}`);

    // Definir las opciones del menú post-análisis
    let menuButtons = [
      { id: 'start_interview', text: '🎯 Simular entrevista' }
    ];

    // Para la opción de revisar CV, mostrar el mismo texto independientemente si ya ha analizado uno antes
    if (hasAnalyzedCVBefore) {
      menuButtons.push({ id: 'premium_required', text: '📋 Revisar CV' });
    } else {
      menuButtons.push({ id: 'review_cv_again', text: '📋 Revisar CV' });
    }

    // Agregar la opción de regresar al menú principal
    menuButtons.push({ id: 'back_to_main_menu', text: '🔙 Regresar al menú' });

    // Actualizar estado de la sesión para manejar correctamente la respuesta
    await sessionService.updateSessionState(from, 'post_cv_options');

    try {
      // Comentamos el mensaje con los botones principales
      /* 
      await bot.sendButtonMessage(
        from,
        '¿Qué te gustaría hacer ahora?',
        menuButtons,
        'Opciones disponibles:'
      );
      logger.info(`Post-CV analysis options sent to user ${from}`);
      */

      // Enviar mensaje adicional ofreciendo asesoría personalizada
      const advisorButtons = [
        { id: 'advisor_cv_review', text: '✅ ACEPTAR' },
        { id: 'back_to_main_menu', text: '🔙 Regresar al menú' }
      ];

      try {
        await bot.sendButtonMessage(
          from,
          '¿Quieres que un especialista en RRHH revise detalladamente tu CV? Recibe asesoría personalizada para destacar en procesos de selección.',
          advisorButtons,
          'Asesoría Profesional CV'
        );
      } catch (advisorButtonError) {
        logger.warn(`Failed to send advisor button: ${advisorButtonError.message}`);
        // Enviar mensaje de texto alternativo si falla el envío de botones
        await bot.sendTextMessage(
          from,
          '¿Quieres que un especialista en RRHH revise detalladamente tu CV?\n\nResponde "asesoría cv" para recibir asesoría personalizada o "regresar" para volver al menú principal.'
        );
      }

    } catch (buttonError) {
      logger.warn(`Failed to send button message, using text message instead: ${buttonError.message}`);
      await bot.sendMessage(from, 'Lo siento, hubo un error al enviar las opciones de post-análisis. Por favor, intenta nuevamente.');
    }
  } catch (error) {
    logger.error(`Error sending post-CV options: ${error.message}`);
    await bot.sendMessage(from, 'Lo siento, hubo un error al enviar las opciones de post-análisis. Por favor, intenta nuevamente.');
  }
};

// Función para mostrar menú después de completar la entrevista
const showPostInterviewMenu = async (from) => {
  try {
    logger.info(`Showing post-interview menu to user ${from}`);

    // Mensaje de felicitación por completar la entrevista
    const congratsMessage = `
🎉 *¡FELICIDADES!* 🎉

Has completado todas las preguntas de la entrevista. ¡Excelente trabajo! 👏

✨ Espero que el feedback te haya sido útil para mejorar tus habilidades en entrevistas.
    `;

    // Primero enviamos el mensaje de felicitación
    await bot.sendMessage(from, congratsMessage);

    // Esperamos un segundo antes de enviar los botones para evitar límites de velocidad
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Actualizar estado de la sesión
    await sessionService.updateSessionState(from, 'post_interview_menu');

    // Definir botones para el menú post-entrevista
    const menuButtons = [
      { id: 'review_cv', text: '📋 Revisar CV' },
      { id: 'new_interview', text: '🎯 Nueva Entrevista' },
      { id: 'back_to_main_menu', text: '🔙 Regresar al menú' }
    ];

    // Comentamos el mensaje con los botones principales
    /*
    // Enviar mensaje con botones interactivos
    await bot.sendButtonMessage(
      from,
      '¿Qué te gustaría hacer ahora?',
      menuButtons,
      'Opciones disponibles:'
    );
    logger.info(`Post-interview menu sent to user ${from}`);
    */

    // Enviar mensaje adicional ofreciendo asesoría personalizada para entrevistas
    const advisorButtons = [
      { id: 'advisor_interview', text: '✅ ACEPTAR' },
      { id: 'back_to_main_menu', text: '🔙 Regresar al menú' }
    ];

    try {
      await bot.sendButtonMessage(
        from,
        '¿Quieres mejorar tus habilidades para entrevistas con un especialista en RRHH? Recibe asesoría personalizada para destacar en tus próximas entrevistas laborales.',
        advisorButtons,
        'Asesoría Profesional Entrevistas'
      );
    } catch (advisorButtonError) {
      logger.warn(`Failed to send advisor button: ${advisorButtonError.message}`);
      // Enviar mensaje de texto alternativo si falla el envío de botones
      await bot.sendTextMessage(
        from,
        '¿Quieres mejorar tus habilidades para entrevistas con un especialista en RRHH?\n\nResponde "asesoría entrevista" para recibir asesoría personalizada o "regresar" para volver al menú principal.'
      );
    }

  } catch (error) {
    logger.error(`Error sending post-interview menu: ${error.message}`);
    // Mensaje de texto alternativo si falla
    await bot.sendTextMessage(
      from,
      'Lo siento, hubo un error al enviar las opciones después de la entrevista. Por favor, intenta nuevamente.\n\nPuedes escribir "revisar" para analizar tu CV, "entrevista" para una nueva simulación o "!start" para regresar al menú principal.'
    );
  }
};

/**
 * Maneja la solicitud de servicio de asesoría personalizada
 * @param {string} from - ID del usuario
 * @returns {Promise<void>}
 */
const handleAdvisorService = async (from) => {
  try {
    logger.info(`User ${from} requested advisor service`);

    // Preguntar primero qué tipo de asesoría desea
    try {
      const advisorTypeButtons = [
        { id: 'advisor_cv_review', text: 'Asesoria CV' },
        { id: 'advisor_interview', text: 'Asesoria Entrevista' }
      ];

      await bot.sendButtonMessage(
        from,
        '¿Qué tipo de asesoría personalizada te gustaría recibir?',
        advisorTypeButtons,
        'Selecciona una opción:'
      );

      // Actualizar estado para manejar la selección del tipo de asesoría
      await sessionService.updateSessionState(from, 'selecting_advisor_type');

    } catch (buttonError) {
      logger.warn(`Failed to send advisor type buttons: ${buttonError.message}`);
      await bot.sendMessage(from, 'Por favor, responde si deseas una asesoría para "Revisar CV" o "Simular Entrevista".');
      await sessionService.updateSessionState(from, 'selecting_advisor_type');
    }
  } catch (error) {
    logger.error(`Error handling advisor service: ${error.message}`);
    await bot.sendMessage(from, 'Lo siento, hubo un error al procesar tu solicitud. Por favor, intenta nuevamente con !start.');
  }
};

/**
 * Maneja la confirmación de pago para asesoría personalizada
 * @param {string} from - ID del usuario
 */
const handleAdvisorPaymentConfirmation = async (from) => {
  try {
    // Solicitar captura de pantalla del pago
    await bot.sendMessage(from, `✅ *Por favor, envía una captura de pantalla de tu pago de S/60*\n\nNecesito verificar:\n• El nro de operacion"\n• La fecha y hora sea reciente`);

    // Actualizar el estado de la sesión para esperar la captura
    await sessionService.updateSessionState(from, 'waiting_advisor_payment_screenshot');

  } catch (error) {
    logger.error(`Error handling advisor payment confirmation: ${error.message}`);
    await bot.sendMessage(from, 'Ocurrió un error al procesar tu confirmación. Por favor, contacta con nuestro soporte.');
  }
};

/**
 * Verifica la captura de pantalla del pago de asesoría y proporciona el enlace de Calendly
 * @param {string} from - ID del usuario
 * @param {Object} image - Objeto con la información de la imagen
 */
const verifyAdvisorPaymentScreenshot = async (from, image) => {
  try {
    logger.info(`Received advisor payment screenshot from ${from}`);

    // Obtener la URL de la imagen
    let imageUrl;
    try {
      imageUrl = await bot.getMediaUrl(image.id);
      if (!imageUrl) {
        throw new Error('No se pudo obtener la URL de la imagen');
      }
      logger.info(`Advisor payment image URL obtained: ${imageUrl}`);
    } catch (mediaError) {
      logger.error(`Error obtaining image URL: ${mediaError.message}`);
      await bot.sendMessage(from, 'No pudimos acceder a tu imagen. Por favor, intenta enviarla nuevamente.');
      return;
    }

    // Descargar la imagen
    let imageBuffer;
    try {
      imageBuffer = await fileProcessing.downloadFile(imageUrl);
      logger.info(`Advisor payment image downloaded, size: ${imageBuffer.length} bytes`);
    } catch (downloadError) {
      logger.error(`Error downloading payment image: ${downloadError.message}`);
      await bot.sendMessage(from, 'Hubo un error al procesar tu imagen. Por favor, intenta nuevamente.');
      return;
    }

    // Notificar al usuario que estamos procesando su pago
    await bot.sendMessage(from, '⏳ Estamos verificando tu comprobante de pago...');

    // Obtener el tipo de asesoría seleccionada
    const session = await sessionService.getOrCreateSession(from);
    const advisorType = session.advisorType || 'Personalizada';

    // Implementar verificación con OpenAI Vision
    let isValidPayment = false;

    try {
      // Convertir imagen a base64
      const imageBase64 = imageBuffer.toString('base64');

      // Consultar a OpenAI para verificar la imagen
      const systemPrompt = `Eres un asistente especializado en verificar comprobantes de pago. Necesitas verificar si la imagen es un comprobante de pago válido y contiene los siguientes elementos:
1. Debe ser un comprobante de pago de Yape, Plin o alguna otra billetera digital peruana
2. El pago debe ser a nombre de "Francesco Lucchesi" o similar
3. El monto debe ser S/60 soles

Responde con un JSON que tenga los siguientes campos:
- isValid: true si el nombre y monto son correctos, false en caso contrario
- recipientName: nombre del destinatario que aparece en el comprobante (si está visible)
- amount: monto del pago (si está visible)
- reason: razón por la que es válido o inválido (enfocándose en nombre y monto)`;

      const userPrompt = `Verifica si esta imagen es un comprobante de pago válido de S/60 a Francesco Lucchesi o Francesco Lucchesi V. Ignora la fecha del comprobante, solo valida el nombre y el monto.`;

      // Llamar a la API de OpenAI para analizar la imagen
      const imageAnalysis = await openaiUtil.analyzeImage(imageBase64, systemPrompt, userPrompt);

      // Parsear la respuesta
      logger.info(`Advisor payment image analysis: ${imageAnalysis}`);

      let analysisResult;
      try {
        // Buscar un JSON en la respuesta
        const jsonMatch = imageAnalysis.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysisResult = JSON.parse(jsonMatch[0]);
          logger.info(`Parsed advisor analysis result: ${JSON.stringify(analysisResult)}`);
        } else {
          // Si no encuentra JSON, intentar extraer la validez de la respuesta
          logger.warn("No JSON found in OpenAI response, using text analysis fallback");
          isValidPayment = imageAnalysis.toLowerCase().includes('válido') ||
            imageAnalysis.toLowerCase().includes('valido') ||
            imageAnalysis.toLowerCase().includes('correcto') ||
            imageAnalysis.toLowerCase().includes('francesco lucchesi');

          // Crear un objeto con la información disponible
          analysisResult = {
            isValid: isValidPayment,
            reason: imageAnalysis
          };
        }
      } catch (parseError) {
        logger.error(`Error parsing OpenAI response: ${parseError.message}`);
        // Si hay error al parsear, intentar extraer la validez del texto
        isValidPayment = imageAnalysis.toLowerCase().includes('válido') ||
          imageAnalysis.toLowerCase().includes('valido') ||
          imageAnalysis.toLowerCase().includes('correcto') ||
          imageAnalysis.toLowerCase().includes('francesco lucchesi');

        analysisResult = {
          isValid: isValidPayment,
          reason: "Pago verificado: contiene el nombre y monto correctos"
        };
      }

      // Verificar si el pago es válido
      isValidPayment = analysisResult.isValid;

      if (isValidPayment) {
        logger.info(`Advisor payment validated successfully for user ${from}`);

        // Actualizar el estado de la sesión
        await sessionService.updateSession(from, {
          advisorPaymentVerified: true,
          advisorPaymentDate: new Date().toISOString()
        });

        // Enviar confirmación de que el pago ha sido verificado
        await bot.sendMessage(from, `✅ *¡Pago verificado!*\n\nTu pago de S/60 por la asesoría ${advisorType} ha sido confirmado. \n Gracias por adquirir nuestra asesoría Simulación de Entrevista.

📅 Agenda tu cita ahora mismo en este enlace:
https://calendly.com/psicologa-workin2/30min

👆 Haz clic en el enlace para elegir la fecha y hora que mejor se adapte a tu disponibilidad.

Si tienes alguna duda, no dudes en escribirnos.`);

        // Enviar opciones post-pago
        const postPaymentButtons = [
          { id: 'back_to_main_menu', text: '🏠 Volver al menú' }
        ];

        try {
          await bot.sendButtonMessage(
            from,
            '¿Qué te gustaría hacer ahora?',
            postPaymentButtons,
            'Opciones después del pago'
          );
        } catch (buttonError) {
          logger.warn(`Failed to send post-payment buttons: ${buttonError.message}`);
          await bot.sendMessage(from, 'Escribe *!menu* para volver al menú principal.');
        }

        // Actualizar el estado de la sesión
        await sessionService.updateSessionState(from, 'advisor_payment_completed');

      } else {
        // El pago no es válido
        logger.warn(`Invalid advisor payment image from user ${from}: ${analysisResult.reason}`);

        // Determinar la razón del rechazo
        let rejectionReason = analysisResult.reason || "no pudimos verificar claramente el pago";

        // Informar al usuario por qué el pago fue rechazado
        await bot.sendMessage(from, `⚠️ *No pudimos verificar tu pago*\n\nPor favor, asegúrate de que:\n• El Nro de operacion sea correcto\n\n *Envía una nueva captura cuando lo hayas corregido.*`);
      }

    } catch (error) {
      logger.error(`Error verifying advisor payment: ${error.message}`);
      await bot.sendMessage(from, 'Hubo un error al verificar tu pago. Por favor, intenta enviar la imagen nuevamente.');
    }
  } catch (error) {
    logger.error(`Error in advisor payment verification: ${error.message}`);
    await bot.sendMessage(from, 'Lo siento, hubo un error al procesar tu pago. Por favor, intenta nuevamente más tarde.');
  }
};

/**
 * Muestra pantalla de términos y condiciones con botones para aceptar o rechazar
 * @param {string} from - ID del usuario
 * @returns {Promise<void>}
 */
const handleTermsAndConditions = async (from) => {
  try {
    logger.info(`Showing terms and conditions for user ${from}`);

    // Mensaje de términos y condiciones
    const termsMessage = `
Bienvenido a Worky✨

Antes de continuar, revisa los siguientes enlaces:

Términos y condiciones: https://www.workin2.com/terminos

Privacidad: https://www.workin2.com/privacidad

Al continuar, aceptas nuestros términos, nuestra política de privacidad.
    `;

    // Intentar enviar los botones interactivos
    const termsButtons = [
      { id: 'accept_terms', text: 'Acepto' },
      { id: 'reject_terms', text: 'No acepto' }
    ];

    try {
      // Usar el formato correcto de botones interactivos - sin headerText para usar el footer en su lugar
      await bot.sendButtonMessage(
        from,
        termsMessage,
        termsButtons
      );
    } catch (buttonError) {
      logger.error(`Error sending terms buttons: ${buttonError.message}`);
      // Fallback a mensaje de texto si fallan los botones
      await bot.sendMessage(from, `${termsMessage}\n\nPor favor, responde "Sí" para aceptar o "No" para rechazar los términos y condiciones.`);
    }

    // Actualizar el estado para manejar la respuesta
    await sessionService.updateSessionState(from, 'terms_acceptance');
    logger.info(`Terms and conditions sent to user ${from}`);
  } catch (error) {
    logger.error(`Error showing terms and conditions: ${error.message}`);
    // En caso de error, mostrar directamente el mensaje de bienvenida como fallback
    await showWelcomeMessage(from);
  }
};

/**
 * Muestra el mensaje de bienvenida con las opciones principales
 * @param {string} from - ID del usuario
 * @returns {Promise<void>}
 */
const showWelcomeMessage = async (from) => {
  try {
    // Mensaje de bienvenida mejorado con emojis y estilo más personal
    const welcomeMessage = `
¡Hola! 👋 Soy tu asistente virtual de *MyWorkIn* 🤖

Estoy aquí para ayudarte a destacar en tu búsqueda de empleo:

🔍 *Análisis de CV personalizado*
💼 *Simulación de entrevistas*
👨‍💼 *Asesoría laboral con psicólogos por videollamada*

¿Cómo te gustaría que te ayude hoy?
    `;

    // Intentar enviar botones para una mejor experiencia
    try {
      const menuButtons = [
        { id: 'review_cv', text: '📋 Revisar mi CV' },
        { id: 'interview_simulation', text: '🎯 Simular entrevista' },
        { id: 'personalized_advice', text: '👨‍💼 Asesoría' }
      ];

      await bot.sendButtonMessage(
        from,
        welcomeMessage,
        menuButtons,
        ''
      );

      await sessionService.updateSessionState(from, sessionService.SessionState.INITIAL);
    } catch (buttonError) {
      logger.warn(`Failed to send button message, using text fallback: ${buttonError.message}`);

      // Mensaje de texto alternativo si fallan los botones
      await bot.sendMessage(from, `${welcomeMessage}\n\nEnvía tu CV como documento para comenzar con el análisis o escribe *!interview* para simular una entrevista.`);
      await sessionService.updateSessionState(from, sessionService.SessionState.INITIAL);
    }
  } catch (error) {
    logger.error(`Error showing welcome message: ${error.message}`);
    await bot.sendMessage(from, '😓 Lo siento, ha ocurrido un error. Por favor, intenta nuevamente enviando *!start*.');
  }
};

// Exportar todas las funciones necesarias
module.exports = {
  handleStart,
  handleDocument,
  handleText,
  handleImage,
  handleAudio,
  handleVideo,
  handleUnknown,
  handleHelp,
  handleInterview,
  handleNextQuestion,
  handleMenuSelection,
  handlePremiumInfo,
  handlePackageSelection,
  handlePaymentConfirmation,
  verifyPaymentScreenshot,
  startInterviewQuestions,
  handleButtonReply,
  formatAnalysisResults,
  sendPostCVOptions,
  showPostInterviewMenu,
  handleAdvisorService,
  handleAdvisorPaymentConfirmation,
  verifyAdvisorPaymentScreenshot,
  handleTermsAndConditions
};
