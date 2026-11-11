import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/api_error.dart';
import '../../core/link_opener.dart';
import '../../data/auth_repository.dart' show Me;
import '../../data/meetups_repository.dart';
import '../../data/models.dart' show BookingSummary, Coordinator;
import '../../design/herzone_tokens.dart';
import '../../domain/locale_controller.dart';
import '../../domain/session.dart';
import '../../l10n/app_localizations.dart';
import '../auth/widgets.dart';
import '../common/loader.dart';
import '../format.dart';
import '../theme.dart';
import 'contacts_section.dart';
import 'home_tab.dart' show experienceName;
import 'resolution_section.dart';
import '../common/test_id.dart';
import '../common/busy_label.dart';
import '../common/motion.dart' show Pulse;
import '../common/press.dart';
import '../common/sound_on_show.dart';
import '../../core/sounds.dart';

/// One meetup. The server decides what is visible when (venue after the reveal, names on the day); this screen shows
/// what it gets. Offline, it shows the copy saved on the device, read-only, with when it was saved.
class EventDetailsScreen extends StatefulWidget {
  const EventDetailsScreen({super.key, required this.bookingId});

  final String bookingId;

  @override
  State<EventDetailsScreen> createState() => _EventDetailsScreenState();
}

class _EventDetailsScreenState extends State<EventDetailsScreen> {
  int _reload = 0;
  String get bookingId => widget.bookingId;

