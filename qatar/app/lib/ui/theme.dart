import 'package:flutter/material.dart';

import '../design/herzone_tokens.dart';

/// HerZone theme: generated tokens (design/herzone_tokens.dart, same source as the web) plus component styles that
/// match the web app: 48 dp touch targets, maroon primary buttons, rounded fields.
ThemeData herZoneTheme(Brightness brightness, String lang) {
  final base = hzTheme(brightness, lang);
  final c = brightness == Brightness.dark ? HzColors.dark : HzColors.light;
  final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(HzRadius.md));
  // the tokens define the main styles; every other Material slot (tab labels, list titles, small labels) gets the
  // HerZone body font too, so no widget falls back to a font without Arabic letters
  final tt = base.textTheme;
  final body = tt.bodyMedium!;
  final display = tt.displaySmall!;
  final headline = tt.headlineMedium!;
  TextStyle from(TextStyle? m3, TextStyle ours, {double? size, FontWeight? weight}) =>
      (m3 ?? ours).merge(ours).copyWith(fontSize: size ?? (m3 ?? ours).fontSize, fontWeight: weight ?? ours.fontWeight);
  final textTheme = TextTheme(
    displayLarge: from(tt.displayLarge, display),
    displayMedium: from(tt.displayMedium, display),
    displaySmall: display,
    headlineLarge: from(tt.headlineLarge, headline),
    headlineMedium: headline,
    headlineSmall: from(tt.headlineSmall, tt.titleLarge!),
    titleLarge: tt.titleLarge,
    titleMedium: from(tt.titleMedium, body, size: 16, weight: FontWeight.w600),
    titleSmall: from(tt.titleSmall, body, size: 14, weight: FontWeight.w600),
    bodyLarge: tt.bodyLarge,
    bodyMedium: body,
    bodySmall: tt.bodySmall,
    labelLarge: tt.labelLarge,
    labelMedium: from(tt.labelMedium, body, size: 13, weight: FontWeight.w500),
    labelSmall: from(tt.labelSmall, body, size: 12, weight: FontWeight.w500),
  );
  return base.copyWith(
    textTheme: textTheme,
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        shape: shape,
        backgroundColor: c.primary,
        foregroundColor: c.onPrimary,
        disabledBackgroundColor: c.surfaceSunken,
        disabledForegroundColor: c.textDisabled,
        textStyle: base.textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52), shape: shape, foregroundColor: c.text, disabledForegroundColor: c.textDisabled, side: BorderSide(color: c.borderStrong)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: HzSpace.s4, vertical: HzSpace.s4),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(HzRadius.md), borderSide: BorderSide(color: c.border)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(HzRadius.md), borderSide: BorderSide(color: c.border)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(HzRadius.md), borderSide: BorderSide(color: c.focus, width: 2)),
    ),
    // cards as on the web (.card): a sunken fill, no border and no shadow
    cardTheme: CardThemeData(color: c.surfaceSunken, elevation: 0, surfaceTintColor: Colors.transparent, shadowColor: Colors.transparent, shape: shape),
    appBarTheme: AppBarTheme(backgroundColor: c.bg, foregroundColor: c.text, elevation: 0, scrolledUnderElevation: 0, centerTitle: false),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: c.surface,
      indicatorColor: c.primarySubtle,
      labelTextStyle: WidgetStatePropertyAll(textTheme.labelMedium),
      iconTheme: WidgetStateProperty.resolveWith((states) => IconThemeData(color: states.contains(WidgetState.selected) ? c.primary : c.textMuted)),
    ),
  );
}

/// Colour roles for widgets that need more than the Material scheme.
HzColors hzColors(BuildContext context) => Theme.of(context).brightness == Brightness.dark ? HzColors.dark : HzColors.light;
