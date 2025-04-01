const openaiUtil = require('../utils/openaiUtil');
const logger = require('../utils/logger');

/**
 * Generate an interview question based on job type
 * @param {string} type - Type of job (e.g., 'software', 'marketing', 'sales')
 * @returns {Promise<Object>} Question object
 */
const generateInterviewQuestion = async (type) => {
  try {
    const question = await openaiUtil.generateInterviewQuestion(type);
    return {
      question,
      type,
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error(`Error generating interview question: ${error.message}`);
    throw error;
  }
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
 * @param {string} type - Type of job
 * @returns {Object} Default question
 */
const getDefaultQuestion = (type) => {
  const questions = {
    software: '¿Podrías describir tu experiencia con desarrollo de software?',
    marketing: '¿Cómo has manejado campañas de marketing exitosas?',
    sales: '¿Cuál es tu estrategia para cerrar ventas?',
    default: '¿Podrías contarme sobre tu experiencia profesional?'
  };

  return {
    question: questions[type] || questions.default,
    type,
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
  generateMockInterviewAnalysis
}; 