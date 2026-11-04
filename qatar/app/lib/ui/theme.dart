import 'package:flutter/material.dart';

import '../design/herzone_tokens.dart';

/// HerZone theme: generated tokens (design/herzone_tokens.dart, same source as the web) plus component styles that
/// match the web app: 48 dp touch targets, maroon primary buttons, rounded fields.
ThemeData herZoneTheme(Brightness brightness, String lang) {
  final base = hzTheme(brightness, lang);
  final c = brightness == Brightness.dark ? HzColors.dark : HzColors.light;
  final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(HzRadius.md));
  return base.copyWith(
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        shape: shape,
        backgroundColor: c.primary,
        foregroundColor: c.onPrimary,
        textStyle: base.textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52), shape: shape, foregroundColor: c.text, side: BorderSide(color: c.border)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: HzSpace.s4, vertical: HzSpace.s4),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(HzRadius.md), borderSide: BorderSide(color: c.border)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(HzRadius.md), borderSide: BorderSide(color: c.border)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(HzRadius.md), borderSide: BorderSide(color: c.focus, width: 2)),
    ),
    appBarTheme: AppBarTheme(backgroundColor: c.bg, foregroundColor: c.text, elevation: 0, scrolledUnderElevation: 0, centerTitle: false),
    navigationBarTheme: NavigationBarThemeData(backgroundColor: c.surface, indicatorColor: c.primarySubtle),
  );
}

/// Colour roles for widgets that need more than the Material scheme.
HzColors hzColors(BuildContext context) => Theme.of(context).brightness == Brightness.dark ? HzColors.dark : HzColors.light;
