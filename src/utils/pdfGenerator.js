const PDFDocument = require('pdfkit');
const PDFTable = require('pdfkit-table');
const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');

// Rutas a los archivos de fuentes Poppins
const POPPINS_REGULAR = path.join(process.cwd(), 'src', 'assets', 'fonts', 'Poppins-Regular.ttf');
const POPPINS_BOLD = path.join(process.cwd(), 'src', 'assets', 'fonts', 'Poppins-Bold.ttf');
const POPPINS_MEDIUM = path.join(process.cwd(), 'src', 'assets', 'fonts', 'Poppins-Medium.ttf');
const POPPINS_LIGHT = path.join(process.cwd(), 'src', 'assets', 'fonts', 'Poppins-Light.ttf');

/**
 * Genera un PDF profesional con el análisis del CV
 * @param {Object} analysis - Resultado del análisis del CV
 * @param {string} jobPosition - Puesto al que aplica
 * @param {string} candidateName - Nombre del candidato (opcional)
 * @returns {Promise<string>} - Ruta del archivo PDF generado
 */
async function generateCVAnalysisPDF(analysis, jobPosition, candidateName = 'Candidato') {
  try {
    logger.info('Generando PDF con análisis del CV (versión actualizada)');
    
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
      margin: 50,
      info: {
        Title: 'Análisis de CV - RevisaCV',
        Author: 'RevisaCV',
        Subject: `Análisis de CV para ${jobPosition}`,
      },
      bufferPages: true
    });
    
    // Registrar fuentes personalizadas
    try {
      if (await fs.pathExists(POPPINS_REGULAR)) {
        doc.registerFont('Poppins', POPPINS_REGULAR);
        doc.registerFont('Poppins-Bold', POPPINS_BOLD);
        doc.registerFont('Poppins-Medium', POPPINS_MEDIUM);
        doc.registerFont('Poppins-Light', POPPINS_LIGHT);
        logger.info('Fuentes Poppins registradas correctamente');
      } else {
        logger.warn('No se encontraron las fuentes Poppins, usando fuentes por defecto');
      }
    } catch (fontError) {
      logger.error(`Error al registrar fuentes: ${fontError.message}`);
    }
    
    // Preparar stream para escribir el archivo
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);
    
    // Calcular puntuación general
    const score = analysis.score || 85;
    
    // Definir colores
    const colors = {
      primary: '#024579',         // Azul principal (antes verde)
      secondary: '#1e88e5',       // Azul
      tertiary: '#fb8c00',        // Naranja
      accent: '#6a1b9a',          // Púrpura
      danger: '#c62828',          // Rojo
      dark: '#263238',            // Azul oscuro
      light: '#f5f5f5',           // Gris claro
      title: '#024579',           // Azul para títulos (antes verde)
      text: '#37474f',            // Gris azulado para texto
      progressBar: '#024579',     // Azul para barras de progreso (antes verde)
      progressBg: '#e3f2fd',      // Azul claro para fondo de barras (antes verde claro)
      lightBg: '#e8f5fd'          // Azul muy claro para fondos (antes verde muy claro)
    };
    
    // Intentar cargar el logo
    let logoPath = path.join(process.cwd(), 'src', 'assets', 'images', 'myworkinlogo.png');
    let logoExists = await fs.pathExists(logoPath);
    
    // ========= NUEVO DISEÑO DEL PDF =========
    
    // ENCABEZADO
    // Usar la función para dibujar el encabezado en la primera página
    drawPageHeader(doc, logoPath, logoExists, colors);
    
    // TÍTULO DEL INFORME
    doc.fontSize(24)
       .fillColor(colors.primary)
       .font('Poppins-Bold')
       .text('INFORME DE REVISIÓN DE CV', 50, 60, {align: 'left'});

    // DATOS DEL CANDIDATO
    doc.fontSize(14)
       .fillColor(colors.dark)
       .font('Poppins-Bold')
       .text(`Nombre del candidato: ${candidateName}`, 50, 100);
       
    doc.fontSize(14)
       .fillColor(colors.dark)
       .font('Poppins-Medium')
       .text(`Puesto al que postula: ${capitalizeFirstLetter(jobPosition)}`, 50, 125);
       
    // Línea separadora
    doc.strokeColor(colors.tertiary)
       .lineWidth(2)
       .moveTo(50, 150)
       .lineTo(doc.page.width - 50, 150)
       .stroke();
    
    // GRÁFICO DE PUNTUACIÓN
    // Determinar color basado en la puntuación
    let scoreColor;
    if (score >= 80) {
      scoreColor = '#1e88e5'; // Azul
    } else if (score >= 60) {
      scoreColor = '#fb8c00'; // Naranja
    } else {
      scoreColor = '#c62828'; // Rojo
    }

    // Posición del círculo de puntuación
    const scoreX = doc.page.width - 120;
    const scoreY = 105;
    const circleRadius = 50;

    // Dibujar círculo exterior con borde de color
    doc.circle(scoreX, scoreY, circleRadius)
       .lineWidth(3)
       .fillAndStroke('#ffffff', scoreColor);

    // Tamaño de fuente adaptado según el número de dígitos
    const fontSize = score < 100 ? 36 : 30;
    doc.font('Poppins-Bold')
       .fontSize(fontSize);

    // Calcular dimensiones para centrar perfectamente
    const scoreText = score.toString();
    const scoreTextWidth = doc.widthOfString(scoreText);
    const scoreTextHeight = doc.heightOfString(scoreText);

    // Posicionar el texto centrado
    const scoreTextX = scoreX - (scoreTextWidth / 2);
    const scoreTextY = scoreY - (scoreTextHeight / 2) - 5;

    // Dibujar el número
    doc.fillColor(scoreColor)
       .text(scoreText, scoreTextX, scoreTextY);

    // Texto "puntos" debajo
    doc.font('Poppins')
       .fontSize(14);
    const puntosText = 'puntos';
    const puntosWidth = doc.widthOfString(puntosText);
    doc.fillColor('#333333')
       .text(puntosText, scoreX - (puntosWidth / 2), scoreY + 15);

    // Texto "de 100" debajo
    doc.font('Poppins-Light')
       .fontSize(12);
    const de100Text = 'de 100';
    const de100Width = doc.widthOfString(de100Text);
    doc.fillColor('#757575')
       .text(de100Text, scoreX - (de100Width / 2), scoreY + 35);
       
    // SECCIÓN 1: RESUMEN DEL CANDIDATO
    // Título de sección con fondo verde claro
    let currentY = 170;
    currentY = createSection(doc, 'SECCIÓN 1: RESUMEN DEL CANDIDATO', currentY, colors);
    
    // Texto del resumen
    const summaryText = analysis.summary || 'No se proporcionó un resumen ejecutivo en el análisis.';
    
    doc.fontSize(11)
       .font('Poppins')
       .fillColor(colors.text)
       .text(summaryText, 50, currentY, {
         width: doc.page.width - 100,
         align: 'justify',
         lineGap: 4
       });
    
    // Actualizar la posición Y
    const summaryHeight = doc.heightOfString(summaryText, {
      width: doc.page.width - 100,
      align: 'justify',
      lineGap: 4
    });
    currentY = currentY + summaryHeight + 40;
    
    // SECCIÓN 2: ASPECTOS CLAVE EVALUADOS
    // Título de sección
    currentY = createSection(doc, 'SECCIÓN 2: ASPECTOS CLAVE EVALUADOS', currentY, colors);
    
    // Dibujar barra de progreso con porcentaje
    const drawProgressBar = (x, y, width, percentage, label) => {
      // Texto para el nombre de la categoría (colocado encima de la barra)
      doc.fontSize(11)
         .font('Poppins-Medium')
         .fillColor(colors.dark)
         .text(label, x, y - 20, {width: width});

      // Fondo de la barra
      doc.rect(x, y, width, 15)
         .fillColor(colors.progressBg)
         .fill();
      
      // Barra de progreso
      const progress = Math.min(100, Math.max(0, percentage)) / 100;
      doc.rect(x, y, width * progress, 15)
         .fillColor(progress > 0.7 ? colors.secondary : progress > 0.4 ? colors.tertiary : colors.danger)
         .fill();
      
      // Etiqueta de porcentaje
      doc.fontSize(9)
         .font('Poppins-Bold')
         .fillColor('#ffffff')
         .text(`${Math.round(percentage)}%`, x + width * progress - 25, y + 3);
    };
    
    // Extraer coincidencia del texto de alineación si está disponible
    let matchPercentage = 70; // Valor por defecto
    if (analysis.alignment) {
      const matchMatch = analysis.alignment.match(/(\d+)%/);
      if (matchMatch) {
        matchPercentage = parseInt(matchMatch[1]);
      }
    }
    
    // Subtítulo: Brechas frente al rol
    doc.fontSize(14)
       .font('Poppins-Bold')
       .fillColor(colors.secondary)
       .text('Brechas frente al rol', 50, currentY);
       
    // Texto descriptivo sobre brechas
    let brechasText = analysis.skillsGap || 'No se identificaron brechas específicas en el perfil frente al rol.';
    
    doc.fontSize(11)
       .font('Poppins')
       .fillColor(colors.text)
       .text(brechasText, 50, currentY + 25, {
         width: doc.page.width - 100,
         align: 'left'
       });
    
    // Actualizar la posición Y
    const brechasHeight = doc.heightOfString(brechasText, {
      width: doc.page.width - 100,
      align: 'left'
    });
    currentY = currentY + brechasHeight + 55; // 25 (margen de texto) + 30 (espacio extra)
    
    // Mostrar barra de alineación con el puesto
    drawProgressBar(50, currentY, 500, matchPercentage, 'Alineación con el puesto');
    currentY += 40;
    
    // Subtítulo: Enfoque del CV
    doc.fontSize(14)
       .font('Poppins-Bold')
       .fillColor(colors.secondary)
       .text('Enfoque del CV', 50, currentY);
       
    // Texto sobre el enfoque
    let enfoqueText = analysis.alignment || 'No se proporcionó información sobre el enfoque del CV.';
    
    doc.fontSize(11)
       .font('Poppins')
       .fillColor(colors.text)
       .text(enfoqueText, 50, currentY + 25, {
         width: doc.page.width - 100,
         align: 'left'
       });
    
    // Actualizar la posición Y
    const enfoqueHeight = doc.heightOfString(enfoqueText, {
      width: doc.page.width - 100,
      align: 'left'
    });
    currentY = currentY + enfoqueHeight + 55; // 25 (margen de texto) + 30 (espacio extra)
    
    // Verificar si queda espacio suficiente para la siguiente sección
    if (currentY > doc.page.height - 150) {
      doc.addPage();
      drawPageHeader(doc, logoPath, logoExists, colors);
      currentY = 60;
    }
    
    // SECCIÓN 3: ANÁLISIS DETALLADO POR SECCIÓN DEL CV
    // Título de la sección 3
    currentY = createSection(doc, 'SECCIÓN 3: ANÁLISIS DETALLADO POR SECCIÓN DEL CV', currentY, colors);
    
    // Definir todas las subsecciones con sus contenidos y recomendaciones
    const subsections = [
      {
        title: 'Experiencia laboral',
        content: processListContent(analysis.experience, 'No se proporcionó información sobre la experiencia laboral.'),
        observations: generateSpecificObservations('experiencia', 
                                                 typeof analysis.experience === 'string' ? analysis.experience : 
                                                 Array.isArray(analysis.experience) ? analysis.experience.join('\n') : 
                                                 analysis.experience?.roles ? analysis.experience.roles.join('\n') : '',
                                                 jobPosition)
      },
      {
        title: 'Formación académica',
        content: processListContent(analysis.education, 'No se proporcionó información sobre la formación académica.'),
        observations: generateSpecificObservations('formación',
                                                 typeof analysis.education === 'string' ? analysis.education :
                                                 Array.isArray(analysis.education) ? analysis.education.join('\n') :
                                                 analysis.education?.items ? analysis.education.items.join('\n') : '',
                                                 jobPosition)
      },
      {
        title: 'Habilidades y competencias',
        content: processListContent(analysis.skills, 'No se proporcionó información sobre habilidades y competencias.'),
        observations: generateSpecificObservations('habilidades',
                                                 typeof analysis.skills === 'string' ? analysis.skills :
                                                 Array.isArray(analysis.skills) ? analysis.skills.join('\n') :
                                                 analysis.skills?.items ? analysis.skills.items.join('\n') : '',
                                                 jobPosition)
      },
      {
        title: 'Certificaciones y cursos',
        content: processListContent(analysis.certifications, 'No se proporcionó información sobre certificaciones y cursos.'),
        observations: generateSpecificObservations('certificaciones',
                                                 typeof analysis.certifications === 'string' ? analysis.certifications :
                                                 Array.isArray(analysis.certifications) ? analysis.certifications.join('\n') :
                                                 analysis.certifications?.items ? analysis.certifications.items.join('\n') : '',
                                                 jobPosition)
      },
      {
        title: 'Proyectos destacados',
        content: processListContent(analysis.projects, 'No se mencionaron proyectos destacados en el análisis.'),
        observations: generateSpecificObservations('proyectos',
                                                 typeof analysis.projects === 'string' ? analysis.projects :
                                                 Array.isArray(analysis.projects) ? analysis.projects.join('\n') :
                                                 analysis.projects?.items ? analysis.projects.items.join('\n') : '',
                                                 jobPosition)
      },
      {
        title: 'Habilidades blandas',
        content: processListContent(analysis.softSkills, 'No se mencionaron habilidades blandas específicas en el análisis.'),
        observations: generateSpecificObservations('habilidades blandas',
                                                 typeof analysis.softSkills === 'string' ? analysis.softSkills :
                                                 Array.isArray(analysis.softSkills) ? analysis.softSkills.join('\n') :
                                                 analysis.softSkills?.items ? analysis.softSkills.items.join('\n') : '',
                                                 jobPosition)
      }
    ];
    
    // Añadir cada subsección, creando nuevas páginas cuando sea necesario
    for (const subsection of subsections) {
      // Estimar la altura del contenido y observaciones
      const contentText = subsection.content;
      const observationsText = subsection.observations;
      
      const contentHeight = doc.heightOfString(contentText, {
        width: doc.page.width - 100,
        align: 'left',
        lineGap: 3
      });
      
      const observationsHeight = doc.heightOfString(observationsText, {
        width: doc.page.width - 100,
        align: 'left',
        lineGap: 3
      });
      
      // Altura total estimada incluyendo títulos y espaciado
      const totalHeight = contentHeight + observationsHeight + 80;
      
      // Verificar si hay espacio suficiente o si estamos al principio de la sección
      // Si no hay suficiente espacio y no estamos en la primera sección de la página, crear nueva página
      if (currentY + totalHeight > doc.page.height - 50 && currentY > 100) {
        doc.addPage();
        drawPageHeader(doc, logoPath, logoExists, colors);
        currentY = 60;
      }
      
      // Verificar si esta sección está vacía o tiene contenido mínimo
      const isMinimalContent = contentText === 'No se proporcionó información' || 
                              contentText.includes('No se encontró información') || 
                              contentText.includes('No se mencionaron');
      
      // Si el contenido es mínimo y no es la primera sección, reducir el espacio anterior
      if (isMinimalContent && subsections.indexOf(subsection) > 0) {
        currentY -= 10;
      }
      
      // Añadir título de la subsección
      doc.fontSize(14)
         .fillColor(colors.secondary)
         .font('Poppins-Bold')
         .text(subsection.title, 50, currentY);
      
      // Contenido actual
      doc.fontSize(11)
         .font('Poppins')
         .fillColor(colors.text)
         .text(contentText, 50, currentY + 25, {
           width: doc.page.width - 100,
           align: 'left',
           lineGap: 3
         });
      
      // Ajustar el espaciado según la cantidad de contenido
      const contentSpacing = contentHeight < 50 ? 10 : 15;
      currentY += 25 + contentHeight + contentSpacing;
      
      // Añadir subtítulo para las observaciones
      doc.fontSize(12)
         .fillColor(colors.tertiary)
         .font('Poppins-Medium')
         .text('💡 Sugerencias de mejora:', 50, currentY);
      
      // Añadir observaciones y recomendaciones
      doc.fontSize(11)
         .font('Poppins')
         .fillColor(colors.text)
         .text(observationsText, 50, currentY + 20, {
           width: doc.page.width - 100,
           align: 'left',
           lineGap: 3
         });
      
      // Ajustar el espaciado entre secciones según la longitud del contenido
      const observationsSpacing = observationsHeight < 70 ? 15 : 30;
      currentY += 20 + observationsHeight + observationsSpacing;
    }
    
    // SECCIÓN 4: OBSERVACIONES Y OPORTUNIDADES DE MEJORA
    doc.addPage();
    drawPageHeader(doc, logoPath, logoExists, colors);
    currentY = 60;
    
    // Título de la sección 4
    currentY = createSection(doc, 'SECCIÓN 4: OBSERVACIONES Y OPORTUNIDADES DE MEJORA', currentY, colors);
    
    // Definir las subsecciones de la sección 4
    const section4Subsections = [
      {
        title: 'Fortalezas',
        content: processBulletList(analysis.strengths, 'No se identificaron fortalezas específicas en el análisis.')
      },
      {
        title: 'Áreas de mejora',
        content: processBulletList(analysis.improvements, 'No se identificaron áreas de mejora específicas en el análisis.')
      },
      {
        title: 'Recomendaciones específicas',
        content: processNumberedList(analysis.recommendations, 'No se proporcionaron recomendaciones específicas en el análisis.')
      }
    ];
    
    // Añadir cada subsección de la sección 4
    for (const subsection of section4Subsections) {
      // Estimar la altura del contenido
      const contentHeight = doc.heightOfString(subsection.content, {
        width: doc.page.width - 100,
        align: 'left',
        lineGap: 3
      });
      
      // Verificar si hay espacio suficiente
      if (currentY + contentHeight + 100 > doc.page.height) {
        doc.addPage();
        drawPageHeader(doc, logoPath, logoExists, colors);
        currentY = 60;
      }
      
      // Añadir la subsección
      currentY = addSubsection(doc, subsection.title, subsection.content, currentY, colors);
    }
    
    // SECCIÓN 5: RECOMENDACIONES ADICIONALES
    // Verificar si hay espacio suficiente para la sección 5
    if (currentY + 300 > doc.page.height) {
      doc.addPage();
      drawPageHeader(doc, logoPath, logoExists, colors);
      currentY = 60;
    } else {
      // Si hay espacio, añadir un margen adicional
      currentY += 20;
    }
    
    // Título de la sección 5
    currentY = createSection(doc, 'SECCIÓN 5: RECOMENDACIONES ADICIONALES', currentY, colors);
    
    // Keywords para filtros ATS
    const keywordsText = processKeywordText(analysis.keyCompetencies);
    currentY = addSubsection(doc, 'Keywords para filtros ATS', keywordsText, currentY, colors);
    
    // Verificar espacio para cursos recomendados
    if (currentY + 200 > doc.page.height) {
      doc.addPage();
      drawPageHeader(doc, logoPath, logoExists, colors);
      currentY = 60;
    }
    
    // Cursos recomendados
    const cursosText = processCursosText(analysis.skillsGap);
    currentY = addSubsection(doc, 'Cursos recomendados', cursosText, currentY, colors);
    
    // Verificar espacio para próximos pasos
    if (currentY + 200 > doc.page.height) {
      doc.addPage();
      drawPageHeader(doc, logoPath, logoExists, colors);
      currentY = 60;
    }
    
    // Próximos pasos
    const proximosText = processProximosText(analysis.finalRecommendation);
    addSubsection(doc, 'Próximos pasos', proximosText, currentY, colors);
    
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

