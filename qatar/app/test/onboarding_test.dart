import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/app/app.dart';
import 'package:herzone/core/token_store.dart';
import 'package:herzone/data/onboarding.dart';
import 'package:herzone/data/trip_store.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'meetups_test.dart' show tallScreen;
import 'sign_in_flow_test.dart' show config, j;

Map<String, dynamic> q(String id, String key, String type, String text, List<List<Object>> opts, {bool required = false, int max = 1, String layout = 'list'}) => {
      'id': id, 'key': key, 'answer_type': type, 'is_required': required, 'max_selections': max, 'layout': layout, 'text': text,
      'options': [for (final o in opts) {'id': o[0], 'key': o[1], 'label': o[2], 'is_exclusive': o.length > 3}],
    };

final questions = [
  q('q1', 'Q01', 'single', 'ما اللغة التي ترتاحين لها؟', [['o1', 'ar', 'العربية'], ['o2', 'en', 'الإنجليزية']], required: true),
  q('q2', 'Q05', 'multi', 'ماذا تحبين أن تفعلي في وقت فراغك؟', [['o3', 'travel', 'السفر'], ['o4', 'food', 'طبخ وطعام'], ['o5', 'art', 'فن وتصميم']], max: 2, layout: 'chips'),
  q('q3', 'Q24', 'single', 'ما حالتك الاجتماعية؟', [['o6', 'single', 'عزباء'], ['o7', 'no_say', 'أفضّل عدم الإجابة', true]]),
];

/// A new member: no account until the code is verified; registration and the answers arrive at the end.
class FakeApi {
  bool registered = false, submitted = false;
  Map<String, dynamic>? registration, response;

  MockClient client() => MockClient((r) async {
        final body = r.body.isEmpty ? <String, dynamic>{} : jsonDecode(r.body) as Map<String, dynamic>;
        switch (r.url.path) {
          case '/api/v1/questionnaires/preview':
            return j({'questionnaire_version_id': 'v4', 'questions': questions});
          case '/api/v1/questionnaires/current':
            return j({'questionnaire_version_id': 'v4', 'questions': questions, 'submitted': submitted ? {'answers': []} : null, 'has_submitted_any': submitted});
          case '/api/v1/auth/otp:request':
            return j({'challenge_id': '11111111-1111-4111-8111-111111111111', 'resend_after': 45, 'dev_code': '482913'}, 202);
          case '/api/v1/auth/otp:verify':
            return j({'access_token': 'at_1', 'refresh_token': 'rt_1'});
          case '/api/v1/users/me':
            return j({'user': {'id': 'u1', 'display_name': registered ? 'نورة' : null, 'status': 'active', 'registration_status': registered ? 'complete' : 'consents_required'}});
          case '/api/v1/legal/current':
            return j({
              'terms': {'document_version': 'terms-qa-1', 'required': true, 'text': 'الشروط'},
              'conduct': {'document_version': 'conduct-qa-1', 'required': true, 'text': 'قواعد السلوك'},
              'privacy_notice': {'document_version': 'privacy-qa-4', 'required': true, 'text': 'إشعار الخصوصية'},
              'marketing': {'document_version': 'marketing-qa-1', 'required': false, 'text': 'رسائل تسويقية'},
            });
          case '/api/v1/users/me/registration':
            registration = body;
            registered = true;
            return j({'user': {'id': 'u1'}});
          case '/api/v1/questionnaire-responses':
            response = body;
            submitted = body['status'] == 'submitted';
            return j({'status': body['status']}, 201);
          case '/api/v1/sessions':
            return j({'sessions': []});
        }
        return j({'code': 'NOT_FOUND'}, 404);
      });
}

void main() {
  testWidgets('new member: questionnaire first, then phone, code, sign-up; the answers reach her account', (tester) async {
    tallScreen(tester);
    final api = FakeApi();
    final quizStore = QuizStore.memory();
    await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore(), trips: MemoryTripStore(), quizStore: quizStore, httpClientFactory: api.client));
    await tester.pumpAndSettle();
    expect(find.text('تعرّفي على ناس.. تفهمك'), findsOneWidget);
    await tester.tap(find.byKey(const Key('start')));
    await tester.pumpAndSettle();

    // Q1 required single choice: no skip; choosing moves on
    expect(find.text('1 من 3'), findsOneWidget);
    expect(find.byKey(const Key('skip')), findsNothing);
    await tester.tap(find.byKey(const Key('opt-ar')));
    await tester.pumpAndSettle();
    // Q2 multi, at most 2
    expect(find.text('اختاري حتى 2'), findsOneWidget);
    for (final k in ['travel', 'food', 'art']) {
      await tester.tap(find.byKey(Key('opt-$k')));
      await tester.pump();
    }
    await tester.tap(find.byKey(const Key('next')));
    await tester.pumpAndSettle();
    // Q3 sensitive and optional: skipped
    await tester.tap(find.byKey(const Key('skip')));
    await tester.pumpAndSettle();
    expect(find.text('شكرًا لكِ'), findsOneWidget);
    final saved = await quizStore.read();
    expect(saved!.answers, {'q1': {'o1'}, 'q2': {'o3', 'o4'}}, reason: 'kept on the device only, at most 2 interests, skipped question absent');

    // phone and code
    await tester.tap(find.byKey(const Key('save-answers')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('phone')), '55501234');
    await tester.tap(find.byKey(const Key('send')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('code')), '482913');
    await tester.pumpAndSettle();

    // sign-up: continue stays off until women-only, age and the three required documents are confirmed
    expect(find.text('قبل أن نبدأ'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('name')), 'نورة');
    for (final k in ['woman', 'adult', 'consent-terms', 'consent-conduct']) {
      await tester.tap(find.byKey(Key(k)));
      await tester.pump();
    }
    expect(tester.widget<FilledButton>(find.byKey(const Key('register'))).onPressed, isNull, reason: 'privacy notice not yet accepted');
    await tester.tap(find.byKey(const Key('consent-privacy_notice')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('register')));
    await tester.pumpAndSettle();

    expect(api.registration!['woman_confirmed'], true);
    expect(api.registration!['display_name'], 'نورة');
    expect((api.registration!['consents'] as List).firstWhere((c) => c['type'] == 'marketing')['granted'], false, reason: 'marketing is opt-in');
    expect(api.response!['status'], 'submitted');
    expect((api.response!['answers'] as List).length, 2);
    expect(await quizStore.read(), isNull, reason: 'device copy deleted once sent');
    expect(find.text('الدوحة، قطر'), findsOneWidget, reason: 'lands on home');
  });

  testWidgets('an exclusive option ("prefer not to say") clears the others', (tester) async {
    tallScreen(tester);
    final api = FakeApi();
    final store = QuizStore.memory();
    await store.write('v4', {'q1': {'o1'}}, 2);
    await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore(), trips: MemoryTripStore(), quizStore: store, httpClientFactory: api.client));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('start')));
    await tester.pumpAndSettle();
    expect(find.text('3 من 3'), findsOneWidget, reason: 'resumes where she stopped');
    await tester.tap(find.byKey(const Key('opt-no_say')));
    await tester.pumpAndSettle();
    expect((await store.read())!.answers['q3'], {'o7'});
  });
}
