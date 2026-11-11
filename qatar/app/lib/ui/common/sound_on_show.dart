import 'package:flutter/widgets.dart';

import '../../core/sounds.dart';

/// Plays [sound] once when [child] first appears (a confirmation: paid, report sent, thanks for the rating...).
class SoundOnShow extends StatefulWidget {
  const SoundOnShow({super.key, this.sound = UiSound.success, required this.child});

  final UiSound sound;
  final Widget child;

  @override
  State<SoundOnShow> createState() => _SoundOnShowState();
}

class _SoundOnShowState extends State<SoundOnShow> {
  @override
  void initState() {
    super.initState();
    Sounds.instance.play(widget.sound);
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

/// Plays the notification sound when the newest notification on screen is newer than the newest she saw before.
class NewNoticeSound extends StatefulWidget {
  const NewNoticeSound({super.key, required this.newest, required this.child});

  /// ISO time of the newest notification shown (null: none).
  final String? newest;
  final Widget child;

  @override
  State<NewNoticeSound> createState() => _NewNoticeSoundState();
}

class _NewNoticeSoundState extends State<NewNoticeSound> {
  @override
  void initState() {
    super.initState();
    Sounds.instance.noticesSeen(widget.newest);
  }

  @override
  void didUpdateWidget(NewNoticeSound old) {
    super.didUpdateWidget(old);
    if (old.newest != widget.newest) Sounds.instance.noticesSeen(widget.newest);
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
