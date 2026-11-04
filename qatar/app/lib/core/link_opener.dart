import 'package:url_launcher/url_launcher.dart';

/// Opens links outside the app (payment page, phone dialer, WhatsApp). Tests record them instead.
///
/// Only known destinations open (MASVS-PLATFORM): `https` on HerZone's own sites, WhatsApp (`wa.me`) and the payment
/// provider's page, and `tel:` with a phone number. Anything else from the server is refused, so a tampered response
/// cannot send a member to a look-alike payment page or another app.
class LinkOpener {
  const LinkOpener({this.extraHosts = const {}});

  /// The payment provider's checkout host, set at build time once it is chosen (NMX-24): `--dart-define=LINK_HOSTS=pay.example.com`.
  final Set<String> extraHosts;

  static const ownHosts = {'herzone.app', 'www.herzone.app', 'qatar-mvp-staging.vercel.app', 'wa.me', 'maps.google.com', 'play.google.com', 'apps.apple.com'};
  static final _tel = RegExp(r'^\+?\d{3,15}$');

  static Set<String> hostsFromEnvironment() => const String.fromEnvironment('LINK_HOSTS')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .where((h) => h.isNotEmpty)
      .toSet();

  bool allows(Uri url) {
    if (url.scheme == 'tel') return _tel.hasMatch(url.path);
    if (url.scheme != 'https' || url.userInfo.isNotEmpty || url.hasPort && url.port != 443) return false;
    final host = url.host.toLowerCase();
    return ownHosts.contains(host) || extraHosts.contains(host);
  }

  /// Returns false (and opens nothing) for a destination that is not allowed.
  Future<bool> open(Uri url) async => allows(url) && await launch(url);

  Future<bool> launch(Uri url) => launchUrl(url, mode: LaunchMode.externalApplication);
}

class RecordingLinkOpener extends LinkOpener {
  RecordingLinkOpener({super.extraHosts});
  final opened = <Uri>[];

  @override
  Future<bool> launch(Uri url) async {
    opened.add(url);
    return true;
  }
}
