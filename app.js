/* Equipo Casa · app familiar de tareas y paga semanal
 * Sin frameworks: un único fichero con la capa de datos (demo o Supabase)
 * y las pantallas (dispositivo, perfiles, PIN, vista niño, vista padres). */
'use strict';
(function () {
  const CFG = window.APP_CONFIG || {};
  const TZ = CFG.TIMEZONE || 'Europe/Madrid';
  const DEMO = !(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
  const $app = document.getElementById('app');
  const $modal = document.getElementById('modal-root');

  // ------------------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------------------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* idem */ } },
  };
  const session = {
    get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* idem */ } },
    del(k) { try { sessionStorage.removeItem(k); } catch { /* idem */ } },
  };

  function todayStr() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
  function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
  function fmtDate(d) { return d.toISOString().slice(0, 10); }
  function addDays(s, n) { const d = parseDate(s); d.setUTCDate(d.getUTCDate() + n); return fmtDate(d); }
  function mondayOf(s) { const d = parseDate(s); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return fmtDate(d); }
  function diffDays(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }
  function prettyDate(s, opts) {
    return parseDate(s).toLocaleDateString('es-ES', Object.assign({ timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }, opts));
  }
  function euros(n) { return (Math.round(Number(n) * 100) / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }); }
  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
  function sum(arr, f) { return arr.reduce((a, x) => a + Number(f(x) || 0), 0); }
  function plural(n, one, many) { return n === 1 ? one : many; }
  const DAY_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

  let toastTimer;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2400);
  }

  function confetti(from) {
    const r = from.getBoundingClientRect();
    const pieces = ['⭐', '🎉', '✨', '💫', '🌟'];
    for (let i = 0; i < 14; i++) {
      const el = document.createElement('span');
      el.className = 'confetti';
      el.textContent = pieces[i % pieces.length];
      el.style.left = (r.left + r.width / 2 - 12) + 'px';
      el.style.top = (r.top + r.height / 2 - 12) + 'px';
      el.style.setProperty('--dx', (Math.random() * 240 - 120) + 'px');
      el.style.setProperty('--dy', (Math.random() * -220 - 40) + 'px');
      el.style.setProperty('--r', (Math.random() * 360) + 'deg');
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1200);
    }
  }

  // Diálogo de confirmación propio (los confirm() del navegador quedan feos en el móvil)
  function ask(msg) {
    return new Promise(resolve => {
      const root = document.getElementById('ask-root');
      root.innerHTML = `<div class="modal-bg" style="align-items:center;z-index:80"><div class="modal" role="alertdialog" aria-modal="true" style="border-radius:24px;max-width:380px;margin:16px">
        <p style="margin:0 0 18px;font-weight:800;font-size:17px">${esc(msg)}</p>
        <div class="row"><button class="btn ghost grow" data-a="0">Cancelar</button><button class="btn grow" data-a="1">Sí</button></div></div></div>`;
      root.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', ev => {
        ev.stopPropagation(); root.innerHTML = ''; resolve(b.dataset.a === '1');
      }));
    });
  }

  // ------------------------------------------------------------------
  // Datos de ejemplo (iguales a los de supabase/schema.sql)
  // ------------------------------------------------------------------
  const SEED_TASKS = [
    ['Hacer la cama', '🛏️', 'obligatoria', 0, 'diaria'],
    ['Llevar mi plato a la cocina', '🍽️', 'obligatoria', 0, 'diaria'],
    ['Deberes hechos', '📚', 'obligatoria', 0, 'diaria'],
    ['Ropa sucia al cesto', '🧺', 'obligatoria', 0, 'diaria'],
    ['Ordenar la habitación', '🧸', 'obligatoria', 0, 'semanal'],
    ['Poner o quitar la mesa', '🍴', 'extra', 2, 'diaria'],
    ['Ayudar a cocinar', '🧑‍🍳', 'extra', 3, 'diaria'],
    ['Sacar la basura', '🗑️', 'extra', 2, 'diaria'],
    ['Leer 20 minutos', '📖', 'extra', 1, 'diaria'],
    ['Doblar y guardar la ropa', '👕', 'extra', 2, 'diaria'],
    ['Ayudar con la compra', '🛒', 'extra', 3, 'semanal'],
  ];
  const TEAM_GOAL = 'Semana en equipo: si os tratáis bien entre vosotros, el sábado elegís la peli y la cena 🍕';

  function seedDemo() {
    const kids = [
      { id: uid(), name: 'Hijo', avatar: '🦁', color: '#2f6fed', theme: 'teen', base_allowance: 5, sort: 1, pin: '1111' },
      { id: uid(), name: 'Hija', avatar: '🦄', color: '#e0457b', theme: 'kid', base_allowance: 2, sort: 2, pin: '2222' },
    ];
    const tasks = SEED_TASKS.map(([title, icon, kind, points, frequency], i) =>
      ({ id: uid(), title, icon, kind, points, frequency, kid_id: null, active: true, sort: i + 1 }));
    // Un poco de actividad para que la demo no esté vacía
    const today = todayStr(), ws = mondayOf(today);
    const completions = [];
    const add = (kid, task, day, status) => completions.push({
      id: uid(), task_id: task.id, kid_id: kid.id, status,
      period_date: task.frequency === 'semanal' ? ws : day,
      points: task.kind === 'extra' ? task.points : 0,
      created_at: new Date().toISOString(),
    });
    for (let d = ws; d < today; d = addDays(d, 1)) {
      kids.forEach((k, ki) => tasks.slice(0, 4).forEach((t, ti) => { if ((ti + ki + d.charCodeAt(9)) % 5) add(k, t, d, 'aprobada'); }));
      add(kids[0], tasks[7], d, 'aprobada');
      add(kids[1], tasks[8], d, 'aprobada');
    }
    add(kids[0], tasks[0], today, 'pendiente');
    add(kids[0], tasks[5], today, 'pendiente');
    add(kids[1], tasks[0], today, 'pendiente');
    add(kids[1], tasks[8], today, 'pendiente');
    const bonuses = [{ id: uid(), kid_id: kids[1].id, points: 2, reason: 'Ha ayudado a la abuela sin que se lo pidieran', day: today, created_at: new Date().toISOString() }];
    return {
      settings: { point_value: 0.10, max_bonus: 3, team_goal: TEAM_GOAL },
      parent_pin: '0000', kids, tasks, completions, bonuses, team_weeks: {}, closures: [],
    };
  }

  // ------------------------------------------------------------------
  // Capa de datos · MODO DEMO (todo en este dispositivo)
  // ------------------------------------------------------------------
  class LocalBackend {
    constructor() { this.key = 'equipo-casa-demo-v1'; this.db = this._load(); }
    _load() {
      const raw = store.get(this.key);
      if (raw) { try { return JSON.parse(raw); } catch { /* datos corruptos: se regeneran */ } }
      const db = seedDemo(); store.set(this.key, JSON.stringify(db)); return db;
    }
    _save() { store.set(this.key, JSON.stringify(this.db)); }
    _kid(id) { return this.db.kids.find(k => k.id === id); }
    _checkPin(kidId, pin) { const k = this._kid(kidId); if (!k || k.pin !== pin) throw new Error('PIN incorrecto'); return k; }

    async deviceReady() { return true; }
    async activateDevice() {}
    async deactivateDevice() { store.del(this.key); }
    async hasParentSession() { return true; }
    async parentSignIn() {}
    async parentCheckPin(pin) { return pin === this.db.parent_pin; }
    async exitParent() {}
    async setParentPin(pin) { this.db.parent_pin = pin; this._save(); }

    async getSettings() { return { ...this.db.settings }; }
    async getKids() {
      return this.db.kids.map(({ pin, ...k }) => ({ ...k })).sort((a, b) => a.sort - b.sort);
    }
    async getTasks() { return this.db.tasks.map(t => ({ ...t })).sort((a, b) => a.sort - b.sort); }
    async getCompletions(from, to) { return this.db.completions.filter(c => c.period_date >= from && c.period_date <= to).map(c => ({ ...c })); }
    async getPending() { return this.db.completions.filter(c => c.status === 'pendiente').map(c => ({ ...c })); }
    async getBonuses(from, to) { return this.db.bonuses.filter(b => b.day >= from && b.day <= to).map(b => ({ ...b })); }
    async getTeam(ws) { return !!this.db.team_weeks[ws]; }

    async kidLogin(kidId, pin) { this._checkPin(kidId, pin); }
    async kidMarkDone(kidId, pin, taskId) {
      this._checkPin(kidId, pin);
      const t = this.db.tasks.find(x => x.id === taskId && x.active && (!x.kid_id || x.kid_id === kidId));
      if (!t) throw new Error('Tarea no disponible');
      const today = todayStr();
      const period = t.frequency === 'semanal' ? mondayOf(today) : today;
      const points = t.kind === 'extra' ? t.points : 0;
      const ex = this.db.completions.find(c => c.task_id === taskId && c.kid_id === kidId && c.period_date === period);
      if (ex) { if (ex.status === 'rechazada') Object.assign(ex, { status: 'pendiente', points, reviewed_at: null }); }
      else this.db.completions.push({ id: uid(), task_id: taskId, kid_id: kidId, period_date: period, status: 'pendiente', points, created_at: new Date().toISOString() });
      this._save();
    }
    async kidUndo(kidId, pin, cid) {
      this._checkPin(kidId, pin);
      this.db.completions = this.db.completions.filter(c => !(c.id === cid && c.kid_id === kidId && c.status === 'pendiente'));
      this._save();
    }

    async review(ids, status) {
      this.db.completions.forEach(c => { if (ids.includes(c.id)) { c.status = status; c.reviewed_at = new Date().toISOString(); } });
      this._save();
    }
    async addBonus(kidId, points, reason) {
      this.db.bonuses.push({ id: uid(), kid_id: kidId, points, reason, day: todayStr(), created_at: new Date().toISOString() });
      this._save();
    }
    async deleteBonus(id) { this.db.bonuses = this.db.bonuses.filter(b => b.id !== id); this._save(); }
    async setTeam(ws, achieved) { this.db.team_weeks[ws] = achieved; this._save(); }
    async saveTask(t) {
      if (t.id) Object.assign(this.db.tasks.find(x => x.id === t.id), t);
      else this.db.tasks.push({ ...t, id: uid(), sort: this.db.tasks.length + 1 });
      this._save();
    }
    async deleteTask(id) {
      this.db.tasks = this.db.tasks.filter(t => t.id !== id);
      this.db.completions = this.db.completions.filter(c => c.task_id !== id);
      this._save();
    }
    async saveKid(k, pin) {
      if (k.id) Object.assign(this._kid(k.id), k, pin ? { pin } : {});
      else this.db.kids.push({ ...k, id: uid(), pin, sort: this.db.kids.length + 1 });
      this._save();
    }
    async deleteKid(id) {
      this.db.kids = this.db.kids.filter(k => k.id !== id);
      this.db.completions = this.db.completions.filter(c => c.kid_id !== id);
      this.db.bonuses = this.db.bonuses.filter(b => b.kid_id !== id);
      this.db.tasks = this.db.tasks.filter(t => t.kid_id !== id);
      this._save();
    }
    async saveSettings(s) { Object.assign(this.db.settings, s); this._save(); }
    async getClosures() { return this.db.closures.slice().sort((a, b) => b.week_start.localeCompare(a.week_start)); }
    async saveClosures(rows) {
      rows.forEach(r => {
        const ex = this.db.closures.find(c => c.week_start === r.week_start && c.kid_id === r.kid_id);
        if (ex) Object.assign(ex, r); else this.db.closures.push({ ...r, id: uid(), paid: false });
      });
      this._save();
    }
    async setPaid(id, paid) { this.db.closures.find(c => c.id === id).paid = paid; this._save(); }
  }

  // ------------------------------------------------------------------
  // Capa de datos · SUPABASE
  //  - "dev": sesión del dispositivo (cuenta familia). Permite leer y que
  //    los niños marquen tareas con su PIN.
  //  - "par": sesión de padres, separada, para no perder la del dispositivo
  //    cuando un padre valida desde el móvil de un niño.
  // ------------------------------------------------------------------
  const KID_COLS = 'id,name,avatar,color,theme,base_allowance,sort';

  class SupabaseBackend {
    constructor() {
      const mk = key => window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
        auth: { storageKey: key, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      });
      this.dev = mk('equipo-casa-device');
      this.par = mk('equipo-casa-parent');
      this.inParent = false;
    }
    get db() { return this.inParent ? this.par : this.dev; }
    async q(promise) {
      const { data, error } = await promise;
      if (error) throw new Error(error.message);
      return data;
    }
    async _hasSession(client) { const { data } = await client.auth.getSession(); return !!data.session; }

    async deviceReady() {
      if (!(await this._hasSession(this.dev))) return false;
      try { return !!(await this.q(this.dev.rpc('is_member'))); } catch { return false; }
    }
    async activateDevice(email, password) {
      const { error } = await this.dev.auth.signInWithPassword({ email, password });
      if (error) throw new Error('Email o contraseña incorrectos');
      if (!(await this.q(this.dev.rpc('is_member')))) {
        await this.dev.auth.signOut();
        throw new Error('Esta cuenta no está autorizada en la app');
      }
    }
    async deactivateDevice() {
      this.inParent = false;
      await Promise.allSettled([this.dev.auth.signOut(), this.par.auth.signOut()]);
      store.del('equipo-casa-remember');
    }
    async hasParentSession() { return this._hasSession(this.par); }
    async parentSignIn(email, password, remember) {
      const { error } = await this.par.auth.signInWithPassword({ email, password });
      if (error) throw new Error('Email o contraseña incorrectos');
      if (!(await this.q(this.par.rpc('is_parent')))) {
        await this.par.auth.signOut();
        throw new Error('Esta cuenta no es la de padres');
      }
      store.set('equipo-casa-remember', remember ? '1' : '0');
      this.inParent = true;
    }
    async parentCheckPin(pin) {
      let ok;
      try { ok = await this.q(this.par.rpc('parent_check_pin', { p_pin: pin })); }
      catch { await this.par.auth.signOut(); throw Object.assign(new Error('La sesión ha caducado'), { expired: true }); }
      if (ok) this.inParent = true;
      return !!ok;
    }
    async exitParent() {
      this.inParent = false;
      if (store.get('equipo-casa-remember') !== '1') await this.par.auth.signOut();
    }
    async setParentPin(pin) { await this.q(this.par.rpc('parent_set_own_pin', { p_pin: pin })); }

    getSettings() { return this.q(this.db.from('settings').select('point_value,max_bonus,team_goal').eq('id', 1).single()); }
    getKids() { return this.q(this.db.from('kids').select(KID_COLS).order('sort')); }
    getTasks() { return this.q(this.db.from('tasks').select('*').order('sort')); }
    getCompletions(from, to) { return this.q(this.db.from('completions').select('*').gte('period_date', from).lte('period_date', to)); }
    getPending() { return this.q(this.db.from('completions').select('*').eq('status', 'pendiente').order('created_at')); }
    getBonuses(from, to) { return this.q(this.db.from('bonuses').select('*').gte('day', from).lte('day', to).order('created_at', { ascending: false })); }
    async getTeam(ws) {
      const d = await this.q(this.db.from('team_weeks').select('achieved').eq('week_start', ws).maybeSingle());
      return !!(d && d.achieved);
    }

    async _kidRpc(fn, args) {
      const d = await this.q(this.dev.rpc(fn, args));
      if (!d || !d.ok) throw new Error((d && d.error) || 'Error');
    }
    kidLogin(kid, pin) { return this._kidRpc('kid_login', { p_kid: kid, p_pin: pin }); }
    kidMarkDone(kid, pin, task) { return this._kidRpc('kid_mark_done', { p_kid: kid, p_pin: pin, p_task: task }); }
    kidUndo(kid, pin, c) { return this._kidRpc('kid_undo', { p_kid: kid, p_pin: pin, p_completion: c }); }

    review(ids, status) {
      return this.q(this.par.from('completions').update({ status, reviewed_at: new Date().toISOString() }).in('id', ids));
    }
    addBonus(kid, points, reason) { return this.q(this.par.from('bonuses').insert({ kid_id: kid, points, reason, day: todayStr() })); }
    deleteBonus(id) { return this.q(this.par.from('bonuses').delete().eq('id', id)); }
    setTeam(ws, achieved) { return this.q(this.par.from('team_weeks').upsert({ week_start: ws, achieved })); }
    saveTask(t) {
      const row = { title: t.title, icon: t.icon, kind: t.kind, points: t.points, frequency: t.frequency, kid_id: t.kid_id, active: t.active };
      if (t.id) return this.q(this.par.from('tasks').update(row).eq('id', t.id));
      return this.q(this.par.from('tasks').insert({ ...row, sort: t.sort || 999 }));
    }
    deleteTask(id) { return this.q(this.par.from('tasks').delete().eq('id', id)); }
    async saveKid(k, pin) {
      if (k.id) {
        await this.q(this.par.from('kids').update({ name: k.name, avatar: k.avatar, color: k.color, theme: k.theme, base_allowance: k.base_allowance }).eq('id', k.id));
        if (pin) await this.q(this.par.rpc('parent_set_kid_pin', { p_kid: k.id, p_pin: pin }));
      } else {
        await this.q(this.par.rpc('parent_add_kid', { p_name: k.name, p_avatar: k.avatar, p_color: k.color, p_theme: k.theme, p_base: k.base_allowance, p_pin: pin }));
      }
    }
    deleteKid(id) { return this.q(this.par.from('kids').delete().eq('id', id)); }
    saveSettings(s) { return this.q(this.par.from('settings').update(s).eq('id', 1)); }
    getClosures() { return this.q(this.par.from('week_closures').select('*').order('week_start', { ascending: false }).limit(60)); }
    saveClosures(rows) { return this.q(this.par.from('week_closures').upsert(rows, { onConflict: 'week_start,kid_id' })); }
    setPaid(id, paid) { return this.q(this.par.from('week_closures').update({ paid }).eq('id', id)); }
  }

  // ------------------------------------------------------------------
  // Estado
  // ------------------------------------------------------------------
  let api;
  const S = {
    screen: 'loading',
    pinFor: null,          // { type: 'kid', kid } | { type: 'parent' }
    pin: '', pinError: '', busy: false,
    kid: null, kidPin: null,
    tab: 'validar',
    week: mondayOf(todayStr()),
    bonusKid: 'all', bonusPts: 2,
    d: { settings: null, kids: [], tasks: [], comps: [], bonuses: [], team: false, pending: [], closures: [] },
    modal: null,
  };

  // ------------------------------------------------------------------
  // Cálculos
  // ------------------------------------------------------------------
  function tasksFor(kidId) { return S.d.tasks.filter(t => t.active && (!t.kid_id || t.kid_id === kidId)); }

  function weekSummary(kid, ws) {
    const today = todayStr(), cur = mondayOf(today);
    const days = ws < cur ? 7 : ws === cur ? diffDays(ws, today) + 1 : 0;
    const oblig = tasksFor(kid.id).filter(t => t.kind === 'obligatoria');
    const expected = sum(oblig, t => (t.frequency === 'semanal' ? 1 : days));
    const oblIds = new Set(S.d.tasks.filter(t => t.kind === 'obligatoria').map(t => t.id));
    const mine = S.d.comps.filter(c => c.kid_id === kid.id && c.status === 'aprobada');
    const done = Math.min(mine.filter(c => oblIds.has(c.task_id)).length, expected);
    const extra = sum(mine, c => c.points);
    const bonus = sum(S.d.bonuses.filter(b => b.kid_id === kid.id), b => b.points);
    const s = S.d.settings || { point_value: 0, max_bonus: 0 };
    let bonusEur = (extra + bonus) * Number(s.point_value);
    if (Number(s.max_bonus) > 0) bonusEur = Math.min(bonusEur, Number(s.max_bonus));
    const base = Number(kid.base_allowance) || 0;
    return { expected, done, extra, bonus, bonusEur, base, total: base + bonusEur };
  }

  // ------------------------------------------------------------------
  // Carga de datos
  // ------------------------------------------------------------------
  async function loadBase() {
    const [settings, kids, tasks] = await Promise.all([api.getSettings(), api.getKids(), api.getTasks()]);
    Object.assign(S.d, { settings, kids, tasks });
  }
  async function loadKid() {
    const ws = mondayOf(todayStr());
    await loadBase();
    const [comps, bonuses, team] = await Promise.all([api.getCompletions(ws, addDays(ws, 6)), api.getBonuses(ws, addDays(ws, 6)), api.getTeam(ws)]);
    Object.assign(S.d, { comps, bonuses, team });
    const fresh = S.d.kids.find(k => k.id === S.kid.id);
    if (fresh) S.kid = fresh;
  }
  async function loadParent() {
    await loadBase();
    const ws = S.week;
    const [comps, bonuses, team, pending, closures] = await Promise.all([
      api.getCompletions(ws, addDays(ws, 6)), api.getBonuses(ws, addDays(ws, 6)), api.getTeam(ws), api.getPending(), api.getClosures(),
    ]);
    Object.assign(S.d, { comps, bonuses, team, pending, closures });
  }

  async function run(fn, okMsg) {
    try { await fn(); if (okMsg) toast(okMsg); }
    catch (e) { console.error(e); toast('⚠️ ' + (e.message || 'Algo ha fallado')); }
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  function setTheme(theme, color) {
    document.body.classList.toggle('theme-kid', theme === 'kid');
    document.body.classList.toggle('theme-teen', theme === 'teen');
    if (color) document.body.style.setProperty('--accent', color);
    else document.body.style.removeProperty('--accent');
  }

  function render() {
    const views = { loading: viewLoading, activate: viewActivate, home: viewHome, pin: viewPin, parentLogin: viewParentLogin, kid: viewKid, parent: viewParent };
    if (S.screen === 'kid') setTheme(S.kid.theme, S.kid.color);
    else if (S.screen === 'pin' && S.pinFor.type === 'kid') setTheme(S.pinFor.kid.theme, S.pinFor.kid.color);
    else setTheme(null, null);
    $app.innerHTML = (DEMO ? '<div class="banner">Modo demo · los datos son de ejemplo y solo se guardan en este dispositivo</div>' : '') + views[S.screen]();
    renderModal();
  }

  const viewLoading = () => '<div class="center-screen"><div class="spinner"></div></div>';

  function brand(sub) {
    return `<div class="brand"><img src="icons/icon.svg" alt=""><h1>Equipo Casa</h1>${sub ? `<p>${sub}</p>` : ''}</div>`;
  }

  function viewActivate() {
    return `<div class="center-screen"><div class="auth-card">
      ${brand('Activa este dispositivo')}
      <form class="card" data-form="activate">
        <p class="muted small" style="margin:0">Se hace una sola vez en cada móvil o tablet. Pídeselo a papá o mamá.</p>
        <label class="field"><span>Email</span><input class="input" id="f-email" type="email" autocomplete="username" required></label>
        <label class="field"><span>Contraseña</span><input class="input" id="f-pass" type="password" autocomplete="current-password" required></label>
        <div class="error">${esc(S.pinError)}</div>
        <button class="btn block" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Activando…' : 'Activar'}</button>
      </form>
    </div></div>`;
  }

  function greeting() {
    const h = Number(new Intl.DateTimeFormat('es-ES', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
    return h < 13 ? '¡Buenos días!' : h < 21 ? '¡Buenas tardes!' : '¡Buenas noches!';
  }

  function viewHome() {
    const kids = S.d.kids.map(k => `
      <button class="profile" style="--c:${esc(k.color)}" data-act="pick-kid" data-id="${k.id}">
        <span class="av">${esc(k.avatar)}</span><span class="nm">${esc(k.name)}</span>
      </button>`).join('');
    return `<div class="wrap" style="padding-bottom:32px">
      ${brand(greeting() + ' ¿Quién eres?')}
      <div class="profiles">
        ${kids || '<div class="empty" style="grid-column:1/-1">Todavía no hay perfiles</div>'}
        <button class="profile parent" data-act="pick-parent"><span class="av">🔐</span><span class="nm">Papá / Mamá</span></button>
      </div>
    </div>`;
  }

  function viewPin() {
    const who = S.pinFor.type === 'kid' ? S.pinFor.kid : null;
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => `<button class="key" data-act="key" data-k="${n}">${n}</button>`).join('');
    return `<div class="center-screen"><div class="pin-screen">
      <div class="av">${who ? esc(who.avatar) : '🔐'}</div>
      <h1 style="margin-top:10px">${who ? 'Hola, ' + esc(who.name) : 'Papá / Mamá'}</h1>
      <p class="muted" style="margin:6px 0 0">Escribe tu PIN${DEMO ? ` <span class="small">(demo: ${who ? (who.theme === 'teen' ? '1111' : '2222') : '0000'})</span>` : ''}</p>
      <div class="pin-dots ${S.pinError ? 'shake' : ''}">${[0, 1, 2, 3].map(i => `<i class="${i < S.pin.length ? 'on' : ''}"></i>`).join('')}</div>
      <div class="error">${esc(S.pinError)}</div>
      <div class="keypad">${keys}
        <button class="key fn" data-act="pin-cancel">Volver</button>
        <button class="key" data-act="key" data-k="0">0</button>
        <button class="key fn" data-act="key" data-k="del" aria-label="Borrar">⌫</button>
      </div>
    </div></div>`;
  }

  function viewParentLogin() {
    return `<div class="center-screen"><div class="auth-card">
      ${brand('Modo padres')}
      <form class="card" data-form="parent-login">
        <label class="field" style="margin-top:0"><span>Email de la cuenta de padres</span><input class="input" id="f-email" type="email" autocomplete="username" required></label>
        <label class="field"><span>Contraseña</span><input class="input" id="f-pass" type="password" autocomplete="current-password" required></label>
        <label class="check"><input type="checkbox" id="f-remember"> Es mi móvil: recordar y pedir solo el PIN</label>
        <div class="error">${esc(S.pinError)}</div>
        <button class="btn block" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Entrando…' : 'Entrar'}</button>
        <button type="button" class="btn ghost block" style="margin-top:10px" data-act="home">Volver</button>
      </form>
    </div></div>`;
  }

  // ---------------- Vista niño ----------------
  function kidTaskRow(t, c) {
    const st = c ? c.status : 'none';
    const pts = t.kind === 'extra' ? `<span class="pts">+${t.points} ⭐</span>` : '';
    const meta = {
      none: pts,
      pendiente: `${pts} Esperando a papá o mamá`,
      aprobada: `${pts} ¡Validada!`,
      rechazada: `${pts} Revísalo, falta algo`,
    }[st];
    const btn = {
      none: `<button class="t-btn" data-act="mark" data-id="${t.id}">¡Hecho!</button>`,
      pendiente: `<button class="t-btn" data-act="undo" data-id="${c && c.id}" aria-label="Deshacer">⏳</button>`,
      aprobada: '<button class="t-btn" disabled aria-label="Validada">✅</button>',
      rechazada: `<button class="t-btn" data-act="mark" data-id="${t.id}">Otra vez</button>`,
    }[st];
    return `<div class="task st-${st}"><span class="t-icon">${esc(t.icon)}</span>
      <div class="grow"><div class="t-title">${esc(t.title)}</div><div class="t-meta">${meta}</div></div>${btn}</div>`;
  }

  function viewKid() {
    const k = S.kid, today = todayStr(), ws = mondayOf(today);
    const mine = tasksFor(k.id);
    const comps = S.d.comps.filter(c => c.kid_id === k.id);
    const find = t => comps.find(c => c.task_id === t.id && c.period_date === (t.frequency === 'semanal' ? ws : today));
    const dailyOblig = mine.filter(t => t.kind === 'obligatoria' && t.frequency === 'diaria');
    const dailyExtra = mine.filter(t => t.kind === 'extra' && t.frequency === 'diaria');
    const weekly = mine.filter(t => t.frequency === 'semanal');

    const doneToday = dailyOblig.filter(t => { const c = find(t); return c && c.status !== 'rechazada'; }).length;
    const pct = dailyOblig.length ? Math.round(doneToday / dailyOblig.length * 100) : 100;
    const points = sum(comps.filter(c => c.status === 'aprobada'), c => c.points) + sum(S.d.bonuses.filter(b => b.kid_id === k.id), b => b.points);
    const waiting = comps.filter(c => c.status === 'pendiente').length;

    const oblIds = new Set(dailyOblig.map(t => t.id));
    const strip = DAY_LETTERS.map((l, i) => {
      const d = addDays(ws, i);
      const n = comps.filter(c => c.period_date === d && oblIds.has(c.task_id) && c.status !== 'rechazada').length;
      const p = d > today || !dailyOblig.length ? 0 : Math.round(n / dailyOblig.length * 100);
      return `<div class="${d === today ? 'today' : ''}">${l}<span style="--p:${p}"></span></div>`;
    }).join('');

    const list = (arr, empty) => arr.length
      ? `<div class="card list" style="padding:4px 4px">${arr.map(t => kidTaskRow(t, find(t))).join('')}</div>`
      : `<div class="card empty">${empty}</div>`;

    const myBonuses = S.d.bonuses.filter(b => b.kid_id === k.id);
    const s = S.d.settings || {};

    return `<div class="wrap">
      <div class="row between">
        <div class="kid-head"><span class="av">${esc(k.avatar)}</span><div><h1>Hola, ${esc(k.name)}</h1><div class="muted small">${prettyDate(today, { weekday: 'long', month: 'long' })}</div></div></div>
        <div class="row"><button class="icon-btn" data-act="refresh" aria-label="Actualizar">↻</button><button class="icon-btn" data-act="logout" aria-label="Salir">🚪</button></div>
      </div>

      <div class="hero">
        <div class="ring" style="--p:${pct}"><b>${doneToday}/${dailyOblig.length}</b></div>
        <div>
          <div class="lbl">Esta semana llevas</div>
          <div class="big">${points} ⭐</div>
          <div class="sub">${waiting ? `${waiting} ${plural(waiting, 'tarea espera', 'tareas esperan')} a papá o mamá` : pct === 100 ? '¡Hoy lo tienes todo! 🎉' : 'Lo de hoy, en el círculo'}</div>
        </div>
      </div>
      <div class="week-strip">${strip}</div>

      <div class="section-title"><h2>Lo de cada día</h2><span class="note">Somos un equipo 💪</span></div>
      ${list(dailyOblig, 'Nada por aquí')}

      <div class="section-title"><h2>Extras</h2><span class="note">Suman puntos ⭐</span></div>
      ${list(dailyExtra, 'Hoy no hay extras')}

      ${weekly.length ? `<div class="section-title"><h2>Esta semana</h2><span class="note">Una vez por semana</span></div>${list(weekly, '')}` : ''}

      <div class="section-title"><h2>Reto de hermanos</h2></div>
      <div class="card team ${S.d.team ? 'done' : ''}"><span class="emo">${S.d.team ? '🏆' : '🤝'}</span>
        <div class="grow"><div style="font-weight:800">${esc(s.team_goal || '')}</div>
        <div class="muted small" style="margin-top:4px">${S.d.team ? '¡Conseguido esta semana!' : 'Lo conseguís juntos o no lo consigue nadie'}</div></div></div>

      ${myBonuses.length ? `<div class="section-title"><h2>Puntos sorpresa</h2><span class="note">De papá y mamá</span></div>
        <div class="card">${myBonuses.map(b => `<div class="bonus-item"><span class="emo">🎁</span><div class="grow"><div style="font-weight:800">+${b.points} ⭐</div><div class="muted small">${esc(b.reason)}</div></div></div>`).join('')}</div>` : ''}
    </div>`;
  }

  // ---------------- Vista padres ----------------
  function kidById(id) { return S.d.kids.find(k => k.id === id); }
  function taskById(id) { return S.d.tasks.find(t => t.id === id); }

  function viewParent() {
    const tabs = [['validar', '✅', 'Validar'], ['puntos', '🎁', 'Puntos'], ['semana', '📅', 'Semana'], ['ajustes', '⚙️', 'Ajustes']];
    const n = S.d.pending.length;
    const body = { validar: tabValidar, puntos: tabPuntos, semana: tabSemana, ajustes: tabAjustes }[S.tab]();
    return `<div class="wrap">
      <div class="topbar"><h1>${{ validar: 'Validar', puntos: 'Puntos extra', semana: 'Semana', ajustes: 'Ajustes' }[S.tab]}</h1>
        <div class="row"><button class="icon-btn" data-act="refresh" aria-label="Actualizar">↻</button><button class="icon-btn" data-act="exit-parent" aria-label="Salir">🚪</button></div></div>
      ${body}
    </div>
    <nav class="tabbar">${tabs.map(([id, e, l]) => `<button class="${S.tab === id ? 'on' : ''}" data-act="tab" data-id="${id}"><span class="e">${e}</span>${l}${id === 'validar' && n ? `<span class="badge">${n}</span>` : ''}</button>`).join('')}</nav>`;
  }

  function tabValidar() {
    const pending = S.d.pending.slice().sort((a, b) => (a.period_date + a.created_at).localeCompare(b.period_date + b.created_at));
    let html = '';
    if (!pending.length) html += '<div class="card empty" style="margin-top:16px">🎉 Nada pendiente de validar</div>';
    else {
      html += `<div class="row between" style="margin:16px 4px 10px"><span class="muted" style="font-weight:800">${pending.length} ${plural(pending.length, 'pendiente', 'pendientes')}</span>
        <button class="btn ok sm" data-act="approve-all">Aprobar todo</button></div>`;
      S.d.kids.forEach(k => {
        const items = pending.filter(c => c.kid_id === k.id);
        if (!items.length) return;
        html += `<div class="card"><div class="kid-tag">${esc(k.avatar)} ${esc(k.name)}</div>
          ${items.map(c => {
            const t = taskById(c.task_id) || { icon: '❔', title: 'Tarea borrada', frequency: 'diaria' };
            return `<div class="review"><span class="t-icon">${esc(t.icon)}</span>
              <div class="grow"><div style="font-weight:800">${esc(t.title)}</div>
              <div class="muted small">${t.frequency === 'semanal' ? 'Semana del ' + prettyDate(c.period_date, { weekday: undefined }) : prettyDate(c.period_date)}${c.points ? ` · <span class="pts">+${c.points} ⭐</span>` : ''}</div></div>
              <div class="acts"><button class="no" data-act="review" data-id="${c.id}" data-st="rechazada" aria-label="Rechazar">✖️</button>
              <button class="yes" data-act="review" data-id="${c.id}" data-st="aprobada" aria-label="Aprobar">✔️</button></div></div>`;
          }).join('')}</div>`;
      });
    }
    // Resumen de hoy
    const today = todayStr();
    if (S.week === mondayOf(today)) {
      html += '<div class="section-title"><h2>Hoy</h2></div><div class="card">';
      html += S.d.kids.map(k => {
        const ob = tasksFor(k.id).filter(t => t.kind === 'obligatoria' && t.frequency === 'diaria');
        const cs = S.d.comps.filter(c => c.kid_id === k.id && c.period_date === today && c.status !== 'rechazada');
        const obDone = cs.filter(c => ob.some(t => t.id === c.task_id)).length;
        const ex = sum(cs, c => c.points);
        return `<div class="review"><span class="t-icon">${esc(k.avatar)}</span><div class="grow"><div style="font-weight:800">${esc(k.name)}</div>
          <div class="muted small">Obligatorias ${obDone}/${ob.length} · Extras +${ex} ⭐</div>
          <div class="bar"><i style="width:${ob.length ? Math.round(obDone / ob.length * 100) : 0}%"></i></div></div></div>`;
      }).join('');
      html += '</div><p class="muted small" style="margin:8px 4px">Incluye lo pendiente de validar.</p>';
    }
    return html;
  }

  function tabPuntos() {
    const kidsChips = S.d.kids.map(k => `<button class="chip ${S.bonusKid === k.id ? 'on' : ''}" data-act="bonus-kid" data-id="${k.id}">${esc(k.avatar)} ${esc(k.name)}</button>`).join('');
    const ptsChips = [1, 2, 3, 5].map(p => `<button class="chip ${S.bonusPts === p ? 'on' : ''}" data-act="bonus-pts" data-id="${p}">+${p} ⭐</button>`).join('');
    const reasons = ['Ha ayudado sin que se lo pidieran', 'Se ha portado genial con su hermano/a', 'Ha sido muy responsable', 'Ha tenido paciencia y buen humor'];
    const isCur = S.week === mondayOf(todayStr());
    return `<p class="muted" style="margin:8px 4px 0">Para premiar lo que no está en la lista. Aparece en su pantalla con el motivo que escribáis.</p>
      <div class="card" style="margin-top:14px">
        <div class="field" style="margin-top:0"><span>¿Para quién?</span><div class="chips">${kidsChips}<button class="chip ${S.bonusKid === 'all' ? 'on' : ''}" data-act="bonus-kid" data-id="all">🤝 Los dos</button></div></div>
        <div class="field"><span>Puntos</span><div class="chips">${ptsChips}</div></div>
        <label class="field"><span>Motivo</span><input class="input" id="f-reason" maxlength="120" placeholder="¿Qué ha hecho?"></label>
        <div class="chips" style="margin-top:8px">${reasons.map(r => `<button class="chip small" style="font-weight:700" data-act="bonus-reason" data-r="${esc(r)}">${esc(r)}</button>`).join('')}</div>
        <button class="btn block" style="margin-top:16px" data-act="bonus-add">Dar puntos 🎁</button>
      </div>
      <div class="section-title"><h2>${isCur ? 'Esta semana' : 'Semana del ' + prettyDate(S.week, { weekday: undefined })}</h2></div>
      <div class="card">${S.d.bonuses.length ? S.d.bonuses.map(b => {
        const k = kidById(b.kid_id) || { avatar: '❔', name: '' };
        return `<div class="bonus-item"><span class="emo">${esc(k.avatar)}</span><div class="grow"><div style="font-weight:800">+${b.points} ⭐ · ${esc(k.name)}</div><div class="muted small">${esc(b.reason)} · ${prettyDate(b.day)}</div></div>
          <button class="icon-btn" style="width:36px;height:36px;font-size:16px" data-act="bonus-del" data-id="${b.id}" aria-label="Borrar">🗑️</button></div>`;
      }).join('') : '<div class="empty">Aún no habéis dado puntos extra</div>'}</div>`;
  }

  function tabSemana() {
    const cur = mondayOf(todayStr());
    const s = S.d.settings;
    const cards = S.d.kids.map(k => {
      const w = weekSummary(k, S.week);
      const pct = w.expected ? Math.round(w.done / w.expected * 100) : 0;
      return `<div class="card"><div class="row between"><div class="kid-tag" style="font-size:18px">${esc(k.avatar)} ${esc(k.name)}</div><strong style="font-size:20px">${euros(w.total)}</strong></div>
        <div class="muted small" style="margin-top:10px;font-weight:800">Obligatorias: ${w.done}/${w.expected} (${pct}%)</div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="sum-grid">
          <span>Paga base</span><span class="v">${euros(w.base)}</span>
          <span>Extras validados</span><span class="v">${w.extra} ⭐</span>
          <span>Puntos sorpresa</span><span class="v">${w.bonus} ⭐</span>
          <span>Bonificación <span class="muted small">(${euros(s.point_value)}/⭐${Number(s.max_bonus) > 0 ? ', máx. ' + euros(s.max_bonus) : ''})</span></span><span class="v">${euros(w.bonusEur)}</span>
          <span class="total">Total</span><span class="v total">${euros(w.total)}</span>
        </div></div>`;
    }).join('');

    const byWeek = {};
    S.d.closures.forEach(c => { (byWeek[c.week_start] = byWeek[c.week_start] || []).push(c); });
    const history = Object.keys(byWeek).sort().reverse().map(ws => `<div class="card"><div style="font-weight:900">Semana del ${prettyDate(ws, { weekday: undefined })}${byWeek[ws][0].team_achieved ? ' · 🏆' : ''}</div>
      ${byWeek[ws].map(c => { const k = kidById(c.kid_id) || { avatar: '❔', name: '—' };
        return `<label class="check" style="justify-content:space-between"><span>${esc(k.avatar)} ${esc(k.name)} · <b>${euros(c.amount)}</b> <span class="muted small">(${c.mandatory_done}/${c.mandatory_expected} obligatorias)</span></span>
          <span class="row small">Pagada <input type="checkbox" data-act="paid" data-id="${c.id}" ${c.paid ? 'checked' : ''}></span></label>`; }).join('')}</div>`).join('');

    return `<div class="card week-nav" style="margin-top:16px;padding:8px">
        <button class="icon-btn" data-act="week" data-d="-7" aria-label="Semana anterior">◀</button>
        <strong>${S.week === cur ? 'Esta semana' : 'Semana del ' + prettyDate(S.week, { weekday: undefined })}<div class="muted small">${prettyDate(S.week, { weekday: undefined })} – ${prettyDate(addDays(S.week, 6), { weekday: undefined })}</div></strong>
        <button class="icon-btn" data-act="week" data-d="7" ${S.week >= cur ? 'disabled style="opacity:.3"' : ''} aria-label="Semana siguiente">▶</button></div>
      <div class="card team ${S.d.team ? 'done' : ''}" style="margin-top:12px"><span class="emo">${S.d.team ? '🏆' : '🤝'}</span>
        <div class="grow"><div style="font-weight:800">Reto de hermanos</div><div class="muted small">${esc(s.team_goal)}</div></div>
        <button class="btn sm ${S.d.team ? 'ghost' : 'ok'}" data-act="team">${S.d.team ? 'Deshacer' : '¡Conseguido!'}</button></div>
      <div style="margin-top:12px">${cards}</div>
      <button class="btn block" style="margin-top:14px" data-act="close-week">💾 Guardar cierre de la semana</button>
      <p class="muted small" style="margin:8px 4px">Guarda la foto de la semana en el historial. La semana nueva empieza sola cada lunes; podéis volver a guardar si validáis algo tarde.</p>
      ${history ? `<div class="section-title"><h2>Historial</h2></div>${history}` : ''}`;
  }

  function tabAjustes() {
    const s = S.d.settings;
    const kids = S.d.kids.map(k => `<button class="set-item" data-act="edit-kid" data-id="${k.id}"><span class="t-icon">${esc(k.avatar)}</span>
      <div class="grow"><div style="font-weight:800">${esc(k.name)}</div><div class="muted small">Paga base ${euros(k.base_allowance)} · ${k.theme === 'teen' ? 'Estilo mayor' : 'Estilo peque'}</div></div><span class="muted">›</span></button>`).join('');
    const taskRow = t => `<button class="set-item ${t.active ? '' : 'off'}" data-act="edit-task" data-id="${t.id}"><span class="t-icon">${esc(t.icon)}</span>
      <div class="grow"><div style="font-weight:800">${esc(t.title)}</div><div class="muted small">${t.frequency === 'semanal' ? 'Semanal' : 'Diaria'} · ${t.kid_id ? esc((kidById(t.kid_id) || {}).name || '') : 'Todos'}${t.active ? '' : ' · Desactivada'}</div></div>
      <span class="tag ${t.kind}">${t.kind === 'extra' ? '+' + t.points + ' ⭐' : 'Obligatoria'}</span></button>`;
    const ob = S.d.tasks.filter(t => t.kind === 'obligatoria'), ex = S.d.tasks.filter(t => t.kind === 'extra');
    return `<div class="section-title"><h2>Tareas obligatorias</h2><button class="btn sm ghost" data-act="new-task" data-kind="obligatoria">＋ Añadir</button></div>
      <div class="card" style="padding:6px 16px">${ob.map(taskRow).join('') || '<div class="empty">Sin tareas</div>'}</div>
      <div class="section-title"><h2>Tareas extra</h2><button class="btn sm ghost" data-act="new-task" data-kind="extra">＋ Añadir</button></div>
      <div class="card" style="padding:6px 16px">${ex.map(taskRow).join('') || '<div class="empty">Sin tareas</div>'}</div>

      <div class="section-title"><h2>Hijos</h2><button class="btn sm ghost" data-act="new-kid">＋ Añadir</button></div>
      <div class="card" style="padding:6px 16px">${kids}</div>

      <div class="section-title"><h2>Reglas de la paga</h2></div>
      <div class="card">
        <div class="row" style="gap:12px">
          <label class="field grow" style="margin-top:0"><span>€ por punto</span><input class="input" id="s-pv" type="number" step="0.05" min="0" inputmode="decimal" value="${Number(s.point_value)}"></label>
          <label class="field grow" style="margin-top:0"><span>Tope semanal (0 = sin tope)</span><input class="input" id="s-max" type="number" step="0.5" min="0" inputmode="decimal" value="${Number(s.max_bonus)}"></label>
        </div>
        <label class="field"><span>Reto de hermanos (premio no económico)</span><textarea class="input" id="s-goal" maxlength="200">${esc(s.team_goal)}</textarea></label>
        <button class="btn block" style="margin-top:14px" data-act="save-settings">Guardar reglas</button>
      </div>

      <div class="section-title"><h2>Seguridad</h2></div>
      <div class="card stack">
        <button class="btn ghost block" data-act="parent-pin">🔢 Cambiar PIN de padres</button>
        <button class="btn ghost block" data-act="exit-parent">🚪 Salir del modo padres</button>
        <button class="btn danger block" data-act="deactivate">${DEMO ? '♻️ Reiniciar datos de demo' : '📴 Desactivar este dispositivo'}</button>
      </div>`;
  }

  // ---------------- Modales ----------------
  const TASK_EMOJI = ['🛏️', '🍽️', '📚', '🧺', '🧸', '🍴', '🧑‍🍳', '🗑️', '📖', '👕', '🛒', '🧹', '🪴', '🐶', '🚿', '🪥', '🎒', '🧽', '🥦', '🏃', '🎹', '🤝', '🧦', '💤'];
  const AVATARS = ['🦁', '🦄', '🐯', '🐼', '🦊', '🐸', '🐙', '🦖', '🐱', '🐶', '🐵', '🐧', '🚀', '⚽', '🎮', '🌟'];
  const COLORS = ['#2f6fed', '#e0457b', '#1f9d63', '#f08c00', '#7c4dff', '#0ea5b7', '#d64545', '#5b5bd6'];

  function seg(field, value, options) {
    return `<div class="seg">${options.map(([v, l]) => `<button type="button" class="${value === v ? 'on' : ''}" data-act="m-set" data-f="${field}" data-v="${v}">${l}</button>`).join('')}</div>`;
  }

  function renderModal() {
    if (!S.modal) { $modal.innerHTML = ''; return; }
    const m = S.modal, d = m.d;
    let body = '';
    if (m.type === 'task') {
      body = `<h2>${d.id ? 'Editar tarea' : 'Nueva tarea'}</h2>
        <label class="field"><span>Nombre</span><input class="input" data-f="title" maxlength="60" value="${esc(d.title)}"></label>
        <div class="field"><span>Icono</span><div class="row"><input class="input" data-f="icon" style="width:72px;text-align:center;font-size:24px" maxlength="8" value="${esc(d.icon)}"><span class="muted small">o elige uno:</span></div>
          <div class="emoji-grid">${TASK_EMOJI.map(e => `<button type="button" class="${d.icon === e ? 'on' : ''}" data-act="m-set" data-f="icon" data-v="${e}">${e}</button>`).join('')}</div></div>
        <div class="field"><span>Tipo</span>${seg('kind', d.kind, [['obligatoria', 'Obligatoria'], ['extra', 'Extra (suma ⭐)']])}</div>
        ${d.kind === 'extra' ? `<label class="field"><span>Puntos</span><input class="input" data-f="points" type="number" min="1" max="20" inputmode="numeric" value="${Number(d.points) || 1}"></label>` : ''}
        <div class="field"><span>Frecuencia</span>${seg('frequency', d.frequency, [['diaria', 'Cada día'], ['semanal', 'Una vez por semana']])}</div>
        <label class="field"><span>¿Para quién?</span><select class="input" data-f="kid_id"><option value="">Todos</option>${S.d.kids.map(k => `<option value="${k.id}" ${d.kid_id === k.id ? 'selected' : ''}>${esc(k.name)}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" data-f="active" ${d.active ? 'checked' : ''}> Activa</label>
        <div class="error" id="m-err"></div>
        <button class="btn block" data-act="m-save-task">Guardar</button>
        ${d.id ? '<button class="btn danger block" style="margin-top:10px" data-act="m-del-task">Eliminar tarea y su historial</button>' : ''}`;
    } else if (m.type === 'kid') {
      body = `<h2>${d.id ? 'Editar perfil' : 'Nuevo perfil'}</h2>
        <label class="field"><span>Nombre</span><input class="input" data-f="name" maxlength="30" value="${esc(d.name)}"></label>
        <div class="field"><span>Avatar</span><div class="emoji-grid">${AVATARS.map(e => `<button type="button" class="${d.avatar === e ? 'on' : ''}" data-act="m-set" data-f="avatar" data-v="${e}">${e}</button>`).join('')}</div></div>
        <div class="field"><span>Color</span><div class="chips">${COLORS.map(c => `<button type="button" class="chip ${d.color === c ? 'on' : ''}" style="background:${c};width:40px;padding:0" data-act="m-set" data-f="color" data-v="${c}" aria-label="Color ${c}"></button>`).join('')}</div></div>
        <div class="field"><span>Estilo de la pantalla</span>${seg('theme', d.theme, [['kid', '🎈 Peque'], ['teen', '🕶️ Mayor']])}</div>
        <label class="field"><span>Paga base semanal (€)</span><input class="input" data-f="base_allowance" type="number" step="0.5" min="0" inputmode="decimal" value="${Number(d.base_allowance) || 0}"></label>
        <label class="field"><span>${d.id ? 'Nuevo PIN (déjalo vacío para no cambiarlo)' : 'PIN de 4 cifras'}</span><input class="input" data-f="pin" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" value="${esc(d.pin || '')}"></label>
        <div class="error" id="m-err"></div>
        <button class="btn block" data-act="m-save-kid">Guardar</button>
        ${d.id ? '<button class="btn danger block" style="margin-top:10px" data-act="m-del-kid">Eliminar perfil y su historial</button>' : ''}`;
    } else if (m.type === 'ppin') {
      body = `<h2>PIN de padres</h2><p class="muted small">Se pide al entrar en modo padres en un móvil donde se ha guardado la sesión.</p>
        <label class="field"><span>Nuevo PIN de 4 cifras</span><input class="input" data-f="pin" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" value="${esc(d.pin || '')}"></label>
        <div class="error" id="m-err"></div>
        <button class="btn block" data-act="m-save-ppin">Guardar</button>`;
    }
    $modal.innerHTML = `<div class="modal-bg" data-act="m-close"><div class="modal" role="dialog" aria-modal="true">${body}
      <button class="btn ghost block" style="margin-top:10px" data-act="m-close">Cancelar</button></div></div>`;
  }

  function syncModal() {
    if (!S.modal) return;
    $modal.querySelectorAll('[data-f]').forEach(el => {
      if (el.tagName === 'BUTTON') return;
      S.modal.d[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
    });
  }
  function modalError(msg) { const e = document.getElementById('m-err'); if (e) e.textContent = msg; }

  // ------------------------------------------------------------------
  // Acciones
  // ------------------------------------------------------------------
  async function go(screen) { S.screen = screen; S.pin = ''; S.pinError = ''; render(); }

  async function toHome() {
    S.kid = null; S.kidPin = null; session.del('equipo-casa-kid');
    S.screen = 'loading'; render();
    await run(loadBase);
    go('home');
  }

  async function enterParent() {
    S.screen = 'loading'; render();
    await run(loadParent);
    S.screen = 'parent'; render();
  }

  async function refresh() {
    if (S.screen === 'kid') await run(loadKid);
    else if (S.screen === 'parent') await run(loadParent);
    else if (S.screen === 'home') await run(loadBase);
    render();
  }

  async function submitPin() {
    const pin = S.pin;
    S.busy = true;
    try {
      if (S.pinFor.type === 'kid') {
        await api.kidLogin(S.pinFor.kid.id, pin);
        S.kid = S.pinFor.kid; S.kidPin = pin;
        session.set('equipo-casa-kid', { id: S.kid.id, pin });
        S.screen = 'loading'; render();
        await run(loadKid);
        S.screen = 'kid'; render();
      } else {
        const ok = await api.parentCheckPin(pin);
        if (!ok) throw new Error('PIN incorrecto');
        S.tab = 'validar'; S.week = mondayOf(todayStr());
        await enterParent();
      }
    } catch (e) {
      if (e.expired) { S.busy = false; toast('La sesión de padres ha caducado'); return go('parentLogin'); }
      S.pin = ''; S.pinError = e.message || 'Error'; render();
    } finally { S.busy = false; }
  }

  const actions = {
    'pick-kid': ({ id }) => { S.pinFor = { type: 'kid', kid: kidById(id) }; go('pin'); },
    'pick-parent': async () => {
      S.pinFor = { type: 'parent' };
      go((await api.hasParentSession()) ? 'pin' : 'parentLogin');
    },
    home: () => toHome(),
    'pin-cancel': () => toHome(),
    key: ({ k }) => {
      if (S.busy) return;
      S.pinError = '';
      if (k === 'del') S.pin = S.pin.slice(0, -1);
      else if (S.pin.length < 4) S.pin += k;
      render();
      if (S.pin.length === 4) submitPin();
    },
    logout: () => toHome(),
    refresh: async () => { await refresh(); toast('Actualizado'); },

    mark: async ({ id }, el) => {
      const r = el.getBoundingClientRect();
      await run(async () => { await api.kidMarkDone(S.kid.id, S.kidPin, id); await loadKid(); });
      render();
      const anchor = { getBoundingClientRect: () => r };
      if (S.kid.theme === 'kid') confetti(anchor);
      const t = taskById(id);
      toast(t && t.kind === 'extra' ? `¡Genial! +${t.points} ⭐ cuando papá o mamá lo validen` : '¡Bien hecho! 💪');
    },
    undo: async ({ id }) => {
      if (!await ask('¿Deshacer esta tarea?')) return;
      await run(async () => { await api.kidUndo(S.kid.id, S.kidPin, id); await loadKid(); });
      render();
    },

    tab: ({ id }) => { S.tab = id; render(); window.scrollTo(0, 0); },
    'exit-parent': async () => { await run(() => api.exitParent()); toHome(); },
    review: async ({ id, st }) => {
      await run(async () => { await api.review([id], st); await loadParent(); }, st === 'aprobada' ? '✔️ Aprobada' : '✖️ Rechazada');
      render();
    },
    'approve-all': async () => {
      if (!await ask(`¿Aprobar las ${S.d.pending.length} tareas pendientes?`)) return;
      await run(async () => { await api.review(S.d.pending.map(c => c.id), 'aprobada'); await loadParent(); }, '✔️ Todo aprobado');
      render();
    },

    'bonus-kid': ({ id }) => { S.bonusKid = id; keepReason(); },
    'bonus-pts': ({ id }) => { S.bonusPts = Number(id); keepReason(); },
    'bonus-reason': ({ r }) => { document.getElementById('f-reason').value = r; },
    'bonus-add': async () => {
      const reason = document.getElementById('f-reason').value.trim();
      if (!reason) { toast('Escribe el motivo: es lo que más valor tiene 😉'); return; }
      const targets = S.bonusKid === 'all' ? S.d.kids.map(k => k.id) : [S.bonusKid];
      await run(async () => {
        for (const k of targets) await api.addBonus(k, S.bonusPts, reason);
        S.week = mondayOf(todayStr());
        await loadParent();
      }, '🎁 Puntos enviados');
      render();
    },
    'bonus-del': async ({ id }) => {
      if (!await ask('¿Borrar estos puntos?')) return;
      await run(async () => { await api.deleteBonus(id); await loadParent(); });
      render();
    },

    week: async ({ d }) => {
      S.week = addDays(S.week, Number(d));
      await run(loadParent); render();
    },
    team: async () => {
      await run(async () => { await api.setTeam(S.week, !S.d.team); await loadParent(); }, S.d.team ? 'Reto desmarcado' : '🏆 ¡Reto conseguido!');
      render();
    },
    'close-week': async () => {
      const rows = S.d.kids.map(k => {
        const w = weekSummary(k, S.week);
        return {
          week_start: S.week, kid_id: k.id, mandatory_done: w.done, mandatory_expected: w.expected,
          extra_points: w.extra, bonus_points: w.bonus, team_achieved: S.d.team, amount: Math.round(w.total * 100) / 100,
        };
      });
      if (S.d.pending.some(c => c.period_date >= S.week && c.period_date <= addDays(S.week, 6))
        && !await ask('Hay tareas de esta semana sin validar. ¿Guardar igualmente?')) return;
      await run(async () => { await api.saveClosures(rows); await loadParent(); }, '💾 Semana guardada');
      render();
    },
    paid: async ({ id }, el) => {
      await run(async () => { await api.setPaid(id, el.checked); await loadParent(); }, el.checked ? '💶 Marcada como pagada' : 'Desmarcada');
      render();
    },

    'save-settings': async () => {
      const s = {
        point_value: Math.max(0, Number(document.getElementById('s-pv').value) || 0),
        max_bonus: Math.max(0, Number(document.getElementById('s-max').value) || 0),
        team_goal: document.getElementById('s-goal').value.trim() || TEAM_GOAL,
      };
      await run(async () => { await api.saveSettings(s); await loadParent(); }, 'Reglas guardadas');
      render();
    },
    'new-task': ({ kind }) => { S.modal = { type: 'task', d: { title: '', icon: kind === 'extra' ? '⭐' : '✅', kind, points: kind === 'extra' ? 2 : 0, frequency: 'diaria', kid_id: '', active: true } }; renderModal(); },
    'edit-task': ({ id }) => { const t = taskById(id); S.modal = { type: 'task', d: { ...t, kid_id: t.kid_id || '' } }; renderModal(); },
    'new-kid': () => { S.modal = { type: 'kid', d: { name: '', avatar: '🐼', color: COLORS[2], theme: 'kid', base_allowance: 0, pin: '' } }; renderModal(); },
    'edit-kid': ({ id }) => { S.modal = { type: 'kid', d: { ...kidById(id), pin: '' } }; renderModal(); },
    'parent-pin': () => { S.modal = { type: 'ppin', d: { pin: '' } }; renderModal(); },
    deactivate: async () => {
      if (!await ask(DEMO ? '¿Borrar los datos de demo y empezar de cero?' : '¿Desactivar este dispositivo? Habrá que volver a poner el email y la contraseña de la familia.')) return;
      await run(() => api.deactivateDevice());
      location.reload();
    },

    'm-close': (_, el, ev) => { if (ev.target === el) { S.modal = null; renderModal(); } },
    'm-set': ({ f, v }) => { syncModal(); S.modal.d[f] = v; renderModal(); },
    'm-save-task': async () => {
      syncModal();
      const d = S.modal.d;
      if (!d.title.trim()) return modalError('Ponle un nombre');
      const t = {
        id: d.id, title: d.title.trim(), icon: (d.icon || '✅').trim(), kind: d.kind,
        points: d.kind === 'extra' ? Math.min(20, Math.max(1, Math.round(Number(d.points) || 1))) : 0,
        frequency: d.frequency, kid_id: d.kid_id || null, active: !!d.active, sort: S.d.tasks.length + 1,
      };
      await run(async () => { await api.saveTask(t); S.modal = null; await loadParent(); }, 'Tarea guardada');
      render();
    },
    'm-del-task': async () => {
      if (!await ask('Se borrará la tarea y todo su historial. Si solo quieres dejar de usarla, desmarca "Activa". ¿Eliminar?')) return;
      await run(async () => { await api.deleteTask(S.modal.d.id); S.modal = null; await loadParent(); }, 'Tarea eliminada');
      render();
    },
    'm-save-kid': async () => {
      syncModal();
      const d = S.modal.d;
      if (!d.name.trim()) return modalError('Ponle un nombre');
      if ((!d.id || d.pin) && !/^\d{4}$/.test(d.pin)) return modalError('El PIN debe tener 4 cifras');
      const k = { id: d.id, name: d.name.trim(), avatar: d.avatar, color: d.color, theme: d.theme, base_allowance: Math.max(0, Number(d.base_allowance) || 0) };
      await run(async () => { await api.saveKid(k, d.pin || null); S.modal = null; await loadParent(); }, 'Perfil guardado');
      render();
    },
    'm-del-kid': async () => {
      if (!await ask(`Se borrará el perfil de ${S.modal.d.name} con todo su historial. ¿Seguro?`)) return;
      await run(async () => { await api.deleteKid(S.modal.d.id); S.modal = null; await loadParent(); }, 'Perfil eliminado');
      render();
    },
    'm-save-ppin': async () => {
      syncModal();
      if (!/^\d{4}$/.test(S.modal.d.pin)) return modalError('El PIN debe tener 4 cifras');
      await run(async () => { await api.setParentPin(S.modal.d.pin); S.modal = null; }, 'PIN de padres cambiado');
      renderModal();
    },
  };

  // Mantiene el motivo escrito al cambiar de niño o de puntos
  function keepReason() {
    const v = document.getElementById('f-reason').value;
    render();
    document.getElementById('f-reason').value = v;
  }

  document.addEventListener('click', ev => {
    const el = ev.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const act = actions[el.dataset.act];
    if (!act) return;
    act(el.dataset, el, ev);
  });

  document.addEventListener('submit', async ev => {
    ev.preventDefault();
    const form = ev.target.dataset.form;
    const email = document.getElementById('f-email').value.trim();
    const pass = document.getElementById('f-pass').value;
    S.busy = true; S.pinError = ''; render();
    try {
      if (form === 'activate') {
        await api.activateDevice(email, pass);
        S.busy = false; await toHome();
      } else if (form === 'parent-login') {
        const remember = document.getElementById('f-remember').checked;
        await api.parentSignIn(email, pass, remember);
        S.busy = false; S.tab = 'validar'; S.week = mondayOf(todayStr());
        await enterParent();
      }
    } catch (e) {
      S.busy = false; S.pinError = e.message; render();
      const f = document.getElementById('f-email'); if (f) f.value = email;
    }
  });

  // Al volver a la app, refresca los datos
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !S.modal && ['kid', 'parent', 'home'].includes(S.screen)) refresh();
  });

  // ------------------------------------------------------------------
  // Arranque
  // ------------------------------------------------------------------
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('No se pudo cargar ' + src));
      document.head.appendChild(s);
    });
  }

  async function boot() {
    render();
    try {
      if (DEMO) api = new LocalBackend();
      else {
        await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js');
        api = new SupabaseBackend();
      }
      if (!(await api.deviceReady())) return go('activate');
      await loadBase();
      const saved = session.get('equipo-casa-kid');
      const kid = saved && S.d.kids.find(k => k.id === saved.id);
      if (kid) {
        S.kid = kid; S.kidPin = saved.pin;
        await loadKid();
        return go('kid');
      }
      go('home');
    } catch (e) {
      console.error(e);
      $app.innerHTML = `<div class="center-screen"><div class="card auth-card" style="text-align:center"><div style="font-size:40px">📡</div>
        <h2 style="margin-top:8px">No hay conexión</h2><p class="muted">${esc(e.message)}</p><button class="btn block" onclick="location.reload()">Reintentar</button></div></div>`;
    }
  }

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sin modo offline */ });
  }
  boot();
})();
