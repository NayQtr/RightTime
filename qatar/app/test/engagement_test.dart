// Member engagement (provisional, 10 Nov), as on the website: "notify me" when no session is in her languages, day and
// area chips only on a list of more than 8 sessions, the time left in the questionnaire and the table drawing at its
// end, and reasons with a rating of 3 stars or less. The layout test uses the real HerZone fonts at 360, 390, 402 and
// 430 wide, in Arabic and English, light and dark: an overflow fails it.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/app/app.dart';
import 'package:herzone/core/token_store.dart';
import 'package:herzone/data/onboarding.dart';
import 'package:herzone/data/trip_store.dart';
import 'package:herzone/domain/locale_controller.dart';
import 'package:herzone/ui/common/table_art.dart';
import 'package:herzone/ui/meetups/feedback_screen.dart' show lowRatingReasons, lowRatingReasonsUpTo;
import 'package:herzone/ui/meetups/home_tab.dart' show filtersAbove;
import 'package:herzone/ui/onboarding/quiz_view_model.dart' show minutesLeft, secondsPerQuestion;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

import 'meetups_test.dart' show bookingId, tallScreen;
import 'onboarding_test.dart' as o;
import 'safety_test.dart' as safety;
import 'screens_golden_test.dart' show loadFonts;
import 'sign_in_flow_test.dart' show config, j;

const _areas = [['لوسيل', 'Lusail'], ['الوكرة', 'Al Wakrah'], ['مدينة خليفة الجنوبية', 'Madinat Khalifa South']];

/// A signed-in member; [count] Arabic dinners over the coming days in three areas; her alert on or off.
class HomeApi {
  HomeApi({this.count = 0, this.notifyOn = false});
  final int count;
  bool notifyOn;
  final posts = <String>[];
  String lang = 'ar';

  MockClient client() => MockClient((r) async {
        lang = r.headers['accept-language'] ?? 'ar';
        if (r.method == 'POST') posts.add(r.url.path);
        switch (r.url.path) {
          case '/api/v1/auth/token:refresh':
            return j({'access_token': 'at_1', 'refresh_token': 'rt_2'});
          case '/api/v1/users/me':
            return j({'user': {'id': 'u1', 'status': 'active', 'registration_status': 'complete'}});
          case '/api/v1/questionnaires/current':
            return j({'questionnaire_version_id': 'v5', 'questions': [], 'submitted': {'answers': []}, 'has_submitted_any': true});
          case '/api/v1/sessions':
            return j({'profile_languages': ['ar'], 'notify_me_active': notifyOn, 'sessions': [
              for (var k = 0; k < count; k++)
                {'id': 's$k', 'experience': 'dinner', 'conversation_language': 'ar', 'language_match': true,
                 'starts_at': '2026-11-${(12 + k ~/ 2).toString().padLeft(2, '0')}T19:30:00+03:00', 'district': _areas[k % 3][lang.startsWith('en') ? 1 : 0],
                 'seats_left': 6, 'is_full': false, 'my_booking_id': null},
            ]});
          case '/api/v1/session-alerts':
            notifyOn = true;
            return j({'active': true, 'created_at': '2026-11-10T22:00:00+03:00', 'languages': ['en']}, 201);
          case '/api/v1/bookings':
            return j({'bookings': []});
          case '/api/v1/notifications':
            return j({'notifications': []});
          case '/api/v1/support/contact':
            return j({'coordinator': null});
        }
        return j({'code': 'NOT_FOUND'}, 404);
      });
}

Future<void> openHome(WidgetTester tester, HomeApi api) async {
  // a new key: a second app in the same test starts fresh instead of keeping the first one's state
  await tester.pumpWidget(HerZoneApp(key: UniqueKey(), config: config, tokens: MemoryTokenStore()..token = 'rt_1', trips: MemoryTripStore(), quizStore: QuizStore.memory(), httpClientFactory: api.client));
  await tester.pumpAndSettle();
}

/// Taps a filter chip, scrolling its row first (each row scrolls sideways).
Future<void> chip(WidgetTester tester, String key) async {
  await tester.ensureVisible(find.byKey(Key(key)));
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(Key(key)));
}

