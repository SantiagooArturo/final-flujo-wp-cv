const firebaseConfig = require('../config/firebase');
const fileProcessing = require('../utils/fileProcessing');
const logger = require('../utils/logger');
const ftpUploader = require('../utils/ftpUploader');
const admin = require('firebase-admin');
const axios = require('axios');

// Firestore collection names
const USERS_COLLECTION = 'users';
const CVS_COLLECTION = 'cvs';
const CV_ANALYSIS_ENDPOINT = 'https://myworkin-cv.onrender.com/analizar-cv/';
const USER_CV_ANALYSIS_COLLECTION = 'analysis_cvs';

/**
 * Register a new user in Firestore or update last active time.
 * @param {Object} user - User object with WhatsApp data (id, phoneNumber, language).
 * @returns {Promise<void>}
 */
const registerUser = async (user) => {
  try {
    const db = firebaseConfig.getFirestore();
    const userRef = db.collection(USERS_COLLECTION).doc(user.id.toString());
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      await userRef.set({
        id: user.id,
        phoneNumber: user.phoneNumber,
        language: user.language || 'es',
        createdAt: new Date(),
        lastActive: new Date(),
      });
      logger.info(`[${user.id}] New user registered`);
    } else {
      await userRef.update({
        lastActive: new Date(),
      });
      logger.info(`[${user.id}] User last active time updated`);
    }
  } catch (error) {
    logger.error(`Error registering user [${user.id}]: ${error.message}`);
    throw error;
  }
};

/**
 * Fetches CV analysis from the endpoint and saves it to the user's history.
 * @param {string} userId - User ID.
 * @param {string} documentUrlForAnalysis - URL of the document to be analyzed.
 * @param {string} jobPosition - Optional job position.
 * @returns {Promise<Object|null>} The full analysis data object, or null if analysis fails.
 */
