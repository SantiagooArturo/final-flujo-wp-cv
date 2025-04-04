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
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const userService = require('../core/userService');

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
    
    // Mensaje de bienvenida mejorado con emojis y estilo más personal
    const welcomeMessage = `
¡Hola! 👋 Soy tu asistente virtual de *RevisaCV* 🤖✨

Estoy aquí para ayudarte a destacar en tu búsqueda de empleo:

🔍 *Análisis de CV personalizado*
💼 *Simulación de entrevistas*
💡 *Consejos profesionales*

¿Cómo te gustaría que te ayude hoy?
    `;
    
    // Intentar enviar botones para una mejor experiencia
    try {
      const menuButtons = [
        { id: 'review_cv', text: '📋 Revisar mi CV' },
        { id: 'interview_simulation', text: '🎯 Simular entrevista' }
      ];
      
      await bot.sendButtonMessage(
        from,
        welcomeMessage,
        menuButtons,
        '¡Bienvenido a RevisaCV!'
      );
      
      await sessionService.updateSessionState(from, sessionService.SessionState.INITIAL);
    } catch (buttonError) {
      logger.warn(`Failed to send button message, using text fallback: ${buttonError.message}`);
      
      // Mensaje de texto alternativo si fallan los botones
      await bot.sendMessage(from, `${welcomeMessage}\n\nEnvía tu CV como documento para comenzar con el análisis o escribe *!interview* para simular una entrevista.`);
      await sessionService.updateSessionState(from, sessionService.SessionState.INITIAL);
    }
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
    
    switch(selection) {
      case 'review_cv':
        // Verificar si ya realizó un análisis de CV anteriormente (usando userService)
        const shouldPay = await userService.shouldUserPayForCVAnalysis(from);
        
        if (shouldPay) {
          // Si ya analizó un CV anteriormente, mostrar mensaje de premium
          await handlePremiumInfo(from);
        } else {
          // Primero preguntar por el puesto al que aspira
          await bot.sendMessage(from, '¿A qué puesto aspiras? Por favor, describe brevemente el puesto y la industria.');
          // Crear un estado intermedio para indicar que estamos esperando el puesto antes del CV
          await sessionService.updateSessionState(from, 'waiting_for_position_before_cv');
          logger.info(`Asked for position before CV for user ${from}`);
        }
        break;
        
      case 'interview_simulation':
        // Para simulación de entrevista, primero necesitamos el CV para análisis
        const hasAnalyzedCV = await userService.hasUserAnalyzedCV(from);
        
        if (!hasAnalyzedCV) {
          await bot.sendMessage(from, 'Para simular una entrevista, primero necesito analizar tu CV. Por favor, envíalo como documento.');
          await sessionService.updateSessionState(from, 'waiting_for_cv');
          logger.info(`Interview simulation flow initiated for user ${from}`);
        } else {
          // Ya tiene un CV analizado, puede comenzar la entrevista
          await sessionService.updateSessionState(from, sessionService.SessionState.POSITION_RECEIVED);
          await handleInterview(from);
        }
        break;
        
      default:
        // Opción no reconocida, mostrar menú de nuevo
        const menuButtons = [
          { id: 'review_cv', text: 'Revisar mi CV' },
          { id: 'interview_simulation', text: 'Simular entrevista' }
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

    logger.info(`Getting document URL for ID: ${document.id}`);
    
    // Obtener URL del documento de WhatsApp
    const documentUrl = await bot.getDocumentUrl(document.id);
    
    if (!documentUrl) {
      logger.error('Document URL is null or empty');
      throw new Error('No se pudo obtener la URL del documento');
    }

    logger.info(`Document URL obtained: ${documentUrl}`);

    // Marcar el CV como procesado antes de comenzar el análisis
    await sessionService.updateSession(from, { cvProcessed: true });

    // Enviar mensaje de procesamiento
    await bot.sendMessage(from, '📄 *¡Gracias por compartir tu CV!* 🙏\n\nEstoy analizándolo detalladamente para ofrecerte retroalimentación valiosa. Este proceso puede tomar entre 1-2 minutos... ⏳');

    // Procesar el CV
    logger.info(`Processing CV for user ${from} with URL: ${documentUrl}`);
    
    // Verificar si tenemos información sobre el puesto
    const jobPosition = session.jobPosition || null;
    
    // Si tenemos un puesto, lo pasamos al servicio de procesamiento del CV
    let analysis;
    if (jobPosition) {
      logger.info(`Processing CV with job position: ${jobPosition}`);
      analysis = await cvService.processCV(documentUrl, from, jobPosition);
    } else {
      analysis = await cvService.processCV(documentUrl, from);
    }
    
    logger.info(`CV processing completed: ${JSON.stringify(analysis, null, 2)}`);

    // Guardar análisis en la sesión
    await sessionService.saveCVAnalysis(from, analysis);

    // Guardar el análisis actual como "previo" para futuras referencias
    // Importante: Esto debe hacerse ANTES de mostrar los botones de opciones
    await sessionService.updateSession(from, { 
      previousAnalysis: session.previousAnalysis ? [...session.previousAnalysis, analysis] : [analysis] 
    });

    // Registrar el análisis en el historial permanente de usuario
    await userService.recordCVAnalysis(from, analysis, jobPosition || 'No especificado');

    // Enviar mensaje de análisis completado, indicando que se está generando el PDF
    await bot.sendMessage(from, '✅ *¡Análisis completado!* 🎉\n\nHe revisado cuidadosamente tu CV y he preparado un informe detallado con todas mis observaciones. Estoy generando tu PDF personalizado...');
    
    // Generar PDF con el análisis
    try {
      logger.info('Generando PDF del análisis de CV');
      const candidateName = session.userName || 'Candidato';
      const pdfPath = await generateCVAnalysisPDF(analysis, jobPosition || 'No especificado', candidateName);
      logger.info(`PDF generado en: ${pdfPath}`);
      
      // Preparar la URL pública del PDF
      const baseUrl = process.env.PUBLIC_URL || `${process.env.HOST}:${process.env.PORT}`;
      const publicUrl = `${baseUrl}/pdf/${path.basename(pdfPath)}`;
      logger.info(`URL pública del PDF: ${publicUrl}`);
      
      // Enviar el documento PDF directamente por WhatsApp
      await bot.sendDocument(from, publicUrl, '📊 Análisis detallado de tu CV');
      
      // Enviar mensaje con las opciones después del documento
      await sendPostCVOptions(from, analysis);
    } catch (pdfError) {
      logger.error(`Error generating or sending PDF: ${pdfError.message}`);
      
      // Enviar mensaje de error y el análisis resumido en texto como fallback
      await bot.sendMessage(from, '⚠️ *Hubo un problema al generar el PDF* ⚠️\n\nTe envío el análisis en formato de texto:');
      await bot.sendMessage(from, formatAnalysisResults(analysis));
      
      // Mostrar botones de opciones post-CV
      await sendPostCVOptions(from, analysis);
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
        default:
          await bot.sendMessage(from, 'Comando no reconocido. Usa !help para ver los comandos disponibles.');
          return;
      }
    }
    
    // Manejar mensajes normales según el estado
    switch (session.state) {
      case 'initial':
        // Si el usuario está en estado inicial, mostrar el menú de opciones
        const menuButtons = [
          { id: 'review_cv', text: 'Revisar mi CV' },
          { id: 'interview_simulation', text: 'Simular entrevista' }
        ];
        
        await bot.sendButtonMessage(
          from,
          'Selecciona una opción para continuar:',
          menuButtons,
          '¿En qué puedo ayudarte hoy?'
        );
        await sessionService.updateSessionState(from, sessionService.SessionState.MENU_SELECTION);
        break;
      case sessionService.SessionState.MENU_SELECTION:
        // Intentar interpretar el texto como una opción del menú
        if (text.toLowerCase().includes('revisar') || text.toLowerCase().includes('cv')) {
          await handleMenuSelection(from, 'review_cv');
        } else if (text.toLowerCase().includes('simular') || text.toLowerCase().includes('entrevista')) {
          await handleMenuSelection(from, 'interview_simulation');
        } else {
          // Si no se reconoce la opción, mostrar el menú nuevamente
          const menuButtons = [
            { id: 'review_cv', text: 'Revisar mi CV' },
            { id: 'interview_simulation', text: 'Simular entrevista' }
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
            menuButtons.push({ id: 'premium_required', text: '✨ Premium' });
          } else {
            menuButtons.push({ id: 'review_cv_again', text: '📄 Otro CV' });
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
        await bot.sendMessage(from, `Gracias por indicar el puesto de ${text}. Ahora, por favor envía tu CV como documento para analizarlo en relación con este puesto.`);
        await sessionService.updateSessionState(from, 'waiting_for_cv');
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
    await bot.sendMessage(
      from,
      'Para un mejor análisis, por favor envía tu CV como documento en lugar de una imagen.'
    );
    logger.info(`Image received from user ${from}`);
  } catch (error) {
    logger.error(`Error handling image: ${error.message}`);
    throw error;
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
        await bot.sendMessage(from, `
🎉 *¡FELICIDADES!* 🎉

Has completado todas las preguntas de la entrevista. ¡Excelente trabajo! 👏

✨ Espero que el feedback te haya sido útil para mejorar tus habilidades en entrevistas.

🔄 Si deseas intentarlo de nuevo o probar con otras preguntas, envía *!reset* en cualquier momento.

¡Te deseo mucho éxito en tus entrevistas reales! 🚀
        `);
        await sessionService.updateSessionState(from, sessionService.SessionState.INTERVIEW_COMPLETED);
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
      await bot.sendMessage(from, 'Por favor, espera a que te haga una pregunta antes de enviar una respuesta en video.');
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
        await bot.sendMessage(from, `
🎉 *¡FELICIDADES!* 🎉

Has completado todas las preguntas de la entrevista. ¡Excelente trabajo! 👏

✨ Espero que el feedback te haya sido útil para mejorar tus habilidades en entrevistas.

🔄 Si deseas intentarlo de nuevo o probar con otras preguntas, envía *!reset* en cualquier momento.

¡Te deseo mucho éxito en tus entrevistas reales! 🚀
        `);
        await sessionService.updateSessionState(from, sessionService.SessionState.INTERVIEW_COMPLETED);
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
    throw error;
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
      await bot.sendMessage(from, `
🎉 *¡FELICIDADES!* 🎉

Has completado todas las preguntas de la entrevista. ¡Excelente trabajo! 👏

✨ Espero que el feedback te haya sido útil para mejorar tus habilidades en entrevistas.

🔄 Si deseas intentarlo de nuevo o probar con otras preguntas, envía *!reset* en cualquier momento.

¡Te deseo mucho éxito en tus entrevistas reales! 🚀
      `);
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
    const helpMessage = `
✨ *¡Hola! Aquí tienes todo lo que puedo hacer por ti* ✨

📌 *Comandos disponibles:*

�� *!start* - Iniciar el asistente
❓ *!help* - Ver esta guía de ayuda
🎯 *!interview* - Comenzar simulación de entrevista
🔄 *!reset* - Reiniciar todo el proceso

🌟 *Mis funcionalidades:*

📋 *Análisis de CV*
Envía tu currículum y te daré feedback profesional personalizado, identificando fortalezas y áreas de mejora.

🎤 *Simulación de entrevista*
Practica tus habilidades con preguntas reales y recibe retroalimentación detallada.

💡 *Consejos personalizados*
Recomendaciones específicas para mejorar tu perfil profesional.

¿Listo para comenzar? ¡Envía tu CV como documento y empecemos! 📤✨
    `;
    await bot.sendMessage(from, helpMessage);
  } catch (error) {
    logger.error(`Error handling help command: ${error.message}`);
    throw error;
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
    const questionPrompt = `Pregunta inicial específica para un Tech Lead en ${jobPosition} sobre experiencia en liderazgo técnico y trayectoria profesional relevante para el puesto`;
    
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
      await bot.sendMessage(from, `
🎉 *¡FELICIDADES!* 🎉

Has completado todas las preguntas de la entrevista. ¡Excelente trabajo! 👏

✨ Espero que el feedback te haya sido útil para mejorar tus habilidades en entrevistas.

🔄 Si deseas intentarlo de nuevo o probar con otras preguntas, envía *!reset* en cualquier momento.

¡Te deseo mucho éxito en tus entrevistas reales! 🚀
      `);
      await sessionService.updateSessionState(from, sessionService.SessionState.INTERVIEW_COMPLETED);
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
      case 1: // Segunda pregunta - enfoque en habilidades técnicas
        questionPrompt = `Pregunta técnica específica y desafiante para un Tech Lead en ${jobPosition} sobre diseño de arquitectura, decisiones técnicas estratégicas o gestión de sistemas complejos`;
        break;
      case 2: // Tercera pregunta - enfoque en liderazgo
        questionPrompt = `Pregunta específica sobre liderazgo técnico, gestión de equipos de desarrollo o resolución de conflictos técnicos para un Tech Lead en ${jobPosition}`;
        break;
      case 3: // Cuarta pregunta - enfoque en resolución de problemas
        questionPrompt = `Pregunta sobre manejo de situaciones complejas, escalado de problemas o toma de decisiones críticas para un Tech Lead en ${jobPosition}`;
        break;
      default:
        questionPrompt = `Pregunta específica para un Tech Lead en ${jobPosition} sobre habilidades de liderazgo técnico, arquitectura o gestión`;
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
    // Enviar información sobre la versión premium
    await bot.sendMessage(from, '¡Gracias por tu interés en nuestra versión premium! 🌟\n\nPara poder analizar múltiples CVs y acceder a todas nuestras funcionalidades avanzadas, te invitamos a adquirir nuestra suscripción premium.');
    await bot.sendMessage(from, 'Beneficios de la versión premium:\n• Análisis ilimitado de CVs\n• Comparación entre diferentes perfiles\n• Recomendaciones personalizadas avanzadas\n• Acceso a plantillas profesionales\n• Soporte prioritario 24/7');
    await bot.sendMessage(from, 'Para más información sobre precios y cómo obtener tu suscripción, visita: https://www.myworkin.com/premium');
    
    // Mostrar las opciones disponibles nuevamente
    setTimeout(async () => {
      try {
        // Actualizar estado antes de enviar los botones
        await sessionService.updateSessionState(from, 'post_cv_options');
        
        const menuButtons = [
          { id: 'start_interview', text: '🎯 Simular entrevista' },
          { id: 'premium_required', text: '✨ Premium' },
          { id: 'back_to_main_menu', text: '🔙 Regresar al menú' }
        ];
        
        try {
          await bot.sendButtonMessage(
            from,
            'Si quieres simular una entrevista dale a Simular entrevista, si quieres analizar más CVs dale a Premium',
            menuButtons,
            '¿Ahora cómo te ayudo?'
          );
        } catch (buttonError) {
          logger.warn(`Failed to send button message, using text message instead: ${buttonError.message}`);
          await bot.sendMessage(from, '¿Quieres simular una entrevista? Responde "sí" para comenzar. O escribe "premium" para más información sobre la versión premium para revisar más CVs.');
        }
      } catch (error) {
        logger.error(`Error showing options after premium info: ${error.message}`);
        await bot.sendMessage(from, '¿Quieres simular una entrevista? Responde "sí" para comenzar.');
      }
    }, 1000);
  } catch (error) {
    logger.error(`Error handling premium info: ${error.message}`, { error });
    throw error;
  }
};

/**
 * Manejar la respuesta de un botón
 * @param {string} from - ID del usuario
 * @param {string} buttonId - ID del botón presionado
 * @returns {Promise<void>}
 */
const handleButtonReply = async (from, buttonId) => {
  try {
    logger.info(`Button reply received from user ${from}: ${buttonId}`);
    const session = await sessionService.getOrCreateSession(from);
    
    switch (buttonId) {
      case 'review_cv':
      case 'interview_simulation':
        await handleMenuSelection(from, buttonId);
        break;
      case 'start_interview':
        await sessionService.updateSessionState(from, sessionService.SessionState.POSITION_RECEIVED);
        await handleInterview(from);
        break;
      case 'start_interview_now':
        // El usuario confirmó que está listo para iniciar la entrevista
        await startInterviewQuestions(from);
        break;
      case 'cancel_interview':
        // El usuario canceló la entrevista
        await bot.sendMessage(from, 'Entrevista cancelada. Si deseas volver a intentarlo, envía !start para comenzar de nuevo.');
        await sessionService.updateSessionState(from, sessionService.SessionState.INITIAL);
        break;
      case 'review_cv_again':
        // Verificar si ya ha analizado un CV usando el servicio de usuarios
        const shouldPay = await userService.shouldUserPayForCVAnalysis(from);
        
        if (shouldPay) {
          // Mostrar mensaje de versión premium si ya ha analizado un CV
          await handlePremiumInfo(from);
        } else {
          // Permitir analizar otro CV
          await sessionService.updateSession(from, { cvProcessed: false });
          await bot.sendMessage(from, 'Por favor, envía el nuevo CV que deseas analizar.');
          await sessionService.updateSessionState(from, 'waiting_for_cv');
        }
        break;
      case 'premium_required':
        await handlePremiumInfo(from);
        break;
      case 'continue_interview':
        // Manejar la continuación de la entrevista
        await handleNextQuestion(from);
        break;
      case 'stop_interview':
        // Manejar la finalización de la entrevista
        await bot.sendMessage(from, 'Entrevista finalizada. ¡Gracias por tu participación! Puedes iniciar un nuevo proceso con !reset');
        await sessionService.updateSessionState(from, sessionService.SessionState.INTERVIEW_COMPLETED);
        break;
      case 'back_to_main_menu':
        // Reiniciar el proceso completamente
        await sessionService.resetSession(from);
        await handleStart(from);
        break;
      default:
        logger.warn(`Unrecognized button ID: ${buttonId}`);
        await bot.sendMessage(from, 'Opción no reconocida. Por favor, intenta nuevamente.');
    }
  } catch (error) {
    logger.error(`Error handling button reply: ${error.message}`);
    await bot.sendMessage(from, 'Lo siento, hubo un error al procesar tu selección. Por favor, intenta nuevamente con !start.');
  }
};

/**
 * Muestra los botones de opciones después del análisis de CV
 * @param {string} from - Número de teléfono del usuario
 * @param {Object} analysis - Resultados del análisis (opcional)
 */
const sendPostCVOptions = async (from, analysis = null) => {
  try {
    // Obtener el historial permanente de análisis de CVs
    const totalAnalysisCount = await userService.getCVAnalysisCount(from);
    const hasAnalyzedCVBefore = totalAnalysisCount > 1;
    
    // Definir las opciones del menú post-análisis
    let menuButtons = [
      { id: 'start_interview', text: '🎯 Simular entrevista' }
    ];
    
    // Para la opción Premium o Otro CV, mostrar texto diferente si ya ha analizado uno antes
    if (hasAnalyzedCVBefore) {
      menuButtons.push({ id: 'premium_required', text: '✨ Premium' });
    } else {
      menuButtons.push({ id: 'review_cv_again', text: '📄 Otro CV' });
    }
    
    // Agregar la opción de regresar al menú principal
    menuButtons.push({ id: 'back_to_main_menu', text: '🔙 Regresar al menú' });
    
    // Actualizar estado de la sesión para manejar correctamente la respuesta
    await sessionService.updateSessionState(from, 'post_cv_options');
    
    try {
      // Enviar mensaje con botones interactivos
      await bot.sendButtonMessage(
        from,
        '¿Qué te gustaría hacer ahora?',
        menuButtons,
        'Opciones disponibles:'
      );
      logger.info(`Post-CV analysis options sent to user ${from}`);
    } catch (buttonError) {
      logger.warn(`Failed to send button message, using text message instead: ${buttonError.message}`);
      
      // Fallback a mensaje de texto si los botones fallan
      let optionsMessage = '¿Qué te gustaría hacer ahora?\n\n1. Simular entrevista (escribe "simular")\n';
      if (hasAnalyzedCVBefore) {
        optionsMessage += '2. Versión Premium (escribe "premium")\n';
      } else {
        optionsMessage += '2. Revisar otro CV (escribe "otro cv")\n';
      }
      optionsMessage += '3. Regresar al menú principal (escribe "!start")';
      
      await bot.sendMessage(from, optionsMessage);
    }
  } catch (error) {
    logger.error(`Error sending post-CV options: ${error.message}`);
    await bot.sendMessage(from, 'Puedes escribir "simular" para iniciar una simulación de entrevista o "!start" para reiniciar.');
  }
};

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
  startInterviewQuestions,
  handleButtonReply,
  formatAnalysisResults,
  sendPostCVOptions
}; 