/// API shapes the app reads (see qatar/api/openapi/openapi.json). Only the fields the screens use.
class Money {
  const Money(this.display);
  final String display;
  static Money? fromJson(Object? j) => j is Map<String, dynamic> ? Money(j['display'] as String) : null;
}

class SessionSummary {
  const SessionSummary({required this.id, required this.experience, required this.language, required this.startsAt, required this.district, required this.seatsLeft, required this.isFull, this.myBookingId, this.languageMatch});

  final String id;
  final String experience;
  final String language;
  final String startsAt;
  final String district;
  final int seatsLeft;
  final bool isFull;
  final String? myBookingId;
  final bool? languageMatch;

  factory SessionSummary.fromJson(Map<String, dynamic> j) => SessionSummary(
        id: j['id'] as String,
        experience: j['experience'] as String,
        language: j['conversation_language'] as String,
        startsAt: j['starts_at'] as String,
        district: (j['district'] as String?) ?? '',
        seatsLeft: (j['seats_left'] as num).toInt(),
        isFull: j['is_full'] as bool,
        myBookingId: j['my_booking_id'] as String?,
        languageMatch: j['language_match'] as bool?,
      );
}

class BookingSummary {
  const BookingSummary({required this.id, required this.ref, required this.status, required this.phase, required this.experience, required this.startsAt, required this.district});

  final String id;
  final String ref;
  final String status;
  final String phase;
  final String experience;
  final String startsAt;
  final String district;

  static const active = ['payment_pending', 'paid_awaiting_group', 'group_locked', 'revealed', 'checked_in'];
  bool get isActive => active.contains(status);

  factory BookingSummary.fromJson(Map<String, dynamic> j) => BookingSummary(
        id: j['id'] as String,
        ref: j['ref'] as String,
        status: j['status'] as String,
        phase: (j['phase'] as String?) ?? '',
        experience: j['experience'] as String,
        startsAt: j['starts_at'] as String,
        district: (j['district'] as String?) ?? '',
      );
}

class Venue {
  const Venue({required this.name, required this.address, required this.district, required this.mapUrl, required this.arrival, required this.billPolicy});
  final String name, address, district, mapUrl, arrival, billPolicy;
}

/// GET /api/v1/bookings/{id}/event-details. The raw JSON is kept so the same object can be saved for offline use.
class EventDetails {
  EventDetails(this.json);

  final Map<String, dynamic> json;

  Map<String, dynamic> get _s => json['session'] as Map<String, dynamic>;
  Map<String, dynamic> get _b => json['booking'] as Map<String, dynamic>;
  Map<String, dynamic>? get _t => json['table'] as Map<String, dynamic>?;
  Map<String, dynamic>? get _v => json['venue'] as Map<String, dynamic>?;

  String get phase => (json['reveal'] as Map<String, dynamic>)['phase'] as String;
  String get revealAt => (json['reveal'] as Map<String, dynamic>)['reveal_at'] as String;
  String get ref => _b['ref'] as String;
  String get status => _b['status'] as String;
  String get experience => _s['experience'] as String;
  String get startsAt => _s['starts_at'] as String;
  String get district => (_s['district'] as String?) ?? '';
  String get language => _s['conversation_language'] as String;
  String? get foodBand => Money.fromJson(_s['food_price_band'])?.display;
  int? get confirmedCount => (_t?['confirmed_count'] as num?)?.toInt();
  int? get capacity => (_t?['capacity'] as num?)?.toInt();
  String? get tableCode => _t?['code'] as String?;
  List<String> get tablemates => ((_t?['members'] as List?) ?? const []).map((m) => ((m as Map)['display_name'] as String?) ?? '').where((n) => n.isNotEmpty).toList();
  Venue? get venue => _v == null
      ? null
      : Venue(
          name: _v!['name'] as String,
          address: (_v!['address'] as String?) ?? '',
          district: (_v!['district'] as String?) ?? '',
          mapUrl: (_v!['map_url'] as String?) ?? '',
          arrival: (_v!['arrival_instructions'] as String?) ?? '',
          billPolicy: (_v!['bill_policy'] as String?) ?? '',
        );

  /// Stage on the tracker (paid, forming, confirmed, revealed), or null when there is no tracker (cancelled, completed).
  int? get stage => const {'forming': 1, 'locked': 2, 'revealed': 3, 'day_of': 3}[phase];

  bool get isOver => phase == 'cancelled' || phase == 'completed';
}

class Notice {
  const Notice({required this.id, required this.text, required this.createdAt, this.bookingId});
  final String id, text, createdAt;
  final String? bookingId;

  factory Notice.fromJson(Map<String, dynamic> j) =>
      Notice(id: j['id'] as String, text: (j['text'] as String?) ?? '', createdAt: j['created_at'] as String, bookingId: j['booking_id'] as String?);
}
