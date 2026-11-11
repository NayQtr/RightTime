/// API shapes the app reads (see qatar/api/openapi/openapi.json). Only the fields the screens use.
class Money {
  const Money(this.display);
  final String display;
  static Money? fromJson(Object? j) => j is Map<String, dynamic> ? Money(j['display'] as String) : null;
}

class SessionSummary {
  const SessionSummary({required this.id, required this.experience, required this.language, required this.startsAt, required this.district, required this.seatsLeft, required this.isFull, this.myBookingId, this.languageMatch,
      this.occasionAllowed = true, this.occasionNoticeHours = 72});

  final String id;
  final String experience;
  final String language;
  final String startsAt;
  final String district;
  final int seatsLeft;
  final bool isFull;
  final String? myBookingId;
  final bool? languageMatch;

  /// Item 32 (provisional): the occasion question is offered only this far ahead (server: CELEBRATION_NOTICE_HOURS).
  final bool occasionAllowed;
  final int occasionNoticeHours;

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
        occasionAllowed: (j['occasion_allowed'] as bool?) ?? true,
        occasionNoticeHours: (j['occasion_notice_hours'] as num?)?.toInt() ?? 72,
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

  /// The name on her card is being reviewed (015): the venue and table code wait for it.
  bool get identityCheckPending => json['identity_check'] == 'pending';
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

  /// After the reveal: 'birthday' or 'other' when another woman at the table celebrates (never who); null otherwise.
  String? get celebration => _t?['celebration'] as String?;
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

  Map<String, dynamic> get _c => (_b['cancellation'] as Map<String, dynamic>?) ?? const {};
  bool get canCancel => (_c['can_cancel'] as bool?) ?? false;

  /// full | partial | none | null (not paid yet)
  String? get refundIfCancelledNow => _c['refund_if_cancelled_now'] as String?;
  String? get fullRefundUntil => _c['full_refund_until'] as String?;
  String? get amountPaid => Money.fromJson((json['payment'] as Map<String, dynamic>?)?['amount'])?.display;
  bool get hasAction => (json['actions'] as List? ?? const []).isNotEmpty;
  bool action(String type) => (json['actions'] as List? ?? const []).any((a) => (a as Map)['type'] == type);

  /// Tablemates with their seat token (only on the day and after); used to name someone in a private report.
  List<({String seat, String name})> get seats => ((_t?['members'] as List?) ?? const [])
      .map((m) => m as Map<String, dynamic>)
      .where((m) => m['seat'] != null)
      .map((m) => (seat: m['seat'] as String, name: (m['display_name'] as String?) ?? ''))
      .toList();

  /// After the organiser cancelled: the choice between another session and a refund, while it is open.
  ({bool open, String deadline, List<({String id, String startsAt, String district, bool alternate})> sessions, String? refund})? get resolution {
    final r = json['resolution'] as Map<String, dynamic>?;
    if (r == null) return null;
    final opts = (r['options'] as List).cast<Map<String, dynamic>>();
    final rebook = opts.firstWhere((o) => o['type'] == 'rebook', orElse: () => const {});
    final refund = opts.firstWhere((o) => o['type'] == 'refund', orElse: () => const {});
    return (
      open: (r['open'] as bool?) ?? false,
      deadline: r['choice_deadline'] as String,
      sessions: ((rebook['sessions'] as List?) ?? const [])
          .cast<Map<String, dynamic>>()
          .map((x) => (id: x['session_id'] as String, startsAt: x['starts_at'] as String, district: (x['district'] as String?) ?? '', alternate: (x['is_alternate'] as bool?) ?? false))
          .toList(),
      refund: Money.fromJson(refund['amount'])?.display,
    );
  }

  ({String id, String ref})? get rebookedInto {
    final r = json['rebooked_into'] as Map<String, dynamic>?;
    return r == null ? null : (id: r['booking_id'] as String, ref: r['ref'] as String);
  }

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

/// A decision taken about the member after a report ("Decisions about you"), with the 14-day appeal window.
class CaseDecision {
  const CaseDecision({required this.ref, required this.category, required this.decision, required this.status, this.eventDate, required this.appealUntil, required this.canAppeal});
  final String ref, category, decision, status, appealUntil;
  final String? eventDate;
  final bool canAppeal;

  factory CaseDecision.fromJson(Map<String, dynamic> j) => CaseDecision(
        ref: j['case_ref'] as String,
        category: j['category'] as String,
        decision: (j['decision_label'] as String?) ?? (j['decision'] as String),
        status: j['status'] as String,
        eventDate: j['event_date'] as String?,
        appealUntil: j['appeal_until'] as String,
        canAppeal: (j['can_appeal'] as bool?) ?? false,
      );
}

class Tablemate {
  const Tablemate({required this.seat, required this.name, required this.state, this.requestId, this.whatsappUrl, required this.canSend});
  final String seat;
  final String? name;

  /// none | sent | incoming | connected
  final String state;
  final String? requestId, whatsappUrl;
  final bool canSend;

  factory Tablemate.fromJson(Map<String, dynamic> j) => Tablemate(
        seat: j['seat'] as String,
        name: j['display_name'] as String?,
        state: j['state'] as String,
        requestId: j['request_id'] as String?,
        whatsappUrl: j['whatsapp_url'] as String?,
        canSend: (j['can_send'] as bool?) ?? false,
      );
}

class Contacts {
  const Contacts({required this.open, this.closesAt, required this.members});
  final bool open;
  final String? closesAt;
  final List<Tablemate> members;
}

class Coordinator {
  const Coordinator({required this.telUrl, required this.phoneDisplay, this.whatsappUrl});
  final String telUrl, phoneDisplay;
  final String? whatsappUrl;
}

/// A held seat (POST /bookings, GET /bookings/{id}): what the review and payment screens need.
class BookingStart {
  const BookingStart({required this.id, required this.ref, required this.status, required this.amount, this.holdExpiresAt, this.checkoutUrl,
      required this.ackRequired, this.fullRefundUntil, required this.refundWindowOpen, this.paymentStatus});

  final String id, ref, status, amount;
  final String? holdExpiresAt, checkoutUrl, fullRefundUntil, paymentStatus;
  final bool ackRequired, refundWindowOpen;

  bool get paid => const ['paid_awaiting_group', 'group_locked', 'revealed', 'checked_in', 'completed'].contains(status);
  bool get expired => const ['expired', 'payment_failed', 'cancelled_by_user', 'cancelled_by_organizer'].contains(status);
  bool get paymentFailed => paymentStatus == 'failed';

  factory BookingStart.fromJson(Map<String, dynamic> j) {
    final c = (j['cancellation'] as Map<String, dynamic>?) ?? const {};
    return BookingStart(
      id: (j['booking_id'] ?? j['id']) as String,
      ref: j['ref'] as String,
      status: j['status'] as String,
      amount: Money.fromJson(j['amount'])?.display ?? '',
      holdExpiresAt: j['hold_expires_at'] as String?,
      checkoutUrl: j['checkout_url'] as String?,
      ackRequired: c['acknowledgement_required'] == 'late_no_refund',
      fullRefundUntil: c['full_refund_until'] as String?,
      refundWindowOpen: (c['full_refund_window_open'] as bool?) ?? true,
      paymentStatus: (j['payment'] as Map<String, dynamic>?)?['status'] as String?,
    );
  }
}
