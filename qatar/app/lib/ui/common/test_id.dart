import 'package:flutter/widgets.dart';

/// A stable id for UI automation (Maestro, NMX-56): it becomes the resource-id on Android and the
/// accessibilityIdentifier on iOS. Screen readers do not announce it. Ids match the widget keys used by the Flutter
/// tests, so one name works in both.
class TestId extends StatelessWidget {
  const TestId(this.id, {super.key, required this.child});
  final String id;
  final Widget child;

  @override
  Widget build(BuildContext context) => Semantics(identifier: id, child: child);
}
