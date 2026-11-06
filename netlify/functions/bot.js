const token = process.env.TELEGRAM_TOKEN;
const wcKey = process.env.WC_KEY;
const wcSecret = process.env.WC_SECRET;
const wcUrl = 'https://elishoes.ir'; 

exports.handler = async (event) => {
  try {
    if (!event.body) return { statusCode: 200, body: 'Empty' };
    
    const update = JSON.parse(event.body);
    const chatId = update.message?.chat?.id;
    const text = update.message?.text;
    
    if (!chatId || !text) return { statusCode: 200, body: 'OK' };

    const sendMessage = async (msgText) => {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: msgText })
      });
    };

    const auth = Buffer.from(wcKey + ':' + wcSecret).toString('base64');

    // ۱. دستور استارت
    if (text === '/start') {
      await sendMessage('سلام! به ربات موجودی خوش آمدید.\nنام محصول را بفرستید تا موجودی را چک کنم.\n\nبرای ثبت موجودی جدید از این دستور استفاده کنید:\n/set [شناسه] [تعداد]\nمثال: /set 1542 10');
    } 
    // ۲. بخش آپدیت موجودی
    else if (text.startsWith('/set')) {
      const parts = text.split(' ');
      
      // بررسی صحت دستور
      if (parts.length !== 3) {
        await sendMessage('❌ فرمت دستور اشتباه است. لطفاً دقیقاً مانند مثال زیر بفرستید (با فاصله):\n/set 1542 10');
        return { statusCode: 200, body: 'OK' };
      }
      
      const productId = parts[1];
      const newStock = parts[2];
      
      await sendMessage(`در حال ثبت موجودی جدید (${newStock}) برای محصول ${productId}... ⏳`);
      
      // ارسال دستور تغییر موجودی به ووکامرس (متد PUT)
      const updateUrl = `${wcUrl}/wp-json/wc/v3/products/${productId}`;
      const response = await fetch(updateUrl, {
        method: 'PUT',
        headers: { 
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          manage_stock: true, // فعال کردن مدیریت موجودی
          stock_quantity: parseInt(newStock) // ثبت تعداد جدید
        })
      });
      
      const result = await response.json();
      
      if (result.id) {
         await sendMessage(`✅ عالی! موجودی محصول "${result.name}" در سایت با موفقیت به ${result.stock_quantity} عدد تغییر یافت.`);
      } else {
         await sendMessage('❌ خطایی رخ داد. لطفاً مطمئن شوید شناسه (ID) محصول را درست وارد کرده‌اید.');
      }
    }
    // ۳. بخش جستجوی محصول (اگر دستور نبود، یعنی کاربر اسم محصول را فرستاده)
    else {
      await sendMessage(`در حال جستجوی "${text}" در سایت... ⏳`);
      
      const searchUrl = `${wcUrl}/wp-json/wc/v3/products?search=${encodeURIComponent(text)}`;
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
          resultText += `📦 موجودی فعلی: ${p.manage_stock ? (p.stock_quantity || 0) : 'بدون مدیریت'}\n`;
          resultText += `🆔 شناسه (ID): ${p.id}\n\n`;
        });
        resultText += 'برای تغییر موجودی، شناسه محصول را در دستور زیر جایگذاری کنید:\n/set [شناسه] [تعداد]';
        await sendMessage(resultText);
      }
    }
    
    return { statusCode: 200, body: 'OK' };
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, body: 'Error' };
  }
};
