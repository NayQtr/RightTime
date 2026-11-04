import 'package:intl/intl.dart';

/// Meetups are in Doha: times are shown in Asia/Qatar (UTC+3, no daylight saving) whatever the phone's time zone.
DateTime qatarTime(String iso) => DateTime.parse(iso).toUtc().add(const Duration(hours: 3));

/// Western digits everywhere, as on herzone.app (booking refs, counts and prices use them too); intl's Arabic dates
/// would otherwise mix in Arabic-Indic digits.
String latinDigits(String s) => s.replaceAllMapped(RegExp('[٠-٩]'), (m) => String.fromCharCode(m[0]!.codeUnitAt(0) - 0x0660 + 0x30));

String fmtWhen(String iso, String locale) => latinDigits(DateFormat('EEEE d MMMM · h:mm a', locale).format(qatarTime(iso)));

String fmtTime(String iso, String locale) => latinDigits(DateFormat('h:mm a', locale).format(qatarTime(iso)));
