// Shared fixtures for the r2-personality tests: the option keys of questionnaire QA-2026-04 that the engine scores,
// and a random answer generator that includes skipped questions, no_say, no_pref, junk keys and multi-picks.
export const QUESTIONNAIRE = {
  Q05: ["food", "travel", "coffee", "books_culture", "creative_hobbies", "movies", "music", "sport", "football", "wellbeing",
    "desert_nature", "sea", "gaming", "languages", "pets", "tech", "photography", "self_growth", "volunteering", "board_games"],
  Q06: ["opener_question", "simple_activity", "spontaneous", "turn_taking", "no_pref"],
  Q09: ["friends", "get_out", "conversations", "new_in_town", "traveling", "social_health"],
  Q11: ["age_18_24", "age_25_34", "age_35_44", "age_45_54", "age_55_plus"],
  Q12: ["introvert", "ambivert", "extrovert"],
  Q13: ["logic", "emotions", "mix"],
  Q14: ["authentic", "attentive", "charismatic", "grounded", "inspiring", "funny", "intelligent", "warm", "stylish", "optimistic", "generous", "loyal"],
  Q15: ["authentic", "attentive", "charismatic", "grounded", "inspiring", "funny", "intelligent", "warm", "stylish", "optimistic", "generous", "loyal"],
  Q16: ["not_working", "student", "healthcare", "technology", "finance", "energy", "education", "public", "hospitality", "retail",
    "media_arts", "engineering", "own_business", "other"],
  Q17: ["comedy", "drama", "adventure", "mystery", "documentary"],
  Q18: ["small_safe", "smart", "playful", "any"],
  Q19: ["deep_talk", "games", "creative", "nature"],
  Q20: ["energized", "connected", "calm", "refreshed"],
  Q21: ["s1", "s2", "s3", "s4", "s5"],
  Q22: ["s1", "s2", "s3", "s4", "s5"],
  Q23: ["yes", "no", "no_say"],
  Q24: ["single", "married", "div_wid", "no_say"],
};
const MULTI = new Set(["Q05", "Q06", "Q09", "Q14", "Q15"]);

export function randomAnswers(r) {
  if (r() < 0.08) return null;
  const out = {};
  for (const [q, opts] of Object.entries(QUESTIONNAIRE)) {
    if (r() < 0.15) continue;
    const pick = () => opts[Math.floor(r() * opts.length)];
    if (MULTI.has(q)) out[q] = Array.from({ length: 1 + Math.floor(r() * 4) }, pick);
    else out[q] = [pick()];
    if (r() < 0.03) out[q].push("junk_key");
    if (!MULTI.has(q) && r() < 0.03) out[q].push(pick());
  }
  out.Q08 = ["old_question_ignored"];
  return out;
}
