const PDFDocument = require('pdfkit');
const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');

/**
 * Genera un PDF simple con el análisis del CV
 * @param {Object} analysis - Resultado del análisis del CV
 * @param {string} jobPosition - Puesto al que aplica
 * @param {string} candidateName - Nombre del candidato (opcional)
 * @returns {Promise<string>} - Ruta del archivo PDF generado
 */
async function generateCVAnalysisPDF(analysis, jobPosition, candidateName = 'Candidato') {
  try {
    logger.info('Generando PDF con análisis del CV (versión simple)');
    
    // Crear carpeta temporal si no existe
    let tempDir = path.join(process.cwd(), 'public');
    try {
      await fs.ensureDir(tempDir);
      logger.info(`Directorio creado/verificado: ${tempDir}`);
    } catch (dirError) {
      logger.error(`Error al crear directorio: ${dirError.message}`);
      tempDir = path.join(process.cwd(), 'src', 'public');
      await fs.ensureDir(tempDir);
    }
    
    // Definir ruta del archivo a generar
    const timestamp = new Date().getTime();
    const filename = `cv_analysis_${timestamp}.pdf`;
    const outputPath = path.join(tempDir, filename);
    
    // Crear un nuevo documento PDF básico
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: 'Análisis de CV - MyWorkIn',
        Author: 'MyWorkIn',
        Subject: `Análisis de CV para ${jobPosition}`,
      }
    });
    
    // Preparar stream para escribir el archivo
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);
    
    // Calcular puntuación general
    const score = analysis.score || 85;
    
    // Título principal
    doc.fontSize(24)
       .fillColor('#2980b9')
       .font('Helvetica-Bold')
       .text('Análisis de CV - MyWorkIn', {align: 'center'});
       
    doc.moveDown();
    
    // Información general
    doc.fontSize(14)
       .fillColor('#333')
       .font('Helvetica-Bold')
       .text(`Candidato: ${candidateName}`);
       
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .text(`Puesto: ${jobPosition}`);
       
    doc.fontSize(14)
       .font('Helvetica-Bold')
       .text(`Puntuación: ${score}/100`);
       
    doc.moveDown();
    
    // Fortalezas
    doc.fontSize(16)
       .fillColor('#2980b9')
       .font('Helvetica-Bold')
       .text('Fortalezas:', {underline: true});
       
    doc.moveDown(0.5);
    
    if (analysis.strengths && analysis.strengths.length > 0) {
      analysis.strengths.forEach(strength => {
        doc.fontSize(12)
           .fillColor('#333')
           .font('Helvetica')
           .text(`• ${strength}`);
      });
    } else {
      doc.fontSize(12)
         .fillColor('#333')
         .font('Helvetica')
         .text('• No se especificaron fortalezas en el análisis.');
    }
    
    doc.moveDown();
    
    // Experiencia relevante
    doc.fontSize(16)
       .fillColor('#2980b9')
       .font('Helvetica-Bold')
       .text('Experiencia Relevante:', {underline: true});
       
    doc.moveDown(0.5);
    
    if (analysis.experience && analysis.experience.length > 0) {
      analysis.experience.forEach(exp => {
        doc.fontSize(12)
           .fillColor('#333')
           .font('Helvetica')
           .text(`• ${exp}`);
      });
    } else {
      doc.fontSize(12)
         .fillColor('#333')
         .font('Helvetica')
         .text('• No se especificó experiencia relevante en el análisis.');
    }
    
    doc.moveDown();
    
    // Habilidades técnicas
    doc.fontSize(16)
       .fillColor('#2980b9')
       .font('Helvetica-Bold')
       .text('Habilidades Técnicas:', {underline: true});
       
    doc.moveDown(0.5);
    
    if (analysis.skills && analysis.skills.length > 0) {
      analysis.skills.forEach(skill => {
        doc.fontSize(12)
           .fillColor('#333')
           .font('Helvetica')
           .text(`• ${skill}`);
      });
    } else {
      doc.fontSize(12)
         .fillColor('#333')
         .font('Helvetica')
         .text('• No se especificaron habilidades técnicas en el análisis.');
    }
    
    doc.moveDown();
    
    // Áreas de mejora
    doc.fontSize(16)
       .fillColor('#2980b9')
       .font('Helvetica-Bold')
       .text('Áreas de Mejora:', {underline: true});
       
    doc.moveDown(0.5);
    
    if (analysis.improvements && analysis.improvements.length > 0) {
      analysis.improvements.forEach(improvement => {
        doc.fontSize(12)
           .fillColor('#333')
           .font('Helvetica')
           .text(`• ${improvement}`);
      });
    } else {
      doc.fontSize(12)
         .fillColor('#333')
         .font('Helvetica')
         .text('• No se especificaron áreas de mejora en el análisis.');
    }
    
    doc.moveDown();
    
    // Recomendaciones
    doc.fontSize(16)
       .fillColor('#2980b9')
       .font('Helvetica-Bold')
       .text('Recomendaciones:', {underline: true});
       
    doc.moveDown(0.5);
    
    if (analysis.recommendations && analysis.recommendations.length > 0) {
      analysis.recommendations.forEach(rec => {
        doc.fontSize(12)
           .fillColor('#333')
           .font('Helvetica')
           .text(`• ${rec}`);
      });
    } else {
      doc.fontSize(12)
         .fillColor('#333')
         .font('Helvetica')
         .text('• No se especificaron recomendaciones en el análisis.');
    }
    
    // Finalizar documento
    doc.end();
    
    // Esperar a que se complete la escritura del archivo
    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        logger.info(`PDF generado correctamente: ${outputPath}`);
        resolve(outputPath);
      });
      
      stream.on('error', (err) => {
        logger.error(`Error al generar PDF: ${err.message}`);
        reject(err);
      });
    });
    
  } catch (error) {
    logger.error(`Error al generar PDF: ${error.message}`);
    throw error;
  }
}

module.exports = {
  generateCVAnalysisPDF
}; 