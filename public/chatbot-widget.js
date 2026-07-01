/**
 * General Barber Shop — Floating Chatbot Widget
 * فقط با <script src="chatbot-widget.js"></script> بعد از api.js اضافه کن
 * یک دکمه شناور پایین صفحه می‌سازه که با /api/chatbot ارتباط می‌گیره
 */
(function () {
  const style = document.createElement('style');
  style.textContent = `
    #gbsChatBtn {
      position: fixed; bottom: 90px; left: 16px; z-index: 400;
      width: 52px; height: 52px; border-radius: 50%;
      background: linear-gradient(135deg, #C9A84C, #8B6914);
      display: flex; align-items: center; justify-content: center;
      font-size: 1.4rem; cursor: pointer; border: none;
      box-shadow: 0 4px 16px rgba(201,168,76,0.4);
    }
    #gbsChatBox {
      position: fixed; bottom: 150px; left: 16px; z-index: 400;
      width: min(320px, calc(100vw - 32px)); height: 420px;
      background: #1A1A1A; border: 1px solid rgba(201,168,76,0.25);
      border-radius: 1.25rem; display: none; flex-direction: column;
      overflow: hidden; box-shadow: 0 12px 40px rgba(0,0,0,0.5);
      font-family: 'Vazirmatn', sans-serif; direction: rtl;
    }
    #gbsChatBox.open { display: flex; }
    #gbsChatHeader {
      background: linear-gradient(135deg, rgba(201,168,76,0.15), transparent);
      padding: 0.875rem 1rem; display: flex; align-items: center; justify-content: space-between;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    #gbsChatHeader div:first-child { font-size: 0.85rem; font-weight: 800; color: #F5F0E8; }
    #gbsChatHeader div:first-child span { color: #C9A84C; font-size: 0.7rem; font-weight: 500; display: block; }
    #gbsChatClose { background: none; border: none; color: #888; font-size: 1rem; cursor: pointer; }
    #gbsChatMessages { flex: 1; overflow-y: auto; padding: 0.875rem; display: flex; flex-direction: column; gap: 0.625rem; }
    .gbs-msg { max-width: 82%; padding: 0.6rem 0.85rem; border-radius: 1rem; font-size: 0.8rem; line-height: 1.6; }
    .gbs-msg.bot { background: #222; color: #BBB; align-self: flex-start; border-bottom-right-radius: 0.3rem; }
    .gbs-msg.user { background: linear-gradient(135deg, #C9A84C, #8B6914); color: #0A0A0A; align-self: flex-end; font-weight: 600; border-bottom-left-radius: 0.3rem; }
    #gbsChatSuggestions { display: flex; flex-wrap: wrap; gap: 0.4rem; padding: 0 0.875rem 0.625rem; }
    .gbs-chip { background: #222; border: 1px solid rgba(255,255,255,0.08); color: #BBB; font-size: 0.68rem; padding: 0.3rem 0.7rem; border-radius: 2rem; cursor: pointer; }
    .gbs-chip:hover { border-color: rgba(201,168,76,0.3); color: #C9A84C; }
    #gbsChatInputRow { display: flex; gap: 0.5rem; padding: 0.75rem; border-top: 1px solid rgba(255,255,255,0.06); }
    #gbsChatInput { flex: 1; background: #222; border: 1px solid rgba(255,255,255,0.08); border-radius: 0.75rem; padding: 0.6rem 0.75rem; color: #F5F0E8; font-family: 'Vazirmatn', sans-serif; font-size: 0.8rem; outline: none; }
    #gbsChatSend { background: linear-gradient(135deg, #C9A84C, #8B6914); border: none; border-radius: 0.75rem; padding: 0 0.9rem; cursor: pointer; font-size: 0.9rem; }
  `;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.id = 'gbsChatBtn';
  btn.innerHTML = '💬';
  btn.title = 'پشتیبانی آنلاین';

  const box = document.createElement('div');
  box.id = 'gbsChatBox';
  box.innerHTML = `
    <div id="gbsChatHeader">
      <div>پشتیبانی General Barber<span>معمولاً سریع جواب می‌ده</span></div>
      <button id="gbsChatClose">✕</button>
    </div>
    <div id="gbsChatMessages"></div>
    <div id="gbsChatSuggestions"></div>
    <div id="gbsChatInputRow">
      <input id="gbsChatInput" placeholder="پیامت رو بنویس..." />
      <button id="gbsChatSend">➤</button>
    </div>`;

  document.body.appendChild(btn);
  document.body.appendChild(box);

  function addMsg(text, who) {
    const m = document.createElement('div');
    m.className = 'gbs-msg ' + who;
    m.textContent = text;
    document.getElementById('gbsChatMessages').appendChild(m);
    document.getElementById('gbsChatMessages').scrollTop = 999999;
  }

  async function sendMessage(text) {
    if (!text.trim()) return;
    addMsg(text, 'user');
    document.getElementById('gbsChatInput').value = '';
    try {
      const res = await BarberAPI.chatbot.send(text);
      addMsg(res.reply, 'bot');
    } catch (e) {
      addMsg('اتصال برقرار نشد. لطفاً بعداً امتحان کن یا مستقیم تماس بگیر.', 'bot');
    }
  }

  btn.addEventListener('click', async () => {
    const wasOpen = box.classList.contains('open');
    box.classList.toggle('open');
    if (!wasOpen && !document.getElementById('gbsChatMessages').children.length) {
      addMsg('سلام! من دستیار General Barber Shop هستم 👋 چطور می‌تونم کمکت کنم؟', 'bot');
      try {
        const sugg = await BarberAPI.chatbot.suggestions();
        const wrap = document.getElementById('gbsChatSuggestions');
        wrap.innerHTML = (sugg.data || []).map(s => `<span class="gbs-chip">${s}</span>`).join('');
        wrap.querySelectorAll('.gbs-chip').forEach(chip => {
          chip.addEventListener('click', () => sendMessage(chip.textContent));
        });
      } catch (e) {}
    }
  });

  document.getElementById('gbsChatClose')?.addEventListener('click', () => box.classList.remove('open'));
  document.getElementById('gbsChatSend')?.addEventListener('click', () => sendMessage(document.getElementById('gbsChatInput').value));
  document.getElementById('gbsChatInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMessage(e.target.value);
  });
})();
