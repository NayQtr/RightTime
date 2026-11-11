// Store screenshots (NMX-58) at the sizes App Store Connect and Google Play ask for, in Arabic and English (item 29:
// English store materials use English screenshots only), with the real fonts.
// Opt-in: HZ_STORE_SHOTS=1 flutter test --update-goldens test/store_screenshots_test.dart
//         (HZ_STORE_LANGS=en for English only; the default is ar,en)
// Output: qatar/docs/store/screenshots/<device>/NN_name.png (Arabic) and <device>-en/ (English). The data is the tests'
// sample data (venue, names).
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/app/app.dart';
import 'package:herzone/core/token_store.dart';
import 'package:herzone/data/onboarding.dart';
import 'package:herzone/data/trip_store.dart';
import 'package:herzone/domain/locale_controller.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

import 'booking_test.dart' as b show Fake;
import 'meetups_test.dart' as m show api, bookingId;
import 'onboarding_test.dart' as o;
import 'safety_test.dart' as s show Fake;
import 'screens_golden_test.dart' show loadFonts;
import 'sign_in_flow_test.dart' show config, fakeApi;

const devices = {
  // App Store: 6.9" iPhone, 1320 x 2868 pixels
  'ios-6.9': (w: 440.0, h: 956.0, ratio: 3.0),
  // Google Play: phone, 1080 x 1920 pixels (16:9)
  'android-phone': (w: 360.0, h: 640.0, ratio: 3.0),
};

/// The tab labels the scenes tap, per language.
const tabs = {
  'ar': (events: 'لقاءاتي', account: 'حسابي'),
  'en': (events: 'My events', account: 'Account'),
};

/// The tests' sample data is Arabic; the real API answers in her language, so the English shots get the English data
/// (wording from the seeds where they have it: ops/seed_*.sql).
const englishData = {
  'لوسيل': 'Lusail', 'الدفنة': 'Al Dafna', 'مشيرب': 'Msheireb', 'متوسط': 'Standard',
  'مطعم الريم': 'Al Reem Restaurant', 'شارع لوسيل 12': '12 Lusail Street', 'اسألي عن طاولة HerZone': 'Ask for the HerZone table',
  'تدفع كل واحدة طعامها.': 'Each of you pays for her own food.', 'مريم': 'Maryam', 'سارة': 'Sara', 'نورة': 'Noura',
  'ما اللغة التي ترتاحين لها؟': 'In which language can you comfortably hold a full group conversation?', 'العربية': 'Arabic', 'الإنجليزية': 'English',
  'ماذا تحبين أن تفعلي في وقت فراغك؟': 'What do you enjoy doing in your free time?', 'السفر': 'Traveling', 'طبخ وطعام': 'Cooking & food',
  'فن وتصميم': 'Art & design', 'ما حالتك الاجتماعية؟': 'What is your marital status?', 'عزباء': 'Single', 'أفضّل عدم الإجابة': 'I prefer not to say',
};

Object? _english(Object? v) => switch (v) {
      String s => englishData[s] ?? s.replaceAll('59 ر.ق', 'QAR 59'),
      Map m => m.map((k, x) => MapEntry(k, _english(x))),
      List l => l.map(_english).toList(),
      _ => v,
    };

/// Wraps a fake API so its answers come in English.
http.Client englishApi(http.Client inner) => MockClient((r) async {
      final copy = http.Request(r.method, r.url)
        ..headers.addAll(r.headers)
        ..body = r.body;
      final res = await http.Response.fromStream(await inner.send(copy));
      if (!(res.headers['content-type'] ?? '').contains('json') || res.body.isEmpty) return res;
      return http.Response.bytes(utf8.encode(jsonEncode(_english(jsonDecode(utf8.decode(res.bodyBytes))))), res.statusCode, headers: res.headers);
    });

final skip = Platform.environment['HZ_STORE_SHOTS'] != '1';
final langs = (Platform.environment['HZ_STORE_LANGS'] ?? 'ar,en').split(',').map((l) => l.trim()).where(tabs.containsKey);

