// core.js — game data, math, save, and simulation
;(function(global){
  const G = {
    version: '0.2.0',
    state: null,
    buymode: '1',
    now(){ return Date.now() },
    fmt(n){
      if (!isFinite(n)) return '∞';
      const abs = Math.abs(n);
      const suff = ['','K','M','B','T','aa','ab','ac','ad','ae','af','ag'];
      if (abs < 1000) return n.toFixed(0);
      let idx = 0;
      while (n >= 1000 && idx < suff.length-1){ n/=1000; idx++; }
      return n.toFixed(2)+' '+suff[idx];
    },

    // animals roster (bases set to 50k → 50M → 50B → 50T; m = 1.30 per buy)
    roster: [
      { key:'monkey',   name:'Monkey',   emoji:'🐒', base:1,     prod:1,   m:1.30, unlock(){return true},                 special:'Starts your jungle' },
      { key:'zebra',    name:'Zebra',    emoji:'🦓', base:5e4,   prod:10,  m:1.30, unlock(){return true},                 special:'Each Zebra: Monkeys +0.5% output' },
      { key:'gorilla',  name:'Gorilla',  emoji:'🦍', base:5e7,   prod:25,  m:1.30, unlock(){return true},                 special:'Buffs Monkeys & Zebras +1% each' },
      { key:'elephant', name:'Elephant', emoji:'🐘', base:5e10,  prod:120, m:1.30, unlock(){return true},                 special:'Occasional 10x burst; +30min offline cap each' },
      { key:'parrot',   name:'Parrot',   emoji:'🦜', base:5e13,  prod:0.5, m:1.30, unlock(){return true},                 special:'+10% global speed & random caches' },
    ],
  };

  // ---------- State ----------
  function freshState(){
    const units = {};
    for (const r of G.roster){
      units[r.key] = { count:0, base:r.base, m:r.m, prod:r.prod };
    }
    // Start with 1 monkey producing 1/sec
    units.monkey.count = 1;
    return {
      food: 0,
      relics: 0,
      totalProduced: 0,
      units,
      upgrades: {},
      lastSave: G.now(),
      lastTick: G.now(),
      offlineCapMins: 60, // base 60 minutes; +30 per elephant
      speedMult: 1,       // parrots add +10% each
      milestone: {},      // per-key doubles per 25
      econ130: true,      // marker for migrated economy
    };
  }

  // ---------- Pricing (geometric) ----------
  // Exact geometric sum cost for qty buys starting at `have`
  function costOf(key, have, qty, base, m){
    const a = m || 1.30;
    const q = parseInt(qty,10) || 1;
    const first = base * Math.pow(a, have);
    if (a === 1) return first * q;
    return first * (Math.pow(a, q) - 1) / (a - 1);
  }

  // Closed-form "buy max" using geometric sum inversion
  function maxAffordable(key, have, base, m, food){
    const a = m || 1.30;
    const head = base * Math.pow(a, have);
    if (food < head) return 0;
    if (a === 1) return Math.floor(food / head);
    const q = Math.floor( Math.log( (food*(a-1))/head + 1 ) / Math.log(a) );
    return Math.max(0, q|0);
  }

  // ---------- Production ----------
  function milestoneMult(count){
    // every 25 increases output x2 (multiplicative)
    const tiers = Math.floor(count/25);
    return Math.pow(2, tiers);
  }

  function computeFPS(s){
    // Per-type production with milestones
    const monkeys = s.units.monkey.count;
    const zebras  = s.units.zebra.count;
    const gor     = s.units.gorilla.count;
    const ele     = s.units.elephant.count;
    const par     = s.units.parrot.count;

    // Synergies:
    // Zebra: +0.5% to monkeys each
    const synergyMonk = 1 + 0.005 * zebras;
    // Gorilla: +1% to monkeys & zebras each
    const gorBuff     = 1 + 0.01 * gor;

    const mFPS  = monkeys * s.units.monkey.prod   * milestoneMult(monkeys) * synergyMonk * gorBuff;
    const zFPS  = zebras  * s.units.zebra.prod    * milestoneMult(zebras)               * gorBuff;
    const gFPS  = gor     * s.units.gorilla.prod  * milestoneMult(gor);
    const eFPS  = ele     * s.units.elephant.prod * milestoneMult(ele);
    const pFPS  = par     * s.units.parrot.prod   * milestoneMult(par);

    const base = mFPS + zFPS + gFPS + eFPS + pFPS;

    // Parrot global speed (+10% each)
    const speed = 1 + 0.10 * par;
    s.speedMult = speed;

    // Relics +1% each
    return base * speed * (1 + 0.01 * (s.relics||0));
  }

  function tick(s, dt){
    // dt in seconds
    const fps = computeFPS(s);
    const gain = fps * dt;
    s.food += gain;
    s.totalProduced += gain;

    // Elephant bursts: each elephant ~10%/min chance to add 10x its prod
    const elephants = s.units.elephant.count;
    if (elephants>0){
      const perMinChance = 0.10; // 10% per minute each
      const p = 1 - Math.pow(1 - perMinChance, dt/60); // per-elem probability over dt
      const burstAmt = s.units.elephant.prod * 10;
      for (let i=0;i<elephants;i++){
        if (Math.random() < p){
          s.food += burstAmt;
          s.totalProduced += burstAmt;
        }
      }
    }

    // Parrot caches: every ~5 minutes each parrot grants 5% of hourly production
    const parrots = s.units.parrot.count;
    if (!s._parrotTimer) s._parrotTimer = 0;
    s._parrotTimer += dt;
    const interval = 300; // 5 min
    if (parrots>0 && s._parrotTimer >= interval){
      const hourly = computeFPS(s) * 3600;
      const bonus = parrots * (0.05 * hourly);
      s.food += bonus;
      s.totalProduced += bonus;
      s._parrotTimer = 0;
    }
  }

  function gameLoop(){
    const s = G.state;
    const now = G.now();
    let dt = (now - s.lastTick)/1000;
    s.lastTick = now;
    // clamp dt to avoid giant spikes (except offline calc at load)
    dt = Math.min(dt, 1.0);
    tick(s, dt);
  }

  // ---------- Save/Load/Offline ----------
  function save(){
    const s = G.state;
    s.lastSave = G.now();
    localStorage.setItem('aki.save', JSON.stringify(s));
  }
  function load(){
    const raw = localStorage.getItem('aki.save');
    if (!raw) return null;
    try{
      const s = JSON.parse(raw);
      return s;
    }catch(e){ console.warn(e); return null; }
  }
  function reset(){
    G.state = freshState();
  }
  function prestigeGain(s){
    // Relics = floor(sqrt(totalProduced / 1e12))
    return Math.floor(Math.sqrt(s.totalProduced / 1e12));
  }
  function doPrestige(){
    const s = G.state;
    const gain = prestigeGain(s);
    const relics = (s.relics||0) + gain;
    const keep = { relics };
    reset();
    G.state.relics = keep.relics;
    return gain;
  }
  function applyOffline(s, prevTime){
    const now = G.now();
    if (!prevTime) return 0;
    let elapsed = Math.max(0, Math.floor((now - prevTime)/1000)); // seconds
    // offline cap minutes base + 30 per elephant
    const capMins = s.offlineCapMins + 30 * s.units.elephant.count;
    const capped = Math.min(elapsed, capMins*60);
    const fps = computeFPS(s);
    const gained = fps * capped;
    s.food += gained;
    s.totalProduced += gained;
    return gained;
  }

  // ---------- Public API ----------
  const API = {
    G,
    init(){
      const loaded = load();
      if (loaded){
        G.state = loaded;

        // Economy migration -> set new bases & multipliers (idempotent)
        if (!G.state.econ130){
          const u = G.state.units || {};
          if (u.monkey){   u.monkey.base   = 1;     u.monkey.m   = 1.30; u.monkey.prod   = 1; }
          if (u.zebra){    u.zebra.base    = 5e4;   u.zebra.m    = 1.30; u.zebra.prod    = 10; }
          if (u.gorilla){  u.gorilla.base  = 5e7;   u.gorilla.m  = 1.30; u.gorilla.prod  = 25; }
          if (u.elephant){ u.elephant.base = 5e10;  u.elephant.m = 1.30; u.elephant.prod = 120; }
          if (u.parrot){   u.parrot.base   = 5e13;  u.parrot.m   = 1.30; u.parrot.prod   = 0.5; }
          G.state.econ130 = true;
        }

        // Ensure at least 1 monkey if save had zero animals
        try {
          const total = Object.values(G.state.units||{}).reduce((a,u)=>a+(u?.count||0),0);
          if (!total && G.state.units && G.state.units.monkey){
            G.state.units.monkey.count = 1;
          }
        } catch(e) { /* ignore */ }

        const gained = applyOffline(G.state, loaded.lastSave);
        console.log('Offline gains:', gained);
        G.state.lastTick = G.now();
      }else{
        reset();
      }

      // main loop
      setInterval(gameLoop, 1000/30);
      // autosave
      setInterval(save, 30000);
    },

    buy(key, mode){
      const s = G.state;
      const r = G.roster.find(x=>x.key===key);
      const u = s.units[key];
      const have = u.count;
      const base = u.base, m=u.m;

      let qty = 1;
      if (mode==='10') qty = 10;
      else if (mode==='100') qty = 100;
      else if (mode==='max') qty = maxAffordable(key, have, base, m, s.food);

      const price = (mode==='max')
        ? (function(){ const q=maxAffordable(key,have,base,m,s.food); return costOf(key,have,q,base,m); })()
        : costOf(key, have, qty, base, m);

      const finalQty = (mode==='max') ? maxAffordable(key, have, base, m, s.food) : qty;

      if (finalQty<=0 || s.food < price) return false;
      s.food -= price;
      u.count += finalQty;
      return true;
    },

    // Keep visible by default (UI may also call AKI.canShow)
    canShow(key){ return true; },

    computeFPS,
    save, reset, prestigeGain, doPrestige,
    costOf, maxAffordable,
  };

  global.AKI = API;
})(window);
