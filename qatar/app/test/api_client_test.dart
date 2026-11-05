import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/core/api_client.dart';
import 'package:herzone/core/api_error.dart';
import 'package:herzone/core/token_store.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

ApiClient client(MockClient http, MemoryTokenStore store, {void Function()? onSignedOut}) =>
    ApiClient(baseUrl: 'https://api.test', tokens: store, locale: () => 'ar', httpClient: http, onSignedOut: onSignedOut, retryPause: Duration.zero);

http.Response jsonRes(Object body, [int status = 200]) => http.Response(jsonEncode(body), status, headers: {'content-type': 'application/json'});

void main() {
  test('writes carry an Idempotency-Key, reused on the automatic retry after a dropped connection', () async {
    final keys = <String?>[];
    var calls = 0;
    final api = client(MockClient((r) async {
      keys.add(r.headers['Idempotency-Key']);
      if (++calls == 1) throw http.ClientException('connection reset');
      return jsonRes({'ok': true});
    }), MemoryTokenStore());
    await api.send('POST', '/api/v1/x', body: {}, auth: false);
    expect(keys.length, 2);
    expect(keys[0], isNotNull);
    expect(keys[1], keys[0]);
  });

  test('two calls that need a refresh at the same time share one refresh (no token reuse)', () async {
    var refreshes = 0;
    final gate = Completer<void>();
    final store = MemoryTokenStore()..token = 'rt_1';
    final api = client(MockClient((r) async {
      if (r.url.path.endsWith('token:refresh')) {
        refreshes++;
        await gate.future;
        return jsonRes({'access_token': 'at_2', 'refresh_token': 'rt_2'});
      }
      return r.headers['Authorization'] == 'Bearer at_2' ? jsonRes({'ok': true}) : jsonRes({'code': 'UNAUTHENTICATED'}, 401);
    }), store);
    final a = api.send('GET', '/api/v1/a');
    final b = api.send('GET', '/api/v1/b');
    gate.complete();
    await Future.wait([a, b]);
    expect(refreshes, 1);
    expect(store.token, 'rt_2');
  });

  test('no network during refresh keeps the member signed in (OFFLINE, refresh token kept)', () async {
    var signedOut = false;
    final store = MemoryTokenStore()..token = 'rt_1';
    final api = client(MockClient((r) async => throw http.ClientException('offline')), store, onSignedOut: () => signedOut = true);
    await expectLater(api.send('GET', '/api/v1/bookings'), throwsA(isA<ApiError>().having((e) => e.isOffline, 'offline', true)));
    expect(store.token, 'rt_1');
    expect(signedOut, false);
  });

  test('the server refusing the refresh token signs out: token removed, callback called', () async {
    var signedOut = false;
    final store = MemoryTokenStore()..token = 'rt_old';
    final api = client(MockClient((r) async => jsonRes({'code': 'UNAUTHENTICATED'}, 401)), store, onSignedOut: () => signedOut = true);
    expect(await api.refresh(), RefreshOutcome.signedOut);
    expect(store.token, isNull);
    expect(signedOut, true);
  });

  test('a stalled connection counts as offline after the timeout, retried once with the same Idempotency-Key (app review #8)', () async {
    final keys = <String?>[];
    final store = MemoryTokenStore();
    final api = ApiClient(baseUrl: 'https://api.test', tokens: store, locale: () => 'ar', retryPause: Duration.zero, timeout: const Duration(milliseconds: 50),
        httpClient: MockClient((r) async {
      keys.add(r.headers['Idempotency-Key']);
      await Future<void>.delayed(const Duration(seconds: 5));
      return http.Response('{}', 200);
    }));
    await expectLater(api.send('POST', '/api/v1/x', body: {}, auth: false), throwsA(isA<ApiError>().having((e) => e.isOffline, 'offline', isTrue)));
    expect(keys, hasLength(2));
    expect(keys[0], isNotNull);
    expect(keys[1], keys[0]);
  });

  test('problem responses become ApiError with the server message and Retry-After', () async {
    final api = client(MockClient((r) async => http.Response(jsonEncode({'code': 'OTP_RATE_LIMITED', 'message': 'طلبتِ رموزًا كثيرة.'}), 429,
        headers: {'retry-after': '60', 'content-type': 'application/json; charset=utf-8'})), MemoryTokenStore());
    await expectLater(
        api.send('POST', '/api/v1/auth/otp:request', body: {}, auth: false),
        throwsA(isA<ApiError>()
            .having((e) => e.code, 'code', 'OTP_RATE_LIMITED')
            .having((e) => e.retryAfter, 'retryAfter', 60)
            .having((e) => e.message, 'message', 'طلبتِ رموزًا كثيرة.')));
  });
}
