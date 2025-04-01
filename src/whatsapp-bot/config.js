require('dotenv').config();

const whatsappConfig = {
  token: process.env.WHATSAPP_API_TOKEN,
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
  apiVersion: process.env.WHATSAPP_API_VERSION,
  apiUrl: process.env.WHATSAPP_API_URL,
  webhookUrl: process.env.WEBHOOK_URL || `https://${process.env.HOST}:${process.env.PORT}/webhook`,
};

module.exports = whatsappConfig; 