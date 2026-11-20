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
        // 56 px like the fields (identity step, 13 Nov 2026)
        minimumSize: const Size.fromHeight(56),
        shape: shape,
        backgroundColor: c.primary,
        foregroundColor: c.onPrimary,
        disabledBackgroundColor: c.surfaceSunken,
        disabledForegroundColor: c.textDisabled,
        textStyle: base.textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(56), shape: shape, foregroundColor: c.text, disabledForegroundColor: c.textDisabled, side: BorderSide(color: c.borderStrong)),
    ),
    // 60-30-10 (owner, 20 Nov 2026): mauve belongs to the one primary action, the current tab and the table's seats. A
    // text button is a link: ink-coloured and underlined, never mauve
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: c.text,
        disabledForegroundColor: c.textDisabled,
        textStyle: base.textTheme.labelLarge?.copyWith(decoration: TextDecoration.underline),
      ),
    ),
    // a chosen box, radio or switch is told by the ink colour and its mark (tick, dot, thumb icon), not by mauve
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? (s.contains(WidgetState.disabled) ? c.textDisabled : c.text) : null),
      checkColor: WidgetStatePropertyAll(c.surface),
      side: WidgetStateBorderSide.resolveWith((s) => BorderSide(color: s.contains(WidgetState.disabled) ? c.textDisabled : s.contains(WidgetState.selected) ? c.text : c.borderStrong, width: 2)),
    ),
    radioTheme: RadioThemeData(
      fillColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.disabled) ? c.textDisabled : s.contains(WidgetState.selected) ? c.text : c.borderStrong),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? c.text : c.borderStrong),
      trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? c.surface : c.surfaceSunken),
      trackOutlineColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? c.text : c.borderStrong),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: HzSpace.s4, vertical: HzSpace.s4),
      // fields as on the website (identity step, 13 Nov 2026): a clear 1.5 px edge, the ink edge when in use
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(HzRadius.md), borderSide: BorderSide(color: c.borderStrong, width: 1.5)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(HzRadius.md), borderSide: BorderSide(color: c.borderStrong, width: 1.5)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(HzRadius.md), borderSide: BorderSide(color: c.focus, width: 2)),
    ),
    // cards are the one container family (60-30-10, 20 Nov 2026): the light surface with its hairline edge, no shadow
    cardTheme: CardThemeData(color: c.surface, elevation: 0, surfaceTintColor: Colors.transparent, shadowColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(HzRadius.md), side: BorderSide(color: c.border))),
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
