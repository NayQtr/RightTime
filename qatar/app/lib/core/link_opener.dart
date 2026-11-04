import 'package:url_launcher/url_launcher.dart';

/// Opens links outside the app (payment page, phone dialer, WhatsApp). Tests record them instead.
class LinkOpener {
  const LinkOpener();
  Future<bool> open(Uri url) => launchUrl(url, mode: LaunchMode.externalApplication);
}

class RecordingLinkOpener extends LinkOpener {
  RecordingLinkOpener();
  final opened = <Uri>[];

  @override
  Future<bool> open(Uri url) async {
    opened.add(url);
    return true;
  }
}
