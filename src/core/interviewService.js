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

module.exports = {
  generateInterviewQuestion,
  analyzeVideoResponse,
  getDefaultQuestion
}; 