  Future<void> _checkIn(BuildContext context) async {
    try {
      await context.read<MeetupsRepository>().checkIn(bookingId);
    } on ApiError catch (_) {
      // the reloaded screen shows the current state either way
    }
    if (mounted) setState(() => _reload++);
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final repo = context.read<MeetupsRepository>();
    final lang = context.watch<LocaleController>().code;
    return Scaffold(
      appBar: AppBar(title: Text(t.detailsTitle)),
      body: SafeArea(
        child: Loader<DetailsResult>(
          key: ValueKey('$lang-$_reload'),
          load: () => repo.eventDetails(bookingId),
          builder: (context, r, _) {
            final d = r.details;
            final c = hzColors(context);
            final tt = Theme.of(context).textTheme;
            final v = d.venue;
            return ListView(padding: const EdgeInsets.all(HzSpace.gutter), children: [
              if (r.offlineSavedAt != null) ...[
                TestId('offline-copy', child: Container(
                  key: const Key('offline-copy'),
                  padding: const EdgeInsets.all(HzSpace.s3),
                  decoration: BoxDecoration(color: c.warning.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(HzRadius.sm)),
                  child: Text(t.offlineCopy(fmtWhen(r.offlineSavedAt!.toIso8601String(), lang))),
                )),
                const SizedBox(height: HzSpace.s4),
              ],
              if (d.identityCheckPending) ...[
                Container(
                  key: const Key('id-check'),
                  padding: const EdgeInsets.all(HzSpace.s3),
                  decoration: BoxDecoration(color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(HzRadius.sm)),
                  child: Text(t.idCheckPending),
                ),
                const SizedBox(height: HzSpace.s4),
              ],
              Text(experienceName(t, d.experience), style: tt.headlineMedium),
              Text(fmtWhen(d.startsAt, lang), style: tt.titleLarge),
              const SizedBox(height: HzSpace.s1),
              Text('${t.bookingRef} ${d.ref}', style: tt.bodySmall),
              if (d.stage != null) ...[const SizedBox(height: HzSpace.s4), _Tracker(stage: d.stage!)],
              const SizedBox(height: HzSpace.s4),
              _Fact(icon: Icons.place_outlined, label: t.district, value: d.district),
              _Fact(icon: Icons.translate, label: t.tableLanguage, value: d.language == 'ar' ? t.langAr : t.langEn),
              if (d.foodBand != null) _Fact(icon: Icons.account_balance_wallet_outlined, label: t.foodBandLabel, value: d.foodBand!),
              _Fact(icon: Icons.schedule, label: '${t.dateTime} · Asia/Qatar', value: fmtTime(d.startsAt, lang)),
              if (d.confirmedCount != null) ...[
                const SizedBox(height: HzSpace.s4),
                Text(t.yourTable, style: tt.titleLarge),
                Text(t.confirmedCount(d.confirmedCount!)),
                if (d.tablemates.isNotEmpty) Text('${t.tablemates}: ${d.tablemates.join('، ')}'),
              ],
              const SizedBox(height: HzSpace.s4),
              if (v == null && !d.isOver)
                TestId('venue-hidden', child: Container(
                  key: const Key('venue-hidden'),
                  padding: const EdgeInsets.all(HzSpace.s3),
                  decoration: BoxDecoration(color: c.primarySubtle, borderRadius: BorderRadius.circular(HzRadius.sm)),
                  child: Text(t.venueHidden(fmtWhen(d.revealAt, lang))),
                )),
              if (v != null)
                TestId('venue', child: Card(
                  key: const Key('venue'),
                  child: Padding(
                    padding: const EdgeInsets.all(HzSpace.s4),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(v.name, style: tt.titleLarge),
                      Text('${v.address} · ${v.district}'),
                      const SizedBox(height: HzSpace.s3),
                      Text(t.arrival, style: const TextStyle(fontWeight: FontWeight.w600)),
                      Text(v.arrival),
                      if (d.tableCode != null) ...[
                        const SizedBox(height: HzSpace.s3),
                        Text(t.tableCode),
                        Ltr(TestId('table-code', child: SelectableText(d.tableCode!, key: const Key('table-code'), style: tt.displaySmall?.copyWith(color: c.primary, letterSpacing: 2)))),
                        Text(t.mentionCode, style: tt.bodySmall),
                      ],
                      const SizedBox(height: HzSpace.s3),
                      Text(v.billPolicy, style: tt.bodySmall),
                      if (v.mapUrl.isNotEmpty)
                        // opened, not copied: the clipboard is readable by other apps and keyboards (app review #10)
                        Press(child: TextButton.icon(
                          key: const Key('open-map'),
                          icon: const Icon(Icons.map_outlined, size: 18),
                          label: Text(t.openMap),
                          onPressed: () => context.read<LinkOpener>().open(Uri.parse(v.mapUrl)),
                        )),
                    ]),
                  ),
                )),
              if (r.offlineSavedAt == null && d.resolution != null && d.resolution!.open && d.rebookedInto == null) ...[
                const SizedBox(height: HzSpace.s4),
                ResolutionSection(bookingId: bookingId, details: d, onDone: () => setState(() => _reload++)),
              ],
              if (d.rebookedInto != null) ...[
                const SizedBox(height: HzSpace.s4),
                ListTile(
                  key: const Key('rebooked'),
                  contentPadding: EdgeInsets.zero,
                  leading: Icon(Icons.event_available, color: c.success),
                  title: Text(t.rebookedInto(d.rebookedInto!.ref)),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push('/booking/${d.rebookedInto!.id}'),
                ),
              ],
              if (r.offlineSavedAt == null && d.action('check_in')) ...[
                const SizedBox(height: HzSpace.s4),
                Press(child: FilledButton(key: const Key('check-in'), onPressed: () => _checkIn(context), child: Text(t.imHere))),
              ],
              if (d.status == 'checked_in') ...[
                const SizedBox(height: HzSpace.s4),
                Text(t.checkedIn, key: const Key('checked-in'), style: TextStyle(color: c.success, fontWeight: FontWeight.w600)),
              ],
              if (r.offlineSavedAt == null && d.action('feedback')) ...[
                const SizedBox(height: HzSpace.s4),
                Press(child: FilledButton(key: const Key('rate'), onPressed: () => context.push('/booking/$bookingId/feedback'), child: Text(t.rateIt))),
              ],
              if (d.phase == 'completed' && r.offlineSavedAt == null) ...[const SizedBox(height: HzSpace.s4), ContactsSection(bookingId: bookingId)],
              const SizedBox(height: HzSpace.s6),
              _CoordinatorButtons(bookingId: widget.bookingId),
              if (r.offlineSavedAt == null && ['forming', 'locked', 'revealed', 'day_of', 'completed'].contains(d.phase))
                Press(child: TextButton.icon(
                  key: const Key('report'),
                  style: TextButton.styleFrom(foregroundColor: c.primary, minimumSize: const Size.fromHeight(48)),
                  icon: const Icon(Icons.flag_outlined),
                  label: Text(t.privateReport),
                  onPressed: () => context.push('/report/$bookingId'),
                )),
              if (d.action('cancel') && r.offlineSavedAt == null) ...[
                const SizedBox(height: HzSpace.s8),
                Press(child: OutlinedButton(
                  key: const Key('cancel'),
                  style: OutlinedButton.styleFrom(foregroundColor: c.danger, side: BorderSide(color: c.danger), minimumSize: const Size.fromHeight(52)),
                  onPressed: () => context.push('/booking/$bookingId/cancel'),
                  child: Text(t.cancelBooking),
                )),
              ],
            ]);
          },
        ),
      ),
    );
  }
}

