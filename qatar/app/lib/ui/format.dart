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

/// The day of the month and the weekday for the date "leaf" on session cards (Western digits, Doha time).
String fmtDay(String iso) => latinDigits(DateFormat('d').format(qatarTime(iso)));
String fmtWeekday(String iso, String locale) => DateFormat('EEEE', locale).format(qatarTime(iso));
