const telegramBotPackage = require('node-telegram-bot-api');
const TelegramBot = telegramBotPackage.default || telegramBotPackage;
const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token);

exports.handler = async (event) => {
  console.log("=== ۱. پیام جدید از تلگرام رسید ===");
  try {
    if (!event.body) {
       console.log("خطا: پیام خالی است.");
       return { statusCode: 200, body: 'Empty' };
    }
    
    const update = JSON.parse(event.body);
    console.log("=== ۲. محتوای پیام: ===", update.message ? update.message.text : "بدون متن");
    
    if (update.message && update.message.text === '/start') {
      console.log("=== ۳. در حال ارسال جواب به تلگرام... ===");
      await bot.sendMessage(update.message.chat.id, 'سلام! مشکل سرور برطرف شد. آماده اتصال به ووکامرس هستیم.');
      console.log("=== ۴. جواب با موفقیت ارسال شد! ===");
    }
    
    return { statusCode: 200, body: 'OK' };
  } catch (error) {
    console.error('=== ۵. ارور سرور: ===', error.message || error);
    return { statusCode: 500, body: 'Error' };
  }
};
