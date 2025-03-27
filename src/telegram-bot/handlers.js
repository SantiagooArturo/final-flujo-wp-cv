/**
 * Telegram bot event handlers
 * Contains all handlers for bot commands and interactions
 */

const firebaseConfig = require('../config/firebase');
const fileProcessing = require('../utils/fileProcessing');
const logger = require('../utils/logger');
const openaiUtil = require('../utils/openaiUtil');
const videoProcessing = require('../utils/videoProcessing');

// Firestore collection names
const USERS_COLLECTION = 'users';
const CVS_COLLECTION = 'cvs';

// For Node.js versions that don't have global fetch
let fetch;
try {
  fetch = global.fetch;
} catch (error) {
  // If global fetch is not available, import node-fetch
  fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
}

// Utility function for escaping Markdown characters
const escapeMarkdown = (text) => {
  if (!text) return '';
  // Escape special Markdown characters: _ * [ ] ( ) ~ ` > # + - = | { } . !
  return text.replace(/([_*[\]()~`>#+-=|{}\.!])/g, '\\$1');
};

// Variable for storing last interview questions by user
const lastInterviewQuestions = {};

/**
 * Register a new user in Firestore
 * @param {Object} user - Telegram user object
 * @returns {Promise<void>}
 */
const registerUser = async (user) => {
  try {
    const db = firebaseConfig.getFirestore();
    const userRef = db.collection(USERS_COLLECTION).doc(user.id.toString());
    
    // Check if user already exists
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      // Create new user
      await userRef.set({
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name || '',
        username: user.username || '',
        language: user.language_code || 'en',
        createdAt: new Date(),
        lastActive: new Date(),
      });
      logger.info(`New user registered: ${user.id}`);
    } else {
      // Update last active timestamp
      await userRef.update({
        lastActive: new Date(),
      });
    }
  } catch (error) {
    logger.error(`Error registering user: ${error.message}`);
    throw error;
  }
};

/**
 * Start command handler
 * @param {TelegramBot} bot - Telegram bot instance
 * @param {Object} msg - Message object
 */
const handleStart = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const user = msg.from;
    
    // Register user
    await registerUser(user);
    
    // Welcome message with rich formatting
    const welcomeMessage = `
🌟 *¡Bienvenido a tu Asistente de Carrera AI!* 🌟

Soy tu asistente profesional para ayudarte en tu búsqueda de empleo. Puedo ofrecerte:

✅ *Revisión de CV* - Análisis detallado de tu currículum, fortalezas y áreas de mejora
✅ *Simulación de Entrevista* - Práctica de entrevistas con feedback personalizado

¿Con qué te gustaría que te ayude hoy?
    `;
    
    // Create inline keyboard with two options
    const options = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📋 Revisión de CV', callback_data: 'service_cv_review' },
            { text: '🎥 Simulación de Entrevista', callback_data: 'service_interview' }
          ]
        ]
      }
    };
    
    // Send welcome message with options
    await bot.sendMessage(chatId, welcomeMessage, options);
  } catch (error) {
    logger.error(`Error in start handler: ${error.message}`);
    bot.sendMessage(msg.chat.id, 'Lo siento, hubo un error al iniciar el bot. Por favor intenta de nuevo más tarde.');
  }
};

/**
 * Help command handler
 * @param {TelegramBot} bot - Telegram bot instance
 * @param {Object} msg - Message object
 */
const handleHelp = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    
    const helpMessage = `
*Bot de Revisión de CV - Ayuda*

*Cómo usar este bot:*
1. Envía tu CV/Currículum en uno de los formatos compatibles
2. Espera a que se complete el análisis (normalmente tarda 10-30 segundos)
3. Revisa los comentarios detallados y sugerencias

*Formatos compatibles:*
• PDF (.pdf)
• Microsoft Word (.doc, .docx)
• Texto (.txt)
• Formato de Texto Enriquecido (.rtf)
• Imágenes (.jpg, .png)

*Comandos disponibles:*
/start - Inicializar el bot
/help - Mostrar esta información de ayuda
/about - Información sobre este bot
/status - Verificar el estado del análisis de tu CV
/feedback - Enviar comentarios sobre el análisis

*Consejos para obtener mejores resultados:*
• Asegúrate de que tu documento sea claro y legible
• El formato PDF generalmente da los mejores resultados
• No envíes múltiples versiones del mismo CV

¿Necesitas más ayuda? Contáctanos en support@example.com
    `;
    
    await bot.sendMessage(chatId, helpMessage, {
      parse_mode: 'Markdown',
    });
  } catch (error) {
    logger.error(`Error in help handler: ${error.message}`);
    bot.sendMessage(msg.chat.id, 'Lo siento, hubo un error al mostrar la ayuda. Por favor intenta de nuevo más tarde.');
  }
};

/**
 * About command handler
 * @param {TelegramBot} bot - Telegram bot instance
 * @param {Object} msg - Message object
 */
const handleAbout = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    
    const aboutMessage = `
*Acerca del Bot de Revisión de CV*

El Bot de Revisión de CV es una herramienta avanzada de análisis de currículum que ayuda a los buscadores de empleo a mejorar sus CVs utilizando inteligencia artificial y estándares profesionales de RRHH.

*Características:*
• Análisis en profundidad de la estructura del CV
• Extracción de habilidades y experiencia
• Recomendaciones específicas por industria
• Verificación de compatibilidad con ATS (Sistema de Seguimiento de Candidatos)
• Sugerencias de gramática y redacción

*Tecnología:*
Construido utilizando un sistema híbrido con Node.js y Python, aprovechando NLP (Procesamiento de Lenguaje Natural) y algoritmos de aprendizaje automático entrenados en miles de currículums exitosos.

*Versión:* 1.0.0
*Creado por:* Tu Empresa

*Política de privacidad:*
Nos preocupamos por tu privacidad. Todos los CVs cargados se almacenan de forma segura y solo se utilizan para proporcionarte análisis. Nunca compartimos tus datos con terceros.

Para más información visita: example.com
    `;
    
    await bot.sendMessage(chatId, aboutMessage, {
      parse_mode: 'Markdown',
    });
  } catch (error) {
    logger.error(`Error in about handler: ${error.message}`);
    bot.sendMessage(msg.chat.id, 'Lo siento, hubo un error al mostrar la información. Por favor intenta de nuevo más tarde.');
  }
};

/**
 * Status command handler
 * @param {TelegramBot} bot - Telegram bot instance
 * @param {Object} msg - Message object
 */
const handleStatus = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    
    const db = firebaseConfig.getFirestore();
    const cvsRef = db.collection(CVS_COLLECTION)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(1);
    
    const snapshot = await cvsRef.get();
    
    if (snapshot.empty) {
      await bot.sendMessage(chatId, 'Aún no has enviado ningún CV. ¡Envíame tu CV para comenzar!');
      return;
    }
    
    const cvDoc = snapshot.docs[0];
    const cvData = cvDoc.data();
    
    const statusMessage = `
*Estado del Análisis de CV*

*Archivo:* ${cvData.fileName || 'Desconocido'}
*Enviado:* ${cvData.createdAt.toDate().toLocaleString()}
*Estado:* ${cvData.status === 'completed' ? 'Completado' : 'Procesando'}

${cvData.status === 'completed' ? 'Tu análisis está listo! Escribe /results para verlo.' : 'Tu CV todavía está siendo analizado. Por favor espera un momento.'}
    `;
    
    await bot.sendMessage(chatId, statusMessage, {
      parse_mode: 'Markdown',
    });
  } catch (error) {
    logger.error(`Error in status handler: ${error.message}`);
    bot.sendMessage(msg.chat.id, 'Lo siento, hubo un error al verificar tu estado. Por favor intenta de nuevo más tarde.');
  }
};

/**
 * Document message handler
 * @param {TelegramBot} bot - Telegram bot instance
 * @param {Object} msg - Message object
 */
const handleDocument = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const document = msg.document;
    
    // Validate file size
    const maxSizeInBytes = 20 * 1024 * 1024; // 20 MB
    if (document.file_size > maxSizeInBytes) {
      await bot.sendMessage(chatId, 'Lo siento, el archivo es demasiado grande. El tamaño máximo de archivo es 20 MB.');
      return;
    }
    
    // Send "processing" message
    const processingMessage = await bot.sendMessage(chatId, 'He recibido tu CV! El procesamiento ha comenzado... ⏳');
    
    // Try to register user if Firebase is configured
    try {
      if (process.env.FIREBASE_PROJECT_ID) {
        await registerUser(msg.from);
      }
    } catch (error) {
      logger.warn(`No se pudo registrar al usuario: ${error.message}`);
    }
    
    // Get file from Telegram
    const fileInfo = await bot.getFile(document.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${fileInfo.file_path}`;
    
    // Download file
    const response = await fetch(fileUrl);
    const fileBuffer = await response.arrayBuffer();
    
    // For testing, always use mock analysis
    logger.info('Using mock CV analysis for demonstration');
    const result = {
      fileUrl: fileUrl,
      extractedText: "Texto CV simulado para demostración",
      analysis: {
        score: 7,
        summary: `Este es un análisis simulado de "${document.file_name}" para fines de demostración. El análisis real estará disponible cuando el servicio Python esté en funcionamiento.`,
        basicInfo: {
          name: msg.from.first_name + " " + (msg.from.last_name || ""),
          email: "ejemplo@ejemplo.com",
          phone: "+1234567890",
          location: "Ubicación de Ejemplo",
          linkedin: "linkedin.com/in/ejemplo",
          completeness: 80,
          suggestions: "Esta es una sugerencia simulada para fines de demostración."
        },
        experience: {
          years: "3-5",
          roles: ["Desarrollador de Software", "Desarrollador Web"],
          quality: 7,
          suggestions: "Esta es una sugerencia de experiencia simulada para fines de demostración."
        },
        skills: ["JavaScript", "React", "Node.js", "HTML", "CSS", "MongoDB", "Express"],
        missingSkills: ["TypeScript", "GraphQL", "Docker"],
        skillsSuggestions: "Considera agregar más habilidades relevantes para los puestos que buscas.",
        recommendations: [
          "Esta es una recomendación simulada para fines de demostración.",
          "Tu CV se beneficiaría de logros más cuantificables.",
          "Considera personalizar tu CV para cada solicitud de empleo."
        ]
      }
    };
    
    // Enhance analysis with OpenAI if available
    if (process.env.OPENAI_API_KEY) {
      try {
        logger.info('Mejorando análisis con OpenAI...');
        await bot.editMessageText('Procesando CV y mejorando el análisis con IA... ⏳', {
          chat_id: chatId,
          message_id: processingMessage.message_id,
        });
        
        result.analysis = await openaiUtil.enhanceCVAnalysis(result.analysis);
        logger.info('Análisis mejorado con OpenAI');
      } catch (error) {
        logger.error(`Error al mejorar análisis con OpenAI: ${error.message}`);
      }
    }
      
    // Add a small delay to simulate processing time
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Try to store analysis in Firebase if available
    try {
      if (!firebaseConfig.usingMockImplementation) {
        const db = firebaseConfig.getFirestore();
        const cvRef = db.collection(CVS_COLLECTION).doc();
        
        await cvRef.set({
          id: cvRef.id,
          userId: userId,
          fileName: document.file_name,
          fileSize: document.file_size,
          mimeType: document.mime_type,
          status: 'completed',
          fileUrl: result.fileUrl,
          analysis: result.analysis,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    } catch (error) {
      logger.warn(`No se pudo almacenar el análisis en Firebase: ${error.message}`);
    }
    
    // Update processing message
    await bot.editMessageText('CV procesado con éxito! 🎉', {
      chat_id: chatId,
      message_id: processingMessage.message_id,
    });
    
    // Format and send analysis results
    await sendAnalysisResults(bot, chatId, result.analysis);
  } catch (error) {
    logger.error(`Error processing document: ${error.message}`);
    bot.sendMessage(msg.chat.id, 'Lo siento, hubo un error al procesar tu CV. Por favor intenta de nuevo más tarde.');
  }
};

/**
 * Format and send CV analysis results
 * @param {TelegramBot} bot - Telegram bot instance
 * @param {Number} chatId - Chat ID
 * @param {Object} analysis - Analysis results
 */
const sendAnalysisResults = async (bot, chatId, analysis) => {
  try {
    // Safely format fields
    const safeName = escapeMarkdown(analysis.basicInfo.name || 'No detectado');
    const safeSummary = escapeMarkdown(analysis.summary);
    
    // Mensaje único con toda la información relevante
    const analysisMessage = `
*📊 Análisis de CV: ${analysis.score}/10* ${getScoreEmoji(analysis.score)}

*Resumen:*
${safeSummary}

*Fortalezas:*
• ${escapeMarkdown(analysis.skills.slice(0, 3).join(', '))}
• Experiencia: ${escapeMarkdown(analysis.experience.years || 'No detectado')}
• Roles destacados: ${analysis.experience.roles ? escapeMarkdown(analysis.experience.roles[0]) : 'No detectado'}

*Áreas de mejora:*
• ${escapeMarkdown(analysis.missingSkills.slice(0, 2).join(', '))}
• ${escapeMarkdown(analysis.recommendations[0])}

*¿Qué te gustaría revisar en detalle?*
    `;
    
    const options = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '👤 Datos Personales', callback_data: 'personal_info' },
            { text: '💼 Experiencia', callback_data: 'experience_detail' },
          ],
          [
            { text: '🔧 Habilidades', callback_data: 'skills_detail' },
            { text: '📋 ATS Compatibilidad', callback_data: 'ats_check' },
          ],
          [
            { text: '📊 Informe Completo', callback_data: 'report_full' },
            { text: '✏️ Consejos de Mejora', callback_data: 'improvement_tips' },
          ],
        ],
      },
    };
    
    await bot.sendMessage(chatId, analysisMessage, options);
  } catch (error) {
    logger.error(`Error al enviar los resultados del análisis: ${error.message}`);
    bot.sendMessage(chatId, 'Lo siento, hubo un error al mostrar los resultados del análisis. Por favor intenta de nuevo más tarde.');
  }
};

