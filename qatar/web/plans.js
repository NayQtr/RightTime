// Subscription plans (display-only: nothing can be bought yet). Placeholder prices in QAR chosen by the owner, to be
// edited later: change the numbers here only. No DOM here, so the Node unit tests can import it.

export const PLANS = [
  { id: "m1", months: 1, price: 51.99 },
  { id: "m3", months: 3, price: 119.99, popular: true },
  { id: "m12", months: 12, price: 223.99 },
];
export const DEFAULT_PLAN = "m3";
export const GUARANTEE_DAYS = 14;
const WEEKS_PER_MONTH = 4;

const round2 = (n) => Math.round(n * 100) / 100;

// Prices for one plan, with an optional promo percentage. `full` is the one-month price times the months (shown struck
// through), `save` the whole-percent saving against it, `perWeek` the price spread over 4 weeks a month.
export function planPrices(plan, percentOff = 0) {
  const base = PLANS.find((p) => p.months === 1).price;
  const price = round2(plan.price * (1 - percentOff / 100));
  const full = round2(base * plan.months);
  const save = plan.months > 1 ? Math.round((1 - plan.price / full) * 100) : 0;
  return { price, list: plan.price, full, save, perWeek: round2(price / (plan.months * WEEKS_PER_MONTH)) };
}

export const fmtQar = (n, locale) => (locale === "ar" ? `${n.toFixed(2)} ر.ق` : `QAR ${n.toFixed(2)}`);
