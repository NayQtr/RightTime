// Second opinion from Gemini on a card-name mismatch (015, owner's request of 4 Nov). The local match
// (lib/namematch.js) runs first; only names it calls "different" come here. Gemini gets the registered first name and the
// first two words of the card name, letters only: no phone number, id or anything else about her. The key is the
// GEMINI_API_KEY function secret; it is never stored in the database or logged.
//
// Its answer only ever clears a false alarm (same name in another spelling or a short form) or marks a card name that is
// usually a man's for priority review. It never rejects anyone: that stays a human decision.

const SCHEMA = {
  type: "OBJECT",
  properties: {
    same_first_name: { type: "BOOLEAN" },
    card_first_name_gender: { type: "STRING", enum: ["female", "male", "unclear"] },
    confidence: { type: "NUMBER" },
  },
  required: ["same_first_name", "card_first_name_gender", "confidence"],
};

// Letters and spaces only, at most two words of 30 characters: names cannot carry instructions to the model.
export const cleanName = (s, words) => String(s || "").replace(/[^\p{L}\s]/gu, " ").trim().split(/\s+/).filter(Boolean)
  .slice(0, words).map((w) => w.slice(0, 30)).join(" ");

export function namePrompt(registered, card) {
  return `You check identities for a women-only meetup service in Qatar. A member registered with a first name, then paid with a card.
Registered first name: "${cleanName(registered, 1)}"
First words on the payment card: "${cleanName(card, 2)}"
Question 1: is the registered first name the same first name as the card's first name? Count other spellings, Arabic/Latin transliteration and common short forms (for example Noor/Nour, Fatima/Fatma, Moza/Mouza) as the same; different names (for example Fatima/Mohammed) are not the same.
Question 2: is the card's first name usually a female or a male name in the Gulf region?
Answer only with the JSON fields. confidence is 0 to 1 for question 1.`;
}

/**
 * Asks Gemini. Returns { same: bool, gender: "female"|"male"|"unclear", confidence: number } or null when it cannot
 * answer in time (busy, down, no key). A null answer leaves the review to a person.
 */
export async function askNameOpinion({ apiKey, model, baseUrl, registered, card, timeoutMs = 8000, fetchImpl = fetch }) {
  if (!apiKey) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${baseUrl}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: namePrompt(registered, card) }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0 },
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const d = await res.json();
    const text = d && d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts
      && d.candidates[0].content.parts[0] && d.candidates[0].content.parts[0].text;
    const o = JSON.parse(text);
    if (typeof o.same_first_name !== "boolean" || !["female", "male", "unclear"].includes(o.card_first_name_gender)) return null;
    const confidence = Math.max(0, Math.min(1, Number(o.confidence) || 0));
    return { same: o.same_first_name, gender: o.card_first_name_gender, confidence };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Clear the review automatically only when Gemini is confident it is the same name and the card name is not a man's. */
export const clearsReview = (o) => Boolean(o && o.same && o.confidence >= 0.8 && o.gender !== "male");
