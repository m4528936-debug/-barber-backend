// src/utils/jalali.js
const jalaali = require('jalaali-js');

const PERSIAN_MONTHS = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const PERSIAN_DIGITS = ['۰','۱','۲','۳','۴','۵','۶','۷','۸','۹'];

function toPersianDigits(str) {
  return String(str).replace(/\d/g, d => PERSIAN_DIGITS[d]);
}
function toEnglishDigits(str) {
  const map = { '۰':'0','۱':'1','۲':'2','۳':'3','۴':'4','۵':'5','۶':'6','۷':'7','۸':'8','۹':'9' };
  return String(str).replace(/[۰-۹]/g, d => map[d]);
}

/** Gregorian (Date or 'YYYY-MM-DD') → Jalali object {jy, jm, jd} */
function gregorianToJalali(input) {
  const d = input instanceof Date ? input : new Date(input);
  return jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/** Gregorian → display string like "۱۷ آذر ۱۴۰۳" */
function gregorianToJalaliDisplay(input) {
  const { jy, jm, jd } = gregorianToJalali(input);
  return `${toPersianDigits(jd)} ${PERSIAN_MONTHS[jm - 1]} ${toPersianDigits(jy)}`;
}

/** Gregorian → ISO Jalali string "1403-09-17" (useful for sorting/display) */
function gregorianToJalaliIso(input) {
  const { jy, jm, jd } = gregorianToJalali(input);
  return `${jy}-${String(jm).padStart(2,'0')}-${String(jd).padStart(2,'0')}`;
}

/** Jalali (jy, jm, jd) → Gregorian 'YYYY-MM-DD' (what the DB/API expects) */
function jalaliToGregorianIso(jy, jm, jd) {
  const { gy, gm, gd } = jalaali.toGregorian(jy, jm, jd);
  return `${gy}-${String(gm).padStart(2,'0')}-${String(gd).padStart(2,'0')}`;
}

/**
 * Parse a Persian display date like "۱۷ آذر ۱۴۰۳" or "17 آذر 1403"
 * or a Jalali ISO-ish "1403/09/17" / "1403-09-17" → Gregorian 'YYYY-MM-DD'
 */
function parseJalaliDisplayToGregorian(str) {
  if (!str) return null;
  const normalized = toEnglishDigits(str).trim();

  // Format: "17 آذر 1403"
  const monthNameMatch = normalized.match(/^(\d{1,2})\s+([\u0600-\u06FF]+)\s+(\d{4})$/);
  if (monthNameMatch) {
    const [, day, monthName, year] = monthNameMatch;
    const monthIdx = PERSIAN_MONTHS.findIndex(m => m === monthName.trim());
    if (monthIdx === -1) return null;
    return jalaliToGregorianIso(parseInt(year), monthIdx + 1, parseInt(day));
  }

  // Format: "1403/09/17" or "1403-09-17"
  const isoMatch = normalized.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return jalaliToGregorianIso(parseInt(year), parseInt(month), parseInt(day));
  }

  return null;
}

/** Today's Jalali display string */
function todayJalaliDisplay() {
  return gregorianToJalaliDisplay(new Date());
}

module.exports = {
  PERSIAN_MONTHS,
  toPersianDigits,
  toEnglishDigits,
  gregorianToJalali,
  gregorianToJalaliDisplay,
  gregorianToJalaliIso,
  jalaliToGregorianIso,
  parseJalaliDisplayToGregorian,
  todayJalaliDisplay,
};
