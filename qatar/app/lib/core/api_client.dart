import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:uuid/uuid.dart';

import 'api_error.dart';
import 'token_store.dart';

enum RefreshOutcome { ok, signedOut, offline }

/// HTTP client for the HerZone API. Same rules as the web app (qatar/web/app.js):
/// - the access token is kept in memory only; the refresh token is in [TokenStore];
/// - refreshes run one at a time, so two calls never present the same refresh token (the server treats that as theft
///   and ends the session);
/// - only the server saying the session is over (401 on refresh) signs the member out; no network keeps her signed in;
/// - every write carries an Idempotency-Key, reused on the one automatic retry, so a write is never applied twice.
class ApiClient {
  ApiClient({
    required this.baseUrl,
    required this.tokens,
    required this.locale,
    http.Client? httpClient,
    this.onSignedOut,
    this.onUpdateRequired,
    this.appVersion = '',
    this.retryPause = const Duration(milliseconds: 1200),
    this.timeout = const Duration(seconds: 15),
  }) : _http = httpClient ?? http.Client();

  final String baseUrl;
  final TokenStore tokens;
  final String Function() locale;
  final void Function()? onSignedOut;

  /// Called when the server refuses this app version (426). Arguments: the store link, if given, and the server's
  /// localised message.
  final void Function(String? storeUrl, String message)? onUpdateRequired;

  /// Sent as `X-HerZone-App` on every call, e.g. "1.0.0+1 android", so the server can require an update (NMX-61).
  final String appVersion;
  final Duration retryPause;

  /// A stalled connection (weak signal at the venue) counts as offline after this, so the saved copy shows instead of a
  /// spinner that never ends (app review #8). A timed-out write is retried with the same Idempotency-Key.
  final Duration timeout;
  final http.Client _http;
  static const _uuid = Uuid();

  String? _accessToken;
  Future<RefreshOutcome>? _refreshing;

  bool get hasAccessToken => _accessToken != null;

  /// Stores a fresh token pair from sign-in or refresh.
  Future<void> saveTokens(Map<String, dynamic> t) async {
    _accessToken = t['access_token'] as String?;
    final refresh = t['refresh_token'] as String?;
    if (refresh != null) await tokens.writeRefreshToken(refresh);
  }

  Future<void> clearSession() async {
    _accessToken = null;
    await tokens.clear();
  }

  Future<RefreshOutcome> refresh() => _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);

  Future<RefreshOutcome> _doRefresh() async {
    final rt = await tokens.readRefreshToken();
    if (rt == null) return RefreshOutcome.signedOut;
    http.Response res;
    try {
      res = await _http.post(Uri.parse('$baseUrl/api/v1/auth/token:refresh'),
          headers: {'Content-Type': 'application/json', if (appVersion.isNotEmpty) 'X-HerZone-App': appVersion},
          body: jsonEncode({'refresh_token': rt})).timeout(timeout);
    } catch (_) {
      return RefreshOutcome.offline;
    }
    if (res.statusCode == 200) {
      await saveTokens(jsonDecode(res.body) as Map<String, dynamic>);
      return RefreshOutcome.ok;
    }
    if (res.statusCode == 426) {
      // too old to talk to the server: keep the session for after the update
      final m = jsonDecode(utf8.decode(res.bodyBytes));
      final d = m is Map<String, dynamic> ? ((m['details'] as List?) ?? const []).whereType<Map<String, dynamic>>() : const <Map<String, dynamic>>[];
      onUpdateRequired?.call(d.isEmpty ? null : d.first['store_url'] as String?, m is Map<String, dynamic> ? (m['message'] as String?) ?? '' : '');
      return RefreshOutcome.offline;
    }
    if (res.statusCode == 401) {
      await clearSession();
      onSignedOut?.call();
      return RefreshOutcome.signedOut;
    }
    return RefreshOutcome.offline;
  }

  /// Sends a request and returns the decoded JSON body (or null for 204). Throws [ApiError].
  Future<Map<String, dynamic>?> send(String method, String path, {Object? body, bool auth = true, bool retried = false, String? idem}) async {
    if (auth && _accessToken == null && await tokens.readRefreshToken() != null) {
      final r = await refresh();
      if (r == RefreshOutcome.offline) throw ApiError.offline;
    }
    final key = method == 'GET' ? null : (idem ?? _uuid.v4());
    final headers = <String, String>{
      'Accept-Language': locale(),
      if (appVersion.isNotEmpty) 'X-HerZone-App': appVersion,
      if (auth && _accessToken != null) 'Authorization': 'Bearer $_accessToken',
      if (body != null) 'Content-Type': 'application/json',
      'Idempotency-Key': ?key,
    };
    Future<http.Response> once() async {
      final req = http.Request(method, Uri.parse('$baseUrl$path'))..headers.addAll(headers);
      if (body != null) req.body = jsonEncode(body);
      return _http.send(req).then(http.Response.fromStream).timeout(timeout);
    }

    http.Response res;
    try {
      res = await once();
    } catch (_) {
      await Future<void>.delayed(retryPause);
      try {
        res = await once();
      } catch (_) {
        throw ApiError.offline;
      }
    }
    if (res.statusCode == 401 && auth && !retried && await tokens.readRefreshToken() != null) {
      _accessToken = null;
      final r = await refresh();
      if (r == RefreshOutcome.ok) return send(method, path, body: body, auth: auth, retried: true, idem: key);
      if (r == RefreshOutcome.offline) throw ApiError.offline;
    }
    final decoded = res.body.isEmpty ? null : jsonDecode(utf8.decode(res.bodyBytes));
    if (res.statusCode >= 200 && res.statusCode < 300) return decoded is Map<String, dynamic> ? decoded : null;
    final m = decoded is Map<String, dynamic> ? decoded : const <String, dynamic>{};
    if (res.statusCode == 426) {
      final d = ((m['details'] as List?) ?? const []).whereType<Map<String, dynamic>>();
      onUpdateRequired?.call(d.isEmpty ? null : d.first['store_url'] as String?, (m['message'] as String?) ?? '');
    }
    throw ApiError(
      status: res.statusCode,
      code: (m['code'] as String?) ?? 'HTTP_${res.statusCode}',
      message: (m['message'] as String?) ?? '',
      retryAfter: int.tryParse(res.headers['retry-after'] ?? ''),
      details: ((m['details'] as List?) ?? const []).whereType<Map<String, dynamic>>().toList(),
    );
  }
}
