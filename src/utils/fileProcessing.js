/**
 * File processing utilities
 * Handles CV file parsing, extraction, and processing
 */

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const logger = require('./logger');
const firebaseConfig = require('../config/firebase');
const axios = require('axios');
const FormData = require('form-data');
const config = require('../config');

/**
 * Upload a file to Firebase Storage
 * @param {Buffer} fileBuffer - File data as buffer
 * @param {String} fileName - Original filename
 * @param {String} userId - User ID for organizing files
 * @returns {Promise<String>} - Public URL of the uploaded file
 */
const uploadToStorage = async (fileBuffer, fileName, userId) => {
  try {
    const storage = firebaseConfig.getStorage();
    const fileExtension = path.extname(fileName);
    const timestamp = Date.now();
    const sanitizedFileName = `${userId}_${timestamp}${fileExtension}`;
    const filePath = `cv-files/${userId}/${sanitizedFileName}`;
    
    const file = storage.file(filePath);
    await file.save(fileBuffer, {
      metadata: {
        contentType: getContentType(fileExtension),
      },
    });
    
    // Set file to be publicly readable
    await file.makePublic();
    
    // Get the public URL
    const publicUrl = `https://storage.googleapis.com/${storage.name}/${filePath}`;
    logger.info(`File uploaded to Firebase Storage: ${publicUrl}`);
    
    return publicUrl;
  } catch (error) {
    logger.error(`Error uploading file to Firebase Storage: ${error.message}`);
    throw error;
  }
};

/**
 * Get content type based on file extension
 * @param {String} extension - File extension
 * @returns {String} - MIME type
 */
const getContentType = (extension) => {
  const types = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain',
    '.rtf': 'application/rtf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
  };
  
  return types[extension.toLowerCase()] || 'application/octet-stream';
};

/**
 * Extract text from PDF file
 * @param {Buffer} fileBuffer - PDF file as buffer
 * @returns {Promise<String>} - Extracted text
 */
const extractTextFromPdf = async (fileBuffer) => {
  try {
    const pdfData = await pdfParse(fileBuffer);
    return pdfData.text;
  } catch (error) {
    logger.error(`Error extracting text from PDF: ${error.message}`);
    throw new Error('Failed to extract text from PDF');
  }
};

/**
 * Extract text from DOCX file
 * @param {Buffer} fileBuffer - DOCX file as buffer
 * @returns {Promise<String>} - Extracted text
 */
const extractTextFromDocx = async (fileBuffer) => {
  try {
    const result = await mammoth.extractRawText({ buffer: fileBuffer });
    return result.value;
  } catch (error) {
    logger.error(`Error extracting text from DOCX: ${error.message}`);
    throw new Error('Failed to extract text from DOCX');
  }
};

/**
 * Extract text from file based on its extension
 * @param {Buffer} fileBuffer - File as buffer
 * @param {String} fileName - Original file name
 * @returns {Promise<String>} - Extracted text
 */
const extractTextFromFile = async (fileBuffer, fileName) => {
  const extension = path.extname(fileName).toLowerCase();
  
  switch (extension) {
    case '.pdf':
      return extractTextFromPdf(fileBuffer);
    case '.docx':
      return extractTextFromDocx(fileBuffer);
    case '.txt':
      return fileBuffer.toString('utf8');
    case '.jpg':
    case '.jpeg':
    case '.png':
      // For image files, we'll need OCR which will be handled by the Python service
      return null;
    default:
      throw new Error(`Unsupported file format: ${extension}`);
  }
};

/**
 * Send file to the CV analyzer service for processing
 * @param {Buffer} fileBuffer - File as buffer
 * @param {String} fileName - Original file name
 * @param {String} fileUrl - URL of the uploaded file (if any)
 * @returns {Promise<Object>} - Analyzed CV data
 */
const sendToAnalyzerService = async (fileBuffer, fileName, fileUrl = null) => {
  try {
    const formData = new FormData();
    formData.append('file', fileBuffer, fileName);
    
    if (fileUrl) {
      formData.append('file_url', fileUrl);
    }
    
    const response = await axios.post(
      `${config.app.cvAnalyzer.apiUrl}/analyze`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: config.app.cvAnalyzer.timeout,
      },
    );
    
    logger.info('CV analysis completed successfully');
    return response.data;
  } catch (error) {
    logger.error(`Error sending file to analyzer service: ${error.message}`);
    throw new Error('Failed to analyze CV');
  }
};

/**
 * Process a CV file: extract text, upload to storage, and analyze
 * @param {Buffer} fileBuffer - File as buffer
 * @param {String} fileName - Original file name
 * @param {String} userId - User ID
 * @returns {Promise<Object>} - Processed CV data
 */
const processCvFile = async (fileBuffer, fileName, userId) => {
  try {
    logger.info(`Processing CV file: ${fileName} for user ${userId}`);
    
    // 1. Upload file to storage
    const fileUrl = await uploadToStorage(fileBuffer, fileName, userId);
    
    // 2. Extract text from file (if possible from our end)
    let extractedText = null;
    try {
      extractedText = await extractTextFromFile(fileBuffer, fileName);
    } catch (error) {
      logger.warn(`Could not extract text locally: ${error.message}. Will rely on analyzer service.`);
    }
    
    // 3. Send to analyzer service with extracted text if available
    const formData = new FormData();
    formData.append('file', fileBuffer, fileName);
    formData.append('file_url', fileUrl);
    
    if (extractedText) {
      formData.append('extracted_text', extractedText);
    }
    
    const analysisResult = await sendToAnalyzerService(fileBuffer, fileName, fileUrl);
    
    return {
      fileUrl,
      extractedText,
      analysis: analysisResult,
    };
  } catch (error) {
    logger.error(`Error processing CV file: ${error.message}`);
    throw error;
  }
};

module.exports = {
  uploadToStorage,
  extractTextFromFile,
  sendToAnalyzerService,
  processCvFile,
};
