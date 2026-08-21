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
        skins: [], flags: {}, ended: null,
      };
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
      try { return JSON.parse(raw); } catch (e) { return null; }
    },
    saveGlobal(g) { getStorage().setItem('hn_global', JSON.stringify(g)); },
    loadGlobal() {
      const raw = getStorage().getItem('hn_global');
      if (!raw) return null;
      try { return JSON.parse(raw); } catch (e) { return null; }
    },
    newRun(g) {
      g.runCount = (g.runCount || 0) + 1;
      g.reverseUnlocked = g.runCount >= 2;
      this.saveGlobal(g);
      const run = this.createRun();
      run.flags.reverseUnlocked = g.reverseUnlocked;
      return run;
    },

    rollPurchase(run, taskId, timingScore) {
      const t = D.TASKS[taskId];
      if (!t) return { success: false, luckGain: 0, leveledUp: false, newLevel: run.level };
      const rate = this.getTaskRate(run, taskId);
      const effectiveRate = Math.min(1, rate + timingScore * 0.4 + (run.refreshBuff || 0));
      const success = _rng() < effectiveRate;
      const oldLevel = run.level;
      const baseGain = success ? 50 : 20;
      const consolation = success ? 0 : (run.failStreak + 1) * 5;
      const luckGain = baseGain + consolation;
      if (success) {
        run.failStreak = 0;
        this.addLuck(run, luckGain);
        this.advanceProgress(run, taskId, 1);
      } else {
        run.failStreak += 1;
        this.addLuck(run, luckGain);
      }
      return { success, luckGain, leveledUp: run.level > oldLevel, newLevel: run.level };
    },

    advanceProgress(run, taskId, n) {
      const t = D.TASKS[taskId];
      if (!t) return { taskCompleted: false, rewards: {} };
      if (taskId === run.currentTask) run.taskProgress += n;
      if (run.taskProgress < t.progressTarget) return { taskCompleted: false, rewards: {} };
      return this.completeTask(run, taskId);
    },

    completeTask(run, taskId) {
      const t = D.TASKS[taskId];
      const rw = t.rewards || {};
      if (rw.luck) this.addLuck(run, rw.luck);
      if (rw.money) run.money += rw.money;
      if (rw.level && rw.level > run.level) {
        run.level = rw.level;
        const need = LEVELS[rw.level].luckReq;
        if (run.luck < need) run.luck = need;
      }
      if (rw.unlock && typeof rw.unlock === 'string' && rw.unlock.startsWith('flag:')) {
        run.flags[rw.unlock.slice(5)] = true;
      }
      if (!run.tasksCompleted.includes(taskId)) run.tasksCompleted.push(taskId);
      run.refreshBuff = 0;
      run.refreshUses = 0;
      if (t.nextTask) {
        run.currentTask = t.nextTask;
        run.taskProgress = 0;
        const next = D.TASKS[t.nextTask];
        if (next && next.chapter !== run.chapter) run.chapter = next.chapter;
      }
      return { taskCompleted: true, rewards: rw };
    },

    applyChoice(run, choiceId) {
      const node = D.STORY[run.nodeId];
      const choice = node.choices.find(c => c.id === choiceId);
      if (!choice) return { nextNode: run.nodeId };
      const eff = choice.effect || {};
      if (eff.money) run.money += eff.money;
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
      this.saveGlobal(g);
      run.ended = endingId;
      this.saveRun(run);
      return endingId;
    },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = GameEngine;
  else global.GameEngine = GameEngine;
})(typeof window !== 'undefined' ? window : globalThis);