import 'package:flutter/material.dart';

import '../../core/api_error.dart';
import '../../core/sounds.dart';
import '../../design/herzone_tokens.dart';
import '../../l10n/app_localizations.dart';
import '../auth/widgets.dart';
import 'motion.dart';
import 'press.dart';

/// Loads data for a screen and shows loading, error (with retry) or the content. Pull to refresh reloads, with the
/// pull sounds: ready (far enough to refresh), release (refresh starts), done.
class Loader<T> extends StatefulWidget {
  const Loader({super.key, required this.load, required this.builder});

  final Future<T> Function() load;
  final Widget Function(BuildContext context, T data, Future<void> Function() reload) builder;

  @override
  State<Loader<T>> createState() => _LoaderState<T>();
}

class _LoaderState<T> extends State<Loader<T>> {
  late Future<T> _future = widget.load();

  Future<void> _reload() async {
    final f = widget.load();
    setState(() {
      _future = f; // a block, not an arrow: setState must not get the Future back (debug builds asserted on pull to refresh)
    });
    await f.catchError((Object _) => null as dynamic);
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<T>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return SkeletonList(label: AppLocalizations.of(context).loading);
          if (snap.hasError) {
            final e = snap.error is ApiError ? snap.error as ApiError : const ApiError(status: 0, code: 'UNKNOWN', message: '');
            return ListView(padding: const EdgeInsets.all(HzSpace.gutter), children: [
              ErrorBanner(e),
              const SizedBox(height: HzSpace.s4),
              Press(child: OutlinedButton(key: const Key('retry'), onPressed: _reload, child: Text(AppLocalizations.of(context).retry))),
            ]);
          }
          return SoundRefresh(onRefresh: _reload, child: widget.builder(context, snap.data as T, _reload));
        },
      );
}

/// Pull-to-refresh with its sounds: "ready" once she has pulled far enough for the spinner to show fully (the point
/// where [RefreshIndicator] arms: a sixth of the screen), "release" when the refresh starts, "done" when it ends.
class SoundRefresh extends StatefulWidget {
  const SoundRefresh({super.key, required this.onRefresh, required this.child});

  final Future<void> Function() onRefresh;
  final Widget child;

  @override
  State<SoundRefresh> createState() => _SoundRefreshState();
}

class _SoundRefreshState extends State<SoundRefresh> {
  double? _pulled; // null: not pulling from the top
  bool _ready = false;

  bool _onScroll(ScrollNotification n) {
    if (n.depth != 0 || n.metrics.axis != Axis.vertical) return false;
    if (n is ScrollStartNotification) {
      _pulled = n.dragDetails != null && n.metrics.extentBefore == 0 ? 0 : null;
      _ready = false;
    } else if (_pulled != null && n is ScrollUpdateNotification && n.dragDetails != null) {
      _pulled = _pulled! - (n.scrollDelta ?? 0);
    } else if (_pulled != null && n is OverscrollNotification && n.dragDetails != null) {
      _pulled = _pulled! - n.overscroll;
    } else if (n is ScrollEndNotification) {
      _pulled = null;
    }
    if (_pulled != null && !_ready && _pulled! >= n.metrics.viewportDimension * 0.25 / 1.5) {
      _ready = true;
      Sounds.instance.play(UiSound.refreshReady);
    }
    return false;
  }

  Future<void> _refresh() async {
    Sounds.instance.play(UiSound.refreshRelease);
    try {
      await widget.onRefresh();
    } finally {
      Sounds.instance.play(UiSound.refreshDone);
    }
  }

  @override
  Widget build(BuildContext context) => NotificationListener<ScrollNotification>(
        onNotification: _onScroll,
        child: RefreshIndicator(onRefresh: _refresh, child: widget.child),
      );
}
