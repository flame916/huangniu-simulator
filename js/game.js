(function (global) {
  const D = (typeof require !== 'undefined') ? require('./data.js') : global.GameData;
  const LEVELS = D.LEVELS;

  let _rng = Math.random;
  let _storage = null;

  function getStorage() {
    if (_storage) return _storage;
    if (typeof global.localStorage !== 'undefined') return global.localStorage;
    const mem = {};
    return {
      getItem: k => (k in mem) ? mem[k] : null,
      setItem: (k, v) => { mem[k] = String(v); },
      removeItem: k => { delete mem[k]; },
    };
  }

  const GameEngine = {
    setRng: fn => { _rng = fn; },
    setStorage: s => { _storage = s; },

    createRun() {
      return {
        version: 1, chapter: 'prologue', nodeId: 'P0',
        luck: 0, level: 0, money: 0,
        currentTask: 'T0-1', taskProgress: 0,
        tasksCompleted: [], failStreak: 0, oldManSales: 0, reverseSales: 0,
        risk: 0, streak: 0, staff: { night: 0, tech: 0, talk: 0, intel: 0 },
        school: null, inventory: [], marketIdx: 100, conscience: 0, boughtBuff: 0,
        endless: false, score: 0, fails: 0,
        skins: [], flags: {}, ended: null,
      };
    },

    timingTotal(run) { return run.school === 'hand' ? 1800 : 1200; },
    perfectThreshold(run) { return run.school === 'hand' ? 450 : 350; },

    staffCount(run, type) {
      return (run.staff && run.staff[type]) || 0;
    },

    addRisk(run, amount) {
      const tech = this.staffCount(run, 'tech');
      const relief = (run.school === 'people' ? 1 : 0);
      const gain = Math.max(1, amount - tech - relief);
      run.risk = Math.min(100, Math.max(0, (run.risk || 0) + gain));
      return gain;
    },

    getLevel(luck) {
      let lvl = 0;
      for (let i = 0; i < LEVELS.length; i++) {
        if (luck >= LEVELS[i].luckReq) lvl = i;
      }
      return lvl;
    },

    getTaskRate(run, taskId) {
      const t = D.TASKS[taskId];
      if (!t) return 0;
      const cap = LEVELS[Math.min(run.level, LEVELS.length - 1)].cap;
      return Math.min(t.baseRate, cap);
    },

    addLuck(run, amount) {
      run.luck += amount;
      const newLevel = this.getLevel(run.luck);
      const leveledUp = newLevel > run.level;
      run.level = newLevel;
      return { leveledUp, newLevel };
    },

    saveRun(run) { getStorage().setItem('hn_run', JSON.stringify(run)); },
    loadRun() {
      const raw = getStorage().getItem('hn_run');
      if (!raw) return null;
      try { return this.migrateRun(JSON.parse(raw)); } catch (e) { return null; }
    },
    migrateRun(run) {
      if (!run || typeof run !== 'object') return run;
      const fresh = this.createRun();
      for (const k of Object.keys(fresh)) {
        if (run[k] === undefined) run[k] = fresh[k];
      }
      if (!run.staff || typeof run.staff !== 'object') run.staff = { night: 0, tech: 0, talk: 0, intel: 0 };
      if (!Array.isArray(run.inventory)) run.inventory = [];
      return run;
    },
    saveGlobal(g) { getStorage().setItem('hn_global', JSON.stringify(g)); },
    loadGlobal() {
      const raw = getStorage().getItem('hn_global');
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (e) { return null; }
    },
    newRun(g, school) {
      g.runCount = (g.runCount || 0) + 1;
      g.reverseUnlocked = g.runCount >= 2;
      this.saveGlobal(g);
      const run = this.createRun();
      run.school = school || null;
      if (school === 'capital') run.money = 5000;
      run.flags.reverseUnlocked = g.reverseUnlocked;
      return run;
    },

    advanceMarket(run) {
      const delta = Math.floor(_rng() * 21) - 8;
      run.marketIdx = Math.min(130, Math.max(90, (run.marketIdx || 100) + delta));
      for (const it of (run.inventory || [])) it.held += 1;
      return run.marketIdx;
    },

    itemValue(run, item) {
      return Math.round(item.base * (run.marketIdx / 100) * Math.pow(0.92, item.held || 0));
    },

    sellItem(run, index, channel) {
      const item = run.inventory[index];
      if (!item) return { ok: false, gain: 0 };
      const value = this.itemValue(run, item);
      const r = _rng();
      let mult = 1;
      let outcome = '';
      if (channel === 'retail') {
        if (r < 0.7) { mult = 1.35; outcome = '零售高价出手！'; }
        else { mult = 0.95; outcome = '被砍了点价……'; }
      } else if (channel === 'wholesale') {
        mult = run.school === 'people' ? 0.9 : 0.85; outcome = '同行秒收，走量落袋。';
      } else if (channel === 'vip') {
        if (r < 0.85) { mult = 1.6; outcome = '大客户包圆，赚翻了！'; }
        else { mult = 0; outcome = '遇到骗子，血本无归！'; }
      }
      const gain = Math.round(value * mult);
      run.money = (run.money || 0) + gain;
      run.inventory.splice(index, 1);
      return { ok: true, gain, outcome, value };
    },

    rollPurchase(run, taskId, timingScore) {
      const t = D.TASKS[taskId];
      if (!t) return { success: false, luckGain: 0, leveledUp: false, newLevel: run.level };
      const rate = this.getTaskRate(run, taskId);
      const nightBonus = this.staffCount(run, 'night') * 0.03;
      const effectiveRate = Math.min(1, rate + timingScore * 0.4 + (run.refreshBuff || 0) + nightBonus + (run.boughtBuff || 0));
      const success = _rng() < effectiveRate;
      const oldLevel = run.level;
      const baseGain = success ? 50 : 20;
      const consolation = success ? 0 : (run.failStreak + 1) * 5;
      if (success) {
        run.failStreak = 0;
        run.streak = (run.streak || 0) + 1;
      } else {
        run.failStreak += 1;
        run.streak = 0;
      }
      const streakMul = run.school === 'hand' ? 2 : 1;
      const streakBonus = success ? Math.min(run.streak, 5) * 10 * streakMul : 0;
      const luckGain = baseGain + consolation + streakBonus;
      this.addRisk(run, success ? 4 : 2);
      let ap = { taskCompleted: false, rewards: {}, rent: 0, banEvent: null };
      if (success) {
        this.addLuck(run, luckGain);
        if (t.loot && !run.endless) {
          run.inventory.push({ name: t.loot.name, base: t.loot.base, held: 0 });
        }
        ap = this.advanceProgress(run, taskId, 1);
      } else {
        this.addLuck(run, luckGain);
      }
      return { success, luckGain, streakBonus, leveledUp: run.level > oldLevel, newLevel: run.level, rent: ap.rent || 0, banEvent: ap.banEvent || null };
    },

    advanceProgress(run, taskId, n) {
      const t = D.TASKS[taskId];
      if (!t) return { taskCompleted: false, rewards: {} };
      if (taskId === run.currentTask) {
        run.taskProgress += n;
        if (t.mode === 'rapid') this.addRisk(run, 2);
      }
      if (run.taskProgress < t.progressTarget) return { taskCompleted: false, rewards: {} };
      return this.completeTask(run, taskId);
    },

    resolveRiskCheck(run) {
      const risk = run.risk || 0;
      if (risk < 60) return { safe: true, loss: 0, risk };
      const loss = Math.min(run.money || 0, 5000 + risk * 100);
      run.money = (run.money || 0) - loss;
      run.risk = Math.max(0, risk - 30);
      return { safe: false, loss, risk };
    },

    completeTask(run, taskId) {
      const t = D.TASKS[taskId];
      const rw = t.rewards || {};
      if (rw.luck) this.addLuck(run, rw.luck);
      if (rw.money) {
        const talkMul = 1 + 0.2 * this.staffCount(run, 'talk');
        run.money += Math.round(rw.money * talkMul);
      }
      if (rw.level && rw.level > run.level) {
        run.level = rw.level;
        const need = LEVELS[rw.level].luckReq;
        if (run.luck < need) run.luck = need;
      }
      if (rw.unlock && typeof rw.unlock === 'string' && rw.unlock.startsWith('flag:')) {
        run.flags[rw.unlock.slice(5)] = true;
      }
      if (rw.conscience) run.conscience = (run.conscience || 0) + rw.conscience;
      if (!run.tasksCompleted.includes(taskId)) run.tasksCompleted.push(taskId);
      run.refreshBuff = 0;
      run.refreshUses = 0;
      run.boughtBuff = 0;
      this.advanceMarket(run);
      let rent = 0;
      let banEvent = null;
      if (t.nextTask) {
        run.currentTask = t.nextTask;
        run.taskProgress = 0;
        const next = D.TASKS[t.nextTask];
        if (next && next.chapter !== run.chapter) {
          run.chapter = next.chapter;
          rent = run.school === 'capital' ? 1000 : 2000;
          run.money = Math.max(0, (run.money || 0) - rent);
        }
      }
      const banChance = run.school === 'people' ? 0.2 : 0.4;
      if ((run.risk || 0) >= 60 && _rng() < banChance) {
        const loss = Math.ceil((run.money || 0) * 0.2);
        if (loss > 0) {
          run.money -= loss;
          banEvent = { loss };
        }
      }
      return { taskCompleted: true, rewards: rw, rent, banEvent };
    },

    applyChoice(run, choiceId) {
      const node = D.STORY[run.nodeId];
      const choice = node.choices.find(c => c.id === choiceId);
      if (!choice) return { nextNode: run.nodeId };
      const eff = choice.effect || {};
      if (eff.money) run.money += eff.money;
      if (eff.risk) this.addRisk(run, eff.risk);
      if (eff.setTask && D.TASKS[eff.setTask]) {
        run.currentTask = eff.setTask;
        run.taskProgress = 0;
      }
      if (eff.oldManSale) {
        run.oldManSales += eff.oldManSale;
        this.checkAchievements(run, 'oldManSale', {});
      }
      if (eff.flag) run.flags[eff.flag] = true;
      if (eff.ending === 'A') run.flags.endingA = true;
      if (eff.ending === 'B') run.flags.endingB = true;
      run.nodeId = choice.next;
      return { nextNode: run.nodeId };
    },

    nodeAfter(run, nodeId) {
      const n = D.STORY[nodeId];
      if (!n) return nodeId;
      if (n.type === 'task' && run.tasksCompleted.includes(n.taskId)) return n.onComplete || nodeId;
      if (n.next) return n.next;
      return nodeId;
    },

    checkEnding(run) {
      if (run.failStreak >= 20 && run.chapter === 'prologue') return 'speedy';
      if (run.flags.endingB && run.reverseSales >= 10 && run.flags.reverseUnlocked) return 'hidden';
      const node = D.STORY[run.nodeId];
      if (node && node.type === 'ending') return node.ending;
      if (run.flags.endingB) return 'B';
      if (run.flags.endingA) return 'A';
      return null;
    },

    checkAchievements(run, eventName, ctx) {
      const unlocked = [];
      if (eventName === 'oldManSale' && run.oldManSales >= 3) unlocked.push('what_for');
      if (eventName === 'purchase' && ctx.perfect) unlocked.push('hand_speed');
      return unlocked;
    },

    endingEffects(run, endingId, g) {
      if (!g.endingsSeen.includes(endingId)) g.endingsSeen.push(endingId);
      if (endingId === 'B') {
        if (!g.skinsOwned.includes('hidden')) g.skinsOwned.push('hidden');
        if (!g.achievements.includes('sacrifice_100')) g.achievements.push('sacrifice_100');
      }
      if (endingId === 'hidden') {
        if (!g.achievements.includes('reverse_cowboy')) g.achievements.push('reverse_cowboy');
      }
      if (g.skinsOwned.length >= 4 && !g.achievements.includes('father_love')) g.achievements.push('father_love');
      if ((run.conscience || 0) >= 20 && !g.achievements.includes('clearheaded')) g.achievements.push('clearheaded');
      if (!g.endlessUnlocked) { g.endlessUnlocked = true; this.saveGlobal(g); }
      this.saveGlobal(g);
      run.ended = endingId;
      this.saveRun(run);
      return endingId;
    },

    recordEndless(g, score) {
      if (!Array.isArray(g.endlessBest)) g.endlessBest = [];
      g.endlessBest.push({ score, date: new Date().toISOString().slice(0, 10) });
      g.endlessBest.sort((a, b) => b.score - a.score);
      g.endlessBest = g.endlessBest.slice(0, 5);
      this.saveGlobal(g);
      return g.endlessBest;
    },

    endlessWave(run) {
      const wave = Math.floor((run.score || 0) / 3000) + 1;
      const types = ['timing', 'rapid', 'captcha'];
      const type = types[Math.floor(_rng() * types.length)];
      return {
        wave,
        type,
        name: `第 ${wave} 单 · ${type === 'timing' ? '秒杀时刻' : type === 'rapid' ? '扫货急件' : '人机之战'}`,
        base: 800 + wave * 400,
        taps: 5,
        rate: Math.min(0.9, 0.35 + wave * 0.05),
      };
    },

    endlessSuccess(run, profit) {
      run.score = (run.score || 0) + profit;
      run.money = (run.money || 0) + profit;
      this.addRisk(run, 6);
      return run.score;
    },

    endlessFail(run) {
      run.fails = (run.fails || 0) + 1;
      run.streak = 0;
      this.addRisk(run, 3);
      return run.fails >= 3 || (run.money || 0) < 0;
    },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = GameEngine;
  else global.GameEngine = GameEngine;
})(typeof window !== 'undefined' ? window : globalThis);