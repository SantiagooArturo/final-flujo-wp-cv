const axios = require('axios');
const logger = require('./logger');
const FormData = require('form-data');

/**
 * Send CV to the analysis endpoint
 * @param {string} pdfUrl - URL of the PDF file
 * @param {string} jobPosition - Job position to apply for
 * @returns {Promise<Object|string>} Analysis results or PDF URL on timeout
 */
const sendToCVAnalysisEndpoint = async (pdfUrl, jobPosition) => {
  try {
    // Verificar que tenemos una URL del PDF
    if (!pdfUrl) {
      throw new Error('No PDF URL provided');
    }
    
    // Construir la URL completa con los parámetros
    const url = `https://api-cv-myworkin.onrender.com/analizar-cv/?pdf_url=${encodeURIComponent(pdfUrl)}&puesto_postular=${encodeURIComponent(jobPosition)}`;
    
    logger.info(`Sending GET request to: ${url}`);
    
    // Realizar la petición GET con timeout extendido (3 minutos)
    const response = await axios.get(url, {
      timeout: 180000, // 3 minutos
      // No seguir redirecciones automáticamente
      maxRedirects: 0,
    });
    
    // Verificar la respuesta
    if (response.status >= 300 && response.status < 400) {
      // Es una redirección, extraer la URL de la cabecera Location
      const redirectUrl = response.headers.location;
      logger.info(`Received redirect to: ${redirectUrl}`);
      return redirectUrl;
    }
    
    logger.info(`CV analysis completed successfully from external endpoint. Status: ${response.status}`);
    
    // Si la respuesta es un string, es probablemente una URL directa
    if (typeof response.data === 'string' && response.data.startsWith('http')) {
      logger.info(`Received direct URL response: ${response.data}`);
      return response.data;
    }
    
    // Si la respuesta es un JSON con pdf_url, extraer esa URL
    if (response.data && response.data.pdf_url) {
      logger.info(`Received JSON response with pdf_url: ${response.data.pdf_url}`);
      return response.data.pdf_url;
    }
    
    // Si la respuesta está vacía o no es un objeto, devolver la URL original
    if (!response.data || (typeof response.data !== 'object' && typeof response.data !== 'string')) {
      logger.info('Empty or invalid response, returning original PDF URL');
      return pdfUrl;
    }
    
    return response.data;
  } catch (error) {
    logger.error(`Error sending CV to analysis endpoint: ${error.message}`);
    
    // Si hay un error de timeout o de conexión, devolver la URL del PDF original
    if (error.code === 'ECONNABORTED' || 
        error.message.includes('timeout') || 
        error.message.includes('504') ||
        error.message.includes('502')) {
      logger.info('Timeout or connection error, returning original PDF URL');
      return pdfUrl;
    }
    
    throw new Error(`Failed to analyze CV: ${error.message}`);
  }
};

module.exports = {
  sendToCVAnalysisEndpoint
}; 