int cards(WidgetTester tester) => find.byWidgetPredicate((w) => w.key is ValueKey<String> && (w.key as ValueKey<String>).value.startsWith('session-') && w is Card).evaluate().length;

void main() {
  test('time left: questions still to answer x 10 s, in whole minutes; 0 under a minute (same figures as the website)', () {
    expect(secondsPerQuestion, 10);
    expect(minutesLeft(21), 4);
    expect(minutesLeft(9), 2);
    expect(minutesLeft(6), 1);
    expect(minutesLeft(5), 0);
    expect(minutesLeft(-1), 0);
    expect(filtersAbove, 8);
  });

  testWidgets('notify me: no session in her languages offers it; pressed once, it says so and asks the server once', (tester) async {
    tallScreen(tester);
    final api = HomeApi();
    await openHome(tester, api);
    expect(find.text('لا توجد حاليًا مواعيد بلغة تختارينها. نُنظّم طاولات بالعربية والإنجليزية فقط.'), findsOneWidget);
    expect(find.text('أعلميني عند توفر موعد'), findsOneWidget);
    await tester.tap(find.byKey(const Key('notify-me')));
    await tester.pumpAndSettle();
    expect(api.posts.where((p) => !p.startsWith('/api/v1/auth/')), ['/api/v1/session-alerts']);
    expect(find.byKey(const Key('notify-me')), findsNothing);
    expect(find.text('سنُعلمكِ عند توفر موعد بلغتك.'), findsOneWidget);
  });

  testWidgets('notify me already on: the line, no button', (tester) async {
    tallScreen(tester);
    await openHome(tester, HomeApi(notifyOn: true));
    expect(find.byKey(const Key('notify-on')), findsOneWidget);
    expect(find.byKey(const Key('notify-me')), findsNothing);
  });

  testWidgets('filters: none for 8 sessions; for 9, day and area chips narrow the list and All brings it back', (tester) async {
    tester.view.physicalSize = const Size(390 * 2, 4000 * 2); // every card built (lists only build what is on screen)
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    await openHome(tester, HomeApi(count: 8));
    expect(cards(tester), 8);
    expect(find.byKey(const Key('day-all')), findsNothing, reason: 'eight sessions: no filters');

    await openHome(tester, HomeApi(count: 9));
    expect(find.byKey(const Key('day-all')), findsOneWidget);
    expect(find.byKey(const Key('area-all')), findsOneWidget);
    expect(cards(tester), 9);
    await chip(tester, 'area-الوكرة');
    await tester.pumpAndSettle();
    expect(cards(tester), 3, reason: 'sessions 1, 4 and 7 are in Al Wakrah');
    await chip(tester, 'day-2026-11-12');
    await tester.pumpAndSettle();
    expect(cards(tester), 1, reason: 'Al Wakrah on the 12th: session 1');
    await chip(tester, 'day-2026-11-14');
    await tester.pumpAndSettle();
    expect(cards(tester), 1, reason: 'Al Wakrah on the 14th: session 4');
    await chip(tester, 'day-2026-11-13');
    await tester.pumpAndSettle();
    expect(cards(tester), 0);
    expect(find.byKey(const Key('no-filter-match')), findsOneWidget);
    await chip(tester, 'day-all');
    await chip(tester, 'area-all');
    await tester.pumpAndSettle();
    expect(cards(tester), 9);
  });

  testWidgets('questionnaire: time left beside the step count; at the end the table with every seat taken', (tester) async {
    tallScreen(tester);
    await tester.pumpWidget(HerZoneApp(config: config, tokens: MemoryTokenStore(), trips: MemoryTripStore(), quizStore: QuizStore.memory(), httpClientFactory: o.FakeApi().client));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('start')));
    await tester.pumpAndSettle();
    expect(find.text('1 من 3'), findsOneWidget);
    expect(find.text(' · بقيت أقل من دقيقة'), findsOneWidget, reason: '3 questions x 10 s');
    await tester.tap(find.byKey(const Key('opt-ar')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('opt-travel')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('next')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('skip')));
    await tester.pumpAndSettle();
    expect(find.text('شكرًا لكِ'), findsOneWidget);
    final art = tester.widget<TableArt>(find.byKey(const Key('done-table')));
    expect((art.seats, art.filled), (6, 6));
  });

  testWidgets('feedback: reasons at 3 stars or less, hidden and cleared above; sent in a fixed order', (tester) async {
    final f = safety.Fake('completed');
    await safety.openDetails(tester, f);
    await tester.tap(find.byKey(const Key('rate')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('reasons')), findsNothing);
    await tester.tap(find.byKey(const Key('overall-2')));
    await tester.pumpAndSettle();
    expect(find.text('ما الذي لم يعجبكِ؟ (اختياري)'), findsOneWidget);
    for (final k in ['table_fit', 'venue', 'food_service', 'organisation', 'no_shows', 'other']) {
      expect(find.byKey(Key('reason-$k')), findsOneWidget);
    }
    await tester.tap(find.byKey(const Key('reason-food_service')));
    await tester.tap(find.byKey(const Key('overall-5')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('reasons')), findsNothing, reason: '5 stars: no reasons');
    await tester.tap(find.byKey(const Key('overall-3')));
    await tester.pumpAndSettle();
    expect(tester.widget<FilterChip>(find.byKey(const Key('reason-food_service'))).selected, isFalse, reason: 'cleared when the rating went up');
    await tester.tap(find.byKey(const Key('reason-no_shows')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('reason-venue')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('comfort-3')));
    await tester.pump();
    await tester.ensureVisible(find.byKey(const Key('send-feedback')));
    await tester.tap(find.byKey(const Key('send-feedback')));
    await tester.pumpAndSettle();
    expect(f.sent['/api/v1/bookings/$bookingId/feedback'], {'overall_rating': 3, 'comfort_rating': 3, 'would_book_again': false, 'low_rating_reasons': ['venue', 'no_shows']});
  });

  group('layout with the real fonts', () {
    setUpAll(loadFonts);
    for (final width in [360.0, 390.0, 402.0, 430.0]) {
      for (final lang in ['ar', 'en']) {
        for (final dark in [false, true]) {
          testWidgets('${width.toInt()} $lang ${dark ? 'dark' : 'light'}: chips, notify me and reasons fit', (tester) async {
            tester.view.physicalSize = Size(width * 3, 844 * 3);
            tester.view.devicePixelRatio = 3;
            tester.platformDispatcher.platformBrightnessTestValue = dark ? Brightness.dark : Brightness.light;
            addTearDown(tester.view.reset);
            addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
            Future<void> english() async {
              if (lang == 'en') {
                Provider.of<LocaleController>(tester.element(find.byType(Scaffold).first), listen: false).toggle();
                await tester.pumpAndSettle();
              }
            }

            await openHome(tester, HomeApi(count: 9));
            await english();
            expect(find.byKey(const Key('day-all')), findsOneWidget);
            await openHome(tester, HomeApi());
            await english();
            expect(find.byKey(const Key('notify-me')), findsOneWidget);
            final f = safety.Fake('completed');
            await safety.openDetails(tester, f);
            tester.view.devicePixelRatio = 3;
            tester.view.physicalSize = Size(width * 3, 844 * 3);
            await tester.pumpAndSettle();
            await english();
            await tester.ensureVisible(find.byKey(const Key('rate')));
            await tester.pumpAndSettle();
            await tester.tap(find.byKey(const Key('rate')));
            await tester.pumpAndSettle();
            await tester.tap(find.byKey(const Key('overall-1')));
            await tester.pumpAndSettle();
            expect(find.byKey(const Key('reasons')), findsOneWidget);
            expect(tester.takeException(), isNull);
          });
        }
      }
    }
  });

  test('the reasons and their threshold match the API (LOW_RATING_REASONS in api/src/lib/feedback.js)', () {
    expect(lowRatingReasons, ['table_fit', 'venue', 'food_service', 'organisation', 'no_shows', 'other']);
    expect(lowRatingReasonsUpTo, 3);
  });
}
