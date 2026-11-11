import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Item 42 (provisional, 10 Nov): the iOS app is for iPhone only, so the App Store asks for no iPad screenshots and
/// iPad never shows a stretched phone layout. Android is unchanged.
void main() {
  test('iOS: every build configuration targets iPhone only, and Info.plist lists no iPad orientations', () {
    final project = File('ios/Runner.xcodeproj/project.pbxproj').readAsStringSync();
    final families = RegExp(r'TARGETED_DEVICE_FAMILY = ([^;]+);').allMatches(project).map((m) => m.group(1)).toList();
    expect(families, isNotEmpty);
    expect(families, everyElement('1'));
    expect(File('ios/Runner/Info.plist').readAsStringSync(), isNot(contains('~ipad')));
  });
}
