const bot = require('./bot');
const logger = require('../utils/logger');
const cvService = require('../core/cvService');
const interviewService = require('../core/interviewService');
const sessionService = require('../core/sessionService');

const handleStart = async (from) => {
  try {
    // Registrar usuario
    await cvService.registerUser({
      id: from,
      phoneNumber: from,
      language: 'es'
    });

    // Inicializar o reiniciar sesión
    await sessionService.resetSession(from);

    // Enviar mensaje de bienvenida usando plantilla
    await bot.sendTemplate(from, 'saludo');
    logger.info(`Start command handled for user ${from}`);
  } catch (error) {
    logger.error(`Error handling start command: ${error.message}`);
    throw error;
  }
};

const handleDocument = async (from, document) => {
  try {
    // Obtener sesión del usuario
    const session = await sessionService.getOrCreateSession(from);
    
    // Enviar respuesta inicial
    await bot.sendMessage(from, 'Gracias por enviar tu CV. Lo analizaré y te daré retroalimentación.');
    logger.info('Sent initial response to user');

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

    // Procesar el CV
    logger.info(`Processing CV for user ${from} with URL: ${documentUrl}`);
    const analysis = await cvService.processCV(documentUrl, from);
    logger.info(`CV processing completed: ${JSON.stringify(analysis, null, 2)}`);

    // Guardar análisis en la sesión
    await sessionService.saveCVAnalysis(from, analysis);

    // Formatear y enviar resultados del análisis
    const analysisMessage = formatAnalysisResults(analysis);
    await bot.sendMessage(from, analysisMessage);
    logger.info(`Analysis results sent to user ${from}`);

    // Preguntar por el puesto de trabajo
    setTimeout(async () => {
      await bot.sendMessage(from, '¿A qué puesto te gustaría aplicar? Por favor, describe brevemente el puesto y la industria.');
      await sessionService.updateSessionState(from, sessionService.SessionState.POSITION_ASKED);
      logger.info(`Asked user ${from} about job position`);
    }, 2000);

    logger.info(`Document processed successfully for user ${from}`);
  } catch (error) {
    logger.error(`Error handling document: ${error.message}`, { error });
    await bot.sendMessage(from, 'Lo siento, hubo un error al procesar tu CV. Por favor, intenta nuevamente.');
    throw error;
  }
};

const handleText = async (from, text) => {
  try {
    // Obtener sesión del usuario
    const session = await sessionService.getOrCreateSession(from);
    logger.info(`Handling text message from user ${from} in state: ${session.state}`);

    // Manejar comandos
    if (text.startsWith('!')) {
      const command = text.slice(1).toLowerCase();
      switch (command) {
        case 'start':
          await handleStart(from);
          break;
        case 'help':
          await handleHelp(from);
          break;
        case 'interview':
          await handleInterview(from);
          break;
        case 'reset':
          await sessionService.resetSession(from);
          await bot.sendMessage(from, 'Se ha reiniciado tu sesión. Puedes enviar tu CV para comenzar de nuevo.');
          break;
        default:
          await bot.sendMessage(from, 'Por favor, envía tu CV como documento para que pueda analizarlo.');
      }
      return;
    }

    // Manejar mensajes según el estado de la sesión
    switch (session.state) {
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
      case sessionService.SessionState.QUESTION_ASKED:
        // Usuario respondiendo a una pregunta de entrevista con texto (no ideal)
        await bot.sendMessage(from, 'Por favor, responde a la pregunta con un mensaje de audio o video para que pueda evaluar tu respuesta.');
        break;
      case sessionService.SessionState.INTERVIEW_COMPLETED:
        await bot.sendMessage(from, 'Tu entrevista ha finalizado. Si deseas comenzar de nuevo, envía !reset.');
        break;
      default:
        await bot.sendMessage(from, 'Por favor, envía tu CV como documento para que pueda analizarlo.');
    }
    
    logger.info(`Text message handled for user ${from}`);
  } catch (error) {
    logger.error(`Error handling text message: ${error.message}`);
    throw error;
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

    // Implementación del procesamiento de audio
    // TO-DO: Implementar la descarga y transcripción del audio

    // Por ahora, simularemos el proceso
    await handleSimulatedAnswer(from, session);

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

    // Implementación del procesamiento de video
    // TO-DO: Implementar la descarga y extracción del audio del video

    // Por ahora, simularemos el proceso
    await handleSimulatedAnswer(from, session);

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
¡Felicidades! Has completado todas las preguntas de la entrevista.

Gracias por participar en esta simulación. Espero que el feedback te haya sido útil para mejorar tus habilidades en entrevistas.

Si deseas reiniciar el proceso, puedes enviar !reset en cualquier momento.
      `);
    } else {
      // Preguntar si quiere continuar
      setTimeout(async () => {
        await bot.sendMessage(from, '¿Quieres continuar con la siguiente pregunta? Responde "sí" para continuar.');
      }, 2000);
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
*Comandos disponibles:*

!start - Iniciar el bot
!help - Mostrar esta ayuda
!interview - Iniciar simulación de entrevista
!reset - Reiniciar el proceso

*Funcionalidades:*
- Análisis de CV
- Simulación de entrevista
- Retroalimentación personalizada

Para comenzar, envía tu CV como documento.
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
    
    // Iniciar entrevista
    await sessionService.startInterview(from);
    
    // Obtener puesto de trabajo
    const jobPosition = session.jobPosition || 'software';
    
    // Generar primera pregunta (con fallback a pregunta por defecto)
    let questionData;
    try {
      questionData = await interviewService.generateInterviewQuestion(jobPosition);
    } catch (error) {
      logger.error(`Error handling interview command: ${error.message}`);
      questionData = interviewService.getDefaultQuestion(jobPosition);
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
    logger.error(`Error handling interview command: ${error.message}`);
    await bot.sendMessage(from, 'Lo siento, hubo un error al iniciar la entrevista. Por favor, intenta nuevamente.');
    throw error;
  }
};

const formatAnalysisResults = (analysis) => {
  return `
*Análisis de tu CV*

*Puntuación general:* ${analysis.score}/100

*Fortalezas:*
${analysis.strengths.map(s => `- ${s}`).join('\n')}

*Áreas de mejora:*
${analysis.improvements.map(i => `- ${i}`).join('\n')}

*Recomendaciones:*
${analysis.recommendations.map(r => `- ${r}`).join('\n')}
  `;
};

const formatInterviewFeedback = (feedback, question) => {
  return `
*Análisis de tu respuesta*

*Pregunta:* ${question.question}

*Calificación:* ${feedback.score}/10

*Resumen:* ${feedback.summary}

*Fortalezas:*
${feedback.strengths.map(s => `- ${s}`).join('\n')}

*Áreas de mejora:*
${feedback.weaknesses.map(w => `- ${w}`).join('\n')}

*Recomendaciones:*
${feedback.suggestions.map(s => `- ${s}`).join('\n')}
  `;
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
  handleInterview
}; 