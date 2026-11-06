const TelegramBot = require('node-telegram-bot-api');

// توکن را از متغیرهای محیطی ورسل می‌گیریم تا امن بماند
const token = process.env.TELEGRAM_TOKEN;

// ربات را برای حالت وب‌هوک تنظیم می‌کنیم
const bot = new TelegramBot(token);

// پاسخ دادن به دستور /start
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 'سلام! ربات مدیریت موجودی فروشگاه آماده کار است.');
});

// تابع اصلی که ورسل هنگام دریافت پیام از تلگرام اجرا می‌کند
module.exports = async (req, res) => {
  try {
    if (req.method === 'POST' && req.body) {
      await bot.processUpdate(req.body);
    }
    // ارسال تاییدیه به تلگرام
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error in bot webhook:', error);
    res.status(500).send('Server Error');
  }
};
