/* Interface text in English, 中文 and Bahasa Melayu.

   t(key, params) looks the key up in the current language, then English,
   then shows the key itself (a missing translation is visible, never
   blank). {name} placeholders are filled from params. tests/i18n.test.js
   checks the three tables have the same keys. */

import en from './strings/en.js';
import zh from './strings/zh.js';
import ms from './strings/ms.js';

export const TABLES = { en, zh, ms };
let lang = 'en';

export const setLang = l => { lang = TABLES[l] ? l : 'en'; };
export const getLang = () => lang;

export function t(key, params, l = lang) {
  const s = TABLES[l]?.[key] ?? en[key] ?? key;
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? params[k] : m));
}

// Field labels: calculator-specific first ("home.rate"), then shared ("f_rate").
export function label(calc, id, l = lang) {
  const k = `${calc}.${id}`;
  if (TABLES[l]?.[k] ?? en[k]) return t(k, null, l);
  return t('f_' + id, null, l);
}

export function hint(calc, id, l = lang) {
  const k = `${calc}.${id}.hint`;
  return TABLES[l]?.[k] ?? en[k] ?? TABLES[l]?.[`f_${id}.hint`] ?? en[`f_${id}.hint`] ?? '';
}