void main() {
  setUpAll(loadFonts);

  for (final lang in langs) {
    for (final MapEntry(key: device, value: d) in devices.entries) {
      String out(String name) => '../../docs/store/screenshots/$device${lang == 'ar' ? '' : '-$lang'}/$name.png';
      void size(WidgetTester tester) {
        tester.view.physicalSize = Size(d.w * d.ratio, d.h * d.ratio);
        tester.view.devicePixelRatio = d.ratio;
        addTearDown(tester.view.reset);
      }

      // The app opens in Arabic; English is one switch away (the same switch as in the account tab).
      Future<void> pumpApp(WidgetTester tester, HerZoneApp app) async {
        await tester.pumpWidget(app);
        await tester.pumpAndSettle();
        if (lang != 'ar') {
          Provider.of<LocaleController>(tester.element(find.byType(Navigator).first), listen: false).toggle();
          await tester.pumpAndSettle();
        }
      }

      // English shots: her language only (the language switch itself reads "العربية")
      dynamic Function() data(dynamic Function() f) => lang == 'ar' ? f : () => englishApi(f() as http.Client);
      Future<void> shot(WidgetTester tester, String name) async {
        if (lang != 'ar') {
          final arabic = tester.widgetList<Text>(find.byType(Text)).map((w) => w.data ?? w.textSpan?.toPlainText() ?? '')
              .where((s) => s != 'العربية' && RegExp('[\u0600-\u06FF]').hasMatch(s)).toList();
          expect(arabic, isEmpty, reason: '$name: English screenshots show English only');
        }
        await expectLater(find.byType(MaterialApp), matchesGoldenFile(out(name)));
      }

      final t = tabs[lang]!;
      final label = '$device $lang';

      testWidgets('$label: welcome and questionnaire', skip: skip, (tester) async {
        size(tester);
        await pumpApp(tester, HerZoneApp(config: config, tokens: MemoryTokenStore(), trips: MemoryTripStore(), quizStore: QuizStore.memory(), httpClientFactory: data(() => fakeApi([]))));
        await shot(tester, '01_welcome');

        final store = QuizStore.memory();
        await store.write('v4', {'q1': {'o1'}, 'q2': {'o3'}}, 1);
        await tester.pumpWidget(const SizedBox());
        await pumpApp(tester, HerZoneApp(config: config, tokens: MemoryTokenStore(), trips: MemoryTripStore(), quizStore: store, httpClientFactory: data(o.FakeApi().client)));
        await tester.tap(find.byKey(const Key('start')));
        await tester.pumpAndSettle();
        await shot(tester, '02_questionnaire');
      });

      testWidgets('$label: sessions and meetup details', skip: skip, (tester) async {
        size(tester);
        await pumpApp(tester, HerZoneApp(config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: MemoryTripStore(), quizStore: QuizStore.memory(), httpClientFactory: data(() => m.api(online: () => true))));
        await shot(tester, '03_sessions');
        await tester.tap(find.byKey(const Key('session-s1')));
        await tester.pumpAndSettle();
        await shot(tester, '04_meetup');
      });

      testWidgets('$label: private report with the 999 call', skip: skip, (tester) async {
        size(tester);
        final f = s.Fake('completed');
        await pumpApp(tester, HerZoneApp(config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: MemoryTripStore(), quizStore: QuizStore.memory(), httpClientFactory: data(f.client)));
        await tester.tap(find.text(t.events).last);
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(Key('booking-${m.bookingId}')));
        await tester.pumpAndSettle();
        await tester.scrollUntilVisible(find.byKey(const Key('report')), 200);
        await tester.tap(find.byKey(const Key('report')));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('danger')));
        await tester.pumpAndSettle();
        await shot(tester, '05_safety');
      });

      testWidgets('$label: booking review after the seat is held', skip: skip, (tester) async {
        size(tester);
        final f = b.Fake();
        await pumpApp(tester, HerZoneApp(config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: MemoryTripStore(), quizStore: QuizStore.memory(), httpClientFactory: data(f.client)));
        await tester.tap(find.byKey(const Key('session-s9')));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('hold')));
        await tester.pumpAndSettle();
        await shot(tester, '06_book');
      });

      testWidgets('$label: account', skip: skip, (tester) async {
        size(tester);
        await pumpApp(tester, HerZoneApp(config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: MemoryTripStore(), quizStore: QuizStore.memory(), httpClientFactory: data(() => m.api(online: () => true))));
        await tester.tap(find.text(t.account).last);
        await tester.pumpAndSettle();
        await shot(tester, '07_account');
      });
    }
  }
}
