const token = process.env.TELEGRAM_TOKEN;
const wcKey = process.env.WC_KEY;
const wcSecret = process.env.WC_SECRET;
const adminChatId = process.env.ADMIN_CHAT_ID;
const sheetUrl = process.env.GOOGLE_SHEET_URL;
const wcUrl = 'https://elishoes.ir';

exports.handler = async (event) => {
  try {
    if (!event.body) return { statusCode: 200, body: 'Empty' };
    const update = JSON.parse(event.body);

    const auth = Buffer.from(wcKey + ':' + wcSecret).toString('base64');
    const wcHeaders = { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' };

    let chatId;
    if (update.message) chatId = update.message.chat.id;
    else if (update.callback_query) chatId = update.callback_query.message.chat.id;

    if (chatId && chatId.toString() !== adminChatId) {
       await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
         method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: '⛔ دسترسی غیرمجاز.' })
       });
       return { statusCode: 200, body: 'Unauthorized' };
    }

    const sendMessage = async (chatId, text, replyMarkup = null) => {
      const body = { chat_id: chatId, text: text, parse_mode: 'HTML' };
      if (replyMarkup) body.reply_markup = replyMarkup;
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    };

    const editMessage = async (chatId, messageId, text, replyMarkup = null) => {
      const body = { chat_id: chatId, message_id: messageId, text: text, parse_mode: 'HTML' };
      if (replyMarkup) body.reply_markup = replyMarkup;
      await fetch(`https://api.telegram.org/bot${token}/editMessageText`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    };

    // ==========================================
    // ۱. پردازش دکمه‌های شیشه‌ای
    // ==========================================
    if (update.callback_query) {
      const cb = update.callback_query;
      const data = cb.data;
      const msgId = cb.message.message_id;

      fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callback_query_id: cb.id }) }).catch(() => {});

      if (data === 'view_logs') {
        await editMessage(chatId, msgId, "در حال دریافت سوابق از گوگل شیت... ⏳");
        if (!sheetUrl) return { statusCode: 200, body: 'OK' };
        const res = await fetch(`${sheetUrl}?limit=10`);
        const logs = await res.json();
        if (!logs || logs.length === 0) {
          await editMessage(chatId, msgId, "هیچ سابقه‌ای ثبت نشده است.", { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: `menu_main` }]] });
        } else {
          let text = "📝 <b>۱۰ سابقه اخیر انبار:</b>\n\n";
          logs.reverse().forEach(log => { text += `🔹 <b>${log[3]}</b>: ${log[4]} عدد\n👞 ${log[2]}\n🕒 ${log[0]} - ${log[1]}\n\n`; });
          await editMessage(chatId, msgId, text, { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: `menu_main` }]] });
        }
      }

      else if (data === 'menu_main') {
        const keyboard = {
          inline_keyboard: [
            [{ text: '🛍 مدیریت محصولات (موجودی و قیمت)', callback_data: 'menu_products' }],
            [{ text: '📊 نمایش سریع تمام موجودی‌ها', callback_data: 'quick_inventory' }],
            [{ text: '📝 نمایش سوابق (ورودی و فروش)', callback_data: 'view_logs' }]
          ]
        };
        await editMessage(chatId, msgId, 'به پنل مدیریت الی شوز خوش آمدید.\nیکی از گزینه‌های زیر را انتخاب کنید:', keyboard);
      }

      else if (data === 'quick_inventory') {
        await editMessage(chatId, msgId, "در حال استخراج همزمان موجودی و قیمت‌ها... ⏳");
        const res = await fetch(`${wcUrl}/wp-json/wc/v3/products?per_page=50&status=publish`, { headers: wcHeaders });
        const products = await res.json();
        if (!products || products.length === 0) return { statusCode: 200, body: 'OK' };

        const variableProducts = products.filter(p => p.type === 'variable');
        const variationPromises = variableProducts.map(p => fetch(`${wcUrl}/wp-json/wc/v3/products/${p.id}/variations?per_page=100`, { headers: wcHeaders }).then(r => r.json()).then(vars => ({ id: p.id, variations: vars })));
        const variationsData = await Promise.all(variationPromises);
        const variationsMap = {};
        variationsData.forEach(item => { variationsMap[item.id] = item.variations; });

        let reportChunks = ["📊 <b>گزارش سریع موجودی</b>\n\n"];
        let chunkIndex = 0;

        for (const p of products) {
          let itemText = `👞 <b>${p.name}</b>\n`;
          let regPrice = p.regular_price || p.price;
          if (regPrice) {
            itemText += `💰 قیمت: ${parseInt(regPrice).toLocaleString('fa-IR')} تومان\n`;
            if (p.sale_price) itemText += `🏷 ویژه: ${parseInt(p.sale_price).toLocaleString('fa-IR')} تومان\n`;
          }

          if (p.type === 'simple') {
            const stock = p.manage_stock ? (p.stock_quantity || 0) : 'X';
            itemText += `📦 موجودی: ${stock}\n\n`;
          } 
          else if (p.type === 'variable') {
            const variations = variationsMap[p.id] || [];
            let grouped = {};
            variations.forEach(v => {
              let color = v.attributes[0] ? v.attributes[0].option : 'نامشخص';
              let size = v.attributes[1] ? v.attributes[1].option : 'تک‌سایز';
              if (!grouped[color]) grouped[color] = [];
              const stock = v.manage_stock ? (v.stock_quantity || 0) : '0';
              grouped[color].push(`${size}:${stock}`);
            });
            for (const [color, sizes] of Object.entries(grouped)) itemText += `🎨 رنگ ${color}\n👉 ${sizes.join(' | ')}\n`;
            itemText += `\n`;
          }
          if (reportChunks[chunkIndex].length + itemText.length > 3800) { chunkIndex++; reportChunks[chunkIndex] = ""; }
          reportChunks[chunkIndex] += itemText;
        }
        await editMessage(chatId, msgId, reportChunks[0], { inline_keyboard: [[{ text: '🔙 بازگشت', callback_data: `menu_main` }]] });
        for (let i = 1; i < reportChunks.length; i++) await sendMessage(chatId, reportChunks[i]);
      }

      else if (data.startsWith('page_') || data === 'menu_products') {
        const page = data.startsWith('page_') ? parseInt(data.split('_')[1]) : 1;
        await editMessage(chatId, msgId, `در حال دریافت محصولات (صفحه ${page})... ⏳`);
        const res = await fetch(`${wcUrl}/wp-json/wc/v3/products?per_page=10&page=${page}&status=publish`, { headers: wcHeaders });
        const products = await res.json();
        if (!products || products.length === 0) return { statusCode: 200, body: 'OK' };

        let keyboard = [];
        products.forEach(p => { keyboard.push([{ text: `👞 ${p.name}`, callback_data: `prod_${p.id}` }]); });
        let navRow = [];
        if (page > 1) navRow.push({ text: '◀️ قبلی', callback_data: `page_${page - 1}` });
        navRow.push({ text: '▶️ بعدی', callback_data: `page_${page + 1}` });
        keyboard.push(navRow);
        keyboard.push([{ text: '🔙 منوی اصلی', callback_data: `menu_main` }]);
        await editMessage(chatId, msgId, `📦 <b>محصولات فروشگاه</b> (صفحه ${page})`, { inline_keyboard: keyboard });
      }

      else if (data.startsWith('prod_')) {
        const pid = data.split('_')[1];
        await editMessage(chatId, msgId, `در حال دریافت اطلاعات... ⏳`);
        const res = await fetch(`${wcUrl}/wp-json/wc/v3/products/${pid}/variations?per_page=100`, { headers: wcHeaders });
        const variations = await res.json();

        if (!variations || variations.length === 0) {
           let keyboard = [
             [{ text: '📥 ثبت ورودی', callback_data: `act_IN_${pid}_0` }],
             [{ text: '🛍 ثبت فروش حضوری', callback_data: `act_OUT1_${pid}_0` }],
             [{ text: '🌐 ثبت فروش سایت دوم', callback_data: `act_OUT2_${pid}_0` }],
             [{ text: '💵 تغییر قیمت', callback_data: `act_PRICE_${pid}_0` }],
             [{ text: '🔙 بازگشت', callback_data: `page_1` }]
           ];
           await editMessage(chatId, msgId, `⚙️ <b>عملیات مورد نظر را انتخاب کنید:</b>`, { inline_keyboard: keyboard });
        } else {
           const colors = [...new Set(variations.map(v => v.attributes[0]?.option).filter(Boolean))];
           let keyboard = [];
           colors.forEach(color => { keyboard.push([{ text: `🎨 رنگ: ${color}`, callback_data: `color_${pid}_${color}` }]); });
           keyboard.push([{ text: '💵 تغییر قیمت کل متغیرها', callback_data: `act_PRICE_${pid}_0` }]);
           keyboard.push([{ text: '🔙 بازگشت', callback_data: `page_1` }]);
           await editMessage(chatId, msgId, `🎨 <b>رنگ را انتخاب کنید:</b>`, { inline_keyboard: keyboard });
        }
      }

      else if (data.startsWith('color_')) {
        const parts = data.split('_');
        const pid = parts[1];
        const selectedColor = parts.slice(2).join('_');
        await editMessage(chatId, msgId, `در حال دریافت سایزها... ⏳`);
        const res = await fetch(`${wcUrl}/wp-json/wc/v3/products/${pid}/variations?per_page=100`, { headers: wcHeaders });
        const variations = await res.json();
        const colorVariations = variations.filter(v => v.attributes.some(a => a.option === selectedColor));

        let keyboard = [];
        colorVariations.forEach(v => {
          const sizeAttr = v.attributes.find(a => a.option !== selectedColor);
          const sizeName = sizeAttr ? sizeAttr.option : 'بدون سایز';
          const stock = v.manage_stock ? (v.stock_quantity || 0) : 'بدون مدیریت';
          keyboard.push([{ text: `📏 سایز: ${sizeName} | 📦 موجودی: ${stock}`, callback_data: `size_${pid}_${v.id}` }]);
        });
        keyboard.push([{ text: '🔙 رنگ دیگر', callback_data: `prod_${pid}` }]);
        await editMessage(chatId, msgId, `📏 <b>لیست سایزها</b>\nسایز را لمس کنید:`, { inline_keyboard: keyboard });
      }

      else if (data.startsWith('size_')) {
        const [, pid, vid] = data.split('_');
        let keyboard = [
          [{ text: '📥 ثبت ورودی', callback_data: `act_IN_${pid}_${vid}` }],
          [{ text: '🛍 ثبت فروش حضوری', callback_data: `act_OUT1_${pid}_${vid}` }],
          [{ text: '🌐 ثبت فروش سایت دوم', callback_data: `act_OUT2_${pid}_${vid}` }],
          [{ text: '🔙 بازگشت', callback_data: `prod_${pid}` }] 
        ];
        await editMessage(chatId, msgId, `⚙️ <b>نوع عملیات را انتخاب کنید:</b>`, { inline_keyboard: keyboard });
      }

      else if (data.startsWith('cal_') || data.startsWith('act_')) {
        let action, pid, vid, offset;
        if (data.startsWith('act_')) {
          const parts = data.split('_');
          action = parts[1]; pid = parts[2]; vid = parts[3];
          offset = 0;
          if (action === 'PRICE') {
             const body = {
               chat_id: chatId,
               text: `💵 <b>تغییر قیمت:</b> مبلغ جدید به تومان؟\n\n[کد: #${action}_${pid}_${vid}]\n\n⚠️ مبلغ را در پاسخ (Reply) به همین پیام بفرستید.`,
               reply_markup: { force_reply: true, selective: true }
             };
             await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
             return { statusCode: 200, body: 'OK' };
          }
        } else {
          const parts = data.split('_');
          action = parts[1]; pid = parts[2]; vid = parts[3]; offset = parseInt(parts[4]);
        }

        let daysRow = [];
        const now = new Date();
        const startDayOffset = offset * 7;
        
        for (let i = 6; i >= 0; i--) {
          const d = new Date(now.getTime() - ((startDayOffset + i) * 24 * 60 * 60 * 1000));
          const dayStr = new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', day: 'numeric' }).format(d);
          const fullDateStr = new Intl.DateTimeFormat('fa-IR', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).replace(/\//g, '-');
          daysRow.push({ text: dayStr, callback_data: `seld_${action}_${pid}_${vid}_${fullDateStr}` });
        }
        
        let navRow = [];
        navRow.push({ text: '◀️ هفته قبل', callback_data: `cal_${action}_${pid}_${vid}_${offset + 1}` });
        if (offset > 0) navRow.push({ text: 'هفته بعد ▶️', callback_data: `cal_${action}_${pid}_${vid}_${offset - 1}` });
        
        const keyboard = [daysRow, navRow, [{ text: '🔙 لغو و بازگشت', callback_data: `size_${pid}_${vid}` }]];
        
        const actionNames = { 'IN': '📥 ثبت ورودی', 'OUT1': '🛍 فروش حضوری', 'OUT2': '🌐 فروش سایت دوم' };
        const text = `📅 <b>انتخاب تاریخ عملیات:</b>\n\nعملیات: ${actionNames[action]}\nلطفاً تاریخی که این تراکنش انجام شده است را انتخاب کنید:`;
        
        await editMessage(chatId, msgId, text, { inline_keyboard: keyboard });
      }

      else if (data.startsWith('seld_')) {
        const parts = data.split('_');
        const action = parts[1], pid = parts[2], vid = parts[3];
        const selDate = parts.slice(4).join('_');
        
        let actionText = "";
        const formattedDate = selDate.replace(/-/g, '/');
        
        if (action === 'IN') actionText = `📥 <b>ثبت ورودی:</b> تعداد؟\n📅 تاریخ عملیات: ${formattedDate}`;
        else if (action === 'OUT1') actionText = `🛍 <b>فروش حضوری:</b> تعداد؟\n📅 تاریخ عملیات: ${formattedDate}`;
        else if (action === 'OUT2') actionText = `🌐 <b>فروش سایت دوم:</b> تعداد؟\n📅 تاریخ عملیات: ${formattedDate}`;

        const body = {
          chat_id: chatId,
          text: `${actionText}\n\n[کد: #${action}_${pid}_${vid}_${selDate}]\n\n⚠️ عدد موجودی را در پاسخ (Reply) به همین پیام بفرستید.`,
          reply_markup: { force_reply: true, selective: true }
        };
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }

      return { statusCode: 200, body: 'OK' };
    }

    // ==========================================
    // ۲. پردازش پیام‌های متنی
    // ==========================================
    if (update.message && update.message.text) {
      const text = update.message.text;

      if (text === '/start') {
        const keyboard = {
          inline_keyboard: [
            [{ text: '🛍 مدیریت محصولات (موجودی و قیمت)', callback_data: 'menu_products' }],
            [{ text: '📊 نمایش سریع تمام موجودی‌ها', callback_data: 'quick_inventory' }],
            [{ text: '📝 نمایش سوابق (ورودی و فروش)', callback_data: 'view_logs' }]
          ]
        };
        await sendMessage(chatId, 'سلام! به پنل مدیریت الی شوز خوش آمدید.', keyboard);
      }
      
      else if (update.message.reply_to_message && update.message.reply_to_message.text) {
        const repliedText = update.message.reply_to_message.text;
        const enText = text.replace(/[۰-۹]/g, w => '۰۱۲۳۴۵۶۷۸۹'.indexOf(w)).replace(/,/g, '');
        const amount = parseInt(enText);
        
        const match = repliedText.match(/#(IN|OUT1|OUT2|PRICE)_(\d+)_(\d+)(?:_([^\]]+))?/);

        if (match) {
          const [, action, pid, vid, selDateStr] = match;
          if (isNaN(amount) || amount < 0) { await sendMessage(chatId, '❌ عدد نامعتبر.'); return { statusCode: 200, body: 'OK' }; }

          if (action === 'PRICE') {
             await sendMessage(chatId, 'در حال ثبت قیمت... ⏳');
             const resVars = await fetch(`${wcUrl}/wp-json/wc/v3/products/${pid}/variations?per_page=100`, { headers: wcHeaders });
             const varsData = await resVars.json();
             if (!varsData || varsData.length === 0 || varsData.code) {
                 const resPut = await fetch(`${wcUrl}/wp-json/wc/v3/products/${pid}`, { method: 'PUT', headers: wcHeaders, body: JSON.stringify({ regular_price: amount.toString() }) });
                 const updated = await resPut.json();
                 if (updated.id) await sendMessage(chatId, `✅ قیمت تغییر یافت.`);
             } else {
                 fetch(`${wcUrl}/wp-json/wc/v3/products/${pid}`, { method: 'PUT', headers: wcHeaders, body: JSON.stringify({ regular_price: amount.toString() }) }).catch(()=> {});
                 const updatePromises = varsData.map(v => fetch(`${wcUrl}/wp-json/wc/v3/products/${pid}/variations/${v.id}`, { method: 'PUT', headers: wcHeaders, body: JSON.stringify({ regular_price: amount.toString() }) }));
                 await Promise.all(updatePromises);
                 await sendMessage(chatId, `✅ قیمت تمامی سایزها تغییر یافت.`);
             }
             return { statusCode: 200, body: 'OK' };
          }

          await sendMessage(chatId, 'در حال پردازش... ⏳');
          const endpoint = vid === '0' ? `${wcUrl}/wp-json/wc/v3/products/${pid}` : `${wcUrl}/wp-json/wc/v3/products/${pid}/variations/${vid}`;
          const resGet = await fetch(endpoint, { headers: wcHeaders });
          const itemData = await resGet.json();

          let currentStock = itemData.stock_quantity || 0;
          let newStock = currentStock;
          let actName = "";

          if (action === 'IN') { newStock = currentStock + amount; actName = "ثبت ورودی"; } 
          else if (action === 'OUT1') { newStock = currentStock - amount; actName = "فروش حضوری"; } 
          else if (action === 'OUT2') { newStock = currentStock - amount; actName = "فروش سایت دوم"; }

          if (newStock < 0) {
              await sendMessage(chatId, `❌ خطا: موجودی کافی نیست. موجودی فعلی: ${currentStock}`);
              return { statusCode: 200, body: 'OK' };
          }

          const resPut = await fetch(endpoint, { method: 'PUT', headers: wcHeaders, body: JSON.stringify({ manage_stock: true, stock_quantity: newStock }) });
          const updatedData = await resPut.json();

          if (updatedData.id) {
              await sendMessage(chatId, `✅ ثبت شد! موجودی جدید: ${updatedData.stock_quantity}`);
              
              // --- استخراج نام محصول مادر و ثبت لاگ در گوگل شیت ---
              if (sheetUrl) {
                try {
                  const finalDate = selDateStr ? selDateStr.replace(/-/g, '/') : new Date().toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran' });
                  const time = new Date().toLocaleTimeString('fa-IR', { timeZone: 'Asia/Tehran' });
                  
                  let productName = "";
                  
                  // دریافت نام محصول مادر در صورتی که این یک متغیر (Variation) است
                  if (vid !== '0') {
                     const parentRes = await fetch(`${wcUrl}/wp-json/wc/v3/products/${pid}`, { headers: wcHeaders });
                     const parentData = await parentRes.json();
                     productName = parentData.name || `محصول ${pid}`;
                  } else {
                     productName = itemData.name || `محصول ${pid}`;
                  }

                  // چسباندن ویژگی‌ها (رنگ و سایز) به نام محصول مادر
                  if (itemData.attributes && itemData.attributes.length > 0) {
                    const attrs = itemData.attributes.map(a => a.option).join(' - ');
                    productName += ` (${attrs})`;
                  }

                  await fetch(sheetUrl, {
                    method: 'POST',
                    body: JSON.stringify({ date: finalDate, time: time, product: productName, action: actName, amount: amount })
                  });
                } catch (err) { console.error("Sheet Error", err); }
              }
          } else {
              await sendMessage(chatId, '❌ خطا در سایت.');
          }
        }
      }
      
      else if (!update.message.reply_to_message) {
        await sendMessage(chatId, `جستجوی "${text}" ... ⏳`);
        const res = await fetch(`${wcUrl}/wp-json/wc/v3/products?search=${encodeURIComponent(text)}&status=publish`, { headers: wcHeaders });
        const products = await res.json();
        if (!products || products.length === 0) await sendMessage(chatId, 'محصولی پیدا نشد.');
        else {
           let keyboard = [];
           products.forEach(p => { keyboard.push([{ text: `👞 ${p.name}`, callback_data: `prod_${p.id}` }]); });
           await sendMessage(chatId, 'انتخاب کنید:', { inline_keyboard: keyboard });
        }
      }
    }
    return { statusCode: 200, body: 'OK' };
  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, body: 'Error' };
  }
};