const getAndSaveCVAnalysisToHistory = async (userId, documentUrlForAnalysis, jobPosition) => {
  try {
    logger.info(`[${userId}] Requesting CV analysis for URL: ${documentUrlForAnalysis}, Position: ${jobPosition || 'N/A'}`);
    const response = await axios.get(CV_ANALYSIS_ENDPOINT, {
      params: {
        pdf_url: documentUrlForAnalysis,
        puesto_postular: jobPosition || 'No especificado'
      },
      timeout: 180000 // 3 minutes timeout for the analysis API
    });

    if (response.status !== 200) {
      logger.error(`[${userId}] Error fetching CV analysis: ${response.status} ${response.statusText}`);
      throw new Error(`API Error ${response.status}: ${response.statusText}`);
    }

    if (!response.data || !response.data.extractedData || !response.data.analysis_id) {
      logger.error(`[${userId}] CV Analysis API response is missing expected data fields.`);
      throw new Error('Respuesta del API de análisis incompleta o inválida');
    }

    const analysisData = {
      analysisId: response.data.analysis_id,
      candidateInfo: response.data.extractedData.extractedData,
      analysisResults: response.data.extractedData.analysisResults,
      cvUrl: response.data.extractedData.cvOriginalFileUrl,
      pdf_report_url: response.data.extractedData.analysisResults?.pdf_url,
      apiResponseReceivedAt: new Date() // Timestamp when API response was processed
    };

    const db = firebaseConfig.getFirestore();
    const userHistoryRef = db.collection(USER_CV_ANALYSIS_COLLECTION).doc(userId);
    const userHistoryDoc = await userHistoryRef.get();

    const historyEntry = {
      analysisData: analysisData, // Store the structured analysis data
      jobPosition: jobPosition || 'No especificado',
      analyzedAt: new Date() // Timestamp for this specific history entry
    };

    if (userHistoryDoc.exists) {
      await userHistoryRef.update({
        cvAnalysisHistorial: admin.firestore.FieldValue.arrayUnion(historyEntry),
        updatedAt: new Date()
      });
    } else {
      await userHistoryRef.set({
        id: userId,
        cvAnalysisHistorial: [historyEntry],
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    logger.info(`[${userId}] CV analysis (ID: ${analysisData.analysisId}) saved to user history.`);
    return analysisData;

  } catch (error) {
    logger.error(`[${userId}] Error in getAndSaveCVAnalysisToHistory: ${error.message}`);
    return null; // Return null to indicate failure, allowing processCV to fallback
  }
};

/**
 * Processes a CV: uploads to FTP, sends for analysis, saves analysis data,
 * and returns the URL of the PDF analysis report.
 * @param {String|Object} documentOrUrl - Document object (with url, filename, mime_type) or a direct URL string.
 * @param {string} userId - User ID.
 * @param {string} [jobPosition] - Optional job position the user is applying for.
 * @returns {Promise<String|null>} URL of the PDF analysis report, or the public CV URL if analysis fails.
 *                                 Returns null if a critical error occurs before publicUrl is obtained.
 */
const processCV = async (documentOrUrl, userId, jobPosition = null) => {
  const startTime = Date.now();
  let publicUrl = null;

  try {
    logger.info(`[${userId}] Starting CV processing. Position: ${jobPosition || 'No especificado'}`);

    let documentUrlToDownload;
    let originalFileName = 'cv.pdf';
    let documentMimeType = 'application/pdf';

    if (typeof documentOrUrl === 'string') {
      documentUrlToDownload = documentOrUrl;
      logger.info(`[${userId}] Using provided document URL: ${documentUrlToDownload}`);
    } else if (documentOrUrl && documentOrUrl.url) {
      documentUrlToDownload = documentOrUrl.url;
      originalFileName = documentOrUrl.filename || originalFileName;
      documentMimeType = documentOrUrl.mime_type || documentMimeType;
      logger.info(`[${userId}] Extracted document URL from object: ${documentUrlToDownload}`);
    } else {
      throw new Error('Invalid documentOrUrl provided: No URL found.');
    }

    logger.info(`[${userId}] Downloading document from: ${documentUrlToDownload}`);
    const downloadStartTime = Date.now();
    const fileBuffer = await fileProcessing.downloadFile(documentUrlToDownload);
    logger.info(`[${userId}] Document downloaded (${fileBuffer.length} bytes) in ${(Date.now() - downloadStartTime) / 1000}s`);

    logger.info(`[${userId}] Uploading document to FTP server as ${originalFileName}`);
    const ftpStartTime = Date.now();
    publicUrl = await ftpUploader.uploadToFTP(fileBuffer, originalFileName);
    logger.info(`[${userId}] Document uploaded to FTP. Public URL: ${publicUrl}. Time: ${(Date.now() - ftpStartTime) / 1000}s`);

    logger.info(`[${userId}] Requesting and saving CV analysis using public URL: ${publicUrl}`);
    const analysisApiCallStartTime = Date.now();
    const fullAnalysisData = await getAndSaveCVAnalysisToHistory(userId, publicUrl, jobPosition);
    const analysisApiCallTime = (Date.now() - analysisApiCallStartTime) / 1000;

    if (!fullAnalysisData) {
      logger.warn(`[${userId}] CV analysis failed or returned no data. Analysis API call took ${analysisApiCallTime}s. Returning public FTP URL as fallback.`);
      const totalTime = (Date.now() - startTime) / 1000;
      logger.info(`[${userId}] CV processing (analysis failed partway) completed in ${totalTime}s.`);
      return publicUrl;
    }

    logger.info(`[${userId}] CV analysis (ID: ${fullAnalysisData.analysisId}) received and saved to history in ${analysisApiCallTime}s.`);

    if (firebaseConfig.isInitialized()) {
      try {
        const db = firebaseConfig.getFirestore();
        const mainAnalysisRecord = {
          userId,
          analysisReportUrl: fullAnalysisData.pdf_report_url || publicUrl,
          originalCvUrl: publicUrl,
          jobPosition: jobPosition || 'No especificado',
          analysisId: fullAnalysisData.analysisId,
          documentType: documentMimeType,
          processedAt: new Date(),
          processingDurationMs: analysisApiCallTime * 1000 // Time for the API call part
        };
        await db.collection(CVS_COLLECTION).add(mainAnalysisRecord);
        logger.info(`[${userId}] Main analysis record stored in '${CVS_COLLECTION}'. Report URL: ${mainAnalysisRecord.analysisReportUrl}`);
      } catch (firestoreError) {
        logger.error(`[${userId}] Error storing main analysis record in Firestore: ${firestoreError.message}. History was saved.`);
      }
    } else {
      logger.warn(`[${userId}] Firebase not initialized. Skipping storage of main analysis record in '${CVS_COLLECTION}'.`);
    }

    const totalProcessingTime = (Date.now() - startTime) / 1000;
    logger.info(`[${userId}] CV processing completed successfully in ${totalProcessingTime}s.`);
    
    return fullAnalysisData.pdf_report_url || publicUrl; // Prefer analysis PDF, fallback to public CV URL

  } catch (error) {
    const totalTimeOnError = (Date.now() - startTime) / 1000;
    logger.error(`[${userId}] Critical error during CV processing after ${totalTimeOnError}s: ${error.message}. Stack: ${error.stack}`);
    if (publicUrl) {
      logger.info(`[${userId}] Returning public FTP URL (${publicUrl}) as fallback due to critical error.`);
      return publicUrl;
    }
    throw error; // Re-throw if no publicUrl to return
  }
};

/**
 * Generate a PDF report from analysis data.
 * (Placeholder for future implementation)
 * @param {Object} analysisData - The full analysis data object.
 * @param {string} userId - User ID.
 * @returns {Promise<string|null>} URL of the generated PDF, or null.
 */
const generateReportPDF = async (analysisData, userId) => {
  try {
    // TODO: Implement PDF generation logic here
    // Example: const pdfPath = await pdfGenerator.create(analysisData, userId);
    //          return await storageService.upload(pdfPath);
    logger.info(`[${userId}] PDF generation requested for analysis ID: ${analysisData?.analysisId || 'N/A'}. (Not Implemented)`);
    return null;
  } catch (error) {
    logger.error(`[${userId}] Error in generateReportPDF: ${error.message}`);
    throw error;
  }
};

module.exports = {
  registerUser,
  processCV,
  generateReportPDF,
  // getAndSaveCVAnalysisToHistory, // Expose if needed for direct calls, otherwise keep internal
};