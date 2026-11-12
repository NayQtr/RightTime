// What a valid phone number and a valid email address look like. One definition each, because the same two regular
// expressions were written out seven and three times across the routes, the services and the providers, and a rule
// copied that many times is a rule that will one day differ in one of them.

/** E.164: a plus, a non-zero country digit, then 6 to 14 more digits. */
export const isE164 = (s) => /^\+[1-9][0-9]{6,14}$/.test(String(s ?? ""));

/** How people write a number: spaces, dashes and brackets are theirs, not the number's. */
export const cleanPhone = (s) => String(s ?? "").replace(/[\s\-().]/g, "");

/** An address with one @ and a dot in the domain, within the length a mail server must accept. */
export const isEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s ?? "")) && String(s ?? "").length <= 254;
