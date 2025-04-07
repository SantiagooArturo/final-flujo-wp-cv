const firebaseConfig = require('../config/firebase');
const fileProcessing = require('../utils/fileProcessing');
const logger = require('../utils/logger');
const openaiUtil = require('../utils/openaiUtil');
const cvAnalyzer = require('../utils/cvAnalyzer');
const ftpUploader = require('../utils/ftpUploader');
const path = require('path');

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
  let startTime = Date.now();
  
  try {
    logger.info(`[${userId}] Starting CV processing for position: ${jobPosition || 'No especificado'}`);
    
    // Handle both document object and URL string
    let documentUrl;
    let fileName = 'cv.pdf';
    let mimeType = 'application/pdf'; // Default mime type
    
    if (typeof documentOrUrl === 'string') {
      // If it's already a URL
      documentUrl = documentOrUrl;
      logger.info(`[${userId}] Using provided document URL: ${documentUrl}`);
    } else if (documentOrUrl && documentOrUrl.url) {
      // If it's a document object with url property
      documentUrl = documentOrUrl.url;
      if (documentOrUrl.filename) {
        fileName = documentOrUrl.filename;
      }
      mimeType = documentOrUrl.mime_type || mimeType;
      logger.info(`[${userId}] Extracted document URL from object: ${documentUrl}`);
    } else {
      throw new Error('Invalid document: no URL provided');
    }
    
    // Download and process the document
    logger.info(`[${userId}] Downloading document from URL: ${documentUrl}`);
    const downloadStartTime = Date.now();
    const fileBuffer = await fileProcessing.downloadFile(documentUrl);
    logger.info(`[${userId}] Document downloaded, buffer size: ${fileBuffer.length} bytes, time: ${(Date.now() - downloadStartTime)/1000}s`);
    
    // Subir el archivo al servidor FTP
    logger.info(`[${userId}] Uploading file to FTP server`);
    const ftpStartTime = Date.now();
    const publicUrl = await ftpUploader.uploadToFTP(fileBuffer, fileName);
    logger.info(`[${userId}] File uploaded to FTP, public URL: ${publicUrl}, time: ${(Date.now() - ftpStartTime)/1000}s`);
    
    // Send to analysis endpoint
    logger.info(`[${userId}] Sending CV to analysis endpoint, processing may take 2-3 minutes`);
    const analysisStartTime = Date.now();
    
    try {
      // Send request with a long timeout
      const analysis = await cvAnalyzer.sendToCVAnalysisEndpoint(publicUrl, jobPosition || 'No especificado');
      const analysisTime = (Date.now() - analysisStartTime)/1000;
      logger.info(`[${userId}] CV analysis completed successfully in ${analysisTime}s`);
      
      // Store analysis in Firestore if available
      if (firebaseConfig.isInitialized()) {
        try {
          logger.info(`[${userId}] Storing analysis reference in Firestore`);
          const db = firebaseConfig.getFirestore();
          
          // Verificar si es una string (enlace directo) o un objeto
          const analysisUrl = typeof analysis === 'string' ? analysis : (analysis.pdfUrl || analysis.url || publicUrl);
          
          // Guardar solo la referencia al análisis, no el contenido completo
          await db.collection(CVS_COLLECTION).add({
            userId,
            analysisUrl: analysisUrl,  // Guardar solo la URL, no el objeto completo
            jobPosition,
            createdAt: new Date(),
            documentType: mimeType,
            fileUrl: publicUrl,
            processingTime: analysisTime
          });
          logger.info(`[${userId}] Analysis reference stored in Firestore`);
        } catch (firestoreError) {
          logger.error(`[${userId}] Error storing analysis in Firestore: ${firestoreError.message}`);
          logger.info(`[${userId}] Continuing without storing analysis in Firestore`);
        }
      } else {
        logger.warn(`[${userId}] Firebase not initialized, skipping storage`);
      }
      
      const totalTime = (Date.now() - startTime)/1000;
      logger.info(`[${userId}] CV processing completed in ${totalTime}s`);
      return analysis;
    } catch (analysisError) {
      logger.error(`[${userId}] Error in CV analysis: ${analysisError.message}`);
      
      // Return the public URL even if analysis fails
      logger.info(`[${userId}] Returning public URL as fallback: ${publicUrl}`);
      return publicUrl;
    }
  } catch (error) {
    const totalTime = (Date.now() - startTime)/1000;
    logger.error(`[${userId}] Error processing CV after ${totalTime}s: ${error.message}`);
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