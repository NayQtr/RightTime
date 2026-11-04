import 'package:flutter/foundation.dart';

import '../../core/api_error.dart';
import '../../data/onboarding.dart';
import '../../domain/session.dart';

/// The questionnaire, one question per screen. Before sign-up the answers stay on the device (QuizStore); for a
/// signed-in member every step is saved as a server draft and the last step submits.
class QuizViewModel extends ChangeNotifier {
  QuizViewModel(this._repo, this._store, this._session);

  final OnboardingRepository _repo;
  final QuizStore _store;
  final Session _session;

  Questionnaire? q;
  Map<String, Set<String>> answers = {};
  int step = 0;
  bool busy = false;
  bool done = false;
  ApiError? error;

  bool get signedIn => _session.status == SessionStatus.signedIn;
  Question? get current => q == null || step >= q!.questions.length ? null : q!.questions[step];
  Set<String> get selected => answers[current?.id] ?? <String>{};
  bool get canNext => current != null && (!current!.required || selected.isNotEmpty);
  int get total => q?.questions.length ?? 0;

  Future<void> load() async {
    busy = true;
    error = null;
    done = false;
    notifyListeners();
    try {
      q = signedIn ? await _repo.current() : await _repo.preview();
      answers = {for (final e in q!.answers.entries) e.key: {...e.value}};
      step = 0;
      if (!signedIn) {
        final saved = await _store.read();
        if (saved != null && saved.versionId == q!.versionId) {
          answers = saved.answers;
          step = saved.step.clamp(0, total - 1);
        }
      } else {
        // pick up at the first required question that is still open
        final open = q!.questions.indexWhere((x) => x.required && (answers[x.id] ?? {}).isEmpty);
        step = open < 0 ? 0 : open;
      }
    } on ApiError catch (e) {
      error = e;
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  /// Single choice: select and move on. Multiple choice: toggle, up to the question's maximum; an exclusive option
  /// ("I prefer not to say") clears the others and is cleared by them.
  Future<void> choose(QOption o) async {
    final qn = current!;
    final set = {...selected};
    if (!qn.multi) {
      answers[qn.id] = {o.id};
      await next();
      return;
    }
    if (set.contains(o.id)) {
      set.remove(o.id);
    } else if (o.exclusive) {
      set
        ..clear()
        ..add(o.id);
    } else {
      set.removeWhere((id) => qn.options.any((x) => x.id == id && x.exclusive));
      if (set.length >= qn.max) return;
      set.add(o.id);
    }
    answers[qn.id] = set;
    notifyListeners();
  }

  Future<void> next() async {
    if (!canNext) return;
    if (step + 1 >= total) return finish();
    step++;
    await _persist(submit: false);
    notifyListeners();
  }

  Future<void> skip() async {
    if (current?.required ?? true) return;
    answers.remove(current!.id);
    await next();
  }

  void back() {
    if (step > 0) {
      step--;
      notifyListeners();
    }
  }

  Future<void> finish() async {
    if (q!.questions.any((x) => x.required && (answers[x.id] ?? {}).isEmpty)) {
      step = q!.questions.indexWhere((x) => x.required && (answers[x.id] ?? {}).isEmpty);
      notifyListeners();
      return;
    }
    await _persist(submit: signedIn);
    if (signedIn && error == null) {
      await _session.loadMe();
    }
    done = error == null;
    notifyListeners();
  }

  /// After sign-up: send the answers given before it, then forget the device copy.
  Future<bool> submitSavedAnswers() async {
    final saved = await _store.read();
    if (saved == null) return false;
    try {
      await _repo.save(saved.versionId, saved.answers, submit: true);
      await _store.clear();
      return true;
    } on ApiError {
      return false;
    }
  }

  Future<void> _persist({required bool submit}) async {
    error = null;
    try {
      if (signedIn) {
        await _repo.save(q!.versionId, answers, submit: submit);
      } else {
        await _store.write(q!.versionId, answers, step);
      }
    } on ApiError catch (e) {
      // a dropped draft save is not fatal; the next step saves everything again
      if (submit) error = e;
    }
  }
}
