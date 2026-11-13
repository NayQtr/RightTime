import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../data/countries.dart';
import '../../design/herzone_tokens.dart';
import '../../l10n/app_localizations.dart';
import '../theme.dart';
import 'sign_in_view_model.dart';
import 'widgets.dart';
import '../../core/sounds.dart';
import '../common/test_id.dart';
import '../common/busy_label.dart';
import '../common/press.dart';

/// A country's flag: the pair of regional-indicator letters of its ISO code.
String flagOf(String iso) => String.fromCharCodes(iso.codeUnits.map((c) => 0x1F1E6 + c - 65));

class PhoneScreen extends StatefulWidget {
  const PhoneScreen({super.key});

  @override
  State<PhoneScreen> createState() => _PhoneScreenState();
}

class _PhoneScreenState extends State<PhoneScreen> {
  final _phone = TextEditingController();
  final _phoneFocus = FocusNode();
  final _link = LayerLink();
  final _list = OverlayPortalController();
  final _boxKey = GlobalKey();

  /// The country the number belongs to. Qatar to begin with (owner's decision, 11 Nov 2026: every country except
  /// Israel, which is not in the list at all).
  Country _country = countryByIso(kDefaultCountry);

  @override
  void initState() {
    super.initState();
    _phoneFocus.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _phone.dispose();
    _phoneFocus.dispose();
    super.dispose();
  }

  Future<void> _submit(SignInViewModel vm) async {
    if (await vm.sendCode(_phone.text, dial: _country.dial) && mounted) context.go('/sign-in/code');
  }

  void _open() {
    Sounds.instance.play(UiSound.sheetOpen);
    setState(_list.show);
  }

  void _close() {
    if (!_list.isShowing) return;
    Sounds.instance.play(UiSound.sheetClose);
    setState(_list.hide);
  }