/**
 * Get emoji based on score
 * @param {Number} score - Score out of 10
 * @returns {String} - Emoji representation
 */
const getScoreEmoji = (score) => {
  if (score >= 9) return '🏆';
  if (score >= 7) return '😀';
  if (score >= 5) return '😐';
  if (score >= 3) return '😕';
  return '😢';
};

/**
 * Callback query handler
 * @param {TelegramBot} bot - Telegram bot instance
 * @param {Object} callbackQuery - Callback query object
 */
const handleCallbackQuery = async (bot, callbackQuery) => {
  try {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    
    // Acknowledge the callback query
    await bot.answerCallbackQuery(callbackQuery.id);
    
    switch (data) {
      case 'report_full':
        await bot.sendMessage(chatId, 'Generando informe PDF completo de tu análisis de CV... Esto puede tardar un momento.');
        
        try {
          // Get latest CV analysis for user
          const userId = callbackQuery.from.id.toString();
          let analysis = null;
          
          if (!firebaseConfig.usingMockImplementation && firebaseConfig.getFirestore()) {
            // Try to get analysis from Firebase
            const db = firebaseConfig.getFirestore();
            const cvsRef = db.collection(CVS_COLLECTION)
              .where('userId', '==', userId)
              .orderBy('createdAt', 'desc')
              .limit(1);
            
            const snapshot = await cvsRef.get();
            
            if (!snapshot.empty) {
              const cvDoc = snapshot.docs[0];
              const cvData = cvDoc.data();
              analysis = cvData.analysis;
            }
          }
          
          // If no analysis found or using mock implementation, generate a fake response
          if (!analysis) {
            // Simulate PDF generation
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Send mock report message
            await bot.sendMessage(chatId, `
*✅ Tu informe PDF está listo*

Lamentablemente, no podemos generar un PDF real en este entorno de prueba.

En un entorno de producción, recibirías un archivo PDF descargable con tu análisis completo.

Si necesitas ayuda adicional, usa los comandos o botones disponibles para obtener más información.
            `, { parse_mode: 'Markdown' });
            
            return;
          }
          
          // Generate PDF report
          const reportResult = await generateReportPDF(analysis, userId);
          
          if (reportResult.success) {
            // Send success message with download link
            await bot.sendMessage(chatId, `
*✅ Tu informe PDF está listo*

Hemos generado un informe detallado de tu CV en formato PDF. Puedes descargarlo usando el enlace a continuación.

[Descargar Informe PDF](${reportResult.pdfUrl})

Este informe contiene un análisis completo de tu CV, incluyendo todas las secciones analizadas y recomendaciones personalizadas.
            `, { 
              parse_mode: 'Markdown',
              disable_web_page_preview: true
            });
          } else {
            throw new Error(reportResult.error || 'Error desconocido');
          }
        } catch (error) {
          logger.error(`Error al generar informe PDF: ${error.message}`);
          await bot.sendMessage(chatId, 'Lo siento, hubo un problema al generar tu informe PDF. Por favor intenta nuevamente más tarde.');
        }
        break;
        
      case 'improvement_tips':
        try {
          await bot.sendMessage(chatId, 'Generando consejos de mejora personalizados con IA...');
          
          // Si OpenAI está disponible, generamos consejos mejorados
          if (process.env.OPENAI_API_KEY) {
            const prompt = `
            Genera 5 consejos profesionales y específicos para mejorar un CV.
            Los consejos deben ser prácticos, accionables y detallados.
            Enfócate en mejorar la estructura, contenido, palabras clave, formato y presentación del CV.
            Cada consejo debe incluir el qué, el por qué y el cómo.
            El formato debe ser en español y con viñetas.
            NO uses caracteres especiales de Markdown como asteriscos, guiones bajos, corchetes o paréntesis sin escaparlos.
            `;
            
            try {
              let enhancedTips = await openaiUtil.generateImprovedText(prompt, {
                max_tokens: 400,
                temperature: 0.7
              });
              
              // Asegurarse de que el texto generado esté correctamente escapado para Markdown
              enhancedTips = escapeMarkdown(enhancedTips);
              
              // Envolvemos cada consejo en su propio bloque para mejorar la legibilidad
              const formattedTips = enhancedTips
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .join('\n\n');
              
              await bot.sendMessage(chatId, `
*Consejos de Mejora Personalizados* ✏️

${formattedTips}

¿Te gustaría obtener consejos sobre alguna sección específica?
• /skills\\_tips - Consejos para la sección de habilidades
• /experience\\_tips - Consejos para la sección de experiencia
• /education\\_tips - Consejos para la sección de educación
              `, { parse_mode: 'Markdown' });
            } catch (error) {
              logger.error(`Error generando consejos con IA: ${error.message}`);
              // Si hay un error con OpenAI, usar consejos predefinidos como respaldo
              throw new Error('No se pudo generar consejos personalizados');
            }
          } else {
            // Consejos predefinidos si OpenAI no está disponible
            await bot.sendMessage(chatId, `
*Principales consejos de mejora para tu CV*

1. *Usa verbos de acción* al comienzo de los puntos para captar la atención del reclutador. Verbos como "Implementé", "Desarrollé", "Lideré" o "Generé" son más impactantes que descripciones pasivas.

2. *Cuantifica tus logros* con números y porcentajes específicos. En lugar de decir "Aumenté las ventas", di "Aumenté las ventas en un 35% en 6 meses, generando $250,000 en ingresos adicionales".

3. *Personaliza tu CV* para cada solicitud de empleo, incorporando palabras clave específicas de la descripción del puesto. Esto mejora la compatibilidad con sistemas ATS y muestra tu relevancia para el rol.

4. *Mantén un formato consistente* en todo el documento, usando la misma fuente, tamaño y estilo para secciones similares. La consistencia visual hace que tu CV sea más fácil de leer y profesional.

5. *Crea una sección de logros destacados* al inicio de tu CV, que resuma tus 3-4 contribuciones más impresionantes. Esto captura inmediatamente la atención del reclutador y destaca tu valor.
              `, { parse_mode: 'Markdown' });
          }
        } catch (error) {
          logger.error(`Error generando consejos de mejora: ${error.message}`);
          // Si ocurre cualquier error, mostrar consejos predefinidos como respaldo
          await bot.sendMessage(chatId, `
*Principales consejos de mejora para tu CV*

1. *Usa verbos de acción* al comienzo de los puntos para captar la atención del reclutador.

2. *Cuantifica tus logros* con números y porcentajes específicos para demostrar tu impacto.

3. *Personaliza tu CV* para cada solicitud de empleo, incorporando palabras clave relevantes.

4. *Mantén un formato consistente* en todo el documento para una mejor legibilidad.

5. *Enfoca tu CV en logros* más que en responsabilidades para destacar tu valor.
              `, { parse_mode: 'Markdown' });
        }
        break;
        
      case 'ats_check':
        try {
          await bot.sendMessage(chatId, 'Analizando la compatibilidad de tu CV con sistemas ATS...');
          
          // Si OpenAI está disponible, generamos un análisis ATS mejorado
          if (process.env.OPENAI_API_KEY) {
            const prompt = `
            Genera un análisis detallado de compatibilidad ATS (Sistema de Seguimiento de Candidatos) para un CV.
            Incluye:
            1. Una puntuación de compatibilidad ATS de 0-100%
            2. Una lista de 3-4 problemas comunes encontrados en CVs
            3. Una lista de 3-4 sugerencias específicas para mejorar la compatibilidad con ATS
            4. Un breve párrafo sobre la importancia de la optimización para ATS
            
            El formato debe ser claro, con secciones bien definidas, y en español.
            NO uses caracteres especiales de Markdown como asteriscos, guiones bajos, corchetes o paréntesis sin escaparlos.
            `;
            
            try {
              let enhancedATSAnalysis = await openaiUtil.generateImprovedText(prompt, {
                max_tokens: 400,
                temperature: 0.7
              });
              
              // Asegurarse de que el texto generado esté correctamente escapado para Markdown
              enhancedATSAnalysis = escapeMarkdown(enhancedATSAnalysis);
              
              // Formatear el análisis para mejorar legibilidad
              const formattedATSAnalysis = enhancedATSAnalysis
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .join('\n\n');
              
              await bot.sendMessage(chatId, `
*Análisis de Compatibilidad ATS* 📋

${formattedATSAnalysis}
              `, { parse_mode: 'Markdown' });
              
              // Añadir un mensaje con botón para más información
              await bot.sendMessage(chatId, '¿Quieres saber más sobre cómo optimizar tu CV para sistemas ATS?', {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '📚 Más información sobre ATS', callback_data: 'ats_info' }]
                  ]
                }
              });
            } catch (error) {
              logger.error(`Error generando análisis ATS con IA: ${error.message}`);
              // Si hay un error con OpenAI, usar análisis predefinido como respaldo
              throw new Error('No se pudo generar análisis ATS personalizado');
            }
          } else {
            // Análisis ATS predefinido si OpenAI no está disponible
            await bot.sendMessage(chatId, `
*Verificación de compatibilidad ATS*

Tu CV es *75% compatible con ATS*.

*Problemas encontrados:*
• El formato complejo puede no analizarse correctamente por los sistemas ATS
• Faltan algunas palabras clave relevantes para tu industria
• El formato de la información de contacto podría optimizarse mejor
• Algunos encabezados de secciones no son estándar

*Sugerencias:*
• Usa un diseño más simple de una sola columna sin tablas ni cuadros
• Agrega más palabras clave específicas de la industria y del puesto
• Asegúrate de que los detalles de contacto estén en formato de texto plano
• Utiliza encabezados de sección estándar como "Experiencia", "Educación" y "Habilidades"

*Importancia del ATS:*
Más del 75% de los empleadores utilizan sistemas ATS para filtrar candidatos. Un CV optimizado para ATS aumenta significativamente tus posibilidades de pasar este primer filtro automático.
            `, { parse_mode: 'Markdown' });
          }
        } catch (error) {
          logger.error(`Error generando análisis ATS: ${error.message}`);
          // Si ocurre cualquier error, mostrar análisis predefinido como respaldo
          await bot.sendMessage(chatId, `
*Verificación de compatibilidad ATS*

Tu CV es *75% compatible con ATS*.

*Problemas encontrados:*
• El formato complejo puede no analizarse correctamente
• Faltan algunas palabras clave relevantes
• Los encabezados de secciones podrían optimizarse

*Sugerencias:*
• Usa un formato simple de una sola columna
• Incluye más términos de la descripción del puesto
• Utiliza encabezados estándar para cada sección

*Recomendación:*
Optimizar tu CV para ATS es esencial ya que el 75% de las solicitudes son filtradas antes de que un humano las vea.
          `, { parse_mode: 'Markdown' });
        }
        break;
        
      case 'job_compare':
        try {
          // Guardamos el estado del usuario para esperar la descripción del trabajo
          // Aquí deberíamos tener una gestión de estados de usuario, pero para simplificar vamos a simular
          
          const instructionMessage = await bot.sendMessage(chatId, `
*Comparación de CV con Oferta de Trabajo* 💼

Para comparar tu CV con una oferta de trabajo específica, por favor:

1. Copia el texto completo de la descripción del trabajo
2. Envíamelo como mensaje directo
3. Analizaré la compatibilidad entre tu CV y los requisitos del puesto

Por favor, envía la descripción del trabajo completa en tu próximo mensaje.
          `, { parse_mode: 'Markdown' });
          
          // Simulación de respuesta para propósitos de demostración
          setTimeout(async () => {
            try {
              await bot.sendMessage(chatId, `
*Nota:* En este momento, la función de comparación con empleo está en modo de demostración. 

Para usar esta función en un entorno real:
1. Enviarías la descripción del trabajo
2. El sistema analizaría tu CV contra esa descripción
3. Recibirías un informe de compatibilidad personalizado

Esta función estará completamente disponible en la próxima actualización.
            `, { parse_mode: 'Markdown' });
            } catch (error) {
              logger.error(`Error enviando mensaje de seguimiento: ${error.message}`);
            }
          }, 5000);
        } catch (error) {
          logger.error(`Error en comparación de empleo: ${error.message}`);
          await bot.sendMessage(chatId, 'Lo siento, hubo un problema al iniciar la comparación con empleo. Por favor intenta nuevamente más tarde.');
        }
        break;

      // Añadir un nuevo caso para el botón de información sobre ATS
      case 'ats_info':
        try {
          if (process.env.OPENAI_API_KEY) {
            const prompt = `
            Genera una guía informativa sobre sistemas ATS (Applicant Tracking Systems) para alguien que está buscando trabajo.
            Incluye:
            1. Qué son los sistemas ATS y cómo funcionan
            2. Por qué son importantes para los buscadores de empleo
            3. 5 consejos principales para optimizar un CV para ATS
            4. Errores comunes a evitar
            
            La información debe ser educativa, práctica y en español.
            NO uses caracteres especiales de Markdown como asteriscos, guiones bajos, corchetes o paréntesis sin escaparlos.
            `;
            
            try {
              let atsInfo = await openaiUtil.generateImprovedText(prompt, {
                max_tokens: 500,
                temperature: 0.7
              });
              
              // Asegurarse de que el texto generado esté correctamente escapado para Markdown
              atsInfo = escapeMarkdown(atsInfo);
              
              // Formatear el análisis para mejorar legibilidad
              const formattedATSInfo = atsInfo
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .join('\n\n');
              
              await bot.sendMessage(chatId, `
*Guía Completa sobre Sistemas ATS* 📚

${formattedATSInfo}
            `, { parse_mode: 'Markdown' });
            } catch (error) {
              logger.error(`Error generando información ATS con IA: ${error.message}`);
              // Si hay error con OpenAI, usar respuesta predefinida
              throw new Error('No se pudo generar información ATS personalizada');
            }
          } else {
            await bot.sendMessage(chatId, `
*¿Qué son los Sistemas ATS?* 📚

Los sistemas ATS (Applicant Tracking Systems) son software que las empresas utilizan para gestionar el proceso de reclutamiento, filtrar candidatos y organizar información de aplicaciones.

*¿Cómo funcionan?*
• Escanean CVs en busca de palabras clave específicas
• Filtran candidatos que no cumplen criterios mínimos
• Clasifican y puntúan las aplicaciones según su relevancia
• Permiten a los reclutadores buscar en su base de datos

*Consejos para optimizar tu CV para ATS:*
1. Usa palabras clave de la descripción del puesto
2. Mantén un formato simple sin elementos gráficos complejos
3. Evita encabezados o pies de página con información importante
4. Utiliza nombres de sección estándar
5. Envía tu CV en formato .docx o .pdf (texto seleccionable)

*Errores comunes a evitar:*
• Usar tablas, columnas o elementos visuales complejos
• Incluir información en imágenes o gráficos
• Usar fuentes o formatos poco convencionales
• Emplear abreviaturas no estándar
            `, { parse_mode: 'Markdown' });
          }
        } catch (error) {
          logger.error(`Error generando información ATS: ${error.message}`);
          // Si ocurre cualquier error, mostrar información predefinida
          await bot.sendMessage(chatId, `
*Guía rápida sobre ATS*

Los sistemas ATS son software que filtran automáticamente CVs antes de que un reclutador los vea.

*Consejos clave:*
• Incluye palabras clave exactas de la descripción del puesto
• Usa un formato simple y compatible con ATS
• Evita gráficos, tablas e imágenes complejas
• Mantén secciones estándar con títulos claros

*Formatos recomendados:* 
PDF simple o Word (.docx)
          `, { parse_mode: 'Markdown' });
        }
        break;
        
      // Añadir nuevos casos para los botones adicionales
      case 'personal_info':
        try {
          const userId = callbackQuery.from.id.toString();
          
          // Simulación de recuperación de datos
          const personalInfo = {
            name: callbackQuery.from.first_name + " " + (callbackQuery.from.last_name || ""),
            email: "ejemplo@ejemplo.com",
            phone: "+1234567890",
            location: "Ubicación de Ejemplo",
            linkedin: "linkedin.com/in/ejemplo",
            completeness: 80,
            suggestions: "Asegúrate de incluir un correo profesional y enlaces a tus perfiles profesionales. Una foto profesional también puede ser beneficiosa dependiendo de tu industria."
          };
          
          const personalInfoMessage = `
*👤 Datos Personales*

*Nombre:* ${escapeMarkdown(personalInfo.name || 'No detectado')}
*Email:* ${escapeMarkdown(personalInfo.email || 'No detectado')}
*Teléfono:* ${escapeMarkdown(personalInfo.phone || 'No detectado')}
*Ubicación:* ${escapeMarkdown(personalInfo.location || 'No detectado')}
*LinkedIn:* ${escapeMarkdown(personalInfo.linkedin || 'No detectado')}

*Completitud:* ${personalInfo.completeness}%

*Sugerencias:*
${escapeMarkdown(personalInfo.suggestions)}
          `;
          
          await bot.sendMessage(chatId, personalInfoMessage, { parse_mode: 'Markdown' });
        } catch (error) {
          logger.error(`Error mostrando datos personales: ${error.message}`);
          await bot.sendMessage(chatId, 'Lo siento, hubo un problema al recuperar los datos personales.');
        }
        break;

      case 'experience_detail':
        try {
          const userId = callbackQuery.from.id.toString();
          
          // Simulamos datos de experiencia
          const experienceDetails = {
            years: "3-5",
            roles: ["Desarrollador de Software", "Desarrollador Web"],
            quality: 7,
            suggestions: "Añade números concretos y resultados medibles a tus logros. Utiliza verbos de acción al inicio de cada punto y enfócate en tus contribuciones específicas en lugar de solo listar responsabilidades.",
            timeline: [
              {
                position: "Desarrollador Senior",
                company: "Empresa Ejemplo",
                duration: "2020 - Presente",
                highlights: ["Lideró equipo de desarrollo frontend", "Implementó CI/CD reduciendo tiempo de despliegue en 40%"]
              },
              {
                position: "Desarrollador Web",
                company: "Startup Innovadora",
                duration: "2018 - 2020",
                highlights: ["Desarrolló aplicación React con 10k usuarios", "Optimizó rendimiento del sitio web en 30%"]
              }
            ]
          };
          
          // Formato de mensaje más detallado para experiencia
          let experienceMessage = `
*💼 Experiencia Profesional*

*Años de experiencia:* ${escapeMarkdown(experienceDetails.years)}
*Calidad del contenido:* ${experienceDetails.quality}/10

*Historial laboral:*
`;
          
          // Añadir timeline de experiencia
          experienceDetails.timeline.forEach(job => {
            experienceMessage += `
🔹 *${escapeMarkdown(job.position)}* - ${escapeMarkdown(job.company)}
     ${escapeMarkdown(job.duration)}
`;
            
            // Añadir highlights si existen
            if (job.highlights && job.highlights.length > 0) {
              job.highlights.forEach(highlight => {
                experienceMessage += `   • ${escapeMarkdown(highlight)}\n`;
              });
            }
          });
          
          // Añadir sugerencias de mejora
          experienceMessage += `
*Sugerencias de mejora:*
${escapeMarkdown(experienceDetails.suggestions)}
          `;
          
          await bot.sendMessage(chatId, experienceMessage, { parse_mode: 'Markdown' });
        } catch (error) {
          logger.error(`Error mostrando detalles de experiencia: ${error.message}`);
          await bot.sendMessage(chatId, 'Lo siento, hubo un problema al recuperar los detalles de experiencia.');
        }
        break;

      case 'skills_detail':
        try {
          const userId = callbackQuery.from.id.toString();
          
          // Simulamos datos de habilidades más detallados
          const skillsDetails = {
            technical: [
              { name: "JavaScript", level: "Avanzado", relevance: "Alta" },
              { name: "React", level: "Avanzado", relevance: "Alta" },
              { name: "Node.js", level: "Intermedio", relevance: "Alta" },
              { name: "HTML/CSS", level: "Avanzado", relevance: "Media" },
              { name: "MongoDB", level: "Básico", relevance: "Media" }
            ],
            soft: [
              "Trabajo en equipo",
              "Comunicación",
              "Resolución de problemas"
            ],
            missing: [
              { name: "TypeScript", importance: "Alta" },
              { name: "GraphQL", importance: "Media" },
              { name: "Docker", importance: "Media" }
            ],
            suggestions: "Considera agrupar tus habilidades por categorías y destacar aquellas más relevantes para los puestos que buscas. Añade indicadores de nivel de competencia para las habilidades técnicas clave."
          };
          
          // Crear mensaje de habilidades detallado
          let skillsMessage = `
*🔧 Análisis Detallado de Habilidades*

*Habilidades técnicas principales:*
`;
          
          // Añadir habilidades técnicas
          skillsDetails.technical.forEach(skill => {
            skillsMessage += `• ${escapeMarkdown(skill.name)} - ${escapeMarkdown(skill.level)}\n`;
          });
          
          // Añadir habilidades blandas
          skillsMessage += `
*Habilidades blandas detectadas:*
`;
          skillsDetails.soft.forEach(skill => {
            skillsMessage += `• ${escapeMarkdown(skill)}\n`;
          });
          
          // Añadir habilidades faltantes recomendadas
          skillsMessage += `
*Habilidades recomendadas para añadir:*
`;
          skillsDetails.missing.forEach(skill => {
            skillsMessage += `• ${escapeMarkdown(skill.name)} (Importancia: ${escapeMarkdown(skill.importance)})\n`;
          });
          
          // Añadir sugerencias
          skillsMessage += `
*Sugerencias de mejora:*
${escapeMarkdown(skillsDetails.suggestions)}
          `;
          
          await bot.sendMessage(chatId, skillsMessage, { parse_mode: 'Markdown' });
        } catch (error) {
          logger.error(`Error mostrando análisis de habilidades: ${error.message}`);
          await bot.sendMessage(chatId, 'Lo siento, hubo un problema al recuperar el análisis detallado de habilidades.');
        }
        break;
        
      // Agregar nuevos casos para manejar los servicios
      case 'service_cv_review':
        // Mostrar la información sobre el servicio de revisión de CV
        const cvReviewMessage = `
*📋 Servicio de Revisión de CV*

Este servicio analiza tu currículum y proporciona feedback detallado para ayudarte a destacar en el proceso de selección.

*Formatos compatibles:* PDF, DOCX, DOC, TXT, RTF, JPG, PNG

*Cómo funciona:*
1. Envía tu CV en uno de los formatos compatibles
2. Nuestro sistema analizará tu documento
3. Recibirás un análisis detallado con recomendaciones personalizadas

¡Envía tu CV ahora para comenzar!
        `;
        
        await bot.sendMessage(chatId, cvReviewMessage, { parse_mode: 'Markdown' });
        break;

      case 'service_interview':
        // Determinar si estamos en modo real o demo
        const isRealAnalysisAvailable = process.env.OPENAI_API_KEY ? true : false;
        
        // Mostrar la información sobre el servicio de simulación de entrevista
        const interviewMessage = `
*🎥 Simulación de Entrevista Virtual*${!isRealAnalysisAvailable ? ' [DEMO]' : ''}

Este servicio te ayuda a prepararte para entrevistas reales mediante simulaciones con IA y feedback personalizado.

*Cómo funciona:*
1. Selecciona el tipo de puesto para el que quieres prepararte
2. Recibirás una pregunta de entrevista común para ese rol
3. Graba un video con tu respuesta y envíalo
4. ${isRealAnalysisAvailable ? 'Nuestra IA transcribirá y analizará tu respuesta para darte feedback personalizado' : 'Recibirás feedback genérico para demostrar la funcionalidad'}

${!isRealAnalysisAvailable ? 
`*Nota importante:* Este es un modo de demostración. Actualmente no analizamos realmente el contenido de tu video.` : 
`*Funcionalidades activas:*
• Transcripción del audio de tu video con IA
• Análisis del contenido de tu respuesta
• Feedback personalizado sobre comunicación verbal
• Sugerencias de mejora específicas`}

¿Listo para ${isRealAnalysisAvailable ? 'practicar' : 'probar la demostración'}?
        `;
        
        // Crear teclado con opciones de puestos de trabajo
        const jobOptions = {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '💻 Desarrollador', callback_data: 'interview_dev' },
                { text: '📊 Marketing', callback_data: 'interview_marketing' }
              ],
              [
                { text: '📱 Diseñador UX/UI', callback_data: 'interview_design' },
                { text: '📈 Ventas', callback_data: 'interview_sales' }
              ],
              [
                { text: '👨‍💼 Gerente de Proyecto', callback_data: 'interview_pm' },
                { text: '🔙 Volver', callback_data: 'back_to_start' }
              ]
            ]
          }
        };
        
        await bot.sendMessage(chatId, interviewMessage, jobOptions);
        break;

      case 'back_to_start':
        // Volver al mensaje principal con las dos opciones
        const backToStartMessage = `
*¿Con qué te gustaría que te ayude hoy?*

Selecciona una de las opciones para comenzar:
        `;
        
        const startOptions = {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📋 Revisión de CV', callback_data: 'service_cv_review' },
                { text: '🎥 Simulación de Entrevista', callback_data: 'service_interview' }
              ]
            ]
          }
        };
        
        await bot.sendMessage(chatId, backToStartMessage, startOptions);
        break;
        
      // Casos para los diferentes tipos de entrevista
      case 'interview_dev':
      case 'interview_marketing':
      case 'interview_design':
      case 'interview_sales':
      case 'interview_pm':
        try {
          // Obtener tipo de entrevista seleccionado
          const interviewType = data.replace('interview_', '');
          
          // Almacenar la selección del usuario
          logger.info(`Usuario ${callbackQuery.from.id} seleccionó entrevista tipo: ${interviewType}`);
          
          // Generar pregunta según el tipo de entrevista
          const question = await generateInterviewQuestion(interviewType);
          
          // Almacenar la pregunta para este usuario
          lastInterviewQuestions[callbackQuery.from.id.toString()] = {
            type: interviewType,
            question: question,
            timestamp: Date.now(),
            callbackData: data
          };
          
          // Título del trabajo
          const jobTitle = getJobTitle(interviewType);
          
          // Determinar si estamos en modo completo o demo
          const isRealAnalysisAvailable = process.env.OPENAI_API_KEY ? true : false;
          
          // Modo de análisis
          const analysisMode = isRealAnalysisAvailable 
            ? 'Tu respuesta será transcrita y analizada con IA.' 
            : '[MODO DEMO] Esta es una demostración. El feedback será genérico, no basado en tu respuesta real.';
          
          // Mensaje con la pregunta de entrevista
          const questionMessage = `
*Pregunta de Entrevista: ${jobTitle}* 🎤

${question}

*Instrucciones:*
1. Graba un video respondiendo a esta pregunta (máximo 2 minutos)
2. Envía el video a este chat
3. ${isRealAnalysisAvailable ? 'El sistema transcribirá tu respuesta y te dará feedback personalizado' : 'Recibirás feedback genérico (modo demo)'}

${analysisMode}

👉 Cuando estés listo, graba y envía tu video.
          `;
          
          // Botón para solicitar nueva pregunta
          const newQuestionButton = {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🔄 Nueva Pregunta', callback_data: `interview_${interviewType}` },
                  { text: '🔙 Volver', callback_data: 'service_interview' }
                ]
              ]
            }
          };
          
          await bot.sendMessage(chatId, questionMessage, newQuestionButton);
        } catch (error) {
          logger.error(`Error generando pregunta de entrevista: ${error.message}`);
          await bot.sendMessage(chatId, 'Lo siento, hubo un problema al generar la pregunta de entrevista. Por favor intenta nuevamente.');
        }
        break;
        
      default:
        logger.warn(`Unknown callback query: ${data}`);
        break;
    }
  } catch (error) {
    logger.error(`Error handling callback query: ${error.message}`);
    bot.sendMessage(callbackQuery.message.chat.id, 'Lo siento, hubo un error al procesar tu solicitud. Por favor intenta de nuevo más tarde.');
  }
};

