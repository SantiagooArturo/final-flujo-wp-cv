const firebaseConfig = require('../config/firebase');
const logger = require('../utils/logger');
const admin = require('firebase-admin');

// Firestore collection name
const USERS_COLLECTION = 'users';
const USER_CV_ANALYSIS_COLLECTION = 'user_cv_analysis';

/**
 * Registrar un nuevo usuario en Firestore o actualizar existente
 * @param {string} userId - ID del usuario (número de WhatsApp)
 * @param {Object} userData - Datos adicionales del usuario (opcional)
 * @returns {Promise<Object>} Datos del usuario
 */
const registerOrUpdateUser = async (userId, userData = {}) => {
  try {
    if (!firebaseConfig.isInitialized()) {
      logger.warn('Firebase not initialized, skipping user registration');
      return { id: userId, ...userData };
    }

    const db = firebaseConfig.getFirestore();
    const userRef = db.collection(USERS_COLLECTION).doc(userId.toString());
    
    // Verificar si el usuario ya existe
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      // Crear nuevo usuario
      const newUser = {
        id: userId,
        name: userData.name || 'Unknown',
        phoneNumber: userId,
        career: userData.career || 'Unknown', 
        createdAt: new Date(),
        updatedAt: new Date(),
        totalCVAnalyzed: 0,
        ...userData
      };
      
      await userRef.set(newUser);
      logger.info(`New user registered: ${userId}`);
      return newUser;
    } else {
      // Actualizar usuario existente
      const updatedData = {
        updatedAt: new Date(),
        ...userData
      };
      
      await userRef.update(updatedData);
      logger.info(`User updated: ${userId}`);
      
      // Obtener datos actualizados
      const updatedDoc = await userRef.get();
      return updatedDoc.data();
    }
  } catch (error) {
    logger.error(`Error registering/updating user: ${error.message}`);
    throw error;
  }
};

/**
 * Registrar un análisis de CV para un usuario
 * @param {string} userId - ID del usuario
 * @param {Object} analysis - Resultados del análisis
 * @param {string} jobPosition - Puesto evaluado
 * @returns {Promise<Object>} Registro de análisis
 */
const recordCVAnalysis = async (userId, analysis, jobPosition) => {
  try {
    if (!firebaseConfig.isInitialized()) {
      logger.warn('Firebase not initialized, skipping CV analysis recording');
      return { userId, analysis, jobPosition, timestamp: new Date() };
    }

    const db = firebaseConfig.getFirestore();
    
    // Crear registro de análisis
    const analysisRef = db.collection(USER_CV_ANALYSIS_COLLECTION).doc();
    const analysisData = {
      id: analysisRef.id,
      userId: userId,
      analysis: analysis,
      jobPosition: jobPosition,
      timestamp: new Date()
    };
    
    await analysisRef.set(analysisData);
    
    // Actualizar contador de análisis del usuario
    const userRef = db.collection(USERS_COLLECTION).doc(userId.toString());
    
    // Obtener datos actuales del usuario
    const userDoc = await userRef.get();
    if (userDoc.exists) {
      const userData = userDoc.data();
      await userRef.update({
        totalCVAnalyzed: (userData.totalCVAnalyzed || 0) + 1,
        lastCVAnalysis: new Date()
      });
    }
    
    logger.info(`CV analysis recorded for user ${userId}`);
    return analysisData;
  } catch (error) {
    logger.error(`Error recording CV analysis: ${error.message}`);
    throw error;
  }
};

/**
 * Verificar si un usuario ya ha analizado un CV
 * @param {string} userId - ID del usuario
 * @returns {Promise<boolean>} True si el usuario ya ha analizado un CV
 */
const hasUserAnalyzedCV = async (userId) => {
  try {
    if (!firebaseConfig.isInitialized()) {
      logger.warn('Firebase not initialized, using session-based check instead');
      return false;
    }

    const db = firebaseConfig.getFirestore();
    
    // Buscar análisis previos para este usuario
    const analysisQuery = db.collection(USER_CV_ANALYSIS_COLLECTION)
      .where('userId', '==', userId.toString())
      .limit(1);
    
    const querySnapshot = await analysisQuery.get();
    
    return !querySnapshot.empty;
  } catch (error) {
    logger.error(`Error checking if user has analyzed CV: ${error.message}`);
    return false; // Ante la duda, permitir el análisis
  }
};

/**
 * Obtener el número de análisis de CV realizados por un usuario
 * @param {string} userId - ID del usuario
 * @returns {Promise<number>} Número de análisis
 */
