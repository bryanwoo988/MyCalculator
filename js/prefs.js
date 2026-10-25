/* Preferences: language, theme, text size, and the last inputs of each
   calculator (so a calculator reopens where you left it).

   Storage may be missing or throw (private browsing, blocked site data):
   the app then runs on in-memory state and simply forgets on reload. */

export const KEY = 'mycalc.prefs.v1';
export const LANGS = ['en', 'zh', 'ms'];
export const THEMES = ['auto', 'light', 'dark'];
export const LIGHT_THEMES = ['classic', 'paper', 'mint', 'lavender'];
export const DARK_THEMES = ['midnight', 'oled', 'slate', 'grape'];
export const SCALES = [1, 1.15, 1.3];

// English until someone chooses; `chosen` tells a first visit apart from a
// deliberate choice of English.
const DEFAULTS = () => ({
  lang: 'en', chosen: false, theme: 'auto', lightTheme: 'classic', darkTheme: 'midnight', scale: 1,
  drafts: {}, detail: 'yearly', lastBackup: '',
});

let state = DEFAULTS();
let store = null;
const listeners = new Set();
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

export function sanitise(raw) {
  const d = DEFAULTS();
  raw = isObj(raw) ? raw : {};
  return {
    lang: LANGS.includes(raw.lang) ? raw.lang : d.lang,
    chosen: raw.chosen === true && LANGS.includes(raw.lang),
    theme: THEMES.includes(raw.theme) ? raw.theme : d.theme,
    lightTheme: LIGHT_THEMES.includes(raw.lightTheme) ? raw.lightTheme : d.lightTheme,
    darkTheme: DARK_THEMES.includes(raw.darkTheme) ? raw.darkTheme : d.darkTheme,
    scale: SCALES.includes(raw.scale) ? raw.scale : d.scale,
    drafts: isObj(raw.drafts) ? Object.fromEntries(Object.entries(raw.drafts).filter(([, v]) => isObj(v))) : {},
    detail: raw.detail === 'monthly' ? 'monthly' : 'yearly',
    lastBackup: typeof raw.lastBackup === 'string' ? raw.lastBackup : '',
  };
}

export function init(storage = globalThis.localStorage) {
  store = storage ?? null;
  let raw = {};
  try { raw = JSON.parse(store?.getItem(KEY) || '{}'); } catch { raw = {}; }
  state = sanitise(raw);
  return get();
}

export const get = () => structuredClone(state);

export function set(patch) {
  state = sanitise({ ...state, ...patch });
  try { store?.setItem(KEY, JSON.stringify(state)); } catch { /* not persisted this session */ }
  for (const fn of listeners) fn(get(), patch);
}

export function setDraft(calc, values) {
  set({ drafts: { ...state.drafts, [calc]: values } });
}

export const onChange = fn => (listeners.add(fn), () => listeners.delete(fn));

/* Which side and look apply now. Mirrored by the inline prepaint script in
   index.html so a dark phone never flashes white. */
export function resolveTheme(p, prefersDark) {
  const side = p.theme === 'auto' ? (prefersDark ? 'dark' : 'light') : p.theme;
  return { side, palette: side === 'dark' ? p.darkTheme : p.lightTheme };
}

export function applyToDocument(doc, p, prefersDark) {
  const { side, palette } = resolveTheme(p, prefersDark);
  const r = doc.documentElement;
  r.dataset.theme = side;
  r.dataset.palette = palette;
  r.style.setProperty('--font-scale', p.scale);
  r.lang = p.lang === 'zh' ? 'zh-Hans' : p.lang;
}
