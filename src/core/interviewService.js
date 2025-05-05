const openaiUtil = require('../utils/openaiUtil');
const logger = require('../utils/logger');

/**
 * Generate an interview question based on job type
 * @param {string} type - Type of job (e.g., 'software', 'marketing', 'sales')
 * @returns {Promise<Object>} Question object
 */
const generateInterviewQuestion = async (type) => {
  try {
    // Normalizar el tipo de trabajo para coincidir con categorías predefinidas
    const normalizedType = normalizeJobType(type);
    logger.info(`Generating interview question for job type: ${normalizedType} (original: ${type})`);
    
    // Check if openaiUtil has the generateInterviewQuestion function
    if (typeof openaiUtil.generateInterviewQuestion === 'function') {
      // Incluir el tipo original y el normalizado para un contexto más rico
      const question = await openaiUtil.generateInterviewQuestion(normalizedType, type);
      return {
        question,
        type: normalizedType,
        originalType: type,
        timestamp: new Date(),
      };
    } else {
      // Fallback to default question if the function doesn't exist
      logger.warn(`openaiUtil.generateInterviewQuestion not available, using default question for ${normalizedType}`);
      return getDefaultQuestion(normalizedType, type);
    }
  } catch (error) {
    logger.error(`Error generating interview question: ${error.message}`);
    // Fallback to default question on error
    logger.info(`Falling back to default question for ${type}`);
    return getDefaultQuestion(normalizeJobType(type), type);
  }
};

/**
 * Normalize job type to a standard category
 * @param {string} jobType - Original job type string from user
 * @returns {string} Normalized job type
 */
