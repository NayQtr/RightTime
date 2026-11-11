import 'dart:async';
import 'dart:io' show Platform;

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The 11 interface sounds the owner approved (design phase 7, item 26). Files in assets/sounds: 44.1 kHz mono, short
/// clicks as WAV (no codec delay before the sound), longer ones as AAC.
enum UiSound {
  tap('tap.wav'),
  refreshReady('refresh-ready.wav'),
  refreshRelease('refresh-release.m4a'),
  refreshDone('refresh-done.m4a'),
  success('success.m4a'),
  notify('notify.m4a'),
  sheetOpen('sheet-open.wav'),
  sheetClose('sheet-close.wav'),
  toggleOn('toggle-on.wav'),
  toggleOff('toggle-off.wav'),
  error('error.wav');

  const UiSound(this.file);
  final String file;
}

/// Where a sound goes: the device speaker in the app, nowhere in widget tests, a list in tests that check sounds.
abstract class SoundOutput {
  Future<void> play(UiSound sound);
}

class SilentOutput implements SoundOutput {
  const SilentOutput();
  @override
  Future<void> play(UiSound sound) async {}
}

/// Plays through the platform audio. The session is "ambient": the phone's silent switch (iOS) or silent/vibrate mode
/// (Android, the system sounds stream) mutes it, and it mixes with her music or podcast instead of pausing it.
class DeviceOutput implements SoundOutput {
  final _players = <UiSound, AudioPlayer>{};
  Future<void>? _ready;

  static final _context = AudioContext(
    iOS: AudioContextIOS(category: AVAudioSessionCategory.ambient),
    android: const AudioContextAndroid(
      contentType: AndroidContentType.sonification,
      usageType: AndroidUsageType.assistanceSonification,
      audioFocus: AndroidAudioFocus.none,
    ),
  );

  @override
  Future<void> play(UiSound sound) async {
    await (_ready ??= AudioPlayer.global.setAudioContext(_context));
    final p = _players[sound] ??= AudioPlayer()..setReleaseMode(ReleaseMode.stop);
    // short WAV clicks use the low-latency path (Android SoundPool)
    await p.play(AssetSource('sounds/${sound.file}'), mode: sound.file.endsWith('.wav') ? PlayerMode.lowLatency : PlayerMode.mediaPlayer, ctx: _context);
  }
}

/// Interface sounds with her "Sounds" switch (on by default, remembered on this device like the theme). Sounds never
/// throw: a device that cannot play one simply stays quiet.
class Sounds extends ChangeNotifier {
  Sounds({SoundOutput? output}) : _output = output ?? (_inWidgetTest ? const SilentOutput() : DeviceOutput());

  static bool get _inWidgetTest => !kIsWeb && Platform.environment.containsKey('FLUTTER_TEST');

  /// The app's instance (set by HerZoneApp); widgets that have no BuildContext path to provider use it.
  static Sounds instance = Sounds(output: const SilentOutput());

  /// PROVISIONAL (owner review, 10 Nov): sounds start on.
  static const defaultOn = true;
  static const _key = 'sounds';
  static const _noticeKey = 'inbox_newest_seen';

  final SoundOutput _output;
  bool enabled = defaultOn;

  Future<void> load() async {
    try {
      final saved = (await SharedPreferences.getInstance()).getBool(_key);
      if (saved != null && saved != enabled) {
        enabled = saved;
        notifyListeners();
      }
    } catch (_) {/* no store: the default applies */}
  }

  void play(UiSound sound) {
    if (!enabled) return;
    unawaited(_output.play(sound).catchError((Object _) {}));
  }

  /// Turns sounds on or off and remembers it; the switch itself is heard (on after turning on, off before turning off).
  void setEnabled(bool on) {
    if (on == enabled) return;
    if (!on) play(UiSound.toggleOff);
    enabled = on;
    if (on) play(UiSound.toggleOn);
    notifyListeners();
    SharedPreferences.getInstance().then((p) => p.setBool(_key, on)).catchError((_) => false);
  }

  /// The notifications list was shown with [newest] (ISO time) on top: plays the notification sound when it is newer
  /// than the newest she saw before on this device. The very first time nothing plays (nothing to compare with).
  Future<void> noticesSeen(String? newest) async {
    final now = newest == null ? null : DateTime.tryParse(newest);
    if (now == null) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      final before = DateTime.tryParse(prefs.getString(_noticeKey) ?? '');
      if (before != null && now.isAfter(before)) play(UiSound.notify);
      if (before == null || now.isAfter(before)) await prefs.setString(_noticeKey, newest!);
    } catch (_) {/* no store: no sound */}
  }

  /// When a session ends: the time of her newest notification is not kept (the Sounds switch is a device setting and stays).
  Future<void> forgetDevice() async {
    try {
      await (await SharedPreferences.getInstance()).remove(_noticeKey);
    } catch (_) {/* nothing stored */}
  }
}