  void _choose(Country c) {
    _close();
    setState(() => _country = c);
    _phoneFocus.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final vm = context.watch<SignInViewModel>();
    final colors = hzColors(context);
    final qatar = _country.dial == '974';
    final lang = Localizations.localeOf(context).languageCode;
    final open = _list.isShowing;
    final invalid = vm.phoneInvalid;
    final edge = invalid ? colors.danger : (_phoneFocus.hasFocus || open ? colors.text : colors.borderStrong);
    return Scaffold(
      appBar: AppBar(),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(HzSpace.gutter),
          children: [
            Text(t.phoneTitle, style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: HzSpace.s2),
            Text(t.phoneHelp),
            const SizedBox(height: HzSpace.s6),
            Text(t.phoneLabel, style: const TextStyle(fontWeight: FontWeight.w500)),
            const SizedBox(height: HzSpace.s2),
            // One box: flag, arrow and calling code, a thin divider, then the number (owner's design, 13 Nov 2026). Left to
            // right in both languages, as a phone number is read. The code opens the country list under the box.
            OverlayPortal(
              controller: _list,
              overlayChildBuilder: (_) => _CountryList(
                link: _link,
                width: (_boxKey.currentContext?.findRenderObject() as RenderBox?)?.size.width ?? 320,
                selected: _country,
                lang: lang,
                onChoose: _choose,
                onClose: _close,
              ),
              child: CompositedTransformTarget(
                link: _link,
                child: AnimatedContainer(
                  key: _boxKey,
                  duration: HzMotion.fast,
                  constraints: const BoxConstraints(minHeight: 56),
                  decoration: BoxDecoration(
                    color: colors.surface,
                    borderRadius: BorderRadius.circular(HzRadius.md),
                    border: Border.all(color: edge, width: invalid || _phoneFocus.hasFocus || open ? 2 : 1.5),
                  ),
                  child: Ltr(IntrinsicHeight(child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    TapRegion(
                      groupId: _CountryList,
                      child: TestId('country', child: Semantics(
                        button: true,
                        expanded: open,
                        label: '${_country.name(lang)} +${_country.dial}',
                        excludeSemantics: true,
                        child: InkWell(
                          key: const Key('country'),
                          onTap: open ? _close : _open,
                          borderRadius: const BorderRadius.horizontal(left: Radius.circular(HzRadius.md)),
                          child: Padding(
                            padding: const EdgeInsets.only(left: HzSpace.s4, right: HzSpace.s3),
                            child: Row(mainAxisSize: MainAxisSize.min, children: [
                              Text(flagOf(_country.iso), style: const TextStyle(fontSize: 22, height: 1)),
                              const SizedBox(width: 6),
                              AnimatedRotation(
                                turns: open ? 0.5 : 0,
                                duration: MediaQuery.of(context).disableAnimations ? Duration.zero : HzMotion.base,
                                child: Icon(Icons.keyboard_arrow_down, size: 20, color: colors.textMuted),
                              ),
                              const SizedBox(width: 6),
                              Text('+${_country.dial}', style: const TextStyle(fontWeight: FontWeight.w700, fontFeatures: [FontFeature.tabularFigures()])),
                            ]),
                          ),
                        ),
                      )),
                    ),
                    Container(width: 1, margin: const EdgeInsets.symmetric(vertical: HzSpace.s3), color: colors.border),
                    Expanded(child: TestId('phone', child: Semantics(
                      label: t.phoneLabel,
                      child: TextField(
                        key: const Key('phone'),
                        controller: _phone,
                        focusNode: _phoneFocus,
                        keyboardType: TextInputType.phone,
                        autofillHints: const [AutofillHints.telephoneNumberNational],
                        inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9 ]')), LengthLimitingTextInputFormatter(qatar ? 9 : 17)],
                        textInputAction: TextInputAction.send,
                        onSubmitted: (_) => _submit(vm),
                        style: const TextStyle(letterSpacing: 1, fontFeatures: [FontFeature.tabularFigures()]),
                        decoration: const InputDecoration(
                          filled: false,
                          border: InputBorder.none,
                          enabledBorder: InputBorder.none,
                          focusedBorder: InputBorder.none,
                          errorBorder: InputBorder.none,
                          focusedErrorBorder: InputBorder.none,
                          contentPadding: EdgeInsets.symmetric(horizontal: HzSpace.s3, vertical: HzSpace.s4),
                        ),
                      ),
                    ))),
                  ]))),
                ),
              ),
            ),
            // Qatar keeps its 8-digit rule; for any other country the server has the last word.
            if (invalid) ...[
              const SizedBox(height: HzSpace.s2),
              Semantics(liveRegion: true, child: Text(qatar ? t.phoneInvalid : t.csPhoneBad,
                  style: TextStyle(color: colors.danger, fontSize: Theme.of(context).textTheme.bodySmall?.fontSize))),
            ],
            if (vm.error != null) ...[const SizedBox(height: HzSpace.s4), ErrorBanner(vm.error!)],
            const SizedBox(height: HzSpace.s6),
            Press(child: FilledButton(
              key: const Key('send'),
              onPressed: vm.busy ? null : () => _submit(vm),
              child: BusyLabel(busy: vm.busy, child: Text(t.sendCode)),
            )),
          ],
        ),
      ),
    );
  }
}

/// Every country we accept, alphabetical, each with its flag, the chosen one marked (owner, 11 and 13 Nov 2026): no
/// search box. It grows out of the number box (popovers from 0.95, owner's motion list of 6 Nov) and closes on a tap
/// outside it or on Escape.
class _CountryList extends StatefulWidget {
  const _CountryList({required this.link, required this.width, required this.selected, required this.lang, required this.onChoose, required this.onClose});

  final LayerLink link;
  final double width;
  final Country selected;
  final String lang;
  final ValueChanged<Country> onChoose;
  final VoidCallback onClose;

  static const double rowHeight = 48;

  @override
  State<_CountryList> createState() => _CountryListState();
}

