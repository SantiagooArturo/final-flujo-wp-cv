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
 * @returns {Promise<Object>} Enhanced analysis
 */
const enhanceCVAnalysis = async (analysis) => {
  if (!openai) {
    logger.warn('OpenAI no está inicializado. Devolviendo análisis original.');
    return analysis;
  }
  
  try {
    // Create a copy of the analysis to avoid modifying the original
    const enhancedAnalysis = JSON.parse(JSON.stringify(analysis));
    
    // Enhance the summary using OpenAI
    const summaryPrompt = `
    Dado este resumen básico de CV: "${analysis.summary}"
    
    Genera un resumen más detallado y profesional que sea más útil para el candidato. 
    El resumen debe ser en español, contener aproximadamente 3-4 oraciones, y ser específico y útil.
    `;
    
    enhancedAnalysis.summary = await generateImprovedText(summaryPrompt, {
      max_tokens: 250,
      temperature: 0.7
    });
    
    // Enhance basic info suggestions
    if (analysis.basicInfo && analysis.basicInfo.suggestions) {
      const basicInfoPrompt = `
      Estas son sugerencias para mejorar la información básica de un CV: "${analysis.basicInfo.suggestions}"
      
      Proporciona sugerencias más detalladas y útiles sobre cómo mejorar la sección de información básica de un CV.
      Incluye consejos concretos sobre el formato, estilo y qué tipo de información incluir.
      `;
      
      enhancedAnalysis.basicInfo.suggestions = await generateImprovedText(basicInfoPrompt, {
        max_tokens: 200
      });
    }
    
    // Enhance experience suggestions
    if (analysis.experience && analysis.experience.suggestions) {
      const experiencePrompt = `
      Estas son sugerencias para mejorar la sección de experiencia de un CV: "${analysis.experience.suggestions}"
      
      La persona tiene estos roles: ${analysis.experience.roles ? analysis.experience.roles.join(', ') : 'No especificados'}
      Con aproximadamente ${analysis.experience.years || 'desconocidos'} años de experiencia.
      
      Proporciona consejos detallados sobre cómo mejorar la sección de experiencia laboral, 
      incluyendo cómo destacar logros, usar verbos de acción y cuantificar resultados.
      `;
      
      enhancedAnalysis.experience.suggestions = await generateImprovedText(experiencePrompt, {
        max_tokens: 250
      });
    }
    
    // Enhance recommendations
    if (analysis.recommendations && analysis.recommendations.length > 0) {
      const recommendations = analysis.recommendations.join('\n');
      const recommendationsPrompt = `
      Estas son recomendaciones generales para mejorar un CV: "${recommendations}"
      
      Proporciona 3-5 recomendaciones más específicas, detalladas y accionables para mejorar este CV.
      Cada recomendación debe ser clara, concisa y útil para que el candidato pueda implementarla inmediatamente.
      `;
      
      const enhancedRecs = await generateImprovedText(recommendationsPrompt, {
        max_tokens: 350,
        temperature: 0.7
      });
      
      // Split the enhanced recommendations into an array
      enhancedAnalysis.recommendations = enhancedRecs
        .split('\n')
        .filter(rec => rec.trim())
        .map(rec => rec.replace(/^\d+\.\s*/, '').trim());
    }
    
    return enhancedAnalysis;
  } catch (error) {
    logger.error(`Error al mejorar el análisis con OpenAI: ${error.message}`);
    return analysis;
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