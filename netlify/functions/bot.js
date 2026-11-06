const token = process.env.TELEGRAM_TOKEN;
const wcKey = process.env.WC_KEY;
const wcSecret = process.env.WC_SECRET;
const wcUrl = 'https://elishoes.ir';

exports.handler = async (event) => {
  try {
    if (!event.body) return { statusCode: 200, body: 'Empty' };
    const update = JSON.parse(event.body);

    const auth = Buffer.from(wcKey + ':' + wcSecret).toString('base64');
    const headers = { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' };

    // --- توابع کمکی برای ارسال و ویرایش پیام تلگرام ---
    const sendMessage = async (chatId, text, replyMarkup = null) => {
      const body = { chat_id: chatId, text: text, parse_mode: 'HTML' };
      if (replyMarkup) body.reply_markup = replyMarkup;
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
    };

    const editMessage = async (chatId, messageId, text, replyMarkup = null) => {
      const body = { chat_id: chatId, message_id: messageId, text: text, parse_mode: 'HTML' };
      if (replyMarkup) body.reply_markup = replyMarkup;
      await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
    };

    // ==========================================
    // ۱. پردازش کلیک روی دکمه‌های شیشه‌ای (Callback Queries)
    // ==========================================
    if (update.callback_query) {
      const cb = update.callback_query;
      const data = cb.data;
      const chatId = cb.message.chat.id;
      const msgId = cb.message.message_id;

      // کلیک روی دکمه "نمایش محصولات" یا "صفحه‌بندی"
      if (data.startsWith('page_') || data === 'menu_products') {
        const page = data.startsWith('page_') ? parseInt(data.split('_')[1]) : 1;
        await editMessage(chatId, msgId, `در حال دریافت لیست محصولات (صفحه ${page})... ⏳`);
        
        const res = await fetch(`${wcUrl}/wp-json/wc/v3/products?per_page=10&page=${page}&status=publish`, { headers });
        const products = await res.json();
        
        if (!products || products.length === 0) {
          await editMessage(chatId, msgId, 'محصولی یافت نشد.');
          return { statusCode: 200, body: 'OK' };
        }

        let keyboard = [];
        products.forEach(p => {
          keyboard.push([{ text: `👞 ${p.name}`, callback_data: `prod_${p.id}` }]);
        });

        // دکمه‌های صفحه‌بندی
        let navRow = [];
        if (page > 1) navRow.push({ text: '◀️ قبلی', callback_data: `page_${page - 1}` });
        navRow.push({ text: '▶️ بعدی', callback_data: `page_${page + 1}` });
        keyboard.push(navRow);
        
        await editMessage(chatId, msgId, `📦 <b>لیست محصولات فروشگاه</b> (صفحه ${page})\nیک محصول را برای مشاهده رنگ‌بندی انتخاب کنید:`, { inline_keyboard: keyboard });
      }
      
      // کلیک روی یک محصول خاص -> نمایش رنگ‌ها
      else if (data.startsWith('prod_')) {
        const pid = data.split('_')[1];
        await editMessage(chatId, msgId, `در حال دریافت اطلاعات رنگ‌بندی... ⏳`);
        
        const res = await fetch(`${wcUrl}/wp-json/wc/v3/products/${pid}/variations`, { headers });
        const variations = await res.json();
        
        if (!variations || variations.length === 0) {
           await editMessage(chatId, msgId, `این محصول ساده است (رنگ و سایز ندارد).\n\nبرای تغییر موجودی آن این دستور را بفرستید:\n<code>/set ${pid} [تعداد]</code>`);
           return { statusCode: 200, body: 'OK' };
        }

        // استخراج رنگ‌های یکتا (با فرض اینکه ویژگی اول رنگ است)
        const colors = [...new Set(variations.map(v => v.attributes[0]?.option).filter(Boolean))];
        let keyboard = [];
        colors.forEach(color => {
          // ارسال شناسه محصول و نام رنگ به مرحله بعد
          keyboard.push([{ text: `🎨 رنگ: ${color}`, callback_data: `color_${pid}_${color}` }]);
        });
        keyboard.push([{ text: '🔙 بازگشت به لیست محصولات', callback_data: `page_1` }]);

        await editMessage(chatId, msgId, `🎨 <b>رنگ مورد نظر خود را انتخاب کنید:</b>`, { inline_keyboard: keyboard });
      }

      // کلیک روی یک رنگ خاص -> نمایش سایزها و موجودی داخل دکمه
      else if (data.startsWith('color_')) {
        const parts = data.split('_');
        const pid = parts[1];
        const selectedColor = parts.slice(2).join('_'); // اتصال مجدد در صورت وجود خط تیره در نام رنگ
        
        await editMessage(chatId, msgId, `در حال دریافت سایزها و موجودی... ⏳`);
        
        const res = await fetch(`${wcUrl}/wp-json/wc/v3/products/${pid}/variations`, { headers });
        const variations = await res.json();
        
        // فیلتر کردن متغیرهایی که رنگ انتخاب شده را دارند
        const colorVariations = variations.filter(v => v.attributes.some(a => a.option === selectedColor));
        
        let keyboard = [];
        colorVariations.forEach(v => {
          // استخراج نام سایز (معمولاً ویژگی دوم است)
          const sizeAttr = v.attributes.find(a => a.option !== selectedColor);
          const sizeName = sizeAttr ? sizeAttr.option : 'بدون سایز';
          const stock = v.manage_stock ? (v.stock_quantity || 0) : 'بدون مدیریت';
          
          // متن داخل دکمه: سایز 38 | موجودی: 5
          keyboard.push([{ 
            text: `📏 سایز: ${sizeName} | 📦 موجودی: ${stock}`, 
            callback_data: `size_${pid}_${v.id}` 
          }]);
        });
        
        keyboard.push([{ text: '🔙 بازگشت به انتخاب رنگ', callback_data: `prod_${pid}` }]);

        await editMessage(chatId, msgId, `📏 <b>لیست سایزها و موجودی برای رنگ "${selectedColor}"</b>\n\nبرای تغییر موجودی، روی سایز مورد نظر ضربه بزنید:`, { inline_keyboard: keyboard });
      }

      // کلیک روی یک سایز -> درخواست ارسال دستور ثبت موجودی
      else if (data.startsWith('size_')) {
        const [, pid, vid] = data.split('_');
        await sendMessage(chatId, `ثبت موجودی جدید:\n\nلطفاً پیام زیر را کپی کرده، تعداد جدید را به جای کلمه [تعداد] بنویسید و ارسال کنید:\n\n<code>/setvar ${pid} ${vid} [تعداد]</code>`);
      }
      
      // پاسخ خودکار تلگرام برای جلوگیری از حالت لودینگ روی دکمه‌ها
      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callback_query_id: cb.id })
      });
      
      return { statusCode: 200, body: 'OK' };
    }

    // ==========================================
    // ۲. پردازش پیام‌های متنی عادی
    // ==========================================
    if (update.message && update.message.text) {
      const text = update.message.text;
      const chatId = update.message.chat.id;

      if (text === '/start') {
        const keyboard = {
          inline_keyboard: [ [{ text: '🛍 نمایش لیست محصولات', callback_data: 'menu_products' }] ]
        };
        await sendMessage(chatId, 'سلام! به پنل مدیریت موجودی الی شوز خوش آمدید.\nبرای شروع روی دکمه زیر ضربه بزنید:', keyboard);
      }
      
      // دستور ثبت موجودی متغیر (که کاربر بعد از کلیک روی سایز کپی می‌کند)
      else if (text.startsWith('/setvar ')) {
        const parts = text.split(' ');
        if (parts.length === 4) {
          const [ , pid, vid, newStock] = parts;
          await sendMessage(chatId, `در حال ثبت موجودی (${newStock}) در دیتابیس... ⏳`);
          
          const res = await fetch(`${wcUrl}/wp-json/wc/v3/products/${pid}/variations/${vid}`, {
            method: 'PUT', headers, body: JSON.stringify({ manage_stock: true, stock_quantity: parseInt(newStock) })
          });
          const result = await res.json();
          if (result.id) await sendMessage(chatId, `✅ موجودی با موفقیت به ${result.stock_quantity} عدد بروزرسانی شد.\n\nبرای مشاهده مجدد محصولات، /start را بفرستید.`);
          else await sendMessage(chatId, '❌ خطایی در ثبت موجودی رخ داد.');
        }
      }
      
      // دستور ثبت موجودی محصول ساده
      else if (text.startsWith('/set ')) {
         const parts = text.split(' ');
         if (parts.length === 3) {
            const [ , pid, newStock] = parts;
            await sendMessage(chatId, `در حال ثبت موجودی (${newStock})... ⏳`);
            const res = await fetch(`${wcUrl}/wp-json/wc/v3/products/${pid}`, {
              method: 'PUT', headers, body: JSON.stringify({ manage_stock: true, stock_quantity: parseInt(newStock) })
            });
            const result = await res.json();
            if (result.id) await sendMessage(chatId, `✅ موجودی به ${result.stock_quantity} عدد بروزرسانی شد.`);
         }
      }
    }
    
    return { statusCode: 200, body: 'OK' };
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, body: 'Error' };
  }
};
