// Reexporta todos los handlers de los módulos específicos

module.exports = {
  ...require('./cvHandlers'),
  ...require('./interviewHandlers'),
  ...require('./promoHandlers'),
  ...require('./paymentHandlers'),
  ...require('./generalHandlers'),
};
