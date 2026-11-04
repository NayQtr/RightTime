/// An API problem response (RFC 9457 style body from the HerZone API), or a network failure (code OFFLINE).
class ApiError implements Exception {
  const ApiError({required this.status, required this.code, required this.message, this.retryAfter, this.details = const []});

  final int status;
  final String code;

  /// Localised by the server from the request's Accept-Language; safe to show to the member.
  final String message;
  final int? retryAfter;
  final List<Map<String, dynamic>> details;

  bool get isOffline => code == 'OFFLINE';

  static const offline = ApiError(status: 0, code: 'OFFLINE', message: '');

  @override
  String toString() => 'ApiError($status $code)';
}
