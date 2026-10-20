// 同步码（R-SHEET-05，Q5）：10 位，字符集去掉 0/O/1/I/L，显示为 5+5，输入时忽略大小写、空格与短横线。
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const LENGTH = 10;
const PATTERN = new RegExp('^[' + ALPHABET + ']{' + LENGTH + '}$');
/** 输入清洗：转大写，去掉空格、短横线等非字母数字，最多 10 位。 */
function clean(input) { return String(input || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, LENGTH); }
/** 显示格式：XB7K2-M9Q4T；不足 6 位时不加短横线（方便边输入边显示）。 */
function format(code) { const value = clean(code); return value.length > 5 ? value.slice(0, 5) + '-' + value.slice(5) : value; }
function isValid(code) { return PATTERN.test(clean(code)); }
/** 剩余天数（向上取整，过期为 0）。 */
function daysLeft(expiresAt, now = Date.now()) { const t = expiresAt ? new Date(expiresAt).getTime() : NaN; return Number.isFinite(t) && t > now ? Math.ceil((t - now) / 86400000) : 0; }
module.exports = { ALPHABET, LENGTH, clean, format, isValid, daysLeft };