/// Call or WhatsApp the coordinator on duty. Kept on the device, so calling works with no data connection.
class _CoordinatorButtons extends StatelessWidget {
  const _CoordinatorButtons({required this.bookingId});

  final String bookingId;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return FutureBuilder(
      future: context.read<MeetupsRepository>().coordinator().catchError((Object _) => null),
      builder: (context, snap) {
        final c = snap.data;
        if (c == null) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.only(bottom: HzSpace.s3),
          child: Builder(
            builder: (button) => Press(child: OutlinedButton.icon(
              key: const Key('contact-coord'),
              icon: const Icon(Icons.chat_bubble_outline),
              label: Text(t.contactRequest),
              onPressed: () => showContactSheet(context, c, bookingId: bookingId, from: button),
            )),
          ),
        );
      },
    );
  }
}

class _Fact extends StatelessWidget {
  const _Fact({required this.icon, required this.label, required this.value});
  final IconData icon;
  final String label, value;

  @override
  Widget build(BuildContext context) => ListTile(
        contentPadding: EdgeInsets.zero,
        leading: Icon(icon),
        title: Text(value),
        subtitle: Text(label),
      );
}

/// paid · forming · confirmed · revealed
class _Tracker extends StatelessWidget {
  const _Tracker({required this.stage});
  final int stage;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final c = hzColors(context);
    final steps = [t.step1, t.step2, t.step3, t.step4];
    // top-aligned, so the bars stay level when one label wraps onto two lines
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      for (var i = 0; i < steps.length; i++)
        Expanded(
          child: Semantics(
            selected: i == stage,
            child: Column(children: [
              Container(height: 4, margin: const EdgeInsets.symmetric(horizontal: 2), color: i <= stage ? c.primary : c.border),
              const SizedBox(height: HzSpace.s1),
              // done steps carry a tick and the current one is bold in the brand colour: not told by colour alone
              // (an icon, not a "✓" character: the app font has no tick glyph)
              Text.rich(
                TextSpan(children: [
                  if (i < stage) ...[
                    WidgetSpan(alignment: PlaceholderAlignment.middle, child: Icon(Icons.check_rounded, size: 14, color: c.primary)),
                    const TextSpan(text: ' '),
                  ],
                  TextSpan(text: steps[i]),
                ]),
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, fontWeight: i == stage ? FontWeight.w700 : FontWeight.w400,
                    color: i == stage ? c.primary : i < stage ? c.text : c.textMuted),
              ),
            ]),
          ),
        ),
    ]);
  }
}

