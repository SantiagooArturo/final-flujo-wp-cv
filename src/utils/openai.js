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
        
        El resumen debe ser conciso pero impactante, destacando la experiencia relevante, habilidades clave y 
        potencial alineación con el puesto. Usa un tono profesional y convincente.
        
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
          
          Genera 3-5 sugerencias ULTRAESPECÍFICAS y accionables para mejorar esta sección.
          
          INSTRUCCIONES CRÍTICAS:
          1. Cada sugerencia debe:
             - Citar TEXTUALMENTE fragmentos exactos del CV original que necesitan mejora
             - Proporcionar una reescritura completa y detallada con métricas, impacto y logros cuantificables
             - Incluir ejemplos claros de "ANTES vs. DESPUÉS" que muestren la transformación

          2. Enfócate en:
             - Reemplazar descripciones genéricas de responsabilidades con logros concretos y cuantificados
             - Añadir métricas específicas (porcentajes, cantidades, tiempos) a cada logro
             - Usar verbos de alto impacto al inicio de cada punto (Optimicé, Lideré, Reduje, Incrementé)
             - Destacar resultados tangibles y su impacto en la organización
          
          3. Formato requerido para cada sugerencia:
             "ANTES: [cita textual del CV original]
             DESPUÉS: [reescritura completa y mejorada con métricas]
             POR QUÉ FUNCIONA: [breve explicación de por qué esta versión es más efectiva]"
          
          Proporciona ejemplos extremadamente específicos y detallados, no consejos genéricos.
        `;
        
        const enhancedSuggestions = await generateImprovedText(expPrompt, {
          max_tokens: 500,
          temperature: 0.7
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
            
            Genera 3-5 sugerencias ULTRAESPECÍFICAS y accionables para mejorar esta sección.
            
            INSTRUCCIONES CLAVE:
            1. Cada sugerencia debe:
               - Citar TEXTUALMENTE fragmentos exactos del CV original
               - Proporcionar una versión completamente reescrita y mejorada
               - Incluir un formato claro de "ANTES vs. DESPUÉS"
               - Explicar brevemente por qué la mejora es efectiva para el puesto de ${jobTitle}
            
            2. Para ${section.name} específicamente:
               ${section.key === 'education' ? 
                 `- Muestra cómo relacionar la formación directamente con requisitos del puesto
                  - Sugiere cómo destacar proyectos académicos relevantes con resultados cuantificables
                  - Proporciona ejemplos de cómo mencionar logros académicos con impacto` : 
                section.key === 'skills' ? 
                 `- Identifica habilidades críticas para ${jobTitle} que faltan o están subdestacadas
                  - Muestra cómo reformular cada habilidad con nivel de expertise y ejemplos de aplicación
                  - Sugiere un formato optimizado para destacar las habilidades más relevantes` :
                section.key === 'softSkills' ? 
                 `- Transforma cada habilidad blanda en un ejemplo concreto y cuantificable
                  - Muestra cómo conectar cada habilidad con un logro específico relevante para ${jobTitle}
                  - Sugiere cómo demostrar estas habilidades con ejemplos de situaciones laborales reales` :
                section.key === 'certifications' ? 
                 `- Identifica certificaciones específicas de la industria que fortalecerían el perfil
                  - Muestra cómo presentar cada certificación destacando su relevancia para ${jobTitle}
                  - Sugiere cómo vincular cada certificación con aplicaciones prácticas en el rol` :
                 `- Transforma cada descripción de proyecto en un caso de éxito con métricas de impacto
                  - Muestra cómo estructurar la descripción: problema, solución, tecnologías, resultados
                  - Sugiere cómo destacar aspectos del proyecto más relevantes para ${jobTitle}`}
            
            3. Formato requerido para cada sugerencia:
               "ANTES: [cita textual del CV original]
               DESPUÉS: [reescritura completa y mejorada]
               POR QUÉ MEJORA: [explicación breve de por qué esta versión es más efectiva para ${jobTitle}]"
            
            Asegúrate de que cada sugerencia sea extremadamente específica y aplicable inmediatamente.
          `;
          
          const enhancedSuggestions = await generateImprovedText(sectionPrompt, {
            max_tokens: 500,
            temperature: 0.7
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
      
      Genera EXACTAMENTE 5 recomendaciones ULTRA-ESPECÍFICAS y transformadoras para mejorar el CV.
      
      REQUISITOS CRÍTICOS:
      1. Cada recomendación debe:
         - Identificar un problema CONCRETO en el CV actual
         - Proporcionar una solución DETALLADA Y ACCIONABLE
         - Incluir un EJEMPLO ESPECÍFICO de implementación
         - Explicar el IMPACTO esperado en procesos de selección y entrevistas
      
      2. Las recomendaciones deben cubrir:
         - Optimización para sistemas ATS (palabras clave específicas para ${jobTitle})
         - Transformación de logros (con métricas cuantificables y porcentajes)
         - Estructura y formato (sugerencias concretas, no generales)
         - Adaptación específica al sector/industria de ${jobTitle}
         - Diferenciación competitiva (elementos específicos que destacarán al candidato)
      
      3. Cada recomendación debe ser TAN ESPECÍFICA que el candidato pueda implementarla inmediatamente:
         - Redactar exactamente los cambios sugeridos, incluyendo frases completas
         - Proporcionar ejemplos concretos de "antes y después"
         - Incluir palabras, términos y métricas específicas para usar
      
      4. NADA de recomendaciones genéricas como "añadir más logros" - en su lugar especifica:
         - Qué logros exactamente (con ejemplos específicos y redactados)
         - Cómo formularlos (con métricas precisas y resultados cuantificados)
         - Dónde ubicarlos en el CV (secciones específicas)
      
      Formatea cada recomendación de manera estructurada y numerada (1-5) con:
      - PROBLEMA: [Identificación clara del problema o carencia]
      - SOLUCIÓN: [Descripción detallada de la solución propuesta]
      - EJEMPLO: [Ejemplo concreto de implementación]
      - IMPACTO: [Explicación del impacto esperado]
      
      Haz que cada recomendación sea extremadamente específica y aplicable al contexto del candidato y del puesto de ${jobTitle}.
    `;
    
    enhancedAnalysis.recommendations = (await generateImprovedText(finalPrompt, {
      max_tokens: 800,
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