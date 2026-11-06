const telegramBotPackage = require('node-telegram-bot-api');

// این خط مشکل فشرده‌ساز نتلیفای را حل می‌کند
const TelegramBot = telegramBotPackage.default || telegramBotPackage;

const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token);

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'POST' && event.body) {
      const update = JSON.parse(event.body);
      
      if (update.message && update.message.text === '/start') {
        await bot.sendMessage(update.message.chat.id, 'سلام! مشکل سرور برطرف شد. حالا آماده اتصال به ووکامرس هستیم.');
      }
    }
    return { statusCode: 200, body: 'OK' };
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, body: 'Server Error' };
  }
};
