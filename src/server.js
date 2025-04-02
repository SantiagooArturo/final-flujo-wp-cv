// Configurar middleware para archivos estáticos
app.use('/public', express.static(path.join(__dirname, '..', 'public'))); 