const getCVAnalysisCount = async (userId) => {
  try {
    if (!firebaseConfig.isInitialized()) {
      logger.warn('Firebase not initialized, unable to get analysis count');
      return 0;
    }

    const db = firebaseConfig.getFirestore();
    
    // Obtener usuario
    const userRef = db.collection(USERS_COLLECTION).doc(userId.toString());
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return 0;
    }
    
    const userData = userDoc.data();
    return userData.totalCVAnalyzed || 0;
  } catch (error) {
    logger.error(`Error getting CV analysis count: ${error.message}`);
    return 0;
  }
};

/**
 * Verificar si un usuario ha alcanzado el límite gratuito de análisis de CV
 * @param {string} userId - ID del usuario
 * @param {number} freeLimit - Límite gratuito (por defecto: 1)
 * @returns {Promise<boolean>} True si el usuario debe pagar por más análisis
 */
const shouldUserPayForCVAnalysis = async (userId, freeLimit = 1) => {
  try {
    const analysisCount = await getCVAnalysisCount(userId);
    
    // Verificar si el usuario tiene créditos disponibles
    const userCredits = await getCVCredits(userId);
    if (userCredits > 0) {
      return false; // No debe pagar si tiene créditos
    }
    
    return analysisCount >= freeLimit;
  } catch (error) {
    logger.error(`Error checking if user should pay: ${error.message}`);
    return false; // Ante la duda, permitir el análisis gratuito
  }
};

/**
 * Obtener la cantidad de créditos de CV disponibles para un usuario
 * @param {string} userId - ID del usuario
 * @returns {Promise<number>} Número de créditos disponibles
 */
const getCVCredits = async (userId) => {
  try {
    if (!firebaseConfig.isInitialized()) {
      logger.warn('Firebase not initialized, unable to get credits');
      return 0;
    }

    const db = firebaseConfig.getFirestore();
    
    // Obtener usuario
    const userRef = db.collection(USERS_COLLECTION).doc(userId.toString());
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return 0;
    }
    
    const userData = userDoc.data();
    return userData.cvCredits || 0;
  } catch (error) {
    logger.error(`Error getting CV credits: ${error.message}`);
    return 0;
  }
};

/**
 * Añadir créditos de CV a un usuario
 * @param {string} userId - ID del usuario
 * @param {number} credits - Cantidad de créditos a añadir
 * @returns {Promise<number>} Nuevo total de créditos
 */
const addCVCredits = async (userId, credits) => {
  try {
    if (!firebaseConfig.isInitialized()) {
      logger.warn('Firebase not initialized, unable to add credits');
      return credits;
    }

    const db = firebaseConfig.getFirestore();
    
    // Obtener usuario
    const userRef = db.collection(USERS_COLLECTION).doc(userId.toString());
    const userDoc = await userRef.get();
    
    let currentCredits = 0;
    if (userDoc.exists) {
      const userData = userDoc.data();
      currentCredits = userData.cvCredits || 0;
    } else {
      // Crear usuario si no existe
      await registerOrUpdateUser(userId, { cvCredits: 0 });
    }
    
    // Actualizar créditos
    const newCredits = currentCredits + credits;
    await userRef.update({
      cvCredits: newCredits,
      lastCreditUpdate: new Date()
    });
    
    logger.info(`Added ${credits} CV credits for user ${userId}. New total: ${newCredits}`);
    return newCredits;
  } catch (error) {
    logger.error(`Error adding CV credits: ${error.message}`);
    throw error;
  }
};

/**
 * Usar un crédito de CV
 * @param {string} userId - ID del usuario
 * @returns {Promise<boolean>} True si se pudo usar un crédito
 */
const useCVCredit = async (userId) => {
  try {
    const credits = await getCVCredits(userId);
    
    if (credits <= 0) {
      return false; // No hay créditos disponibles
    }
    
    const db = firebaseConfig.getFirestore();
    const userRef = db.collection(USERS_COLLECTION).doc(userId.toString());
    
    await userRef.update({
      cvCredits: credits - 1,
      lastCreditUsed: new Date()
    });
    
    logger.info(`Used 1 CV credit for user ${userId}. Remaining: ${credits - 1}`);
    return true;
  } catch (error) {
    logger.error(`Error using CV credit: ${error.message}`);
    return false;
  }
};

/**
 * Obtener el número de créditos de CV disponibles para un usuario
 * @param {string} userId - ID del usuario
 * @returns {Promise<number>} Número de créditos restantes
 */
const getRemainingCVCredits = async (userId) => {
  try {
    // Usar la función existente para obtener los créditos
    return await getCVCredits(userId);
  } catch (error) {
    logger.error(`Error getting remaining CV credits: ${error.message}`);
    return 0; // En caso de error, asumir que no hay créditos
  }
};

/**
 * Registra una nueva transacción en el historial del usuario y actualiza el total gastado
 * @param {string} userId - ID del usuario
 * @param {number} amount - Monto de la transacción
 * @param {string} serviceType - Tipo de servicio (ej: 'cv_credits', 'advisor_cv', 'advisor_interview')
 * @param {string} description - Descripción de la transacción
 * @returns {Promise<Object>} Datos de la transacción registrada
 */