class _CountryListState extends State<_CountryList> with SingleTickerProviderStateMixin {
  late final List<Country> _all = [...kCountries]..sort((a, b) => a.name(widget.lang).compareTo(b.name(widget.lang)));
  late final AnimationController _grow = AnimationController(vsync: this, duration: HzMotion.base);
  late final CurvedAnimation _curve = CurvedAnimation(parent: _grow, curve: HzMotion.easing);
  ScrollController? _scroll;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_scroll != null) return;
    // the chosen country sits in the middle of the list when it opens
    final i = _all.indexWhere((c) => c.iso == widget.selected.iso);
    _scroll = ScrollController(initialScrollOffset: math.max(0, i * _CountryList.rowHeight - (_maxHeight(context) - _CountryList.rowHeight) / 2));
    if (MediaQuery.of(context).disableAnimations) {
      _grow.value = 1;
    } else {
      _grow.forward();
    }
  }

  double _maxHeight(BuildContext context) => math.min(330, MediaQuery.sizeOf(context).height * 0.52);

  @override
  void dispose() {
    _curve.dispose();
    _grow.dispose();
    _scroll?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = hzColors(context);
    final curve = _curve;
    return Align(
      alignment: Alignment.topLeft,
      child: CompositedTransformFollower(
        link: widget.link,
        showWhenUnlinked: false,
        targetAnchor: Alignment.bottomLeft,
        offset: const Offset(0, HzSpace.s2),
        child: TapRegion(
          groupId: _CountryList,
          onTapOutside: (_) => widget.onClose(),
          child: CallbackShortcuts(
            bindings: {const SingleActivator(LogicalKeyboardKey.escape): widget.onClose},
            child: Focus(
              autofocus: true,
              child: FadeTransition(
                opacity: curve,
                child: ScaleTransition(
                  scale: Tween(begin: 0.95, end: 1.0).animate(curve),
                  alignment: Alignment.topCenter,
                  // the shadow sits outside the clipped card, so it is not cut off
                  child: DecoratedBox(
                    decoration: BoxDecoration(borderRadius: BorderRadius.circular(HzRadius.md), boxShadow: [
                      BoxShadow(color: colors.text.withValues(alpha: 0.18), blurRadius: 32, offset: const Offset(0, 14), spreadRadius: -12),
                    ]),
                    child: Material(
                      color: colors.surface,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(HzRadius.md),
                        side: BorderSide(color: colors.border),
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: SizedBox(
                        width: widget.width,
                        height: math.min(_maxHeight(context), _all.length * _CountryList.rowHeight + HzSpace.s2),
                        child: ListView.builder(
                          key: const Key('country-list'),
                          controller: _scroll,
                          padding: const EdgeInsets.all(HzSpace.s1),
                          itemExtent: _CountryList.rowHeight,
                          itemCount: _all.length,
                          itemBuilder: (context, i) => _row(context, _all[i], colors),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _row(BuildContext context, Country c, HzColors colors) {
    final chosen = c.iso == widget.selected.iso;
    final ink = chosen ? colors.primary : colors.text;
    return Semantics(
      selected: chosen,
      button: true,
      label: '${c.name(widget.lang)} +${c.dial}',
      excludeSemantics: true,
      child: InkWell(
        key: Key('country-${c.iso}'),
        onTap: () => widget.onChoose(c),
        borderRadius: BorderRadius.circular(HzRadius.sm),
        child: Ink(
          decoration: BoxDecoration(color: chosen ? colors.primarySubtle : null, borderRadius: BorderRadius.circular(HzRadius.sm)),
          padding: const EdgeInsets.symmetric(horizontal: HzSpace.s3),
          child: Row(children: [
            Text(flagOf(c.iso), style: const TextStyle(fontSize: 22, height: 1)),
            const SizedBox(width: HzSpace.s3),
            Expanded(child: Text(c.name(widget.lang), maxLines: 1, overflow: TextOverflow.ellipsis,
                style: TextStyle(color: ink, fontWeight: chosen ? FontWeight.w600 : null))),
            const SizedBox(width: HzSpace.s2),
            Ltr(Text('+${c.dial}', style: TextStyle(color: chosen ? colors.primary : colors.textMuted, fontFeatures: const [FontFeature.tabularFigures()]))),
            const SizedBox(width: HzSpace.s2),
            SizedBox(width: 18, child: chosen ? Icon(Icons.check, size: 18, color: colors.primary) : null),
          ]),
        ),
      ),
    );
  }
}
