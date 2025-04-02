const openaiUtil = require('../utils/openaiUtil');
const logger = require('../utils/logger');

/**
 * Generate an interview question based on job type
 * @param {string} type - Type of job (e.g., 'software', 'marketing', 'sales')
 * @returns {Promise<Object>} Question object
 */
const generateInterviewQuestion = async (type) => {
  try {
    // Normalizar el tipo de trabajo para coincidir con categorías predefinidas
    const normalizedType = normalizeJobType(type);
    logger.info(`Generating interview question for job type: ${normalizedType} (original: ${type})`);
    
    // Check if openaiUtil has the generateInterviewQuestion function
    if (typeof openaiUtil.generateInterviewQuestion === 'function') {
      // Incluir el tipo original y el normalizado para un contexto más rico
      const question = await openaiUtil.generateInterviewQuestion(normalizedType, type);
      return {
        question,
        type: normalizedType,
        originalType: type,
        timestamp: new Date(),
      };
    } else {
      // Fallback to default question if the function doesn't exist
      logger.warn(`openaiUtil.generateInterviewQuestion not available, using default question for ${normalizedType}`);
      return getDefaultQuestion(normalizedType, type);
    }
  } catch (error) {
    logger.error(`Error generating interview question: ${error.message}`);
    // Fallback to default question on error
    logger.info(`Falling back to default question for ${type}`);
    return getDefaultQuestion(normalizeJobType(type), type);
  }
};

/**
 * Normalize job type to a standard category
 * @param {string} jobType - Original job type string from user
 * @returns {string} Normalized job type
 */
const normalizeJobType = (jobType) => {
  if (!jobType) return 'general';
  
  const jobTypeLower = jobType.toLowerCase();
  
  // Software/Development roles
  if (jobTypeLower.includes('software') || 
      jobTypeLower.includes('desarrollador') || 
      jobTypeLower.includes('programador') || 
      jobTypeLower.includes('ingeniero') || 
      jobTypeLower.includes('developer') || 
      jobTypeLower.includes('código') || 
      jobTypeLower.includes('fullstack') || 
      jobTypeLower.includes('back') || 
      jobTypeLower.includes('front') || 
      jobTypeLower.includes('web')) {
    return 'software';
  }
  
  // Marketing roles
  if (jobTypeLower.includes('marketing') || 
      jobTypeLower.includes('digital') || 
      jobTypeLower.includes('contenido') || 
      jobTypeLower.includes('redes') || 
      jobTypeLower.includes('community') || 
      jobTypeLower.includes('seo') || 
      jobTypeLower.includes('sem') || 
      jobTypeLower.includes('publicidad')) {
    return 'marketing';
  }
  
  // Design roles
  if (jobTypeLower.includes('diseño') || 
      jobTypeLower.includes('design') || 
      jobTypeLower.includes('ux') || 
      jobTypeLower.includes('ui') || 
      jobTypeLower.includes('gráfico') || 
      jobTypeLower.includes('creative') || 
      jobTypeLower.includes('artista')) {
    return 'design';
  }
  
  // Sales roles
  if (jobTypeLower.includes('ventas') || 
      jobTypeLower.includes('sales') || 
      jobTypeLower.includes('comercial') || 
      jobTypeLower.includes('account') || 
      jobTypeLower.includes('business') ||
      jobTypeLower.includes('cliente')) {
    return 'sales';
  }
  
  // Project Management roles
  if (jobTypeLower.includes('project') || 
      jobTypeLower.includes('producto') || 
      jobTypeLower.includes('product') || 
      jobTypeLower.includes('manager') || 
      jobTypeLower.includes('pm') || 
      jobTypeLower.includes('agile') || 
      jobTypeLower.includes('scrum')) {
    return 'pm';
  }
  
  // HR roles
  if (jobTypeLower.includes('rh') || 
      jobTypeLower.includes('recursos') || 
      jobTypeLower.includes('hr') || 
      jobTypeLower.includes('human') || 
      jobTypeLower.includes('talento') || 
      jobTypeLower.includes('talent')) {
    return 'hr';
  }
  
  // Data roles
  if (jobTypeLower.includes('data') || 
      jobTypeLower.includes('datos') || 
      jobTypeLower.includes('analista') || 
      jobTypeLower.includes('analyst') || 
      jobTypeLower.includes('business intelligence') || 
      jobTypeLower.includes('bi') || 
      jobTypeLower.includes('machine learning') ||
      jobTypeLower.includes('ml') ||
      jobTypeLower.includes('ai') ||
      jobTypeLower.includes('ia')) {
    return 'data';
  }
  
  // Finance roles
  if (jobTypeLower.includes('finanza') || 
      jobTypeLower.includes('finance') || 
      jobTypeLower.includes('contable') || 
      jobTypeLower.includes('contador') || 
      jobTypeLower.includes('accounting') || 
      jobTypeLower.includes('tesorería')) {
    return 'finance';
  }
  
  // Si no coincide con ninguna de las categorías anteriores, devolver general
  return 'general';
};

