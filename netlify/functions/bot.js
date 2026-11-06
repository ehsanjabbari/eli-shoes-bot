const token = process.env.TELEGRAM_TOKEN;
const wcKey = process.env.WC_KEY;
const wcSecret = process.env.WC_SECRET;
const adminChatId = process.env.ADMIN_CHAT_ID;
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
    // پردازش دکمه‌های شیشه‌ای
    // ==========================================
    if (update.callback_query) {
      const cb = update.callback_query;
      const data = cb.data;
      const msgId = cb.message.message_id;

      fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callback_query_id: cb.id })
      }).catch(() => {});

      // ۱. نمایش سریع کل موجودی به همراه قیمت
      if (data === 'quick_inventory') {
        await editMessage(chatId, msgId, "در حال استخراج همزمان موجودی و قیمت‌ها... ⏳\n(ممکن است چند ثانیه زمان ببرد)");

        const res = await fetch(`${wcUrl}/wp-json/wc/v3/products?per_page=50&status=publish`, { headers: wcHeaders });
        const products = await res.json();

        if (!products || products.length === 0) {
          await editMessage(chatId, msgId, 'محصولی یافت نشد.');
          return { statusCode: 200, body: 'OK' };
        }

        const variableProducts = products.filter(p => p.type === 'variable');
        const variationPromises = variableProducts.map(p => 
          fetch(`${wcUrl}/wp-json/wc/v3/products/${p.id}/variations?per_page=100`, { headers: wcHeaders })
            .then(r => r.json())
            .then(vars => ({ id: p.id, variations: vars }))
        );
        const variationsData = await Promise.all(variationPromises);
        const variationsMap = {};
        variationsData.forEach(item => { variationsMap[item.id] = item.variations; });

        let reportChunks = ["📊 <b>گزارش سریع موجودی انبار الی شوز</b>\n\n"];
        let chunkIndex = 0;

        for (const p of products) {
          let itemText = `👞 <b>${p.name}</b>\n`;
          
          // اضافه کردن قیمت و قیمت ویژه در گزارش
          let regPrice = p.regular_price || p.price;
          if (regPrice) {
            itemText += `💰 قیمت: ${parseInt(regPrice).toLocaleString('fa-IR')} تومان\n`;
            if (p.sale_price) {
              itemText += `🏷 قیمت ویژه: ${parseInt(p.sale_price).toLocaleString('fa-IR')} تومان\n`;
            }
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

            for (const [color, sizes] of Object.entries(grouped)) {
              itemText += `🎨 رنگ ${color}\n👉 ${sizes.join(' | ')}\n`;
            }
            itemText += `\n`;
          }

          if (reportChunks[chunkIndex].length + itemText.length > 3800) {
            chunkIndex++;
            reportChunks[chunkIndex] = "";
          }
          reportChunks[chunkIndex] += itemText;
        }

        await editMessage(chatId, msgId, reportChunks[0], { inline_keyboard: [[{ text: '🔙 بازگشت به منو', callback_data: `menu_main` }]] });
        
        for (let i = 1; i < reportChunks.length; i++) {
          await sendMessage(chatId, reportChunks[i]);
        }
      }

      // بازگشت به منوی اصلی
      else if (data === 'menu_main') {
        const keyboard = {
          inline_keyboard: [
            [{ text: '🛍 مدیریت محصولات (موجودی و قیمت)', callback_data: 'menu_products' }],
            [{ text: '📊 نمایش سریع تمام موجودی‌ها', callback_data: 'quick_inventory' }]
          ]
        };
        await editMessage(chatId, msgId, 'به پنل مدیریت الی شوز خوش آمدید.\nیکی از گزینه‌های زیر را انتخاب کنید:', keyboard);
      }

      // ۲. صفحه‌بندی محصولات
      else if (data.startsWith('page_') || data === 'menu_products') {
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
        keyboard.push([{ text: '🔙 بازگشت به منوی اصلی', callback_data: `menu_main` }]);

        await editMessage(chatId, msgId, `📦 <b>لیست محصولات فروشگاه</b> (صفحه ${page})\nبرای مدیریت روی یک محصول ضربه بزنید:`, { inline_keyboard: keyboard });
      }

      // ۳. استخراج ویژگی‌ها و دکمه قیمت
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
             [{ text: '💵 تغییر قیمت', callback_data: `act_PRICE_${pid}_0` }],
             [{ text: '🔙 بازگشت به لیست محصولات', callback_data: `page_1` }]
           ];
           await editMessage(chatId, msgId, `⚙️ <b>عملیات مورد نظر را انتخاب کنید:</b>`, { inline_keyboard: keyboard });
        } else {
           const colors = [...new Set(variations.map(v => v.attributes[0]?.option).filter(Boolean))];
           let keyboard = [];
           colors.forEach(color => {
             keyboard.push([{ text: `🎨 رنگ: ${color}`, callback_data: `color_${pid}_${color}` }]);
           });
           
           // دکمه تغییر قیمت برای تمام ویژگی‌ها
           keyboard.push([{ text: '💵 تغییر قیمت (تمامی رنگ‌ها و سایزها)', callback_data: `act_PRICE_${pid}_0` }]);
           keyboard.push([{ text: '🔙 بازگشت به لیست محصولات', callback_data: `page_1` }]);

           await editMessage(chatId, msgId, `🎨 <b>برای تغییر موجودی، رنگ را انتخاب کنید:</b>\n(یا با انتخاب دکمه تغییر قیمت، مبلغ کل محصول را آپدیت کنید)`, { inline_keyboard: keyboard });
        }
      }

      // ۴. نمایش سایزها
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

          keyboard.push([{ text: `📏 سایز: ${sizeName} | 📦 موجودی: ${stock}`, callback_data: `size_${pid}_${v.id}` }]);
        });
        keyboard.push([{ text: '🔙 انتخاب رنگ دیگر', callback_data: `prod_${pid}` }]);

        await editMessage(chatId, msgId, `📏 <b>لیست سایزها برای رنگ "${selectedColor}"</b>\n\nبرای ثبت عملیات موجودی، سایز را لمس کنید:`, { inline_keyboard: keyboard });
      }

      // ۵. انتخاب عملیات موجودی برای متغیر
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

      // ۶. آماده‌سازی ریپلای اجباری (موجودی و قیمت)
      else if (data.startsWith('act_')) {
        const [, action, pid, vid] = data.split('_');
        
        let actionText = "";
        let isPrice = false;
        
        if (action === 'IN') actionText = '📥 <b>ثبت ورودی:</b> چه تعدادی به موجودی اضافه شود؟';
        else if (action === 'OUT1') actionText = '🛍 <b>کسر از موجودی:</b> چه تعدادی فروخته شد؟';
        else if (action === 'OUT2') actionText = '🌐 <b>کسر از موجودی:</b> چه تعدادی فروخته شد؟';
        else if (action === 'PRICE') {
           actionText = '💵 <b>تغییر قیمت کل محصول:</b>\nقیمت جدید محصول (به تومان) را ارسال کنید:';
           isPrice = true;
        }

        const body = {
          chat_id: chatId,
          text: `${actionText}\n\n[کد سیستم: #${action}_${pid}_${vid}]\n\n⚠️ لطفاً ${isPrice ? 'مبلغ' : 'تعداد مدنظر'} را فقط به صورت عدد (انگلیسی یا فارسی) در پاسخ به همین پیام بفرستید.`,
          reply_markup: { force_reply: true, selective: true }
        };
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }

      return { statusCode: 200, body: 'OK' };
    }

    // ==========================================
    // پردازش پیام‌های متنی و ریپلای‌ها
    // ==========================================
    if (update.message && update.message.text) {
      const text = update.message.text;

      // دستور استارت
      if (text === '/start') {
        const keyboard = {
          inline_keyboard: [
            [{ text: '🛍 مدیریت محصولات (موجودی و قیمت)', callback_data: 'menu_products' }],
            [{ text: '📊 نمایش سریع تمام موجودی‌ها', callback_data: 'quick_inventory' }]
          ]
        };
        await sendMessage(chatId, 'سلام ادمین عزیز! به پنل مدیریت الی شوز خوش آمدید.\nیکی از گزینه‌های زیر را انتخاب کنید:', keyboard);
      }
      
      // پردازش ورودی عددی (موجودی یا قیمت)
      else if (update.message.reply_to_message && update.message.reply_to_message.text) {
        const repliedText = update.message.reply_to_message.text;
        
        // تبدیل اعداد فارسی به انگلیسی و حذف کاما/ویرگول
        const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
        const enText = text.replace(/[۰-۹]/g, w => persianDigits.indexOf(w)).replace(/,/g, '');
        const amount = parseInt(enText);

        const match = repliedText.match(/#(IN|OUT1|OUT2|PRICE)_(\d+)_(\d+)/);
        if (match) {
          const [, action, pid, vid] = match;

          if (isNaN(amount) || amount < 0) {
            await sendMessage(chatId, '❌ خطا: لطفاً یک عدد معتبر وارد کنید.');
            return { statusCode: 200, body: 'OK' };
          }

          // پردازش تغییر قیمت
          if (action === 'PRICE') {
             await sendMessage(chatId, 'در حال ثبت قیمت جدید در سایت... ⏳\n(ممکن است چند ثانیه زمان ببرد)');
             
             const resVars = await fetch(`${wcUrl}/wp-json/wc/v3/products/${pid}/variations?per_page=100`, { headers: wcHeaders });
             const varsData = await resVars.json();

             if (!varsData || varsData.length === 0 || varsData.code) {
                 // محصول ساده
                 const resPut = await fetch(`${wcUrl}/wp-json/wc/v3/products/${pid}`, {
                     method: 'PUT', headers: wcHeaders,
                     body: JSON.stringify({ regular_price: amount.toString() })
                 });
                 const updated = await resPut.json();
                 if (updated.id) await sendMessage(chatId, `✅ قیمت با موفقیت به ${amount.toLocaleString('fa-IR')} تومان تغییر یافت.`);
                 else await sendMessage(chatId, '❌ خطا در بروزرسانی قیمت.');
             } else {
                 // محصول متغیر: تغییر همزمان قیمت تمام سایزها و رنگ‌ها
                 fetch(`${wcUrl}/wp-json/wc/v3/products/${pid}`, {
                     method: 'PUT', headers: wcHeaders,
                     body: JSON.stringify({ regular_price: amount.toString() })
                 }).catch(()=> {});

                 const updatePromises = varsData.map(v => 
                     fetch(`${wcUrl}/wp-json/wc/v3/products/${pid}/variations/${v.id}`, {
                         method: 'PUT', headers: wcHeaders,
                         body: JSON.stringify({ regular_price: amount.toString() })
                     })
                 );
                 await Promise.all(updatePromises);
                 await sendMessage(chatId, `✅ قیمت تمامی رنگ‌ها و سایزها با موفقیت به ${amount.toLocaleString('fa-IR')} تومان تغییر یافت.`);
             }
             return { statusCode: 200, body: 'OK' };
          }

          // پردازش تغییر موجودی (IN / OUT)
          await sendMessage(chatId, 'در حال محاسبه و ثبت در سایت... ⏳');
          const endpoint = vid === '0' ? `${wcUrl}/wp-json/wc/v3/products/${pid}` : `${wcUrl}/wp-json/wc/v3/products/${pid}/variations/${vid}`;

          const resGet = await fetch(endpoint, { headers: wcHeaders });
          const itemData = await resGet.json();

          let currentStock = itemData.stock_quantity || 0;
          let newStock = currentStock;
          let actName = "";

          if (action === 'IN') { 
              newStock = currentStock + amount; 
              actName = "📥 ثبت ورودی"; 
          } 
          else if (action === 'OUT1') { 
              newStock = currentStock - amount; 
              actName = "🛍 فروش حضوری"; 
          } 
          else if (action === 'OUT2') { 
              newStock = currentStock - amount; 
              actName = "🌐 فروش سایت دوم"; 
          }

          if (newStock < 0) {
              await sendMessage(chatId, `❌ خطا: موجودی کافی نیست!\nشما می‌خواهید ${amount} عدد کسر کنید در حالی که موجودی فعلی فقط ${currentStock} عدد است.`);
              return { statusCode: 200, body: 'OK' };
          }

          const resPut = await fetch(endpoint, { method: 'PUT', headers: wcHeaders, body: JSON.stringify({ manage_stock: true, stock_quantity: newStock }) });
          const updatedData = await resPut.json();

          if (updatedData.id) {
              await sendMessage(chatId, `✅ <b>ثبت موفقیت‌آمیز بود!</b>\n\nعملیات: ${actName}\nتعداد تغییر یافته: ${amount}\n📦 <b>موجودی جدید: ${updatedData.stock_quantity}</b>`);
          } else {
              await sendMessage(chatId, '❌ خطا در ارتباط با سایت.');
          }
        }
      }
      
      // جستجوی متنی محصول
      else if (!update.message.reply_to_message) {
        await sendMessage(chatId, `در حال جستجوی "${text}" ... ⏳`);
        const res = await fetch(`${wcUrl}/wp-json/wc/v3/products?search=${encodeURIComponent(text)}&status=publish`, { headers: wcHeaders });
        const products = await res.json();

        if (!products || products.length === 0) {
           await sendMessage(chatId, 'محصولی پیدا نشد 😔');
        } else {
           let keyboard = [];
           products.forEach(p => { keyboard.push([{ text: `👞 ${p.name}`, callback_data: `prod_${p.id}` }]); });
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
