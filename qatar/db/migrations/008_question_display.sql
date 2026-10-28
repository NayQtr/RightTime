-- 008: display metadata for the quiz-first questionnaire (spec 2026-10-28 §4). Presentation only: answers,
-- validation and matching are unchanged. Adding columns with constant defaults does not touch existing rows'
-- values, so the published-questionnaire guard (001) is not triggered.
SET search_path = app, pg_temp;

ALTER TABLE app.questions
  ADD COLUMN IF NOT EXISTS section_ar    text,
  ADD COLUMN IF NOT EXISTS section_en    text,
  ADD COLUMN IF NOT EXISTS layout        text NOT NULL DEFAULT 'list',
  ADD COLUMN IF NOT EXISTS scale_low_ar  text,
  ADD COLUMN IF NOT EXISTS scale_low_en  text,
  ADD COLUMN IF NOT EXISTS scale_high_ar text,
  ADD COLUMN IF NOT EXISTS scale_high_en text;
ALTER TABLE app.questions DROP CONSTRAINT IF EXISTS questions_layout_chk;
ALTER TABLE app.questions ADD CONSTRAINT questions_layout_chk CHECK (layout IN ('list', 'chips', 'scale'));

ALTER TABLE app.question_options ADD COLUMN IF NOT EXISTS emoji text;
ALTER TABLE app.question_options DROP CONSTRAINT IF EXISTS question_options_emoji_chk;
ALTER TABLE app.question_options ADD CONSTRAINT question_options_emoji_chk CHECK (emoji IS NULL OR char_length(emoji) <= 16);