/// "Request contact" (owner's design, 5 Nov): the screen behind blurs and a sheet offers
///   level 1  Phone call | WhatsApp chat
///   level 2  (Phone call) Request contact: a note, the number, when | Call us now: dials the coordinator at once
///   level 3  the request form; then a confirmation.
/// WhatsApp opens the coordinator's chat with a first message carrying her name and her next booking's number (no membership
/// number exists). Tap outside, the close button or Back closes it. With high contrast the blur gives way to a nearly solid backdrop.
///
/// Motion: the sheet grows out of the button that opened it ([from]) at 0.95 with ease-out, and shrinks back into it with
/// ease-in, 20% faster (it is gone after 176 of the route's 220 ms). Only the sheet scales; the blurred page just fades.
Future<void> showContactSheet(BuildContext context, Coordinator c, {String? bookingId, BuildContext? from}) {
  final t = AppLocalizations.of(context);
  final links = context.read<LinkOpener>();
  final repo = context.read<MeetupsRepository>();
  final me = context.read<Session>().me;
  final mq = MediaQuery.of(context);
  final solid = mq.highContrast;
  var origin = Alignment.center;
  final box = from?.findRenderObject();
  if (box is RenderBox && box.hasSize && mq.size.width > 0 && mq.size.height > 0) {
    final p = box.localToGlobal(box.size.center(Offset.zero));
    origin = Alignment(p.dx / mq.size.width * 2 - 1, p.dy / mq.size.height * 2 - 1);
  }
  Animation<double> eased(Animation<double> a) =>
      CurvedAnimation(parent: a, curve: HzMotion.easing, reverseCurve: Interval(0.2, 1, curve: HzMotion.easingIn.flipped));
  Sounds.instance.play(UiSound.sheetOpen);
  return showGeneralDialog<void>(
    context: context,
    barrierDismissible: true,
    barrierLabel: t.close,
    barrierColor: Colors.transparent,
    transitionDuration: mq.disableAnimations ? Duration.zero : const Duration(milliseconds: 220),
    transitionBuilder: (ctx, anim, _, child) => FadeTransition(opacity: eased(anim), child: child),
    pageBuilder: (ctx, anim, _) {
      final hz = hzColors(ctx);
      final scrim = ColoredBox(color: hz.bg.withValues(alpha: solid ? 0.94 : 0.45), child: const SizedBox.expand());
      return Material(
        type: MaterialType.transparency,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => Navigator.of(ctx).pop(),
          child: Stack(fit: StackFit.expand, children: [
            solid ? scrim : BackdropFilter(filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14), child: scrim),
            ScaleTransition(
              alignment: origin,
              scale: Tween<double>(begin: 0.95, end: 1).animate(eased(anim)),
              child: SafeArea(
                child: Center(
                  child: SingleChildScrollView(
                    padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 380),
                      child: Padding(
                        padding: const EdgeInsets.all(HzSpace.s5),
                        child: _ContactSheetBody(coordinator: c, bookingId: bookingId, repo: repo, links: links, me: me),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ]),
        ),
      );
    },
  ).whenComplete(() => Sounds.instance.play(UiSound.sheetClose));
}

enum _Level { top, phone, form, sent }

class _ContactSheetBody extends StatefulWidget {
  const _ContactSheetBody({required this.coordinator, required this.bookingId, required this.repo, required this.links, required this.me});

  final Coordinator coordinator;
  final String? bookingId;
  final MeetupsRepository repo;
  final LinkOpener links;
  final Me? me;

  @override
  State<_ContactSheetBody> createState() => _ContactSheetBodyState();
}

class _ContactSheetBodyState extends State<_ContactSheetBody> {
  static const _whens = ['now', '10min', '1h', 'tomorrow'];
  _Level _level = _Level.top;
  BookingSummary? _booking; // her next booking: the one on this screen, or the soonest active one
  late final TextEditingController _message = TextEditingController();
  late final TextEditingController _phone = TextEditingController(text: widget.me?.phoneE164 ?? '');
  String _when = 'now';
  bool _sending = false;
  String? _problem; // a message of ours (missing note, bad number)
  ApiError? _error; // or the server's

  @override
  void initState() {
    super.initState();
    widget.repo.bookings().then((list) {
      final mine = list.where((b) => b.id == widget.bookingId).toList();
      final soonest = (list.where((b) => b.isActive).toList()..sort((a, b) => a.startsAt.compareTo(b.startsAt)));
      if (mounted) setState(() => _booking = mine.isNotEmpty ? mine.first : (soonest.isEmpty ? null : soonest.first));
    }).catchError((Object _) {}); // no connection: the message simply carries no booking number
  }

  @override
  void dispose() {
    _message.dispose();
    _phone.dispose();
    super.dispose();
  }

  void _go(_Level l) => setState(() {
        _level = l;
        _problem = null;
        _error = null;
      });

  void _open(Uri u) {
    Navigator.of(context).pop();
    widget.links.open(u);
  }

  void _whatsapp(AppLocalizations t) {
    final who = [widget.me?.displayName, _booking == null ? null : '#${_booking!.ref}'].whereType<String>().where((x) => x.isNotEmpty).join(' ');
    final text = who.isEmpty ? t.waHelloAnon : t.waHello(who);
    _open(Uri.parse('${widget.coordinator.whatsappUrl}?text=${Uri.encodeComponent(text)}'));
  }

  Future<void> _send(AppLocalizations t) async {
    final msg = _message.text.trim();
    final phone = _phone.text.trim();
    if (msg.isEmpty) return setState(() => _problem = t.csMessageNeeded);
    if (phone.isEmpty) return setState(() => _problem = t.csPhoneBad);
    setState(() {
      _sending = true;
      _problem = null;
      _error = null;
    });
    try {
      // the number goes with the request only when it is not the one she signed up with
      final other = phone.replaceAll(RegExp(r'[\s-]'), '') != (widget.me?.phoneE164 ?? '');
      await widget.repo.requestCall(message: msg, when: _when, contactPhone: other ? phone : null, bookingId: widget.bookingId ?? _booking?.id);
      if (mounted) _go(_Level.sent);
    } on ApiError catch (e) {
      final badPhone = e.status == 422 && e.details.any((d) => d['field'] == 'contact_phone');
      if (mounted) setState(() => badPhone ? _problem = t.csPhoneBad : _error = e);
    } catch (_) {
      if (mounted) setState(() => _error = const ApiError(status: 0, code: 'UNKNOWN', message: ''));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Widget _option({Key? key, required String label, String? sub, IconData? icon, required VoidCallback onTap, bool primary = false}) {
    final hz = hzColors(context);
    // the label is the button; the explanation sits under it as a caption, never inside the button
    final button = Row(mainAxisSize: MainAxisSize.min, children: [
      if (icon != null) ...[Icon(icon, size: 20), const SizedBox(width: HzSpace.s2)],
      Flexible(child: Text(label, textAlign: TextAlign.center)),
    ]);
    final control = primary
        ? Press(child: FilledButton(key: key, onPressed: onTap, child: button))
        : Press(child: OutlinedButton(key: key, style: OutlinedButton.styleFrom(backgroundColor: hz.surface), onPressed: onTap, child: button));
    if (sub == null) return control;
    return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      control,
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: HzSpace.s3, vertical: HzSpace.s2),
        child: Text(sub, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall?.copyWith(color: hz.textMuted)),
      ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final hz = hzColors(context);
    const gap = SizedBox(height: HzSpace.s3);
    Widget ghost(Key key, String label, VoidCallback onTap) =>
        Press(child: TextButton(key: key, style: TextButton.styleFrom(foregroundColor: hz.primary, minimumSize: const Size.fromHeight(48)), onPressed: onTap, child: Text(label)));
    final wa = widget.coordinator.whatsappUrl;
    final List<Widget> children;
    switch (_level) {
      case _Level.top:
        children = [
          _option(key: const Key('go-phone'), label: t.csPhone, icon: Icons.call, primary: true, onTap: () => _go(_Level.phone)),
          if (wa != null) ...[gap, _option(key: const Key('wa-coord'), label: t.csChat, icon: Icons.chat, onTap: () => _whatsapp(t))],
          gap,
          ghost(const Key('contact-close'), t.close, () => Navigator.of(context).pop()),
        ];
      case _Level.phone:
        children = [
          _option(key: const Key('go-form'), label: t.csRequest, sub: t.csRequestSub, primary: true, onTap: () => _go(_Level.form)),
          gap,
          _option(key: const Key('call-coord'), label: t.csCallNow, sub: t.csCallNowSub, onTap: () => _open(Uri.parse(widget.coordinator.telUrl))),
          gap,
          ghost(const Key('contact-back'), t.back, () => _go(_Level.top)),
        ];
      case _Level.form:
        children = [
          Container(
            padding: const EdgeInsets.all(HzSpace.s4),
            decoration: BoxDecoration(color: hz.surface, borderRadius: BorderRadius.circular(HzRadius.xl)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Text(t.csMessageLabel, style: Theme.of(context).textTheme.labelLarge),
              const SizedBox(height: HzSpace.s1),
              TextField(key: const Key('cs-msg'), controller: _message, maxLength: 500, maxLines: 4, onChanged: (_) => setState(() => _problem = null)),
              const SizedBox(height: HzSpace.s2),
              Text(t.csPhoneLabel, style: Theme.of(context).textTheme.labelLarge),
              const SizedBox(height: HzSpace.s1),
              TextField(key: const Key('cs-phone'), controller: _phone, keyboardType: TextInputType.phone, textDirection: TextDirection.ltr, onChanged: (_) => setState(() => _problem = null)),
              const SizedBox(height: HzSpace.s3),
              Text(t.csWhenLabel, style: Theme.of(context).textTheme.labelLarge),
              const SizedBox(height: HzSpace.s1),
              Wrap(spacing: HzSpace.s2, runSpacing: HzSpace.s2, children: [
                for (final (i, w) in _whens.indexed)
                  ChoiceChip(
                    key: Key('when-$w'),
                    label: Text([t.csWhenNow, t.csWhen10, t.csWhen60, t.csWhenTomorrow][i]),
                    selected: _when == w,
                    showCheckmark: false,
                    selectedColor: hz.primary,
                    backgroundColor: hz.surfaceSunken,
                    labelStyle: TextStyle(color: _when == w ? hz.onPrimary : hz.text),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(HzRadius.pill), side: BorderSide(color: _when == w ? hz.primary : hz.borderStrong)),
                    onSelected: (_) => setState(() => _when = w),
                  ),
              ]),
              if (_problem != null) ...[gap, Text(_problem!, key: const Key('cs-problem'), style: TextStyle(color: hz.danger, fontWeight: FontWeight.w600))],
              if (_error != null) ...[gap, ErrorBanner(_error!)],
              gap,
              Press(child: FilledButton(key: const Key('cs-send'), onPressed: _sending ? null : () => _send(t), child: BusyLabel(busy: _sending, child: Text(t.csSend)))),
              const SizedBox(height: HzSpace.s1),
              Press(child: TextButton(key: const Key('contact-back'), onPressed: () => _go(_Level.phone), child: Text(t.back))),
            ]),
          ),
        ];
      case _Level.sent:
        children = [
          Pulse(
            child: Container(
              padding: const EdgeInsets.all(HzSpace.s4),
              decoration: BoxDecoration(color: hz.surface, borderRadius: BorderRadius.circular(HzRadius.md)),
              child: SoundOnShow(child: Text(t.callRequested, key: const Key('call-requested'), style: Theme.of(context).textTheme.bodyLarge)),
            ),
          ),
          gap,
          ghost(const Key('contact-close'), t.close, () => Navigator.of(context).pop()),
        ];
    }
    // the new level crossfades over the old one (they overlap for 150 ms) while the sheet eases to its new height
    final still = MediaQuery.of(context).disableAnimations;
    return AnimatedSize(
      duration: still ? Duration.zero : HzMotion.base,
      curve: HzMotion.easingInOut,
      child: AnimatedSwitcher(
        duration: still ? Duration.zero : const Duration(milliseconds: 150),
        switchInCurve: HzMotion.easing,
        switchOutCurve: HzMotion.easingIn,
        child: Column(key: ValueKey(_level), mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: children),
      ),
    );
  }
}
