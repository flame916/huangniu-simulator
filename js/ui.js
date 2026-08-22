(function (global) {
  const D = (typeof require !== 'undefined') ? require('./data.js') : global.GameData;
  const G = (typeof require !== 'undefined') ? require('./game.js') : global.GameEngine;
  const app = { el: null, screen: 'title', run: null, g: null };

  function $(sel) { return app.el.querySelector(sel); }

  function loadOrCreateGlobal() {
    let g = G.loadGlobal();
    if (!g) {
      g = { version: 1, runCount: 0, endingsSeen: [], achievements: [], skinsOwned: [], reverseUnlocked: false };
      G.saveGlobal(g);
    }
    return g;
  }

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function chapterName(ch) {
    const map = {
      prologue: '序章 · 韭菜的觉醒',
      ch1: '第一章 · 山城老灶的VIP包间',
      ch2: '第二章 · 泡泡玛特与隐藏款',
      chunyun: '春运特别篇 · 回家过年的票',
      ch3: '第三章 · 顶流演唱会与100%必中',
      ch4: '第四章 · 万物之巅 · 系统真相',
    };
    return map[ch] || ch;
  }

  function currentSkin() {
    const id = app.run && app.run.skins.length ? app.run.skins[app.run.skins.length - 1] : 'gold';
    return D.SKINS.find(s => s.id === id) || D.SKINS[0];
  }

  function applySkin() {
    const skin = currentSkin();
    const r = document.documentElement.style;
    r.setProperty('--bg', skin.theme.bg);
    r.setProperty('--card', skin.theme.card);
    r.setProperty('--accent', skin.theme.accent);
    r.setProperty('--text', skin.theme.text);
  }

  function unlockRunSkin(id) {
    if (app.run && !app.run.skins.includes(id)) {
      app.run.skins.push(id);
      G.saveRun(app.run);
    }
  }

  function syncSkins() {
    if (!app.run) return;
    for (const s of D.SKINS) {
      if (s.unlockAt === 'chapter' && s.chapter === app.run.chapter) unlockRunSkin(s.id);
    }
  }

  function randSystemLine() {
    return D.SYSTEM_LINES[Math.floor(Math.random() * D.SYSTEM_LINES.length)];
  }
  function randAd() {
    return D.ADS[Math.floor(Math.random() * D.ADS.length)];
  }
  function isAdFree() {
    return !!(app.g && app.g.achievements.includes('father_love'));
  }

  function showToast(text, ms) {
    const t = el('div', 'toast', text);
    app.el.appendChild(t);
    setTimeout(() => t.remove(), ms || 1800);
  }

  function showBroadcast(text) {
    const b = el('div', 'broadcast', '📢 ' + text);
    app.el.appendChild(b);
    setTimeout(() => b.remove(), 3000);
  }

  function unlockAchievement(aid) {
    if (app.g.achievements.includes(aid)) return;
    app.g.achievements.push(aid);
    G.saveGlobal(app.g);
    const a = D.ACHIEVEMENTS.find(x => x.id === aid);
    if (a) showToast('🏆 成就解锁：' + a.name);
  }

  function renderSchool() {
    app.el.innerHTML = '';
    const wrap = el('div', 'school-screen');
    wrap.appendChild(el('h2', 'screen-h', '选择你的流派'));
    wrap.appendChild(el('p', 'title-sub', '系统：老父亲按您的天赋，定制了抢购圣手方案——'));
    const diffRow = el('div', 'refresh-row diff-row');
    diffRow.appendChild(el('span', 'buff-label', '难度：'));
    let chosenDiff = app._diff || 'normal';
    const diffBtns = [];
    for (const [id, label] of [['casual', '🌤️ 休闲'], ['normal', '⚔️ 标准'], ['hell', '🔥 真实地狱']]) {
      const b = el('button', 'btn btn-sm diff-btn' + (chosenDiff === id ? ' picked' : ''), label);
      b.onclick = () => {
        chosenDiff = id;
        app._diff = id;
        diffBtns.forEach(x => x.classList.remove('picked'));
        b.classList.add('picked');
      };
      diffBtns.push(b);
      diffRow.appendChild(b);
    }
    wrap.appendChild(diffRow);
    for (const s of D.SCHOOLS) {
      const c = el('button', 'btn school-card',
        `<b>${s.name}</b><br><span class="hire-desc">${s.desc}</span><br><span class="school-tag">适合：${s.tag}</span>`);
      c.onclick = () => {
        app.run = G.newRun(app.g, s.id, chosenDiff);
        app.screen = 'game';
        G.saveRun(app.run);
        render();
      };
      wrap.appendChild(c);
    }
    const back = el('button', 'btn btn-sm', '返回');
    back.onclick = () => { app.screen = 'title'; render(); };
    wrap.appendChild(back);
    app.el.appendChild(wrap);
  }

  function startEndless() {
    app.g = loadOrCreateGlobal();
    app.run = G.createRun();
    app.run.endless = true;
    app.run.risk = 60;
    app.run.school = null;
    app.wave = null;
    app.screen = 'endless';
    G.saveRun(app.run);
    render();
  }

  function renderEndless() {
    app.el.innerHTML = '';
    const run = app.run;
    const wrap = el('div', 'game-wrap');
    wrap.appendChild(el('div', 'chapter-banner', `♾️ 无尽试炼 · 风控永久高压`));
    const card = el('div', 'scene-card');
    if (run.ended === 'endless_over') {
      card.appendChild(el('h2', 'ending-title', `挑战结束 · ${run.score} 分`));
      card.appendChild(el('p', 'scene-text', run.fails >= 3 ? '连续三单失手，同行把你拉黑了。' : '资金断裂，手机军团解散。'));
      const best = (app.g && app.g.endlessBest) || [];
      for (const [i, b] of best.entries()) {
        card.appendChild(el('div', 'ach-item' + (b.score === run.score ? ' unlocked' : ' locked'), `#${i + 1} · ${b.score} 分（${b.date}）`));
      }
      const back = el('button', 'btn', '回到标题');
      back.onclick = () => { app.screen = 'title'; render(); };
      card.appendChild(back);
    } else if (!app.wave) {
      card.appendChild(el('div', 'speaker', '系统'));
      card.appendChild(el('p', 'scene-text', '无尽模式：风控只涨不降，接单全凭本事。每单成功得利润，失败三次或破产即终。'));
      const b = el('button', 'btn', '开始接单');
      b.onclick = () => { app.wave = G.endlessWave(run); render(); };
      card.appendChild(b);
    } else {
      const w = app.wave;
      card.appendChild(el('div', 'speaker', w.name));
      card.appendChild(el('p', 'rapid-info', `分数 ${run.score} · 资金 ¥${run.money || 0} · 风控 ${run.risk} · 失败 ${run.fails}/3`));
      if (w.type === 'timing') {
        const barEl = el('div', 'timing-bar');
        const fill = el('div', 'timing-fill');
        fill.style.width = '0%';
        barEl.appendChild(fill);
        card.appendChild(barEl);
        const btn = el('button', 'btn', '开始');
        card.appendChild(btn);
        let t0 = 0, anim = null, running = false;
        const TOTAL = 1200;
        btn.onclick = () => {
          if (!running) {
            running = true; t0 = Date.now();
            anim = setInterval(() => {
              const left = TOTAL - (Date.now() - t0);
              if (left <= 0) { clearInterval(anim); anim = null; fill.style.width = '100%'; btn.textContent = '⏱ 0.0s'; return; }
              fill.style.width = ((TOTAL - left) / TOTAL * 100) + '%';
              btn.textContent = `⏱ ${(left / 1000).toFixed(1)}s`;
            }, 50);
            return;
          }
          clearInterval(anim);
          const eff = Date.now() - t0 + 60 + Math.floor(Math.random() * 201);
          finishWave(Math.max(0, 1 - eff / TOTAL) > 0.25);
        };
      } else if (w.type === 'rapid') {
        const info = el('div', 'rapid-info', `狂点 5 次！进度 0/5`);
        const tapBtn = el('button', 'btn tap-btn', '🖱️ 抢！');
        card.appendChild(info);
        card.appendChild(tapBtn);
        let n = 0;
        tapBtn.onclick = () => {
          n += 1;
          info.textContent = `狂点 5 次！进度 ${n}/5`;
          if (n >= 5) finishWave(true);
        };
      } else {
        const sec = el('div', 'captcha-box');
        card.appendChild(sec);
        buildCaptcha(sec, () => finishWave(true));
      }
    }
    wrap.appendChild(card);
    app.el.appendChild(wrap);

    function finishWave(ok) {
      const r = app.run;
      if (ok) {
        const profit = Math.round(app.wave.base * (0.8 + Math.random() * 0.4));
        G.endlessSuccess(r, profit);
        showToast(`✓ 得手！利润 +¥${profit}`);
      } else {
        const over = G.endlessFail(r);
        showToast('✗ 这单砸了……');
        if (over) {
          r.ended = 'endless_over';
          G.recordEndless(app.g, r.score || 0);
          G.saveRun(r);
          app.wave = null;
          render();
          return;
        }
      }
      G.saveRun(r);
      app.wave = null;
      setTimeout(render, 600);
    }
  }

  function itemTags(it) {
    const tags = [];
    if (it.quality === 'good') tags.push('优质');
    if (it.quality === 'best') tags.push('极品✨');
    if (it.damp) tags.push('受潮');
    if (it.fake) tags.push('疑似假货⚠️');
    if (it.rare) tags.push('孤品💎');
    return tags.length ? ' [' + tags.join('/') + ']' : '';
  }

  function renderMarket() {
    app.el.innerHTML = '';
    const run = app.run;
    const wrap = el('div', 'market-screen');
    wrap.appendChild(el('div', 'money-bar', `💰 <b>${fmtMoney(run.money)}</b>`));
    wrap.appendChild(el('h2', 'screen-h', `📦 行情 · 指数 ${run.marketIdx}`));
    wrap.appendChild(el('p', 'title-sub',
      `${phaseLabel(run)}${todayLabel(run)}`));
    if (!run.inventory.length) {
      wrap.appendChild(el('p', 'compliance-text', '货架空空，先去抢点货。'));
    }
    run.inventory.forEach((it, i) => {
      const val = G.itemValue(run, it);
      const row = el('div', 'ach-item market-item',
        `<b>${it.name}</b>${itemTags(it)}（成本 ¥${it.base}${it.held ? ` · 已囤 ${it.held} 天` : ''}）<br>现价 <b class="risk-warn">${fmtMoney(val)}</b>`);
      const chRow = el('div', 'refresh-row');
      for (const [ch, label] of [['retail', '🏪 零售'], ['wholesale', '🏭 批发'], ['vip', '💼 包圆']]) {
        const b = el('button', 'btn btn-sm', label);
        b.onclick = () => {
          const before = run.money;
          const r = G.sellItem(run, i, ch);
          G.saveRun(run);
          if (r.ok) showToast(`${r.outcome} ${r.gain > 0 ? '+' : ''}${fmtMoney(r.gain)}`);
          spawnMoneyFloat(r.ok ? (run.money - before) : 0);
          render();
        };
        chRow.appendChild(b);
      }
      if ((run.marketIdx || 100) >= 115 && !it.fake) {
        const ab = el('button', 'btn btn-sm dark-market', '🕶️ 黑市拍卖(×1.6~2.0)');
        ab.onclick = () => {
          const r = G.sellAuction(run, i);
          G.saveRun(run);
          if (r.phished) { showToast(`🚨 钓鱼执法！货被没收，风控+${r.riskUp}`); }
          else { showToast(`🕶️ 黑市成交！+${fmtMoney(r.gain)}`); spawnMoneyFloat(r.gain); }
          render();
        };
        chRow.appendChild(ab);
      }
      if ((it.held || 0) >= 3) {
        const hb = el('button', 'btn btn-sm', '📣 炒价(+15%)');
        hb.onclick = () => {
          const r = G.hypeItem(run, i);
          G.saveRun(run);
          if (r.exposed) showToast('🔥 上热搜了！被强制降价 50%，风控+6');
          else showToast(`📣 水军到位！成本抬到 ¥${r.base}`);
          render();
        };
        chRow.appendChild(hb);
      }
      row.appendChild(chRow);
      wrap.appendChild(row);
    });
    // 暴利订单
    if (!app.order && run.inventory.length) {
      const ord = G.rollProfitOrder(run);
      if (ord) { app.order = ord; app.orderLeft = 10; }
    }
    if (app.order) {
      const it = run.inventory[app.order.idx];
      const om = el('div', 'ach-item order-card',
        `<b>🕵️ 神秘买家</b>：想以 <b class="risk-warn">×${app.order.mul.toFixed(2)}</b> 收购你的「${it ? it.name : ''}」<br><span class="order-timer">⏱ 剩 ${app.orderLeft}s（20% 概率是骗子，接单押金 ¥1500）</span>`);
      const obRow = el('div', 'refresh-row');
      const acc = el('button', 'btn btn-sm', '接！');
      acc.onclick = () => {
        const r = G.acceptProfitOrder(run, app.order);
        app.order = null;
        G.saveRun(run);
        if (r.faked) showToast(`🚨 是骗子！保证金 -${fmtMoney(r.loss)}`);
        else { showToast(`🕵️ 订单完成！+${fmtMoney(r.gain)}`); spawnMoneyFloat(r.gain); }
        render();
      };
      const rej = el('button', 'btn btn-sm', '不接');
      rej.onclick = () => { app.order = null; render(); };
      obRow.appendChild(acc); obRow.appendChild(rej);
      om.appendChild(obRow);
      wrap.appendChild(om);
      clearInterval(app._orderTimer);
      app._orderTimer = setInterval(() => {
        app.orderLeft -= 1;
        const t = document.querySelector('.order-timer');
        if (t && app.order) t.innerHTML = `⏱ 剩 ${app.orderLeft}s（20% 概率是骗子，接单押金 ¥1500）`;
        if (app.orderLeft <= 0) { clearInterval(app._orderTimer); app.order = null; showToast('神秘买家等不及，走了。'); render(); }
      }, 1000);
    }
    const back = el('button', 'btn', '返回抢购');
    back.onclick = () => { clearInterval(app._orderTimer); app.screen = 'game'; render(); };
    wrap.appendChild(back);
    app.el.appendChild(wrap);
  }

  function renderShop() {
    app.el.innerHTML = '';
    const run = app.run;
    const wrap = el('div', 'shop-screen');
    wrap.appendChild(el('div', 'money-bar', `💰 <b>${fmtMoney(run.money)}</b>`));
    wrap.appendChild(el('h2', 'screen-h', `🎁 小雨的心愿铺 · 第 ${run.day} 天`));
    wrap.appendChild(el('p', 'title-sub', '每天随机上架 2~3 件，价格随缘。限定款可遇不可求。'));
    if (!(run.giftShop || []).length) wrap.appendChild(el('p', 'compliance-text', '今天没有心仪的礼物上架，明天再来看看。'));
    (run.giftShop || []).forEach(entry => {
      const g = D.GIFTS.find(x => x.id === entry.id);
      const owned = (run.giftsOwned || []).includes(entry.id);
      const afford = (run.money || 0) >= entry.price;
      const row = el('div', 'ach-item',
        `<b>${g.name}</b>${entry.limited ? ' [限定款🔥]' : ''} — ${fmtMoney(entry.price)}${owned ? ' ✅已送出' : ''}`);
      const b = el('button', 'btn btn-sm', owned ? '已拥有' : '买下送她');
      b.disabled = owned || !afford;
      b.onclick = () => {
        const r = G.buyGift(run, entry.id);
        G.saveRun(run);
        if (r.ok) {
          showBroadcast(r.limited ? `🎁 限定款「${r.name}」送出了！小雨的眼睛在发光！` : `🎁 「${r.name}」送出了`);
          showToast(r.story.slice(0, 60), 2600);
          if (r.allOwned) showBroadcast('💖 心愿全收集达成！称号「心意满贯」');
        } else if (r.poor) showToast('钱不够……再去抢几单吧。');
        render();
      };
      row.appendChild(b);
      wrap.appendChild(row);
    });
    wrap.appendChild(el('h2', 'screen-h', '🔧 装备升级'));
    const curIdx = D.EQUIPMENT.findIndex(e => e.id === (run.equipmentId || 'e0'));
    D.EQUIPMENT.forEach((e, i) => {
      if (i <= curIdx) return;
      const afford = (run.money || 0) >= e.price;
      const row = el('div', 'ach-item', `<b>${e.name}</b> — ${fmtMoney(e.price)}<br><span class="hire-desc">${e.desc}</span>`);
      const b = el('button', 'btn btn-sm', '升级');
      b.disabled = !afford;
      b.onclick = () => {
        run.money -= e.price;
        run.equipmentId = e.id;
        G.logTransaction(run, '装备升级 · ' + e.name, -e.price);
        G.saveRun(run);
        showToast('🔧 换上' + e.name + '！');
        render();
      };
      row.appendChild(b);
      wrap.appendChild(row);
    });
    const back = el('button', 'btn', '返回抢购');
    back.onclick = () => { app.screen = 'game'; render(); };
    wrap.appendChild(back);
    app.el.appendChild(wrap);
  }

  function renderCollection() {
    app.el.innerHTML = '';
    const run = app.run;
    const wrap = el('div', 'collection-screen');
    wrap.appendChild(el('h2', 'screen-h', `📜 战利品图鉴 · ${Object.keys(run.collection || {}).length} 种`));
    const names = Object.keys(run.collection || {});
    if (!names.length) wrap.appendChild(el('p', 'compliance-text', '还没抢到过任何东西。每个黄牛的第一步，都是从零开始的。'));
    names.forEach(n => {
      const c = run.collection[n];
      const rareMark = c.best === 'best' ? ' 💎极品过' : c.best === 'good' ? ' ✨优质过' : '';
      wrap.appendChild(el('div', 'ach-item', `<b>${n}</b> ×${c.count}${rareMark}`));
    });
    const back = el('button', 'btn', '返回');
    back.onclick = () => { app.screen = 'game'; render(); };
    wrap.appendChild(back);
    app.el.appendChild(wrap);
  }

  function renderLedger() {
    app.el.innerHTML = '';
    const run = app.run;
    const wrap = el('div', 'ledger-screen');
    wrap.appendChild(el('div', 'money-bar', `💰 <b>${fmtMoney(run.money)}</b>`));
    wrap.appendChild(el('h2', 'screen-h', '📒 收支流水'));
    let invValue = 0;
    for (const it of (run.inventory || [])) invValue += G.itemValue(run, it);
    wrap.appendChild(el('p', 'rapid-info', `现金 ${fmtMoney(run.money)} + 库存市值 ${fmtMoney(invValue)} = 总资产 ${fmtMoney(run.money + invValue)}`));
    if (!(run.ledger || []).length) wrap.appendChild(el('p', 'compliance-text', '还没有任何收支记录。'));
    (run.ledger || []).forEach(row => {
      const cls = row.amount >= 0 ? 'risk-safe' : 'risk-danger';
      wrap.appendChild(el('div', 'ach-item', `第${row.day}天 · ${row.desc} <b class="${cls}">${row.amount >= 0 ? '+' : ''}${fmtMoney(row.amount)}</b>`));
    });
    const back = el('button', 'btn', '返回');
    back.onclick = () => { app.screen = 'game'; render(); };
    wrap.appendChild(back);
    app.el.appendChild(wrap);
  }

  function renderTitle() {
    const hasRun = !!G.loadRun();
    app.el.innerHTML = '';
    const h = el('div', 'title-screen');
    h.appendChild(el('h1', 'title-name', '黄牛模拟器'));
    h.appendChild(el('p', 'title-sub', '沙雕讽刺 · 系统流 · 黑色幽默'));
    const btnNew = el('button', 'btn', '新的人生');
    btnNew.onclick = () => {
      app.g = loadOrCreateGlobal();
      app.screen = 'school';
      render();
    };
    h.appendChild(btnNew);
    if (hasRun) {
      const btnContinue = el('button', 'btn', '继续上一世');
      btnContinue.onclick = () => {
        app.g = loadOrCreateGlobal();
        app.run = G.loadRun();
        if (app.run && app.run.endless) {
          app.screen = 'endless';
          app.wave = null;
        } else {
          app.screen = 'game';
        }
        render();
      };
      h.appendChild(btnContinue);
    }
    if (app.g && app.g.endlessUnlocked) {
      const btnEndless = el('button', 'btn', '♾️ 无尽试炼');
      btnEndless.onclick = () => { startEndless(); };
      h.appendChild(btnEndless);
    }
    const btnAchieve = el('button', 'btn', '成就');
    btnAchieve.onclick = () => { app.screen = 'achievements'; render(); };
    h.appendChild(btnAchieve);
    const btnCompliance = el('button', 'btn', '理性消费提示');
    btnCompliance.onclick = () => { app.screen = 'compliance'; render(); };
    h.appendChild(btnCompliance);
    app.el.appendChild(h);
  }

  function renderStatsBar() {
    const bar = el('div', 'stats-bar');
    const nextReq = D.LEVELS[Math.min(app.run.level + 1, 5)].luckReq || 1;
    const pct = Math.min(100, Math.round(app.run.luck / nextReq * 100));
    bar.appendChild(el('div', 'stat', `欧气 ${app.run.luck}`));
    bar.appendChild(el('div', 'stat', `手速 Lv.${app.run.level}`));
    bar.appendChild(el('div', 'stat', `¥ ${app.run.money || 0}`));
    const risk = app.run.risk || 0;
    const zone = risk >= 85 ? 'risk-hell' : risk >= 60 ? 'risk-danger' : risk >= 30 ? 'risk-warn' : 'risk-safe';
    bar.appendChild(el('div', 'stat ' + zone, `风控 ${risk}`));
    const streak = app.run.streak || 0;
    bar.appendChild(el('div', 'stat' + (streak > 1 ? ' hot' : ''), streak > 1 ? `🔥 连击x${streak}` : '连击 -'));
    const s = app.run.staff || { night: 0, tech: 0, talk: 0, intel: 0 };
    bar.appendChild(el('div', 'stat', `小弟 ${s.night + s.tech + s.talk + s.intel}`));
    const prog = el('div', 'luck-bar');
    const fill = el('div', 'luck-fill');
    fill.style.width = pct + '%';
    prog.appendChild(fill);
    bar.appendChild(prog);
    const task = D.TASKS[app.run.currentTask];
    bar.appendChild(el('div', 'task-line', task ? `当前任务：${task.name}（${task.goal}）· 🎮 ${task.minigame || ''}` : ''));
    return bar;
  }

  function fmtMoney(n) { return '¥' + Math.round(n || 0).toLocaleString('en-US'); }

  function spawnMoneyFloat(diff) {
    if (!diff) return;
    const f = el('div', 'money-float ' + (diff > 0 ? 'up' : 'down'),
      (diff > 0 ? '+' : '-') + fmtMoney(Math.abs(diff)));
    app.el.appendChild(f);
    setTimeout(() => f.remove(), 1500);
    if (diff >= 10000) {
      const g = el('div', 'gold-flash', '💥 暴利！');
      app.el.appendChild(g);
      setTimeout(() => g.remove(), 1000);
    }
  }

  function phaseLabel(run) {
    const p = run.marketPhase;
    const left = run.marketLeft || 0;
    if (p === 'up') return `📈涨潮期·剩${left}天`;
    if (p === 'down') return `📉跌潮期·剩${left}天`;
    return `➖震荡期·剩${left}天`;
  }

  function todayLabel(run) {
    if (run.today === 'concert') return ' · 🎤演唱会扎堆日(货价+20%)';
    if (run.today === 'crackdown') return ' · 🚨严打日(风控×2)';
    if (run.today === 'promo') return ' · 🎉平台大促日(免验证码)';
    return '';
  }

  function renderEventModal() {
    const run = app.run;
    app.el.innerHTML = '';
    let ev = D.EVENTS.find(e => e.id === run.pendingEventId);
    if (!ev) {
      if (run.pendingEventId === '__betrayal__') ev = { title: '小弟叛逃', desc: '昨天捞出来的人，今天带货跑了。', options: [{ label: '……' }] };
      else if (run.pendingEventId === '__coupon__') ev = { title: '平台补偿', desc: '意外之财从天而降。', options: [{ label: '收下' }] };
      else ev = { title: '今日事件', desc: '', options: [{ label: '知道了' }] };
    }
    const wrap = el('div', 'event-wrap');
    const card = el('div', 'scene-card event-card');
    card.appendChild(el('h3', 'screen-h', '📰 ' + ev.title));
    card.appendChild(el('p', 'scene-text', ev.desc));
    card.appendChild(el('p', 'rapid-info', `第 ${run.day} 天 · 现金 ${fmtMoney(run.money)}`));
    ev.options.forEach((opt, i) => {
      const b = el('button', 'btn', opt.label);
      b.onclick = () => {
        const res = G.applyEventOption(run, run.pendingEventId, i);
        run.pendingEventId = null;
        G.saveRun(run);
        if (res.text) showToast(res.text.slice(0, 60));
        render();
      };
      card.appendChild(b);
    });
    wrap.appendChild(card);
    app.el.appendChild(wrap);
  }

  function renderGame() {
    const run = app.run;
    if (run.pendingEventId) return renderEventModal();
    app.el.innerHTML = '';
    const wrap = el('div', 'game-wrap');
    const node = D.STORY[app.run.nodeId];
    wrap.appendChild(el('div', 'chapter-banner', chapterName(app.run.chapter)));
    wrap.appendChild(el('div', 'money-bar', `💰 <b>${fmtMoney(run.money)}</b>`));
    wrap.appendChild(el('div', 'day-line', `第 ${run.day} 天 · ${phaseLabel(run)}${todayLabel(run)}`));
    const topRow = el('div', 'refresh-row');
    const mBtn = el('button', 'btn btn-sm', `📦 行情${run.inventory.length ? '(' + run.inventory.length + '/' + G.capacity(run) + ')' : ''}`);
    mBtn.onclick = () => { app.screen = 'market'; render(); };
    topRow.appendChild(mBtn);
    const sBtn = el('button', 'btn btn-sm', '🎁 心愿铺');
    sBtn.onclick = () => { app.screen = 'shop'; render(); };
    topRow.appendChild(sBtn);
    const cBtn = el('button', 'btn btn-sm', '📜 图鉴');
    cBtn.onclick = () => { app.screen = 'collection'; render(); };
    topRow.appendChild(cBtn);
    const lBtn = el('button', 'btn btn-sm', '📒 流水');
    lBtn.onclick = () => { app.screen = 'ledger'; render(); };
    topRow.appendChild(lBtn);
    wrap.appendChild(topRow);
    const card = el('div', 'scene-card');
    if (node) {
      card.appendChild(el('div', 'speaker', node.speaker || ''));
      card.appendChild(el('p', 'scene-text', node.text));
      if (node.type === 'dialogue') {
        const b = el('button', 'btn', '继续');
        b.onclick = () => { app.run.nodeId = node.next; G.saveRun(app.run); render(); };
        card.appendChild(b);
      } else if (node.type === 'choice') {
        for (const c of node.choices) {
          const b = el('button', 'btn', c.text);
          b.onclick = () => { G.applyChoice(app.run, c.id); G.saveRun(app.run); render(); };
          card.appendChild(b);
        }
      } else if (node.type === 'task') {
        const t = D.TASKS[node.taskId];
        const label = t && t.mode === 'hire' ? '开始招人' : (t && t.mode === 'riskcheck') ? '开始风控结算' : '开始抢购';
        const b = el('button', 'btn', label);
        b.onclick = () => { startPurchase(node); };
        card.appendChild(b);
      } else if (node.type === 'ending') {
        const b = el('button', 'btn', '结算人生');
        b.onclick = () => {
          const effEnding = G.checkEnding(app.run) || node.ending;
          G.endingEffects(app.run, effEnding, app.g);
          app.screen = 'ending';
          render();
        };
        card.appendChild(b);
      }
      if (app.run.flags.reverseUnlocked && (node.type === 'task' || node.type === 'dialogue')) {
        const rb = el('button', 'btn reverse-btn', '🔄 把抢到的原价出给排队的人');
        rb.onclick = () => {
          app.run.reverseSales += 1;
          G.saveRun(app.run);
          showToast('你原价把票给了排队的普通人。' + (app.run.reverseSales >= 10 ? '【火锅好人】之路开启！' : `反向黄牛 ${app.run.reverseSales}/10`));
          render();
        };
        card.appendChild(rb);
      }
    }
    wrap.appendChild(card);
    wrap.appendChild(renderStatsBar());
    app.el.appendChild(wrap);
  }

  function renderEnding() {
    app.el.innerHTML = '';
    const e = D.ENDINGS.find(x => x.id === app.run.ended) || D.ENDINGS[0];
    const wrap = el('div', 'ending-screen');
    wrap.appendChild(el('h2', 'ending-title', '结局 · ' + e.name));
    const conscience = app.run.conscience || 0;
    const titleTag = conscience >= 20 ? '称号：人间清醒 🕊️' : conscience <= -20 ? '称号：冷血操盘 🐍' : '称号：普通韭菜';
    wrap.appendChild(el('p', 'title-sub', `良心值 ${conscience > 0 ? '+' : ''}${conscience} · ${titleTag}`));
    wrap.appendChild(el('p', 'ending-desc', e.desc));
    if (app.run.ended === 'B' && app.run.flags.jiuLedger) {
      wrap.appendChild(el('p', 'ending-desc ledger-note', '📎 你把九哥的账本交给了记者——管理局全产业链的证据链，齐了。'));
    }
    if (app.run.ended === 'B' && conscience >= 20) {
      wrap.appendChild(el('p', 'ending-desc ledger-note', '🧧 排队时，一位拎着蛇皮袋的大叔认出了你——春运那年你帮他抢到过回家的票。他默默帮你买了单。'));
    }
    if (app.run.ended === 'B' && conscience <= -20) {
      wrap.appendChild(el('p', 'ending-desc ledger-note', '🌫️ 火锅店里人声鼎沸，你一个人吃得很快，没有人拼桌。'));
    }
    if ((app.run.giftsOwned || []).length >= 6 && app.run.ended === 'B') {
      wrap.appendChild(el('p', 'ending-desc ledger-note', '💖 六件心愿，一件不落。小雨把那张房产证复印件压在了火锅店的玻璃桌板下面——"店是大家的，家是我们的。"'));
    }
    let invValue = 0;
    for (const it of (app.run.inventory || [])) invValue += G.itemValue(app.run, it);
    wrap.appendChild(el('p', 'title-sub',
      `生涯报告 · 第 ${app.run.day} 天 · 图鉴 ${Object.keys(app.run.collection || {}).length} 种 · 库存残值 ${fmtMoney(invValue)}`));
    if (app.run.ended === 'B') {
      const rank = el('div', 'rank-easter-egg', '排行榜 · 抢购圣手 Lv.100');
      wrap.appendChild(rank);
      setTimeout(() => rank.classList.add('dim'), 2000);
    }
    const back = el('button', 'btn', '回到标题');
    back.onclick = () => { app.screen = 'title'; render(); };
    wrap.appendChild(back);
    app.el.appendChild(wrap);
  }

  function renderAchievements() {
    app.el.innerHTML = '';
    const wrap = el('div', 'ach-screen');
    wrap.appendChild(el('h2', 'screen-h', '成就'));
    for (const a of D.ACHIEVEMENTS) {
      const unlocked = app.g.achievements.includes(a.id);
      wrap.appendChild(el('div', 'ach-item ' + (unlocked ? 'unlocked' : 'locked'),
        `${unlocked ? '✅' : '🔒'} ${a.name} —— ${a.desc}（奖励：${a.reward}）`));
    }
    const back = el('button', 'btn', '返回');
    back.onclick = () => { app.screen = 'title'; render(); };
    wrap.appendChild(back);
    app.el.appendChild(wrap);
  }

  function renderCompliance() {
    app.el.innerHTML = '';
    const wrap = el('div', 'compliance-screen');
    wrap.appendChild(el('h2', 'screen-h', '理性消费提示'));
    wrap.appendChild(el('p', 'compliance-text', '倒票（黄牛）属于违法违规行为，破坏市场公平，且个人信息存在泄露风险。请通过正规渠道购票，理性消费，远离黄牛。'));
    const back = el('button', 'btn', '返回');
    back.onclick = () => { app.screen = 'title'; render(); };
    wrap.appendChild(back);
    app.el.appendChild(wrap);
  }

  function sumStaff() {
    const s = app.run.staff || { night: 0, tech: 0, talk: 0, intel: 0 };
    return s.night + s.tech + s.talk + s.intel;
  }

  function renderHire(node, t, card) {
    const types = [
      { k: 'night', name: '夜排型', desc: '体力扛把子：抢购成功率 +3%' },
      { k: 'tech', name: '技术型', desc: '设备大神：风控增长 -1' },
      { k: 'talk', name: '嘴皮型', desc: '谈判专家：出货收益 +20%' },
      { k: 'intel', name: '眼线型', desc: '情报贩子：刷新必出好货' },
    ];
    const info = el('div', 'rapid-info', `已招募 ${sumStaff()}/3`);
    const grid = el('div', 'hire-grid');
    card.appendChild(info);
    card.appendChild(grid);
    const refreshGrid = () => {
      grid.innerHTML = '';
      for (const tp of types) {
        const hired = (app.run.staff[tp.k] || 0) > 0;
        const c = el('button', 'btn hire-card' + (hired ? ' hired' : ''),
          `${tp.name}小弟${hired ? ' ✔ 已入队' : ''}<br><span class="hire-desc">${tp.desc}</span>`);
        c.disabled = hired;
        c.onclick = () => {
          app.run.staff[tp.k] = (app.run.staff[tp.k] || 0) + 1;
          const res = G.advanceProgress(app.run, t.id, 1);
          G.saveRun(app.run);
          showToast(`🤝 招到${tp.name}小弟！`);
          info.textContent = `已招募 ${sumStaff()}/3`;
          refreshGrid();
          if (res.taskCompleted) {
            showToast('🏢 工作室开张！');
            setTimeout(() => { app.run.nodeId = node.onComplete; G.saveRun(app.run); render(); }, 900);
          }
        };
        grid.appendChild(c);
      }
    };
    refreshGrid();
  }

  function renderRiskCheck(node, t, card) {
    const risk = app.run.risk || 0;
    card.appendChild(el('div', 'rapid-info', `当前风控值：${risk}（低于 60 全身而退，否则库存被冻结清算）`));
    const resBtn = el('button', 'btn', '接受审查');
    const out = el('div', 'rapid-info', '');
    card.appendChild(resBtn);
    card.appendChild(out);
    resBtn.onclick = () => {
      const r = G.resolveRiskCheck(app.run);
      const comp = G.advanceProgress(app.run, t.id, 1);
      G.saveRun(app.run);
      resBtn.disabled = true;
      out.textContent = r.safe ? '✓ 风控值低于阈值，全身而退！' : `✗ 触发强制审查，库存冻结损失 ¥${r.loss}`;
      showToast(r.safe ? '😎 全身而退' : '💸 损失惨重……');
      if (comp.banEvent) showToast(`⚠️ 封号危机！额外损失 ¥${comp.banEvent.loss}`);
      setTimeout(() => { app.run.nodeId = node.onComplete; G.saveRun(app.run); render(); }, 1200);
    };
  }

  function buildCaptcha(sec, onPass, hint, hard) {
    sec.innerHTML = '';
    const typeRoll = Math.random();
    if (typeRoll < 0.34) return buildCaptchaWord(sec, onPass, hint, hard);
    if (typeRoll < 0.67) return buildCaptchaMath(sec, onPass, hard);
    return buildCaptchaDir(sec, onPass, hard);
  }

  function captchaFinish(sec, onPass, ok, hint) {
    let done = false;
    return (ok2) => {
      if (done) return;
      done = true;
      if (ok2) {
        sec.innerHTML = '';
        sec.appendChild(el('div', 'captcha-inst', '✅ 验证通过，开抢！'));
        G.clearReportFlag(app.run);
        G.saveRun(app.run);
        onPass();
      } else {
        G.addRisk(app.run, 10);
        G.saveRun(app.run);
        showToast('❌ 验证失败！风控 +10');
        buildCaptcha(sec, onPass, hint);
      }
    };
  }

  function buildCaptchaWord(sec, onPass, hint, hard) {
    sec.innerHTML = '';
    const chars = '韭牛票抢码黄号手速';
    const target = chars[Math.floor(Math.random() * chars.length)];
    const pool = chars.split('').filter(c => c !== target);
    const count = hard ? 8 : 6;
    const need = hard ? 3 : 2;
    const tiles = [];
    for (let i = 0; i < count; i++) tiles.push(i < need ? target : pool[Math.floor(Math.random() * pool.length)]);
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    sec.appendChild(el('div', 'captcha-inst',
      `🤖 人机验证${hard ? '(加强版)' : ''}：请点击所有「${target}」字<br><span class="captcha-taunt">${D.CAPTCHA_LINES[Math.floor(Math.random() * D.CAPTCHA_LINES.length)]}</span>`));
    const gridEl = el('div', 'captcha-grid');
    sec.appendChild(gridEl);
    let picked = 0;
    const finish = captchaFinish(sec, onPass, null, hint);
    let hinted = false;
    for (const ch of tiles) {
      const tile = el('button', 'captcha-tile' + (hint && ch === target && !hinted ? ' hint' : ''), ch);
      if (hint && ch === target && !hinted) hinted = true;
      tile.onclick = () => {
        if (tile.disabled) return;
        if (ch === target) {
          tile.disabled = true;
          tile.classList.add('hit');
          picked += 1;
          if (picked === need) finish(true);
        } else {
          finish(false);
        }
      };
      gridEl.appendChild(tile);
    }
  }

  function buildCaptchaMath(sec, onPass, hard) {
    sec.innerHTML = '';
    const a = 2 + Math.floor(Math.random() * (hard ? 17 : 8));
    const b = 1 + Math.floor(Math.random() * 9);
    const ans = a + b;
    sec.appendChild(el('div', 'captcha-inst',
      `🤖 人机验证：${a} + ${b} = ?<br><span class="captcha-taunt">验证码：小学生都会，你呢？</span>`));
    const gridEl = el('div', 'captcha-grid math-grid');
    sec.appendChild(gridEl);
    const opts = new Set([ans]);
    while (opts.size < 4) opts.add(ans + (Math.floor(Math.random() * 7) - 3) || ans + 1);
    const finish = captchaFinish(sec, onPass);
    [...opts].sort(() => Math.random() - 0.5).forEach(v => {
      const t = el('button', 'captcha-tile', String(v));
      t.onclick = () => finish(v === ans);
      gridEl.appendChild(t);
    });
  }

  function buildCaptchaDir(sec, onPass, hard) {
    sec.innerHTML = '';
    const dirs = [['←', '左'], ['→', '右'], ['↑', '上'], ['↓', '下']];
    const pick = dirs[Math.floor(Math.random() * 4)];
    sec.appendChild(el('div', 'captcha-inst',
      `🤖 人机验证：请点击指向「${pick[1]}」的箭头<br><span class="captcha-taunt">验证码：路痴勿扰。</span>`));
    const gridEl = el('div', 'captcha-grid dir-grid');
    sec.appendChild(gridEl);
    const finish = captchaFinish(sec, onPass);
    dirs.sort(() => Math.random() - 0.5).forEach(d => {
      const t = el('button', 'captcha-tile', d[0]);
      t.onclick = () => finish(d[1] === pick[1]);
      gridEl.appendChild(t);
    });
  }

  function startPurchase(node) {
    const t = D.TASKS[node.taskId];
    const chk = G.canStartPurchase(app.run, t.id);
    if (!chk.ok) { showToast('📦 ' + chk.reason); return; }
    const card = $('.scene-card');
    card.innerHTML = '';
    card.appendChild(el('div', 'speaker', node.speaker));
    card.appendChild(el('p', 'scene-text', node.text));
    card.appendChild(el('div', 'sys-ticker', '🎵 ' + randSystemLine()));

    if (t.mode === 'hire') return renderHire(node, t, card);
    if (t.mode === 'riskcheck') return renderRiskCheck(node, t, card);

    const highValue = !!(t.loot && t.loot.base >= 8000);
    const needCaptcha = app.run.today !== 'promo'
      && (highValue || t.id === 'T1-2' || app.run.reportFlag || (app.run.risk || 0) >= 30);
    if (needCaptcha) {
      const sec = el('div', 'captcha-box');
      card.appendChild(sec);
      buildCaptcha(sec, () => buildControls(card, node, t), app.run.school === 'intel', app.run.reportFlag);
    } else {
      buildControls(card, node, t);
    }
  }

  function buildControls(card, node, t) {

    if (t.mode === 'rapid') {
      let remaining = 8;
      const info = el('div', 'rapid-info', `限时 ${remaining} 秒，狂点！进度 ${app.run.taskProgress}/${t.progressTarget}`);
      const timerEl = el('div', 'rapid-timer', `⏱ ${remaining}s`);
      const tapBtn = el('button', 'btn tap-btn', '🖱️ 抢！');
      card.appendChild(info);
      card.appendChild(timerEl);
      card.appendChild(tapBtn);
      // 假按钮陷阱
      let fakeLeft = 2;
      const fakeTimer = setInterval(() => {
        if (fakeLeft <= 0 || remaining <= 0) { clearInterval(fakeTimer); return; }
        if (Math.random() < 0.25) {
          fakeLeft -= 1;
          const fake = el('button', 'btn tap-btn tap-fake', '🖱️ 抢!!');
          card.appendChild(fake);
          fake.onclick = () => {
            const lost = G.fakeTapPenalty(app.run);
            G.saveRun(app.run);
            showToast(lost ? '🎫 假票窝点！进度 -1' : '假票没坑到你的进度（本来就为 0）');
            info.textContent = `限时 ${remaining} 秒，狂点！进度 ${app.run.taskProgress}/${t.progressTarget}`;
            fake.remove();
          };
          setTimeout(() => fake.remove(), 1800);
        }
      }, 1500);
      const interval = setInterval(() => {
        remaining--;
        timerEl.textContent = `⏱ ${remaining}s`;
        if (remaining <= 0) {
          clearInterval(interval);
          if (oppInterval) clearInterval(oppInterval);
          tapBtn.textContent = '⏱ 超时了，点我重新开始';
          tapBtn.onclick = () => startPurchase(node);
        }
      }, 1000);
      let oppInterval = null;
      let oppDone = false;
      const isRival = t.id === 'T3-1' || app.run.difficulty === 'hell';
      if (t.id === 'T3-1') {
        const oppBar = el('div', 'rapid-info opp-race', '🏃 九头鸟残部进度 0%');
        card.appendChild(oppBar);
        const enc = (app.run.rivalWins || 0);
        const oppTotal = Math.max(4200, 7500 - enc * 900 - (app.run.difficulty === 'hell' ? 1500 : 0));
        const ot0 = Date.now();
        oppInterval = setInterval(() => {
          const pct = Math.min(100, Math.round((Date.now() - ot0) / oppTotal * 100));
          oppBar.textContent = `🏃 九头鸟残部进度 ${pct}%`;
          if (pct >= 100 && !oppDone) {
            oppDone = true;
            clearInterval(oppInterval);
            clearInterval(interval);
            clearInterval(fakeTimer);
            const fine = G.rivalFine(app.run);
            G.saveRun(app.run);
            tapBtn.disabled = true;
            tapBtn.textContent = `😤 被截胡！罚款 ¥${fine}，点我报仇`;
            tapBtn.onclick = () => startPurchase(node);
          }
        }, 120);
      }
      tapBtn.onclick = () => {
        const res = G.advanceProgress(app.run, t.id, 1);
        G.saveRun(app.run);
        info.textContent = `限时 ${remaining} 秒，狂点！进度 ${app.run.taskProgress}/${t.progressTarget}`;
        if (res.taskCompleted) {
          clearInterval(interval);
          clearInterval(fakeTimer);
          if (oppInterval) clearInterval(oppInterval);
          if (isRival) {
            const wins = G.rivalWin(app.run);
            showToast(`🏆 完胜九头鸟残部！${wins}/3`);
            if (wins >= 3) unlockAchievement('jiehu');
          }
          const ach = G.checkAchievements(app.run, 'purchase', {});
          for (const aid of ach) unlockAchievement(aid);
          if (t.rewards.broadcast) showBroadcast('全服广播：林小韭又又又抢到了！');
          if (t.rewards.money) showToast(`💰 入账 ¥${Math.round(t.rewards.money * (1 + 0.2 * G.staffCount(app.run, 'talk')))}`);
          if (res.rent) showToast(`🏠 月底房东来收租 ¥${res.rent}`);
          if (res.banEvent) showToast(`⚠️ 封号危机！损失 ¥${res.banEvent.loss}`);
          showToast('✓ 扫货完成！');
          setTimeout(() => { app.run.nodeId = node.onComplete; G.saveRun(app.run); render(); }, 900);
        }
      };
      return;
    }

    // timing 模式
    const barEl = el('div', 'timing-bar');
    const fill = el('div', 'timing-fill');
    fill.style.width = '0%';
    barEl.appendChild(fill);
    card.appendChild(barEl);

    app.run.refreshBuff = app.run.refreshBuff || 0;
    app.run.refreshUses = app.run.refreshUses || 0;
    const refreshRow = el('div', 'refresh-row');
    const refreshBtn = el('button', 'btn btn-sm', '🔄 刷新货源');
    const buffLabel = el('span', 'buff-label', `成功率加成 +${app.run.refreshBuff + (app.run.boughtBuff || 0)}%`);
    refreshRow.appendChild(refreshBtn);
    refreshRow.appendChild(buffLabel);
    card.appendChild(refreshRow);
    let plannedDelay = null;
    if (app.run.school === 'intel') {
      plannedDelay = G.netDelayRoll(app.run);
      refreshRow.appendChild(el('span', 'buff-label', `📡 预计网络延迟 ~${plannedDelay}ms`));
    }
    if (app.run.school === 'capital') {
      const buyBtn = el('button', 'btn btn-sm', '💳 加钱插队 +10%（¥1000）');
      buyBtn.onclick = () => {
        if ((app.run.boughtBuff || 0) >= 30 || (app.run.money || 0) < 1000) return;
        app.run.money -= 1000;
        app.run.boughtBuff = (app.run.boughtBuff || 0) + 10;
        G.saveRun(app.run);
        buffLabel.textContent = `成功率加成 +${app.run.refreshBuff + app.run.boughtBuff}%`;
        showToast('💳 黄牛加急通道开启！+10%');
      };
      refreshRow.appendChild(buyBtn);
    }
    const intelGuaranteed = app.run.school === 'intel' || G.staffCount(app.run, 'intel') > 0;
    refreshBtn.onclick = () => {
      app.run.refreshUses += 1;
      const roll = intelGuaranteed ? 0 : Math.random();
      if (roll < 0.55) {
        const gain = 4 + Math.floor(Math.random() * 9);
        app.run.refreshBuff = Math.min(32, app.run.refreshBuff + gain);
        showToast(intelGuaranteed ? `👁️ 眼线情报到位！成功率 +${gain}%` : `🔄 刷出新货源！成功率 +${gain}%`);
      } else if (roll < 0.8) {
        showToast('货架空空……什么都没刷到');
      } else {
        showToast('📢 ' + randAd());
      }
      buffLabel.textContent = `成功率加成 +${app.run.refreshBuff + (app.run.boughtBuff || 0)}%`;
      G.saveRun(app.run);
    };

    const startBtn = el('button', 'btn', '开始抢购');
    card.appendChild(startBtn);
    // 心态爆炸横幅 + 冰美式
    if (app.run.tilted) {
      const tiltRow = el('div', 'refresh-row tilt-banner');
      tiltRow.appendChild(el('span', 'buff-label', '💥 心态爆炸中！下次抢购得分减半'));
      const coffee = el('button', 'btn btn-sm', '☕ 冰美式冷静(¥800)');
      coffee.onclick = () => {
        if (G.calmDown(app.run)) { showToast('☕ 冰美式下肚，你冷静下来了。'); }
        else showToast('钱不够，继续爆炸吧。');
        G.saveRun(app.run);
        render();
      };
      tiltRow.appendChild(coffee);
      card.appendChild(tiltRow);
    }
    let running = false;
    let t0 = 0;
    let anim = null;
    const TOTAL = G.timingTotal(app.run, t.id);
    const resetBar = () => {
      if (anim) clearInterval(anim);
      anim = null;
      running = false;
      fill.style.width = '0%';
      startBtn.textContent = '开始抢购';
    };
    startBtn.onclick = () => {
      if (!running) {
        running = true;
        t0 = Date.now();
        anim = setInterval(() => {
          const left = TOTAL - (Date.now() - t0);
          if (left <= 0) {
            clearInterval(anim);
            anim = null;
            fill.style.width = '100%';
            startBtn.textContent = '⏱ 0.0s';
            return;
          }
          fill.style.width = ((TOTAL - left) / TOTAL * 100) + '%';
          startBtn.textContent = `⏱ ${(left / 1000).toFixed(1)}s`;
        }, 50);
        // 广告弹窗干扰：概率遮挡进度条
        const adP = Math.min(0.6, 0.3 * G.diffMul(app.run));
        if (app.run.today !== 'promo' && !card.querySelector('.ad-popup') && Math.random() < adP) {
          setTimeout(() => {
            if (!running || app.screen !== 'game') return;
            const ad = el('div', 'ad-popup',
              `<div class="ad-head">📢 系统广告<button class="ad-x">✕</button></div><div class="ad-body">${randAd()}</div>`);
            card.appendChild(ad);
            ad.querySelector('.ad-x').onclick = (ev) => { ev.stopPropagation(); ad.remove(); };
            showToast('弹窗广告挡住进度条了！快关掉！');
          }, 200 + Math.floor(Math.random() * 500));
        }
        return;
      }
      const tUsed = Date.now() - t0;
      if (anim) clearInterval(anim);
      anim = null;
      const netDelay = plannedDelay !== null ? plannedDelay : G.netDelayRoll(app.run);
      const effUsed = tUsed + netDelay;
      const timingScore = Math.max(0, 1 - effUsed / TOTAL);
      const perfect = effUsed <= G.perfectThreshold(app.run);
      showToast(`🌐 网络延迟 ${netDelay}ms`);
      const usesBefore = app.run.refreshUses || 0;
      const res = G.rollPurchase(app.run, t.id, timingScore);
      G.saveRun(app.run);
      if (res.success) {
        startBtn.disabled = true;
        startBtn.textContent = '✓ 抢到了！';
        const ach = G.checkAchievements(app.run, 'purchase', { perfect });
        for (const aid of ach) unlockAchievement(aid);
        if (t.id === 'T0-1' && app.g.runCount >= 2 && usesBefore >= 5) unlockAchievement('refresh_master');
        if (res.leveledUp) showToast(`🎉 手速等级提升到 Lv.${res.newLevel}！`);
        if (res.streakBonus > 0) showToast(`🔥 连击x${app.run.streak}！额外欧气 +${res.streakBonus}`);
        if (res.rent) showToast(`🏠 月底房东来收租 ¥${res.rent}`);
        if (res.banEvent) showToast(`⚠️ 封号危机！损失 ¥${res.banEvent.loss}`);
        if (t.rewards.broadcast) showBroadcast('全服广播：林小韭，又抢到了！');
        if (!isAdFree()) setTimeout(() => showToast('📢 ' + randAd()), 300);
        setTimeout(() => { app.run.nodeId = node.onComplete; G.saveRun(app.run); render(); }, 900);
      } else {
        resetBar();
        startBtn.textContent = '没抢到……再来一次';
        if (!isAdFree()) setTimeout(() => showToast('📢 ' + randAd()), 300);
        const endCheck = G.checkEnding(app.run);
        if (endCheck === 'speedy') {
          app.run.nodeId = 'END_SPEEDY';
          G.saveRun(app.run);
          render();
          return;
        }
      }
    };
  }

  function render() {
    if (!app.el) return;
    const prevMoney = app._lastMoney;
    syncSkins();
    applySkin();
    let done = false;
    if (app.screen === 'title') { renderTitle(); done = true; }
    if (app.screen === 'school') { renderSchool(); done = true; }
    if (app.screen === 'game') { renderGame(); done = true; }
    if (app.screen === 'market') { renderMarket(); done = true; }
    if (app.screen === 'shop') { renderShop(); done = true; }
    if (app.screen === 'collection') { renderCollection(); done = true; }
    if (app.screen === 'ledger') { renderLedger(); done = true; }
    if (app.screen === 'endless') { renderEndless(); done = true; }
    if (app.screen === 'ending') { renderEnding(); done = true; }
    if (app.screen === 'achievements') { renderAchievements(); done = true; }
    if (app.screen === 'compliance') { renderCompliance(); done = true; }
    if (!done) return;
    if (app.run && typeof prevMoney === 'number' && app.run.money !== prevMoney) {
      spawnMoneyFloat(app.run.money - prevMoney);
    }
    if (app.run) app._lastMoney = app.run.money;
  }

  const GameUI = {
    init(appEl) {
      app.el = appEl;
      app.g = loadOrCreateGlobal();
      render();
    },
    render,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = GameUI;
  else global.GameUI = GameUI;
})(typeof window !== 'undefined' ? window : globalThis);