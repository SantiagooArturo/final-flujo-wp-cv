/**
 * OpenAI integration utilities
 * Provides functions to interact with OpenAI API
 */

const { OpenAI } = require("openai");
const fs = require('fs');
const path = require('path');
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
 * Transcribe audio file using OpenAI's Whisper API
 * @param {Buffer|string} audioFile - The audio file as buffer or path
 * @param {Object} options - Additional options
 * @returns {Promise<string>} The transcribed text
 */
const transcribeAudio = async (audioFile, options = {}) => {
  if (!openai) {
    logger.error('OpenAI no está inicializado. Usa initializeOpenAI primero.');
    return null;
  }

  try {
    const defaultOptions = {
      language: "es",
      prompt: "Esta es una respuesta a una pregunta de entrevista de trabajo."
    };

    const mergedOptions = { ...defaultOptions, ...options };
    
    // Create a temporary file if audioFile is a buffer
    let tempFilePath = null;
    let fileToTranscribe = audioFile;
    
    if (Buffer.isBuffer(audioFile)) {
      tempFilePath = path.join(process.cwd(), 'temp', `audio-${Date.now()}.mp3`);
      // Make sure temp directory exists
      if (!fs.existsSync(path.join(process.cwd(), 'temp'))) {
        fs.mkdirSync(path.join(process.cwd(), 'temp'), { recursive: true });
      }
      fs.writeFileSync(tempFilePath, audioFile);
      fileToTranscribe = tempFilePath;
    }

    logger.info(`Transcribiendo audio con OpenAI Whisper API...`);
    
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(fileToTranscribe),
      model: "whisper-1",
      language: mergedOptions.language,
      prompt: mergedOptions.prompt
    });

    // Clean up temporary file if created
    if (tempFilePath) {
      fs.unlinkSync(tempFilePath);
    }

    logger.info(`Audio transcrito exitosamente (${transcription.text.length} caracteres)`);
    return transcription.text;
  } catch (error) {
    logger.error(`Error al transcribir audio con OpenAI: ${error.message}`);
    return null;
  }
};

/**
 * Analyze interview response using OpenAI
 * @param {string} transcription - The transcribed interview response
 * @param {string} question - The interview question that was asked
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Analysis results
 */
const analyzeInterviewResponse = async (transcription, question, options = {}) => {
  if (!openai) {
    logger.error('OpenAI no está inicializado. Usa initializeOpenAI primero.');
    return null;
  }
  
  try {
    const defaultOptions = {
      model: "gpt-4o",
      temperature: 0.7,
      language: "es"
    };

    const mergedOptions = { ...defaultOptions, ...options };
    
    const systemPrompt = `Eres un entrenador experto de entrevistas de trabajo con amplia experiencia en recursos humanos.
Tu tarea es analizar respuestas a preguntas de entrevista y proporcionar retroalimentación constructiva y útil.
Responde siempre en ${mergedOptions.language === "es" ? "español" : "inglés"}.`;

    const userPrompt = `
Pregunta de entrevista: "${question}"

Respuesta del candidato:
"""
${transcription}
"""

Analiza la respuesta del candidato y proporciona:
1. Una calificación general del 1-10
2. Un resumen conciso de la respuesta (máximo 2 oraciones)
3. Fortalezas de la respuesta (3 puntos)
4. Áreas de mejora (3 puntos)
5. Sugerencias específicas para mejorar (3-4 consejos prácticos)

Devuelve tu análisis en formato JSON con las siguientes claves:
{
  "score": número,
  "summary": "texto",
  "strengths": ["punto1", "punto2", "punto3"],
  "weaknesses": ["punto1", "punto2", "punto3"],
  "suggestions": ["sugerencia1", "sugerencia2", "sugerencia3", "sugerencia4"]
}
`;

    logger.info(`Analizando respuesta de entrevista con OpenAI...`);
    
    const response = await openai.chat.completions.create({
      model: mergedOptions.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: mergedOptions.temperature
    });

    const analysis = JSON.parse(response.choices[0].message.content);
    logger.info(`Análisis de entrevista completado exitosamente`);
    
    return analysis;
  } catch (error) {
    logger.error(`Error al analizar respuesta de entrevista: ${error.message}`);
    return null;
  }
};

/**
 * Generate mock interview analysis for demo purposes
 * @param {string} question - The interview question 
 * @returns {Object} Mock analysis results
 */
const generateMockInterviewAnalysis = (question) => {
  // Different scores for variety
  const scores = [6, 7, 8];
  const score = scores[Math.floor(Math.random() * scores.length)];
  
  return {
    score: score,
    summary: "La respuesta aborda los puntos principales de la pregunta y muestra cierta preparación, aunque podría ser más específica y estructurada.",
    strengths: [
      "Demuestra conocimiento básico del tema abordado",
      "Mantiene un tono profesional y adecuado",
      "Hace referencia a experiencia relevante"
    ],
    weaknesses: [
      "Falta de ejemplos concretos para respaldar las afirmaciones",
      "Estructura de respuesta poco clara",
      "Tendencia a divagar en algunos puntos"
    ],
    suggestions: [
      "Utiliza el método STAR (Situación, Tarea, Acción, Resultado) para estructurar tus respuestas",
      "Incluye 1-2 ejemplos específicos de tu experiencia para respaldar tus puntos principales",
      "Practica respuestas más concisas, enfocándote en los aspectos más relevantes",
      "Conecta claramente tus habilidades con los requisitos del puesto"
    ]
  };
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

module.exports = {
  initializeOpenAI,
  generateImprovedText,
  transcribeAudio,
  analyzeInterviewResponse,
  generateMockInterviewAnalysis,
  enhanceCVAnalysis
}; 