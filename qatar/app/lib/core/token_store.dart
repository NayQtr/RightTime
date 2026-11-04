import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Where the refresh token lives between app launches. The access token is never stored (memory only, NMX-50,
/// MASVS-STORAGE-1); the refresh token goes to the iOS Keychain / Android Keystore-backed storage only.
abstract interface class TokenStore {
  Future<String?> readRefreshToken();
  Future<void> writeRefreshToken(String token);
  Future<void> clear();
}

class SecureTokenStore implements TokenStore {
  SecureTokenStore([FlutterSecureStorage? storage])
      : _storage = storage ??
            const FlutterSecureStorage(
              // this device only, never in iCloud backups or on another phone; readable after the first unlock so a
              // background refresh works
              iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device, synchronizable: false),
            );

  final FlutterSecureStorage _storage;
  static const _key = 'hz.refresh_token';

  @override
  Future<String?> readRefreshToken() => _storage.read(key: _key);

  @override
  Future<void> writeRefreshToken(String token) => _storage.write(key: _key, value: token);

  @override
  Future<void> clear() => _storage.delete(key: _key);
}

/// For tests and previews.
class MemoryTokenStore implements TokenStore {
  String? token;

  @override
  Future<String?> readRefreshToken() async => token;

  @override
  Future<void> writeRefreshToken(String t) async => token = t;

  @override
  Future<void> clear() async => token = null;
}
