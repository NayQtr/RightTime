// The card-name check: spelling differences pass, different names do not.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCardName, skeleton, latinize } from "../src/lib/namematch.js";

test("same name, other spelling or script: match", () => {
  for (const [mine, card] of [
    ["Noor", "NOUR A ALI"], ["نور", "NOOR KHALID"], ["Nour", "NUR HASSAN"],
    ["فاطمة", "FATIMA AL-THANI"], ["Fatma", "FATIMA M SALEH"], ["فاطمه", "FATMA ALI"],
    ["مريم", "MARIAM YOUSEF"], ["Maryam", "MARIAM AL KUWARI"],
    ["عائشة", "AYESHA RASHID"], ["Aisha", "AISHA MOHAMMED"],
    ["ريم", "REEM SALEM"], ["Rim", "REEM SALEM"],
    ["دانة", "DANAH ALI"], ["حصة", "HESSA AL MARRI"], ["Hissa", "HESSAH SAAD"],
    ["لولوة", "LULWA AHMED"], ["شيخة", "SHAIKHA AL THANI"], ["Shaikha", "SHEIKHA NASSER"],
    ["Mohra", "MS MOHRA JASSIM"], ["خلود", "KHOLOUD ALI"],
  ]) assert.equal(checkCardName(mine, card), "match", `${mine} vs ${card}`);
});

test("a different name: mismatch (the case to review)", () => {
  for (const [mine, card] of [
    ["فاطمة", "MOHAMMED ALI"], ["Noor", "NASSER ALI"], ["Sara", "SAMIR KHALIL"], ["مريم", "MOHAMED SALEH"],
    ["Reem", "RASHID AHMED"], ["Dana", "DAVID SMITH"], ["عائشة", "ABDULLAH SAAD"],
  ]) assert.equal(checkCardName(mine, card), "mismatch", `${mine} vs ${card}`);
});

test("the family name further on the card does not count as a match", () => {
  // the registered first name equals the third word only (e.g. her name as his family name)
  assert.equal(checkCardName("Saad", "KHALID ABDULLAH SAAD"), "mismatch");
});

test("nothing to compare", () => {
  assert.equal(checkCardName("Noor", ""), "not_provided");
  assert.equal(checkCardName("Noor", null), "not_provided");
  assert.equal(checkCardName(null, "NOUR ALI"), "no_name");
  assert.equal(checkCardName("", "NOUR ALI"), "no_name");
});

test("transliteration and skeleton", () => {
  assert.equal(latinize("فاطِمة").trim(), "fatma");
  assert.equal(skeleton("mohammed"), skeleton("muhammad"));
  assert.equal(skeleton(latinize("محمد").trim()), skeleton("mohamed"));
});
