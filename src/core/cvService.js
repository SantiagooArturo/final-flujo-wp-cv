const firebaseConfig = require('../config/firebase');
const fileProcessing = require('../utils/fileProcessing');
const logger = require('../utils/logger');
const openaiUtil = require('../utils/openaiUtil');
const cvAnalyzer = require('../utils/cvAnalyzer');
const ftpUploader = require('../utils/ftpUploader');
const path = require('path');
const admin = require('firebase-admin');
const axios = require('axios');

// Firestore collection names
const USERS_COLLECTION = 'users';
const CVS_COLLECTION = 'cvs';
const CV_ANALYSIS_ENDPOINT = 'https://myworkin-cv.onrender.com/analizar-cv/'; // Replace with actual endpoint
const USER_CV_ANALYSIS_COLLECTION = 'analysis_cvs';

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
 * @returns {Promise<String>} PDF URL of analysis results
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
          
          // Verificar si es una string (enlace directo) o un objeto completo de análisis
          let analysisUrl;
          let fullAnalysisObject;
          
          if (typeof analysis === 'string') {
            // Si es solo una URL
            analysisUrl = analysis;
            fullAnalysisObject = null;
          } else if (analysis && analysis.extractedData && analysis.extractedData.analysisResults && analysis.extractedData.analysisResults.pdf_url) {
            // Si es el objeto completo de respuesta del API
            analysisUrl = analysis.extractedData.analysisResults.pdf_url;
            fullAnalysisObject = analysis;
          } else if (analysis && analysis.pdfUrl) {
            // Formato alternativo
            analysisUrl = analysis.pdfUrl;
            fullAnalysisObject = analysis;
          } else if (analysis && analysis.url) {
            // Otro formato alternativo
            analysisUrl = analysis.url;
            fullAnalysisObject = analysis;
          } else {
            // Si no se puede extraer una URL, usar la URL del documento original
            analysisUrl = publicUrl;
            fullAnalysisObject = null;
          }
          
          // Guardar solo la referencia al análisis en la colección CVS_COLLECTION
          await db.collection(CVS_COLLECTION).add({
            userId,
            analysisUrl: analysisUrl,
            jobPosition,
            createdAt: new Date(),
            documentType: mimeType,
            fileUrl: publicUrl,
            processingTime: analysisTime
          });
          logger.info(`[${userId}] Analysis reference stored in Firestore`);
          
          // INICIO DEL CÓDIGO INTEGRADO DE HISTORIAL (reemplaza la llamada a saveCVAnalysis)
          try {
            logger.info(`[${userId}] Guardando análisis en historial de usuario...`);
            
            // Preparar los datos para guardar en el historial
            let analysisData;
            
            // Si tenemos el objeto completo del API, usarlo directamente
            if (fullAnalysisObject && fullAnalysisObject.analysis_id) {
              analysisData = {
                analysisId: fullAnalysisObject.analysis_id,
                candidateInfo: fullAnalysisObject.extractedData.extractedData,
                analysisResults: fullAnalysisObject.extractedData.analysisResults,
                cvUrl: fullAnalysisObject.extractedData.cvOriginalFileUrl,
                pdf_report_url: fullAnalysisObject.extractedData.analysisResults?.pdf_url,
                createdAt: new Date()
              };
            } else {
              // Si solo tenemos la URL, crear un objeto simplificado
              analysisData = {
                pdf_report_url: analysisUrl,
                cvUrl: publicUrl,
                createdAt: new Date()
              };
            }
            
            // Guardar en el historial del usuario
            const userRef = db.collection(USER_CV_ANALYSIS_COLLECTION).doc(userId);
            const userDoc = await userRef.get();
            
            if (userDoc.exists) {
              // Si el documento existe, actualiza el array añadiendo el nuevo análisis
              await userRef.update({
                cvAnalysisHistorial: admin.firestore.FieldValue.arrayUnion({
                  extracted_data: analysisData,
                  jobPosition: jobPosition || 'No especificado',
                  createdAt: new Date()
                }),
                updatedAt: new Date()
              });
            } else {
              // Si el documento no existe, créalo con un nuevo array
              await userRef.set({
                id: userId,
                cvAnalysisHistorial: [{
                  extracted_data: analysisData,
                  jobPosition: jobPosition || 'No especificado',
                  createdAt: new Date()
                }],
                updatedAt: new Date()
              });
            }
            
            logger.info(`[${userId}] Análisis guardado en historial: ${JSON.stringify(analysisData)}`);
            logger.info(`[${userId}] Análisis de CV guardado exitosamente en el historial`);
          } catch (historialError) {
            logger.error(`[${userId}] Error guardando en historial: ${historialError.message}`);
            logger.info(`[${userId}] Continuando sin guardar en historial`);
          }
          // FIN DEL CÓDIGO INTEGRADO DE HISTORIAL
          
        } catch (firestoreError) {
          logger.error(`[${userId}] Error storing analysis in Firestore: ${firestoreError.message}`);
          logger.info(`[${userId}] Continuing without storing analysis in Firestore`);
        }
      } else {
        logger.warn(`[${userId}] Firebase not initialized, skipping storage`);
      }
      
      const totalTime = (Date.now() - startTime)/1000;
      logger.info(`[${userId}] CV processing completed in ${totalTime}s`);
      
      // CAMBIO: Extraer y retornar solo la URL del PDF de análisis
      if (typeof analysis === 'string') {
        // Si ya es una URL, devolverla directamente
        return analysis;
      } else if (analysis && analysis.extractedData && analysis.extractedData.analysisResults && analysis.extractedData.analysisResults.pdf_url) {
        // Si es el objeto completo, extraer la URL del PDF
        return analysis.extractedData.analysisResults.pdf_url;
      } else if (analysis && analysis.pdfUrl) {
        return analysis.pdfUrl;
      } else if (analysis && analysis.url) {
        return analysis.url;
      } else {
        // Si no se puede extraer una URL, usar la URL del documento original
        return publicUrl;
      }
      
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
  generateReportPDF,
  saveCVAnalysis
}; 