/**
 * String/BigInt decimal arithmetic for money and exchange rates.
 * Avoids IEEE-754 drift (e.g. 0.1 * 0.2) on payroll-grade amounts.
 */

function expandScientific(str) {
  const match = /^([+-]?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/i.exec(str);
  if (!match) return str;
  const sign = match[1] === '-' ? '-' : '';
  const intPart = match[2];
  const fracPart = match[3] || '';
  const exp = Number(match[4]);
  const digits = intPart + fracPart;
  const point = intPart.length + exp;
  if (point <= 0) return `${sign}0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return `${sign}${digits}${'0'.repeat(point - digits.length)}`;
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

/**
 * @param {string|number} input
 * @returns {{ units: bigint, scale: number }}
 */
export function parseDecimal(input) {
  if (input === null || input === undefined || input === '') {
    throw new TypeError('Decimal value is required');
  }

  let str;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) {
      throw new TypeError('Decimal value must be a finite number');
    }
    str = Object.is(input, -0) ? '0' : expandScientific(String(input));
  } else {
    str = expandScientific(String(input).trim());
  }

  const match = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(str);
  if (!match) {
    throw new TypeError(`Invalid decimal value: ${input}`);
  }

  const negative = match[1] === '-';
  const whole = match[2].replace(/^0+(?=\d)/, '') || '0';
  const frac = match[3] || '';
  const scale = frac.length;
  const digits = (whole + frac).replace(/^0+(?=\d)/, '') || '0';
  let units = BigInt(digits);
  if (negative && units !== 0n) units = -units;
  return { units, scale };
}

export function isZero(decimal) {
  return decimal.units === 0n;
}

export function isNegative(decimal) {
  return decimal.units < 0n;
}

export function isPositive(decimal) {
  return decimal.units > 0n;
}

export function multiply(a, b) {
  return {
    units: a.units * b.units,
    scale: a.scale + b.scale,
  };
}

/**
 * Half-up round to targetScale (payroll uses half-up, not bankers' rounding).
 */
export function roundHalfUp(decimal, targetScale) {
  const scale = Number(targetScale);
  if (decimal.scale === scale) return { units: decimal.units, scale };
  if (decimal.scale < scale) {
    const factor = 10n ** BigInt(scale - decimal.scale);
    return { units: decimal.units * factor, scale };
  }
  const factor = 10n ** BigInt(decimal.scale - scale);
  const sign = decimal.units < 0n ? -1n : 1n;
  const abs = decimal.units < 0n ? -decimal.units : decimal.units;
  const quotient = abs / factor;
  const remainder = abs % factor;
  const half = factor / 2n;
  const rounded = remainder >= half ? quotient + 1n : quotient;
  return { units: rounded * sign, scale };
}

export function toPlainString(decimal) {
  const sign = decimal.units < 0n ? '-' : '';
  const abs = decimal.units < 0n ? -decimal.units : decimal.units;
  if (decimal.scale === 0) return sign + abs.toString();
  const digits = abs.toString().padStart(decimal.scale + 1, '0');
  const split = digits.length - decimal.scale;
  const whole = digits.slice(0, split);
  const frac = digits.slice(split);
  return `${sign}${whole}.${frac}`;
}

/** JSON-safe number after the value has already been rounded to a known scale. */
export function toNumber(decimal) {
  return Number(toPlainString(decimal));
}
