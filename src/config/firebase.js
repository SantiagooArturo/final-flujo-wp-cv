/**
 * Firebase configuration module
 * This module initializes Firebase Admin SDK for server-side operations
 * It also provides mock implementations when Firebase is not configured
 */

const admin = require('firebase-admin');
const dotenv = require('dotenv');
const logger = require('../utils/logger');

dotenv.config();

let firebaseApp;
let mockFirestore = null;
let usingMockImplementation = false;
let firebaseInitialized = false;

/**
 * Create a simple mock implementation for Firestore
 * This is used when Firebase credentials are not configured
 * @returns {Object} - Mock Firestore implementation
 */
const createMockFirestore = () => {
  logger.info('Creating mock Firestore implementation');
  
  // In-memory storage
  const collections = {};
  
  // Mock document reference
  class MockDocumentReference {
    constructor(collectionName, id) {
      this.collectionName = collectionName;
      this.id = id;
      this.data = {};
    }
    
    async get() {
      return {
        exists: !!this.data && Object.keys(this.data).length > 0,
        data: () => this.data,
        id: this.id,
      };
    }
    
    async set(data) {
      this.data = { ...data };
      logger.debug(`[MockFirestore] Set document ${this.collectionName}/${this.id}`);
      return true;
    }
    
    async update(data) {
      this.data = { ...this.data, ...data };
      logger.debug(`[MockFirestore] Updated document ${this.collectionName}/${this.id}`);
      return true;
    }
  }
  
  // Mock collection reference
  class MockCollectionReference {
    constructor(name) {
      this.name = name;
      if (!collections[name]) {
        collections[name] = {};
      }
    }
    
    doc(id = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`) {
      if (!collections[this.name][id]) {
        collections[this.name][id] = new MockDocumentReference(this.name, id);
      }
      return collections[this.name][id];
    }
    
    where() {
      // Simple mock, always returns empty array for queries
      return {
        orderBy: () => ({
          limit: () => ({
            get: async () => ({
              empty: true,
              docs: []
            })
          })
        })
      };
    }
  }
  
  // Mock Firestore instance
  return {
    collection: (name) => new MockCollectionReference(name),
  };
};

/**
 * Create a simple mock implementation for Storage
 * This is used when Firebase credentials are not configured
 * @returns {Object} - Mock Storage implementation
 */
const createMockStorage = () => {
  logger.info('Creating mock Storage implementation');
  
  return {
    name: 'mock-storage-bucket',
    file: (filePath) => ({
      save: async (content, options) => {
        logger.debug(`[MockStorage] Saved file ${filePath}`);
        return true;
      },
      makePublic: async () => {
        logger.debug(`[MockStorage] Made file public ${filePath}`);
        return true;
      }
    })
  };
};

/**
 * Initialize Firebase with credentials
 */
const initializeFirebase = () => {
  if (admin.apps.length) {
    logger.info('Firebase already initialized');
    return;
  }

  // Check if all required environment variables are present
  if (!process.env.FIREBASE_PROJECT_ID || 
      !process.env.FIREBASE_PRIVATE_KEY || 
      !process.env.FIREBASE_CLIENT_EMAIL) {
    logger.error('Firebase environment variables not configured');
    throw new Error('Firebase environment variables not configured');
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
    firebaseInitialized = true;
    logger.info('Firebase initialized successfully');
  } catch (error) {
    firebaseInitialized = false;
    logger.error(`Error initializing Firebase: ${error.message}`);
    throw error;
  }
};

/**
 * Check if Firebase is initialized
 * @returns {Boolean} - Whether Firebase is initialized
 */
const isInitialized = () => {
  return firebaseInitialized && admin.apps.length > 0;
};

/**
 * Get Firestore database instance
 * Returns mock implementation if Firebase is not configured
 */
const getFirestore = () => {
  if (usingMockImplementation) {
    if (!mockFirestore) { // Asegurar que el mock exista si se fuerza el uso
        logger.warn('[getFirestore] usingMockImplementation is true, but mockFirestore is null. Creating mock now.');
        mockFirestore = createMockFirestore();
    }
    logger.info('[getFirestore] Returning MOCK Firestore instance because usingMockImplementation is true.');
    return mockFirestore;
  }
  
  // Intentar inicializar si aún no se ha hecho y no estamos en modo mock forzado.
  // Esto es una salvaguarda, idealmente initializeFirebase() se llama una vez al inicio.
  if (!isInitialized()) {
    try {
      logger.warn('[getFirestore] Firebase not initialized, attempting to initialize now...');
      initializeFirebase(); // initializeFirebase puede lanzar un error o activar el mock si falla
    } catch (initError) {
        logger.error(`[getFirestore] Error during on-demand initialization: ${initError.message}. Will attempt to use mock.`);
        // No es necesario activar usingMockImplementation aquí si initializeFirebase ya lo hace al fallar
    }
    // Verificar de nuevo si la inicialización bajo demanda activó el mock
    if (usingMockImplementation) {
        logger.info('[getFirestore] Returning MOCK Firestore instance after on-demand initialization led to mock.');
        if (!mockFirestore) mockFirestore = createMockFirestore();
        return mockFirestore;
    }
  }
  
  if (!isInitialized() || !admin.apps.length || !admin.firestore) {
      logger.error('[getFirestore] CRITICAL: Firebase not properly initialized or admin.firestore is not available even after attempt. Falling back to MOCK.');
      if (!mockFirestore) {
        mockFirestore = createMockFirestore();
      }
      usingMockImplementation = true; // Marcar que estamos usando mock como último recurso
      return mockFirestore; 
  }
  
  const firestoreInstance = admin.firestore();
  logger.info(`[getFirestore] REAL admin.firestore() instance type: ${typeof firestoreInstance}`);
  if (firestoreInstance && typeof firestoreInstance.collection === 'function') {
    logger.info('[getFirestore] REAL instance has a .collection method.');
  } else {
    logger.error('[getFirestore] CRITICAL: REAL instance DOES NOT have a .collection method or is invalid. Returning MOCK as fallback.');
    // Loguear las propiedades del objeto para ver qué es
    if (firestoreInstance) {
        logger.info(`[getFirestore] Properties of firestoreInstance: ${Object.keys(firestoreInstance).join(', ')}`);
    }
    if (!mockFirestore) { // Asegurar que el mock exista
        mockFirestore = createMockFirestore();
    }
    usingMockImplementation = true; // Marcar que estamos usando mock
    return mockFirestore;
  }
  return firestoreInstance;
};

/**
 * Get Firebase Storage bucket
 * Returns mock implementation if Firebase is not configured
 */
const getStorage = () => {
  if (usingMockImplementation) {
    return createMockStorage();
  }
  
  if (!firebaseApp) {
    initializeFirebase();
    
    if (usingMockImplementation) {
      return createMockStorage();
    }
  }
  
  return admin.storage().bucket();
};

module.exports = {
  initializeFirebase,
  getFirestore,
  getStorage,
  admin,
  get usingMockImplementation() {
    return usingMockImplementation;
  },
  isInitialized
};
