const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token);

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 'سلام! ربات مدیریت موجودی روی سرور Netlify آماده کار است.');
});

exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'POST' && event.body) {
      // نتلیفای پیام‌ها را به صورت رشته متنی می‌گیرد، پس باید آن را تبدیل کنیم
      const body = JSON.parse(event.body);
      await bot.processUpdate(body);
    }
    return { statusCode: 200, body: 'OK' };
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, body: 'Server Error' };
  }
};
