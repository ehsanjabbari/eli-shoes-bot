const token = process.env.TELEGRAM_TOKEN;
const wcKey = process.env.WC_KEY;
const wcSecret = process.env.WC_SECRET;
const adminChatId = process.env.ADMIN_CHAT_ID; // خواندن شناسه ادمین از تنظیمات
const wcUrl = 'https://elishoes.ir';

exports.handler = async (event) => {
  try {
    if (!event.body) return { statusCode: 200, body: 'Empty' };
    const update = JSON.parse(event.body);

    const auth = Buffer.from(wcKey + ':' + wcSecret).toString('base64');
    const wcHeaders = { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' };

    // ==========================================
    // قفل امنیتی: استخراج شناسه فرستنده و بررسی مجوز
    // ==========================================
    let chatId;
    if (update.message) chatId = update.message.chat.id;
    else if (update.callback_query) chatId = update.callback_query.message.chat.id;

    if (chatId && chatId.toString() !== adminChatId) {
       // ارسال پیام اخطار به شخص غیرمجاز (اختیاری)
       await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
         method: 'POST', 
         headers: { 'Content-Type': 'application/json' }, 
         body: JSON.stringify({ 
           chat_id: chatId, 
           text: '⛔ دسترسی غیرمجاز. شما مجوز استفاده از این ربات فروشگاهی را ندارید.' 
         })
       });
       // متوقف کردن اجرای کدهای بعدی
       return { statusCode: 200, body: 'Unauthorized' };
    }

    // توابع کمکی ارسال و ویرایش پیام
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
    // ۱. پردازش کلیک روی دکمه‌های شیشه‌ای
    // ==========================================
    if (update.callback_query) {
      const cb = update.callback_query;
      const data = cb.data;
      const msgId = cb.message.message_id;

      fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callback_query_id: cb.id })
      }).catch(() => {});

      if (data.startsWith('page_') || data === 'menu_products') {
        const page = data.startsWith('page_') ? parseInt(data.split('_')[1]) : 1;
        await editMessage(chatId, msgId, `در حال دریافت لیست محصولات (صفحه ${page})... ⏳`);

        const res = await fetch(`${wcUrl}/wp-json/wc/v3/products?per_page=10&page=${page}&status=publish`, { headers: wcHeaders });
        const products = await res.json();

        if (!products || products.length === 0) {
          await editMessage(chatId, msgId, 'محصول دیگری یافت نشد.', { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: `page_${page-1}` }]] });
          return { statusCode: 200, body: 'OK' };
        }

        let keyboard = [];
        products.forEach(p => {
          keyboard.push([{ text: `👞 ${p.name}`, callback_data: `prod_${p.id}` }]);
        });

        let navRow = [];
        if (page > 1) navRow.push({ text: '◀️ قبلی', callback_data: `page_${page - 1}` });
        navRow.push({ text: '▶️ بعدی', callback_data: `page_${page + 1}` });
        keyboard.push(navRow);

        await editMessage(chatId, msgId, `📦 <b>لیست محصولات فروشگاه</b> (صفحه ${page})\nبرای مشاهده ویژگی‌ها روی یک محصول ضربه بزنید:`, { inline_keyboard: keyboard });
      }

      else if (data.startsWith('prod_')) {
        const pid = data.split('_')[1];
        await editMessage(chatId, msgId, `در حال دریافت اطلاعات محصول... ⏳`);

        const res = await fetch(`${wcUrl}/wp-json/wc/v3/products/${pid}/variations?per_page=100`, { headers: wcHeaders });
        const variations = await res.json();

        if (!variations || variations.length === 0) {
           let keyboard = [
             [{ text: '📥 ثبت ورودی', callback_data: `act_IN_${pid}_0` }],
             [{ text: '🛍 ثبت فروش حضوری', callback_data: `act_OUT1_${pid}_0` }],
             [{ text: '🌐 ثبت فروش سایت دوم', callback_data: `act_OUT2_${pid}_0` }],
             [{ text: '🔙 بازگشت به لیست محصولات', callback_data: `page_1` }]
           ];
           await editMessage(chatId, msgId, `⚙️ <b>عملیات مورد نظر برای این محصول ساده را انتخاب کنید:</b>`, { inline_keyboard: keyboard });
        } else {
           const colors = [...new Set(variations.map(v => v.attributes[0]?.option).filter(Boolean))];
           let keyboard = [];
           colors.forEach(color => {
             keyboard.push([{ text: `🎨 رنگ: ${color}`, callback_data: `color_${pid}_${color}` }]);
           });
           keyboard.push([{ text: '🔙 بازگشت به لیست محصولات', callback_data: `page_1` }]);

           await editMessage(chatId, msgId, `🎨 <b>رنگ مورد نظر خود را انتخاب کنید:</b>`, { inline_keyboard: keyboard });
        }
      }

      else if (data.startsWith('color_')) {
        const parts = data.split('_');
        const pid = parts[1];
        const selectedColor = parts.slice(2).join('_');

        await editMessage(chatId, msgId, `در حال دریافت سایزها و موجودی... ⏳`);

        const res = await fetch(`${wcUrl}/wp-json/wc/v3/products/${pid}/variations?per_page=100`, { headers: wcHeaders });
        const variations = await res.json();

        const colorVariations = variations.filter(v => v.attributes.some(a => a.option === selectedColor));

        let keyboard = [];
        colorVariations.forEach(v => {
          const sizeAttr = v.attributes.find(a => a.option !== selectedColor);
          const sizeName = sizeAttr ? sizeAttr.option : 'بدون سایز';
          const stock = v.manage_stock ? (v.stock_quantity || 0) : 'بدون مدیریت';

          keyboard.push([{
            text: `📏 سایز: ${sizeName} | 📦 موجودی: ${stock}`,
            callback_data: `size_${pid}_${v.id}`
          }]);
        });
        keyboard.push([{ text: '🔙 انتخاب رنگ دیگر', callback_data: `prod_${pid}` }]);

        await editMessage(chatId, msgId, `📏 <b>لیست سایزها برای رنگ "${selectedColor}"</b>\n\nبرای ثبت عملیات، روی یکی از سایزهای زیر ضربه بزنید:`, { inline_keyboard: keyboard });
      }

      else if (data.startsWith('size_')) {
        const [, pid, vid] = data.split('_');
        let keyboard = [
          [{ text: '📥 ثبت ورودی', callback_data: `act_IN_${pid}_${vid}` }],
          [{ text: '🛍 ثبت فروش حضوری', callback_data: `act_OUT1_${pid}_${vid}` }],
          [{ text: '🌐 ثبت فروش سایت دوم', callback_data: `act_OUT2_${pid}_${vid}` }],
          [{ text: '🔙 بازگشت به لیست سایزها', callback_data: `prod_${pid}` }] 
        ];
        await editMessage(chatId, msgId, `⚙️ <b>نوع عملیات را انتخاب کنید:</b>`, { inline_keyboard: keyboard });
      }

      else if (data.startsWith('act_')) {
        const [, action, pid, vid] = data.split('_');
        let actionText = action === 'IN' 
          ? '📥 <b>ثبت ورودی:</b> چه تعدادی به موجودی اضافه شود؟' 
          : '🛍 <b>کسر از موجودی:</b> چه تعدادی فروخته شد؟';

        const body = {
          chat_id: chatId,
          text: `${actionText}\n\n[کد سیستم: #${action}_${pid}_${vid}]\n\n⚠️ لطفاً تعداد مدنظر را فقط به صورت عدد در پاسخ به همین پیام بفرستید.`,
          reply_markup: { force_reply: true, selective: true }
        };
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
      }

      return { statusCode: 200, body: 'OK' };
    }

    // ==========================================
    // ۲. پردازش پیام‌های متنی
    // ==========================================
    if (update.message && update.message.text) {
      const text = update.message.text;

      if (text === '/start') {
        const keyboard = { inline_keyboard: [ [{ text: '🛍 نمایش لیست تمام محصولات', callback_data: 'menu_products' }] ] };
        await sendMessage(chatId, 'سلام ادمین عزیز! پنل مدیریت موجودی سایت فعال است.\nبرای جستجو نام محصول را بنویسید یا روی دکمه زیر ضربه بزنید:', keyboard);
      }
      
      else if (update.message.reply_to_message && update.message.reply_to_message.text) {
        const repliedText = update.message.reply_to_message.text;
        const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
        const enText = text.replace(/[۰-۹]/g, w => persianDigits.indexOf(w));
        const amount = parseInt(enText);

        const match = repliedText.match(/#(IN|OUT1|OUT2)_(\d+)_(\d+)/);
        if (match) {
          const [, action, pid, vid] = match;

          if (isNaN(amount) || amount <= 0) {
            await sendMessage(chatId, '❌ خطا: لطفاً یک عدد معتبر بزرگتر از صفر وارد کنید.');
            return { statusCode: 200, body: 'OK' };
          }

          await sendMessage(chatId, 'در حال محاسبه و ثبت در سایت... ⏳');

          const endpoint = vid === '0'
              ? `${wcUrl}/wp-json/wc/v3/products/${pid}`
              : `${wcUrl}/wp-json/wc/v3/products/${pid}/variations/${vid}`;

          const resGet = await fetch(endpoint, { headers: wcHeaders });
          const itemData = await resGet.json();

          let currentStock = itemData.stock_quantity || 0;
          let newStock = currentStock;
          let actName = "";

          if (action === 'IN') {
              newStock = currentStock + amount;
              actName = "📥 ثبت ورودی (اضافه شد)";
          } else if (action === 'OUT1') {
              newStock = currentStock - amount;
              actName = "🛍 فروش حضوری (کسر شد)";
          } else if (action === 'OUT2') {
              newStock = currentStock - amount;
              actName = "🌐 فروش سایت دوم (کسر شد)";
          }

          const resPut = await fetch(endpoint, {
              method: 'PUT', headers: wcHeaders,
              body: JSON.stringify({ manage_stock: true, stock_quantity: newStock })
          });
          const updatedData = await resPut.json();

          if (updatedData.id) {
              await sendMessage(chatId, `✅ <b>ثبت موفقیت‌آمیز بود!</b>\n\nعملیات: ${actName}\nتعداد تغییر یافته: ${amount}\n📦 <b>موجودی جدید: ${updatedData.stock_quantity}</b>`);
          } else {
              await sendMessage(chatId, '❌ خطا در ارتباط با سایت.');
          }
        }
      }
      
      else if (!update.message.reply_to_message) {
        await sendMessage(chatId, `در حال جستجوی "${text}" ... ⏳`);
        const res = await fetch(`${wcUrl}/wp-json/wc/v3/products?search=${encodeURIComponent(text)}&status=publish`, { headers: wcHeaders });
        const products = await res.json();

        if (!products || products.length === 0) {
           await sendMessage(chatId, 'محصولی با این نام پیدا نشد 😔');
        } else {
           let keyboard = [];
           products.forEach(p => {
             keyboard.push([{ text: `👞 ${p.name}`, callback_data: `prod_${p.id}` }]);
           });
           await sendMessage(chatId, '✅ محصولات پیدا شده (برای انتخاب ضربه بزنید):', { inline_keyboard: keyboard });
        }
      }
    }

    return { statusCode: 200, body: 'OK' };
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, body: 'Error' };
  }
};
