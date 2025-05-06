const firebaseConfig = require('../config/firebase');
const logger = require('../utils/logger');
const admin = require('firebase-admin');

// Firestore collection name
const SESSIONS_COLLECTION = 'sessions';
const USERS_COLLECTION = 'users';

// Estados posibles de la conversación
const SessionState = {
  INITIAL: 'initial',              // Estado inicial
  TERMS_ACCEPTANCE: 'terms_acceptance', // Esperando aceptación de términos y condiciones
  MENU_SELECTION: 'menu_selection', // Selección de opción en el menú
  WAITING_FOR_POSITION_BEFORE_CV: 'waiting_for_position_before_cv', // Esperando posición antes de solicitar CV
  CV_RECEIVED: 'cv_received',      // CV recibido y analizado
  POST_CV_OPTIONS: 'post_cv_options', // Opciones después del análisis del CV
  POSITION_ASKED: 'position_asked', // Se preguntó por el puesto
  POSITION_RECEIVED: 'position_received', // Se recibió el puesto
  WAITING_INTERVIEW_CONFIRMATION: 'waiting_interview_confirmation', // Esperando confirmación para iniciar entrevista
  INTERVIEW_STARTED: 'interview_started', // Entrevista iniciada
  QUESTION_ASKED: 'question_asked', // Pregunta realizada
  ANSWER_RECEIVED: 'answer_received', // Respuesta recibida
  INTERVIEW_COMPLETED: 'interview_completed' // Entrevista completada
};

/**
 * Inicializar o recuperar la sesión de un usuario
 * @param {string} userId - ID del usuario
 * @returns {Promise<Object>} Datos de la sesión
 */
