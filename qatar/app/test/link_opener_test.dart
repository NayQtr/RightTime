import 'package:flutter_test/flutter_test.dart';
import 'package:herzone/core/link_opener.dart';

void main() {
  test('only known destinations open (app review #4)', () async {
    final links = RecordingLinkOpener(extraHosts: {'pay.example.com'});
    final ok = [
      'https://herzone.app/checkout/mock/b1?pi=pi_1',
      'https://wa.me/97455501234',
      'https://pay.example.com/c/1',
      'tel:+97460053006',
      'tel:999',
    ];
    final refused = [
      'http://herzone.app/checkout', // not https
      'https://herzone.app.evil.com/pay', // look-alike host
      'https://evil.com/herzone.app',
      'https://user@herzone.app/', // credentials in the URL
      'https://herzone.app:8443/', // other port
      'whatsapp://send?phone=1',
      'intent://scan#Intent;scheme=zxing;end',
      'javascript:alert(1)',
      'tel:*21*123#', // dialer codes
      'sms:+97455501234',
    ];
    for (final u in ok) {
      expect(await links.open(Uri.parse(u)), isTrue, reason: u);
    }
    for (final u in refused) {
      expect(await links.open(Uri.parse(u)), isFalse, reason: u);
    }
    expect(links.opened.map((u) => u.toString()), ok);
  });
}
