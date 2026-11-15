import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/models.dart';

/// The unread count on the Notifications tab, by the website's rule (NMX-18): notifications newer than the last time
/// she opened the notifications page on this device. The time of the newest notification she saw is kept on the
/// device and removed when the session ends.
class InboxBadge extends ChangeNotifier {
  InboxBadge(this._load) {
    _readStored();
  }

  final Future<List<Notice>> Function() _load;
  static const _key = 'hz.inboxSeen';

  /// Notifications new since her last visit.
  int unread = 0;

  /// Goes up each time she opens the Notifications tab, so the list is fetched again and marks what is new now.
  int visit = 0;

  /// The newest notification time she has seen (ISO), or null when she has never opened the page here. Read from the
  /// device once, at start; the page never waits for the device store.
  String? seen;
  DateTime? _fetchedAt;
  int _gen = 0; // a count that arrives after she opened the page is stale

  Future<void> _readStored() async {
    final gen = _gen;
    try {
      final stored = (await SharedPreferences.getInstance()).getString(_key);
      if (gen == _gen) seen = stored;
    } catch (_) {/* no store: everything counts as new */}
  }

  /// New since [seen]: newer than the time she last saw, or everything when she never opened the page.
  static bool isNew(Notice n, String? seen) {
    final at = DateTime.tryParse(n.createdAt), before = seen == null ? null : DateTime.tryParse(seen);
    return before == null || (at != null && at.isAfter(before));
  }

  /// Counts again, at most once a minute unless [force]d. A failed fetch keeps the count as it was.
  Future<void> refresh({bool force = false}) async {
    final now = DateTime.now();
    if (!force && _fetchedAt != null && now.difference(_fetchedAt!) < const Duration(minutes: 1)) return;
    _fetchedAt = now;
    final gen = _gen;
    try {
      final list = await _load();
      if (gen == _gen) _set(list.where((n) => isNew(n, seen)).length);
    } catch (_) {/* offline or refused: no change */}
  }

  /// She opened the Notifications tab: the list is fetched again, and the count clears when she can read it ([clear]:
  /// false while the notifications are locked behind Face ID / fingerprint).
  void opened({bool clear = true}) {
    visit++;
    if (clear) {
      _gen++;
      unread = 0;
    }
    notifyListeners();
  }

  /// The list was shown: everything in it is seen from now on. Returns the time she had seen before, to mark the new ones.
  String? markSeen(List<Notice> list) {
    final before = seen;
    _gen++;
    String? newest;
    for (final n in list) {
      final at = DateTime.tryParse(n.createdAt);
      if (at != null && (newest == null || at.isAfter(DateTime.parse(newest)))) newest = n.createdAt;
    }
    if (newest != null) {
      seen = newest;
      SharedPreferences.getInstance().then((p) => p.setString(_key, newest!)).catchError((_) => false); // kept for this run only when it fails
    }
    _set(0);
    return before;
  }

  /// When a session ends: nothing of hers stays on the device.
  Future<void> forget() async {
    _gen++;
    seen = null;
    _fetchedAt = null;
    _set(0);
    try {
      await (await SharedPreferences.getInstance()).remove(_key);
    } catch (_) {/* nothing stored */}
  }

  void _set(int n) {
    if (n == unread) return;
    unread = n;
    notifyListeners();
  }
}
