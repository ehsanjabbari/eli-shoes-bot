const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json()); // برای خواندن پیام‌های ارسالی تلگرام

const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token);

// پاسخ به دستور /start
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 'سلام! ربات مدیریت موجودی روی سرور Render آماده کار است.');
});

// مسیری که تلگرام پیام‌ها را به آن می‌فرستد
app.post('/webhook', (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// تنظیم پورت سرور برای رندر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
