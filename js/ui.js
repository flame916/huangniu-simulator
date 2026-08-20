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
    bar.appendChild(el('div', 'stat', `¥ ${app.run.money}`));
    const prog = el('div', 'luck-bar');
    const fill = el('div', 'luck-fill');
    fill.style.width = pct + '%';
    prog.appendChild(fill);
    bar.appendChild(prog);
    const task = D.TASKS[app.run.currentTask];
    bar.appendChild(el('div', 'task-line', task ? `当前任务：${task.name}（${task.goal}）` : ''));
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
        const b = el('button', 'btn', '开始抢购');
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

  function startPurchase(node) {
    const t = D.TASKS[node.taskId];
    const card = $('.scene-card');
    card.innerHTML = '';
    card.appendChild(el('div', 'speaker', node.speaker));
    card.appendChild(el('p', 'scene-text', node.text));
    card.appendChild(el('div', 'sys-ticker', '🎵 ' + randSystemLine()));

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
          if (t.rewards.money) showToast(`💰 入账 ¥${t.rewards.money}`);
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
        startBtn.textContent = '抢！';
        t0 = Date.now();
        anim = setInterval(() => {
          const p = (Date.now() - t0) / TOTAL;
          fill.style.width = Math.min(100, p * 100) + '%';
          if (p >= 1) { clearInterval(anim); anim = null; }
        }, 16);
        return;
      }
      const tUsed = Date.now() - t0;
      if (anim) clearInterval(anim);
      anim = null;
      const timingScore = Math.max(0, 1 - tUsed / TOTAL);
      const perfect = timingScore >= 0.9;
      const res = G.rollPurchase(app.run, t.id, timingScore);
      G.saveRun(app.run);
      if (res.success) {
        startBtn.disabled = true;
        startBtn.textContent = '✓ 抢到了！';
        const ach = G.checkAchievements(app.run, 'purchase', { perfect });
        for (const aid of ach) unlockAchievement(aid);
        if (res.leveledUp) showToast(`🎉 手速等级提升到 Lv.${res.newLevel}！`);
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