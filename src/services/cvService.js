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
      
      const systemPrompt = `Eres un experto senior en reclutamiento y recursos humanos con 15+ años de experiencia evaluando CVs para ${position}. Tu análisis será extremadamente detallado, personalizado y accionable.
      
      INSTRUCCIONES CRÍTICAS PARA EL ANÁLISIS:
      
      1. EVALUACIÓN GENERAL:
         - Evalúa meticulosamente la alineación entre el perfil y los requisitos exactos del puesto de ${position}.
         - Asigna un puntaje de 0-100 basado en criterios cuantificables (experiencia relevante, habilidades técnicas, formación).
      
      2. ANÁLISIS ESPECÍFICO:
         - Examina cada sección del CV y proporciona retroalimentación ultraespecífica.
         - Identifica fortalezas evidentes y brechas concretas respecto al puesto de ${position}.
         - Señala EXACTAMENTE qué términos, frases y logros deberían incluirse y cómo deberían redactarse.
      
      3. RECOMENDACIONES TRANSFORMADORAS:
         - Cada recomendación debe ser extremadamente específica, directamente implementable y transformadora.
         - REESCRIBE ejemplos concretos usando los datos del CV para mostrar el "antes y después".
         - Para cada punto de experiencia/habilidad, sugiere una versión mejorada con métricas, resultados e impacto.
      
      4. SUGERENCIAS POR SECCIONES:
         EXPERIENCIA:
         - Analiza cada posición y proporciona reescrituras exactas con verbos de alto impacto.
         - Convierte descripciones genéricas en logros cuantificados (ej: "Reduje costos operativos en 32% implementando...").
         - Identifica las responsabilidades más relevantes para ${position} y muestra cómo destacarlas con datos precisos.
         
         HABILIDADES:
         - Lista exactamente qué habilidades críticas para ${position} faltan o están subdimensionadas.
         - Especifica el nivel necesario de cada competencia para el puesto.
         - Proporciona ejemplos de cómo demostrar estas habilidades con logros pasados.
         
         FORMACIÓN:
         - Muestra cómo resaltar aspectos de la formación que se alinean con ${position}.
         - Sugiere exactamente cómo mencionar proyectos académicos relevantes con resultados medibles.
         
         CERTIFICACIONES:
         - Identifica certificaciones específicas de la industria que fortalecerían el perfil.
         - Sugiere cómo presentar las certificaciones actuales vinculándolas a resultados profesionales.
      
      5. EJEMPLOS TRANSFORMADORES:
         - Para CADA sección y recomendación, proporciona ejemplos de redacción del "antes vs. después":
           • ANTES: "Responsable de contabilidad en empresa XYZ."
           • DESPUÉS: "Lideré departamento contable de 5 personas en XYZ Corp, implementando controles que redujeron errores de conciliación en 47% y acortaron el cierre mensual de 5 a 2 días."
      
      REQUISITOS PARA LA RESPUESTA:
      
      Devuelve tu análisis en formato JSON con los siguientes campos:
      - score (número): Puntuación general de 0-100.
      - summary (string): Resumen ejecutivo del perfil, destacando fortalezas y limitaciones clave para ${position}.
      - strengths (array): 3-5 fortalezas específicas, detallando exactamente por qué son valiosas para ${position}.
      - improvements (array): 3-5 áreas de mejora con ejemplos concretos, incluyendo redacciones sugeridas.
      - recommendations (array): 5 recomendaciones ultraespecíficas, cada una con ejemplo "antes/después".
      - experience (object): 
          * roles (array): Lista de experiencias identificadas.
          * suggestions (string): 3-5 sugerencias específicas sobre cómo mejorar esta sección, con ejemplos antes/después.
      - skills (object):
          * items (array): Lista de habilidades identificadas.
          * suggestions (string): Sugerencias para mejorar esta sección, incluyendo habilidades faltantes críticas para ${position}.
      - softSkills (object):
          * items (array): Lista de habilidades blandas identificadas.
          * suggestions (string): Cómo mejorar esta sección vinculando cada habilidad con ejemplos cuantificables.
      - education (object):
          * items (array): Formación identificada.
          * suggestions (string): Cómo optimizar esta sección para ${position}.
      - certifications (object):
          * items (array): Certificaciones identificadas.
          * suggestions (string): Certificaciones recomendadas específicas con justificación.
      - projects (object):
          * items (array): Proyectos destacables identificados.
          * suggestions (string): Cómo mejorar la descripción de proyectos con métricas de impacto.
      - keyCompetencies (string): Análisis detallado de competencias CRÍTICAS para ${position}, indicando cuáles posee y cuáles faltan.
      - skillsGap (string): Análisis específico de brechas entre habilidades actuales y requeridas, con ejemplos de cómo cerrarlas.
      - alignment (string): Porcentaje preciso de alineación con justificación detallada.
      - highlights (array): 3-5 aspectos concretos a destacar en entrevistas, con ejemplos de cómo articularlos.
      - finalRecommendation (string): Evaluación final, incluyendo "Altamente recomendado", "Recomendado con reservas", o "No recomendado para este puesto".
      - keywordsSuggestions (array): 10-15 palabras clave específicas del sector para optimizar el CV para los filtros ATS.
      - relevantSectorExperience (string): Análisis de la experiencia directamente relevante para el sector/industria.`;

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
          
          // Añadir log detallado para verificar la estructura y contenido del análisis
          logger.info(`Estructura del análisis: ${JSON.stringify(Object.keys(analysis))}`);
          logger.info(`Valor de 'score': ${analysis.score}`);
          logger.info(`Valor de 'summary': ${analysis.summary ? analysis.summary.substring(0, 100) + '...' : 'undefined'}`);
          logger.info(`Experiencia: ${typeof analysis.experience} - ${Array.isArray(analysis.experience) ? analysis.experience.length + ' items' : 'no es array'}`);
          logger.info(`Education: ${typeof analysis.education} - ${Array.isArray(analysis.education) ? analysis.education.length + ' items' : 'no es array'}`);
          
          // Mejorar el análisis con sugerencias más específicas y detalladas
          logger.info(`Mejorando el análisis con enhanceCVAnalysis para puesto: ${position}`);
          const enhancedAnalysis = await openai.enhanceCVAnalysis(analysis, position);
          
          // Verificar el resultado mejorado
          logger.info(`Estructura mejorada: ${JSON.stringify(Object.keys(enhancedAnalysis))}`);
          logger.info(`Experiencia mejorada: ${typeof enhancedAnalysis.experience} - ${JSON.stringify(enhancedAnalysis.experience).substring(0, 150) + '...'}`);
          
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