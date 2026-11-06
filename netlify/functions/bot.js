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
    const headers = { 
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    };

    // ۱. دستور استارت
    if (text === '/start') {
      await sendMessage('سلام! ربات هوشمند موجودی آماده است.\nنام محصول را بفرستید تا جستجو کنم.');
    } 
    // ۲. آپدیت موجودی محصول ساده
    else if (text.startsWith('/set ')) {
      const parts = text.split(' ');
      if (parts.length !== 3) return { statusCode: 200, body: 'OK' };
      const productId = parts[1];
      const newStock = parts[2];
      
      await sendMessage(`در حال ثبت موجودی (${newStock}) برای محصول ${productId}... ⏳`);
      
      const response = await fetch(`${wcUrl}/wp-json/wc/v3/products/${productId}`, {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify({ manage_stock: true, stock_quantity: parseInt(newStock) })
      });
      const result = await response.json();
      
      if (result.id) await sendMessage(`✅ موجودی "${result.name}" به ${result.stock_quantity} تغییر یافت.`);
      else await sendMessage('❌ خطا در ثبت موجودی محصول ساده.');
    }
    // ۳. آپدیت موجودی محصول متغیر (سایز/رنگ خاص)
    else if (text.startsWith('/setvar ')) {
      const parts = text.split(' ');
      if (parts.length !== 4) return { statusCode: 200, body: 'OK' };
      const pid = parts[1]; // شناسه محصول اصلی
      const vid = parts[2]; // شناسه متغیر (سایز)
      const newStock = parts[3];
      
      await sendMessage(`در حال ثبت موجودی (${newStock}) برای متغیر ${vid}... ⏳`);
      
      const response = await fetch(`${wcUrl}/wp-json/wc/v3/products/${pid}/variations/${vid}`, {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify({ manage_stock: true, stock_quantity: parseInt(newStock) })
      });
      const result = await response.json();
      
      if (result.id) {
        const attrs = result.attributes.map(a => `${a.option}`).join(' | ');
        await sendMessage(`✅ موجودی سایز/رنگ "${attrs || 'نامشخص'}" با موفقیت به ${result.stock_quantity} تغییر یافت.`);
      } else await sendMessage('❌ خطا در ثبت موجودی متغیر.');
    }
    // ۴. دریافت لیست متغیرها (سایزها)
    else if (text.startsWith('/vars ')) {
      const parts = text.split(' ');
      const pid = parts[1];
      
      await sendMessage(`در حال دریافت لیست سایزهای محصول ${pid}... ⏳`);
      
      const response = await fetch(`${wcUrl}/wp-json/wc/v3/products/${pid}/variations`, {
        headers: { 'Authorization': `Basic ${auth}` }
      });
      const variations = await response.json();
      
      if (!variations || variations.length === 0) {
        await sendMessage('سایز یا رنگی برای این محصول ثبت نشده است.');
      } else {
        let resultText = '✅ متغیرهای این محصول:\n\n';
        variations.forEach(v => {
          const attrs = v.attributes.map(a => `${a.name}: ${a.option}`).join(' | ');
          resultText += `🔸 ${attrs || 'بدون ویژگی'}\n`;
          resultText += `📦 موجودی: ${v.manage_stock ? (v.stock_quantity || 0) : 'بدون مدیریت'}\n`;
          resultText += `برای تغییر موجودی این سایز:\n/setvar ${pid} ${v.id} [تعداد]\n\n`;
        });
        await sendMessage(resultText);
      }
    }
    // ۵. جستجوی نام محصول
    else {
      await sendMessage(`در حال جستجوی "${text}" ... ⏳`);
      
      const searchUrl = `${wcUrl}/wp-json/wc/v3/products?search=${encodeURIComponent(text)}`;
      const response = await fetch(searchUrl, {
        headers: { 'Authorization': `Basic ${auth}` }
      });
      const products = await response.json();
      
      if (!products || products.length === 0) {
        await sendMessage('محصولی پیدا نشد 😔');
      } else {
        let resultText = '✅ محصولات پیدا شده:\n\n';
        products.forEach(p => {
          resultText += `🔹 نام: ${p.name}\n`;
          
          if (p.type === 'variable') {
            resultText += `⚠️ این محصول دارای سایز/رنگ است.\n`;
            resultText += `برای دیدن موجودی هر سایز لمس کنید:\n/vars ${p.id}\n\n`;
          } else {
            resultText += `📦 موجودی: ${p.manage_stock ? (p.stock_quantity || 0) : 'بدون مدیریت'}\n`;
            resultText += `برای تغییر موجودی لمس کنید:\n/set ${p.id} [تعداد]\n\n`;
          }
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
