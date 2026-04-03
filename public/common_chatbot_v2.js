/* ============================================================
   common_chatbot_v2.js
   パステルデザイン統合版 — CSV優先 + GPTフォールバック
   既存の common_chatbot.js には一切影響しません

   【WordPressへの埋め込み方】
   各クリニックページのカスタムHTMLブロック or functions.phpに：

   <script>
     window.cbv2 = {
       clinicId:   'sakura',
       clinicName: 'さくら歯科 AIアシスタント',
       avatar:     '🦷',
       apiUrl:     'https://chatbot-log.vercel.app/api/chat',
       quickReplies: [
         '📅 予約したい',
         '💰 費用・保険について',
         '🦷 インプラントについて',
         '✨ インビザラインについて',
         '🕐 診療時間を教えて',
       ],
       imageMap: {
         implant:    [{ src: '/wp-content/uploads/implant_01.jpg', label: 'インプラント 症例①' }],
         invisalign: [{ src: '/wp-content/uploads/invisalign_01.jpg', label: 'インビザライン 症例①' }],
         wire:       [{ src: '/wp-content/uploads/wire_01.jpg', label: 'ワイヤー矯正 症例①' }],
         whitening:  [{ src: '/wp-content/uploads/whitening_01.jpg', label: 'ホワイトニング 症例①' }],
         pediatric:  [{ src: '/wp-content/uploads/pediatric_01.jpg', label: '小児歯科 症例①' }],
       },
     };
   </script>
   <script src="https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js"></script>
   <script src="/wp-content/themes/your-theme/js/common_chatbot_v2.js"></script>

   ============================================================ */

