// ui.js — UI binding & right-panel simulation (animals outside inner ring, fruit inside it)
;(function(){
  const $ = sel => document.querySelector(sel);
  const G = AKI.G;

  // DOM refs
  const elFood = $('#food');
  const elFPS = $('#fps');
  const elRelics = $('#relics');
  const elStore = $('#store');
  const elUpgrades = $('#upgrades');
  const elPrestigeGain = $('#prestigeGain');
  const elAnimals = $('#statsAnimals');

  // Canvas world
  const canvas = $('#canvas');
  const ctx = canvas.getContext('2d', { alpha:false });
  function resize(){
    const parent = canvas.parentElement || document.body;
    const rect = parent.getBoundingClientRect();
    canvas.width  = Math.max(1, Math.floor(rect.width));
    canvas.height = Math.max(1, Math.floor(window.innerHeight));
  }
  addEventListener('resize', resize); resize();

  // Sim state
  const agents = []; // {key, x,y, vx,vy, speed, emoji, sz}
  const pot = { x:0, y:0, r:0 };
  let innerR = 0; // radius of white inner ring (fruit stays inside; animals stay outside)

  const EMOJI = {
    monkey:'🐒', zebra:'🦓', gorilla:'🦍', elephant:'🐘', parrot:'🦜', pot:'🍲',
  };

  // Fruit chips (each tick adds exactly one new chip at current food)
  // {emoji,x,y,vx,vy,sz,label,raw}
  const fruits = [];
  const FRUIT_POOL = ['🍉','🍎','🍌','🍏'];
  const MAX_FRUITS = 60;

  function fruitIntervalSec(){
    const fps = Math.max(1, AKI.computeFPS(G.state));
    return 10 / fps; // "every (10*fps)" interpreted as 10/fps seconds
  }
  let fruitTimer = 0;

  const TYPE_SIZE = { monkey:44, zebra:44, gorilla:48, elephant:52, parrot:40 };

  function seedAgentsFromState(){
    agents.length = 0;
    const s = G.state;
    const mapping = ['monkey','zebra','gorilla','elephant','parrot'];
    for (const key of mapping){
      const count = s.units[key].count;
      for (let i=0;i<count;i++) agents.push(spawnAgent(key));
    }
  }

  function spawnAgent(key){
    const speedMap = { monkey:40, zebra:30, gorilla:25, elephant:18, parrot:60 };

    // Start in the annulus: from innerR + margin to pot.r * 0.85
    const minR = Math.max(10, innerR + 10);
    const maxR = Math.max(minR + 10, pot.r * 0.85);
    const ang = Math.random() * Math.PI * 2;
    const rad = minR + Math.random() * (maxR - minR);
    const x0 = pot.x + Math.cos(ang) * rad;
    const y0 = pot.y + Math.sin(ang) * rad;

    const dir = Math.random() * Math.PI * 2;
    const spd = speedMap[key] || 30;
    return {
      key, x:x0, y:y0,
      vx: Math.cos(dir)*spd, vy: Math.sin(dir)*spd,
      speed: spd,
      emoji: EMOJI[key] || '❓',
      sz: TYPE_SIZE[key] || 44,
      t: Math.random()*3
    };
  }

  function updateAgents(dt){
    const s = G.state;
    const need = {
      monkey:s.units.monkey.count, zebra:s.units.zebra.count,
      gorilla:s.units.gorilla.count, elephant:s.units.elephant.count,
      parrot:s.units.parrot.count,
    };
    const have = {monkey:0,zebra:0,gorilla:0,elephant:0,parrot:0};
    for (const a of agents) have[a.key]++;

    for (const k of Object.keys(need)){
      for (let i=have[k]; i<need[k]; i++) agents.push(spawnAgent(k));
    }
    for (let i=agents.length-1;i>=0;i--){
      const a = agents[i];
      if (have[a.key] > need[a.key]){ agents.splice(i,1); have[a.key]--; }
    }

    // Move within annulus: [innerR+margin, pot.r*0.92]
    const innerMargin = 8;
    const outerMax = pot.r * 0.92;
    const innerMin = innerR + innerMargin;

    for (const a of agents){
      a.t += dt;
      if (Math.random() < 0.02){
        const ang = Math.atan2(a.vy, a.vx) + (Math.random()*0.8 - 0.4);
        const spd = a.speed;
        a.vx = Math.cos(ang)*spd; a.vy = Math.sin(ang)*spd;
      }
      a.x += a.vx * dt; a.y += a.vy * dt;

      const dx = a.x - pot.x, dy = a.y - pot.y;
      const dist = Math.hypot(dx,dy);
      if (dist < innerMin){ // bounced *out* of the white circle
        const nx = dx/(dist||1), ny = dy/(dist||1); // outward normal
        const dot = a.vx*nx + a.vy*ny;
        a.vx -= 2*dot*nx; a.vy -= 2*dot*ny;
        a.x = pot.x + nx * innerMin * 1.02;
        a.y = pot.y + ny * innerMin * 1.02;
      }else if (dist > outerMax){ // keep inside big pot
        const nx = dx/dist, ny = dy/dist;
        const dot = a.vx*nx + a.vy*ny;
        a.vx -= 2*dot*nx; a.vy -= 2*dot*ny;
        a.x = pot.x + nx * outerMax * 0.98;
        a.y = pot.y + ny * outerMax * 0.98;
      }
    }
  }

  // -------- Fruit (inside inner ring only) --------
  function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }
  function randomInInnerCircle(){
    const r = Math.max(10, innerR - 6); // keep a hair inside the ring
    const ang = Math.random()*Math.PI*2;
    const rad = Math.sqrt(Math.random())*r;
    return { x: pot.x + Math.cos(ang)*rad, y: pot.y + Math.sin(ang)*rad };
  }
  function sizeForRaw(raw){
    const s = 26 + Math.log10(Math.max(10, raw)) * 7;
    return clamp(s, 18, 56);
  }
  function addOneFruitWithCurrentFood(){
    const s = G.state;
    const raw = Math.max(0, Math.floor(s.food));
    const label = AKI.G.fmt(raw);
    const p = randomInInnerCircle();
    const dir = Math.random()*Math.PI*2;
    const spd = 12 + Math.random()*16; // gentle drift
    const f = {
      emoji: FRUIT_POOL[(Math.random()*FRUIT_POOL.length)|0],
      x:p.x, y:p.y,
      vx:Math.cos(dir)*spd, vy:Math.sin(dir)*spd,
      sz:sizeForRaw(raw),
      label, raw
    };
    fruits.push(f);
    if (fruits.length > MAX_FRUITS) fruits.shift();
  }
  function updateFruits(dt){
    const maxR = Math.max(8, innerR - 4); // fruit must stay within the white circle
    for (const f of fruits){
      f.x += f.vx * dt; f.y += f.vy * dt;

      // occasionally steer a bit to avoid piling at rim
      if (Math.random() < 0.02){
        const toC = Math.atan2(pot.y - f.y, pot.x - f.x);
        const turn = (Math.random()*0.6 - 0.3);
        const spd = Math.hypot(f.vx, f.vy);
        const ang = toC + turn;
        f.vx = Math.cos(ang)*spd; f.vy = Math.sin(ang)*spd;
      }

      // reflect off inner circle boundary (can't go *outside* it)
      const dx = f.x - pot.x, dy = f.y - pot.y;
      const dist = Math.hypot(dx,dy);
      if (dist > maxR){
        const nx = dx/dist, ny = dy/dist;
        const dot = f.vx*nx + f.vy*ny;
        f.vx -= 2*dot*nx; f.vy -= 2*dot*ny;
        f.x = pot.x + nx * maxR * 0.98;
        f.y = pot.y + ny * maxR * 0.98;
      }
    }
  }

  // -------- Drawing --------
  function drawEmoji(emoji, x, y, px){
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${px}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.fillText(emoji, x, y);
    ctx.restore();
  }
  function drawValueLabel(x, y, text){
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `12px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(text, x, y + 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x, y + 6);
    ctx.restore();
  }

  function draw(){
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0,0,canvas.width,canvas.height);

    // pot geometry
    const targetX = Math.floor(canvas.width * 0.66);
    const targetY = Math.floor(canvas.height * 0.5);
    const maxR = Math.floor(Math.min(canvas.width * 0.48, canvas.height * 0.48));
    pot.r = Math.max(80, maxR);
    pot.x = Math.max(pot.r + 6, Math.min(canvas.width  - pot.r - 6, targetX));
    pot.y = Math.max(pot.r + 6, Math.min(canvas.height - pot.r - 6, targetY));

    // big pot circle
    ctx.beginPath();
    ctx.arc(pot.x, pot.y, pot.r, 0, Math.PI*2);
    ctx.fillStyle = '#18233d';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#2c3f6f';
    ctx.stroke();

    // center pot emoji
    const potSize = Math.max(64, Math.floor(pot.r * 0.45));
    drawEmoji(EMOJI.pot, pot.x, pot.y, potSize);

    // white inner ring (defines fruit boundary)
    innerR = Math.floor(potSize * 0.58);
    ctx.beginPath();
    ctx.arc(pot.x, pot.y, innerR, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // animals (outside innerR)
    for (const a of agents) drawEmoji(a.emoji, a.x, a.y, a.sz);

    // fruit chips (inside innerR)
    for (const f of fruits){
      drawEmoji(f.emoji, f.x, f.y, f.sz);
      //drawValueLabel(f.x, f.y, f.label);
    }
  }

  // -------- UI + events --------
  function makeStoreRow(r){
    const s = G.state;
    const u = s.units[r.key];
    const canSee = AKI.canShow(r.key);
    const qty = parseInt(AKI.G.buymode) || 1;
    const price = AKI.costOf(r.key, u.count, qty, u.base, u.m);

    const row = document.createElement('div');
    row.className = 'card';
    row.innerHTML = `
      <div class="row">
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="font-size:24px; line-height:1">${r.emoji||''}</div>
          <div>
            <div><strong>${r.name}</strong></div>
            <div style="color:#a9b6ff; font-size:12px">${r.special||''}</div>
          </div>
        </div>
        <div style="text-align:right">
          <div>Owned: <strong>${u.count}</strong></div>
          <div>Price (${AKI.G.buymode}): <strong>${AKI.G.fmt(price)}</strong></div>
          <div class="buygroup" style="margin-top:6px">
            <button data-buy="${r.key}" data-qty="mode">Buy ${AKI.G.buymode}</button>
          </div>
        </div>
      </div>
    `;
    row.style.display = canSee ? 'block' : 'none';
    return row;
  }

  function renderStore(){
    elStore.innerHTML = '';
    for (const r of AKI.G.roster) elStore.appendChild(makeStoreRow(r));
  }

  function renderUpgrades(){
    const s = G.state;
    const defs = [
      { id:'upg_monk_x2',  name:'Banana Diet (Monkeys x2)', cost: 1e4, test: ()=>s.units.monkey.count>=25 },
      { id:'upg_zeb_x2',   name:'Thick Stripes (Zebras x2)', cost: 1e8, test: ()=>s.units.zebra.count>=10 },
      { id:'upg_speed_20', name:'Jungle Drums (+20% speed)', cost: 1e7, test: ()=>s.units.monkey.count>=50 },
    ];
    elUpgrades.innerHTML = '';
    for (const up of defs){
      if (s.upgrades[up.id]) continue;
      if (!up.test()) continue;
      const row = document.createElement('div');
      row.className = 'card';
      row.innerHTML = `
        <div class="row" style="align-items:center; justify-content:space-between;">
          <div><strong>${up.name}</strong></div>
          <div>
            <span style="margin-right:8px">Cost: <strong>${AKI.G.fmt(up.cost)}</strong></span>
            <button data-upg="${up.id}">Purchase</button>
          </div>
        </div>
      `;
      elUpgrades.appendChild(row);
    }
  }

  const _origComputeFPS = AKI.computeFPS;
  AKI.computeFPS = function(s){
    let fps = _origComputeFPS(s);
    const monkMult = s.upgrades['upg_monk_x2'] ? 2 : 1;
    const zebMult  = s.upgrades['upg_zeb_x2'] ? 2 : 1;
    const speedAdd = s.upgrades['upg_speed_20'] ? 0.20 : 0;

    const tmp = JSON.parse(JSON.stringify(s));
    function mm(c){ return Math.pow(2, Math.floor(c/25)); }
    const gorBuff = 1 + 0.01 * tmp.units.gorilla.count;

    const monk  = tmp.units.monkey.count;
    const zebra = tmp.units.zebra.count;

    const monkeysFPS = monk  * tmp.units.monkey.prod   * mm(monk)  * (1+0.005*zebra) * gorBuff * monkMult;
    const zebrasFPS  = zebra * tmp.units.zebra.prod    * mm(zebra) * gorBuff * zebMult;
    const gorFPS     = tmp.units.gorilla.count  * tmp.units.gorilla.prod  * mm(tmp.units.gorilla.count);
    const eleFPS     = tmp.units.elephant.count * tmp.units.elephant.prod * mm(tmp.units.elephant.count);
    const parFPS     = tmp.units.parrot.count   * tmp.units.parrot.prod   * mm(tmp.units.parrot.count);

    const base = monkeysFPS + zebrasFPS + gorFPS + eleFPS + parFPS;
    const speed = 1 + 0.10*tmp.units.parrot.count + speedAdd;
    return base * speed * (1 + 0.01 * tmp.relics);
  };

  function updateStats(){
    const s = G.state;
    elFood.textContent = AKI.G.fmt(s.food);
    elFPS.textContent = AKI.G.fmt(AKI.computeFPS(s));
    elRelics.textContent = s.relics;
    elPrestigeGain.textContent = AKI.prestigeGain(s);
    const totalAnimals = Object.values(s.units).reduce((a,u)=>a+u.count,0);
    elAnimals.textContent = totalAnimals;
  }

  // Events (RESET FRUIT ON EVERY PURCHASE)
  document.body.addEventListener('click', (e)=>{
    const t = e.target;
    if (t.dataset.buymode){
      AKI.G.buymode = t.dataset.buymode;
      renderStore();
    }
    if (t.dataset.buy){
      const key = t.dataset.buy;
      let mode = '1';
      if (t.dataset.qty === 'mode') mode = AKI.G.buymode;
      if (AKI.buy(key, mode)){
        // Reset fruit view immediately on purchase
        fruits.length = 0;
        fruitTimer = 0;
        addOneFruitWithCurrentFood();

        renderStore();
        updateStats();
      }
    }
    if (t.dataset.upg){
      const id = t.dataset.upg;
      const defs = { 'upg_monk_x2':1e4, 'upg_zeb_x2':1e8, 'upg_speed_20':1e7 };
      const cost = defs[id] || 0;
      if (G.state.food >= cost){
        G.state.food -= cost;
        G.state.upgrades[id] = true;

        // Also reset fruit on upgrade purchases (optional but consistent)
        fruits.length = 0;
        fruitTimer = 0;
        addOneFruitWithCurrentFood();

        renderUpgrades();
      }else{
        alert('Not enough food for this upgrade.');
      }
    }
    if (t.id==='btnPrestige'){
      const gain = AKI.prestigeGain(G.state);
      if (gain<=0){ alert('Not enough total production yet for relics. Keep growing!'); return; }
      if (confirm(`Evolve the Jungle for +${gain} Relics? This resets animals & food.`)){
        const got = AKI.doPrestige();
        alert(`Jungle evolved! You gained ${got} relics.`);
        seedAgentsFromState();
        // fruit fully resets after prestige
        fruits.length = 0; fruitTimer = 0; addOneFruitWithCurrentFood();
        renderStore(); renderUpgrades();
      }
    }
    if (t.id==='btnSave'){ AKI.save(); alert('Saved!'); }
    if (t.id==='btnWipe'){
      if (confirm('Wipe save and restart?')){
        AKI.reset();
        seedAgentsFromState();
        fruits.length = 0; fruitTimer = 0; addOneFruitWithCurrentFood();
        renderStore(); renderUpgrades();
      }
    }
    if (t.id==='btnExport'){
      const data = localStorage.getItem('aki.save') || '';
      navigator.clipboard.writeText(data).then(()=>alert('Save copied to clipboard.'));
    }
    if (t.id==='btnImport'){
      const str = prompt('Paste your save JSON:');
      if (!str) return;
      try{
        localStorage.setItem('aki.save', str);
        location.reload();
      }catch(e){ alert('Invalid save.'); }
    }
    if (t.id==='refreshUpg'){ renderUpgrades(); }
  });

  // Loops
  function frame(){
    const dt = 1/60;

    updateAgents(dt);
    updateFruits(dt);

    fruitTimer += dt;
    const interval = fruitIntervalSec();
    if (fruitTimer >= interval){
      fruitTimer = 0;
      addOneFruitWithCurrentFood(); // add one chip with current food
    }

    draw();
    requestAnimationFrame(frame);
  }

  function stepUI(){
    updateStats();
    renderStore();
    renderUpgrades();
  }

  // Init
  AKI.init();
  seedAgentsFromState();
  updateStats();
  renderStore();
  renderUpgrades();
  // seed one fruit at start
  fruits.length = 0; fruitTimer = 0; addOneFruitWithCurrentFood();
  setInterval(stepUI, 500);
  requestAnimationFrame(frame);
})();
