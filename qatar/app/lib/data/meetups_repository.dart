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
}
