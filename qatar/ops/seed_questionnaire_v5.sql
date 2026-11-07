-- Questionnaire QA-2026-05 for HerZone: QA-2026-04 plus Q25 (how she feels about joining another member's
-- celebration). Question and options are the owner's approved wording (7 Nov 2026); the purpose line reuses an
-- approved one. Every v4 question and option is copied unchanged (same keys, so submitted answers are offered again
-- by key); sort orders are doubled so Q25 sits after Q06 at the end of the Social section. Matching uses Q25 as a
-- hard rule for tables with a celebrant (migration 018). Staging content: retires the published version and
-- publishes v5 (approved by the seeded owner). Re-running is a no-op.
SET search_path = app, pg_temp;

DO $$
DECLARE
  v  uuid := '00000000-0000-0000-0000-0000000000ec';
  v4 uuid := (SELECT id FROM questionnaire_versions WHERE code = 'QA-2026-04');
BEGIN
  IF EXISTS (SELECT 1 FROM questionnaire_versions WHERE code = 'QA-2026-05') THEN RETURN; END IF;
  IF v4 IS NULL THEN RAISE EXCEPTION 'QA-2026-04 is missing: seed it before QA-2026-05'; END IF;
  INSERT INTO questionnaire_versions (id, code, status) VALUES (v, 'QA-2026-05', 'draft');

  INSERT INTO questions (questionnaire_version_id, key, scope, text_ar, text_en, purpose_ar, purpose_en, answer_type,
                         max_selections, is_required, matching_use, data_class, sort_order, section_ar, section_en, layout,
                         scale_low_ar, scale_low_en, scale_high_ar, scale_high_en)
  SELECT v, key, scope, text_ar, text_en, purpose_ar, purpose_en, answer_type, max_selections, is_required, matching_use,
         data_class, sort_order * 2, section_ar, section_en, layout, scale_low_ar, scale_low_en, scale_high_ar, scale_high_en
    FROM questions WHERE questionnaire_version_id = v4;

  INSERT INTO question_options (question_id, key, label_ar, label_en, emoji, is_exclusive, maps_to, sort_order)
  SELECT n.id, o.key, o.label_ar, o.label_en, o.emoji, o.is_exclusive, o.maps_to, o.sort_order
    FROM question_options o
    JOIN questions old ON old.id = o.question_id AND old.questionnaire_version_id = v4
    JOIN questions n ON n.questionnaire_version_id = v AND n.key = old.key;

  INSERT INTO questions (questionnaire_version_id, key, scope, text_ar, text_en, purpose_ar, purpose_en, answer_type,
                         max_selections, is_required, matching_use, data_class, sort_order, section_ar, section_en, layout)
  VALUES (v, 'Q25', 'profile',
          'كيف تشعرين لو صادف اللقاء احتفالًا بمناسبة إحدى الحاضرات، مثل عيد ميلاد؟',
          'How would you feel if the meetup included a celebration for one of the guests, such as a birthday?',
          'لنعرف الأجواء التي ترتاحين فيها.', 'So we know the atmosphere you enjoy.',
          'single', NULL, false, 'hard_constraint', 'P3',
          (SELECT sort_order * 2 + 1 FROM questions WHERE questionnaire_version_id = v4 AND key = 'Q06'),
          'اجتماعي', 'Social', 'list');

  INSERT INTO question_options (question_id, key, label_ar, label_en, emoji, is_exclusive, maps_to, sort_order)
  SELECT q.id, o.okey, o.l_ar, o.l_en, o.emoji, false, NULL, o.so
  FROM (VALUES
    ('love_to_join', 'أحب أن أشارك في الاحتفال', 'I''d love to join in', '🎉', 1),
    ('dont_mind',    'لا مانع عندي',              'I don''t mind',        NULL, 2),
    ('prefer_none',  'أفضّل لقاءً بدون احتفالات',  'I''d prefer a meetup without celebrations', NULL, 3)
  ) o(okey, l_ar, l_en, emoji, so)
  JOIN questions q ON q.questionnaire_version_id = v AND q.key = 'Q25';

  UPDATE questionnaire_versions SET status = 'retired', retired_at = now() WHERE status = 'published';
  UPDATE questionnaire_versions SET status = 'published', published_at = now(), approved_by = '00000000-0000-0000-0000-00000000a003'
   WHERE id = v;
END $$;
