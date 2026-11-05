import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/core/install_marker.dart';
import 'package:herzone/core/token_store.dart';
import 'package:herzone/data/onboarding.dart';
import 'package:herzone/data/trip_store.dart';

void main() {
  test('a reinstall starts clean: Keychain leftovers are wiped once, normal launches keep the session (app review #7)', () async {
    final tokens = MemoryTokenStore()..token = 'rt_old';
    final trips = MemoryTripStore();
    await trips.save('b1', {'id': 'b1'});
    final quiz = QuizStore.memory();
    await quiz.write('v1', {'q': {'o'}}, 0);
    final marker = MemoryInstallMarker();

    await wipeAfterReinstall(marker, [tokens.clear, trips.clear, quiz.clear]);
    expect(tokens.token, isNull);
    expect(trips.trips, isEmpty);
    expect(await quiz.read(), isNull);

    // signed in again; the next launch is not a fresh install and keeps everything
    tokens.token = 'rt_new';
    await wipeAfterReinstall(marker, [tokens.clear, trips.clear, quiz.clear]);
    expect(tokens.token, 'rt_new');
  });
}
