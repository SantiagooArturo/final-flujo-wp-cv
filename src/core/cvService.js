const firebaseConfig = require('../config/firebase');
const fileProcessing = require('../utils/fileProcessing');
const logger = require('../utils/logger');
const openaiUtil = require('../utils/openaiUtil');

// Firestore collection names
const USERS_COLLECTION = 'users';
const CVS_COLLECTION = 'cvs';

/**
 * Register a new user in Firestore
 * @param {Object} user - User object with WhatsApp data
 * @returns {Promise<void>}
 */
const registerUser = async (user) => {
  try {
    const db = firebaseConfig.getFirestore();
    const userRef = db.collection(USERS_COLLECTION).doc(user.id.toString());
    
    // Check if user already exists
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      // Create new user
      await userRef.set({
        id: user.id,
        phoneNumber: user.phoneNumber,
        language: user.language || 'es',
        createdAt: new Date(),
        lastActive: new Date(),
      });
      logger.info(`New user registered: ${user.id}`);
    } else {
      // Update last active timestamp
      await userRef.update({
        lastActive: new Date(),
      });
    }
  } catch (error) {
    logger.error(`Error registering user: ${error.message}`);
    throw error;
  }
};

/**
 * Process and analyze a CV
 * @param {String|Object} documentOrUrl - Document object or URL from WhatsApp
 * @param {string} userId - User ID
 * @param {string} [jobPosition] - Optional job position the user is applying for
 * @returns {Promise<Object>} Analysis results
 */
const processCV = async (documentOrUrl, userId, jobPosition = null) => {
  try {
    logger.info(`Processing CV for user ${userId}${jobPosition ? ` for position: ${jobPosition}` : ''}`);
    
    // Handle both document object and URL string
    let documentUrl;
    let mimeType = 'application/pdf'; // Default mime type
    
    if (typeof documentOrUrl === 'string') {
      // If it's already a URL
      documentUrl = documentOrUrl;
      logger.info(`Using provided document URL: ${documentUrl}`);
    } else if (documentOrUrl && documentOrUrl.url) {
      // If it's a document object with url property
      documentUrl = documentOrUrl.url;
      mimeType = documentOrUrl.mime_type || mimeType;
      logger.info(`Extracted document URL from object: ${documentUrl}`);
    } else {
      throw new Error('Invalid document: no URL provided');
    }
    
    // Download and process the document
    logger.info(`Downloading document from URL: ${documentUrl}`);
    const fileBuffer = await fileProcessing.downloadFile(documentUrl);
    logger.info(`Document downloaded, buffer size: ${fileBuffer.length} bytes`);
    
    // Extract text from document
    logger.info(`Extracting text from document (${mimeType})`);
    const text = await fileProcessing.extractTextFromFile(fileBuffer, mimeType);
    logger.info(`Text extracted, length: ${text.length} characters`);
    
    // Analyze the CV using OpenAI
    logger.info('Analyzing CV with OpenAI');
    const analysis = jobPosition 
      ? await openaiUtil.analyzeCV(text, jobPosition)
      : await openaiUtil.analyzeCV(text);
    logger.info('CV analysis completed');
    
    // Store analysis in Firestore
    if (firebaseConfig.isInitialized()) {
      logger.info('Storing analysis in Firestore');
      const db = firebaseConfig.getFirestore();
      await db.collection(CVS_COLLECTION).add({
        userId,
        text,
        analysis,
        jobPosition,
        createdAt: new Date(),
        documentType: mimeType,
      });
      logger.info('Analysis stored in Firestore');
    } else {
      logger.warn('Firebase not initialized, skipping storage');
    }
    
    return analysis;
  } catch (error) {
    logger.error(`Error processing CV: ${error.message}`);
    throw error;
  }
};

/**
 * Generate a PDF report from analysis
 * @param {Object} analysis - CV analysis results
 * @param {string} userId - User ID
 * @returns {Promise<string>} URL of the generated PDF
 */
const generateReportPDF = async (analysis, userId) => {
  try {
    // Implementation of PDF generation
    // This will be implemented later
    return null;
  } catch (error) {
    logger.error(`Error generating report PDF: ${error.message}`);
    throw error;
  }
};

module.exports = {
  registerUser,
  processCV,
  generateReportPDF
}; 