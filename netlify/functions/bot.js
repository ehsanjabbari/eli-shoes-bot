const token = process.env.TELEGRAM_TOKEN;

exports.handler = async (event) => {
  console.log("=== ۱. پیام جدید رسید ===");
  try {
    if (!event.body) return { statusCode: 200, body: 'Empty' };
    
    const update = JSON.parse(event.body);
    const chatId = update.message?.chat?.id;
    const text = update.message?.text;
    
    console.log("=== ۲. متن پیام: ===", text);

    // اگر کاربر پیام استارت را فرستاد
    if (text === '/start' && chatId) {
      console.log("=== ۳. در حال ارسال جواب با روش مستقیم... ===");
      
      // ارسال پیام مستقیماً از طریق API اصلی تلگرام
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: 'سلام! سد سرور شکسته شد. ارتباط مستقیم و بدون پکیج برقرار است. آماده اتصال به سایت!'
        })
      });
      
      console.log("=== ۴. جواب با موفقیت ارسال شد ===");
    }
    
    return { statusCode: 200, body: 'OK' };
  } catch (error) {
    console.error('=== ۵. خطا: ===', error.message);
    return { statusCode: 500, body: 'Error' };
  }
};