const normalizeJobType = (jobType) => {
  if (!jobType) return 'general';
  
  const jobTypeLower = jobType.toLowerCase();
  
  // Tech Lead - mantener pero no dar trato especial
  if ((jobTypeLower.includes('tech') && jobTypeLower.includes('lead')) ||
      (jobTypeLower.includes('líder') && jobTypeLower.includes('técnico'))) {
    return 'tech lead';
  }
  
  // Software/Development roles
  if (jobTypeLower.includes('software') || 
      jobTypeLower.includes('desarrollador') || 
      jobTypeLower.includes('programador') || 
      jobTypeLower.includes('ingeniero') || 
      jobTypeLower.includes('developer') || 
      jobTypeLower.includes('código') || 
      jobTypeLower.includes('fullstack') || 
      jobTypeLower.includes('back') || 
      jobTypeLower.includes('front') || 
      jobTypeLower.includes('web')) {
    return 'software';
  }
  
  // Marketing roles
  if (jobTypeLower.includes('marketing') || 
      jobTypeLower.includes('digital') || 
      jobTypeLower.includes('contenido') || 
      jobTypeLower.includes('redes') || 
      jobTypeLower.includes('community') || 
      jobTypeLower.includes('seo') || 
      jobTypeLower.includes('sem') || 
      jobTypeLower.includes('publicidad')) {
    return 'marketing';
  }
  
  // Design roles
  if (jobTypeLower.includes('diseño') || 
      jobTypeLower.includes('design') || 
      jobTypeLower.includes('ux') || 
      jobTypeLower.includes('ui') || 
      jobTypeLower.includes('gráfico') || 
      jobTypeLower.includes('creative') || 
      jobTypeLower.includes('artista')) {
    return 'design';
  }
  
  // Sales roles
  if (jobTypeLower.includes('ventas') || 
      jobTypeLower.includes('sales') || 
      jobTypeLower.includes('comercial') || 
      jobTypeLower.includes('account') || 
      jobTypeLower.includes('business') ||
      jobTypeLower.includes('cliente')) {
    return 'sales';
  }
  
  // Project/Product Management roles
  if (jobTypeLower.includes('project') || 
      jobTypeLower.includes('producto') || 
      jobTypeLower.includes('product') || 
      jobTypeLower.includes('manager') || 
      jobTypeLower.includes('pm') || 
      jobTypeLower.includes('agile') || 
      jobTypeLower.includes('scrum')) {
    return 'pm';
  }
  
  // HR roles
  if (jobTypeLower.includes('rh') || 
      jobTypeLower.includes('recursos') || 
      jobTypeLower.includes('hr') || 
      jobTypeLower.includes('human') || 
      jobTypeLower.includes('talento') || 
      jobTypeLower.includes('talent')) {
    return 'hr';
  }
  
  // Data roles
  if (jobTypeLower.includes('data') || 
      jobTypeLower.includes('datos') || 
      jobTypeLower.includes('analista') || 
      jobTypeLower.includes('analyst') || 
      jobTypeLower.includes('business intelligence') || 
      jobTypeLower.includes('bi') || 
      jobTypeLower.includes('machine learning') ||
      jobTypeLower.includes('ml') ||
      jobTypeLower.includes('ai') ||
      jobTypeLower.includes('ia')) {
    return 'data';
  }
  
  // Finance roles
  if (jobTypeLower.includes('finanza') || 
      jobTypeLower.includes('finance') || 
      jobTypeLower.includes('contable') || 
      jobTypeLower.includes('contador') || 
      jobTypeLower.includes('accounting') || 
      jobTypeLower.includes('tesorería')) {
    return 'finance';
  }
  
  // Administrative roles (NEW)
  if (jobTypeLower.includes('admin') || 
      jobTypeLower.includes('asistente') || 
      jobTypeLower.includes('assistant') || 
      jobTypeLower.includes('secretaria') || 
      jobTypeLower.includes('secretario') || 
      jobTypeLower.includes('oficina') || 
      jobTypeLower.includes('office')) {
    return 'administrative';
  }
  
  // Customer service roles (NEW)
  if (jobTypeLower.includes('atención al cliente') || 
      jobTypeLower.includes('servicio al cliente') || 
      jobTypeLower.includes('customer service') || 
      jobTypeLower.includes('support') || 
      jobTypeLower.includes('soporte') || 
      jobTypeLower.includes('help desk')) {
    return 'customer_service';
  }
  
  // Hospitality/Tourism roles (NEW)
  if (jobTypeLower.includes('hotel') || 
      jobTypeLower.includes('turismo') || 
      jobTypeLower.includes('tourism') || 
      jobTypeLower.includes('hostelería') || 
      jobTypeLower.includes('restaurante') || 
      jobTypeLower.includes('camarero') || 
      jobTypeLower.includes('chef') || 
      jobTypeLower.includes('cocina')) {
    return 'hospitality';
  }
  
  // Healthcare roles (NEW)
  if (jobTypeLower.includes('salud') || 
      jobTypeLower.includes('health') || 
      jobTypeLower.includes('médico') || 
      jobTypeLower.includes('doctor') || 
      jobTypeLower.includes('enfermero') || 
      jobTypeLower.includes('nurse') || 
      jobTypeLower.includes('hospital') || 
      jobTypeLower.includes('clínica')) {
    return 'healthcare';
  }
  
  // Education roles (NEW)
  if (jobTypeLower.includes('educación') || 
      jobTypeLower.includes('education') || 
      jobTypeLower.includes('profesor') || 
      jobTypeLower.includes('teacher') || 
      jobTypeLower.includes('docente') || 
      jobTypeLower.includes('escuela') || 
      jobTypeLower.includes('colegio') || 
      jobTypeLower.includes('universidad')) {
    return 'education';
  }
  
  // Banking/Financial services (NEW)
  if (jobTypeLower.includes('banco') || 
      jobTypeLower.includes('bank') || 
      jobTypeLower.includes('financiero') || 
      jobTypeLower.includes('inversión') || 
      jobTypeLower.includes('investment') || 
      jobTypeLower.includes('crédito') || 
      jobTypeLower.includes('banca')) {
    return 'banking';
  }
  
  // Retail roles (NEW)
  if (jobTypeLower.includes('retail') || 
      jobTypeLower.includes('tienda') || 
      jobTypeLower.includes('store') || 
      jobTypeLower.includes('vendedor') || 
      jobTypeLower.includes('cajero') || 
      jobTypeLower.includes('cashier') || 
      jobTypeLower.includes('dependiente')) {
    return 'retail';
  }
  
  // Si no coincide con ninguna de las categorías anteriores, devolver el puesto original
  // para poder generar preguntas más específicas a ese puesto, o 'general' si es muy genérico
  if (jobTypeLower.length > 10) {
    // Si es un puesto específico pero no encaja en las categorías, mantener el original
    return jobTypeLower;
  }
  
  // Puesto genérico o no específico
  return 'general';
};

/**
 * Analyze video response and provide feedback
 * @param {Buffer} videoBuffer - Video buffer
 * @param {string} question - Original question
 * @returns {Promise<Object>} Analysis results
 */