// Helper para capitalizar la primera letra
function capitalizeFirstLetter(string) {
  if (!string) return '';
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// Función para procesar contenido de listas
const processListContent = (content, defaultText) => {
  if (!content) {
    return defaultText;
  }
  
  // Función para limpiar marcadores markdown **
  const cleanMarkdownFormatting = (text) => {
    return text.replace(/\*\*/g, '');
  };
  
  // Si es un array, formatear como lista con viñetas
  if (Array.isArray(content)) {
    if (content.length === 0) {
      return defaultText;
    }
    return content.map(item => `• ${cleanMarkdownFormatting(item)}`).join('\n');
  }
  
  // Si es un string, devolverlo tal cual pero sin marcadores markdown
  if (typeof content === 'string') {
    return cleanMarkdownFormatting(content);
  }
  
  // Si es un objeto, extraer roles o items
  if (typeof content === 'object') {
    if (content.roles && Array.isArray(content.roles) && content.roles.length > 0) {
      return content.roles.map(item => `• ${cleanMarkdownFormatting(item)}`).join('\n');
    }
    if (content.items && Array.isArray(content.items) && content.items.length > 0) {
      return content.items.map(item => `• ${cleanMarkdownFormatting(item)}`).join('\n');
    }
  }
  
  return defaultText;
};

// Función para procesar listas con viñetas
function processBulletList(items, defaultText) {
  if (!items || !items.length) {
    return defaultText;
  }
  
  // Función para limpiar marcadores markdown **
  const cleanMarkdownFormatting = (text) => {
    return text.replace(/\*\*/g, '');
  };
  
  let content = '';
  for (const item of items) {
    content += `• ${cleanMarkdownFormatting(item)}\n`;
  }
  
  return content;
}

// Función para procesar listas numeradas
function processNumberedList(items, defaultText) {
  if (!items || !items.length) {
    return defaultText;
  }
  
  // Función para limpiar marcadores markdown **
  const cleanMarkdownFormatting = (text) => {
    return text.replace(/\*\*/g, '');
  };
  
  let content = '';
  for (let i = 0; i < items.length; i++) {
    content += `${i+1}. ${cleanMarkdownFormatting(items[i])}\n`;
  }
  
  return content;
}

// Función para procesar texto de keywords
function processKeywordText(keyCompetencies) {
  let text = 'Palabras clave recomendadas para superar los filtros automáticos:';
  
  if (keyCompetencies) {
    text += '\n\n' + keyCompetencies;
  } else {
    text += '\n\n• Incluye palabras clave relacionadas con las habilidades mencionadas en la descripción del puesto\n• Utiliza terminología específica del sector y la industria\n• Incorpora nombres de tecnologías, herramientas o métodos relevantes';
  }
  
  return text;
}

// Función para procesar texto de cursos
function processCursosText(skillsGap) {
  let text = 'Cursos que podrían fortalecer tu perfil profesional:';
  
  if (skillsGap) {
    text += '\n\n• Cursos técnicos en las áreas identificadas como brechas\n• Certificaciones relacionadas con las competencias clave mencionadas\n• Formación complementaria en habilidades blandas relevantes para el puesto';
  } else {
    text += '\n\n• Cursos técnicos específicos para cerrar brechas de conocimiento\n• Certificaciones reconocidas en el sector\n• Cursos en habilidades blandas complementarias';
  }
  
  return text;
}

// Función para procesar texto de próximos pasos
function processProximosText(finalRecommendation) {
  let text = 'Para maximizar tus oportunidades laborales, te recomendamos:';
  
  if (finalRecommendation) {
    text += '\n\n' + finalRecommendation;
  } else {
    text += '\n\n1. Implementa las mejoras sugeridas en tu CV\n2. Prepárate para entrevistas simulando preguntas frecuentes\n3. Investiga a fondo las empresas antes de postular\n4. Personaliza tu CV para cada puesto al que apliques';
  }
  
  return text;
}

// Función para dibujar el encabezado en cada página
const drawPageHeader = (doc, logoPath, logoExists, colors) => {
  // Se elimina la barra superior azul
  
  // Intentar cargar el logo
  if (logoExists) {
    try {
      doc.image(logoPath, 40, 5, { width: 120 });
    } catch (logoErr) {
      logger.error(`Error al cargar el logo: ${logoErr.message}`);
      // Si falla, mostrar texto como fallback
      doc.fontSize(18).font('Poppins-Bold').fillColor(colors.primary).text('MyWorkIn', 40, 12);
    }
  } else {
    // Si no existe el logo, mostrar el texto
    doc.fontSize(18).font('Poppins-Bold').fillColor(colors.primary).text('MyWorkIn', 40, 12);
  }
  
  doc.fontSize(12).font('Poppins').fillColor(colors.primary).text('myworkin2.com', doc.page.width - 180, 14);
};

// Función para crear una nueva sección con título
const createSection = (doc, title, y, colors) => {
  doc.rect(50, y, doc.page.width - 100, 30)
     .fillColor(colors.lightBg)
     .fill();
     
  doc.fontSize(16)
     .fillColor(colors.primary)
     .font('Poppins-Bold')
     .text(title, 60, y + 7);
  
  return y + 50; // Retornar la posición Y después del título
};

// Función para añadir una subsección
const addSubsection = (doc, title, content, y, colors) => {
  // Título de la subsección
  doc.fontSize(14)
     .fillColor(colors.secondary)
     .font('Poppins-Bold')
     .text(title, 50, y);
  
  // Contenido
  doc.fontSize(11)
     .font('Poppins')
     .fillColor(colors.text)
     .text(content, 50, y + 25, {
       width: doc.page.width - 100,
       align: 'left',
       lineGap: 3
     });
  
  // Calcular altura del contenido
  const contentHeight = doc.heightOfString(content, {
    width: doc.page.width - 100,
    align: 'left',
    lineGap: 3
  });
  
  // Retornar la posición Y después del contenido
  return y + 25 + contentHeight + 30;
};

// Función para generar observaciones específicas según el tipo de sección y el contenido real
const generateSpecificObservations = (sectionType, sectionContent = '', jobTitle = '') => {
  // Si no hay contenido, proporcionar sugerencias básicas
  if (!sectionContent || typeof sectionContent !== 'string') {
    sectionContent = '';
  }

  // Determinar si la posición es técnica o administrativa basada en palabras clave
  const techKeywords = ['desarrollador', 'programador', 'software', 'ingeniero', 'sistemas', 'devops', 'fullstack', 'backend', 'frontend', 'datos'];
  const adminKeywords = ['administrador', 'administrativo', 'ventas', 'recursos humanos', 'rrhh', 'marketing', 'finanzas', 'contabilidad', 'gerente', 'atención al cliente', 'servicio'];
  
  const positionType = jobTitle && typeof jobTitle === 'string'
    ? (techKeywords.some(kw => jobTitle.toLowerCase().includes(kw)) 
      ? 'tech' 
      : adminKeywords.some(kw => jobTitle.toLowerCase().includes(kw)) 
        ? 'admin' 
        : 'general')
    : 'general';
  
  // Analizar el contenido para identificar patrones
  const contentLower = sectionContent.toLowerCase();
  const hasTechExperience = techKeywords.some(kw => contentLower.includes(kw));
  const hasAdminExperience = adminKeywords.some(kw => contentLower.includes(kw));
  
  // Detectar otras características del contenido
  const hasQuantifiableResults = /\d+%|aumentó|redujo|mejoró|optimizó|logró/.test(contentLower);
  const hasSpecificTechnologies = /java|javascript|python|react|angular|node|spring|flutter|sql|nosql|mongodb|aws|azure|docker|kubernetes/.test(contentLower);
  
  // Extraer fragmentos específicos del contenido
  const extractFragments = (content) => {
    // Dividir el contenido en líneas o puntos
    const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // Regresar las líneas que contengan patrones específicos (o las primeras 2-3 líneas si no hay muchos patrones)
    const fragments = [];
    
    // Buscar líneas con patrones de interés
    const responsibleLines = lines.filter(line => /responsable de|encargad[oa] de|a cargo de/i.test(line));
    const genericLines = lines.filter(line => !line.match(/\d+%|\d+ personas|\d+ proyectos|\d+ clientes|aumentó|redujo|mejoró/) && line.length > 20);
    const roleLines = lines.filter(line => /\*\*[^*]+\*\*/.test(line)); // Líneas con nombres de puestos en formato **Puesto**
    
    // Priorizar las líneas con patrones de interés
    if (responsibleLines.length > 0) {
      fragments.push(...responsibleLines.slice(0, 2));
    }
    
    if (genericLines.length > 0 && fragments.length < 3) {
      fragments.push(...genericLines.slice(0, 3 - fragments.length));
    }
    
    if (roleLines.length > 0 && fragments.length < 3) {
      fragments.push(...roleLines.slice(0, 3 - fragments.length));
    }
    
    // Si aún no tenemos suficientes fragmentos, añadir las primeras líneas
    if (fragments.length < 2 && lines.length > 0) {
      const remainingNeeded = 2 - fragments.length;
      const additionalLines = lines.slice(0, remainingNeeded).filter(line => !fragments.includes(line));
      fragments.push(...additionalLines);
    }
    
    return fragments.filter((f, index, self) => self.indexOf(f) === index); // Eliminar duplicados
  };
  
  const fragments = extractFragments(sectionContent);
  let specificObservations = [];
  
  // Generar sugerencias específicas basadas en el tipo de sección, el análisis del contenido y los fragmentos
  if (sectionType === 'experiencia') {
    // Si tenemos fragmentos específicos, usarlos para generar sugerencias
    if (fragments.length > 0) {
      for (const fragment of fragments) {
        // Si el fragmento contiene "Responsable de" o similar
        if (/responsable de|encargad[oa] de|a cargo de/i.test(fragment)) {
          const cleanFragment = fragment.replace(/•\s*/, '').trim();
          
          // Verificar tipo de responsabilidades
          if (/ventas|cliente|atención/i.test(fragment)) {
            specificObservations.push(`Convierte "${cleanFragment}" en "Incrementé ventas en un 25% mediante la implementación de estrategias de fidelización que mejoraron la retención de clientes en un 30%".`);
          } else if (/administra|gestión|planificación|documentación/i.test(fragment)) {
            specificObservations.push(`Transforma "${cleanFragment}" en "Optimicé procesos administrativos reduciendo tiempos de gestión documental en un 40%, procesando eficientemente más de 500 documentos mensuales".`);
          } else if (/equipo|desarrolladores|personal/i.test(fragment)) {
            specificObservations.push(`Convierte "${cleanFragment}" en "Lideré equipo multidisciplinario de 8 personas, implementando metodologías de trabajo que aumentaron la productividad en un 35% y redujeron plazos de entrega".`);
          } else {
            specificObservations.push(`Reemplaza "${cleanFragment}" con una versión que incluya métricas concretas y verbos de acción al inicio: "Gestioné eficientemente X logrando una mejora del Y% en Z".`);
          }
        } 
        // Si es una línea que menciona un puesto (**Puesto**)
        else if (/\*\*[^*]+\*\*/.test(fragment)) {
          const match = fragment.match(/\*\*([^*]+)\*\*/);
          if (match) {
            const position = match[1];
            specificObservations.push(`En tu experiencia como "${position}", añade 2-3 logros cuantificables específicos: "Implementé sistema de gestión que redujo costos operativos en 20%" o "Aumenté la eficiencia del departamento en un 35% mediante la automatización de procesos repetitivos".`);
          }
        }
        // Para otras líneas genéricas
        else {
          const cleanFragment = fragment.replace(/•\s*/, '').trim();
          specificObservations.push(`Mejora "${cleanFragment}" incluyendo métricas específicas y resultados cuantificables que demuestren tu impacto en la organización.`);
        }
      }
    } 
    // Si no hay fragmentos específicos pero hay contenido
    else if (sectionContent.length > 0) {
      // Recomendaciones basadas en el tipo de puesto
      if (hasAdminExperience || positionType === 'admin') {
        specificObservations.push('En tu experiencia administrativa, cuantifica tus logros: "Reduje tiempo de procesamiento administrativo en un 35%" o "Mejoré la satisfacción del cliente en un 28% implementando nuevos protocolos de atención".');
      } else if (hasTechExperience || positionType === 'tech') {
        specificObservations.push('En tu experiencia técnica, destaca métricas de rendimiento: "Reduje tiempo de carga de la aplicación en un 45%" o "Aumenté la escalabilidad del sistema para soportar 10,000+ usuarios concurrentes".');
      }
      
      specificObservations.push('Utiliza verbos de acción impactantes al inicio de cada punto: "Implementé", "Desarrollé", "Optimicé", "Lideré" o "Gestioné" en lugar de descripciones pasivas.');
    }
    
  } else if (sectionType === 'formación') {
    // Si tenemos fragmentos específicos, usarlos para generar sugerencias
    if (fragments.length > 0) {
      for (const fragment of fragments) {
        const cleanFragment = fragment.replace(/•\s*/, '').trim();
        
        // Si menciona un título o institución
        if (/ingenier[oaí]|licenciatur[ao]|técnic[oa]|universidad|instituto|escuela/i.test(fragment)) {
          if (!fragment.match(/especializ|énfasis|orientad[oa] a/i)) {
            specificObservations.push(`Complementa "${cleanFragment}" indicando tu especialización específica y cómo se alinea con el puesto al que aplicas: "con especialización en X, desarrollando habilidades clave para Y".`);
          }
          
          if (!fragment.match(/proyect[oa]|tesis|trabajo final/i)) {
            specificObservations.push(`Añade a "${cleanFragment}" un proyecto académico destacado relevante para el puesto: "Desarrollé proyecto final sobre optimización de procesos administrativos que redujo tiempos de gestión en un 40%".`);
          }
        }
        
        // Si no menciona calificaciones o distinciones
        if (!fragment.match(/promedio|calificación|honor|distinción|mérito/i) && /universidad|instituto|escuela/i.test(fragment)) {
          specificObservations.push(`Complementa "${cleanFragment}" con tu promedio académico (si es destacable) o distinciones recibidas: "con promedio de 8.5/10, reconocido por excelencia académica".`);
        }
      }
    } 
    // Si no hay fragmentos específicos pero hay contenido
    else if (sectionContent.length > 0) {
      specificObservations.push('Especifica tu especialización o énfasis dentro de tu formación académica, mostrando cómo se relaciona directamente con las responsabilidades del puesto al que aplicas.');
      
      specificObservations.push('Incluye al menos un proyecto académico destacado con resultados cuantificables, demostrando habilidades relevantes para el puesto: "Lideré proyecto de [tema relacionado con el puesto] logrando [resultado medible]".');
    }
    
  } else if (sectionType === 'habilidades') {
    // Si tenemos fragmentos específicos, usarlos para generar sugerencias
    if (fragments.length > 0) {
      for (const fragment of fragments) {
        const cleanFragment = fragment.replace(/•\s*/, '').trim();
        
        // Si es una habilidad técnica sin nivel especificado
        if (hasSpecificTechnologies && !fragment.match(/básico|intermedio|avanzado|\d+ años/i)) {
          specificObservations.push(`Mejora "${cleanFragment}" especificando tu nivel y experiencia: "${cleanFragment} (Avanzado, 3+ años) con experiencia en proyectos de [tipo de proyecto específico]".`);
        }
        // Si es una lista general de habilidades
        else if (fragment.includes(',') && fragment.split(',').length > 2) {
          specificObservations.push(`Reorganiza "${cleanFragment}" agrupando por categorías de habilidades y especificando nivel de dominio en cada una.`);
        }
        // Si es una habilidad administrativa
        else if (hasAdminExperience || positionType === 'admin') {
          if (!/excel|office|microsoft|sap|erp/i.test(fragment) && (hasAdminExperience || positionType === 'admin')) {
            specificObservations.push(`Complementa tus habilidades añadiendo dominio de herramientas específicas para roles administrativos: "Excel avanzado (tablas dinámicas, macros, Power Query)" o "SAP (Módulos FI/CO)".`);
          }
        }
      }
    } 
    // Si no hay fragmentos específicos pero hay contenido
    else if (sectionContent.length > 0) {
      if (hasTechExperience || positionType === 'tech') {
        specificObservations.push('Especifica versiones y niveles de experiencia con cada tecnología: "React 18 (Avanzado, 2+ años)", "Node.js (Intermedio, 1.5 años)".');
      } else {
        specificObservations.push('Organiza tus habilidades por categorías relevantes para el puesto (ej: "Gestión administrativa", "Atención al cliente", "Herramientas ofimáticas") y especifica tu nivel en cada una.');
      }
    }
    
  } else if (sectionType === 'habilidades blandas') {
    // Si tenemos fragmentos específicos, usarlos para generar sugerencias
    if (fragments.length > 0) {
      for (const fragment of fragments) {
        const cleanFragment = fragment.replace(/•\s*/, '').trim();
        
        // Si es una habilidad blanda sin ejemplo concreto
        if (!fragment.match(/ejemplo|situación|caso|logré|conseguí|resultados|redujo|aumentó|mejoró/i)) {
          // Adaptar según el tipo de habilidad
          if (/comunicación|verbal|escrita|presentaciones/i.test(fragment)) {
            specificObservations.push(`Enriquece "${cleanFragment}" con un ejemplo concreto: "Comunicación efectiva: Reduje malentendidos en un 70% implementando nuevo protocolo de comunicación interna para un equipo de 20 personas".`);
          } else if (/liderazgo|dirección|gestión de equipo/i.test(fragment)) {
            specificObservations.push(`Mejora "${cleanFragment}" añadiendo un ejemplo cuantificable: "Liderazgo: Dirigí equipo de 8 personas en proyecto crítico, entregando resultados 2 semanas antes del plazo con un 15% menos de presupuesto".`);
          } else if (/resolución|problemas|conflictos|crisis/i.test(fragment)) {
            specificObservations.push(`Potencia "${cleanFragment}" con un caso específico: "Resolución de problemas: Identifiqué y solucioné fallo crítico que afectaba a 200+ clientes, restaurando servicio en menos de 3 horas".`);
          } else {
            specificObservations.push(`Acompaña "${cleanFragment}" con un ejemplo concreto que demuestre cómo aplicaste esta habilidad en un contexto laboral y los resultados medibles que obtuviste.`);
          }
        }
      }
    } 
    // Si no hay fragmentos específicos pero hay contenido
    else if (sectionContent.length > 0) {
      specificObservations.push('Para cada habilidad blanda, añade un breve ejemplo concreto de cómo la aplicaste: "Trabajo en equipo: Colaboré con departamentos de Ventas y Marketing para lanzar campaña que incrementó conversiones en un 25%".');
      
      if (hasAdminExperience || positionType === 'admin') {
        specificObservations.push('Para roles administrativos, destaca ejemplos específicos de: "Gestión eficiente del tiempo: Administré simultáneamente 12 proyectos cumpliendo el 100% de los plazos" o "Atención al detalle: Reduje errores administrativos en un 40% implementando nuevo sistema de verificación".');
      } else if (hasTechExperience || positionType === 'tech') {
        specificObservations.push('Para roles técnicos, enfatiza ejemplos de: "Adaptabilidad técnica: Aprendí 3 nuevas tecnologías en 6 meses para satisfacer requisitos cambiantes del proyecto" o "Resolución de problemas: Solucioné bug crítico que afectaba al 30% de los usuarios en menos de 48 horas".');
      }
    }
  }
  
  // Si no se generaron observaciones específicas, usar observaciones predeterminadas
  if (specificObservations.length === 0) {
    const defaultObservations = [
      'Incluye métricas específicas y cuantificables en cada punto: "Aumenté ventas en 45%" en lugar de "Aumenté ventas significativamente".',
      'Utiliza verbos de acción impactantes al inicio de cada punto: "Implementé", "Rediseñé", "Optimicé" en vez de descripciones pasivas.',
      'Personaliza el contenido específicamente para el puesto al que aplicas, destacando experiencias y habilidades directamente relevantes.'
    ];
    specificObservations = defaultObservations;
  }
  
  // Limitar a 3 observaciones máximo, priorizando las más específicas
  // (las que contienen fragmentos de texto entre comillas)
  specificObservations.sort((a, b) => {
    const aHasQuotes = a.includes('"');
    const bHasQuotes = b.includes('"');
    if (aHasQuotes && !bHasQuotes) return -1;
    if (!aHasQuotes && bHasQuotes) return 1;
    return 0;
  });
  
  const numObservations = Math.min(specificObservations.length, 3);
  const selectedObservations = specificObservations.slice(0, numObservations);
  
  // Limpiar cualquier marcador de negrita ** que pueda estar en las sugerencias
  const cleanMarkdown = (text) => text.replace(/\*\*/g, '');
  return selectedObservations.map(cleanMarkdown).join('\n\n');
};

module.exports = {
  generateCVAnalysisPDF,
  drawPageHeader
}; 