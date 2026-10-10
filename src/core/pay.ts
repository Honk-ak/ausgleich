// Zahlungswege: SEPA-QR-Text nach EPC069-12 (Version 002), IBAN-Prüfung, PayPal.Me-Link.

export function cleanIban(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase();
}

/** Prüfziffer nach ISO 13616 (Modulo 97). */
export function isValidIban(input: string): boolean {
  const iban = cleanIban(input);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of moved) {
    const value = ch >= 'A' ? (ch.charCodeAt(0) - 55).toString() : ch;
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export function formatIban(iban: string): string {
  return cleanIban(iban).replace(/(.{4})/g, '$1 ').trim();
}

function oneLine(text: string, max: number): string {
  return text.replace(/[\r\n]+/g, ' ').trim().slice(0, max);
}

/** Inhalt des SEPA-QR-Codes. Wirft einen Fehler, wenn die Angaben nicht zum Standard passen. */
export function epcPayload(args: { name: string; iban: string; amountCents: number; purpose: string }): string {
  const iban = cleanIban(args.iban);
  if (!isValidIban(iban)) throw new Error('IBAN ungültig');
  if (args.amountCents < 1 || args.amountCents > 99999999999) throw new Error('Betrag ungültig');
  const name = oneLine(args.name, 70);
  if (!name) throw new Error('Name fehlt');
  const amount = `EUR${(args.amountCents / 100).toFixed(2)}`;
  const payload = ['BCD', '002', '1', 'SCT', '', name, iban, amount, '', '', oneLine(args.purpose, 140)].join('\n');
  if (new TextEncoder().encode(payload).length > 331) throw new Error('Angaben zu lang für den QR-Code');
  return payload;
}

/** PayPal.Me-Name aus Eingaben wie „paypal.me/Anna“, „@Anna“ oder „Anna“. */
export function cleanPaypalHandle(input: string): string {
  const handle = input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^(www\.)?paypal\.me\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0];
  return /^[A-Za-z0-9]{1,20}$/.test(handle) ? handle : '';
}

export function paypalMeLink(handle: string, amountCents: number): string {
  const amount = amountCents % 100 === 0 ? String(amountCents / 100) : (amountCents / 100).toFixed(2);
  return `https://paypal.me/${cleanPaypalHandle(handle)}/${amount}EUR`;
}

export function euro(cents: number, withCents = false): string {
  const value = cents / 100;
  const digits = withCents || cents % 100 !== 0 ? 2 : 0;
  return value.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + ' €';
}

/** „24“, „24,5“, „24.50“ -> Cent. null bei unlesbarer Eingabe. */
export function parseAmount(input: string): number | null {
  const text = input.trim().replace(/\s|€/g, '').replace(',', '.');
  if (!/^\d{1,7}(\.\d{0,2})?$/.test(text)) return null;
  const cents = Math.round(parseFloat(text) * 100);
  return cents > 0 ? cents : null;
}