const analyzeVideoResponse = async (videoBuffer, question) => {
  try {
    // This will be implemented later with video analysis
    return {
      score: 0,
      feedback: 'Video analysis not implemented yet',
      timestamp: new Date(),
    };
  } catch (error) {
    logger.error(`Error analyzing video response: ${error.message}`);
    throw error;
  }
};

/**
 * Get default interview question based on job type
 * @param {string} jobType - Type of job
 * @returns {Object} Question data
 */
const getDefaultQuestion = (jobType) => {
  // Lista de preguntas predefinidas por tipo de trabajo
  const questions = {
    "tech lead": [
      "¿Cómo organizarías un equipo técnico para mantener un equilibrio entre entregar nuevas funcionalidades y asegurar la calidad del código?",
      "¿Qué estrategias utilizarías para ayudar a miembros de un equipo a mejorar sus habilidades técnicas mientras trabajan en un proyecto?",
      "Si tuvieras que liderar la adopción de una nueva tecnología en un equipo, ¿cómo enfocarías ese proceso para minimizar interrupciones?",
      "¿Cómo abordarías una situación donde hay desacuerdos técnicos entre miembros de un equipo sobre la mejor solución a implementar?",
      "¿Qué aspectos consideras más importantes al planificar un proyecto técnico y cómo los priorizarías?",
      "¿Cómo equilibrarías las necesidades técnicas a largo plazo con las demandas comerciales a corto plazo?"
    ],
    "software": [
      "Háblame de un proyecto de programación en el que hayas trabajado o te gustaría trabajar. ¿Qué tecnologías utilizarías y por qué?",
      "¿Cómo enfrentas los problemas cuando tu código no funciona como esperabas?",
      "¿Cómo te organizas cuando trabajas en proyectos que tienen requisitos cambiantes o poco claros?",
      "¿Qué estrategias utilizas para aprender nuevas tecnologías o lenguajes de programación?",
      "Si tuvieras que elegir entre entregar un proyecto a tiempo con código que necesita mejoras o entregar tarde con código de mejor calidad, ¿qué considerarías para tomar esa decisión?"
    ],
    "default": [
      "¿Qué te interesa de este puesto y cómo crees que tus habilidades o estudios se alinean con él?",
      "Háblame de algún proyecto o actividad en la que hayas enfrentado un desafío y cómo lo manejaste.",
      "¿Cuáles consideras que son tus principales fortalezas y áreas de mejora profesionales?",
      "¿Cómo te organizas cuando tienes múltiples responsabilidades o tareas con plazos ajustados?",
      "¿Qué te motiva profesionalmente y cuáles son tus objetivos a corto y mediano plazo?"
    ],
    "administrative": [
      "¿Qué herramientas o métodos utilizarías para organizar y priorizar tareas administrativas?",
      "¿Cómo manejarías situaciones donde debes coordinar múltiples calendarios o agendas?",
      "¿Qué estrategias utilizarías para mantener información confidencial segura?",
      "¿Cómo te organizas cuando tienes que gestionar múltiples solicitudes simultáneas?",
      "Describe cómo establecerías un sistema de archivo efectivo para documentos importantes."
    ],
    "customer_service": [
      "¿Cómo manejarías a un cliente que está molesto por un problema con el servicio?",
      "¿Qué estrategias utilizarías para resolver eficientemente las consultas de los clientes?",
      "¿Cómo te asegurarías de entender completamente la necesidad de un cliente?",
      "Describe cómo manejarías una situación donde no puedes cumplir con la solicitud de un cliente.",
      "¿Qué consideras más importante al momento de brindar una buena experiencia de servicio?"
    ],
    "hospitality": [
      "¿Cómo manejarías una situación donde un huésped/cliente no está satisfecho con el servicio?",
      "¿Qué estrategias utilizarías para crear una experiencia memorable para los clientes?",
      "¿Cómo te organizarías durante periodos de alta demanda o temporada alta?",
      "Describe cómo manejarías un conflicto entre compañeros de trabajo en un entorno de servicio.",
      "¿Qué consideras importante para mantener altos estándares de calidad en el servicio?"
    ],
    "healthcare": [
      "¿Cómo manejarías situaciones donde debes priorizar la atención entre varios pacientes?",
      "¿Qué estrategias utilizarías para comunicarte efectivamente con pacientes o familiares?",
      "¿Cómo te mantendrías actualizado sobre nuevos procedimientos o información médica?",
      "Describe cómo manejarías una situación donde un paciente está angustiado o nervioso.",
      "¿Qué medidas tomarías para asegurar la confidencialidad de la información de los pacientes?"
    ],
    "education": [
      "¿Qué métodos utilizarías para motivar a estudiantes con diferentes niveles de interés?",
      "¿Cómo adaptarías tu enseñanza para acomodar diferentes estilos de aprendizaje?",
      "Describe cómo manejarías una situación de conflicto entre estudiantes.",
      "¿Qué estrategias implementarías para evaluar el progreso de los estudiantes?",
      "¿Cómo colaborarías con otros profesores o personal educativo para mejorar el aprendizaje?"
    ],
    "banking": [
      "¿Cómo explicarías un producto financiero complejo a un cliente sin conocimientos técnicos?",
      "¿Qué estrategias utilizarías para construir relaciones de confianza con los clientes?",
      "¿Cómo manejarías situaciones donde debes equilibrar las necesidades del cliente con las políticas del banco?",
      "Describe cómo organizarías tu tiempo para cumplir con metas de servicio y ventas.",
      "¿Qué medidas tomarías para garantizar la precisión en transacciones financieras?"
    ],
    "retail": [
      "¿Cómo abordarías a un cliente que entra a la tienda para ofrecerle ayuda?",
      "¿Qué estrategias utilizarías para resolver una queja sobre un producto?",
      "Describe cómo manejarías una situación donde hay varios clientes esperando ser atendidos.",
      "¿Cómo te mantendrías informado sobre los productos o promociones de la tienda?",
      "¿Qué harías para crear una experiencia de compra positiva para los clientes?"
    ],
    "marketing": [
      "¿Cómo desarrollarías una estrategia para promocionar un nuevo producto o servicio?",
      "¿Qué métodos utilizarías para entender mejor las necesidades de una audiencia objetivo?",
      "Describe cómo medirías el éxito de una campaña de marketing.",
      "¿Cómo adaptarías un mensaje de marketing para diferentes canales o plataformas?",
      "¿Qué estrategias creativas utilizarías con un presupuesto limitado?"
    ],
    "design": [
      "¿Cómo enfocas el proceso de diseño cuando recibes un nuevo proyecto o brief?",
      "¿Qué estrategias utilizas para recibir e incorporar feedback sobre tu trabajo?",
      "Describe cómo manejarías un proyecto con requisitos ambiguos o cambiantes.",
      "¿Cómo equilibras la creatividad con las necesidades prácticas o técnicas de un proyecto?",
      "¿Qué métodos utilizas para mantenerte al día con tendencias y herramientas de diseño?"
    ],
    "sales": [
      "¿Cómo te acercarías a un potencial cliente para presentar un producto o servicio?",
      "Describe cómo manejarías objeciones comunes durante un proceso de venta.",
      "¿Qué estrategias utilizarías para construir relaciones duraderas con los clientes?",
      "¿Cómo organizarías tu tiempo para alcanzar tus objetivos de ventas?",
      "¿Qué información consideras importante conocer antes de una reunión con un cliente?"
    ],
    "pm": [
      "¿Cómo priorizarías tareas en un proyecto con recursos limitados?",
      "Describe cómo manejarías cambios en el alcance de un proyecto en marcha.",
      "¿Qué estrategias utilizarías para mantener a un equipo motivado durante un proyecto desafiante?",
      "¿Cómo te asegurarías de que un proyecto cumple con sus plazos y objetivos?",
      "Describe cómo manejarías conflictos entre miembros del equipo o stakeholders."
    ],
    "hr": [
      "¿Qué estrategias utilizarías para atraer talento a la organización?",
      "Describe cómo manejarías una situación de conflicto entre empleados.",
      "¿Cómo medirías la efectividad de programas de desarrollo para empleados?",
      "¿Qué consideras importante para crear una cultura de trabajo positiva?",
      "¿Cómo te asegurarías de que los procesos de selección sean justos e inclusivos?"
    ],
    "data": [
      "¿Cómo enfocas el análisis de un conjunto de datos para extraer información útil?",
      "Describe cómo comunicarías resultados técnicos a audiencias no técnicas.",
      "¿Qué métodos utilizarías para validar la calidad de los datos antes de analizarlos?",
      "¿Cómo determinarías qué visualizaciones son más adecuadas para diferentes tipos de datos?",
      "¿Qué estrategias aplicarías cuando los datos no muestran patrones claros o esperados?"
    ],
    "finance": [
      "¿Cómo analizarías la viabilidad financiera de un proyecto o inversión?",
      "Describe cómo explicarías conceptos financieros complejos a personas sin conocimientos técnicos.",
      "¿Qué estrategias utilizarías para identificar oportunidades de reducción de costos?",
      "¿Cómo te mantendrías actualizado sobre normativas financieras o cambios regulatorios?",
      "¿Qué consideras importante al preparar informes financieros para la toma de decisiones?"
    ]
  };
  
  // Normalizar el tipo de trabajo para la búsqueda
  const normalizedJobType = jobType.toLowerCase().trim();
  
  // Buscar preguntas para el tipo de trabajo específico, con fallback a predeterminadas
  let jobQuestions = questions[normalizedJobType] || questions["default"];
  
  // Para Tech Lead, intentar buscar con y sin espacio
  if (!jobQuestions && normalizedJobType.includes("tech") && normalizedJobType.includes("lead")) {
    jobQuestions = questions["tech lead"];
  }
  
  // Si sigue sin encontrar, usar preguntas predeterminadas
  if (!jobQuestions) {
    jobQuestions = questions["default"];
  }
  
  // Seleccionar una pregunta aleatoria
  const randomQuestion = jobQuestions[Math.floor(Math.random() * jobQuestions.length)];
  
  return {
    question: randomQuestion,
    type: jobType,
    originalType: jobType,
    timestamp: new Date()
  };
};

