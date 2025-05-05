const { saveInterviewToFirestore } = require('./interviewService');

// Simula datos de sesión de entrevista
const sessionData = {
  userName: "Juan Pérez",
  interviewStartTime: new Date(),
  state: { INTERVIEW_COMPLETED: "COMPLETADO" }, // Simula el estado
  questions: [
    { question: "¿Por qué quieres este trabajo?" },
    { question: "¿Cuáles son tus fortalezas?" }
  ],
  answers: [
    {
      audioR2Url: "https://r2.example.com/audio1.mp3",
      videoR2Url: null,
      transcription: "Porque me apasiona el área...",
      analysis: { score: 8, summary: "Buena respuesta" }
    },
    {
      audioR2Url: null,
      videoR2Url: "https://r2.example.com/video2.mp4",
      transcription: "Soy responsable y proactivo...",
      analysis: { score: 9, summary: "Excelente respuesta" }
    }
  ],
  jobPosition: "Tech Lead",
  currentQuestion: 1
};

const userId = "51999999999"; // Simula un número de teléfono

saveInterviewToFirestore(userId, sessionData)
  .then((docId) => {
    console.log("Entrevista guardada con éxito. ID:", docId);
    process.exit(0);
  })
  .catch((err) => {
    console.error("Error al guardar la entrevista:", err);
    process.exit(1);
  });