import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_error.dart';
import '../../core/link_opener.dart';
import '../../data/meetups_repository.dart';
import '../../data/models.dart';
import '../../design/herzone_tokens.dart';
import '../../domain/locale_controller.dart';
import '../../l10n/app_localizations.dart';
import '../auth/widgets.dart';
import '../format.dart';
import '../common/press.dart';

/// After the meetup: ask a tablemate to stay in touch. A WhatsApp button appears only once both agree; a decline is
/// never shown to the sender.
class ContactsSection extends StatefulWidget {
  const ContactsSection({super.key, required this.bookingId});
  final String bookingId;

  @override
  State<ContactsSection> createState() => _ContactsSectionState();
}

class _ContactsSectionState extends State<ContactsSection> {
  Contacts? data;
  ApiError? error;
  String? note;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final d = await context.read<MeetupsRepository>().contacts(widget.bookingId);
      if (mounted) setState(() => data = d);
    } on ApiError catch (e) {
      if (mounted) setState(() => error = e);
    }
  }

  Future<void> _act(Future<void> Function() f, String done) async {
    try {
      await f();
      note = done;
      await _load();
    } on ApiError catch (e) {
      if (mounted) setState(() => error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final repo = context.read<MeetupsRepository>();
    final lang = context.watch<LocaleController>().code;
    final tt = Theme.of(context).textTheme;
    final d = data;
    return Card(
      key: const Key('contacts'),
      child: Padding(
        padding: const EdgeInsets.all(HzSpace.s4),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(t.contactLegend, style: tt.titleLarge),
          const SizedBox(height: HzSpace.s1),
          Text(t.contactHelp, style: tt.bodySmall),
          if (error != null) ErrorBanner(error!),
          if (note != null) Padding(padding: const EdgeInsets.only(top: HzSpace.s2), child: Text(note!, key: const Key('contact-note'))),
          if (d != null && !d.open) Text(t.contactClosed),
          if (d != null && d.open && d.closesAt != null) Text(t.contactUntil(fmtWhen(d.closesAt!, lang)), style: tt.bodySmall),
          if (d != null)
            for (final m in d.members)
              Padding(
                padding: const EdgeInsets.only(top: HzSpace.s3),
                child: Row(children: [
                  Expanded(child: Text(m.state == 'incoming' ? '${m.name ?? t.unnamed} ${t.contactIncoming}' : (m.name ?? t.unnamed))),
                  if (m.state == 'connected' && m.whatsappUrl != null)
                    Press(child: FilledButton.icon(
                      key: Key('wa-${m.seat}'),
                      style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
                      icon: const Icon(Icons.chat),
                      label: Text(t.contactWhatsapp),
                      onPressed: () => context.read<LinkOpener>().open(Uri.parse(m.whatsappUrl!)),
                    )),
                  if (m.state == 'sent') Text(t.contactSent),
                  if (m.state == 'incoming' && m.requestId != null) ...[
                    Press(child: TextButton(key: Key('decline-${m.seat}'), onPressed: () => _act(() => repo.answerContact(m.requestId!, accept: false), t.contactDeclined), child: Text(t.contactDecline))),
                    Press(child: FilledButton(
                      key: Key('accept-${m.seat}'),
                      style: FilledButton.styleFrom(minimumSize: const Size(0, 44)),
                      onPressed: () => _act(() => repo.answerContact(m.requestId!, accept: true), t.contactAccepted),
                      child: Text(t.contactAccept),
                    )),
                  ],
                  if (m.state == 'none' && m.canSend)
                    Press(child: OutlinedButton(
                      key: Key('ask-${m.seat}'),
                      style: OutlinedButton.styleFrom(minimumSize: const Size(0, 44)),
                      onPressed: () => _act(() => repo.requestContact(widget.bookingId, m.seat), t.contactSent),
                      child: Text(t.contactSend),
                    )),
                ]),
              ),
        ]),
      ),
    );
  }
}