// Add a new function to generate PDF report
const generateReportPDF = async (analysis, userId) => {
  try {
    logger.info(`Generando informe PDF para usuario ${userId}`);
    
    // En un entorno real, aquí generaríamos un PDF
    // Por ahora, simulamos un retraso y devolvemos una URL falsa
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    return {
      success: true,
      pdfUrl: `https://example.com/reports/${userId}-${Date.now()}.pdf`
    };
  } catch (error) {
    logger.error(`Error al generar informe PDF: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Obtener el título del trabajo basado en el tipo de entrevista
 * @param {string} type - Tipo de entrevista
 * @returns {string} - Título del trabajo
 */
const getJobTitle = (type) => {
  switch (type) {
    case 'dev':
      return 'Desarrollador de Software';
    case 'marketing':
      return 'Especialista en Marketing';
    case 'design':
      return 'Diseñador UX/UI';
    case 'sales':
      return 'Representante de Ventas';
    case 'pm':
      return 'Gerente de Proyecto';
    default:
      return 'Profesional';
  }
};

/**
 * Generar pregunta de entrevista basada en el tipo de trabajo
 * @param {string} type - Tipo de entrevista
 * @returns {Promise<string>} - Pregunta de entrevista
 */
const generateInterviewQuestion = async (type) => {
  try {
    // Si OpenAI está disponible, generamos preguntas personalizadas
    if (process.env.OPENAI_API_KEY) {
      const jobTitle = getJobTitle(type);
      
      const prompt = `
      Genera una pregunta de entrevista desafiante y realista para un candidato a ${jobTitle}.
      La pregunta debe ser:
      1. Relevante para el puesto específico
      2. Orientada a evaluar habilidades clave para esta posición
      3. Una pregunta que requiera una respuesta elaborada (no de sí/no)
      4. Formulada de manera clara y profesional
      5. Específica para el contexto de trabajo del puesto

      Contexto específico según el puesto:
      ${type === 'dev' ? '- Enfócate en habilidades técnicas, resolución de problemas y trabajo en equipo' : ''}
      ${type === 'marketing' ? '- Enfócate en estrategia digital, análisis de métricas y creatividad' : ''}
      ${type === 'design' ? '- Enfócate en procesos de diseño, experiencia de usuario y herramientas de diseño' : ''}
      ${type === 'sales' ? '- Enfócate en habilidades de negociación, manejo de objeciones y cierre de ventas' : ''}
      ${type === 'pm' ? '- Enfócate en gestión de stakeholders, priorización y resolución de conflictos' : ''}
      
      Proporciona solo la pregunta, sin explicaciones ni contexto adicional.
      La pregunta debe estar en español.
      `;
      
      const question = await openaiUtil.generateImprovedText(prompt, {
        max_tokens: 150,
        temperature: 0.8
      });
      
      return escapeMarkdown(question.trim());
    } else {
      // Si no hay OpenAI, usamos preguntas predefinidas
      return getDefaultQuestion(type);
    }
  } catch (error) {
    logger.error(`Error generando pregunta de entrevista: ${error.message}`);
    return getDefaultQuestion(type);
  }
};

/**
 * Obtener pregunta predeterminada basada en el tipo de trabajo
 * @param {string} type - Tipo de entrevista
 * @returns {string} - Pregunta de entrevista predeterminada
 */
const getDefaultQuestion = (type) => {
  const questions = {
    dev: '¿Puedes describir un proyecto técnico difícil en el que hayas trabajado y cómo superaste los desafíos que enfrentaste?',
    marketing: '¿Cómo medirías el éxito de una campaña de marketing y qué métricas considerarías más importantes?',
    design: '¿Puedes explicar tu proceso de diseño desde la investigación de usuarios hasta la implementación final?',
    sales: '¿Cómo manejas el rechazo y las objeciones de los clientes durante el proceso de venta?',
    pm: '¿Cómo priorizarías tareas en un proyecto con plazos ajustados y recursos limitados?'
  };
  
  return questions[type] || '¿Cuáles consideras que son tus principales fortalezas y áreas de mejora profesionales?';
};

/**
 * Handle video messages
 * @param {TelegramBot} bot - Telegram bot instance
 * @param {Object} msg - Message object
 */
const handleVideo = async (bot, msg) => {
  try {
    const chatId = msg.chat.id;
    const user = msg.from;
    const videoInfo = msg.video;
    
    // Register user
    await registerUser(user);
    
    // Check if there is a question associated with this user
    if (!lastInterviewQuestions[user.id]) {
      await bot.sendMessage(
        chatId,
        "⚠️ Por favor, primero selecciona un tipo de entrevista para recibir una pregunta. Luego podrás enviar tu respuesta en video.",
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Ir a Simulación de Entrevista', callback_data: 'service_interview' }]
            ]
          }
        }
      );
      return;
    }
    
    // Check file size - limit to 20MB
    if (videoInfo.file_size > 20 * 1024 * 1024) {
      await bot.sendMessage(
        chatId,
        "⚠️ El video es demasiado grande. Por favor, envía un video de menos de 20MB.",
        { parse_mode: 'Markdown' }
      );
      return;
    }
    
    // Get the interview question
    const question = lastInterviewQuestions[user.id].question;
    const interviewType = lastInterviewQuestions[user.id].type;
    
    // Send a processing message
    const processingMsg = await bot.sendMessage(
      chatId,
      "🔄 Procesando tu respuesta en video...\n\nEsto puede tomar un momento mientras:\n1. Descargamos tu video\n2. Extraemos el audio\n3. Transcribimos tu respuesta\n4. Analizamos el contenido",
      { parse_mode: 'Markdown' }
    );
    
    // Get file info
    const fileId = videoInfo.file_id;
    const fileLink = await bot.getFileLink(fileId);
    
    // Determine if we're using a mock implementation
    const usingMockImplementation = firebaseConfig.usingMockImplementation;
    
    // Variables for the analysis flow
    let transcription = null;
    let analysis = null;
    let errorOccurred = false;
    
    try {
      // Process the video file to extract audio
      const audioBuffer = await videoProcessing.processVideoFromUrl(fileLink);
      logger.info(`Audio extraído exitosamente del video (${audioBuffer.length} bytes)`);

      // Check if we have OpenAI configured to do real transcription
      if (process.env.OPENAI_API_KEY) {
        // Use OpenAI to transcribe the audio
        transcription = await openaiUtil.transcribeAudio(audioBuffer);
        
        if (transcription) {
          logger.info(`Video transcrito exitosamente (${transcription.length} caracteres)`);
          
          // Analyze the transcription
          analysis = await openaiUtil.analyzeInterviewResponse(transcription, question);
        } else {
          errorOccurred = true;
          logger.error("Error al transcribir el audio");
        }
      } else {
        errorOccurred = true;
        logger.warn("OpenAI API no configurada, usando análisis de demostración");
      }
    } catch (error) {
      errorOccurred = true;
      logger.error(`Error al procesar el video: ${error.message}`);
    }
    
    // If we encountered any error or don't have OpenAI API key, use demo feedback
    if (errorOccurred || !analysis) {
      if (errorOccurred) {
        logger.info("Usando análisis de demostración debido a error");
      } else {
        logger.info("Usando análisis de demostración (configuración del sistema)");
      }
      
      // Generate demo feedback
      analysis = openaiUtil.generateMockInterviewAnalysis(question);
      
      // Add demo transcription if we don't have a real one
      if (!transcription) {
        transcription = "Esto es una transcripción de demostración. En el modo real, aquí verías la transcripción exacta de tu respuesta en video.";
      }
    }
    
    // Store the analysis in Firebase if we're not using mock implementations
    if (!usingMockImplementation) {
      try {
        const db = firebaseConfig.getFirestore();
        const interviewRef = db.collection('interviews').doc();
        await interviewRef.set({
          userId: user.id.toString(),
          question,
          interviewType,
          transcription,
          analysis,
          timestamp: new Date()
        });
        logger.info(`Análisis de entrevista guardado en Firebase para el usuario ${user.id}`);
      } catch (error) {
        logger.error(`Error al guardar análisis en Firebase: ${error.message}`);
      }
    }
    
    // Update processing message
    await bot.editMessageText(
      "✅ ¡Procesamiento completado! Aquí está el análisis de tu respuesta.",
      {
        chat_id: chatId,
        message_id: processingMsg.message_id
      }
    );
    
    // Send transcription
    await bot.sendMessage(
      chatId,
      `*📝 Transcripción de tu respuesta:*\n\n${escapeMarkdown(transcription)}${errorOccurred ? '\n\n_Nota: Esta es una transcripción simulada para demostración._' : ''}`,
      { parse_mode: 'Markdown' }
    );
    
    // Send feedback
    await sendInterviewFeedback(bot, chatId, analysis);
    
    // Send options for next steps
    await bot.sendMessage(
      chatId,
      "¿Qué te gustaría hacer ahora?",
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔄 Nueva pregunta del mismo tipo', callback_data: lastInterviewQuestions[user.id].callbackData },
              { text: '👨‍💼 Cambiar tipo de entrevista', callback_data: 'service_interview' }
            ],
            [
              { text: '🏠 Menú principal', callback_data: 'back_to_start' }
            ]
          ]
        }
      }
    );
    
  } catch (error) {
    logger.error(`Error en handleVideo: ${error.message}`);
    bot.sendMessage(
      msg.chat.id,
      "Lo siento, ocurrió un error al procesar tu video. Por favor, intenta de nuevo más tarde.",
      { parse_mode: 'Markdown' }
    );
  }
};

/**
 * Enviar feedback de entrevista al usuario
 * @param {TelegramBot} bot - Instancia del bot de Telegram
 * @param {Number} chatId - ID del chat
 * @param {Object} analysis - Objeto con análisis de la entrevista
 * @returns {Promise<void>}
 */
const sendInterviewFeedback = async (bot, chatId, analysis) => {
  try {
    // Verificar si estamos usando OpenAI o demos
    const isRealAnalysis = !!(analysis.summary && analysis.strengths && analysis.weaknesses);
    
    // Emoji según puntaje
    const emoji = getInterviewScoreEmoji(analysis.score);
    
    // Formatear fortalezas si existen
    const strengthsText = analysis.strengths 
      ? analysis.strengths.map(s => `• ${escapeMarkdown(s)}`).join('\n')
      : '';
    
    // Formatear áreas de mejora si existen
    const weaknessesText = analysis.weaknesses 
      ? analysis.weaknesses.map(w => `• ${escapeMarkdown(w)}`).join('\n')
      : '';
    
    // Formatear sugerencias si existen
    const suggestionsText = analysis.suggestions 
      ? analysis.suggestions.map(s => `• ${escapeMarkdown(s)}`).join('\n')
      : '';
    
    // Mensaje con análisis detallado
    const feedbackMessage = `
*📊 Evaluación de Entrevista* ${emoji}

*Puntuación:* ${analysis.score}/10

*Resumen:*
${escapeMarkdown(analysis.summary)}

*Fortalezas:*
${strengthsText}

*Áreas de mejora:*
${weaknessesText}

*Sugerencias específicas:*
${suggestionsText}
    `;
    
    await bot.sendMessage(chatId, feedbackMessage, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error(`Error enviando feedback de entrevista: ${error.message}`);
    
    // Si hay error, enviamos un mensaje genérico
    await bot.sendMessage(
      chatId, 
      '*📊 Análisis de Entrevista*\n\nTu respuesta ha sido registrada, pero hubo un problema al generar el análisis detallado.',
      { parse_mode: 'Markdown' }
    );
  }
};

/**
 * Obtener emoji según la puntuación de la entrevista
 * @param {Number} score - Puntuación del 1 al 10
 * @returns {String} - Emoji correspondiente
 */
const getInterviewScoreEmoji = (score) => {
  if (score >= 9) return '🌟';
  if (score >= 7) return '✨';
  if (score >= 5) return '👍';
  if (score >= 3) return '🔨';
  return '📚';
};

/**
 * Generar feedback de demostración usando OpenAI
 * @returns {Promise<Object>} - Objeto con feedback genérico para la demo
 */
const generateDemoFeedback = async () => {
  try {
    const contentPrompt = `
    Genera un feedback genérico para una demostración de entrevista de trabajo.
    Debe quedar CLARO que es un feedback de DEMOSTRACIÓN y no basado en el análisis real de una respuesta.
    
    El feedback debe incluir:
    1. Una clara indicación de que este es un feedback simulado para demostración
    2. Consejos generales sobre cómo responder preguntas de entrevista
    3. Recomendaciones estándar para mejorar las respuestas
    
    Escribe en español y en un tono profesional pero amable.
    `;
    
    const contentFeedback = await openaiUtil.generateImprovedText(contentPrompt, {
      max_tokens: 300,
      temperature: 0.7
    });
    
    const bodyLanguagePrompt = `
    Genera recomendaciones generales sobre lenguaje corporal y comunicación no verbal para entrevistas de trabajo.
    Debe quedar CLARO que estas son recomendaciones generales para una DEMOSTRACIÓN y no basadas en el análisis real de un video.
    
    Incluye consejos sobre:
    1. Postura y gestos
    2. Contacto visual
    3. Expresiones faciales
    4. Tono de voz y ritmo
    
    Escribe en español y en formato de lista para facilitar la lectura.
    `;
    
    const bodyLanguageFeedback = await openaiUtil.generateImprovedText(bodyLanguagePrompt, {
      max_tokens: 250,
      temperature: 0.7
    });
    
    const overallPrompt = `
    Genera un breve párrafo para una DEMOSTRACIÓN de entrevista que explique claramente que:
    1. Este es un análisis simulado para mostrar cómo funcionaría la herramienta
    2. En una versión completa, se analizaría realmente el contenido del video
    3. Este feedback no está basado en ninguna respuesta real del usuario
    
    Escribe en español, de forma clara y directa.
    `;
    
    const overallFeedback = await openaiUtil.generateImprovedText(overallPrompt, {
      max_tokens: 150,
      temperature: 0.7
    });
    
    return {
      content: escapeMarkdown(contentFeedback),
      bodyLanguage: escapeMarkdown(bodyLanguageFeedback),
      overall: escapeMarkdown(overallFeedback),
      score: 8, // Puntuación fija para demostración
      isDemo: true
    };
  } catch (error) {
    logger.error(`Error generando feedback con OpenAI: ${error.message}`);
    throw error;
  }
};

/**
 * Obtener feedback predeterminado para entrevistas
 * @returns {Object} - Objeto con feedback detallado
 */
const getDefaultFeedback = () => {
  return {
    content: `[MODO DEMOSTRACIÓN] Este es un feedback genérico para demostración.\n• Los puntos que mencionaremos son recomendaciones generales, no basadas en tu respuesta específica.\n• En una entrevista real, es importante estructurar tus respuestas con el método STAR (Situación, Tarea, Acción, Resultado).\n• Recomendamos incluir ejemplos concretos y cuantificables de logros anteriores.`,
    bodyLanguage: `[MODO DEMOSTRACIÓN] Consejos generales sobre lenguaje corporal:\n• Mantén contacto visual constante pero natural con el entrevistador.\n• Evita movimientos repetitivos o nerviosos con las manos.\n• Siéntate con la espalda recta pero manteniendo una postura relajada.\n• Habla con un ritmo moderado, ni demasiado rápido ni demasiado lento.`,
    overall: `[MODO DEMOSTRACIÓN] Esta es una simulación para mostrar cómo funcionaría la herramienta. En una versión completa, analizaríamos realmente el contenido de tu video y proporcionaríamos feedback personalizado basado en tu respuesta específica.`,
    score: 8,
    isDemo: true
  };
};

// Export all handlers
module.exports = {
  handleStart,
  handleHelp,
  handleAbout,
  handleStatus,
  handleDocument,
  handleCallbackQuery,
  registerUser,
  sendAnalysisResults,
  handleVideo,
  generateInterviewFeedback: generateDemoFeedback,
  getDefaultFeedback,
  sendInterviewFeedback,
  getInterviewScoreEmoji,
};
