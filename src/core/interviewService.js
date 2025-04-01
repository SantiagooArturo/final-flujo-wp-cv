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
 * Get a default question for a job type
 * @param {string} type - Normalized type of job
 * @param {string} originalType - Original job type string from user
 * @returns {Object} Default question
 */
const getDefaultQuestion = (type, originalType = '') => {
  const questions = {
    software: '¿Podrías describir un proyecto desafiante de desarrollo de software en el que hayas trabajado y cómo resolviste los problemas técnicos que surgieron?',
    marketing: '¿Cómo has medido el éxito de tus campañas de marketing digital y qué métricas consideras más importantes para evaluar el ROI?',
    sales: '¿Puedes contarme sobre una situación difícil de ventas que hayas enfrentado y cómo lograste cerrar el trato?',
    design: '¿Cómo adaptas tu proceso de diseño cuando trabajas con restricciones de tiempo y recursos limitados?',
    pm: '¿Cómo priorizas tareas y requisitos cuando estás gestionando un proyecto con plazos ajustados?',
    hr: '¿Cómo evalúas y seleccionas candidatos para posiciones técnicas especializadas fuera de tu área de experiencia?',
    data: '¿Podrías explicar cómo has utilizado el análisis de datos para resolver un problema de negocio complejo?',
    finance: '¿Cómo preparas y presentas informes financieros para que sean comprensibles para audiencias no financieras?',
    general: `¿Podrías contarme sobre tu experiencia profesional relevante para el puesto de ${originalType || 'al que aspiras'}?`
  };

  return {
    question: questions[type] || questions.general,
    type,
    originalType,
    timestamp: new Date(),
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