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
 * Initialize Firebase Admin SDK
 * Uses service account credentials from environment or credential file
 * Falls back to mock implementations if credentials are not available
 */
const initializeFirebase = () => {
  if (firebaseApp) {
    return firebaseApp;
  }
  
  if (!process.env.FIREBASE_PROJECT_ID) {
    logger.warn('Firebase project ID not set, using mock implementations');
    usingMockImplementation = true;
    mockFirestore = createMockFirestore();
    return null;
  }
  
  try {
    // Check if we have a full service account JSON with private key
    if (process.env.FIREBASE_SERVICE_ACCOUNT && 
        process.env.FIREBASE_SERVICE_ACCOUNT.includes('"private_key"')) {
      // Parse credentials from environment variable
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      
      firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      });
      
      logger.info('Firebase initialized with service account credentials');
    } 
    // For all other cases (client credentials or project ID only), use mock implementation
    else {
      logger.warn('No full service account credentials found, using mock implementations');
      usingMockImplementation = true;
      mockFirestore = createMockFirestore();
      return null;
    }
    
    logger.info('Firebase initialized successfully');
    return firebaseApp;
  } catch (error) {
    logger.error(`Error initializing Firebase: ${error.message}`);
    logger.warn('Falling back to mock implementations');
    usingMockImplementation = true;
    mockFirestore = createMockFirestore();
    return null;
  }
};

/**
 * Get Firestore database instance
 * Returns mock implementation if Firebase is not configured
 */
const getFirestore = () => {
  if (usingMockImplementation) {
    return mockFirestore;
  }
  
  if (!firebaseApp) {
    initializeFirebase();
    
    if (usingMockImplementation) {
      return mockFirestore;
    }
  }
  
  return admin.firestore();
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
  }
};
