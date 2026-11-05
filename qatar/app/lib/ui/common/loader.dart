import 'package:flutter/material.dart';

import '../../core/api_error.dart';
import '../../design/herzone_tokens.dart';
import '../../l10n/app_localizations.dart';
import '../auth/widgets.dart';
import 'motion.dart';

/// Loads data for a screen and shows loading, error (with retry) or the content. Pull to refresh reloads.
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
    setState(() => _future = f);
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
              OutlinedButton(key: const Key('retry'), onPressed: _reload, child: Text(AppLocalizations.of(context).retry)),
            ]);
          }
          return RefreshIndicator(onRefresh: _reload, child: widget.builder(context, snap.data as T, _reload));
        },
      );
}
