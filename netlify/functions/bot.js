const token = process.env.TELEGRAM_TOKEN;
const wcKey = process.env.WC_KEY;
const wcSecret = process.env.WC_SECRET;
// آدرس سایت شما مستقیماً در کد قرار داده شد
const wcUrl = 'https://elishoes.ir'; 

exports.handler = async (event) => {
  try {
    if (!event.body) return { statusCode: 200, body: 'Empty' };
    
    const update = JSON.parse(event.body);
    const chatId = update.message?.chat?.id;
    const text = update.message?.text;
    
    if (!chatId || !text) return { statusCode: 200, body: 'OK' };

    // تابع کمکی برای ارسال پیام به تلگرام
    const sendMessage = async (msgText) => {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: msgText })
      });
    };

    if (text === '/start') {
      await sendMessage('سلام! به ربات مدیریت موجودی الی شوز خوش آمدید.\nنام محصول مورد نظر را بفرستید تا موجودی آن را چک کنم.');
    } else {
      await sendMessage(`در حال جستجوی "${text}" در انبار فروشگاه... ⏳`);
      
      // ساخت سیستم احراز هویت برای ووکامرس
      const auth = Buffer.from(wcKey + ':' + wcSecret).toString('base64');
      const searchUrl = `${wcUrl}/wp-json/wc/v3/products?search=${encodeURIComponent(text)}`;
      
      // جستجوی محصول در سایت
      const response = await fetch(searchUrl, {
        headers: { 'Authorization': `Basic ${auth}` }
      });
      
      const products = await response.json();
      
      if (!products || products.length === 0) {
        await sendMessage('محصولی با این نام پیدا نشد 😔');
      } else {
        let resultText = '✅ محصولات پیدا شده:\n\n';
        products.forEach(p => {
          resultText += `🔹 نام: ${p.name}\n`;
          resultText += `📦 موجودی فعلی: ${p.manage_stock ? (p.stock_quantity || 0) : 'بدون مدیریت موجودی'}\n`;
          resultText += `💰 قیمت: ${p.price} تومان\n`;
          resultText += `🆔 شناسه سیستم (ID): ${p.id}\n\n`;
        });
        await sendMessage(resultText);
      }
    }
    
    return { statusCode: 200, body: 'OK' };
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, body: 'Error' };
  }
};
