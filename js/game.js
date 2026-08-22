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
        day: 1, marketPhase: 'flat', marketLeft: 2, today: 'normal',
        ledger: [], auctionCount: 0, warehouseDown: 0,
        pendingEventId: null, chainPending: null, pendingGoodNext: false,
        giftsOwned: [], giftShop: null, collection: {}, equipmentId: 'e0',
        prediction: null,
        skins: [], flags: {}, ended: null,
      };
    },

    logTransaction(run, desc, amount) {
      if (!Array.isArray(run.ledger)) run.ledger = [];
      run.ledger.unshift({ day: run.day || 1, desc, amount });
      if (run.ledger.length > 30) run.ledger.length = 30;
    },

    giftShopReroll(run) {
      const pool = [];
      for (const g of D.GIFTS) {
        if ((run.giftsOwned || []).includes(g.id)) continue;
        pool.push(g);
      }
      const order = pool.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.min(i, Math.floor(_rng() * (i + 1)));
        [order[i], order[j]] = [order[j], order[i]];
      }
      const n = Math.min(pool.length, 2 + Math.floor(_rng() * 2));
      const shop = order.slice(0, n).map(i => {
        const g = pool[i];
        const limited = _rng() < 0.10;
        const jitter = 0.8 + _rng() * 0.4;
        return { id: g.id, price: Math.round(g.price * jitter), limited };
      });
      run.giftShop = shop;
    },

    buyGift(run, giftId) {
      const entry = (run.giftShop || []).find(s => s.id === giftId);
      const g = D.GIFTS.find(x => x.id === giftId);
      if (!entry || !g) return { ok: false };
      if ((run.money || 0) < entry.price) return { ok: false, poor: true };
      run.money -= entry.price;
      this.logTransaction(run, '心愿礼物 · ' + g.name + (entry.limited ? '(限定款!)' : ''), -entry.price);
      if (!run.giftsOwned.includes(giftId)) run.giftsOwned.push(giftId);
      run.giftShop = (run.giftShop || []).filter(s => s.id !== giftId);
      const all = D.GIFTS.every(x => run.giftsOwned.includes(x.id));
      return { ok: true, limited: entry.limited, story: g.story, allOwned: all, name: g.name };
    },

    buyEquipment(nextId) {
      return D.EQUIPMENT.find(e => e.id === nextId);
    },

    capacity(run) {
      let cap = 4;
      if (run.flags && run.flags.studio) cap += 2;
      if (run.chapter === 'ch4') cap += 2;
      cap -= Math.max(0, run.warehouseDown || 0);
      return Math.max(2, cap);
    },

    canStartPurchase(run, taskId) {
      const t = D.TASKS[taskId];
      if (!t) return { ok: true };
      if (t.loot && !run.endless && (run.inventory.length >= this.capacity(run))) {
        return { ok: false, reason: '仓库已满！先去行情页出货。' };
      }
      return { ok: true };
    },

    netDelayRoll(run) {
      const eq = this.equipmentOf(run);
      const base = 60 + Math.floor(Math.random() * 201);
      return Math.max(30, base - (eq ? eq.delayRed : 0));
    },

    equipmentOf(run) {
      return D.EQUIPMENT.find(e => e.id === (run.equipmentId || 'e0')) || D.EQUIPMENT[0];
    },

    timingTotal(run, taskId) {
      let total = run.school === 'hand' ? 1800 : 1200;
      const eq = this.equipmentOf(run);
      total += eq.totalAdd || 0;
      if (taskId === 'T4-1') total = Math.round(total * 0.9);
      return total;
    },
    perfectThreshold(run) {
      const eq = this.equipmentOf(run);
      const base = run.school === 'hand' ? 450 : 350;
      return base + (eq.perfectAdd || 0);
    },

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
      const eq = this.equipmentOf(run);
      let v = item.base * (run.marketIdx / 100) * Math.pow(0.92, item.held || 0);
      if (item.quality === 'good') v *= 1.2;
      if (item.quality === 'best') v *= 1.5;
      if (item.damp) v *= 0.6;
      if (item.rare) v *= 1.5;
      if (item.fake) v = 0;
      if (run.today === 'concert') v *= 1.2;
      return Math.round(v);
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
      } else if (channel === 'auction') {
        mult = (run.school === 'people' ? 0.9 : 0.85) * 2; // placeholder, real path via sellAuction
      }
      const gain = Math.round(value * mult);
      run.money = (run.money || 0) + gain;
      run.inventory.splice(index, 1);
      if (gain > 0) this.logTransaction(run, '卖出 · ' + item.name + (item.quality && item.quality !== 'normal' ? `(${item.quality === 'best' ? '极品' : '优质'})` : ''), gain);
      return { ok: true, gain, outcome, value };
    },

    sellAuction(run, index) {
      const item = run.inventory[index];
      if (!item || item.fake) return { ok: false };
      if ((run.marketIdx || 100) < 115) return { ok: false };
      run.auctionCount = (run.auctionCount || 0) + 1;
      const phishProb = Math.min(0.35, 0.20 + 0.05 * ((run.auctionCount - 1) % 4));
      const value = this.itemValue(run, item);
      if (_rng() < phishProb) {
        run.inventory.splice(index, 1);
        this.addRisk(run, 15);
        this.logTransaction(run, '黑市钓鱼执法 · 血本无归', 0);
        return { ok: true, phished: true, loss: value, riskUp: 15 };
      }
      const mult = 1.6 + _rng() * 0.4;
      const gain = Math.round(value * mult);
      run.money += gain;
      this.addRisk(run, 12);
      run.inventory.splice(index, 1);
      this.logTransaction(run, '黑市拍卖 · ' + item.name, gain);
      return { ok: true, phished: false, gain, riskUp: 12 };
    },

    hypeItem(run, index) {
      const item = run.inventory[index];
      if (!item || item.held < 3) return { ok: false };
      item.base = Math.round(item.base * 1.15);
      item.hypeCount = (item.hypeCount || 0) + 1;
      this.addRisk(run, 6);
      if (item.hypeCount >= 3 && _rng() < 0.3) {
        item.base = Math.round(item.base * 0.5);
        item.hypeCount = 0;
        return { ok: true, exposed: true };
      }
      return { ok: true, exposed: false, base: item.base };
    },

    rollProfitOrder(run) {
      if ((run.marketIdx || 100) < 120) return null;
      if (!run.inventory.length) return null;
      if (_rng() >= 0.25) return null;
      const idx = Math.floor(_rng() * run.inventory.length);
      const fake = _rng() < 0.2;
      return { idx, mul: 1.5 + _rng() * 0.25, fake, deposit: 1500 };
    },

    acceptProfitOrder(run, order) {
      const item = run.inventory[order.idx];
      if (!item) return { ok: false };
      if (order.fake) {
        run.money = Math.max(0, (run.money || 0) - order.deposit);
        this.logTransaction(run, '暴利订单被骗 · 保证金', -order.deposit);
        return { ok: true, faked: true, loss: order.deposit };
      }
      const gain = Math.round(this.itemValue(run, item) * order.mul);
      run.money += gain;
      run.inventory.splice(order.idx, 1);
      this.logTransaction(run, '神秘买家订单 · ' + item.name, gain);
      return { ok: true, faked: false, gain };
    },

    rollPurchase(run, taskId, timingScore) {
      const t = D.TASKS[taskId];
      if (!t) return { success: false, luckGain: 0, leveledUp: false, newLevel: run.level };
      const rate = this.getTaskRate(run, taskId);
      const nightBonus = this.staffCount(run, 'night') * 0.03;
      let effectiveRate = Math.min(1, rate + timingScore * 0.4 + (run.refreshBuff || 0) + nightBonus + (run.boughtBuff || 0));
      if (t.loot && t.loot.base >= 8000) effectiveRate -= 0.10;
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

    rollDailyEventId(run) {
      if (run.chainPending === 'betrayal') {
        run.chainPending = null;
        return '__betrayal__';
      }
      if (run.pendingGoodNext) {
        run.pendingGoodNext = false;
        return '__coupon__';
      }
      const prob = run.today === 'crackdown' ? 0.35 : 0.18;
      if (_rng() >= prob) return null;
      const pool = D.EVENTS.filter(e => !(e.id === 'waterDamage' && run.school === 'people'));
      const totalW = pool.reduce((s, e) => s + e.weight, 0);
      let r = _rng() * totalW;
      for (const e of pool) {
        r -= e.weight;
        if (r <= 0) return e.id;
      }
      return pool[0].id;
    },

    applyEventOption(run, eventId, optIdx) {
      const ev = D.EVENTS.find(e => e.id === eventId);
      let resultText = '';
      if (eventId === '__betrayal__') {
        if (run.inventory.length) {
          const idx = Math.floor(_rng() * run.inventory.length);
          const it = run.inventory.splice(idx, 1)[0];
          resultText = `阿强连夜跑路，顺走了你的「${it.name}」。人心散了，队伍不好带。`;
          this.logTransaction(run, '小弟叛逃 · 损失' + it.name, 0);
        } else {
          resultText = '阿强跑路了。还好仓库是空的，没东西可偷——这算是穷的幸运吗？';
        }
        return { done: true, text: resultText };
      }
      if (eventId === '__coupon__') {
        run.money += 500;
        this.logTransaction(run, '平台补偿优惠券', 500);
        return { done: true, text: '平台客服主动送来 ¥500 补偿券："给您添堵了，对不起。"祸福相依，古人诚不欺我。' };
      }
      if (!ev || !ev.options[optIdx]) return { done: true, text: '' };
      const opt = ev.options[optIdx];
      switch (ev.id) {
        case 'waterDamage':
          run.money = Math.max(0, (run.money || 0) - opt.cost);
          this.logTransaction(run, '手机维修', -opt.cost);
          resultText = `花 ¥${opt.cost} 修好了机器。师傅说："你这损耗率，建议买我们的年卡。"`;
          break;
        case 'broArrested':
          if (run.school === 'people') {
            resultText = '你一个电话打给老江湖，十分钟后阿强完好无损回来了。"哥，你在道上到底啥地位？"';
          } else {
            run.money = Math.max(0, (run.money || 0) - opt.cost);
            this.logTransaction(run, '捞人费用', -opt.cost);
            if (_rng() < 0.10) run.chainPending = 'betrayal';
            resultText = '人捞出来了，但看他的眼神，总觉得有什么东西不一样了……';
          }
          break;
        case 'reported':
          run.money = Math.max(0, (run.money || 0) - opt.cost);
          this.addRisk(run, 5);
          this.logTransaction(run, '平台罚款', -opt.cost);
          resultText = '罚款交了，风控涨了。九头鸟残部在群里发了个月亮的表情。';
          if (_rng() < 0.25) { run.pendingGoodNext = true; }
          break;
        case 'dampStock': {
          const cands = (run.inventory || []).filter(i => !i.damp && !i.fake);
          if (cands.length) {
            const it = cands[Math.floor(_rng() * cands.length)];
            it.damp = true;
            if (_rng() < 0.25) { run.pendingGoodNext = true; run._dampRareCandidate = it.name; }
            resultText = `「${it.name}」受了潮，卖相差了。不过老收货的说过：受潮的限量款，有时候叫孤品。`;
          } else {
            resultText = '还好仓库空空如也，水淹不到空气。';
          }
          break;
        }
        case 'auditFreeze': {
          const loss = Math.ceil((run.money || 0) * 0.05);
          run.money -= loss;
          this.logTransaction(run, '平台冻结放血', -loss);
          resultText = `冻结了 ¥${loss}。七天后解冻，但利息？不存在的。`;
          break;
        }
        case 'relativeBorrow':
          run.conscience = (run.conscience || 0) + (opt.conscience || 0);
          if (opt.cost > 0) {
            run.money = Math.max(0, (run.money || 0) - opt.cost);
            this.logTransaction(run, '表叔借款', -opt.cost);
            resultText = '钱转过去了。表叔发来一个"抱拳"表情，和一段60秒语音。你没敢听。';
          } else {
            resultText = '"叔，我最近也难。"你说完就把他删了。成年人的绝交，安静得像退群。';
          }
          break;
        case 'fanCrowdfund':
          if (opt.gain > 0) {
            run.money += opt.gain;
            this.addRisk(run, opt.risk);
            this.logTransaction(run, '粉丝众筹应援', opt.gain);
            resultText = '锦旗挂在工作室最显眼的地方。每次想摆烂，看一眼就又能干了。';
          } else {
            resultText = '你婉拒了粉丝们的好意。站长说你是"清流"，转头把集资买了周边。';
          }
          break;
        case 'fakeSwap': {
          const cands = (run.inventory || []).filter(i => !i.fake);
          if (opt.cost > 0 && cands.length) {
            run.money = Math.max(0, (run.money || 0) - opt.cost);
            this.logTransaction(run, '老师傅鉴定费', -opt.cost);
            const it = cands[Math.floor(_rng() * cands.length)];
            it.fake = false;
            resultText = `老师傅眯眼摸了三分钟，指着「${it.name}」："这件，高仿。"当场退货，躲过一劫。`;
          } else if (cands.length) {
            const it = cands[Math.floor(_rng() * cands.length)];
            it.fake = true;
            resultText = `你赌了一把。后来才知道，「${it.name}」就是那件高仿——现在它安安静静躺在仓库里，等着坑下一个买家。`;
          } else {
            resultText = '假货混进来了，可你仓库是空的。骗子白忙一场，气得骂了句方言。';
          }
          break;
        }
        default:
          if (opt.cost > 0) {
            run.money = Math.max(0, (run.money || 0) - opt.cost);
            this.logTransaction(run, ev.title, -opt.cost);
          }
          if (opt.risk) this.addRisk(run, opt.risk);
          resultText = ev.title + '。日子还得过。';
          if ((opt.cost || 0) > 0 && _rng() < 0.25) run.pendingGoodNext = true;
      }
      if (ev.id === 'scareLetter') run.flags.scareLetter = true;
      return { done: true, text: resultText };
    },

    advanceDay(run) {
      run.day = (run.day || 1) + 1;
      const sr = _rng();
      if (sr < 0.12) run.today = 'concert';
      else if (sr < 0.22) run.today = 'crackdown';
      else if (sr < 0.30) run.today = 'promo';
      else run.today = 'normal';
      // 行情相位机
      if ((run.marketLeft || 0) <= 1 || _rng() < 0.05) {
        if (_rng() < 0.05 && (run.marketPhase === 'up' || run.marketPhase === 'down')) {
          if (run.marketPhase === 'up') { run.marketIdx = Math.max(90, (run.marketIdx || 100) - 25); run.marketPhase = 'down'; }
          else { run.marketIdx = Math.min(130, (run.marketIdx || 100) + 22); run.marketPhase = 'up'; }
          run.marketLeft = 3;
        } else {
          const phases = ['up', 'down', 'flat'];
          run.marketPhase = phases[Math.floor(_rng() * 3)];
          run.marketLeft = 3 + Math.floor(_rng() * 3);
        }
      } else {
        run.marketLeft -= 1;
      }
      const jitter = 0.7 + _rng() * 0.6;
      let delta = 0;
      if (run.marketPhase === 'up') delta = Math.round((8 + _rng() * 8) * jitter);
      else if (run.marketPhase === 'down') delta = -Math.round((6 + _rng() * 7) * jitter);
      else delta = Math.round((_rng() - 0.5) * 14);
      run.marketIdx = Math.min(130, Math.max(90, (run.marketIdx || 100) + delta));
      for (const it of (run.inventory || [])) it.held += 1;
      // 炒价曝光骰
      for (const it of (run.inventory || [])) {
        if ((it.hypeCount || 0) >= 2 && _rng() < 0.12) {
          it.base = Math.round(it.base * 0.5);
          it.hypeCount = 0;
        }
      }
      // 受潮孤品转化
      if (run._dampRareCandidate) {
        const it = (run.inventory || []).find(i => i.name === run._dampRareCandidate && i.damp);
        if (it) { delete it.damp; it.rare = true; }
        run._dampRareCandidate = null;
      }
      if (run.warehouseDown > 0) run.warehouseDown -= 1;
      // 固定支出
      const costs = [];
      if (run.day > 1 && (run.day - 1) % 7 === 0) {
        const rent = run.school === 'capital' ? 1000 : 2000;
        run.money = Math.max(0, (run.money || 0) - rent);
        this.logTransaction(run, '每周房租', -rent);
        costs.push(`房租 ¥${rent}`);
      }
      if (run.day > 1 && (run.day - 1) % 3 === 0) {
        run.money = Math.max(0, (run.money || 0) - 300);
        this.logTransaction(run, '水电杂费', -300);
        costs.push('杂费 ¥300');
      }
      this.giftShopReroll(run);
      run.order = null;
      const eid = this.rollDailyEventId(run);
      run.pendingEventId = eid || null;
      return { day: run.day, today: run.today, delta, marketIdx: run.marketIdx, costs, eventId: run.pendingEventId };
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
      const firstTime = !run.tasksCompleted.includes(taskId);
      if (firstTime) run.tasksCompleted.push(taskId);
      if (t.loot && !run.endless && firstTime) {
        const qr = _rng();
        const quality = qr < 0.08 ? 'best' : qr < 0.30 ? 'good' : 'normal';
        const item = { name: t.loot.name, base: t.loot.base, held: 0, quality };
        if (run.inventory.length < this.capacity(run)) {
          run.inventory.push(item);
        }
        const col = run.collection || (run.collection = {});
        if (!col[t.loot.name]) col[t.loot.name] = { count: 0, best: quality };
        col[t.loot.name].count += 1;
        const rank = { normal: 0, good: 1, best: 2 };
        if (rank[quality] > rank[col[t.loot.name].best]) col[t.loot.name].best = quality;
      }
      run.refreshBuff = 0;
      run.refreshUses = 0;
      run.boughtBuff = 0;
      this.advanceDay(run);
      let rent = 0;
      let banEvent = null;
      if (t.nextTask) {
        run.currentTask = t.nextTask;
        run.taskProgress = 0;
        const next = D.TASKS[t.nextTask];
        if (next && next.chapter !== run.chapter) {
          run.chapter = next.chapter;
        }
      }
      const banChance = run.school === 'people' ? 0.2 : 0.4;
      if ((run.risk || 0) >= 60 && _rng() < banChance) {
        const loss = Math.ceil((run.money || 0) * 0.2);
        if (loss > 0) {
          run.money -= loss;
          this.logTransaction(run, '封号危机 · 库存折损', -loss);
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
      if (D.GIFTS.every(x => (run.giftsOwned || []).includes(x.id)) && !g.achievements.includes('heartfull')) g.achievements.push('heartfull');
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