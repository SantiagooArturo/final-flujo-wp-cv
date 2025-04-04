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
    let scoreColor = colors.primary; // Usar el color azul principal siempre
    
    // Posición del círculo de puntuación (subir 15 unidades)
    const scoreX = doc.page.width - 120;
    const scoreY = 90; // Antes era 105
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

    // Posicionar el texto centrado (ajustar la posición vertical para mejor centrado)
    const scoreTextX = scoreX - (scoreTextWidth / 2);
    const scoreTextY = scoreY - (scoreTextHeight / 2) - 3;

    // Dibujar el número con el color azul principal
    doc.fillColor(scoreColor)
       .text(scoreText, scoreTextX, scoreTextY);

    // Texto "puntos" debajo (ajustar posición)
    doc.font('Poppins')
       .fontSize(14);
    const puntosText = 'puntos';
    const puntosWidth = doc.widthOfString(puntosText);
    doc.fillColor('#333333')
       .text(puntosText, scoreX - (puntosWidth / 2), scoreY + 15);

    // Texto "de 100" debajo (ajustar posición)
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

    // Definir las subsecciones del CV para el análisis detallado
    const subsections = [
      {
        title: 'Experiencia laboral',
        content: processBulletList(analysis.experience, 'No se proporcionó información sobre experiencia laboral en el CV.'),
        observations: generateSpecificObservations('experience', processBulletList(analysis.experience, ''), jobPosition)
      },
      {
        title: 'Formación académica',
        content: processBulletList(analysis.education, 'No se encontró información sobre formación académica en el CV.'),
        observations: generateSpecificObservations('education', processBulletList(analysis.education, ''), jobPosition)
      },
      {
        title: 'Habilidades técnicas',
        content: processBulletList(analysis.skills, 'No se mencionaron habilidades técnicas específicas en el CV.'),
        observations: generateSpecificObservations('skills', processBulletList(analysis.skills, ''), jobPosition)
      },
      {
        title: 'Habilidades blandas',
        content: processBulletList(analysis.softSkills, 'No se mencionaron habilidades blandas en el CV.'),
        observations: generateSpecificObservations('softSkills', processBulletList(analysis.softSkills, ''), jobPosition)
      },
      {
        title: 'Certificaciones',
        content: processBulletList(analysis.certifications, 'No se incluyeron certificaciones en el CV.'),
        observations: generateSpecificObservations('certifications', processBulletList(analysis.certifications, ''), jobPosition)
      },
      {
        title: 'Proyectos relevantes',
        content: processBulletList(analysis.projects, 'No se mencionaron proyectos relevantes en el CV.'),
        observations: generateSpecificObservations('projects', processBulletList(analysis.projects, ''), jobPosition)
      }
    ];

    // Comprobar inmediatamente si hay contenido válido y mostrarlo sin espacios innecesarios
    let validSubsection = false;

    // Filtrar solo subsecciones con contenido relevante
    const validSubsections = subsections.filter(subsection => {
      const contentText = subsection.content;
      return !contentText.includes('No se proporcionó información') && 
             !contentText.includes('No se encontró información') && 
             !contentText.includes('No se mencionaron');
    });

    // Si no hay subsecciones válidas, mostrar mensaje y continuar
    if (validSubsections.length === 0) {
      doc.fontSize(12)
         .font('Poppins')
         .fillColor(colors.text)
         .text('No se pudo generar un análisis detallado por secciones del CV. Esto puede deberse a que el CV no contiene suficiente información estructurada para cada sección o el formato no permitió extraer los datos correctamente.', 50, currentY + 20, {
           width: doc.page.width - 100,
           align: 'left',
           lineGap: 3
         });
      
      currentY += 80; // Avanzar el cursor después del mensaje
    } else {
      // Procesar todas las subsecciones válidas con espacio optimizado
      for (let i = 0; i < validSubsections.length; i++) {
        const subsection = validSubsections[i];
        const contentText = subsection.content;
        const observationsText = subsection.observations;
        
        // Estimar la altura total del contenido
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
        
        // Calcular altura total necesaria (títulos + contenido + espaciado)
        const totalHeight = contentHeight + observationsHeight + 70;
        
        // Verificar si necesitamos una nueva página
        // Solo añadir nueva página si no es la primera subsección de esta sección
        if (currentY + totalHeight > doc.page.height - 50 && i > 0) {
          doc.addPage();
          drawPageHeader(doc, logoPath, logoExists, colors);
          currentY = 60;
        }
        
        // Añadir título de la subsección con espaciado reducido
        doc.fontSize(14)
           .fillColor(colors.secondary)
           .font('Poppins-Bold')
           .text(subsection.title, 50, currentY);
        
        // Contenido actual
        doc.fontSize(11)
           .font('Poppins')
           .fillColor(colors.text)
           .text(contentText, 50, currentY + 20, {
             width: doc.page.width - 100,
             align: 'left',
             lineGap: 3
           });
        
        // Ajustar espacio después del contenido (más compacto)
        currentY += 20 + contentHeight + 10;
        
        // Añadir subtítulo para las observaciones
        doc.fontSize(12)
           .fillColor(colors.tertiary)
           .font('Poppins-Medium')
           .text('💡 Sugerencias de mejora:', 50, currentY);
        
        // Añadir observaciones y recomendaciones
        doc.fontSize(11)
           .font('Poppins')
           .fillColor(colors.text)
           .text(observationsText, 50, currentY + 15, {
             width: doc.page.width - 100,
             align: 'left',
             lineGap: 3
           });
        
        // Actualizar posición Y con menos espacio entre subsecciones
        currentY += 15 + observationsHeight + (i < validSubsections.length - 1 ? 20 : 10);
      }
    }

    // Verificar si queda espacio suficiente para la siguiente sección
    if (currentY > doc.page.height - 130) {
      doc.addPage();
      drawPageHeader(doc, logoPath, logoExists, colors);
      currentY = 60;
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
    currentY = createSection(doc, 'SECCIÓN 5: RECOMENDACIONES ADICIONALES', currentY, colors);
    
    // Subsección: Palabras clave para aplicar a otras ofertas
    currentY = addSubsection(doc, 'Palabras clave para filtros ATS', processKeywordText(analysis.keyCompetencies), currentY, colors);
    
    // Subsección: Cursos recomendados
    currentY = addSubsection(doc, 'Cursos y certificaciones recomendados', processCursosText(analysis.learningRecommendations || analysis.skillsGap), currentY, colors);
    
    // Subsección: Próximos pasos
    currentY = addSubsection(doc, 'Próximos pasos', processProximosText(analysis.finalRecommendation), currentY, colors);
    
    // Añadir pie de página con agradecimiento y datos de contacto
    if (currentY > doc.page.height - 120) {
      doc.addPage();
      drawPageHeader(doc, logoPath, logoExists, colors);
      currentY = 60;
    }
    
    // Añadir agradecimiento final
    doc.fontSize(12)
       .font('Poppins-Medium')
       .fillColor(colors.primary)
       .text('Gracias por utilizar los servicios de MyWorkIn', 50, currentY, {
         width: doc.page.width - 100,
         align: 'center'
       });
    
    // Datos de contacto
    doc.fontSize(10)
       .font('Poppins-Light')
       .fillColor(colors.tertiary)
       .text('Para más información, visítanos en myworkin2.com o contáctanos en info@myworkin2.com', 50, currentY + 25, {
         width: doc.page.width - 100,
         align: 'center'
       });
    
    // Verificar el número total de páginas y limitar a 8
    const totalPages = doc.bufferedPageRange().count;
    
    // Si hay menos de 8 páginas, añadir páginas vacías hasta llegar a 8
    if (totalPages < 8) {
      const pagesToAdd = 8 - totalPages;
      for (let i = 0; i < pagesToAdd; i++) {
        doc.addPage();
        drawPageHeader(doc, logoPath, logoExists, colors);
      }
    }
    
    // Si hay más de 8 páginas, eliminar las páginas adicionales
    if (totalPages > 8) {
      // PDFKit no permite eliminar páginas directamente, pero podemos limitar
      // el número de páginas que se finalizan en el documento
      const pageRange = doc.bufferedPageRange();
      
      // Finalizar el documento con solo 8 páginas exactas
      doc.end();
      
      // Nota: La limitación a 8 páginas exactas dependerá de cómo procesemos
      // el buffer de salida del PDF, lo que requeriría manipulación a bajo nivel
      // del stream resultante. PDFKit no proporciona una forma sencilla de "truncar"
      // el PDF a un número específico de páginas.
      
      // Como alternativa, forzamos la salida a 8 páginas exactas mediante
      // la manipulación del objeto doc después de que se ha creado pero antes de finalizar
      return outputPath;
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

// Función para limpiar marcadores markdown **
const cleanMarkdownFormatting = (text) => {
  return text.replace(/\*\*/g, '').replace(/\*/g, '');
};

// Función para procesar contenido de listas
const processListContent = (content, defaultText) => {
  if (!content) {
    return defaultText;
  }
  
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
  
  // Función para limpiar marcadores markdown ** y *
  const cleanMarkdownFormatting = (text) => {
    return text.replace(/\*\*/g, '').replace(/\*/g, '');
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
  
  // Función para limpiar marcadores markdown ** y *
  const cleanMarkdownFormatting = (text) => {
    return text.replace(/\*\*/g, '').replace(/\*/g, '');
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

  // Verificar estado del contenido
  if (sectionContent.includes('No se proporcionó información') || 
      sectionContent.includes('No se encontró información') || 
      sectionContent.includes('No se mencionaron')) {
    // Si el contenido es un mensaje por defecto, proporcionar sugerencias genéricas
    return `No se encontró suficiente información en esta sección para proporcionar sugerencias específicas. Considera añadir detalles relevantes para el puesto de ${jobTitle}.`;
  }
  
  // Extraer líneas del contenido para analizar
  const contentLines = sectionContent.split('\n')
    .map(line => line.replace(/^•\s*/, '').trim())
    .filter(line => line.length > 0);
  
  if (contentLines.length === 0) {
    return `No se encontraron datos específicos para proporcionar sugerencias detalladas. Añade información relevante para el puesto de ${jobTitle}.`;
  }
  
  // Seleccionar 2-3 líneas para hacer sugerencias específicas
  const selectedLines = contentLines.length > 3 ? 
    [contentLines[0], contentLines[Math.floor(contentLines.length/2)], contentLines[contentLines.length-1]] : 
    contentLines;
    
  let specificObservations = [];
  
  // Generar sugerencias específicas basadas en el tipo de sección y las líneas seleccionadas
  if (sectionType === 'experience') {
    specificObservations = selectedLines.map(line => {
      const hasNumbers = /\d+%|\d+ veces|\d+ personas|\d+ proyectos|\d+ clientes/.test(line);
      const hasActionVerbs = /implementé|desarrollé|lideré|gestioné|aumenté|reduje|mejoré|optimicé|logré/.test(line.toLowerCase());
      
      if (!hasNumbers) {
        return `Cuantifica los resultados en: "${line}". Por ejemplo: "Aumenté ventas en un 30%" o "Reduje tiempo de procesamiento en un 25%".`;
      } else if (!hasActionVerbs) {
        return `Utiliza verbos de acción más impactantes en: "${line}". Por ejemplo, comienza con "Implementé", "Lideré" o "Desarrollé".`;
      } else {
        return `Complementa: "${line}" con el impacto específico que tuvo en la organización o equipo.`;
      }
    });
  } else if (sectionType === 'education') {
    specificObservations = selectedLines.map(line => {
      const hasRelevantCourses = /curso|materia|especialización|enfoque|orientado a/.test(line.toLowerCase());
      const hasAchievements = /promedio|calificación|honor|distinción|mérito|premio|beca/.test(line.toLowerCase());
      
      if (!hasRelevantCourses) {
        return `En tu formación: "${line}", añade cursos o materias relevantes para el puesto de ${jobTitle}.`;
      } else if (!hasAchievements) {
        return `Complementa: "${line}" con logros académicos destacables como promedio, reconocimientos o becas.`;
      } else {
        return `Relaciona más claramente: "${line}" con las habilidades requeridas para el puesto actual.`;
      }
    });
  } else if (sectionType === 'skills') {
    specificObservations = selectedLines.map(line => {
      const hasLevel = /básico|intermedio|avanzado|experto|\d+ años/.test(line.toLowerCase());
      const hasTechnicalDetails = /versión|framework|metodología|herramienta|plataforma/.test(line.toLowerCase());
      
      if (!hasLevel) {
        return `Especifica tu nivel de competencia en: "${line}". Por ejemplo: "(Avanzado, 3+ años de experiencia)".`;
      } else if (!hasTechnicalDetails) {
        return `Añade detalles técnicos específicos para: "${line}", como versiones, metodologías o plataformas utilizadas.`;
      } else {
        return `Complementa: "${line}" con un ejemplo concreto de aplicación en un proyecto o entorno laboral.`;
      }
    });
  } else if (sectionType === 'softSkills') {
    specificObservations = selectedLines.map(line => {
      const hasExample = /ejemplo|situación|caso|apliqué|implementé|desarrollé/.test(line.toLowerCase());
      const hasResults = /resultó en|permitió|aumentó|mejoró|facilitó|logré/.test(line.toLowerCase());
      
      if (!hasExample) {
        return `Añade un ejemplo concreto para: "${line}". Por ejemplo: "Demostrada al coordinar equipo multidisciplinario en proyecto X".`;
      } else if (!hasResults) {
        return `Complementa: "${line}" con los resultados tangibles que obtuviste gracias a esta habilidad.`;
      } else {
        return `Relaciona más directamente: "${line}" con las necesidades específicas del puesto de ${jobTitle}.`;
      }
    });
  } else if (sectionType === 'certifications') {
    specificObservations = selectedLines.map(line => {
      const hasDate = /\b(19|20)\d{2}\b|vigente|válido hasta|fecha/.test(line);
      const hasInstitution = /universidad|instituto|microsoft|google|oracle|cisco|pmimacromedia|amazon|scrum|certificado por/.test(line.toLowerCase());
      
      if (!hasDate) {
        return `Añade el año de obtención y vigencia a: "${line}". Por ejemplo: "(2023, vigente hasta 2026)".`;
      } else if (!hasInstitution) {
        return `Especifica la entidad certificadora reconocida para: "${line}".`;
      } else {
        return `Complementa: "${line}" explicando brevemente cómo aplicas estos conocimientos en tu trabajo.`;
      }
    });
  } else if (sectionType === 'projects') {
    specificObservations = selectedLines.map(line => {
      const hasRole = /mi rol|fui responsable|estuve a cargo|como|lideré|desarrollé|diseñé|implementé/.test(line.toLowerCase());
      const hasTechnologies = /usando|utilizando|con|tecnologías|herramientas|stack|framework|lenguaje/.test(line.toLowerCase());
      const hasResults = /logré|aumenté|reduje|mejoré|resultó en|permitió/.test(line.toLowerCase());
      
      if (!hasRole) {
        return `Especifica tu rol y responsabilidades en: "${line}". Por ejemplo: "Como líder técnico, fui responsable de..."`;
      } else if (!hasTechnologies) {
        return `Detalla las tecnologías y metodologías utilizadas en: "${line}".`;
      } else if (!hasResults) {
        return `Añade los resultados medibles que obtuviste en: "${line}". Por ejemplo: "...que resultó en un aumento del 40% en la eficiencia".`;
      } else {
        return `Relaciona más directamente: "${line}" con las habilidades relevantes para ${jobTitle}.`;
      }
    });
  }
  
  // Limitar a 3 observaciones máximo y unirlas con saltos de línea
  return specificObservations.slice(0, 3).join('\n\n');
};

module.exports = {
  generateCVAnalysisPDF,
  drawPageHeader
}; 