/**
 * Analyze video response and provide feedback
 * @param {Buffer} videoBuffer - Video buffer
 * @param {string} question - Original question
 * @returns {Promise<Object>} Analysis results
 */
const analyzeVideoResponse = async (videoBuffer, question) => {
  try {
    // This will be implemented later with video analysis
    return {
      score: 0,
      feedback: 'Video analysis not implemented yet',
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error(`Error analyzing video response: ${error.message}`);
    throw error;
  }
};

/**
 * Get default interview question based on job type
 * @param {string} jobType - Type of job
 * @returns {Object} Question data
 */
const getDefaultQuestion = (jobType) => {
  // Lista de preguntas predefinidas por tipo de trabajo
  const questions = {
    "tech lead": [
      "Describe un proyecto técnico complejo que hayas liderado. ¿Cuáles fueron los mayores desafíos arquitectónicos y cómo los resolviste?",
      "¿Cómo gestionas la deuda técnica en un proyecto con plazos ajustados cuando tu equipo está bajo presión para entregar nuevas funcionalidades?",
      "Cuéntame sobre una situación en la que tuviste que mediar un desacuerdo técnico entre miembros de tu equipo. ¿Cómo lo manejaste y cuál fue el resultado?",
      "¿Qué estrategias has implementado para mejorar la calidad del código y reducir los bugs en los proyectos que has liderado?",
      "Describe cómo has manejado la transición a una nueva tecnología o framework. ¿Cómo minimizaste el impacto en la productividad del equipo?",
      "¿Cómo equilibras las necesidades técnicas a largo plazo con las demandas comerciales a corto plazo?"
    ],
    "software": [
      "Describe un problema técnico complejo que hayas resuelto. ¿Cuál fue tu enfoque y cómo llegaste a la solución?",
      "¿Cómo gestionas tu trabajo cuando te enfrentas a requisitos ambiguos o cambiantes?",
      "Cuéntame sobre una ocasión en la que tuviste que optimizar el rendimiento de una aplicación. ¿Qué estrategias utilizaste?",
      "¿Cómo te mantienes actualizado con las nuevas tecnologías y tendencias en desarrollo de software?",
      "Describe una situación en la que hayas tenido que priorizar tareas técnicas. ¿Qué criterios utilizaste?"
    ],
    "default": [
      "¿Podrías contarme sobre tu experiencia profesional relevante para este puesto?",
      "Describe una situación difícil en tu trabajo anterior y cómo la manejaste.",
      "¿Cuáles consideras que son tus principales fortalezas y debilidades profesionales?",
      "¿Por qué te interesa este puesto y cómo crees que puedes contribuir?",
      "¿Cuáles son tus objetivos profesionales a largo plazo?"
    ]
  };
  
  // Normalizar el tipo de trabajo para la búsqueda
  const normalizedJobType = jobType.toLowerCase().trim();
  
  // Buscar preguntas para el tipo de trabajo específico, con fallback a predeterminadas
  let jobQuestions = questions[normalizedJobType] || questions["default"];
  
  // Para Tech Lead, intentar buscar con y sin espacio
  if (!jobQuestions && normalizedJobType.includes("tech") && normalizedJobType.includes("lead")) {
    jobQuestions = questions["tech lead"];
  }
  
  // Si sigue sin encontrar, usar preguntas predeterminadas
  if (!jobQuestions) {
    jobQuestions = questions["default"];
  }
  
  // Seleccionar una pregunta aleatoria
  const randomQuestion = jobQuestions[Math.floor(Math.random() * jobQuestions.length)];
  
  return {
    question: randomQuestion,
    type: jobType,
    originalType: jobType,
    timestamp: new Date()
  };
};

/**
 * Generate mock interview analysis for simulation
 * @param {Object} question - Question object
 * @returns {Object} Mock analysis results
 */
function generateMockInterviewAnalysis(question) {
  const mockAnalysis = {
    score: Math.floor(Math.random() * 3) + 7, // Random score between 7-9
    summary: "Tu respuesta muestra buena preparación y comunicación efectiva aunque hay áreas de mejora.",
    strengths: [
      "Buena estructura en la respuesta",
      "Comunicación clara y concisa",
      "Uso de ejemplos específicos"
    ],
    weaknesses: [
      "Podrías profundizar más en algunos puntos",
      "La respuesta podría beneficiarse de más datos concretos",
      "Oportunidad para mostrar más entusiasmo en la comunicación"
    ],
    suggestions: [
      "Incluye más métricas o resultados específicos de tu experiencia",
      "Practica un tono más dinámico y entusiasta",
      "Refuerza tus puntos con ejemplos de situaciones reales"
    ]
  };
  
  return mockAnalysis;
}

module.exports = {
  generateInterviewQuestion,
  analyzeVideoResponse,
  getDefaultQuestion,
  generateMockInterviewAnalysis,
  normalizeJobType
}; 