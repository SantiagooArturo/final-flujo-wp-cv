require('dotenv').config();

const chatwootConfig = {
  apiUrl: process.env.CHATWOOT_API_URL || '',
  apiToken: process.env.CHATWOOT_API_TOKEN || '',
  accountId: process.env.CHATWOOT_ACCOUNT_ID || 1,
  whatsappInboxId: 1
};

module.exports = chatwootConfig;