const recordTransaction = async (userId, amount, serviceType, description) => {
  try {
    if (!firebaseConfig.isInitialized()) {
      logger.warn('Firebase not initialized, skipping transaction record');
      return { userId, amount, serviceType, description, timestamp: new Date() };
    }

    const db = firebaseConfig.getFirestore();
    const userRef = db.collection(USERS_COLLECTION).doc(userId.toString());
    
    // Obtener los datos actuales del usuario
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      // Si el usuario no existe, lo creamos primero
      await registerOrUpdateUser(userId);
    }
    
    // Crear objeto de transacción
    const transaction = {
      amount: amount,
      serviceType: serviceType,
      description: description,
      timestamp: new Date()
    };
    
    // Actualizar usuario en una transacción de Firebase para evitar condiciones de carrera
    await db.runTransaction(async (t) => {
      // Volver a obtener el documento más reciente dentro de la transacción
      const doc = await t.get(userRef);
      const userData = doc.exists ? doc.data() : {};
      
      // Obtener el array de transacciones y el total gastado actuales o iniciar con valores por defecto
      const transactions = userData.transactions || [];
      const currentTotalSpent = userData.totalSpent || 0;
      
      // Añadir la nueva transacción al array
      transactions.push(transaction);
      
      // Actualizar el total gastado
      const newTotalSpent = currentTotalSpent + amount;
      
      // Actualizar el documento
      t.update(userRef, { 
        transactions: transactions,
        totalSpent: newTotalSpent,
        updatedAt: new Date() 
      });
    });
    
    logger.info(`Transaction recorded for user ${userId}: ${amount} for ${serviceType}`);
    return transaction;
  } catch (error) {
    logger.error(`Error recording transaction: ${error.message}`);
    throw error;
  }
};

/**
 * Obtiene el total gastado por un usuario
 * @param {string} userId - ID del usuario
 * @returns {Promise<number>} Total gastado
 */
const getTotalSpent = async (userId) => {
  try {
    if (!firebaseConfig.isInitialized()) {
      logger.warn('Firebase not initialized, unable to get total spent');
      return 0;
    }

    const db = firebaseConfig.getFirestore();
    
    // Obtener usuario
    const userRef = db.collection(USERS_COLLECTION).doc(userId.toString());
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return 0;
    }
    
    const userData = userDoc.data();
    return userData.totalSpent || 0;
  } catch (error) {
    logger.error(`Error getting total spent: ${error.message}`);
    return 0;
  }
};

/**
 * Obtiene el historial de transacciones de un usuario
 * @param {string} userId - ID del usuario
 * @returns {Promise<Array>} Lista de transacciones
 */
const getTransactionHistory = async (userId) => {
  try {
    if (!firebaseConfig.isInitialized()) {
      logger.warn('Firebase not initialized, unable to get transaction history');
      return [];
    }

    const db = firebaseConfig.getFirestore();
    
    // Obtener usuario
    const userRef = db.collection(USERS_COLLECTION).doc(userId.toString());
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      return [];
    }
    
    const userData = userDoc.data();
    return userData.transactions || [];
  } catch (error) {
    logger.error(`Error getting transaction history: ${error.message}`);
    return [];
  }
};

/**
 * Estima el tamaño de los datos de un documento de usuario en Firestore.
 * @param {string} userId - ID del usuario.
 * @returns {Promise<number>} Tamaño estimado en bytes, o -1 si el usuario no existe o hay un error.
 */
const estimateUserDocumentSize = async (userId) => {
  try {
    if (!firebaseConfig.isInitialized()) {
      logger.warn('Firebase not initialized, cannot estimate document size.');
      return -1;
    }

    const db = firebaseConfig.getFirestore();
    const userRef = db.collection(USERS_COLLECTION).doc(userId.toString());
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      logger.info(`User document ${userId} does not exist. Cannot estimate size.`);
      return -1;
    }

    const userData = userDoc.data();
    const jsonString = JSON.stringify(userData);
    const sizeInBytes = Buffer.byteLength(jsonString, 'utf8'); // Más preciso para UTF-8

    logger.info(`Estimated size for user document ${userId}: ${sizeInBytes} bytes.`);
    return sizeInBytes;

  } catch (error) {
    logger.error(`Error estimating user document size for ${userId}: ${error.message}`);
    return -1;
  }
};

module.exports = {
  registerOrUpdateUser,
  recordCVAnalysis,
  hasUserAnalyzedCV,
  getCVAnalysisCount,
  shouldUserPayForCVAnalysis,
  getCVCredits,
  addCVCredits,
  useCVCredit,
  getRemainingCVCredits,
  recordTransaction,
  getTotalSpent,
  getTransactionHistory,
  estimateUserDocumentSize
};