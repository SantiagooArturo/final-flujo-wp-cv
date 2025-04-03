const PDFDocument = require('pdfkit');
const PDFTable = require('pdfkit-table');
const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');

/**
 * Genera un PDF profesional con el análisis del CV
 * @param {Object} analysis - Resultado del análisis del CV
 * @param {string} jobPosition - Puesto al que aplica
 * @param {string} candidateName - Nombre del candidato (opcional)
 * @returns {Promise<string>} - Ruta del archivo PDF generado
 */
async function generateCVAnalysisPDF(analysis, jobPosition, candidateName = 'Candidato') {
  try {
    logger.info('Generando PDF con análisis del CV (versión profesional)');
    
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
    
    // Crear un nuevo documento PDF extendido
    const doc = new PDFTable({
      size: 'A4',
      margin: 40,
      info: {
        Title: 'Análisis de CV - MyWorkIn',
        Author: 'MyWorkIn',
        Subject: `Análisis de CV para ${jobPosition}`,
      },
      bufferPages: true
    });
    
    // Preparar stream para escribir el archivo
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);
    
    // Calcular puntuación general
    const score = analysis.score || 85;
    
    // Definir colores
    const colors = {
      primary: '#2980b9',
      secondary: '#27ae60',
      tertiary: '#e67e22',
      accent: '#8e44ad',
      danger: '#c0392b',
      dark: '#2c3e50',
      light: '#ecf0f1',
      title: '#2c3e50',
      text: '#333333',
      progressBar: '#3498db',
      progressBg: '#ecf0f1',
      lightBg: '#f9f9f9'
    };
    
    // Intentar cargar el logo (corregido para usar myworkinlogo.png)
    let logoPath = path.join(process.cwd(), 'src', 'assets', 'images', 'myworkinlogo.png');
    let logoExists = await fs.pathExists(logoPath);
    
    // Encabezado
    doc.fontSize(10)
       .fillColor(colors.text)
       .font('Helvetica')
       .text('INFORME CONFIDENCIAL', {align: 'right'})
       .text(`Fecha: ${new Date().toLocaleDateString()}`, {align: 'right'});
       
    doc.moveDown();
    
    // Logo y título principal
    if (logoExists) {
      try {
        doc.image(logoPath, 50, 50, { width: 120 });
        doc.moveDown();
      } catch (logoError) {
        logger.error(`Error al cargar logo: ${logoError.message}`);
        // Si falla el logo, crear un rectángulo azul con texto como alternativa
        doc.rect(50, 50, 120, 60).fill(colors.primary);
        doc.fontSize(18).fillColor('#ffffff').font('Helvetica-Bold').text('MyWorkIn', 65, 70);
      }
    } else {
      // Si no existe el logo, crear un rectángulo azul con texto como alternativa
      doc.rect(50, 50, 120, 60).fill(colors.primary);
      doc.fontSize(18).fillColor('#ffffff').font('Helvetica-Bold').text('MyWorkIn', 65, 70);
    }
    
    // Agregar fondo claro al título principal
    doc.rect(40, 130, doc.page.width - 80, 60).fill(colors.lightBg);
    doc.fontSize(24)
       .fillColor(colors.primary)
       .font('Helvetica-Bold')
       .text('ANÁLISIS DE CURRÍCULUM', 0, 145, {align: 'center'});
       
    doc.fontSize(16)
       .fillColor(colors.dark)
       .text(`Puesto: ${jobPosition}`, 0, 175, {align: 'center'});
    
    doc.moveDown(2);
    
    // Información del candidato y puntuación
    const startY = 210;
    
    // Cuadro de información con bordes redondeados
    doc.roundedRect(50, startY, 250, 120, 5).fillAndStroke(colors.lightBg, colors.primary);
    doc.fillColor(colors.dark);
    doc.fontSize(14).font('Helvetica-Bold').text('INFORMACIÓN DEL CANDIDATO', 70, startY + 15);
    doc.fontSize(12).font('Helvetica').text(`Nombre: ${candidateName}`, 70, startY + 40);
    doc.fontSize(12).font('Helvetica').text(`Puesto evaluado: ${jobPosition}`, 70, startY + 60);
    
    // Recomendación final si existe
    if (analysis.finalRecommendation) {
      const recommendation = analysis.finalRecommendation;
      let recommendationColor = colors.secondary;
      
      if (recommendation.includes('con reservas')) {
        recommendationColor = colors.tertiary;
      } else if (recommendation.includes('No recomendado')) {
        recommendationColor = colors.danger;
      }
      
      doc.fontSize(12).font('Helvetica-Bold').fillColor(recommendationColor)
         .text(`Resultado: ${recommendation.includes('recomendado') ? recommendation.split(':')[0] : 'Evaluación completada'}`, 70, startY + 80);
    }
    
    // Dibujar puntuación como círculo con porcentaje
    drawScoreCircle(doc, score, doc.page.width - 120, startY + 50, 50, colors);
    
    doc.moveDown(6);
    
    // Resumen ejecutivo
    doc.rect(50, startY + 140, doc.page.width - 100, 120).fill(colors.lightBg);
    doc.fillColor(colors.dark).fontSize(16).font('Helvetica-Bold').text('RESUMEN EJECUTIVO', 70, startY + 155);
    doc.fontSize(11).font('Helvetica').fillColor(colors.text);
    
    // Añadir texto del resumen ejecutivo con wrap
    const summaryText = analysis.summary || 'No se proporcionó un resumen ejecutivo en el análisis.';
    doc.text(summaryText, 70, startY + 180, { width: doc.page.width - 140 });
    
    // Primera página completa
    doc.addPage();
    addPageHeader(doc, candidateName, jobPosition, colors);
    
    // PRIMERA SECCIÓN: Análisis de perfil y competencias
    // ---------------------------------------------------------------------------------
    
    // Crear sección para fortalezas y áreas de mejora (tabla comparativa)
    doc.fontSize(16).font('Helvetica-Bold').fillColor(colors.primary)
       .text('ANÁLISIS DE PERFIL PROFESIONAL', {align: 'center'});
    doc.moveDown();
    
    // Crear tabla de dos columnas para fortalezas y áreas de mejora
    if ((analysis.strengths && analysis.strengths.length > 0) || 
        (analysis.improvements && analysis.improvements.length > 0)) {
        
      const strengthsAndImprovements = {
        title: '',
        headers: [
          { label: 'FORTALEZAS', property: 'strength', width: 240, renderer: null, headerColor: colors.secondary, headerOpacity: 0.8 },
          { label: 'ÁREAS DE MEJORA', property: 'improvement', width: 240, renderer: null, headerColor: colors.danger, headerOpacity: 0.8 }
        ],
        datas: []
      };
      
      // Llenar la tabla con fortalezas y áreas de mejora
      const maxRows = Math.max(
        analysis.strengths ? analysis.strengths.length : 0,
        analysis.improvements ? analysis.improvements.length : 0
      );
      
      for (let i = 0; i < maxRows; i++) {
        const row = {};
        row.strength = analysis.strengths && i < analysis.strengths.length ? 
                       `• ${analysis.strengths[i]}` : '';
        row.improvement = analysis.improvements && i < analysis.improvements.length ? 
                         `• ${analysis.improvements[i]}` : '';
        strengthsAndImprovements.datas.push(row);
      }
      
      await doc.table(strengthsAndImprovements, {
        width: 480,
        prepareHeader: () => doc.font('Helvetica-Bold').fontSize(12),
        prepareRow: () => doc.font('Helvetica').fontSize(10)
      });
    } else {
      doc.fontSize(12).font('Helvetica').fillColor(colors.text)
         .text('No se proporcionaron fortalezas ni áreas de mejora en el análisis.');
    }
    
    doc.moveDown(2);
    
    // Gráfica de barras: Alineación con el puesto
    doc.fontSize(16).font('Helvetica-Bold').fillColor(colors.primary)
       .text('ANÁLISIS DE COMPETENCIAS', {align: 'center'});
    doc.moveDown();
    
    // Extraer coincidencia del texto de alineación si está disponible
    let matchPercentage = 70; // Valor por defecto
    if (analysis.alignment) {
      const matchMatch = analysis.alignment.match(/(\d+)%/);
      if (matchMatch) {
        matchPercentage = parseInt(matchMatch[1]);
      }
    }
    
    // Dibujar barra de coincidencia con el puesto
    doc.fontSize(12).font('Helvetica-Bold').fillColor(colors.dark)
       .text('Coincidencia con el puesto', 50, doc.y);
    
    const barWidth = 400;
    const barHeight = 20;
    const barX = 50;
    const barY = doc.y + 10;
    
    // Dibujar barra de fondo
    doc.rect(barX, barY, barWidth, barHeight).fill(colors.progressBg);
    
    // Dibujar barra de progreso
    const progressWidth = (matchPercentage / 100) * barWidth;
    const progressColor = matchPercentage > 80 ? colors.secondary : 
                          matchPercentage > 60 ? colors.tertiary : colors.danger;
    doc.rect(barX, barY, progressWidth, barHeight).fill(progressColor);
    
    // Añadir texto de porcentaje
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#fff')
       .text(`${matchPercentage}%`, barX + progressWidth - 25, barY + 5);
    
    doc.moveDown(3);

    // SEGUNDA SECCIÓN: Competencias técnicas y blandas
    // ---------------------------------------------------------------------------------
    
    // Verificar si hay habilidades técnicas o blandas
    const hasSkills = analysis.skills && analysis.skills.length > 0;
    const hasSoftSkills = analysis.softSkills && analysis.softSkills.length > 0;
    
    // Solo añadir una nueva página si tenemos contenido para mostrar
    if (hasSkills || hasSoftSkills) {
      doc.addPage();
      addPageHeader(doc, candidateName, jobPosition, colors);
      
      // Habilidades técnicas
      if (hasSkills) {
        doc.fontSize(16).font('Helvetica-Bold').fillColor(colors.primary)
           .text('COMPETENCIAS TÉCNICAS', {align: 'center'});
        doc.moveDown();
        
        const skillTable = {
          title: '',
          headers: [
            { label: 'HABILIDAD', property: 'skill', width: 280 },
            { label: 'NIVEL', property: 'level', width: 200 }
          ],
          datas: []
        };
        
        // Procesar habilidades para extraer nivel si está disponible
        for (const skillText of analysis.skills) {
          const skill = {};
          const levelMatch = skillText.match(/(Básico|Intermedio|Avanzado|Experto)/i);
          if (levelMatch) {
            // Separar habilidad y nivel
            const level = levelMatch[0];
            const skillName = skillText.replace(levelMatch[0], '').replace(/-|:/g, '').trim();
            skill.skill = skillName;
            skill.level = level;
          } else {
            skill.skill = skillText;
            skill.level = 'No especificado';
          }
          skillTable.datas.push(skill);
        }
        
        await doc.table(skillTable, {
          width: 480,
          prepareHeader: () => doc.font('Helvetica-Bold').fontSize(12),
          prepareRow: (row, indexColumn, indexRow, rectRow, rectCell) => {
            doc.font('Helvetica').fontSize(10);
            if (indexColumn === 1) {
              // Colorear según nivel
              const level = row.level.toLowerCase();
              if (level.includes('experto')) {
                doc.fillColor(colors.secondary);
              } else if (level.includes('avanzado')) {
                doc.fillColor(colors.tertiary);
              } else if (level.includes('intermedio')) {
                doc.fillColor(colors.primary);
              } else {
                doc.fillColor(colors.text);
              }
            } else {
              doc.fillColor(colors.text);
            }
          }
        });
        
        doc.moveDown(3);
      }
      
      // Habilidades blandas
      if (hasSoftSkills) {
        doc.fontSize(16).font('Helvetica-Bold').fillColor(colors.primary)
           .text('HABILIDADES BLANDAS', {align: 'center'});
        doc.moveDown();
        
        const softSkillsTable = {
          title: '',
          headers: [
            { label: 'HABILIDAD', property: 'skill', width: 480 }
          ],
          datas: []
        };
        
        for (const skill of analysis.softSkills) {
          softSkillsTable.datas.push({ skill: `• ${skill}` });
        }
        
        await doc.table(softSkillsTable, {
          width: 480,
          prepareHeader: () => doc.font('Helvetica-Bold').fontSize(12),
          prepareRow: () => doc.font('Helvetica').fontSize(10)
        });
      }
    }

    // TERCERA SECCIÓN: Experiencia y formación académica
    // ---------------------------------------------------------------------------------
    
    // Verificar si hay experiencia, educación o certificaciones
    const hasExperience = analysis.experience && analysis.experience.length > 0;
    const hasEducation = analysis.education && analysis.education.length > 0;
    const hasCertifications = analysis.certifications && analysis.certifications.length > 0;
    
    // Solo añadir una nueva página si tenemos contenido para mostrar
    if (hasExperience || hasEducation || hasCertifications) {
      doc.addPage();
      addPageHeader(doc, candidateName, jobPosition, colors);
      
      // Experiencia
      if (hasExperience) {
        doc.fontSize(16).font('Helvetica-Bold').fillColor(colors.primary)
           .text('EXPERIENCIA RELEVANTE', {align: 'center'});
        doc.moveDown();
        
        for (const exp of analysis.experience) {
          doc.fontSize(12).font('Helvetica-Bold').fillColor(colors.dark).text('•');
          doc.moveUp();
          doc.fontSize(12).font('Helvetica').fillColor(colors.text).text(exp, 70, null, {
            width: doc.page.width - 120,
            align: 'left'
          });
          doc.moveDown(1);
        }
        
        doc.moveDown(2);
      }
      
      // Formación académica
      if (hasEducation) {
        doc.fontSize(16).font('Helvetica-Bold').fillColor(colors.primary)
           .text('FORMACIÓN ACADÉMICA', {align: 'center'});
        doc.moveDown();
        
        for (const edu of analysis.education) {
          doc.fontSize(12).font('Helvetica-Bold').fillColor(colors.dark).text('•');
          doc.moveUp();
          doc.fontSize(12).font('Helvetica').fillColor(colors.text).text(edu, 70, null, {
            width: doc.page.width - 120,
            align: 'left'
          });
          doc.moveDown(1);
        }
        
        doc.moveDown(2);
      }
      
      // Certificaciones y cursos
      if (hasCertifications) {
        // Comprobar si hay suficiente espacio en la página para esta sección
        if (doc.y > doc.page.height - 200) {
          doc.addPage();
          addPageHeader(doc, candidateName, jobPosition, colors);
        }
        
        doc.fontSize(16).font('Helvetica-Bold').fillColor(colors.primary)
           .text('CERTIFICACIONES Y CURSOS', {align: 'center'});
        doc.moveDown();
        
        for (const cert of analysis.certifications) {
          doc.fontSize(12).font('Helvetica-Bold').fillColor(colors.dark).text('•');
          doc.moveUp();
          doc.fontSize(12).font('Helvetica').fillColor(colors.text).text(cert, 70, null, {
            width: doc.page.width - 120,
            align: 'left'
          });
          doc.moveDown(1);
        }
      }
    }

    // CUARTA SECCIÓN: Recomendaciones y análisis adicionales
    // ---------------------------------------------------------------------------------
    
    // Verificar si hay recomendaciones, análisis de brecha o competencias clave
    const hasRecommendations = analysis.recommendations && analysis.recommendations.length > 0;
    const hasSkillsGap = analysis.skillsGap && analysis.skillsGap.trim().length > 0;
    const hasKeyCompetencies = analysis.keyCompetencies && analysis.keyCompetencies.trim().length > 0;
    
    // Solo añadir una nueva página si tenemos contenido para mostrar
    if (hasRecommendations || hasSkillsGap || hasKeyCompetencies) {
      doc.addPage();
      addPageHeader(doc, candidateName, jobPosition, colors);
      
      // Recomendaciones
      if (hasRecommendations) {
        doc.fontSize(16).font('Helvetica-Bold').fillColor(colors.primary)
           .text('RECOMENDACIONES', {align: 'center'});
        doc.moveDown();
        
        for (const rec of analysis.recommendations) {
          doc.fontSize(12).font('Helvetica-Bold').fillColor(colors.dark).text('•');
          doc.moveUp();
          doc.fontSize(12).font('Helvetica').fillColor(colors.text).text(rec, 70, null, {
            width: doc.page.width - 120,
            align: 'left'
          });
          doc.moveDown(1);
        }
        
        doc.moveDown(2);
      }
      
      // Análisis de brecha de habilidades
      if (hasSkillsGap) {
        // Comprobar si hay suficiente espacio en la página para esta sección
        if (doc.y > doc.page.height - 200) {
          doc.addPage();
          addPageHeader(doc, candidateName, jobPosition, colors);
        }
        
        doc.fontSize(16).font('Helvetica-Bold').fillColor(colors.primary)
           .text('ANÁLISIS DE BRECHA DE HABILIDADES', {align: 'center'});
        doc.moveDown();
        
        doc.fontSize(12).font('Helvetica').fillColor(colors.text).text(analysis.skillsGap, {
          width: doc.page.width - 80,
          align: 'left'
        });
        
        doc.moveDown(2);
      }
      
      // Análisis de competencias clave
      if (hasKeyCompetencies) {
        // Comprobar si hay suficiente espacio en la página para esta sección
        if (doc.y > doc.page.height - 200) {
          doc.addPage();
          addPageHeader(doc, candidateName, jobPosition, colors);
        }
        
        doc.fontSize(16).font('Helvetica-Bold').fillColor(colors.primary)
           .text('ANÁLISIS DE COMPETENCIAS CLAVE', {align: 'center'});
        doc.moveDown();
        
        doc.fontSize(12).font('Helvetica').fillColor(colors.text).text(analysis.keyCompetencies, {
          width: doc.page.width - 80,
          align: 'left'
        });
      }
    }
    
    // Añadir pie de página a todas las páginas
    const totalPages = doc.bufferedPageRange().count;
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      
      // Pie de página
      const pageHeight = doc.page.height;
      doc.fontSize(8).fillColor('#999')
         .text(
           'Este informe es confidencial y ha sido generado por MyWorkIn. © ' + new Date().getFullYear(),
           50,
           pageHeight - 40,
           { align: 'center' }
         );
      
      // Número de página
      doc.text(
        `Página ${i + 1} de ${totalPages}`,
        50,
        pageHeight - 25,
        { align: 'center' }
      );
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

/**
 * Dibuja un círculo de puntuación con el valor dentro
 * @param {PDFDocument} doc - Documento PDF
 * @param {number} score - Puntuación (0-100)
 * @param {number} x - Posición X
 * @param {number} y - Posición Y
 * @param {number} radius - Radio del círculo
 * @param {Object} colors - Colores para usar
 */
function drawScoreCircle(doc, score, x, y, radius, colors) {
  // Determinar color según puntuación
  let color = colors.secondary;
  if (score < 60) {
    color = colors.danger;
  } else if (score < 80) {
    color = colors.tertiary;
  }
  
  // Dibujar círculo exterior
  doc.circle(x, y, radius).lineWidth(3).stroke(color);
  
  // Dibujar círculo de fondo
  doc.circle(x, y, radius - 2).fill('#fff');
  
  // Añadir texto de puntuación
  doc.font('Helvetica-Bold').fontSize(22).fillColor(color)
     .text(score.toString(), x - 15, y - 15, {
       width: 30,
       align: 'center'
     });
     
  // Añadir texto de "puntos"
  doc.font('Helvetica').fontSize(10).fillColor(colors.dark)
     .text('puntos', x - 20, y + 8, {
       width: 40,
       align: 'center'
     });
     
  // Añadir texto de máximo
  doc.font('Helvetica').fontSize(8).fillColor('#999')
     .text('de 100', x - 20, y + 22, {
       width: 40,
       align: 'center'
     });
}

/**
 * Añade encabezado a cada página
 * @param {PDFDocument} doc - Documento PDF
 * @param {string} candidateName - Nombre del candidato
 * @param {string} jobPosition - Puesto
 * @param {Object} colors - Colores para usar
 */
function addPageHeader(doc, candidateName, jobPosition, colors) {
  // Dibujar una línea en la parte superior
  doc.lineWidth(1)
     .moveTo(40, 40)
     .lineTo(doc.page.width - 40, 40)
     .stroke(colors.primary);
  
  // Información del candidato en el encabezado
  doc.fontSize(10).font('Helvetica').fillColor(colors.text)
     .text(`Candidato: ${candidateName}`, 50, 50);
     
  doc.fontSize(10).font('Helvetica').fillColor(colors.text)
     .text(`Puesto: ${jobPosition}`, 50, 65);
     
  // Agregar logo en miniatura si está disponible (corregido para usar myworkinlogo.png)
  let logoPath = path.join(process.cwd(), 'src', 'assets', 'images', 'myworkinlogo.png');
  let logoExists = fs.pathExistsSync(logoPath);
  
  if (logoExists) {
    try {
      doc.image(logoPath, doc.page.width - 100, 45, { width: 60 });
    } catch (logoError) {
      // Continuar sin el logo si hay error - mostrar alternativa
      doc.rect(doc.page.width - 100, 45, 60, 30).fill(colors.primary);
      doc.fontSize(10).fillColor('#ffffff').font('Helvetica-Bold').text('MyWorkIn', doc.page.width - 90, 55);
    }
  } else {
    // Mostrar alternativa si no hay logo
    doc.rect(doc.page.width - 100, 45, 60, 30).fill(colors.primary);
    doc.fontSize(10).fillColor('#ffffff').font('Helvetica-Bold').text('MyWorkIn', doc.page.width - 90, 55);
  }
  
  // Dibujar una línea debajo del encabezado
  doc.lineWidth(1)
     .moveTo(40, 85)
     .lineTo(doc.page.width - 40, 85)
     .stroke('#e0e0e0');
  
  // Espacio después del encabezado
  doc.moveDown(2);
}

module.exports = {
  generateCVAnalysisPDF
}; 