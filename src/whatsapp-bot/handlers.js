const bot = require('./bot');
const logger = require('../utils/logger');
const cvService = require('../core/cvService');
const interviewService = require('../core/interviewService');
const sessionService = require('../core/sessionService');
const videoProcessing = require('../utils/videoProcessing');
const openaiUtil = require('../utils/openaiUtil');
const fileProcessing = require('../utils/fileProcessing');

const handleStart = async (from) => {
  try {
    logger.info('Firebase already initialized');
    await sessionService.resetSession(from);
    logger.info(`Session reset for user ${from}`);
    
    // Enviar solo el saludo inicial
    await bot.sendTemplate(from, 'saludo');
    logger.info(`Template saludo sent successfully to ${from}`);
    
    // Actualizar el estado a 'initial' en lugar de 'waiting_for_cv'
    await sessionService.updateSessionState(from, 'initial');
    
    logger.info(`Start command handled for user ${from}`);
  } catch (error) {
    logger.error(`Error handling start command: ${error.message}`);
    await bot.sendMessage(from, 'Lo siento, hubo un error al procesar tu solicitud. Por favor, intenta nuevamente.');
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
    await bot.sendMessage(from, 'Gracias por enviar tu CV. Lo analizaré y te daré retroalimentación.');

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

    // Preguntar por el puesto de trabajo solo si no está en estado position_asked
    if (session.state !== sessionService.SessionState.POSITION_ASKED) {
      await bot.sendMessage(from, '¿A qué puesto te gustaría aplicar? Por favor, describe brevemente el puesto y la industria.');
      await sessionService.updateSessionState(from, sessionService.SessionState.POSITION_ASKED);
      logger.info(`Asked user ${from} about job position`);
    }

    logger.info(`Document processed successfully for user ${from}`);
  } catch (error) {
    logger.error(`Error handling document: ${error.message}`, { error });
    await bot.sendMessage(from, 'Lo siento, hubo un error al procesar tu CV. Por favor, intenta nuevamente.');
    throw error;
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
        // Si el usuario está en estado inicial, pedir el CV
        await bot.sendMessage(from, 'Por favor, envía tu CV como documento para que pueda analizarlo.');
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
¡Felicidades! Has completado todas las preguntas de la entrevista.

Gracias por participar en esta simulación. Espero que el feedback te haya sido útil para mejorar tus habilidades en entrevistas.

Si deseas reiniciar el proceso, puedes enviar !reset en cualquier momento.
        `);
        await sessionService.updateSessionState(from, sessionService.SessionState.INTERVIEW_COMPLETED);
      } else {
        // Preguntar si quiere continuar
        setTimeout(async () => {
          await bot.sendMessage(from, '¿Quieres continuar con la siguiente pregunta? Responde "sí" para continuar.');
          await sessionService.updateSessionState(from, sessionService.SessionState.ANSWER_RECEIVED);
        }, 2000);
      }
    } catch (processingError) {
      logger.error(`Error procesando audio: ${processingError.message}`);
      await bot.sendMessage(from, 'Lo siento, hubo un error al procesar tu audio. Por favor, intenta nuevamente.');
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
¡Felicidades! Has completado todas las preguntas de la entrevista.

Gracias por participar en esta simulación. Espero que el feedback te haya sido útil para mejorar tus habilidades en entrevistas.

Si deseas reiniciar el proceso, puedes enviar !reset en cualquier momento.
        `);
        await sessionService.updateSessionState(from, sessionService.SessionState.INTERVIEW_COMPLETED);
      } else {
        // Preguntar si quiere continuar
        setTimeout(async () => {
          await bot.sendMessage(from, '¿Quieres continuar con la siguiente pregunta? Responde "sí" para continuar.');
          await sessionService.updateSessionState(from, sessionService.SessionState.ANSWER_RECEIVED);
        }, 2000);
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
    
    // Para la primera pregunta, enfocarse en la experiencia y presentación
    const questionPrompt = `Pregunta inicial para un Tech Lead en ${jobPosition} sobre experiencia y trayectoria profesional`;
    
    // Generar primera pregunta (con fallback a pregunta por defecto)
    let questionData;
    try {
      questionData = await openaiUtil.generateInterviewQuestion(jobPosition, questionPrompt);
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
*Análisis Detallado de tu CV*

*Puntuación General:* ${analysis.score}/100

*Puntos Destacables:*
${analysis.highlights.map(h => `- ${h}`).join('\n')}

*Fortalezas Específicas:*
${analysis.strengths.map(s => `- ${s}`).join('\n')}

*Experiencia Relevante:*
${analysis.experience.map(e => `- ${e}`).join('\n')}

*Habilidades Técnicas:*
${analysis.skills.map(s => `- ${s}`).join('\n')}

*Formación Académica:*
${analysis.education.map(e => `- ${e}`).join('\n')}

*Proyectos Destacados:*
${analysis.projects.map(p => `- ${p}`).join('\n')}

*Áreas de Mejora:*
${analysis.improvements.map(i => `- ${i}`).join('\n')}

*Recomendaciones Personalizadas:*
${analysis.recommendations.map(r => `- ${r}`).join('\n')}

*Análisis de Alineación con el Puesto:*
${analysis.alignment}
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
¡Felicidades! Has completado todas las preguntas de la entrevista.

Gracias por participar en esta simulación. Espero que el feedback te haya sido útil para mejorar tus habilidades en entrevistas.

Si deseas reiniciar el proceso, puedes enviar !reset en cualquier momento.
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
        questionPrompt = `Pregunta técnica específica para un Tech Lead en ${jobPosition} sobre arquitectura o tecnologías`;
        break;
      case 2: // Tercera pregunta - enfoque en liderazgo
        questionPrompt = `Pregunta sobre liderazgo, gestión de equipos o resolución de conflictos para un Tech Lead en ${jobPosition}`;
        break;
      case 3: // Cuarta pregunta - enfoque en resolución de problemas
        questionPrompt = `Pregunta sobre resolución de problemas complejos o decisiones difíciles para un Tech Lead en ${jobPosition}`;
        break;
      default:
        questionPrompt = `Pregunta general para un Tech Lead en ${jobPosition}`;
    }
    
    // Generar siguiente pregunta con el tipo específico
    let questionData;
    try {
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
    } catch (error) {
      logger.error(`Error generating next question: ${error.message}`);
      // Usar preguntas predefinidas en caso de error
      const predefinedQuestions = [
        "¿Cómo gestionas la deuda técnica en proyectos con plazos ajustados?",
        "Describe una situación en la que tuviste que liderar un equipo a través de un desafío técnico significativo.",
        "¿Cómo equilibras la innovación técnica con la necesidad de entregar productos a tiempo?",
        "¿Cuál es tu enfoque para la mentoría y desarrollo profesional de los miembros más junior de tu equipo?"
      ];
      
      // Usar una pregunta predefinida que no se haya usado antes
      const usedQuestions = session.questions.map(q => q.question);
      const availableQuestions = predefinedQuestions.filter(q => !usedQuestions.includes(q));
      
      if (availableQuestions.length > 0) {
        questionData = {
          question: availableQuestions[0],
          type: jobPosition,
          originalType: jobPosition,
          timestamp: new Date()
        };
      } else {
        questionData = interviewService.getDefaultQuestion(jobPosition);
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
    logger.info(`Sent question ${nextQuestionNumber + 1} to user ${from}`);
    
    // Actualizar estado
    await sessionService.updateSessionState(from, sessionService.SessionState.QUESTION_ASKED);
  } catch (error) {
    logger.error(`Error handling next question: ${error.message}`);
    await bot.sendMessage(from, 'Lo siento, hubo un error al generar la siguiente pregunta. Por favor, intenta nuevamente con !interview.');
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
  handleNextQuestion
}; 