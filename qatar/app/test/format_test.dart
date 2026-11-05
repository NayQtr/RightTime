import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:herzone/ui/format.dart';
import 'package:herzone/ui/theme.dart';
import 'package:intl/date_symbol_data_local.dart';

void main() {
  setUpAll(() => initializeDateFormatting());

  test('times are in Qatar time with Western digits, whatever the input offset', () {
    expect(fmtTime('2026-11-12T16:30:00Z', 'ar'), '7:30\u00A0م');
    expect(fmtWhen('2026-11-12T19:30:00+03:00', 'ar'), 'الخميس 12 نوفمبر · 7:30\u00A0م');
    expect(fmtWhen('2026-11-12T19:30:00+03:00', 'en'), 'Thursday 12 November · 7:30\u00A0PM');
  });

  test('the time never breaks across lines: a no-break space before م / PM', () {
    expect(fmtTime('2026-11-12T16:30:00Z', 'ar').contains('\u00A0م'), isTrue);
    expect(fmtWhen('2026-11-12T19:30:00+03:00', 'en').endsWith('7:30\u00A0PM'), isTrue);
  });

  test('every text style in the theme uses a HerZone font (no fallback to a font without Arabic)', () {
    for (final lang in ['ar', 'en']) {
      final t = herZoneTheme(Brightness.light, lang).textTheme;
      for (final s in [t.displayLarge, t.displayMedium, t.displaySmall, t.headlineLarge, t.headlineMedium, t.headlineSmall, t.titleLarge, t.titleMedium,
        t.titleSmall, t.bodyLarge, t.bodyMedium, t.bodySmall, t.labelLarge, t.labelMedium, t.labelSmall]) {
        if (s == null) continue;
        expect(['Alexandria', 'IBM Plex Sans Arabic'], contains(s.fontFamily), reason: '$lang $s');
      }
    }
  });
}
