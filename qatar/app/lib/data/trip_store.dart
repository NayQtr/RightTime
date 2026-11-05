import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// A saved copy of an upcoming meetup's details (venue, arrival notes, table code) so they open with no connection
/// (NMX-51, same rules as the website's NMX-16). Kept in the Keychain / Keystore-backed storage, not in plain files,
/// because a venue and table code tell someone where the member will be. Removed on sign-out.
abstract interface class TripStore {
  Future<({Map<String, dynamic> json, DateTime savedAt})?> read(String bookingId);
  Future<void> save(String bookingId, Map<String, dynamic> json);
  Future<void> remove(String bookingId);
  Future<void> clear();
}

class SecureTripStore implements TripStore {
  SecureTripStore([FlutterSecureStorage? s])
      : _s = s ?? const FlutterSecureStorage(iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device, synchronizable: false));

  final FlutterSecureStorage _s;
  static const _prefix = 'hz.trip.';

  @override
  Future<({Map<String, dynamic> json, DateTime savedAt})?> read(String id) async {
    final raw = await _s.read(key: '$_prefix$id');
    if (raw == null) return null;
    final m = jsonDecode(raw) as Map<String, dynamic>;
    return (json: m['data'] as Map<String, dynamic>, savedAt: DateTime.parse(m['saved_at'] as String));
  }

  @override
  Future<void> save(String id, Map<String, dynamic> json) =>
      _s.write(key: '$_prefix$id', value: jsonEncode({'saved_at': DateTime.now().toUtc().toIso8601String(), 'data': json}));

  @override
  Future<void> remove(String id) => _s.delete(key: '$_prefix$id');

  @override
  Future<void> clear() async {
    for (final k in (await _s.readAll()).keys.where((k) => k.startsWith(_prefix))) {
      await _s.delete(key: k);
    }
  }
}

class MemoryTripStore implements TripStore {
  final Map<String, ({Map<String, dynamic> json, DateTime savedAt})> trips = {};

  @override
  Future<({Map<String, dynamic> json, DateTime savedAt})?> read(String id) async => trips[id];

  @override
  Future<void> save(String id, Map<String, dynamic> json) async => trips[id] = (json: json, savedAt: DateTime.now().toUtc());

  @override
  Future<void> remove(String id) async => trips.remove(id);

  @override
  Future<void> clear() async => trips.clear();
}
