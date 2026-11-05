import 'package:shared_preferences/shared_preferences.dart';

/// Tells a fresh install from a normal launch. On iPhone, Keychain items (sign-in token, saved meetups, unsent quiz
/// answers) survive deleting the app; app preferences do not. A member who deletes HerZone expects to be signed out
/// and to leave nothing behind, so on the first launch after an install everything kept in the Keychain is wiped
/// (app review #7).
abstract class InstallMarker {
  Future<bool> isFreshInstall();
  Future<void> markInstalled();
}

class PrefsInstallMarker implements InstallMarker {
  static const _key = 'hz.installed';

  @override
  Future<bool> isFreshInstall() async => !(await SharedPreferences.getInstance()).containsKey(_key);

  @override
  Future<void> markInstalled() async => (await SharedPreferences.getInstance()).setBool(_key, true);
}

class MemoryInstallMarker implements InstallMarker {
  MemoryInstallMarker({this.installed = false});
  bool installed;

  @override
  Future<bool> isFreshInstall() async => !installed;

  @override
  Future<void> markInstalled() async => installed = true;
}

/// Wipes what a previous install left in the Keychain, once, on the first launch of a new install.
Future<void> wipeAfterReinstall(InstallMarker marker, List<Future<void> Function()> wipes) async {
  if (!await marker.isFreshInstall()) return;
  for (final w in wipes) {
    await w();
  }
  await marker.markInstalled();
}
