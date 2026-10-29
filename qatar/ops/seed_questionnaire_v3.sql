-- Questionnaire QA-2026-03 for HerZone (women only): QA-2026-02 without Q10 (gender; every member is a woman and
-- confirms it at sign-up) and with the Arabic addressed to a woman. Same keys and option keys as v2, so submitted v2
-- answers are offered again by key. Staging content: retires the published version and publishes v3 (approved by
-- the seeded owner). Re-running is a no-op.
SET search_path = app, pg_temp;

DO $$
DECLARE v uuid := '00000000-0000-0000-0000-0000000000ea';
BEGIN
  IF EXISTS (SELECT 1 FROM questionnaire_versions WHERE code = 'QA-2026-03') THEN RETURN; END IF;
  INSERT INTO questionnaire_versions (id, code, status) VALUES (v, 'QA-2026-03', 'draft');

  INSERT INTO questions (questionnaire_version_id, key, scope, text_ar, text_en, purpose_ar, purpose_en, answer_type,
                         max_selections, is_required, matching_use, data_class, sort_order, section_ar, section_en, layout,
                         scale_low_ar, scale_low_en, scale_high_ar, scale_high_en)
  SELECT v, x.key, 'profile', x.t_ar, x.t_en, x.p_ar, x.p_en, x.typ::answer_type, x.mx, x.req, x.mu::matching_use,
         x.dc::privacy_class, x.so, x.s_ar, x.s_en, x.lay, x.lo_ar, x.lo_en, x.hi_ar, x.hi_en
  FROM (VALUES
    ('Q09', 'ما الذي تبحثين عنه؟', 'What are you looking for?',
     'لنفهم ما يهمك من اللقاء.', 'So we understand what matters to you.', 'multi', 2, false, 'none', 'P3', 1, 'عنك', 'About you', 'list', NULL, NULL, NULL, NULL),
    ('Q11', 'ما فئتك العمرية؟', 'What is your age range?',
     'لتكوين طاولات متقاربة في الأعمار؛ لا نطلب تاريخ ميلادك.', 'To form tables of similar ages; we never ask for your date of birth.', 'single', NULL, true, 'none', 'P3', 3, 'عنك', 'About you', 'list', NULL, NULL, NULL, NULL),
    ('Q12', 'هل أنت أقرب إلى…', 'Are you more…',
     'لنعرف طاقتك في المجموعات.', 'So we know your energy in groups.', 'single', NULL, false, 'none', 'P3', 4, 'شخصيتك', 'Personality', 'list', NULL, NULL, NULL, NULL),
    ('Q13', 'آراؤك عادةً يقودها…', 'Your opinions are usually guided by…',
     'لنعرف أسلوبك في الحوار.', 'So we know your conversation style.', 'single', NULL, false, 'none', 'P3', 5, 'شخصيتك', 'Personality', 'list', NULL, NULL, NULL, NULL),
    ('Q14', 'ما الصفات التي تقدّرينها أكثر في الصديقة؟', 'Which qualities do you value most in a friend?',
     'لنعرف ما يجعل اللقاء ممتعًا لك.', 'So we know what makes a meeting enjoyable for you.', 'multi', 3, false, 'none', 'P3', 6, 'شخصيتك', 'Personality', 'chips', NULL, NULL, NULL, NULL),
    ('Q15', 'وما الذي تحبه صديقاتك فيكِ؟', 'And what do your friends love about you?',
     'لنعرف ما تضيفينه إلى الطاولة.', 'So we know what you bring to the table.', 'multi', 3, false, 'none', 'P3', 7, 'شخصيتك', 'Personality', 'chips', NULL, NULL, NULL, NULL),
    ('Q16', 'إن كنتِ تعملين، في أي مجال؟', 'If you work, which field are you in?',
     'لتنويع الخلفيات على الطاولة؛ لا نسأل عن جهة عملك.', 'To mix backgrounds at the table; we never ask who you work for.', 'single', NULL, false, 'none', 'P3', 8, 'عملك', 'Work', 'list', NULL, NULL, NULL, NULL),
    ('Q17', 'لو كانت حياتك فيلمًا، فستكون…', 'If your life were a film, it would be…',
     'سؤال خفيف لنتعرف عليك.', 'A light question to get to know you.', 'single', NULL, false, 'none', 'P3', 11, 'اهتماماتك', 'Interests', 'list', NULL, NULL, NULL, NULL),
    ('Q18', 'ما مجموعتك المثالية؟', 'What''s your ideal kind of group?',
     'لنعرف الأجواء التي ترتاحين فيها.', 'So we know the atmosphere you enjoy.', 'single', NULL, false, 'none', 'P3', 13, 'اجتماعي', 'Social', 'list', NULL, NULL, NULL, NULL),
    ('Q19', 'ما الذي يصف أمسيتك المثالية؟', 'What best describes your ideal evening?',
     'لنعرف ما تستمتعين به.', 'So we know what you enjoy.', 'single', NULL, false, 'none', 'P3', 14, 'اجتماعي', 'Social', 'list', NULL, NULL, NULL, NULL),
    ('Q20', 'بعد اللقاء أريد أن أشعر…', 'After the meeting I want to feel…',
     'لنعرف ما تتوقعينه من اللقاء.', 'So we know what you hope for.', 'multi', 3, false, 'none', 'P3', 15, 'اجتماعي', 'Social', 'list', NULL, NULL, NULL, NULL),
    ('Q21', 'ما أهمية العائلة لك؟', 'How important is family to you?',
     'لنعرف ما يهمك في الحياة.', 'So we know what matters to you.', 'single', NULL, false, 'none', 'P3', 17, 'قيمك', 'Values', 'scale', 'غير مهمة', 'Not important', 'مهمة جدًا', 'Very important'),
    ('Q22', 'هل يهمّك النجاح الأكاديمي؟', 'Does academic success matter to you?',
     'لنعرف ما يهمك في الحياة.', 'So we know what matters to you.', 'single', NULL, false, 'none', 'P3', 18, 'قيمك', 'Values', 'scale', 'لا يهمني', 'Not important', 'يهمني جدًا', 'Very important'),
    ('Q23', 'هل لديك أطفال؟', 'Do you have children?',
     'لتكوين طاولات بخلفيات متقاربة؛ الإجابة اختيارية.', 'To form tables with similar backgrounds; answering is optional.', 'single', NULL, false, 'none', 'P3', 19, 'عنك', 'About you', 'list', NULL, NULL, NULL, NULL),
    ('Q24', 'ما حالتك الاجتماعية؟', 'What is your marital status?',
     'لتكوين طاولات بخلفيات متقاربة؛ الإجابة اختيارية.', 'To form tables with similar backgrounds; answering is optional.', 'single', NULL, false, 'none', 'P3', 20, 'عنك', 'About you', 'list', NULL, NULL, NULL, NULL),
    -- the questions the code already reads (same keys; Q05 now up to five free-time interests)
    ('Q01', 'ما اللغة التي ترتاحين لإجراء محادثة جماعية كاملة بها؟', 'In which language can you comfortably hold a full group conversation?',
     'لتحديد لغة الطاولة؛ لا نجمع طاولة بلغات لا تتقاطع.', 'To set your table''s language; we never seat people without a shared language.', 'multi', NULL, true, 'hard_constraint', 'P3', 9, 'طاولتك', 'Your table', 'list', NULL, NULL, NULL, NULL),
    ('Q04', 'ما الحد الأعلى المناسب لإنفاقك على الطعام والمشروبات، بخلاف رسم التنظيم؟', 'What is your maximum food and drink budget, excluding the organising fee?',
     'لاختيار مكان ضمن ميزانيتك؛ لا يرى أحد على الطاولة إجابتك.', 'To choose a venue within your budget; no one at your table sees this answer.', 'tier', NULL, true, 'hard_constraint', 'P3', 10, 'طاولتك', 'Your table', 'list', NULL, NULL, NULL, NULL),
    ('Q05', 'ماذا تحبين أن تفعلي في وقت فراغك؟', 'What do you enjoy doing in your free time?',
     'لنجمعك مع أشخاص باهتمامات مشتركة.', 'To seat you with people who share your interests.', 'multi', 5, false, 'soft_factor', 'P3', 12, 'اهتماماتك', 'Interests', 'chips', NULL, NULL, NULL, NULL),
    ('Q06', 'ما الذي يساعدك على المشاركة براحة في لقاء أول؟', 'What helps you participate comfortably in a first meeting?',
     'لنقترح بداية مريحة للحوار على طاولتك.', 'To suggest a comfortable way to start the conversation at your table.', 'multi', NULL, false, 'event_prep', 'P3', 16, 'اجتماعي', 'Social', 'list', NULL, NULL, NULL, NULL),
    ('Q08', 'كيف تفضلين إتاحة التواصل بعد اللقاء؟', 'How would you like contact to be enabled after the event?',
     'لا نشارك أي وسيلة تواصل إلا بموافقة الطرفين.', 'We never share contact details unless both people agree.', 'single', NULL, false, 'ops_only', 'P3', 21, 'بعد اللقاء', 'After the event', 'list', NULL, NULL, NULL, NULL),
    ('Q07', 'هل تحتاجين إلى ترتيب عملي في المكان أو الوجبة لإتمام الحجز؟', 'Do you need a practical venue or meal arrangement to complete your booking?',
     'لنتواصل معكِ بشكل خاص؛ لا تكتبي تفاصيل هنا.', 'So our team can contact you privately; please don''t write details here.', 'contact_request', NULL, false, 'ops_only', 'P4', 22, 'بعد اللقاء', 'After the event', 'list', NULL, NULL, NULL, NULL)
  ) x(key, t_ar, t_en, p_ar, p_en, typ, mx, req, mu, dc, so, s_ar, s_en, lay, lo_ar, lo_en, hi_ar, hi_en);

  INSERT INTO question_options (question_id, key, label_ar, label_en, emoji, is_exclusive, maps_to, sort_order)
  SELECT q.id, o.okey, o.l_ar, o.l_en, o.emoji, o.excl, o.maps::jsonb, o.so
  FROM (VALUES
    ('Q09', 'friends',     'تكوين صداقات جديدة',      'Make new friends',               '🤝', false, NULL, 1),
    ('Q09', 'get_out',     'الخروج أكثر',              'Get out more',                   '🚶', false, NULL, 2),
    ('Q09', 'conversations','حوارات ذات معنى',         'Have meaningful conversations',  '💬', false, NULL, 3),
    ('Q09', 'new_in_town', 'أنا جديدة في الدوحة',        'I''m new in Doha',               '🏙️', false, NULL, 4),
    ('Q09', 'traveling',   'التعرف على الناس أثناء السفر', 'Meet people while traveling', '🌍', false, NULL, 5),
    ('Q09', 'social_health','تحسين صحتي الاجتماعية',   'Improve my social health',       '🌱', false, NULL, 6),
    ('Q11', 'age_18_24',   '18–24', '18–24', NULL, false, NULL, 1),
    ('Q11', 'age_25_34',   '25–34', '25–34', NULL, false, NULL, 2),
    ('Q11', 'age_35_44',   '35–44', '35–44', NULL, false, NULL, 3),
    ('Q11', 'age_45_54',   '45–54', '45–54', NULL, false, NULL, 4),
    ('Q11', 'age_55_plus', '55 أو أكثر', '55 or older', NULL, false, NULL, 5),
    ('Q12', 'introvert', 'انطوائية: أستعيد طاقتي وحدي',    'Introverted: I recharge alone',     '📚', false, NULL, 1),
    ('Q12', 'ambivert',  'بين الاثنين',                    'Ambivert: a bit of both',            '🌗', false, NULL, 2),
    ('Q12', 'extrovert', 'اجتماعية: الناس يمنحونني طاقة',  'Extroverted: people energise me',    '🎉', false, NULL, 3),
    ('Q13', 'logic',    'المنطق والحقائق',   'Logic & facts',               '🔍', false, NULL, 1),
    ('Q13', 'emotions', 'المشاعر والإحساس',  'Emotions & feelings',         '💗', false, NULL, 2),
    ('Q13', 'mix',      'مزيج حسب المزاج',   'A mix, depending on the mood', '🎭', false, NULL, 3),
    ('Q16', 'not_working', 'لا أعمل حاليًا',        'Not working',               '🏖️', false, NULL, 1),
    ('Q16', 'student',     'طالبة',                  'Student',                   '🎓', false, NULL, 2),
    ('Q16', 'healthcare',  'الرعاية الصحية',        'Healthcare',                '🩺', false, NULL, 3),
    ('Q16', 'technology',  'التقنية',               'Technology',                '💻', false, NULL, 4),
    ('Q16', 'finance',     'المال والأعمال',        'Finance & business',        '💼', false, NULL, 5),
    ('Q16', 'energy',      'الطاقة',                'Energy',                    '⚡', false, NULL, 6),
    ('Q16', 'education',   'التعليم',               'Education',                 '📖', false, NULL, 7),
    ('Q16', 'public',      'القطاع الحكومي',        'Government & public sector', '🏛️', false, NULL, 8),
    ('Q16', 'hospitality', 'الضيافة والطعام',       'Hospitality & food',        '🍽️', false, NULL, 9),
    ('Q16', 'retail',      'التجزئة',               'Retail',                    '🛍️', false, NULL, 10),
    ('Q16', 'media_arts',  'الإعلام والفنون',       'Media & arts',              '🎨', false, NULL, 11),
    ('Q16', 'engineering', 'الهندسة والبناء',       'Engineering & construction', '🏗️', false, NULL, 12),
    ('Q16', 'own_business','عمل حر أو مشروع خاص',   'Self-employed / own business', '🚀', false, NULL, 13),
    ('Q16', 'other',       'مجال آخر',              'Other',                     '✳️', false, NULL, 14),
    ('Q17', 'comedy',      'كوميديا',      'Comedy',      '🎬', false, NULL, 1),
    ('Q17', 'drama',       'دراما',        'Drama',       '🎭', false, NULL, 2),
    ('Q17', 'adventure',   'مغامرة',       'Adventure',   '🗺️', false, NULL, 3),
    ('Q17', 'mystery',     'غموض وتشويق',  'Mystery',     '🕵️', false, NULL, 4),
    ('Q17', 'documentary', 'وثائقي',       'Documentary', '🎥', false, NULL, 5),
    ('Q18', 'small_safe',  'صغيرة ومريحة',                   'Small & safe',                  '🛋️', false, NULL, 1),
    ('Q18', 'smart',       'ذكية وملهمة',                    'Smart & inspiring',             '🧠', false, NULL, 2),
    ('Q18', 'playful',     'مرحة ومليئة بالمفاجآت',          'Playful & unexpected',          '🎉', false, NULL, 3),
    ('Q18', 'any',         'لا يهم، الناس يصنعون اللحظة',     'Doesn''t matter, people make the moment', '🌈', false, NULL, 4),
    ('Q19', 'deep_talk',   'حوار عميق على فنجان قهوة',  'Deep conversation over coffee',   '☕', false, NULL, 1),
    ('Q19', 'games',       'ضحك وألعاب',                'Laughing and playing games',      '🃏', false, NULL, 2),
    ('Q19', 'creative',    'استكشاف أماكن إبداعية',     'Exploring new creative spaces',   '🎨', false, NULL, 3),
    ('Q19', 'nature',      'الاستمتاع بالطبيعة',         'Enjoying nature',                 '🌴', false, NULL, 4),
    ('Q20', 'energized',   'بالحيوية',               'Energised',              '😊', false, NULL, 1),
    ('Q20', 'connected',   'أنني مسموعة وقريبة من الناس', 'Seen and connected',   '💗', false, NULL, 2),
    ('Q20', 'calm',        'بالهدوء والاتزان',       'Calm and grounded',      '😌', false, NULL, 3),
    ('Q20', 'refreshed',   'بالتجدد والمفاجأة',      'Surprised and refreshed', '🎈', false, NULL, 4),
    ('Q21', 's1', '1', '1', NULL, false, NULL, 1), ('Q21', 's2', '2', '2', NULL, false, NULL, 2), ('Q21', 's3', '3', '3', NULL, false, NULL, 3),
    ('Q21', 's4', '4', '4', NULL, false, NULL, 4), ('Q21', 's5', '5', '5', NULL, false, NULL, 5),
    ('Q22', 's1', '1', '1', NULL, false, NULL, 1), ('Q22', 's2', '2', '2', NULL, false, NULL, 2), ('Q22', 's3', '3', '3', NULL, false, NULL, 3),
    ('Q22', 's4', '4', '4', NULL, false, NULL, 4), ('Q22', 's5', '5', '5', NULL, false, NULL, 5),
    ('Q23', 'yes',     'نعم',               'Yes',                 NULL, false, NULL, 1),
    ('Q23', 'no',      'لا',                'No',                  NULL, false, NULL, 2),
    ('Q23', 'no_say',  'أفضّل عدم الإجابة', 'I prefer not to say', NULL, false, NULL, 3),
    ('Q24', 'single',  'عزباء',            'Single',               NULL, false, NULL, 1),
    ('Q24', 'married', 'متزوجة',          'Married',              NULL, false, NULL, 2),
    ('Q24', 'div_wid', 'مطلّقة / أرملة',            'Divorced / widowed',   NULL, false, NULL, 3),
    ('Q24', 'no_say',  'أفضّل عدم الإجابة',       'I prefer not to say',  NULL, false, NULL, 4),
    ('Q01', 'lang_ar',    'العربية',    'Arabic',           NULL, false, '{"language":"ar"}', 1),
    ('Q01', 'lang_en',    'الإنجليزية', 'English',          NULL, false, '{"language":"en"}', 2),
    ('Q01', 'lang_other', 'لغة أخرى',   'Another language', '🌐', false, '{}', 3),
    ('Q04', 'tier_1', 'حتى 100 ر.ق',     'Up to QAR 100',     '💵', false, '{"budget_tier_id":"00000000-0000-0000-0000-0000000000b1"}', 1),
    ('Q04', 'tier_2', 'حتى 200 ر.ق',     'Up to QAR 200',     '💳', false, '{"budget_tier_id":"00000000-0000-0000-0000-0000000000b2"}', 2),
    ('Q04', 'tier_3', 'أكثر من 200 ر.ق', 'More than QAR 200', '💎', false, '{"budget_tier_id":"00000000-0000-0000-0000-0000000000b3"}', 3),
    ('Q05', 'food',             'طبخ وطعام',          'Cooking & food',         '🍳', false, NULL, 1),
    ('Q05', 'travel',           'السفر',              'Traveling',              '✈️', false, NULL, 2),
    ('Q05', 'coffee',           'قهوة وكرك',          'Coffee & karak',         '☕', false, NULL, 3),
    ('Q05', 'books_culture',    'قراءة وثقافة',       'Reading & culture',      '📚', false, NULL, 4),
    ('Q05', 'creative_hobbies', 'فن وتصميم',          'Art & design',           '🎨', false, NULL, 5),
    ('Q05', 'movies',           'أفلام ومسلسلات',     'Movies & series',        '🎬', false, NULL, 6),
    ('Q05', 'music',            'موسيقى',             'Music',                  '🎵', false, NULL, 7),
    ('Q05', 'sport',            'رياضة ولياقة',       'Sport & fitness',        '🏃', false, NULL, 8),
    ('Q05', 'football',         'كرة القدم',          'Football',               '⚽', false, NULL, 9),
    ('Q05', 'wellbeing',        'تأمل وعافية',        'Mindfulness & wellbeing', '🧘', false, NULL, 10),
    ('Q05', 'desert_nature',    'رحلات برية وطبيعة',  'Desert trips & nature',  '🏜️', false, NULL, 11),
    ('Q05', 'sea',              'البحر والرياضات المائية', 'Sea & water sports', '🌊', false, NULL, 12),
    ('Q05', 'gaming',           'ألعاب إلكترونية',    'Gaming',                 '🎮', false, NULL, 13),
    ('Q05', 'languages',        'لغات وثقافات',       'Languages & cultures',   '🗣️', false, NULL, 14),
    ('Q05', 'pets',             'حيوانات أليفة',      'Pets',                   '🐾', false, NULL, 15),
    ('Q05', 'tech',             'تقنية وابتكار',      'Tech & innovation',      '💡', false, NULL, 16),
    ('Q05', 'photography',      'تصوير',              'Photography',            '📷', false, NULL, 17),
    ('Q05', 'self_growth',      'علم النفس وتطوير الذات', 'Psychology & self-growth', '🧠', false, NULL, 18),
    ('Q05', 'volunteering',     'تطوع وعمل مجتمعي',   'Volunteering & community', '🤲', false, NULL, 19),
    ('Q05', 'board_games',      'ألعاب جماعية وألغاز', 'Board games & puzzles', '🎲', false, NULL, 20),
    ('Q06', 'opener_question',  'سؤال افتتاحي',      'An opening question',        '❓', false, NULL, 1),
    ('Q06', 'simple_activity',  'نشاط بسيط',         'A simple activity',          '🧩', false, NULL, 2),
    ('Q06', 'spontaneous',      'مساحة لحوار عفوي',  'Room for spontaneous talk',  '💭', false, NULL, 3),
    ('Q06', 'turn_taking',      'إتاحة الدور للجميع', 'Everyone gets a turn',       '🔄', false, NULL, 4),
    ('Q06', 'no_pref',          'لا تفضيل',           'No preference',              NULL, true,  NULL, 5),
    ('Q08', 'no_sharing',       'لا مشاركة',          'No sharing',                 '🔒', false, NULL, 1),
    ('Q08', 'mutual_consent',   'تواصل بعد موافقة متبادلة', 'Contact after mutual agreement', '🤝', false, NULL, 2),
    ('Q07', 'no',               'لا',                 'No',                         NULL, false, NULL, 1),
    ('Q07', 'private_contact',  'أرغب في تواصل خاص بشأن ترتيب عملي', 'I''d like private contact about a practical arrangement', NULL, false, NULL, 2)
  ) o(qkey, okey, l_ar, l_en, emoji, excl, maps, so)
  JOIN questions q ON q.questionnaire_version_id = v AND q.key = o.qkey;

  -- Q14 and Q15 share one list of qualities
  INSERT INTO question_options (question_id, key, label_ar, label_en, emoji, is_exclusive, sort_order)
  SELECT q.id, o.okey, o.l_ar, o.l_en, o.emoji, false, o.so
  FROM questions q CROSS JOIN (VALUES
    ('authentic',   'صادقة',          'Authentic',    '✨', 1), ('attentive',  'منتبهة',        'Attentive',  '👀', 2),
    ('charismatic', 'حضورها لافت',    'Charismatic',  '🤩', 3), ('grounded',   'متّزنة',        'Grounded',   '🌿', 4),
    ('inspiring',   'مُلهِمة',        'Inspiring',    '⚡', 5), ('funny',      'مرحة',          'Funny',      '😂', 6),
    ('intelligent', 'ذكية',           'Intelligent',  '🧠', 7), ('warm',       'دافئة',         'Warm',       '🔥', 8),
    ('stylish',     'أنيقة',          'Stylish',      '😎', 9), ('optimistic', 'متفائلة',       'Optimistic', '🌈', 10),
    ('generous',    'كريمة',          'Generous',     '🤲', 11), ('loyal',     'وفية',          'Loyal',      '🫶', 12)
  ) o(okey, l_ar, l_en, emoji, so)
  WHERE q.questionnaire_version_id = v AND q.key IN ('Q14', 'Q15');

  UPDATE questionnaire_versions SET status = 'retired', retired_at = now() WHERE status = 'published';
  UPDATE questionnaire_versions SET status = 'published', published_at = now(), approved_by = '00000000-0000-0000-0000-00000000a003'
   WHERE id = v;
END $$;
