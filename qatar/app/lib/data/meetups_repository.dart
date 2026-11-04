import '../core/api_client.dart';
import '../core/api_error.dart';
import 'models.dart';
import 'trip_store.dart';

/// Details plus, when read from the device copy, when that copy was saved.
typedef DetailsResult = ({EventDetails details, DateTime? offlineSavedAt});

class MeetupsRepository {
  MeetupsRepository(this._api, this._trips);

  final ApiClient _api;
  final TripStore _trips;
  static const _coordinatorKey = 'coordinator';

  Future<List<SessionSummary>> sessions() async {
    final r = await _api.send('GET', '/api/v1/sessions');
    return ((r!['sessions'] as List?) ?? const [])
        .map((j) => SessionSummary.fromJson(j as Map<String, dynamic>))
        .where((s) => s.languageMatch != false)
        .toList();
  }

  Future<List<BookingSummary>> bookings() async {
    final r = await _api.send('GET', '/api/v1/bookings');
    return ((r!['bookings'] as List?) ?? const []).map((j) => BookingSummary.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<List<Notice>> notifications() async {
    final r = await _api.send('GET', '/api/v1/notifications');
    return ((r!['notifications'] as List?) ?? const []).map((j) => Notice.fromJson(j as Map<String, dynamic>)).toList();
  }

  /// Fresh details when online (and the device copy refreshed); the device copy when offline; finished meetups are
  /// never kept.
  Future<DetailsResult> eventDetails(String bookingId) async {
    try {
      final d = EventDetails((await _api.send('GET', '/api/v1/bookings/$bookingId/event-details'))!);
      if (d.isOver) {
        await _trips.remove(bookingId);
      } else {
        await _trips.save(bookingId, d.json);
      }
      return (details: d, offlineSavedAt: null);
    } on ApiError catch (e) {
      if (!e.isOffline) rethrow;
      final saved = await _trips.read(bookingId);
      if (saved == null) rethrow;
      return (details: EventDetails(saved.json), offlineSavedAt: saved.savedAt);
    }
  }

  Future<void> forgetDevice() => _trips.clear();

  /// reason: schedule_changed | illness | other | null
  Future<void> cancel(String bookingId, String? reason) async {
    await _api.send('POST', '/api/v1/bookings/$bookingId/cancel', body: {'reason_code': ?reason});
    await _trips.remove(bookingId);
  }

  Future<Contacts> contacts(String bookingId) async {
    final r = (await _api.send('GET', '/api/v1/bookings/$bookingId/contacts'))!;
    return Contacts(
      open: (r['open'] as bool?) ?? false,
      closesAt: r['closes_at'] as String?,
      members: ((r['members'] as List?) ?? const []).map((m) => Tablemate.fromJson(m as Map<String, dynamic>)).toList(),
    );
  }

  Future<void> requestContact(String bookingId, String seat) => _api.send('POST', '/api/v1/contact-requests', body: {'booking_id': bookingId, 'seat': seat});
  Future<void> answerContact(String requestId, {required bool accept}) => _api.send('POST', '/api/v1/contact-requests/$requestId:${accept ? 'accept' : 'decline'}', body: {});

  /// Returns the case reference.
  Future<String> report({required String bookingId, required String category, required String timing, required bool danger, String? seat, String? description}) async {
    final r = await _api.send('POST', '/api/v1/reports', body: {
      'booking_id': bookingId,
      'category': category,
      'timing': timing,
      'immediate_danger': danger,
      'reported_seat': ?seat,
      if (description != null && description.trim().isNotEmpty) 'description': description.trim(),
    });
    return (r?['case_ref'] as String?) ?? '';
  }

  /// The coordinator's public number, kept from the last successful load so "call" works with no data connection.
  Future<Coordinator?> coordinator() async {
    Map<String, dynamic>? c;
    try {
      final r = await _api.send('GET', '/api/v1/support/contact', auth: false);
      c = r?['coordinator'] as Map<String, dynamic>?;
      if (c != null) await _trips.save(_coordinatorKey, c);
    } on ApiError catch (e) {
      if (!e.isOffline) rethrow;
      c = (await _trips.read(_coordinatorKey))?.json;
    }
    return c == null ? null : Coordinator(telUrl: c['tel_url'] as String, phoneDisplay: c['phone_display'] as String, whatsappUrl: c['whatsapp_url'] as String?);
  }

  /// Holds a seat for a few minutes and returns what the review needs (and the checkout link when no acknowledgement
  /// is needed).
  Future<BookingStart> book(String sessionId) async => BookingStart.fromJson((await _api.send('POST', '/api/v1/bookings', body: {'session_id': sessionId}))!);

  Future<BookingStart> booking(String bookingId) async => BookingStart.fromJson((await _api.send('GET', '/api/v1/bookings/$bookingId'))!);

  /// A checkout link while the seat is held; after the full-refund cut-off it records her acknowledgement.
  Future<String> checkout(String bookingId, {required bool acknowledgeLate}) async {
    final r = await _api.send('POST', '/api/v1/bookings/$bookingId/checkout', body: {'acknowledge_late_no_refund': ?(acknowledgeLate ? true : null)});
    return r!['checkout_url'] as String;
  }

  /// "I'm here" at the venue on the day.
  Future<void> checkIn(String bookingId) => _api.send('POST', '/api/v1/bookings/$bookingId/check-in', body: {});

  /// Private feedback after the meetup (once).
  Future<void> feedback(String bookingId, {required int overall, required int comfort, int? venue, bool? again, String? comment}) =>
      _api.send('POST', '/api/v1/bookings/$bookingId/feedback', body: {
        'overall_rating': overall,
        'comfort_rating': comfort,
        'venue_rating': ?venue,
        'would_book_again': ?again,
        if (comment != null && comment.trim().isNotEmpty) 'comment': comment.trim(),
      });

  /// After the organiser cancelled: move to another session (the fee carries over) or take the full refund.
  Future<void> resolve(String bookingId, {String? rebookSessionId}) => _api.send('POST', '/api/v1/bookings/$bookingId/resolution',
      body: rebookSessionId == null ? {'choice': 'refund'} : {'choice': 'rebook', 'session_id': rebookSessionId});
}
