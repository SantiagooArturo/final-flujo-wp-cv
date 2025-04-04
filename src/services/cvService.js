// Importaciones
const fs = require('fs-extra');
const path = require('path');
const logger = require('../utils/logger');
const axios = require('axios');
const FormData = require('form-data');
const { OpenAI } = require('openai');
const config = require('../config');
const fileProcessing = require('../utils/fileProcessing');
const { createWorker } = require('tesseract.js');
const PDFParser = require('pdf-parse');
const { ImageAnnotatorClient } = require('@google-cloud/vision');
const openai = require('../utils/openai');

class CVService {
  constructor() {
    this.openaiClient = new OpenAI({
      apiKey: config.openai.apiKey
    });
    logger.info('OpenAI cliente inicializado correctamente');
  }

  // Procesar el CV
  async processCV(documentUrl, userId, position = 'No especificado') {
    try {
      logger.info(`Processing CV for user ${userId} for position: ${position}`);
      
      // Verificar que tenemos URL del documento
      if (!documentUrl) {
        throw new Error('No se recibió una URL válida del documento');
      }
      
      logger.info(`Using provided document URL: ${documentUrl}`);
      
      // 1. Descargar el documento
      logger.info(`Downloading document from URL: ${documentUrl}`);
      const fileBuffer = await fileProcessing.downloadFile(documentUrl);
      logger.info(`Document downloaded, buffer size: ${fileBuffer.length} bytes`);
      
      // 2. Extraer el texto del documento
      logger.info('Extracting text from document (application/pdf)');
      const extractedText = await fileProcessing.extractTextFromFile(fileBuffer, 'application/pdf');
      
      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('No se pudo extraer texto del documento');
      }
      
      logger.info(`Text extracted, length: ${extractedText.length} characters`);
      
      // 3. Analizar el CV con OpenAI
      logger.info('Analyzing CV with OpenAI');
      const analysisResult = await this.analyzeCV(extractedText, position);
      
      // 4. Devolver el resultado
      logger.info('CV analysis completed');
      return analysisResult;
    } catch (error) {
      logger.error(`Error processing CV: ${error.message}`);
      throw error;
    }
  }

  // Analizar CV y generar resultados
  async analyzeCV(cvText, position) {
    try {
      logger.info(`Analizando CV para puesto: ${position} (longitud del texto: ${cvText.length} caracteres)`);
      
      const systemPrompt = `Eres un experto en reclutamiento y recursos humanos. Debes analizar un currículum vitae para el puesto de "${position}" y proporcionar un análisis detallado y personalizado.
      
      El análisis debe incluir:
      1. Una evaluación de la alineación entre el perfil del candidato y los requisitos del puesto de ${position}.
      2. Un puntaje general de 0-100 que refleje cuán adecuado es el CV para el puesto.
      3. Un resumen ejecutivo del perfil profesional del candidato.
      4. Fortalezas específicas del CV relacionadas con el puesto de ${position}.
      5. Áreas de mejora concretas para optimizar el CV para este puesto específico.
      6. Recomendaciones accionables para mejorar el CV con enfoque en el puesto de ${position}.
      7. Análisis de las competencias clave requeridas para el puesto.
      8. Cualquier brecha de habilidades o experiencia entre el perfil actual y el ideal para ${position}.
      
      IMPORTANTE SOBRE LAS RECOMENDACIONES:
      - Todas las recomendaciones deben ser extremadamente específicas y puntuales, nunca generales.
      - Para cada área de mejora, sugiere exactamente qué palabras, frases o elementos debe agregar la persona.
      - Incluye ejemplos concretos de redacción para cada sección del CV que necesite mejora.
      - Especifica términos técnicos, habilidades y logros cuantificables que deben añadirse, con ejemplos exactos.
      - Sugiere palabras clave específicas del sector (ATS) que el candidato debería incluir.
      - Para la experiencia laboral, proporciona ejemplos concretos de cómo redactar los logros con cifras y métricas.
      
      Utiliza un tono profesional pero amigable, y sé honesto pero constructivo en tus observaciones.
      Asegúrate de que todas tus recomendaciones sean específicas para el puesto de ${position} y la industria correspondiente.
      
      Devuelve tu análisis en formato JSON con los siguientes campos:
      - score (número): Puntuación general de 0-100.
      - summary (string): Resumen ejecutivo del perfil.
      - strengths (array): Lista de fortalezas (máximo 5).
      - improvements (array): Lista de áreas de mejora (máximo 5), con ejemplos concretos de corrección.
      - recommendations (array): Lista de recomendaciones accionables (máximo 5), extremadamente específicas y con ejemplos.
      - experience (array): Comentarios sobre la experiencia relevante, incluyendo ejemplos de redacción.
      - skills (array): Habilidades técnicas identificadas, con nivel si es posible.
      - softSkills (array): Habilidades blandas identificadas.
      - education (array): Comentarios sobre formación académica.
      - certifications (array): Certificaciones o cursos relevantes.
      - projects (array): Proyectos destacables mencionados.
      - keyCompetencies (string): Análisis de competencias clave para ${position}.
      - skillsGap (string): Análisis de brechas entre habilidades actuales y deseadas, con ejemplos concretos de habilidades necesarias.
      - alignment (string): Explicación de cuánto se alinea el perfil con el puesto (incluir porcentaje).
      - highlights (array): Aspectos destacables para resaltar al postular, con ejemplos de redacción.
      - finalRecommendation (string): Recomendación final, por ejemplo "Altamente recomendado", "Recomendado con reservas", "No recomendado para este puesto".`;

      // Usar GPT-4 preferentemente para análisis más detallado
      try {
        const completion = await this.openaiClient.chat.completions.create({
          messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Aquí está el texto del CV para el puesto de ${position}:\n\n${cvText}` }
          ],
          model: 'gpt-4-turbo-preview',
          response_format: { type: 'json_object' },
          temperature: 0.7
        });
        
        const resultText = completion.choices[0].message.content.trim();
        logger.info('Análisis completado con GPT-4');
        
        try {
          // Parsear el resultado a objeto JSON
          const analysis = JSON.parse(resultText);
          
          // Mejorar el análisis con sugerencias más específicas y detalladas
          logger.info(`Mejorando el análisis con enhanceCVAnalysis para puesto: ${position}`);
          const enhancedAnalysis = await openai.enhanceCVAnalysis(analysis, position);
          
          return enhancedAnalysis;
        } catch (parseError) {
          logger.error(`Error al parsear respuesta JSON: ${parseError.message}`);
          return this.generateSimulatedAnalysis(position);
        }
      } catch (gpt4Error) {
        // ... resto del código con fallback a GPT-3.5
      }
    } catch (error) {
      logger.error(`Error al analizar el CV: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new CVService(); 