/**
 * Generate mock interview analysis for simulation
 * @param {Object} question - Question object
 * @returns {Object} Mock analysis results
 */
function generateMockInterviewAnalysis(question) {
  const mockAnalysis = {
    score: Math.floor(Math.random() * 3) + 7, // Random score between 7-9
    summary: "Tu respuesta muestra buena preparación y comunicación efectiva aunque hay áreas de mejora.",
    strengths: [
      "Buena estructura en la respuesta",
      "Comunicación clara y concisa",
      "Uso de ejemplos específicos"
    ],
    weaknesses: [
      "Podrías profundizar más en algunos puntos",
      "La respuesta podría beneficiarse de más datos concretos",
      "Oportunidad para mostrar más entusiasmo en la comunicación"
    ],
    suggestions: [
      "Incluye más métricas o resultados específicos de tu experiencia",
      "Practica un tono más dinámico y entusiasta",
      "Refuerza tus puntos con ejemplos de situaciones reales"
    ]
  };
  
  return mockAnalysis;
}

/**
 * Guarda una entrevista completa en Firestore usando subcolección 'questions'.
 * @param {string} userId - ID del usuario (phoneNumber)
 * @param {Object} candidateInfo - Información del candidato
 * @param {Array} questionsAndAnswers - Array de objetos { questionNumber, questionText, audioUrl, videoUrl, transcription, analysis, timestamp }
 * @returns {Promise<string>} - ID de la entrevista guardada
 */
const saveInterviewWithQuestions = async (userId, candidateInfo, questionsAndAnswers) => {
  try {
    const db = require('../config/firebase').getFirestore();
    const interviewRef = db.collection('interviews').doc();
    // Guardar datos generales
    await interviewRef.set({
      userId,
      candidateInfo,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'completed',
      totalQuestions: questionsAndAnswers.length
    });
    // Guardar cada pregunta como documento en la subcolección 'questions'
    const questionsRef = interviewRef.collection('questions');
    for (const qa of questionsAndAnswers) {
      await questionsRef.doc(`question_${qa.questionNumber}`).set({
        ...qa,
        timestamp: qa.timestamp ? new Date(qa.timestamp) : new Date()
      });
    }
    logger.info(`Entrevista guardada correctamente para usuario ${userId}, ID: ${interviewRef.id}`);
    return interviewRef.id;
  } catch (error) {
    logger.error(`Error guardando entrevista: ${error.message}`);
    throw error;
  }
};

module.exports = {
  generateInterviewQuestion,
  analyzeVideoResponse,
  getDefaultQuestion,
  generateMockInterviewAnalysis,
  normalizeJobType,
  saveInterviewWithQuestions
};