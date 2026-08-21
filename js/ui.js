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

  function renderTitle() {
    const hasRun = !!G.loadRun();
    app.el.innerHTML = '';
    const h = el('div', 'title-screen');
    h.appendChild(el('h1', 'title-name', '黄牛模拟器'));
    h.appendChild(el('p', 'title-sub', '沙雕讽刺 · 系统流 · 黑色幽默'));
    const btnNew = el('button', 'btn', '新的人生');
    btnNew.onclick = () => {
      app.g = loadOrCreateGlobal();
      app.run = G.newRun(app.g);
      app.screen = 'game';
      render();
    };
    h.appendChild(btnNew);
    if (hasRun) {
      const btnContinue = el('button', 'btn', '继续上一世');
      btnContinue.onclick = () => {
        app.g = loadOrCreateGlobal();
        app.run = G.loadRun();
        app.screen = 'game';
        render();
      };
      h.appendChild(btnContinue);
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

  function renderGame() {
    app.el.innerHTML = '';
    const wrap = el('div', 'game-wrap');
    const node = D.STORY[app.run.nodeId];
    wrap.appendChild(el('div', 'chapter-banner', chapterName(app.run.chapter)));
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
    wrap.appendChild(el('p', 'ending-desc', e.desc));
    if (app.run.ended === 'B' && app.run.flags.jiuLedger) {
      wrap.appendChild(el('p', 'ending-desc ledger-note', '📎 你把九哥的账本交给了记者——管理局全产业链的证据链，齐了。'));
    }
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

  function buildCaptcha(sec, onPass) {
    sec.innerHTML = '';
    const chars = '韭牛票抢码黄号手速';
    const target = chars[Math.floor(Math.random() * chars.length)];
    const pool = chars.split('').filter(c => c !== target);
    const tiles = [];
    for (let i = 0; i < 6; i++) tiles.push(i < 2 ? target : pool[Math.floor(Math.random() * pool.length)]);
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    sec.appendChild(el('div', 'captcha-inst',
      `🤖 人机验证：请点击所有「${target}」字<br><span class="captcha-taunt">${D.CAPTCHA_LINES[Math.floor(Math.random() * D.CAPTCHA_LINES.length)]}</span>`));
    const gridEl = el('div', 'captcha-grid');
    sec.appendChild(gridEl);
    let picked = 0;
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      if (ok) {
        sec.innerHTML = '';
        sec.appendChild(el('div', 'captcha-inst', '✅ 验证通过，开抢！'));
        onPass();
      } else {
        G.addRisk(app.run, 10);
        G.saveRun(app.run);
        showToast('❌ 验证失败！风控 +10');
        buildCaptcha(sec, onPass);
      }
    };
    for (const ch of tiles) {
      const tile = el('button', 'captcha-tile', ch);
      tile.onclick = () => {
        if (done || tile.disabled) return;
        if (ch === target) {
          tile.disabled = true;
          tile.classList.add('hit');
          picked += 1;
          if (picked === 2) finish(true);
        } else {
          finish(false);
        }
      };
      gridEl.appendChild(tile);
    }
  }

  function startPurchase(node) {
    const t = D.TASKS[node.taskId];
    const card = $('.scene-card');
    card.innerHTML = '';
    card.appendChild(el('div', 'speaker', node.speaker));
    card.appendChild(el('p', 'scene-text', node.text));
    card.appendChild(el('div', 'sys-ticker', '🎵 ' + randSystemLine()));

    if (t.mode === 'hire') return renderHire(node, t, card);
    if (t.mode === 'riskcheck') return renderRiskCheck(node, t, card);

    const needCaptcha = t.id === 'T1-2' || (app.run.risk || 0) >= 30;
    if (needCaptcha) {
      const sec = el('div', 'captcha-box');
      card.appendChild(sec);
      buildCaptcha(sec, () => buildControls(card, node, t));
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
      const interval = setInterval(() => {
        remaining--;
        timerEl.textContent = `⏱ ${remaining}s`;
        if (remaining <= 0) {
          clearInterval(interval);
          tapBtn.textContent = '⏱ 超时了，点我重新开始';
          tapBtn.onclick = () => startPurchase(node);
        }
      }, 1000);
      tapBtn.onclick = () => {
        const res = G.advanceProgress(app.run, t.id, 1);
        G.saveRun(app.run);
        info.textContent = `限时 ${remaining} 秒，狂点！进度 ${app.run.taskProgress}/${t.progressTarget}`;
        if (res.taskCompleted) {
          clearInterval(interval);
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
    const buffLabel = el('span', 'buff-label', `成功率加成 +${app.run.refreshBuff}%`);
    refreshRow.appendChild(refreshBtn);
    refreshRow.appendChild(buffLabel);
    card.appendChild(refreshRow);
    refreshBtn.onclick = () => {
      app.run.refreshUses += 1;
      const intelGuaranteed = G.staffCount(app.run, 'intel') > 0;
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
      buffLabel.textContent = `成功率加成 +${app.run.refreshBuff}%`;
      G.saveRun(app.run);
    };

    const startBtn = el('button', 'btn', '开始抢购');
    card.appendChild(startBtn);
    let running = false;
    let t0 = 0;
    let anim = null;
    const TOTAL = 1200;
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
        return;
      }
      const tUsed = Date.now() - t0;
      if (anim) clearInterval(anim);
      anim = null;
      const netDelay = 60 + Math.floor(Math.random() * 201);
      const effUsed = tUsed + netDelay;
      const timingScore = Math.max(0, 1 - effUsed / TOTAL);
      const perfect = effUsed <= 350;
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
    syncSkins();
    applySkin();
    if (app.screen === 'title') return renderTitle();
    if (app.screen === 'game') return renderGame();
    if (app.screen === 'ending') return renderEnding();
    if (app.screen === 'achievements') return renderAchievements();
    if (app.screen === 'compliance') return renderCompliance();
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