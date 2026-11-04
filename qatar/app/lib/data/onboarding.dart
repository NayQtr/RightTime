import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../core/api_client.dart';

class QOption {
  const QOption({required this.id, required this.key, required this.label, this.emoji, required this.exclusive});
  final String id, key, label;
  final String? emoji;
  final bool exclusive;
}

class Question {
  const Question({required this.id, required this.key, required this.type, required this.required, required this.max, required this.layout,
      required this.section, required this.text, required this.purpose, required this.scaleLow, required this.scaleHigh, required this.options});

  final String id, key, type, layout, text;
  final bool required;
  final int max;
  final String? section, purpose, scaleLow, scaleHigh;
  final List<QOption> options;

  bool get multi => type == 'multi';

  factory Question.fromJson(Map<String, dynamic> j) => Question(
        id: j['id'] as String,
        key: j['key'] as String,
        type: j['answer_type'] as String,
        required: (j['is_required'] as bool?) ?? false,
        max: (j['max_selections'] as num?)?.toInt() ?? 1,
        layout: (j['layout'] as String?) ?? 'list',
        section: j['section'] as String?,
        text: j['text'] as String,
        purpose: j['purpose'] as String?,
        scaleLow: j['scale_low'] as String?,
        scaleHigh: j['scale_high'] as String?,
        options: ((j['options'] as List?) ?? const [])
            .map((o) => o as Map<String, dynamic>)
            .map((o) => QOption(id: o['id'] as String, key: o['key'] as String, label: o['label'] as String, emoji: o['emoji'] as String?, exclusive: (o['is_exclusive'] as bool?) ?? false))
            .toList(),
      );
}

class Questionnaire {
  const Questionnaire({required this.versionId, required this.questions, this.answers = const {}, this.submitted = false});
  final String versionId;
  final List<Question> questions;

  /// Answers already on the server (draft, or carried from an older version) for a signed-in member.
  final Map<String, Set<String>> answers;
  final bool submitted;
}

class LegalDoc {
  const LegalDoc({required this.type, required this.version, required this.required, required this.text});
  final String type, version, text;
  final bool required;
}

/// Answers given before sign-up stay on this device only (privacy notice §3), in Keychain/Keystore-backed storage,
/// until they are sent with the new account; then they are deleted.
class QuizStore {
  QuizStore([FlutterSecureStorage? s]) : _s = s ?? const FlutterSecureStorage(iOptions: IOSOptions(accessibility: KeychainAccessibility.first_unlock_this_device, synchronizable: false));
  final FlutterSecureStorage? _s;
  Map<String, dynamic>? _memory; // tests

  QuizStore.memory() : _s = null;

  static const _key = 'hz.quiz';

  Future<({String versionId, Map<String, Set<String>> answers, int step})?> read() async {
    final raw = _s == null ? (_memory == null ? null : jsonEncode(_memory)) : await _s.read(key: _key);
    if (raw == null) return null;
    final m = jsonDecode(raw) as Map<String, dynamic>;
    return (
      versionId: m['v'] as String,
      answers: (m['a'] as Map<String, dynamic>).map((k, v) => MapEntry(k, (v as List).cast<String>().toSet())),
      step: (m['s'] as num).toInt(),
    );
  }

  Future<void> write(String versionId, Map<String, Set<String>> answers, int step) async {
    final m = {'v': versionId, 'a': answers.map((k, v) => MapEntry(k, v.toList())), 's': step};
    if (_s == null) {
      _memory = m;
    } else {
      await _s.write(key: _key, value: jsonEncode(m));
    }
  }

  Future<void> clear() async {
    _memory = null;
    await _s?.delete(key: _key);
  }
}

class OnboardingRepository {
  OnboardingRepository(this._api);
  final ApiClient _api;

  List<Question> _questions(Map<String, dynamic> r) => ((r['questions'] as List?) ?? const []).map((q) => Question.fromJson(q as Map<String, dynamic>)).toList();

  Map<String, Set<String>> _answers(Object? block) => block is Map<String, dynamic>
      ? {for (final a in (block['answers'] as List)) (a as Map)['question_id'] as String: ((a['option_ids'] as List).cast<String>()).toSet()}
      : {};

  /// The published questions, before sign-up (no user data).
  Future<Questionnaire> preview() async {
    final r = (await _api.send('GET', '/api/v1/questionnaires/preview', auth: false))!;
    return Questionnaire(versionId: r['questionnaire_version_id'] as String, questions: _questions(r));
  }

  /// For a signed-in member: the questions with her draft (or answers carried from an older version).
  Future<Questionnaire> current() async {
    final r = (await _api.send('GET', '/api/v1/questionnaires/current'))!;
    final ans = r['draft'] ?? r['submitted'] ?? r['carried'];
    return Questionnaire(
      versionId: r['questionnaire_version_id'] as String,
      questions: _questions(r),
      answers: _answers(ans),
      submitted: r['submitted'] != null || (r['has_submitted_any'] as bool? ?? false),
    );
  }

  Future<void> save(String versionId, Map<String, Set<String>> answers, {required bool submit}) => _api.send('POST', '/api/v1/questionnaire-responses', body: {
        'questionnaire_version_id': versionId,
        'status': submit ? 'submitted' : 'draft',
        'answers': [for (final e in answers.entries) if (e.value.isNotEmpty) {'question_id': e.key, 'option_ids': e.value.toList()}],
      });

  Future<List<LegalDoc>> legal() async {
    final r = (await _api.send('GET', '/api/v1/legal/current', auth: false))!;
    return [
      for (final t in ['terms', 'conduct', 'privacy_notice', 'marketing'])
        if (r[t] is Map<String, dynamic>)
          LegalDoc(type: t, version: r[t]['document_version'] as String, required: (r[t]['required'] as bool?) ?? false, text: (r[t]['text'] as String?) ?? ''),
    ];
  }

  Future<void> register({required String? name, required String locale, required Map<String, LegalDoc> docs, required Set<String> granted}) =>
      _api.send('POST', '/api/v1/users/me/registration', body: {
        'display_name': (name == null || name.trim().isEmpty) ? null : name.trim(),
        'locale': locale,
        'age_eligibility_confirmed': true,
        'woman_confirmed': true,
        'consents': [for (final d in docs.values) {'type': d.type, 'document_version': d.version, 'granted': granted.contains(d.type)}],
      });
}
