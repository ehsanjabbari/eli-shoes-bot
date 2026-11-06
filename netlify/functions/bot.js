const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token);

exports.handler = async (event) => {
  try {
    // بررسی می‌کنیم که پیام متنی به درستی ارسال شده باشد
    if (event.httpMethod === 'POST' && event.body) {
      const update = JSON.parse(event.body);
      
      // اگر کاربر دستور استارت را فرستاد، منتظر می‌مانیم تا جواب ارسال شود
      if (update.message && update.message.text === '/start') {
        await bot.sendMessage(update.message.chat.id, 'سلام! ارتباط با سرور برقرار شد. آماده اتصال به دیتابیس هستیم.');
      }
    }
    // در نهایت پس از اتمام کار، به تلگرام می‌گوییم همه چیز موفق بود
    return { statusCode: 200, body: 'OK' };
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, body: 'Server Error' };
  }
};
