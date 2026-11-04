import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/api_error.dart';
import '../../data/onboarding.dart';
import '../../design/herzone_tokens.dart';
import '../../domain/locale_controller.dart';
import '../../domain/session.dart';
import '../../l10n/app_localizations.dart';
import '../auth/widgets.dart';
import '../common/loader.dart';
import '../theme.dart';
import 'quiz_view_model.dart';

/// Finishing sign-up: optional first name, women-only and age confirmation, the documents to accept. Then the answers
/// given before sign-up are sent with the new account.
class RegisterScreen extends StatelessWidget {
  const RegisterScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final repo = context.read<OnboardingRepository>();
    final lang = context.watch<LocaleController>().code;
    return Scaffold(
      appBar: AppBar(title: Text(t.regTitle)),
      body: SafeArea(child: Loader<List<LegalDoc>>(key: ValueKey(lang), load: repo.legal, builder: (context, docs, _) => _RegisterForm(docs: docs))),
    );
  }
}

class _RegisterForm extends StatefulWidget {
  const _RegisterForm({required this.docs});
  final List<LegalDoc> docs;

  @override
  State<_RegisterForm> createState() => _RegisterFormState();
}

class _RegisterFormState extends State<_RegisterForm> {
  final _name = TextEditingController();
  bool woman = false, adult = false, busy = false;
  final granted = <String>{};
  ApiError? error;

  bool get ready => woman && adult && widget.docs.where((d) => d.required).every((d) => granted.contains(d.type));

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      busy = true;
      error = null;
    });
    final repo = context.read<OnboardingRepository>();
    final quiz = context.read<QuizViewModel>();
    final session = context.read<Session>();
    try {
      await repo.register(name: _name.text, locale: context.read<LocaleController>().code, docs: {for (final d in widget.docs) d.type: d}, granted: granted);
      await quiz.submitSavedAnswers();
      await session.loadMe();
    } on ApiError catch (e) {
      if (mounted) setState(() => error = e);
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  String _label(AppLocalizations t, String type) => switch (type) {
        'terms' => t.termsLabel,
        'conduct' => t.conductLabel,
        'privacy_notice' => t.privacyLabel,
        _ => t.marketingLabel,
      };

  void _read(LegalDoc d) => showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (context) => DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.8,
          builder: (context, scroll) => ListView(controller: scroll, padding: const EdgeInsets.all(HzSpace.gutter), children: [
            Text(d.text, key: Key('doc-${d.type}')),
            const SizedBox(height: HzSpace.s4),
            OutlinedButton(onPressed: () => Navigator.pop(context), child: Text(AppLocalizations.of(context).close)),
          ]),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final c = hzColors(context);
    return ListView(padding: const EdgeInsets.all(HzSpace.gutter), children: [
      TextField(key: const Key('name'), controller: _name, maxLength: 30, decoration: InputDecoration(labelText: t.nameLabel, helperText: t.nameHelp)),
      const SizedBox(height: HzSpace.s4),
      Text(t.womenOnly, style: TextStyle(color: c.primary, fontWeight: FontWeight.w600)),
      CheckboxListTile(key: const Key('woman'), contentPadding: EdgeInsets.zero, value: woman, onChanged: (v) => setState(() => woman = v!), title: Text(t.womanLabel)),
      CheckboxListTile(key: const Key('adult'), contentPadding: EdgeInsets.zero, value: adult, onChanged: (v) => setState(() => adult = v!), title: Text(t.ageLabel)),
      const Divider(),
      for (final d in widget.docs)
        CheckboxListTile(
          key: Key('consent-${d.type}'),
          contentPadding: EdgeInsets.zero,
          value: granted.contains(d.type),
          onChanged: (v) => setState(() => v! ? granted.add(d.type) : granted.remove(d.type)),
          title: Text(_label(t, d.type)),
          subtitle: Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton(key: Key('read-${d.type}'), onPressed: () => _read(d), child: Text(t.readDoc)),
          ),
        ),
      if (error != null) ...[const SizedBox(height: HzSpace.s3), ErrorBanner(error!)],
      const SizedBox(height: HzSpace.s4),
      FilledButton(key: const Key('register'), onPressed: ready && !busy ? _submit : null, child: Text(t.continueLabel)),
    ]);
  }
}
