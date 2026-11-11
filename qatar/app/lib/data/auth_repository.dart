import '../core/api_client.dart';
import '../core/api_error.dart';

/// A sign-in code was sent: what the OTP screen needs.
class Challenge {
  const Challenge({required this.id, required this.phone, required this.resendAfter, this.devCode});

  final String id;
  final String phone;

  /// +974 5550 1234: easier to check at a glance than the raw E.164 form.
  String get phoneDisplay => phone.length == 12 ? '${phone.substring(0, 4)} ${phone.substring(4, 8)} ${phone.substring(8)}' : phone;
  final int resendAfter;

  /// Only on staging (OTP_DEV_MODE): the code, so testers can sign in without SMS.
  final String? devCode;
}

class Me {
  const Me({required this.id, required this.displayName, required this.registrationStatus, required this.status, this.phoneE164});

  final String id;
  final String? displayName;
  final String registrationStatus;
  final String status;
  final String? phoneE164;

  factory Me.fromJson(Map<String, dynamic> j) => Me(
        id: j['id'] as String,
        displayName: j['display_name'] as String?,
        registrationStatus: (j['registration_status'] as String?) ?? 'incomplete',
        status: (j['status'] as String?) ?? 'active',
        phoneE164: j['phone_e164'] as String?,
      );
}

/// Sign-in and the signed-in member, over the HerZone API (openapi/openapi.json: otp:request, otp:verify, users/me).
class AuthRepository {
  AuthRepository(this._api);

  final ApiClient _api;
  static final _qatar = RegExp(r'^[3-7][0-9]{7}$');
  static final _international = RegExp(r'^[0-9]{4,15}$');

  /// The local digits (spaces and dashes allowed) as an E.164 number for the country whose calling code is [dial], or
  /// null when they cannot be one. Qatar keeps its strict 8-digit pattern; any other country takes a plausible
  /// international number and the server has the last word (422 UNSUPPORTED_COUNTRY, 400 INVALID_PHONE).
  static String? toE164(String local, {String dial = '974'}) {
    final digits = local.replaceAll(RegExp(r'[\s-]'), '');
    final ok = dial == '974' ? _qatar.hasMatch(digits) : _international.hasMatch(digits) && '$dial$digits'.length <= 15;
    return ok ? '+$dial$digits' : null;
  }

  Future<Challenge> requestCode(String phoneE164, String locale) async {
    final r = await _api.send('POST', '/api/v1/auth/otp:request', body: {'phone_e164': phoneE164, 'locale': locale}, auth: false);
    return Challenge(
      id: r!['challenge_id'] as String,
      phone: phoneE164,
      resendAfter: (r['resend_after'] as num?)?.toInt() ?? 45,
      devCode: r['dev_code'] as String?,
    );
  }

  Future<void> verify(Challenge c, String code, String locale) async {
    final r = await _api.send('POST', '/api/v1/auth/otp:verify', body: {'challenge_id': c.id, 'code': code, 'locale': locale}, auth: false);
    await _api.saveTokens(r!);
  }

  Future<Me> me() async => Me.fromJson((await _api.send('GET', '/api/v1/users/me'))!['user'] as Map<String, dynamic>);

  /// Ends the session on the server (the access token stops working at once), then forgets it on this device. Offline,
  /// the device copy is still removed.
  Future<void> signOut() async {
    final rt = await _api.tokens.readRefreshToken();
    try {
      await _api.send('POST', '/api/v1/auth/logout', body: {'refresh_token': rt});
    } on ApiError {
      // signed out locally whatever the server says
    }
    await _api.clearSession();
  }

  /// Asks the server to delete the account (it ends every session at once; data is removed under the retention
  /// policy). Throws [ApiError] if the request did not reach the server, so the member is never told it worked when it
  /// did not. Then forgets the session on this device.
  Future<void> deleteAccount() async {
    await _api.send('DELETE', '/api/v1/users/me');
    await _api.clearSession();
  }
}