(function () {
  'use strict';

  /* ── 設定（window.cbv2 で上書き可能） ── */
  const CFG = Object.assign({
    clinicId:     'sakura',
    clinicName:   'AIアシスタント',
    avatar:       '🦷',
    apiUrl:       'https://chatbot-log.vercel.app/api/chat',
    quickReplies: ['📅 予約したい', '💰 費用・保険について', '🦷 インプラントについて', '✨ インビザラインについて', '🕐 診療時間を教えて', '😟 急に痛くなった'],
    imageMap:     {},
  }, window.cbv2 || {});

  /* ── CSVマップ（clinicId → スプシURL） ── */
  const CSV_MAP = {
    sakura:   'https://docs.google.com/spreadsheets/d/e/2PACX-1vSWWySztmS_AirKrF1kIzQ2mMbl8P1NCZxHr-whzOiZDYknLVtwqSqGqG3-H8StH-xrbdJH5BtWITjD/pub?output=csv',
    tamagawa: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTL4usoNjCFVHif7T1x-SSgnRpCHMNQPBqQhd6i0SzhAO-gPndJ0RDM2Qi-_Adlcy89tf05KrIlRHvi/pub?output=csv',
    masahisa: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTrwiGX6v3_OBcD11_BQ5yB9DCb2s56BalcCVYzC2NIO_-7ACZSIVja9dX4glN3PCrEyrSclr7dRlou/pub?output=csv',
    uruma:    'https://docs.google.com/spreadsheets/d/e/2PACX-1vSUAp5ellq1xcvxCpVsJUSt4Jdq_H0fwkQX56QbjQQywHIeaKvmxjxp764DU5ARaIFZEvRtxlBUNcld/pub?output=csv',
    oiki:     'https://docs.google.com/spreadsheets/d/e/2PACX-1vRi0rZCbfj5PR6-X_neuPzyF4_JSDNhAKnBCizQD9K_NU5OTk9O7Jh4SSIS0mJH3XWa3eayOhtzx8_5/pub?output=csv',
    yasuda:   'https://docs.google.com/spreadsheets/d/e/2PACX-1vSuT3Y1RFs5GcP5UgvPRafr2BNao9Fy8thfUUUzg-Kh7NVc2UqdrZD2MBIJKi2kQtokCFfeuOBMrgnj/pub?output=csv',
  };

  /* ── 状態 ── */
  let knowledgeBase = [];
  let isOpen        = false;
  let isComposing   = false;
  let isSending     = false;

  /* ============================================================
     CSS インジェクション
  ============================================================ */
  const CSS = `
    @import url('https://fonts.googleapis.com/css2?family=Klee+One:wght@400;600&family=M+PLUS+Rounded+1c:wght@300;400;500&display=swap');

    #cbv2-launcher {
      position: fixed; bottom: 28px; right: 28px;
      width: 64px; height: 64px;
      background: linear-gradient(135deg,#f9b4b4,#f4a8c8);
      border-radius: 50%; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 6px 24px rgba(244,168,200,.5);
      transition: transform .25s, box-shadow .25s;
      z-index: 99998; font-size: 28px;
      font-family: 'M PLUS Rounded 1c', sans-serif;
    }
    #cbv2-launcher:hover { transform: scale(1.09); }
    #cbv2-launcher::after {
      content: ''; position: absolute; inset: -4px; border-radius: 50%;
      background: linear-gradient(135deg,#f9b4b4,#f4a8c8);
      opacity: .35; animation: cbv2-pulse 2.6s ease-out infinite; z-index: -1;
    }
    @keyframes cbv2-pulse { 0%{transform:scale(1);opacity:.35} 100%{transform:scale(1.6);opacity:0} }

    #cbv2-window {
      position: fixed; bottom: 106px; right: 28px;
      width: min(455px, calc(100vw - 40px));
      height: min(600px, calc(100vh - 150px));
      background: #fff; border-radius: 22px;
      box-shadow: 0 12px 40px rgba(224,122,122,.15), 0 3px 10px rgba(58,46,46,.07);
      display: flex; flex-direction: column; overflow: hidden;
      z-index: 99998;
      opacity: 0; transform: translateY(20px) scale(.96); pointer-events: none;
      transition: opacity .35s cubic-bezier(.34,1.3,.64,1), transform .35s cubic-bezier(.34,1.3,.64,1);
      font-family: 'M PLUS Rounded 1c', sans-serif;
    }
    #cbv2-window.cbv2-open { opacity: 1; transform: none; pointer-events: all; }

    #cbv2-header {
      background: linear-gradient(120deg,#fcd5d5,#fde8f4,#e8d8f8);
      padding: 5px 10px 5px;
      display: flex; align-items: center; gap: 12px; flex-shrink: 0;
      border-bottom: 1px solid rgba(244,168,168,.25);
    }
    #cbv2-header-avatar {
      width: 44px; height: 44px; background: #fff; border-radius: 50%;
      display: flex; align-items: center; justify-content: center; font-size: 22px;
      box-shadow: 0 2px 10px rgba(224,122,122,.18); flex-shrink: 0;
    }
    #cbv2-header-name { font-family: 'Klee One', cursive; font-size: 14px; font-weight: 600; color: #3a2e2e; }
    #cbv2-header-sub  { font-size: 11px; color: #6b5555; font-weight: 300; margin-top: 2px; display: flex; align-items: center; gap: 5px; }
    .cbv2-status-dot  { width: 7px; height: 7px; background: #f9a8a8; border-radius: 50%; animation: cbv2-blink 2.2s ease-in-out infinite; }
    @keyframes cbv2-blink { 0%,100%{opacity:1} 50%{opacity:.3} }

    #cbv2-messages {
      flex: 1; overflow-y: auto; padding: 16px 14px 8px;
      display: flex; flex-direction: column; gap: 12px; scroll-behavior: smooth;
      background: linear-gradient(180deg,#fffaf9,#fff);
    }
    #cbv2-messages::-webkit-scrollbar { width: 4px; }
    #cbv2-messages::-webkit-scrollbar-thumb { background: #fcd5d5; border-radius: 4px; }

    .cbv2-date { text-align: center; font-size: 10.5px; color: #c0a8a8; font-weight: 300; }
    .cbv2-date::before, .cbv2-date::after { content: '✿'; margin: 0 8px; opacity: .5; }

    .cbv2-msg { display: flex; gap: 8px; align-items: flex-end; }
    .cbv2-msg.cbv2-user { flex-direction: row-reverse; }
    .cbv2-avatar {
      width: 34px; height: 34px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 16px; flex-shrink: 0;
      box-shadow: 0 1px 6px rgba(224,122,122,.12);
    }
    .cbv2-msg.cbv2-bot  .cbv2-avatar { background: #fde0e0; }
    .cbv2-msg.cbv2-user .cbv2-avatar { background: #ede8f8; }
    .cbv2-content { display: flex; flex-direction: column; max-width: 82%; }
    .cbv2-msg.cbv2-user .cbv2-content { align-items: flex-end; }
    .cbv2-name { font-size: 10px; color: #c0a0a0; font-weight: 300; margin-bottom: 3px; padding-left: 2px; }
    .cbv2-msg.cbv2-user .cbv2-name { padding-right: 2px; color: #a0a0c0; }
    .cbv2-bubble {
      padding: 10px 14px; border-radius: 16px;
      font-size: 13.5px; line-height: 1.7; color: #3a2e2e;
      word-break: break-word;
    }
    .cbv2-msg.cbv2-bot  .cbv2-bubble {
      background: #fff; border: 1.5px solid #fcd5d5;
      border-bottom-left-radius: 4px; box-shadow: 0 2px 8px rgba(224,122,122,.08);
    }
    .cbv2-msg.cbv2-user .cbv2-bubble {
      background: linear-gradient(135deg,#fcd5d5,#f4c0d8);
      border-bottom-right-radius: 4px; color: #5a2e3e;
      box-shadow: 0 2px 8px rgba(224,122,122,.18);
    }
    .cbv2-time { font-size: 10px; color: #d0b8b8; font-weight: 300; margin-top: 4px; padding: 0 2px; }

    /* bubble内スタイル */
    .cbv2-bubble b, .cbv2-bubble strong { font-weight: 500; color: #b05060; }
    .cbv2-msg.cbv2-user .cbv2-bubble b { color: #ffe0e8; }
    .cbv2-bubble a { color: #e07a7a; word-break: break-all; }
    .cbv2-bubble ul { margin: 6px 0 6px 16px; }
    .cbv2-bubble ul li { margin-bottom: 4px; font-size: 13px; line-height: 1.55; }
    .cbv2-bubble p { margin-bottom: 6px; }
    .cbv2-bubble p:last-child { margin-bottom: 0; }
    .cbv2-bubble hr { border: none; border-top: 1px dashed #f4c0c8; margin: 10px 0; }
    .cbv2-bubble .r-note { background: #fef4e8; border-left: 3px solid #f4b890; padding: 6px 10px; margin-top: 8px; border-radius: 0 8px 8px 0; font-size: 12px; color: #8a5a3a; line-height: 1.55; }

    /* 症例画像 */
    .cbv2-images { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .cbv2-img-wrap {
      flex: 1; min-width: 110px; max-width: 160px;
      border-radius: 10px; overflow: hidden;
      border: 1.5px solid #fcd5d5;
      box-shadow: 0 2px 8px rgba(224,122,122,.12);
      cursor: pointer; transition: transform .2s, box-shadow .2s; background: #fde8e8;
    }
    .cbv2-img-wrap:hover { transform: scale(1.03); box-shadow: 0 4px 16px rgba(224,122,122,.25); }
    .cbv2-img-wrap img { width: 100%; height: 90px; object-fit: cover; display: block; }
    .cbv2-img-label { font-size: 10px; color: #6b5555; font-weight: 300; padding: 4px 6px; background: #fffaf9; text-align: center; }

    /* ライトボックス */
    #cbv2-lightbox {
      position: fixed; inset: 0; background: rgba(58,46,46,.75);
      display: flex; align-items: center; justify-content: center;
      z-index: 100000; opacity: 0; pointer-events: none; transition: opacity .3s;
    }
    #cbv2-lightbox.cbv2-open { opacity: 1; pointer-events: all; }
    #cbv2-lightbox img { max-width: 90vw; max-height: 80vh; border-radius: 12px; }
    #cbv2-lb-close { position: absolute; top: 20px; right: 20px; background: rgba(255,255,255,.2); border: none; color: #fff; font-size: 22px; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; }

    /* タイピング */
    #cbv2-typing { display: flex; gap: 8px; align-items: flex-end; overflow: hidden; max-height: 0; opacity: 0; transition: max-height .4s, opacity .3s; }
    #cbv2-typing.cbv2-show { max-height: 60px; opacity: 1; }
    .cbv2-typing-bubble { background: #fff; border: 1.5px solid #fcd5d5; border-radius: 16px 16px 16px 4px; padding: 12px 16px; display: flex; align-items: center; gap: 6px; }
    .cbv2-dot { width: 7px; height: 7px; border-radius: 50%; background: #f4a8a8; animation: cbv2-bounce .9s ease-in-out infinite; }
    .cbv2-dot:nth-child(2) { animation-delay: .2s; background: #f4b8d0; }
    .cbv2-dot:nth-child(3) { animation-delay: .4s; background: #c8b8f0; }
    @keyframes cbv2-bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-7px)} }

    /* クイックリプライ */
    #cbv2-quick { padding: 8px 14px 6px; flex-shrink: 0; }
    .cbv2-quick-label { font-size: 10.5px; color: #c0a8a8; font-weight: 300; margin-bottom: 6px; }
    .cbv2-quick-label::before { content: '✿ '; }
    #cbv2-quick-list { display: flex; flex-wrap: wrap; gap: 7px; }
    .cbv2-qbtn {
      background: #fff; border: 1.5px solid #fcd5d5; color: #e07a7a;
      font-family: 'M PLUS Rounded 1c', sans-serif;
      font-size: 12px; padding: 6px 13px; border-radius: 20px; cursor: pointer;
      transition: background .22s, transform .15s;
    }
    .cbv2-qbtn:hover { background: linear-gradient(135deg,#fcd5d5,#f4c0d8); color: #5a2e3e; transform: translateY(-2px); border-color: transparent; }

    /* 入力エリア */
    #cbv2-input-area { padding: 10px 14px 12px; border-top: 1px solid #f0e8e8; display: flex; align-items: flex-end; gap: 10px; flex-shrink: 0; background: #fff; }
    #cbv2-input {
      flex: 1; min-height: 40px; max-height: 100px; padding: 10px 14px;
      border: 1.5px solid #fcd5d5; border-radius: 16px;
      font-family: 'M PLUS Rounded 1c', sans-serif; font-size: 13px; color: #3a2e2e;
      background: #fffaf9; resize: none; outline: none;
      transition: border-color .2s; line-height: 1.5;
    }
    #cbv2-input:focus { border-color: #f4a8a8; background: #fff; }
    #cbv2-input::placeholder { color: #d0b8b8; }
    #cbv2-send {
      width: 42px; height: 42px;
      background: linear-gradient(135deg,#f9b4b4,#f4a8c8);
      border: none; border-radius: 50%; cursor: pointer;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      box-shadow: 0 3px 10px rgba(244,168,200,.4); transition: transform .15s;
    }
    #cbv2-send:hover { transform: scale(1.06); }
    #cbv2-send:disabled { opacity: .5; cursor: default; transform: none; }
    #cbv2-send svg { width: 18px; height: 18px; fill: #fff; }

    #cbv2-footer { text-align: center; font-size: 10px; color: #d0b8b8; padding: 0 14px 10px; font-weight: 300; }

    @media (max-width: 480px) {
    #cbv2-window  { right: 14px; bottom: 94px; width: 90%;}
    #cbv2-launcher { right: 27px;bottom: 78px; }
    #cbv2-footer { padding: 0 0 10px;}
    #cbv2-input {min-height: 30px;max-height: 100px;padding: 5px 14px;}
    #cbv2-send {width: 35px;height: 35px;}
    .cbv2-qbtn {font-size: 10px;}
    #cbv2-quick-list{gap:5px;}
    }
  `;

  /* ============================================================
     HTML インジェクション
  ============================================================ */
  function buildHTML() {
    const el = document.createElement('div');
    el.id = 'cbv2-root';
    el.innerHTML = `
      <!-- ライトボックス -->
      <div id="cbv2-lightbox">
        <button id="cbv2-lb-close">✕</button>
        <img id="cbv2-lb-img" src="" alt="">
      </div>

      <!-- ランチャーボタン -->
      <button id="cbv2-launcher" aria-label="チャットを開く">${CFG.avatar}</button>

      <!-- チャットウィンドウ -->
      <div id="cbv2-window">
        <div id="cbv2-header">
          <div id="cbv2-header-avatar">${CFG.avatar}</div>
          <div>
            <div id="cbv2-header-name">${CFG.clinicName}</div>
            <div id="cbv2-header-sub">
              <span class="cbv2-status-dot"></span>いつでもご質問どうぞ♪
            </div>
          </div>
        </div>

        <div id="cbv2-messages">
          <div class="cbv2-date">今日</div>
          <div class="cbv2-msg cbv2-bot" id="cbv2-welcome">
            <div class="cbv2-avatar">${CFG.avatar}</div>
            <div class="cbv2-content">
              <div class="cbv2-name">AIアシスタント</div>
              <div class="cbv2-bubble">
                こんにちは！${CFG.clinicName}です🌸<br>
                診療・ご予約・費用など、お気軽にご質問ください😊
              </div>
              <div class="cbv2-time" id="cbv2-welcome-time"></div>
            </div>
          </div>
          <div id="cbv2-typing">
            <div class="cbv2-avatar" style="background:#fde0e0">${CFG.avatar}</div>
            <div class="cbv2-typing-bubble">
              <span class="cbv2-dot"></span>
              <span class="cbv2-dot"></span>
              <span class="cbv2-dot"></span>
            </div>
          </div>
        </div>

        <div id="cbv2-quick">
          <div class="cbv2-quick-label">よくある質問</div>
          <div id="cbv2-quick-list"></div>
        </div>

        <div id="cbv2-input-area">
          <textarea id="cbv2-input" placeholder="メッセージを入力…" rows="1"></textarea>
          <button id="cbv2-send" aria-label="送信">
            <svg viewBox="0 0 24 24"><path d="M22 2L11 13M22 2L15 22 11 13 2 9l20-7z"/></svg>
          </button>
        </div>
        <div id="cbv2-footer">AIが回答しています。詳細はクリニックへ直接お問い合わせください。</div>
      </div>
    `;
    document.body.appendChild(el);

    // CSS注入
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  /* ============================================================
     ユーティリティ
  ============================================================ */
  function ts() {
    return new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  }

  function normalize(str) {
    return (str || '').toLowerCase().trim().replace(/\u3000/g, ' ').replace(/\s+/g, ' ');
  }

  function scrollBottom() {
    const m = document.getElementById('cbv2-messages');
    if (m) m.scrollTop = m.scrollHeight;
  }

  function setTyping(on) {
    document.getElementById('cbv2-typing').classList.toggle('cbv2-show', on);
    scrollBottom();
  }

  /* ============================================================
     メッセージ追加
  ============================================================ */
  function addMsg(html, role, imageKeys = []) {
    const typing = document.getElementById('cbv2-typing');
    const parent = typing.parentNode;
    const isBot  = role === 'bot';

    // 症例画像
    let imagesHTML = '';
    if (isBot && imageKeys.length > 0) {
      const imgs = imageKeys.flatMap(k => (CFG.imageMap[k] || []));
      if (imgs.length > 0) {
        imagesHTML = '<div class="cbv2-images">' +
          imgs.map(img =>
            `<div class="cbv2-img-wrap" data-src="${img.src}">
              <img src="${img.src}" alt="${img.label}" loading="lazy">
              <div class="cbv2-img-label">${img.label}</div>
            </div>`
          ).join('') + '</div>';
      }
    }

    const div = document.createElement('div');
    div.className = `cbv2-msg ${isBot ? 'cbv2-bot' : 'cbv2-user'}`;
    div.innerHTML = `
      <div class="cbv2-avatar" style="background:${isBot ? '#fde0e0' : '#ede8f8'}">${isBot ? CFG.avatar : '😊'}</div>
      <div class="cbv2-content" ${isBot ? '' : 'style="align-items:flex-end"'}>
        <div class="cbv2-name">${isBot ? 'AIアシスタント' : 'あなた'}</div>
        <div class="cbv2-bubble">${html}${imagesHTML}</div>
        <div class="cbv2-time">${ts()}</div>
      </div>`;

    // 画像クリック → ライトボックス
    div.querySelectorAll('.cbv2-img-wrap').forEach(wrap => {
      wrap.addEventListener('click', () => openLightbox(wrap.dataset.src));
    });

    parent.insertBefore(div, typing);
    scrollBottom();
  }

  /* ============================================================
     症例キーワード自動検出
  ============================================================ */
  function detectImageKeys(text) {
    const map = [
      { key: 'implant',    words: ['インプラント'] },
      { key: 'invisalign', words: ['インビザライン', 'マウスピース矯正'] },
      { key: 'wire',       words: ['ワイヤー矯正'] },
      { key: 'whitening',  words: ['ホワイトニング'] },
      { key: 'pediatric',  words: ['小児歯科', '子ども', 'こども', '子供'] },
    ];
    return map.filter(m => m.words.some(w => text.includes(w))).map(m => m.key);
  }

  /* ============================================================
     送信処理（スプシ優先 → GPTフォールバック）
  ============================================================ */
  async function sendMessage() {
    if (isSending) return;
    const input = document.getElementById('cbv2-input');
    const text  = input.value.trim();
    if (!text) return;

    addMsg(text.replace(/\n/g, '<br>'), 'user');
    input.value = ''; input.style.height = '';
    isSending = true;
    document.getElementById('cbv2-send').disabled = true;
    setTyping(true);

    // ① スプシのキーワードマッチを確認
    const normalizedText = normalize(text);
    const matched = knowledgeBase.find(item => {
      return normalize(item.keyword).split(' ').every(w => normalizedText.includes(w));
    });

    try {
      if (matched) {
        // スプシの回答を使用
        await new Promise(r => setTimeout(r, 600)); // 自然な待機
        setTyping(false);
        const html = String(matched.answer).replace(/""/g, '"').replace(/\r\n?/g, '\n').replace(/\n/g, '<br>');
        const imageKeys = detectImageKeys(html);
        addMsg(html, 'bot', imageKeys);
      } else {
        // GPT（Vercel）にフォールバック
        const res  = await fetch(CFG.apiUrl, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ message: text, clinicId: CFG.clinicId }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setTyping(false);
        const html = data.reply || 'うまく回答できませんでした。';
        const imageKeys = detectImageKeys(html);
        addMsg(html, 'bot', imageKeys);
      }
    } catch (e) {
      setTyping(false);
      addMsg(`<div class="r-note" style="border-color:#f4a0a0;background:#fff0f0;">⚠️ 通信エラーが発生しました。<br><small>${e.message}</small></div>`, 'bot');
    } finally {
      isSending = false;
      document.getElementById('cbv2-send').disabled = false;
    }
  }

  /* ============================================================
     ライトボックス
  ============================================================ */
  function openLightbox(src) {
    document.getElementById('cbv2-lb-img').src = src;
    document.getElementById('cbv2-lightbox').classList.add('cbv2-open');
  }
  function closeLightbox() {
    document.getElementById('cbv2-lightbox').classList.remove('cbv2-open');
  }

  /* ============================================================
     開閉
  ============================================================ */
  function toggleChat() {
    isOpen = !isOpen;
    document.getElementById('cbv2-window').classList.toggle('cbv2-open', isOpen);
    document.getElementById('cbv2-launcher').textContent = isOpen ? '✕' : CFG.avatar;
    if (isOpen) setTimeout(() => document.getElementById('cbv2-input').focus(), 350);
  }

  /* ============================================================
     クイックリプライ生成
  ============================================================ */
  function buildQuickReplies() {
    const list = document.getElementById('cbv2-quick-list');
    CFG.quickReplies.forEach(label => {
      const btn = document.createElement('button');
      btn.className   = 'cbv2-qbtn';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        document.getElementById('cbv2-input').value = label;
        sendMessage();
      });
      list.appendChild(btn);
    });
  }

  /* ============================================================
     CSV読み込み
  ============================================================ */
  function loadCSV() {
    const csvUrl = CSV_MAP[CFG.clinicId];
    if (!csvUrl || typeof Papa === 'undefined') return;

    Papa.parse(csvUrl, {
      download:        true,
      header:          true,
      skipEmptyLines:  true,
      transformHeader: h => h.replace(/\r/g, '').trim(),
      complete(results) {
        results.data.forEach(row => {
          const keyword = (row['キーワード'] || '').replace(/\r/g, '').trim();
          const answer  = (row['回答内容']   || '').replace(/\r/g, '').trim();
          if (!keyword || !answer) return;
          keyword.split('|').map(k => k.trim()).forEach(k => {
            if (k) knowledgeBase.push({ keyword: k, answer });
          });
        });
        console.log(`✅ [cbv2] ${CFG.clinicId} knowledgeBase: ${knowledgeBase.length}件`);
      },
    });
  }

  /* ============================================================
     初期化
  ============================================================ */
  function init() {
    buildHTML();

    document.getElementById('cbv2-welcome-time').textContent = ts();
    buildQuickReplies();
    loadCSV();

    // イベント
    document.getElementById('cbv2-launcher').addEventListener('click', toggleChat);
    document.getElementById('cbv2-send').addEventListener('click', sendMessage);
    document.getElementById('cbv2-lb-close').addEventListener('click', closeLightbox);
    document.getElementById('cbv2-lightbox').addEventListener('click', function(e) {
      if (e.target === this) closeLightbox();
    });

    const input = document.getElementById('cbv2-input');
    input.addEventListener('compositionstart', () => { isComposing = true; });
    input.addEventListener('compositionend',   () => { isComposing = false; });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !isComposing) {
        e.preventDefault();
        sendMessage();
      }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
