const PDFDocument = require('pdfkit');
const PDFTable = require('pdfkit-table');
const fs = require('fs-extra');
const path = require('path');
const logger = require('./logger');

// Rutas a los archivos de fuentes Poppins
const POPPINS_REGULAR = path.join(__dirname, '../fonts/Poppins-Regular.ttf');
const POPPINS_BOLD = path.join(__dirname, '../fonts/Poppins-Bold.ttf');
const POPPINS_MEDIUM = path.join(__dirname, '../fonts/Poppins-Medium.ttf');
const POPPINS_LIGHT = path.join(__dirname, '../fonts/Poppins-Light.ttf');

const LOGO_PATH = path.join(__dirname, '../resources/logo.png');

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
    // Usar formato antiguo de nombre de archivo
    const userId = candidateName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const filename = `analisis_cv_${userId}_${timestamp}.pdf`;
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
    
    // Verificar si las fuentes existen
    let fontsAvailable = false;
    try {
      if (await fs.pathExists(POPPINS_REGULAR) && 
          await fs.pathExists(POPPINS_BOLD) && 
          await fs.pathExists(POPPINS_MEDIUM) && 
          await fs.pathExists(POPPINS_LIGHT)) {
        
        // Registrar fuentes personalizadas si existen
        doc.registerFont('Poppins', POPPINS_REGULAR);
        doc.registerFont('Poppins-Bold', POPPINS_BOLD);
        doc.registerFont('Poppins-Medium', POPPINS_MEDIUM);
        doc.registerFont('Poppins-Light', POPPINS_LIGHT);
        fontsAvailable = true;
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
      primary: '#5170FF',    // Azul principal
      secondary: '#1F2937',  // Gris oscuro para títulos secundarios
      accent: '#4FD1C5',     // Verde agua para acentos
      bg: '#F9FAFB',         // Gris muy claro para fondos
      lightBg: '#EDF2F7',    // Gris claro para fondos secundarios
      text: '#4A5568',       // Gris para texto normal
      success: '#48BB78',    // Verde para elementos positivos
      warning: '#ED8936',    // Naranja para advertencias
      danger: '#E53E3E',     // Rojo para errores o peligros
    };
    
    // Intentar cargar el logo
    let logoPath = LOGO_PATH;
    let logoExists = await fs.pathExists(logoPath);
    
    // ========= NUEVO DISEÑO DEL PDF =========
    
    // ENCABEZADO
    // Usar la función para dibujar el encabezado en la primera página
    drawPageHeader(doc, logoPath, logoExists, colors, fontsAvailable);
    
    // TÍTULO DEL INFORME
    doc.fontSize(24)
       .fillColor(colors.primary)
       .font(fontsAvailable ? 'Poppins-Bold' : 'Helvetica-Bold')
       .text('INFORME DE REVISIÓN DE CV', 50, 60, {align: 'left'});

    // DATOS DEL CANDIDATO
    doc.fontSize(14)
       .fillColor(colors.dark)
       .font(fontsAvailable ? 'Poppins-Bold' : 'Helvetica-Bold')
       .text(`Nombre del candidato: ${candidateName}`, 50, 100);
       
    doc.fontSize(14)
       .fillColor(colors.dark)
       .font(fontsAvailable ? 'Poppins-Medium' : 'Helvetica')
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
    doc.font(fontsAvailable ? 'Poppins-Bold' : 'Helvetica-Bold')
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
    doc.font(fontsAvailable ? 'Poppins' : 'Helvetica')
       .fontSize(14);
    const puntosText = 'puntos';
    const puntosWidth = doc.widthOfString(puntosText);
    doc.fillColor('#333333')
       .text(puntosText, scoreX - (puntosWidth / 2), scoreY + 15);

    // Texto "de 100" debajo (ajustar posición)
    doc.font(fontsAvailable ? 'Poppins-Light' : 'Helvetica')
       .fontSize(12);
    const de100Text = 'de 100';
    const de100Width = doc.widthOfString(de100Text);
    doc.fillColor('#757575')
       .text(de100Text, scoreX - (de100Width / 2), scoreY + 35);
       
    // SECCIÓN 1: RESUMEN DEL CANDIDATO
    // Título de sección con fondo verde claro
    let currentY = 170;
    currentY = createSection(doc, 'SECCIÓN 1: RESUMEN DEL CANDIDATO', currentY, colors, fontsAvailable);
    
    // Texto del resumen
    const summaryText = analysis.summary || 'No se proporcionó un resumen ejecutivo en el análisis.';
    
    doc.fontSize(11)
       .font(fontsAvailable ? 'Poppins' : 'Helvetica')
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
    currentY = createSection(doc, 'SECCIÓN 2: ASPECTOS CLAVE EVALUADOS', currentY, colors, fontsAvailable);
    
    // Dibujar barra de progreso con porcentaje
    const drawProgressBar = (x, y, width, percentage, label) => {
      // Texto para el nombre de la categoría (colocado encima de la barra)
      doc.fontSize(11)
         .font(fontsAvailable ? 'Poppins-Medium' : 'Helvetica')
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
         .font(fontsAvailable ? 'Poppins-Bold' : 'Helvetica-Bold')
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
       .font(fontsAvailable ? 'Poppins-Bold' : 'Helvetica-Bold')
       .fillColor(colors.secondary)
       .text('Brechas frente al rol', 50, currentY);
       
    // Texto descriptivo sobre brechas
    let brechasText = analysis.skillsGap || 'No se identificaron brechas específicas en el perfil frente al rol.';
    
    doc.fontSize(11)
       .font(fontsAvailable ? 'Poppins' : 'Helvetica')
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
       .font(fontsAvailable ? 'Poppins-Bold' : 'Helvetica-Bold')
       .fillColor(colors.secondary)
       .text('Enfoque del CV', 50, currentY);
       
    // Texto sobre el enfoque
    let enfoqueText = analysis.alignment || 'No se proporcionó información sobre el enfoque del CV.';
    
    doc.fontSize(11)
       .font(fontsAvailable ? 'Poppins' : 'Helvetica')
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
    if (currentY > doc.page.height - 130) {
      doc.addPage();
      drawPageHeader(doc, logoPath, logoExists, colors, fontsAvailable);
      currentY = 60;
    }
    
    // SECCIÓN 3: ANÁLISIS DETALLADO POR SECCIÓN DEL CV
    // Título de la sección 3
    currentY = createSection(doc, 'SECCIÓN 3: ANÁLISIS DETALLADO POR SECCIÓN DEL CV', currentY, colors, fontsAvailable);

    // Definir las subsecciones del CV para el análisis detallado
    const subsections = [
      {
        title: 'Experiencia laboral',
        content: processBulletList(analysis.experience, 'No se proporcionó información sobre experiencia laboral en el CV.'),
        observations: await generateSpecificObservations('experience', analysis.experience, jobPosition)
      },
      {
        title: 'Formación académica',
        content: processBulletList(analysis.education, 'No se encontró información sobre formación académica en el CV.'),
        observations: await generateSpecificObservations('education', analysis.education, jobPosition)
      },
      {
        title: 'Habilidades técnicas',
        content: processBulletList(analysis.skills, 'No se mencionaron habilidades técnicas específicas en el CV.'),
        observations: await generateSpecificObservations('skills', analysis.skills, jobPosition)
      },
      {
        title: 'Habilidades blandas',
        content: processBulletList(analysis.softSkills, 'No se mencionaron habilidades blandas en el CV.'),
        observations: await generateSpecificObservations('softSkills', analysis.softSkills, jobPosition)
      },
      {
        title: 'Certificaciones',
        content: processBulletList(analysis.certifications, 'No se incluyeron certificaciones en el CV.'),
        observations: await generateSpecificObservations('certifications', analysis.certifications, jobPosition)
      },
      {
        title: 'Proyectos relevantes',
        content: processBulletList(analysis.projects, 'No se mencionaron proyectos relevantes en el CV.'),
        observations: await generateSpecificObservations('projects', analysis.projects, jobPosition)
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
         .font(fontsAvailable ? 'Poppins' : 'Helvetica')
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
          drawPageHeader(doc, logoPath, logoExists, colors, fontsAvailable);
          currentY = 60;
        }
        
        // Añadir título de la subsección con espaciado reducido
        doc.fontSize(14)
           .fillColor(colors.secondary)
           .font(fontsAvailable ? 'Poppins-Bold' : 'Helvetica-Bold')
           .text(subsection.title, 50, currentY);
        
        // Contenido actual
        doc.fontSize(11)
           .font(fontsAvailable ? 'Poppins' : 'Helvetica')
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
           .font(fontsAvailable ? 'Poppins-Medium' : 'Helvetica')
           .text('💡 Sugerencias de mejora:', 50, currentY);
        
        // Añadir observaciones y recomendaciones
        doc.fontSize(11)
           .font(fontsAvailable ? 'Poppins' : 'Helvetica')
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
      drawPageHeader(doc, logoPath, logoExists, colors, fontsAvailable);
      currentY = 60;
    }
    
    // Verificar si queda espacio suficiente para la siguiente sección
    // Calcular el espacio necesario para el título de la sección 4 + espacio para subsecciones
    const remainingHeight = doc.page.height - currentY;
    const totalSection4Height = 50; // Altura estimada para el encabezado de la sección
    
    if (remainingHeight < totalSection4Height + 100) { // Solo agregar nueva página si realmente es necesario
      doc.addPage();
      drawPageHeader(doc, logoPath, logoExists, colors, fontsAvailable);
      currentY = 60;
    } else if (remainingHeight < 250) {
      // Si queda poco espacio pero suficiente para el título, optimizamos la distribución
      // para que no quede un título seguido de mucho espacio en blanco
      currentY = doc.page.height - 240; // Posicionamos el título más abajo
    }
    
    // SECCIÓN 4: OBSERVACIONES Y OPORTUNIDADES DE MEJORA
    // Analizamos primero el contenido de la sección 4 para tomar mejores decisiones
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
    
    // Estimar altura total de todas las subsecciones
    let totalSubsectionsHeight = 0;
    for (const subsection of section4Subsections) {
      const contentHeight = doc.heightOfString(subsection.content, {
        width: doc.page.width - 100,
        align: 'left',
        lineGap: 3
      });
      // Altura de título + contenido + espaciado
      totalSubsectionsHeight += 25 + contentHeight + 30;
    }
    
    // Si el contenido total no cabe en la página actual y hay muy poco contenido en ésta,
    // mejor comenzar una página nueva para toda la sección
    if (totalSubsectionsHeight + totalSection4Height > remainingHeight && remainingHeight < doc.page.height * 0.3) {
      doc.addPage();
      drawPageHeader(doc, logoPath, logoExists, colors, fontsAvailable);
      currentY = 60;
    }
    
    // Título de la sección 4
    currentY = createSection(doc, 'SECCIÓN 4: OBSERVACIONES Y OPORTUNIDADES DE MEJORA', currentY, colors, fontsAvailable);
    
    // Añadir cada subsección de la sección 4 con mejor gestión de espacio
    let subsectionY = currentY;
    for (let i = 0; i < section4Subsections.length; i++) {
      const subsection = section4Subsections[i];
      
      // Estimar la altura del contenido incluyendo título
      const contentHeight = doc.heightOfString(subsection.content, {
        width: doc.page.width - 100,
        align: 'left',
        lineGap: 3
      });
      
      const subsectionTotalHeight = 25 + contentHeight + 20; // título + contenido + espaciado
      
      // Inteligentemente decidir si necesitamos una nueva página
      if (subsectionY + subsectionTotalHeight > doc.page.height - 40) {
        // Verificar si vale la pena agregar a esta página o comenzar la siguiente
        const remainingPageSpace = doc.page.height - subsectionY;
        if (remainingPageSpace < 100 || remainingPageSpace < subsectionTotalHeight * 0.3) {
          // Si queda muy poco espacio o menos del 30% del contenido cabe, mejor nueva página
          doc.addPage();
          drawPageHeader(doc, logoPath, logoExists, colors, fontsAvailable);
          subsectionY = 60;
        }
      }
      
      // Añadir la subsección con mejor manejo de espaciado
      const newY = addSubsection(doc, subsection.title, subsection.content, subsectionY, colors, fontsAvailable);
      
      // Calcular el espacio usado y ajustar para la siguiente subsección
      const usedSpace = newY - subsectionY;
      subsectionY = newY;
      
      // Reducir espaciado entre subsecciones si tenemos muchas
      if (i < section4Subsections.length - 1) {
        // Menos espacio entre subsecciones para aprovechar mejor la página
        subsectionY -= 10; 
      }
    }
    
    // Actualizar la posición Y global después de todas las subsecciones
    currentY = subsectionY;
    
    // SECCIÓN 5: RECOMENDACIONES ADICIONALES
    // Aplicar la misma lógica de estimación para optimizar espacio
    const section5TitleHeight = 50;
    if (currentY + section5TitleHeight > doc.page.height - 100) {
      doc.addPage();
      drawPageHeader(doc, logoPath, logoExists, colors, fontsAvailable);
      currentY = 60;
    } else if (doc.page.height - currentY < 250 && doc.page.height - currentY > 120) {
      // Optimizar el espacio restante cuando hay un espacio intermedio
      currentY += 20; // Añadir un poco más de espacio para mejorar la distribución
    }
    
    currentY = createSection(doc, 'SECCIÓN 5: RECOMENDACIONES ADICIONALES', currentY, colors, fontsAvailable);
    
    // Calcular y pre-estimar el espacio total necesario para todas las subsecciones
    const keywordsContent = processKeywordText(analysis.keyCompetencies);
    const cursosContent = processCursosText(analysis.learningRecommendations || analysis.skillsGap);
    const proximosContent = processProximosText(analysis.finalRecommendation);
    
    // Estimación de alturas
    const keywordsHeight = doc.heightOfString(keywordsContent, {
      width: doc.page.width - 100,
      align: 'left',
      lineGap: 3
    });
    
    const cursosHeight = doc.heightOfString(cursosContent, {
      width: doc.page.width - 100,
      align: 'left',
      lineGap: 3
    });
    
    const proximosHeight = doc.heightOfString(proximosContent, {
      width: doc.page.width - 100,
      align: 'left',
      lineGap: 3
    });
    
    // Estimar altura total con títulos y espaciado (ajustado)
    const totalHeight = keywordsHeight + cursosHeight + proximosHeight + 150; // 150 = espacio para títulos y espaciado
    
    // Si todo el contenido de la sección 5 no cabe en la página actual, mejor comenzar una nueva
    if (currentY + totalHeight > doc.page.height - 40) {
      // Pero solo si tenemos suficiente contenido para justificar una nueva página
      if (totalHeight > doc.page.height * 0.4) {
        doc.addPage();
        drawPageHeader(doc, logoPath, logoExists, colors, fontsAvailable);
        currentY = 60;
      }
    }
    
    // Subsección: Palabras clave para aplicar a otras ofertas
    currentY = addSubsection(doc, 'Palabras clave para filtros ATS', keywordsContent, currentY, colors, fontsAvailable);
    
    // Verificar si hay espacio suficiente para las siguientes subsecciones
    if (currentY + cursosHeight + 40 > doc.page.height - 40) {
      // Si no hay suficiente espacio para la siguiente subsección, nueva página
      doc.addPage();
      drawPageHeader(doc, logoPath, logoExists, colors, fontsAvailable);
      currentY = 60;
    }
    
    // Subsección: Cursos recomendados
    currentY = addSubsection(doc, 'Cursos y certificaciones recomendados', cursosContent, currentY, colors, fontsAvailable);
    
    // Verificar si hay espacio suficiente para la última subsección
    if (currentY + proximosHeight + 40 > doc.page.height - 40) {
      // Si no hay suficiente espacio para la siguiente subsección, nueva página
      doc.addPage();
      drawPageHeader(doc, logoPath, logoExists, colors, fontsAvailable);
      currentY = 60;
    }
    
    // Subsección: Próximos pasos
    currentY = addSubsection(doc, 'Próximos pasos', proximosContent, currentY, colors, fontsAvailable);
    
    // Añadir pie de página con agradecimiento y datos de contacto
    if (currentY > doc.page.height - 120) {
      doc.addPage();
      drawPageHeader(doc, logoPath, logoExists, colors, fontsAvailable);
      currentY = 60;
    } else if (doc.page.height - currentY > 180) {
      // Si queda mucho espacio vacío al final, ajustar la posición del agradecimiento
      // para reducir el espacio vacío
      currentY = doc.page.height - 180;
    }
    
    // Añadir agradecimiento final
    doc.fontSize(12)
       .font(fontsAvailable ? 'Poppins-Medium' : 'Helvetica-Bold')
       .fillColor(colors.primary)
       .text('Gracias por utilizar los servicios de MyWorkIn', 50, currentY, {
         width: doc.page.width - 100,
         align: 'center'
       });
    
    // Datos de contacto
    doc.fontSize(10)
       .font(fontsAvailable ? 'Poppins-Light' : 'Helvetica')
       .fillColor(colors.tertiary)
       .text('Para más información, visítanos en myworkin2.com o contáctanos en info@myworkin2.com', 50, currentY + 25, {
         width: doc.page.width - 100,
         align: 'center'
       });
    
    // Finalizar documento sin restricciones de número de páginas
    doc.end();
    
    // Esperar a que se complete la escritura del archivo
    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        logger.info(`PDF generado correctamente: ${outputPath}`);
        
        // Subir el PDF al servidor
        uploadPdfToServer(outputPath, filename)
          .then(publicUrl => {
            logger.info(`PDF subido a: ${publicUrl}`);
            // Devolver información sobre el PDF generado
            resolve({
              filePath: outputPath,
              publicUrl,
              filename
            });
          })
          .catch(ftpError => {
            logger.error(`Error al subir PDF: ${ftpError.message}`);
            // Continuar sin subir al servidor, solo se devuelve la ruta local
            resolve({
              filePath: outputPath,
              publicUrl: `/pdfs/${filename}`,
              filename
            });
          });
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
const drawPageHeader = (doc, logoPath, logoExists, colors, fontsAvailable) => {
  // Se elimina la barra superior azul
  
  // Intentar cargar el logo
  if (logoExists) {
    try {
      doc.image(logoPath, 40, 5, { width: 120 });
    } catch (logoErr) {
      logger.error(`Error al cargar el logo: ${logoErr.message}`);
      // Si falla, mostrar texto como fallback
      doc.fontSize(18).font(fontsAvailable ? 'Poppins-Bold' : 'Helvetica-Bold').fillColor(colors.primary).text('MyWorkIn', 40, 12);
    }
  } else {
    // Si no existe el logo, mostrar el texto
    doc.fontSize(18).font(fontsAvailable ? 'Poppins-Bold' : 'Helvetica-Bold').fillColor(colors.primary).text('MyWorkIn', 40, 12);
  }
  
  doc.fontSize(12).font(fontsAvailable ? 'Poppins' : 'Helvetica').fillColor(colors.primary).text('myworkin2.com', doc.page.width - 180, 14);
};

// Función para crear una nueva sección con título
const createSection = (doc, title, y, colors, fontsAvailable) => {
  doc.rect(50, y, doc.page.width - 100, 30)
     .fillColor(colors.lightBg)
     .fill();
     
  doc.fontSize(16)
     .fillColor(colors.primary)
     .font(fontsAvailable ? 'Poppins-Bold' : 'Helvetica-Bold')
     .text(title, 60, y + 7);
  
  return y + 45; // Reducir el espacio después del título de sección (era 50)
};

// Función para añadir una subsección
const addSubsection = (doc, title, content, y, colors, fontsAvailable) => {
  // Estimar la altura del contenido antes de añadirlo
  const contentHeight = doc.heightOfString(content, {
    width: doc.page.width - 100,
    align: 'left',
    lineGap: 3
  });
  
  // Si el contenido es muy pequeño (menos de 50 unidades de altura), reducir el espaciado
  const isSmallContent = contentHeight < 50;
  
  // Título de la subsección
  doc.fontSize(14)
     .fillColor(colors.secondary)
     .font(fontsAvailable ? 'Poppins-Bold' : 'Helvetica-Bold')
     .text(title, 50, y);
  
  // Contenido
  doc.fontSize(11)
     .font(fontsAvailable ? 'Poppins' : 'Helvetica')
     .fillColor(colors.text)
     .text(content, 50, y + 25, {
       width: doc.page.width - 100,
       align: 'left',
       lineGap: 3
     });
  
  // Ajustar el espaciado dependiendo del tamaño del contenido
  const spacing = isSmallContent ? 20 : 30;
  
  // Retornar la posición Y después del contenido con espaciado ajustado
  return y + 25 + contentHeight + spacing;
};

// Función para generar observaciones específicas según el tipo de sección y el contenido real
const generateSpecificObservations = async (sectionType, selectedLines, jobTitle) => {
  // Asegurarse de que selectedLines sea siempre un array
  if (!selectedLines) {
    selectedLines = [];
  } else if (typeof selectedLines === 'string') {
    // Si es un string, dividir por saltos de línea para crear un array
    selectedLines = selectedLines.split('\n').filter(line => line.trim() !== '');
  } else if (!Array.isArray(selectedLines)) {
    // Si no es un array ni string, convertir a array vacío
    selectedLines = [];
  }
  
  // Validar el job title
  if (!jobTitle || jobTitle === 'No especificado' || jobTitle === 'undefined') {
    logger.warn(`Job title no especificado o inválido: "${jobTitle}". Usando valor por defecto.`);
    jobTitle = 'Profesional';
  }
  
  // Log para depuración
  logger.info(`Generando observaciones para sección ${sectionType}. Job title: "${jobTitle}". Líneas recibidas: ${selectedLines.length}`);
  
  // Si no hay líneas seleccionadas, retornar mensaje genérico
  if (selectedLines.length === 0) {
    logger.warn(`No hay líneas para ${sectionType}. Retornando mensaje genérico.`);
    return "No hay suficiente información para generar sugerencias personalizadas.";
  }
  
  // Importar utilidades de OpenAI
  const openaiUtil = require('./openaiUtil');
  
  // Hasta 3 líneas para no exceder límites de procesamiento/tokens
  const linesToProcess = selectedLines.slice(0, 3);
  let specificObservations = [];
  
  try {
    // Definir prompts específicos según el tipo de sección
    const systemPromptBase = `
      Eres un especialista senior en Recursos Humanos con más de 15 años de experiencia en selección de personal.
      Tu experiencia te permite identificar inmediatamente las fortalezas y debilidades en un CV.
      
      Tu tarea es generar sugerencias extremadamente específicas, profesionales y personalizadas para mejorar cada sección del CV.
      
      Tus sugerencias deben:
      - Estar basadas en el contenido real proporcionado, no en generalidades
      - Ser altamente específicas y accionables (el candidato debe saber exactamente qué cambiar)
      - Sonar como si vinieran de un consultor experto en RRHH que ha revisado cientos de CVs
      - Incluir ejemplos concretos adaptados al sector específico
      - Reflejar las mejores prácticas actuales en redacción de CVs
      - Adaptarse al nivel de experiencia del candidato
      - Tener un tono profesional, directo pero constructivo
      
      IMPORTANTE: Nunca uses plantillas genéricas. Cada respuesta debe ser única y personalizada.
    `;
    
    // Crear prompts específicos para cada tipo de sección
    const sectionPrompts = {
      experience: `
        ${systemPromptBase}
        
        CONTEXTO ESPECÍFICO - EXPERIENCIA LABORAL:
        Actúas como Director/a de Talent Acquisition con más de 15 años evaluando currículums para puestos directivos.
        
        Para esta sección de experiencia laboral, céntrate EXCLUSIVAMENTE en:
        1. Uso estratégico de verbos de alto impacto (ej: "lideré" en lugar de "fui responsable de")
        2. Inclusión de métricas concretas (%, cifras, KPIs)
        3. Demostración de resultados tangibles, no solo responsabilidades
        4. Relevancia específica para el puesto objetivo
        
        Las sugerencias deben ser CONCISAS (1-2 líneas), DIRECTAS y ALTAMENTE ESPECÍFICAS.
        Cada sugerencia debe abordar UN solo aspecto a mejorar.
        
        EVITA ESTRICTAMENTE:
        - Proponer añadir proyectos (pertenecen a otra sección)
        - Lenguaje genérico que podría aplicar a cualquier CV
        - Verbosidad o explicaciones innecesarias
        - Repetición de conceptos
      `,
      
      education: `
        ${systemPromptBase}
        
        CONTEXTO ESPECÍFICO - FORMACIÓN ACADÉMICA:
        Actúas como Director/a de Selección Senior especializado en evaluar credenciales académicas.
        
        Para esta sección de formación académica, céntrate EXCLUSIVAMENTE en:
        1. Destacar logros académicos (promedio destacado, honores, becas)
        2. Relevancia directa de la formación para el puesto
        3. Estructura y presentación adecuada (fechas, títulos, institución)
        4. Orden cronológico inverso (lo más reciente primero)
        
        Las sugerencias deben ser CONCISAS (1-2 líneas), DIRECTAS y ALTAMENTE ESPECÍFICAS.
        Cada sugerencia debe abordar UN solo aspecto a mejorar.
        
        EVITA ESTRICTAMENTE:
        - Proponer añadir proyectos o actividades extracurriculares (pertenecen a otra sección)
        - Lenguaje genérico que podría aplicar a cualquier CV
        - Verbosidad o explicaciones innecesarias
        - Sugerir elementos que no corresponden a formación académica formal
      `,
      
      skills: `
        ${systemPromptBase}
        
        CONTEXTO ESPECÍFICO - HABILIDADES TÉCNICAS:
        Actúas como Senior Technical Recruiter especializado en evaluar competencias técnicas.
        
        Para esta sección de habilidades técnicas, céntrate EXCLUSIVAMENTE en:
        1. Nivel de dominio (básico, intermedio, avanzado, experto)
        2. Especificidad (versiones, herramientas concretas)
        3. Organización por relevancia para el puesto
        4. Eliminación de habilidades obsoletas o irrelevantes
        
        Las sugerencias deben ser CONCISAS (1-2 líneas), DIRECTAS y ALTAMENTE ESPECÍFICAS.
        Cada sugerencia debe abordar UN solo aspecto a mejorar.
        
        EVITA ESTRICTAMENTE:
        - Lenguaje genérico que podría aplicar a cualquier CV
        - Verbosidad o explicaciones innecesarias
        - Repetición de conceptos
        - Sugerir añadir ejemplos de uso (corresponden a experiencia laboral)
      `,
      
      softSkills: `
        ${systemPromptBase}
        
        CONTEXTO ESPECÍFICO - HABILIDADES BLANDAS:
        Actúas como Director/a de Desarrollo de Talento especializado en competencias interpersonales.
        
        Para esta sección de habilidades blandas, céntrate EXCLUSIVAMENTE en:
        1. Relevancia para el puesto objetivo
        2. Presentación estratégica (priorizar las más valoradas)
        3. Alineación con la cultura organizacional del sector
        4. Eliminación de habilidades genéricas poco diferenciadas
        
        Las sugerencias deben ser CONCISAS (1-2 líneas), DIRECTAS y ALTAMENTE ESPECÍFICAS.
        Cada sugerencia debe abordar UN solo aspecto a mejorar.
        
        EVITA ESTRICTAMENTE:
        - Proponer añadir ejemplos detallados (corresponden a experiencia laboral)
        - Lenguaje genérico que podría aplicar a cualquier CV
        - Verbosidad o explicaciones innecesarias
        - Repetición de conceptos
      `,
      
      certifications: `
        ${systemPromptBase}
        
        CONTEXTO ESPECÍFICO - CERTIFICACIONES:
        Actúas como Talent Acquisition Manager especializado en validación de credenciales profesionales.
        
        Para esta sección de certificaciones, céntrate EXCLUSIVAMENTE en:
        1. Inclusión de fechas de obtención y validez
        2. Institución emisora (autoridad certificadora)
        3. Relevancia y vigencia para el puesto
        4. Estructura y organización visual
        
        Las sugerencias deben ser CONCISAS (1-2 líneas), DIRECTAS y ALTAMENTE ESPECÍFICAS.
        Cada sugerencia debe abordar UN solo aspecto a mejorar.
        
        EVITA ESTRICTAMENTE:
        - Proponer añadir aplicaciones prácticas (corresponden a experiencia laboral)
        - Lenguaje genérico que podría aplicar a cualquier CV
        - Verbosidad o explicaciones innecesarias
        - Repetición de conceptos
      `,
      
      projects: `
        ${systemPromptBase}
        
        CONTEXTO ESPECÍFICO - PROYECTOS RELEVANTES:
        Actúas como Senior Project Management Recruiter especializado en evaluación de portfolios.
        
        Para esta sección de proyectos, céntrate EXCLUSIVAMENTE en:
        1. Rol específico y responsabilidades concretas
        2. Tecnologías/metodologías utilizadas
        3. Resultados medibles y logros específicos
        4. Relevancia directa para el puesto objetivo
        
        Las sugerencias deben ser CONCISAS (1-2 líneas), DIRECTAS y ALTAMENTE ESPECÍFICAS.
        Cada sugerencia debe abordar UN solo aspecto a mejorar.
        
        EVITA ESTRICTAMENTE:
        - Lenguaje genérico que podría aplicar a cualquier CV
        - Verbosidad o explicaciones innecesarias
        - Repetición de conceptos
        - Sugerir elementos que no corresponden a la descripción de proyectos
      `
    };
    
    // Seleccionar el prompt adecuado según el tipo de sección
    const systemPrompt = sectionPrompts[sectionType] || systemPromptBase;
    
    // Registrar información detallada para debug
    logger.info(`Procesando ${linesToProcess.length} líneas para ${sectionType}. Puesto: ${jobTitle}`);
    
    // Procesar cada línea con OpenAI
    specificObservations = await Promise.all(linesToProcess.map(async (line, index) => {
      try {
        logger.info(`Generando sugerencia personalizada #${index + 1} para ${sectionType}: "${line.substring(0, 50)}..."`);
        
        const userPrompt = `
          Analiza este elemento de un CV para un puesto de ${jobTitle}:
          
          "${line}"
          
          Como Director/a de Recursos Humanos con amplia experiencia, brinda UNA sugerencia de mejora ultra específica y accionable.
          
          REQUISITOS:
          - Máximo 2 líneas
          - Extremadamente específica para este elemento particular
          - Directo al punto sin explicaciones innecesarias
          - Tono profesional y ejecutivo
          - Enfocada en UN solo aspecto a mejorar
          
          IMPORTANTE: No incluyas ningún bullet point o viñeta en tu respuesta, solo texto plano.
          NO uses frases introductorias como "te recomendaría" o "sería conveniente".
        `;
        
        // Llamar a OpenAI para generar la sugerencia personalizada
        const suggestion = await openaiUtil.generateImprovedText(userPrompt, {
          model: "gpt-4o",
          temperature: 0.7,
          max_tokens: 250,
          systemMessage: systemPrompt
        });
        
        logger.info(`Sugerencia generada para ${sectionType} #${index + 1}: "${suggestion.substring(0, 50)}..."`);
        
        // Formatear la sugerencia como bullet point
        return `• ${suggestion.trim()}`;
      } catch (error) {
        logger.error(`Error al generar sugerencia con OpenAI para ${sectionType}: ${error.message}`);
        
        // Sugerencias de respaldo según el tipo de sección
        const fallbackSuggestions = {
          experience: `• Para fortalecer esta experiencia, incorpore métricas específicas de impacto y utilice verbos de acción más contundentes al inicio de cada logro. Un profesional de ${jobTitle} debe demostrar resultados cuantificables.`,
          education: `• Complemente esta formación académica con cursos específicos relevantes para ${jobTitle} y destaque logros como reconocimientos o proyectos destacados que demuestren competencias transferibles.`,
          skills: `• Especifique su nivel de competencia, versiones utilizadas y contextos de aplicación práctica de esta habilidad. Para ${jobTitle}, es crucial demostrar profundidad de conocimiento técnico.`,
          softSkills: `• Refuerce esta habilidad con un ejemplo concreto de aplicación en un entorno profesional, idealmente usando el formato STAR y conectándola directamente con los requisitos de ${jobTitle}.`,
          certifications: `• Incluya año de obtención, período de validez y relevancia práctica de esta certificación para el puesto de ${jobTitle}. Detalle cómo aplica estos conocimientos.`,
          projects: `• Detalle su rol específico, tecnologías utilizadas y resultados cuantificables obtenidos en este proyecto. Conecte explícitamente con las responsabilidades de ${jobTitle}.`
        };
        
        return fallbackSuggestions[sectionType] || `• Para mejorar esta sección, proporcione información más específica y relevante para el puesto de ${jobTitle}.`;
      }
    }));
    
    logger.info(`Generadas ${specificObservations.length} sugerencias personalizadas para ${sectionType}`);
  } catch (error) {
    logger.error(`Error general al generar sugerencias con OpenAI: ${error.message}`);
    
    // Generar sugerencias genéricas de respaldo
    specificObservations = linesToProcess.map(line => 
      `• Para optimizar este elemento del CV, añada información más específica, cuantificable y relevante para el puesto de ${jobTitle}. Los reclutadores buscan evidencia concreta de competencias aplicables.`
    );
  }
  
  // Limitar a 3 observaciones máximo y unirlas con saltos de línea
  return specificObservations.slice(0, 3).join('\n\n');
};

// Funciones de utilidad para procesamiento de texto
/**
 * Procesa una lista con viñetas
 * @param {Array|String} items - Array de elementos o string con líneas separadas por \n
 * @param {String} defaultText - Texto por defecto si no hay elementos
 * @returns {String} Lista formateada con viñetas
 */
function processBulletList(items, defaultText) {
  if (!items) {
    return defaultText;
  }
  
  // Si es un string, dividirlo en líneas
  if (typeof items === 'string') {
    items = items.split('\n').filter(line => line.trim() !== '');
  }
  
  // Si no es un array o está vacío, usar texto por defecto
  if (!Array.isArray(items) || items.length === 0) {
    return defaultText;
  }
  
  // Función para limpiar marcadores markdown ** y *
  const cleanMarkdownFormatting = (text) => {
    return text.replace(/\*\*/g, '').replace(/\*/g, '');
  };
  
  // Formatear lista con viñetas
  let content = '';
  for (const item of items) {
    content += `• ${cleanMarkdownFormatting(item)}\n`;
  }
  
  return content.trim();
}

/**
 * Procesa una lista numerada
 * @param {Array|String} items - Array de elementos o string con líneas separadas por \n
 * @param {String} defaultText - Texto por defecto si no hay elementos
 * @returns {String} Lista formateada con números
 */
function processNumberedList(items, defaultText) {
  if (!items) {
    return defaultText;
  }
  
  // Si es un string, dividirlo en líneas
  if (typeof items === 'string') {
    items = items.split('\n').filter(line => line.trim() !== '');
  }
  
  // Si no es un array o está vacío, usar texto por defecto
  if (!Array.isArray(items) || items.length === 0) {
    return defaultText;
  }
  
  // Función para limpiar marcadores markdown ** y *
  const cleanMarkdownFormatting = (text) => {
    return text.replace(/\*\*/g, '').replace(/\*/g, '');
  };
  
  // Formatear lista numerada
  let content = '';
  for (let i = 0; i < items.length; i++) {
    content += `${i+1}. ${cleanMarkdownFormatting(items[i])}\n`;
  }
  
  return content.trim();
}

// Función simple para simular subida FTP (solo guarda localmente)
async function uploadPdfToServer(filePath, fileName) {
  try {
    // Asegurar que la URL pública tiene el formato correcto
    const baseUrl = process.env.PDF_PUBLIC_URL || 'https://myworkinpe.lat/pdfs/';
    // Asegurar que la URL base termina con /
    const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    // Construir la URL completa
    const publicUrl = `${normalizedBaseUrl}${fileName}`;
    logger.info(`URL pública generada para el PDF: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    logger.error(`Error al generar URL para PDF: ${error.message}`);
    return null;
  }
}

module.exports = {
  generateCVAnalysisPDF,
  drawPageHeader
}; 