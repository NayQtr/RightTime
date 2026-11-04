// Contract check against a real HerZone API (a throwaway local copy, never staging or production):
//   HZ_API=http://localhost:PORT flutter test test/contract/real_api_test.dart
// Runs the app's own repositories end to end: questions before sign-up, code sign-in (dev mode), documents,
// registration, sending the answers, then the member's meetups and notifications.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/core/api_client.dart';
import 'package:herzone/core/token_store.dart';
import 'package:herzone/data/auth_repository.dart';
import 'package:herzone/data/meetups_repository.dart';
import 'package:herzone/data/onboarding.dart';
import 'package:herzone/data/trip_store.dart';
import 'package:http/http.dart' as http;

void main() {
  final base = Platform.environment['HZ_API'];

  test('new member journey against the real API', skip: base == null ? 'set HZ_API' : false, () async {
    final api = ApiClient(baseUrl: base!, tokens: MemoryTokenStore(), locale: () => 'ar', httpClient: http.Client());
    final auth = AuthRepository(api);
    final onboarding = OnboardingRepository(api);
    final meetups = MeetupsRepository(api, MemoryTripStore());

    final preview = await onboarding.preview();
    expect(preview.questions.length, greaterThanOrEqualTo(20));
    final required = preview.questions.where((q) => q.required).toList();
    expect(required.map((q) => q.key), containsAll(['Q01', 'Q04', 'Q11']));
    // answer every required question with its first option, plus one interest
    final answers = {for (final q in required) q.id: {q.options.first.id}};
    final interests = preview.questions.firstWhere((q) => q.key == 'Q05');
    answers[interests.id] = {interests.options.first.id};

    final phone = '+9745${(5000000 + DateTime.now().millisecondsSinceEpoch % 999999).toString()}';
    final c = await auth.requestCode(phone, 'ar');
    expect(c.devCode, isNotNull, reason: 'the local API runs in test mode');
    await auth.verify(c, c.devCode!, 'ar');
    expect((await auth.me()).registrationStatus, 'consents_required');

    final docs = await onboarding.legal();
    expect(docs.where((d) => d.required).map((d) => d.type), containsAll(['terms', 'conduct', 'privacy_notice']));
    await onboarding.register(name: 'نورة', locale: 'ar', docs: {for (final d in docs) d.type: d}, granted: docs.where((d) => d.required).map((d) => d.type).toSet());
    expect((await auth.me()).registrationStatus, 'complete');

    await onboarding.save(preview.versionId, answers, submit: true);
    expect((await onboarding.current()).submitted, true);

    expect(await meetups.sessions(), isA<List>());
    expect(await meetups.bookings(), isEmpty);
    expect(await meetups.notifications(), isA<List>());
    await auth.signOut();
  });
}
