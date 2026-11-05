// Does the first name a member registered with match the name on the card she paid with? (identity check, line one
// against a man booking under a woman's name). Card names are Latin capitals typed in many spellings; registered names
// are Arabic or Latin. Both become a consonant "skeleton" so that spelling differences do not count:
//   Noor = Nour = نور      Fatima = Fatma = فاطمة      Mariam = Maryam = مريم      Mohammed = Muhammad = محمد
// while different names stay different: فاطمة ≠ MOHAMMED, Sara ≠ Samir.
// Runs on our server only; no name is sent anywhere.

const AR = {
  "ا": "a", "أ": "a", "إ": "i", "آ": "a", "ٱ": "a", "ء": "", "ئ": "y", "ؤ": "w", "ب": "b", "ت": "t", "ث": "th", "ج": "j", "ح": "h",
  "خ": "kh", "د": "d", "ذ": "th", "ر": "r", "ز": "z", "س": "s", "ش": "sh", "ص": "s", "ض": "d", "ط": "t", "ظ": "z", "ع": "", "غ": "gh",
  "ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n", "ه": "h", "ة": "a", "و": "w", "ي": "y", "ى": "a", "پ": "p", "چ": "ch",
  "گ": "g", "ڤ": "v", "ـ": "",
};

// titles and particles that are not a first name
const SKIP = new Set(["mr", "mrs", "ms", "miss", "dr", "al", "el", "bin", "bint", "abu", "um", "umm"]);

/** Latin, lower case, letters only (Arabic transliterated, accents and Arabic diacritics dropped). */
export function latinize(name) {
  return String(name || "")
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670\u0300-\u036F]/g, "") // harakat, shadda, accents
    .split("")
    .map((c) => (c in AR ? AR[c] : c))
    .join("")
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ");
}

/** The consonant skeleton of one word: vowels and w/y/h glides dropped, sounds that are spelled several ways merged. */
export function skeleton(word) {
  let w = word.replace(/['-]/g, "");
  w = w.replace(/kh/g, "x").replace(/gh/g, "g").replace(/sh/g, "$").replace(/th/g, "t").replace(/dh/g, "d").replace(/ch/g, "$");
  w = w.replace(/q/g, "k").replace(/c/g, "k").replace(/z/g, "s").replace(/v/g, "f").replace(/p/g, "b").replace(/j/g, "g");
  w = w.replace(/h$/, ""); // Dana / Danah, Hessa / Hessah
  w = w.replace(/[aeiouwy]/g, ""); // vowels and the w/y glides (Noor/Nour, Mariam/Maryam, Lulwa)
  w = w.replace(/(.)\1+/g, "$1"); // doubled letters (Mohammed / Mohamed)
  return w;
}

/** First-name words of a full name, without titles or particles. */
export function nameWords(name) {
  return latinize(name).split(/\s+/).filter((t) => t && !SKIP.has(t));
}

function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1)
    for (let j = 1; j <= b.length; j += 1)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

const close = (a, b) => a === b || (Math.min(a.length, b.length) >= 3 && editDistance(a, b) <= 1);

/**
 * Compares the registered first name with the card name.
 * - "not_provided": the payment provider sent no card name (nothing to check)
 * - "no_name": the member has no registered name
 * - "match": the registered first name matches the card's first name (or any given name on the card)
 * - "mismatch": it matches none of them
 */
export function checkCardName(registeredName, cardName) {
  const card = nameWords(cardName);
  if (!card.length) return "not_provided";
  const mine = nameWords(registeredName);
  if (!mine.length) return "no_name";
  const first = skeleton(mine[0]);
  if (!first) return "no_name";
  // the first two words of the card cover "FATIMA ALI" and "ALI FATIMA" without matching on a family name further on
  return card.slice(0, 2).some((w) => close(skeleton(w), first)) ? "match" : "mismatch";
}
