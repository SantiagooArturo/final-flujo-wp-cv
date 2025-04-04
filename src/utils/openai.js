/**
 * OpenAI integration utilities
 * Provides functions to interact with OpenAI API
 */

const { OpenAI } = require("openai");
const logger = require('./logger');

// Initialize OpenAI client
let openai = null;

/**
 * Initialize OpenAI client with API key
 * @param {string} apiKey - OpenAI API key
 */
const initializeOpenAI = (apiKey) => {
  try {
    openai = new OpenAI({
      apiKey: apiKey
    });
    logger.info('OpenAI cliente inicializado correctamente');
    return true;
  } catch (error) {
    logger.error(`Error al inicializar OpenAI: ${error.message}`);
    return false;
  }
};

/**
 * Generate improved text using OpenAI
 * @param {string} prompt - The prompt to send to OpenAI
 * @param {Object} options - Additional options
 * @returns {Promise<string>} The generated text
 */
const generateImprovedText = async (prompt, options = {}) => {
  if (!openai) {
    logger.error('OpenAI no está inicializado. Usa initializeOpenAI primero.');
    return prompt;
  }

  try {
    const defaultOptions = {
      model: "gpt-3.5-turbo",
      temperature: 0.7,
      max_tokens: 500,
      systemMessage: "Eres un asistente experto en recursos humanos y revisión de currículums. Responde de manera útil, detallada y en español."
    };

    const mergedOptions = { ...defaultOptions, ...options };
    
    const response = await openai.chat.completions.create({
      model: mergedOptions.model,
      messages: [
        { role: "system", content: mergedOptions.systemMessage },
        { role: "user", content: prompt }
      ],
      temperature: mergedOptions.temperature,
      max_tokens: mergedOptions.max_tokens
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    logger.error(`Error al generar texto con OpenAI: ${error.message}`);
    return prompt;
  }
};

/**
 * Enhance CV analysis results using OpenAI
 * @param {Object} analysis - The original CV analysis
 * @param {string} jobTitle - The job title for which the analysis is being done
 * @returns {Promise<Object>} Enhanced analysis
 */
const enhanceCVAnalysis = async (analysis, jobTitle) => {
  if (!openai) {
    logger.warn('OpenAI no está inicializado. Devolviendo análisis original.');
    return analysis;
  }
  
  try {
    // Create a copy of the analysis to avoid modifying the original
    const enhancedAnalysis = JSON.parse(JSON.stringify(analysis));
    
    // Mejorar el resumen
    if (enhancedAnalysis.summary) {
      logger.info('Mejorando el resumen...');
      const summaryPrompt = `
        Basándote en este resumen de CV: "${enhancedAnalysis.summary}"
        
        Mejora este resumen haciéndolo más estructurado y profesional. Incluye una evaluación clara del candidato
        en relación con el puesto de "${jobTitle}". Destaca las principales fortalezas y áreas de mejora.
        
        Mantén la información factual original pero mejora su presentación.
      `;
      
      enhancedAnalysis.summary = await generateImprovedText(summaryPrompt, {
        max_tokens: 250,
        temperature: 0.7
      });
    }
    
    // Mejorar las sugerencias para la sección de experiencia
    if (enhancedAnalysis.experience && typeof enhancedAnalysis.experience === 'object') {
      logger.info('Mejorando sugerencias para experiencia...');
      const experienceItems = Array.isArray(enhancedAnalysis.experience) 
        ? enhancedAnalysis.experience.join('\n') 
        : Array.isArray(enhancedAnalysis.experience.roles) 
          ? enhancedAnalysis.experience.roles.join('\n')
          : typeof enhancedAnalysis.experience === 'string' 
            ? enhancedAnalysis.experience
            : '';
      
      if (experienceItems) {
        const expPrompt = `
          Basándote en estos elementos de experiencia laboral del CV:
          "${experienceItems}"
          
          Para un candidato que aplica al puesto de "${jobTitle}",
          
          Genera 3-5 sugerencias ULTRA ESPECÍFICAS y accionables para mejorar esta sección.
          
          IMPORTANTE:
          1. Las sugerencias deben hacer referencia directa a fragmentos EXACTOS del texto original.
          2. Cita textualmente las partes que necesitan mejora y ofrece ejemplos concretos de cómo reescribirlas.
          3. Enfócate en:
             - Cómo convertir descripciones genéricas en logros cuantificables
             - Cómo reemplazar verbos pasivos con verbos de acción más impactantes
             - Cómo añadir métricas específicas relevantes para el puesto
          4. Provee ejemplos específicos como "Cambia 'Responsable de atención al cliente' por 'Gestioné la atención de 50+ clientes diarios mejorando la satisfacción un 35% mediante...'".
          5. NO des consejos genéricos aplicables a cualquier CV.
          
          Formatea cada sugerencia como un punto separado con ejemplos concretos de "antes y después".
        `;
        
        const enhancedSuggestions = await generateImprovedText(expPrompt, {
          max_tokens: 300
        });
        if (typeof enhancedAnalysis.experience === 'object') {
          enhancedAnalysis.experience.suggestions = enhancedSuggestions;
        } else {
          enhancedAnalysis.experience = {
            roles: Array.isArray(enhancedAnalysis.experience) ? enhancedAnalysis.experience : [enhancedAnalysis.experience],
            suggestions: enhancedSuggestions
          };
        }
      }
    }
    
    // Mejoras para cada sección
    const sections = [
      { key: 'education', name: 'formación académica' },
      { key: 'skills', name: 'habilidades técnicas' },
      { key: 'softSkills', name: 'habilidades blandas' },
      { key: 'certifications', name: 'certificaciones' },
      { key: 'projects', name: 'proyectos' }
    ];
    
    for (const section of sections) {
      if (enhancedAnalysis[section.key]) {
        logger.info(`Mejorando sugerencias para ${section.name}...`);
        
        const sectionItems = Array.isArray(enhancedAnalysis[section.key]) 
          ? enhancedAnalysis[section.key].join('\n') 
          : typeof enhancedAnalysis[section.key] === 'object' && enhancedAnalysis[section.key].items
            ? enhancedAnalysis[section.key].items.join('\n')
            : typeof enhancedAnalysis[section.key] === 'string'
              ? enhancedAnalysis[section.key]
              : '';
        
        if (sectionItems) {
          const sectionPrompt = `
            Basándote en estos elementos de ${section.name} del CV:
            "${sectionItems}"
            
            Para un candidato que aplica al puesto de "${jobTitle}",
            
            Genera 3 sugerencias ULTRA ESPECÍFICAS y accionables para mejorar esta sección.
            
            IMPORTANTE:
            1. Las sugerencias DEBEN hacer referencia directa a fragmentos EXACTOS del texto original.
            2. Cita textualmente las partes que necesitan mejora y ofrece ejemplos concretos de cómo reescribirlas.
            3. Para cada sugerencia, proporciona:
               - El texto original exacto que necesita mejora (entre comillas)
               - Una versión mejorada específica (no genérica)
               - Explica brevemente por qué esta mejora impactará positivamente
            4. NO des consejos genéricos aplicables a cualquier CV.
            
            Formatea cada sugerencia como un punto separado con ejemplos concretos de "antes y después".
          `;
          
          const enhancedSuggestions = await generateImprovedText(sectionPrompt, {
            max_tokens: 300
          });
          
          if (typeof enhancedAnalysis[section.key] === 'object') {
            enhancedAnalysis[section.key].suggestions = enhancedSuggestions;
          } else {
            enhancedAnalysis[section.key] = {
              items: Array.isArray(enhancedAnalysis[section.key]) ? enhancedAnalysis[section.key] : [enhancedAnalysis[section.key]],
              suggestions: enhancedSuggestions
            };
          }
        }
      }
    }
    
    // Mejorar recomendaciones finales
    logger.info('Mejorando recomendaciones...');
    const finalPrompt = `
      Basándote en todo este análisis de CV para un candidato al puesto de "${jobTitle}":
      
      Fortalezas: ${Array.isArray(enhancedAnalysis.strengths) ? enhancedAnalysis.strengths.join(', ') : enhancedAnalysis.strengths || 'No especificadas'}
      Áreas de mejora: ${Array.isArray(enhancedAnalysis.improvements) ? enhancedAnalysis.improvements.join(', ') : enhancedAnalysis.improvements || 'No especificadas'}
      
      Genera 5 recomendaciones EXTREMADAMENTE ESPECÍFICAS y accionables para mejorar el CV completo.
      
      IMPORTANTE:
      1. Cada recomendación debe ser ULTRA específica, detallada y personalizada para este candidato y puesto.
      2. Para cada recomendación, especifica:
         - Acción concreta a realizar (qué cambiar exactamente)
         - Ejemplo específico de implementación (cómo hacerlo)
         - Impacto esperado para los reclutadores
      3. Incluye recomendaciones sobre palabras clave para ATS, formato, adaptación al puesto específico.
      4. Evita consejos genéricos como "añadir más logros" - en su lugar especifica qué logros exactamente.
      
      Numera las recomendaciones del 1 al 5, cada una con suficiente detalle para ser implementada inmediatamente.
    `;
    
    enhancedAnalysis.recommendations = (await generateImprovedText(finalPrompt, {
      max_tokens: 400,
      temperature: 0.7
    }))
      .split(/\d+\.\s+/)
      .filter(item => item.trim().length > 0)
      .map(item => item.trim());
    
    return enhancedAnalysis;
  } catch (error) {
    logger.error('Error en enhanceCVAnalysis:', error);
    throw error;
  }
};

/**
 * Transcribe audio de un archivo usando Whisper API
 * @param {Buffer} audioBuffer - Buffer del archivo de audio
 * @returns {Promise<string>} - Texto transcrito
 */
const transcribeAudio = async (audioBuffer) => {
  if (!openai) {
    logger.error('OpenAI no está inicializado. Usa initializeOpenAI primero.');
    throw new Error('OpenAI no inicializado');
  }

  try {
    // Crear un archivo temporal para enviar a la API de Whisper
    const tempFilePath = `/tmp/audio_${Date.now()}.mp4`;
    const fs = require('fs');
    
    // Escribir el buffer al archivo temporal
    await fs.promises.writeFile(tempFilePath, audioBuffer);
    
    // Abrir el archivo para enviarlo a la API
    const fileStream = fs.createReadStream(tempFilePath);
    
    // Realizar la transcripción con Whisper
    const response = await openai.audio.transcriptions.create({
      file: fileStream,
      model: "whisper-1",
      language: "es", // Especificar español
      response_format: "text"
    });
    
    // Eliminar el archivo temporal
    await fs.promises.unlink(tempFilePath);
    
    logger.info('Audio transcrito correctamente');
    return response;
  } catch (error) {
    logger.error(`Error al transcribir audio: ${error.message}`);
    throw error;
  }
};

/**
 * Analiza una respuesta de entrevista transcrita
 * @param {Object} data - Datos para el análisis
 * @param {string} data.transcription - Transcripción de la respuesta
 * @param {string} data.jobType - Tipo de trabajo (dev, marketing, etc.)
 * @param {string} data.question - Pregunta de la entrevista
 * @returns {Promise<Object>} - Análisis de la respuesta
 */
const analyzeInterviewResponse = async (data) => {
  if (!openai) {
    logger.error('OpenAI no está inicializado. Usa initializeOpenAI primero.');
    throw new Error('OpenAI no inicializado');
  }

  try {
    const { transcription, jobType, question } = data;
    
    if (!transcription || transcription.trim().length === 0) {
      throw new Error('Transcripción vacía o no válida');
    }
    
    // Prompt para analizar la respuesta
    const analysisPrompt = `
    Has recibido la transcripción de una respuesta de entrevista para un puesto de ${jobType}.
    
    Pregunta de la entrevista: "${question}"
    
    Transcripción de la respuesta:
    "${transcription}"
    
    Por favor, proporciona un análisis detallado de la respuesta, incluyendo:
    
    1. Fortalezas de la respuesta (3-4 puntos concretos)
    2. Áreas de mejora (3-4 puntos concretos)
    3. Consejos específicos para mejorar la respuesta
    4. Evalúa la claridad, estructura y relevancia de la respuesta
    5. Sugiere una mejor forma de responder a esta pregunta específica
    
    Proporciona este análisis en español, con un tono constructivo y profesional.
    
    IMPORTANTE: Basa tu análisis estrictamente en el contenido de la transcripción. No inventes ni asumas información que no esté en la transcripción.
    `;
    
    // Obtener análisis de OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "Eres un experto en entrevistas de trabajo, especialmente para roles en tecnología, marketing, diseño y gestión. Tu tarea es analizar respuestas de entrevistas y proporcionar feedback constructivo y útil." },
        { role: "user", content: analysisPrompt }
      ],
      temperature: 0.7,
      max_tokens: 800
    });
    
    const contentAnalysis = response.choices[0].message.content.trim();
    
    // Obtener una puntuación para la respuesta
    const scoringPrompt = `
    Basándote en la misma transcripción y pregunta:
    
    Pregunta: "${question}"
    Respuesta transcrita: "${transcription}"
    
    Asigna una puntuación del 1 al 10 a esta respuesta (donde 10 es excelente).
    
    Devuelve SOLO el número, sin explicaciones ni texto adicional.
    `;
    
    const scoreResponse = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "Eres un evaluador de entrevistas de trabajo. Tu tarea es asignar puntuaciones precisas y justas a las respuestas." },
        { role: "user", content: scoringPrompt }
      ],
      temperature: 0.3,
      max_tokens: 10
    });
    
    // Extraer la puntuación (número del 1 al 10)
    let score = 7; // Valor predeterminado
    const scoreText = scoreResponse.choices[0].message.content.trim();
    const scoreMatch = scoreText.match(/\d+/);
    
    if (scoreMatch) {
      const parsedScore = parseInt(scoreMatch[0], 10);
      if (parsedScore >= 1 && parsedScore <= 10) {
        score = parsedScore;
      }
    }
    
    // Generar consejos de comunicación verbal
    const verbalCommunicationPrompt = `
    Basándote en esta transcripción de una respuesta de entrevista:
    
    "${transcription}"
    
    Proporciona 3-4 consejos específicos sobre la comunicación verbal (claridad, ritmo, tono, vocabulario, etc.).
    
    Sé específico y directo, mencionando tanto aspectos positivos como áreas de mejora basadas en la transcripción.
    `;
    
    const verbalResponse = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "Eres un experto en comunicación verbal y oratoria. Tu trabajo es analizar transcripciones de entrevistas y proporcionar retroalimentación útil sobre la comunicación verbal." },
        { role: "user", content: verbalCommunicationPrompt }
      ],
      temperature: 0.7,
      max_tokens: 300
    });
    
    const verbalCommunicationAnalysis = verbalResponse.choices[0].message.content.trim();
    
    return {
      content: escapeMarkdown(contentAnalysis),
      verbalCommunication: escapeMarkdown(verbalCommunicationAnalysis),
      score: score,
      isDemo: false,
      transcription: escapeMarkdown(transcription)
    };
  } catch (error) {
    logger.error(`Error al analizar respuesta de entrevista: ${error.message}`);
    throw error;
  }
};

/**
 * Escapar caracteres especiales de Markdown
 * @param {string} text - Texto a escapar
 * @returns {string} - Texto escapado
 */
const escapeMarkdown = (text) => {
  if (!text) return '';
  // Escape special Markdown characters: _ * [ ] ( ) ~ ` > # + - = | { } . !
  return text.replace(/([_*[\]()~`>#+-=|{}\.!])/g, '\\$1');
};

module.exports = {
  initializeOpenAI,
  generateImprovedText,
  enhanceCVAnalysis,
  transcribeAudio,
  analyzeInterviewResponse,
  escapeMarkdown
}; 