const getOrCreateSession = async (userId) => {
  try {
    if (!firebaseConfig.isInitialized()) {
      logger.warn('Firebase not initialized, using mock session');
      return {
        userId,
        state: SessionState.INITIAL,
        cvAnalysis: null,
        jobPosition: null,
        currentQuestion: 0,
        questions: [],
        answers: [],
        feedback: [],
        cvProcessed: false,
        termsAccepted: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };
    }

    const db = firebaseConfig.getFirestore();
    const sessionRef = db.collection(SESSIONS_COLLECTION).doc(userId.toString());
    
    // Verificar si la sesión ya existe
    const sessionDoc = await sessionRef.get();
    
    if (!sessionDoc.exists) {
      // Crear nueva sesión
      const newSession = {
        userId,
        state: SessionState.INITIAL,
        cvAnalysis: null,
        jobPosition: null,
        currentQuestion: 0,
        questions: [],
        answers: [],
        feedback: [],
        cvProcessed: false,
        termsAccepted: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await sessionRef.set(newSession);
      logger.info(`New session created for user: ${userId}`);
      return newSession;
    } else {
      // Devolver sesión existente
      const sessionData = sessionDoc.data();
      logger.info(`Session retrieved for user: ${userId}, state: ${sessionData.state}`);
      return sessionData;
    }
  } catch (error) {
    logger.error(`Error getting session: ${error.message}`);
    throw error;
  }
};

/**
 * Actualizar el estado de la sesión
 * @param {string} userId - ID del usuario
 * @param {string} state - Nuevo estado
 * @param {Object} data - Datos adicionales a actualizar
 * @returns {Promise<Object>} Sesión actualizada
 */
const updateSessionState = async (userId, state, data = {}) => {
  try {
    if (!firebaseConfig.isInitialized()) {
      logger.warn('Firebase not initialized, session state not updated');
      return {
        userId,
        state,
        ...data,
        updatedAt: new Date()
      };
    }

    const db = firebaseConfig.getFirestore();
    const sessionRef = db.collection(SESSIONS_COLLECTION).doc(userId.toString());
    
    const updateData = {
      state,
      ...data,
      updatedAt: new Date()
    };
    
    await sessionRef.update(updateData);
    logger.info(`Session state updated for user ${userId}: ${state}`);
    
    // Obtener la sesión actualizada
    const updatedSession = await sessionRef.get();
    return updatedSession.data();
  } catch (error) {
    logger.error(`Error updating session state: ${error.message}`);
    throw error;
  }
};

/**
 * Guardar el análisis del CV en la sesión
 * @param {string} userId - ID del usuario
 * @param {Object} cvAnalysis - Análisis del CV
 * @returns {Promise<Object>} Sesión actualizada
 */
const saveCVAnalysis = async (userId, cvAnalysis) => {
  return updateSessionState(userId, SessionState.CV_RECEIVED, {
    cvAnalysis,
    updatedAt: new Date()
  });
};

/**
 * Guardar el puesto al que aplica el usuario
 * @param {string} userId - ID del usuario
 * @param {string} jobPosition - Puesto laboral
 * @returns {Promise<Object>} Sesión actualizada
 */
const saveJobPosition = async (userId, jobPosition) => {
  return updateSessionState(userId, SessionState.POSITION_RECEIVED, {
    jobPosition,
    updatedAt: new Date()
  });
};

/**
 * Guardar una pregunta de entrevista
 * @param {string} userId - ID del usuario
 * @param {Object} question - Pregunta de entrevista
 * @returns {Promise<Object>} Sesión actualizada
 */
const saveInterviewQuestion = async (userId, question) => {
  try {
    const session = await getOrCreateSession(userId);
    const questions = [...(session.questions || []), question];
    const currentQuestion = questions.length - 1;
    
    return updateSessionState(userId, SessionState.QUESTION_ASKED, {
      questions,
      currentQuestion,
      updatedAt: new Date()
    });
  } catch (error) {
    logger.error(`Error saving interview question: ${error.message}`);
    throw error;
  }
};

/**
 * Guardar una respuesta de entrevista
 * @param {string} userId - ID del usuario
 * @param {Object} answer - Respuesta con transcripción y análisis
 * @returns {Promise<Object>} Sesión actualizada
 */
const saveInterviewAnswer = async (userId, answer) => {
  try {
    const session = await getOrCreateSession(userId);
    const answers = [...(session.answers || [])];
    answers[session.currentQuestion] = answer;
    
    // Determinar si la entrevista ha terminado
    const isCompleted = answers.length >= 4 && !answers.includes(undefined);
    const newState = isCompleted ? SessionState.INTERVIEW_COMPLETED : SessionState.ANSWER_RECEIVED;
    
    return updateSessionState(userId, newState, {
      answers,
      updatedAt: new Date()
    });
  } catch (error) {
    logger.error(`Error saving interview answer: ${error.message}`);
    throw error;
  }
};

/**
 * Iniciar la entrevista
 * @param {string} userId - ID del usuario
 * @returns {Promise<Object>} Sesión actualizada
 */
const startInterview = async (userId) => {
  return updateSessionState(userId, SessionState.INTERVIEW_STARTED, {
    questions: [],
    answers: [],
    feedback: [],
    currentQuestion: 0,
    updatedAt: new Date()
  });
};

/**
 * Resetear la sesión de un usuario, preservando si ya aceptó términos y condiciones
 * @param {string} userId - ID del usuario
 * @returns {Promise<Object>} New session object
 */
const resetSession = async (userId) => {
  try {
    logger.info(`Resetting session for user ${userId}`);
    
    // Si Firebase está inicializado, recuperar el valor actual de termsAccepted
    let termsAccepted = false;
    if (firebaseConfig.isInitialized()) {
      const db = firebaseConfig.getFirestore();
      const currentSession = await db.collection(SESSIONS_COLLECTION).doc(userId).get();
      if (currentSession.exists) {
        termsAccepted = currentSession.data().termsAccepted || false;
        logger.info(`Retrieved termsAccepted value for user ${userId}: ${termsAccepted}`);
      }
      
      // Delete existing session completely
      await db.collection(SESSIONS_COLLECTION).doc(userId).delete();
      logger.info(`Session document deleted for user ${userId}`);
    }
    
    // Create a completely fresh session while preserving terms acceptance status
    const newSession = {
      id: userId,
      state: SessionState.INITIAL,
      createdAt: new Date(),
      updatedAt: new Date(),
      // Do not keep any history from previous sessions
      cvProcessed: false,
      processingCV: false,
      jobPosition: null,
      lastPdfUrl: null,
      hasReceivedWelcomeMessage: false, // Inicializar esta bandera
      termsAccepted: termsAccepted // Preservar el estado de aceptación de términos
    };
    
    if (firebaseConfig.isInitialized()) {
      const db = firebaseConfig.getFirestore();
      await db.collection(SESSIONS_COLLECTION).doc(userId).set(newSession);
    }
    
    logger.info(`Session reset complete for user ${userId}`);
    return newSession;
  } catch (error) {
    logger.error(`Error resetting session: ${error.message}`);
    throw error;
  }
};

/**
 * Save current question in session
 * @param {string} userId - User ID
 * @param {string} question - Question text
 * @returns {Promise<void>}
 */
const saveQuestion = async (userId, question) => {
  try {
    if (!firebaseConfig.isInitialized()) {
      logger.warn('Firebase not initialized, question not saved');
      return;
    }
    
    const db = firebaseConfig.getFirestore();
    const session = await getOrCreateSession(userId);
    const questions = [...(session.questions || []), question];
    const currentQuestion = questions.length - 1;
    
    return updateSessionState(userId, SessionState.QUESTION_ASKED, {
      questions,
      currentQuestion,
      updatedAt: new Date()
    });
  } catch (error) {
    logger.error(`Error saving question for user ${userId}: ${error.message}`);
    throw error;
  }
};

const updateSession = async (userId, data) => {
  try {
    if (!firebaseConfig.isInitialized()) {
      logger.warn('Firebase not initialized, session not updated');
      return {
        userId,
        ...data,
        updatedAt: new Date()
      };
    }

    const db = firebaseConfig.getFirestore();
    const sessionRef = db.collection(SESSIONS_COLLECTION).doc(userId.toString());

    // Verificar si el documento existe
    const sessionDoc = await sessionRef.get();
    const updateData = {
      ...data,
      updatedAt: new Date()
    };

    if (sessionDoc.exists) {
      await sessionRef.update(updateData);
      logger.info(`Session updated for user ${userId}`);
    } else {
      await sessionRef.set(updateData); // Crea el documento si no existe
      logger.info(`Session created for user ${userId}`);
    }

    // Obtener la sesión actualizada
    const updatedSession = await sessionRef.get();
    return updatedSession.data();
  } catch (error) {
    logger.error(`Error updating session: ${error.message}`);
    throw error;
  }
};

module.exports = {
  SessionState,
  getOrCreateSession,
  updateSessionState,
  saveCVAnalysis,
  saveJobPosition,
  saveInterviewQuestion,
  saveInterviewAnswer,
  startInterview,
  resetSession,
  saveQuestion,
  updateSession
}; 