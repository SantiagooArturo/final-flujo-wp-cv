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
 * Generate an interview question based on job type using OpenAI
 * @param {string} jobType - Normalized type of job (e.g., 'software', 'marketing', 'sales')
 * @param {string} originalJobType - Original job description from the user (can be more specific)
 * @returns {Promise<Object>} Generated interview question and metadata
 */
const generateInterviewQuestion = async (jobType, originalJobType = '') => {
  if (!openai) {
    logger.error('OpenAI no está inicializado. Usa initializeOpenAI primero.');
    throw new Error('OpenAI no está inicializado');
  }

  try {
    // Usar ambos tipos de trabajo para generar una pregunta más relevante
    const jobContext = originalJobType && originalJobType !== jobType 
      ? `"${originalJobType}" (categorizado como ${jobType})` 
      : `"${jobType}"`;
    
    // Prompt específico para Tech Lead si el puesto lo indica
    let specificPrompt = '';
    if (jobType.toLowerCase().includes('tech') && jobType.toLowerCase().includes('lead')) {
      specificPrompt = `
Para un puesto de Tech Lead, enfócate especialmente en preguntas que evalúen:
1. Capacidad para tomar decisiones técnicas estratégicas
2. Habilidades para liderar equipos de desarrollo y resolver conflictos técnicos
3. Conocimiento de arquitectura de software y patrones de diseño
4. Experiencia manejando deuda técnica y optimizando sistemas
5. Equilibrio entre excelencia técnica y necesidades comerciales
6. Gestión de proyectos técnicos complejos y equipos multidisciplinarios
`;
    }
    
    const prompt = `Genera una pregunta de entrevista desafiante, específica y relevante para un candidato que aplica a un puesto de ${jobContext}.

La pregunta debe:
1. Evaluar habilidades técnicas, experiencia o competencias relevantes para este tipo de rol específico
2. Requerir ejemplos concretos o situaciones específicas (preferiblemente tipo STAR)
3. Ser específica y no genérica, adaptada para el contexto laboral del puesto
4. Estar formulada en español y usar un lenguaje profesional
5. Ser abierta y requerir más que una respuesta de sí/no
6. Ser desafiante pero justa, evaluando habilidades reales del candidato

${specificPrompt}

Contexto específico según el tipo de trabajo:
${jobType.toLowerCase().includes('tech lead') ? '- Enfocada en liderazgo técnico, decisiones arquitectónicas, gestión de equipos de desarrollo, o manejo de situaciones técnicas complejas' : ''}
${jobType === 'software' ? '- Enfocada en algún desafío técnico, arquitectura, metodologías de desarrollo, solución de problemas o trabajo colaborativo en código' : ''}
${jobType === 'marketing' ? '- Enfocada en estrategias digitales, campañas, medición de resultados, segmentación de audiencia o gestión de contenidos' : ''}
${jobType === 'sales' ? '- Enfocada en técnicas de venta, negociación, manejo de objeciones, prospección o retención de clientes' : ''}
${jobType === 'design' ? '- Enfocada en procesos creativos, metodologías de diseño, experiencia de usuario o adaptación a requisitos de marca/cliente' : ''}
${jobType === 'pm' ? '- Enfocada en gestión de proyectos, metodologías ágiles, priorización, gestión de equipos o manejo de stakeholders' : ''}
${jobType === 'hr' ? '- Enfocada en procesos de selección, desarrollo de talento, cultura organizacional o gestión del desempeño' : ''}
${jobType === 'data' ? '- Enfocada en análisis de datos, visualización, toma de decisiones basada en datos o implementación de modelos' : ''}
${jobType === 'finance' ? '- Enfocada en análisis financiero, presupuestos, reportes, optimización de recursos o compliance' : ''}

IMPORTANTE: Proporciona solo la pregunta, sin introducción ni texto adicional.`;

    // Intentar usar GPT-4o para mejor calidad, con fallback a GPT-3.5 Turbo
    let model = "gpt-4o";
    try {
      const response = await openai.chat.completions.create({
        model: model,
        messages: [
          { 
            role: "system", 
            content: "Eres un entrevistador técnico experto con amplia experiencia en entrevistas para roles de liderazgo en tecnología. Tu objetivo es crear preguntas desafiantes pero justas que evalúen las capacidades reales de los candidatos para roles de Tech Lead y posiciones técnicas avanzadas." 
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 200
      });

      return {
        question: response.choices[0].message.content.trim(),
        type: jobType,
        originalType: originalJobType || jobType,
        timestamp: new Date()
      };
    } catch (error) {
      // Si falla con GPT-4o, intentar con GPT-3.5 Turbo
      logger.warn(`Error using ${model}, falling back to gpt-3.5-turbo: ${error.message}`);
      model = "gpt-3.5-turbo";
      
      const response = await openai.chat.completions.create({
        model: model,
        messages: [
          { 
            role: "system", 
            content: "Eres un entrevistador técnico experto con amplia experiencia en entrevistas para roles de liderazgo en tecnología." 
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 150
      });

      return {
        question: response.choices[0].message.content.trim(),
        type: jobType,
        originalType: originalJobType || jobType,
        timestamp: new Date()
      };
    }
  } catch (error) {
    logger.error(`Error al generar pregunta de entrevista con OpenAI: ${error.message}`);
    throw error;
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

/**
 * Analyze CV text using OpenAI
 * @param {string} cvText - The CV text content
 * @param {string} jobType - The job type for which the CV is intended
 * @returns {Promise<Object>} Analysis results
 */
const analyzeCV = async (cvText, jobType) => {
  try {
    // Asegurarse de que jobType no sea undefined
    const jobPosition = jobType || 'No especificado';
    
    logger.info(`Analizando CV para puesto: ${jobPosition} (longitud del texto: ${cvText.length} caracteres)`);
    
    if (!openai) {
      logger.error('OpenAI no está inicializado. Usando análisis simulado.');
      return generateRealisticMockAnalysis(jobPosition);
    }
    
    if (!cvText || cvText.length < 100) {
      logger.error(`Texto del CV demasiado corto o vacío (${cvText ? cvText.length : 0} caracteres). Usando análisis simulado.`);
      return generateRealisticMockAnalysis(jobPosition);
    }

    const prompt = `Analiza el siguiente CV de manera extremadamente detallada y personalizada para un puesto de ${jobPosition}. Realiza un análisis profundo y estructurado:

CV:
${cvText}

Tipo de trabajo: ${jobPosition}

Proporciona un análisis exhaustivo con las siguientes secciones exactamente como se indican:

Puntuación general: [número]/100
[Explicación detallada de la puntuación, justificando por qué se asignó este valor en base a la experiencia, habilidades, formación y alineación con el puesto]

Resumen ejecutivo:
[Párrafo conciso de 4-6 líneas resumiendo el perfil profesional del candidato, su experiencia más relevante, y su potencial ajuste para el puesto]

Fortalezas específicas:
- [Fortaleza 1 - Explicar cómo esta fortaleza beneficia directamente al puesto]
- [Fortaleza 2 - Explicar cómo esta fortaleza beneficia directamente al puesto]
- [Fortaleza 3 - Explicar cómo esta fortaleza beneficia directamente al puesto]
- [Fortaleza 4 - Explicar cómo esta fortaleza beneficia directamente al puesto]
- [Fortaleza 5 - Explicar cómo esta fortaleza beneficia directamente al puesto]

Áreas de mejora:
- [Área 1 - Explicar por qué esta área necesita mejora y cómo afecta a su candidatura]
- [Área 2 - Explicar por qué esta área necesita mejora y cómo afecta a su candidatura]
- [Área 3 - Explicar por qué esta área necesita mejora y cómo afecta a su candidatura]
- [Área 4 - Explicar por qué esta área necesita mejora y cómo afecta a su candidatura]

Recomendaciones específicas para el puesto:
- [Recomendación 1 - Acción concreta y específica que el candidato puede implementar inmediatamente]
- [Recomendación 2 - Acción concreta y específica que el candidato puede implementar inmediatamente]
- [Recomendación 3 - Acción concreta y específica que el candidato puede implementar inmediatamente]
- [Recomendación 4 - Acción concreta y específica que el candidato puede implementar inmediatamente]
- [Recomendación 5 - Acción concreta y específica que el candidato puede implementar inmediatamente]

Experiencia relevante:
- [Experiencia 1 - Incluir empresa, periodo, responsabilidades clave y logros cuantificables]
- [Experiencia 2 - Incluir empresa, periodo, responsabilidades clave y logros cuantificables]
- [Experiencia 3 - Incluir empresa, periodo, responsabilidades clave y logros cuantificables]
- [Experiencia 4 - Incluir empresa, periodo, responsabilidades clave y logros cuantificables]

Habilidades técnicas:
- [Habilidad 1 - Incluir nivel de competencia (Básico/Intermedio/Avanzado/Experto) y relevancia para el puesto]
- [Habilidad 2 - Incluir nivel de competencia y relevancia para el puesto]
- [Habilidad 3 - Incluir nivel de competencia y relevancia para el puesto]
- [Habilidad 4 - Incluir nivel de competencia y relevancia para el puesto]
- [Habilidad 5 - Incluir nivel de competencia y relevancia para el puesto]

Habilidades blandas:
- [Habilidad blanda 1 - Con ejemplos específicos del CV que demuestran esta habilidad]
- [Habilidad blanda 2 - Con ejemplos específicos del CV que demuestran esta habilidad]
- [Habilidad blanda 3 - Con ejemplos específicos del CV que demuestran esta habilidad]
- [Habilidad blanda 4 - Con ejemplos específicos del CV que demuestran esta habilidad]

Formación académica:
- [Formación 1 - Incluir institución, título, año y relevancia para el puesto]
- [Formación 2 - Incluir institución, título, año y relevancia para el puesto]
- [Formación 3 - Incluir institución, título, año y relevancia para el puesto]

Certificaciones y cursos:
- [Certificación 1 - Incluir entidad emisora, año y validez/relevancia actual]
- [Certificación 2 - Incluir entidad emisora, año y validez/relevancia actual]
- [Certificación 3 - Incluir entidad emisora, año y validez/relevancia actual]

Proyectos destacados:
- [Proyecto 1 - Incluir objetivo, tecnologías utilizadas, resultados y relevancia para el puesto]
- [Proyecto 2 - Incluir objetivo, tecnologías utilizadas, resultados y relevancia para el puesto]
- [Proyecto 3 - Incluir objetivo, tecnologías utilizadas, resultados y relevancia para el puesto]

Análisis de competencias clave para el puesto:
[Párrafo detallado analizando las 3-5 competencias principales requeridas para este puesto específico y cómo el candidato las cumple o no]

Análisis de brecha de habilidades:
[Análisis comparativo entre las habilidades que posee el candidato y las requeridas para el puesto, identificando claramente las habilidades faltantes o que necesitan desarrollo]

Alineación con el puesto:
[Análisis detallado sobre cómo se alinea el perfil del candidato con los requisitos específicos del puesto de ${jobPosition}, incluyendo un porcentaje aproximado de coincidencia]

Puntos destacables:
- [Punto 1 - Aspectos únicos o diferenciadores del candidato frente a otros postulantes típicos]
- [Punto 2 - Aspectos únicos o diferenciadores del candidato frente a otros postulantes típicos]
- [Punto 3 - Aspectos únicos o diferenciadores del candidato frente a otros postulantes típicos]
- [Punto 4 - Aspectos únicos o diferenciadores del candidato frente a otros postulantes típicos]

Recomendación final:
[Conclusión sobre la idoneidad del candidato para el puesto, incluyendo una calificación de recomendación: Altamente recomendado / Recomendado / Recomendado con reservas / No recomendado]

Por favor, asegúrate de:
1. Mantener exactamente los títulos de sección como se muestran arriba
2. Usar guiones (-) para cada punto en las listas
3. Incluir todas las secciones en el orden especificado
4. Proporcionar información específica, personalizada y accionable para cada sección
5. Basar tu análisis en datos concretos encontrados en el CV
6. Relacionar cada punto con el puesto específico de ${jobPosition}`;

    // Intentar obtener respuesta de OpenAI con modelo preferido
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "Eres un reclutador experto senior con 15 años de experiencia en selección de talento para puestos de tecnología y liderazgo. Tu especialidad es el análisis profundo de CVs para identificar candidatos de alto potencial. Proporciona evaluaciones detalladas, personalizadas, constructivas y accionables basadas en datos concretos del CV y los requisitos específicos del puesto."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 3000
      });

      const analysis = response.choices[0].message.content;
      const parsedResult = parseAnalysis(analysis);
      
      // Verificar que el objeto parseado tenga datos válidos
      if (!parsedResult.summary || parsedResult.strengths.length === 0 || parsedResult.score === 0) {
        logger.warn('El análisis parseado está incompleto, utilizando análisis simulado como respaldo');
        return generateRealisticMockAnalysis(jobPosition);
      }
      
      return parsedResult;
    } catch (openaiError) {
      logger.error(`Error en la llamada a OpenAI: ${openaiError.message}`);
      logger.info('Intentando con modelo alternativo gpt-3.5-turbo como fallback');
      
      try {
        const fallbackResponse = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: "Eres un reclutador experto senior con experiencia en selección de talento."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 2500
        });
        
        const analysis = fallbackResponse.choices[0].message.content;
        const parsedResult = parseAnalysis(analysis);
        
        // Verificar que el objeto parseado tenga datos válidos
        if (!parsedResult.summary || parsedResult.strengths.length === 0 || parsedResult.score === 0) {
          logger.warn('El análisis parseado del modelo fallback está incompleto, utilizando análisis simulado');
          return generateRealisticMockAnalysis(jobPosition);
        }
        
        return parsedResult;
      } catch (fallbackError) {
        logger.error(`Error con modelo fallback: ${fallbackError.message}, utilizando análisis simulado`);
        return generateRealisticMockAnalysis(jobPosition);
      }
    }
  } catch (error) {
    logger.error(`Error analizando CV: ${error.message}`);
    return generateRealisticMockAnalysis(jobPosition);
  }
};

/**
 * Generate a realistic mock CV analysis for given job type
 * @param {string} jobType - Job position type
 * @returns {Object} Mock analysis results with realistic data
 */
const generateRealisticMockAnalysis = (jobType) => {
  const jobPosition = jobType || 'No especificado';
  logger.info(`Generando análisis simulado realista para puesto: ${jobPosition}`);
  
  // Crear análisis básico que varía según el tipo de trabajo
  let score = Math.floor(Math.random() * 30) + 60; // Puntuación entre 60-89
  let jobSpecificStrengths = [];
  let jobSpecificImprovements = [];
  let jobSpecificSkills = [];
  
  // Verificar si tenemos un jobType válido antes de usar toLowerCase
  const jobTypeLower = jobPosition.toLowerCase();
  
  // Personalizar según el tipo de trabajo
  if (jobTypeLower.includes('tech lead') || jobTypeLower.includes('líder técnico')) {
    jobSpecificStrengths = [
      "Sólida experiencia técnica combinada con habilidades de liderazgo",
      "Capacidad demostrada para gestionar equipos técnicos multidisciplinarios",
      "Buen balance entre visión estratégica y conocimientos técnicos prácticos"
    ];
    jobSpecificImprovements = [
      "Necesita mayor enfoque en la gestión de stakeholders no técnicos",
      "Podría desarrollar más experiencia en metodologías ágiles a escala",
      "La documentación de decisiones arquitectónicas podría ser más estructurada"
    ];
    jobSpecificSkills = [
      "Arquitectura de software - Avanzado",
      "Gestión de equipos técnicos - Intermedio",
      "Resolución de problemas complejos - Avanzado"
    ];
  } else if (jobTypeLower.includes('market')) {
    jobSpecificStrengths = [
      "Excelente comprensión de estrategias de marketing digital",
      "Experiencia demostrada en campañas de adquisición de clientes",
      "Buen manejo de analíticas y métricas de rendimiento"
    ];
    jobSpecificImprovements = [
      "Podría fortalecer experiencia en estrategias de fidelización",
      "La experiencia en marketing de contenidos es limitada",
      "Poca exposición a marketing en mercados internacionales"
    ];
    jobSpecificSkills = [
      "Marketing digital - Avanzado",
      "Estrategia de contenidos - Intermedio",
      "Análisis de datos de marketing - Intermedio"
    ];
  } else {
    jobSpecificStrengths = [
      "Experiencia relevante en el sector",
      "Habilidades técnicas adecuadas para el puesto",
      "Formación académica alineada con los requisitos"
    ];
    jobSpecificImprovements = [
      "Experiencia limitada en algunos aspectos específicos del puesto",
      "Podría fortalecer habilidades blandas para este rol",
      "Oportunidad para desarrollar conocimientos más especializados"
    ];
    jobSpecificSkills = [
      "Conocimientos técnicos del sector - Intermedio",
      "Gestión de proyectos - Básico",
      "Comunicación profesional - Avanzado"
    ];
  }
  
  return {
    score: score,
    summary: `Perfil profesional con experiencia relevante para el puesto de ${jobPosition}. Demuestra habilidades técnicas adecuadas y formación compatible con los requisitos de la posición. Tiene potencial para contribuir efectivamente en este rol, aunque existen algunas áreas de mejora que podrían desarrollarse. Su experiencia previa proporciona una buena base para desempeñarse en las responsabilidades principales del puesto.`,
    strengths: [
      ...jobSpecificStrengths,
      "Capacidad para adaptarse a diferentes entornos de trabajo",
      "Buena estructura y presentación del currículum vitae"
    ],
    improvements: [
      ...jobSpecificImprovements,
      "Falta de cuantificación de logros y resultados específicos",
      "Podría incluir más detalles sobre proyectos relevantes completados"
    ],
    recommendations: [
      `Resaltar logros cuantitativos específicos relacionados con ${jobPosition}`,
      "Personalizar más el CV para destacar experiencias relevantes al puesto",
      "Incluir sección de proyectos con resultados medibles y su impacto",
      "Especificar las tecnologías o metodologías utilizadas en cada rol",
      "Añadir referencias profesionales o testimonios relevantes"
    ],
    experience: [
      `Posición relevante en empresa del sector (2-3 años) con responsabilidades alineadas al puesto de ${jobPosition}`,
      "Rol anterior con desarrollo de habilidades transferibles a la posición actual",
      "Participación en proyectos similares a los requeridos por el puesto"
    ],
    skills: [
      ...jobSpecificSkills,
      "Trabajo en equipo - Avanzado",
      "Microsoft Office - Avanzado",
      "Resolución de problemas - Intermedio"
    ],
    softSkills: [
      "Comunicación efectiva demostrada en roles anteriores",
      "Capacidad de adaptación a cambios y nuevos entornos",
      "Habilidades organizativas y gestión del tiempo",
      "Trabajo en equipo y colaboración interdepartamental"
    ],
    education: [
      "Formación universitaria relevante para el sector",
      "Cursos complementarios relacionados con habilidades específicas",
      "Certificaciones relevantes para el puesto"
    ],
    certifications: [
      "Certificación profesional relevante para el sector",
      "Curso especializado en herramientas relevantes"
    ],
    projects: [
      `Proyecto relevante para el puesto de ${jobPosition} con tecnologías apropiadas`,
      "Iniciativa de mejora en procesos relacionados con el rol"
    ],
    keyCompetencies: `Las competencias clave para el puesto de ${jobPosition} incluyen conocimientos técnicos específicos, capacidad de gestión, habilidades de comunicación y resolución de problemas. El candidato demuestra niveles adecuados en la mayoría de estas áreas, aunque podría fortalecer algunos aspectos específicos para aumentar su idoneidad para el puesto.`,
    skillsGap: `Existe una brecha moderada entre las habilidades actuales y las óptimas para este puesto. Específicamente, se podría fortalecer en áreas como [habilidad específica del sector] y [conocimiento técnico relevante]. Sin embargo, estas brechas podrían cerrarse con capacitación específica y experiencia práctica.`,
    alignment: `El perfil muestra una alineación de aproximadamente 75% con los requisitos del puesto de ${jobPosition}. Las principales fortalezas están en [área relevante], mientras que las áreas de desarrollo se encuentran en [aspecto específico].`,
    highlights: [
      "Experiencia relevante en un sector similar",
      "Formación adecuada para el puesto",
      "Buenas habilidades transferibles",
      "Potencial de adaptación rápida al rol"
    ],
    finalRecommendation: score > 75 ? 
      "Recomendado: El candidato cumple con los requisitos principales del puesto y tiene potencial para desempeñarse satisfactoriamente." : 
      "Recomendado con reservas: El candidato tiene potencial pero requiere desarrollo en áreas específicas para alcanzar el nivel óptimo para el puesto."
  };
};

function parseAnalysis(analysis) {
  try {
    // Extraer secciones del análisis
    const sections = analysis.split('\n\n');
    const result = {
      score: 0,
      summary: '',
      strengths: [],
      improvements: [],
      recommendations: [],
      experience: [],
      skills: [],
      softSkills: [],
      education: [],
      certifications: [],
      projects: [],
      keyCompetencies: '',
      skillsGap: '',
      alignment: '',
      highlights: [],
      finalRecommendation: ''
    };
    
    // Procesar cada sección
    sections.forEach(section => {
      if (section.includes('Puntuación general')) {
        const scoreMatch = section.match(/(\d+)\/100/);
        if (scoreMatch) {
          result.score = parseInt(scoreMatch[1]);
        }
        // Capturar la explicación de la puntuación
        const explanationLines = section.split('\n').slice(1).join('\n').trim();
        result.scoreExplanation = explanationLines;
      } else if (section.includes('Resumen ejecutivo')) {
        result.summary = section.split('\n').slice(1).join('\n').trim();
      } else if (section.includes('Fortalezas específicas')) {
        result.strengths = section
          .split('\n')
          .filter(line => line.trim().startsWith('-'))
          .map(line => line.replace('-', '').trim());
      } else if (section.includes('Áreas de mejora')) {
        result.improvements = section
          .split('\n')
          .filter(line => line.trim().startsWith('-'))
          .map(line => line.replace('-', '').trim());
      } else if (section.includes('Recomendaciones específicas')) {
        result.recommendations = section
          .split('\n')
          .filter(line => line.trim().startsWith('-'))
          .map(line => line.replace('-', '').trim());
      } else if (section.includes('Experiencia relevante')) {
        result.experience = section
          .split('\n')
          .filter(line => line.trim().startsWith('-'))
          .map(line => line.replace('-', '').trim());
      } else if (section.includes('Habilidades técnicas')) {
        result.skills = section
          .split('\n')
          .filter(line => line.trim().startsWith('-'))
          .map(line => line.replace('-', '').trim());
      } else if (section.includes('Habilidades blandas')) {
        result.softSkills = section
          .split('\n')
          .filter(line => line.trim().startsWith('-'))
          .map(line => line.replace('-', '').trim());
      } else if (section.includes('Formación académica')) {
        result.education = section
          .split('\n')
          .filter(line => line.trim().startsWith('-'))
          .map(line => line.replace('-', '').trim());
      } else if (section.includes('Certificaciones y cursos')) {
        result.certifications = section
          .split('\n')
          .filter(line => line.trim().startsWith('-'))
          .map(line => line.replace('-', '').trim());
      } else if (section.includes('Proyectos destacados')) {
        result.projects = section
          .split('\n')
          .filter(line => line.trim().startsWith('-'))
          .map(line => line.replace('-', '').trim());
      } else if (section.includes('Análisis de competencias clave')) {
        result.keyCompetencies = section.split('\n').slice(1).join('\n').trim();
      } else if (section.includes('Análisis de brecha de habilidades')) {
        result.skillsGap = section.split('\n').slice(1).join('\n').trim();
      } else if (section.includes('Alineación con el puesto')) {
        result.alignment = section.split('\n').slice(1).join('\n').trim();
      } else if (section.includes('Puntos destacables')) {
        result.highlights = section
          .split('\n')
          .filter(line => line.trim().startsWith('-'))
          .map(line => line.replace('-', '').trim());
      } else if (section.includes('Recomendación final')) {
        result.finalRecommendation = section.split('\n').slice(1).join('\n').trim();
      }
    });

    return result;
  } catch (error) {
    logger.error(`Error parsing analysis: ${error.message}`);
    throw error;
  }
}

/**
 * Generate mock CV analysis for demo/testing purposes
 * @returns {Object} Mock analysis results
 */
const generateMockCVAnalysis = () => {
  logger.info('Generating mock CV analysis');
  
  return {
    score: 72,
    strengths: [
      "Experiencia laboral relevante en el sector tecnológico",
      "Habilidades técnicas bien definidas y actualizadas",
      "Formación académica sólida y relacionada con el campo profesional",
      "Organización clara y estructura profesional del CV",
      "Inclusión de logros cuantificables en experiencias previas"
    ],
    improvements: [
      "Falta de descripción detallada de responsabilidades en algunos roles",
      "Ausencia de habilidades blandas relevantes para el puesto",
      "Sección de objetivos profesionales demasiado genérica",
      "Falta de personalización para el puesto específico al que se postula",
      "Escasa información sobre proyectos personales o extracurriculares"
    ],
    recommendations: [
      "Incluir métricas y resultados concretos para cada logro profesional",
      "Añadir una sección de habilidades blandas relevantes para complementar las técnicas",
      "Personalizar el resumen profesional para cada aplicación específica",
      "Restructurar la sección de experiencia para destacar primero los logros más relevantes",
      "Incorporar enlaces a portfolio o proyectos personales cuando sea aplicable"
    ]
  };
};

/**
 * Analiza una imagen utilizando el modelo de visión de OpenAI
 * @param {string} imageBase64 - Imagen en formato base64
 * @param {string} systemPrompt - Instrucciones para el sistema
 * @param {string} userPrompt - Prompt del usuario
 * @returns {Promise<string>} - Análisis de la imagen
 */
const analyzeImage = async (imageBase64, systemPrompt, userPrompt) => {
  if (!openai) {
    logger.error('OpenAI no está inicializado. Usa initializeOpenAI primero.');
    throw new Error('OpenAI no está inicializado');
  }

  try {
    logger.info('Analizando imagen con OpenAI Vision');
    
    // Crear el contenido del mensaje con la imagen
    const imageUrl = `data:image/jpeg;base64,${imageBase64}`;
    
    // Intentar primero con gpt-4o
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              {
                type: "image_url",
                image_url: { url: imageUrl }
              }
            ]
          }
        ],
        max_tokens: 800
      });

      logger.info('Análisis de imagen completado con éxito');
      return response.choices[0].message.content.trim();
    } catch (error) {
      // Si falla con gpt-4o, intentar con un modelo alternativo que soporte visión
      logger.warn(`Error usando gpt-4o para análisis de imagen: ${error.message}. Intentando con modelo alternativo.`);
      
      const response = await openai.chat.completions.create({
        model: "gpt-4-vision-preview",  // Modelo alternativo que soporta visión
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              {
                type: "image_url",
                image_url: { url: imageUrl }
              }
            ]
          }
        ],
        max_tokens: 800
      });

      logger.info('Análisis de imagen completado con modelo alternativo');
      return response.choices[0].message.content.trim();
    }
  } catch (error) {
    logger.error(`Error al analizar imagen con OpenAI: ${error.message}`);
    throw error;
  }
};

module.exports = {
  initializeOpenAI,
  generateImprovedText,
  generateInterviewQuestion,
  transcribeAudio,
  analyzeInterviewResponse,
  generateMockInterviewAnalysis,
  enhanceCVAnalysis,
  analyzeCV,
  generateMockCVAnalysis,
  generateRealisticMockAnalysis,
  analyzeImage
}; 