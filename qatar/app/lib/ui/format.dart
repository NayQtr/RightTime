import 'package:intl/intl.dart';

/// Meetups are in Doha: times are shown in Asia/Qatar (UTC+3, no daylight saving) whatever the phone's time zone.
DateTime qatarTime(String iso) => DateTime.parse(iso).toUtc().add(const Duration(hours: 3));

/// Western digits everywhere, as on herzone.app (booking refs, counts and prices use them too); intl's Arabic dates
/// would otherwise mix in Arabic-Indic digits.
String latinDigits(String s) => s.replaceAllMapped(RegExp('[٠-٩]'), (m) => String.fromCharCode(m[0]!.codeUnitAt(0) - 0x0660 + 0x30));

/// Keeps "7:30" and "م" / "PM" together: a narrow screen must never put the period on its own line.
String _glueTime(String s) => s.replaceAllMapped(RegExp(r'(\d)[ \u202F](م|ص|AM|PM)'), (m) => '${m[1]}\u00A0${m[2]}');

String fmtWhen(String iso, String locale) => _glueTime(latinDigits(DateFormat('EEEE d MMMM · h:mm a', locale).format(qatarTime(iso))));

String fmtTime(String iso, String locale) => _glueTime(latinDigits(DateFormat('h:mm a', locale).format(qatarTime(iso))));

/// A day on its own, for the dated rail of the notifications ("Thursday 12 November").
String fmtDate(String iso, String locale) => latinDigits(DateFormat('EEEE d MMMM', locale).format(qatarTime(iso)));

/// The month by name, beside the large day numeral on the details screen.
String fmtMonth(String iso, String locale) => DateFormat('MMMM', locale).format(qatarTime(iso));

/// The day of the month and the weekday for the date "leaf" on session cards (Western digits, Doha time).
String fmtDay(String iso) => latinDigits(DateFormat('d').format(qatarTime(iso)));
String fmtWeekday(String iso, String locale) => DateFormat('EEEE', locale).format(qatarTime(iso));

/// The Doha calendar day (yyyy-mm-dd) of a session, to filter by day; and its chip label ("Thu 12", "الخميس 12").
String qatarDayKey(String iso) => qatarTime(iso).toIso8601String().substring(0, 10);
String fmtDayChip(String iso, String locale) => latinDigits(DateFormat('EEE d', locale).format(qatarTime(iso)));

/// An amount in riyals from its minor units, written as the server writes it ("118 ر.ق", "QAR 118").
String fmtMoney(int minor, String locale) {
  final v = minor / 100;
  final s = minor % 100 == 0 ? '${minor ~/ 100}' : v.toStringAsFixed(2);
  return locale == 'en' ? 'QAR $s' : '$s ر.ق';
}
