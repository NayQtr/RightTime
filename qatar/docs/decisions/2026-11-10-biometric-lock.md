# Biometric lock not extended to meetup details (item 9)

**Date:** 10 Nov 2026. **Status:** provisional.

**Context.** The app asks for Face ID, the fingerprint or the phone's passcode before showing the Notifications tab
(`PrivacyLock` in `qatar/app/lib/core/device_unlock.dart`, used by `inbox_tab.dart`). The app security review
(decision A) asked whether My meetups, with the venue, the table code and tablemates' first names, should be locked too.

**Decision.** Not now. Only the Notifications tab stays locked.

**Why.** On the day of a meetup the member opens the details several times (directions, table code, check-in), often
in a hurry at the door; an extra unlock each time is friction at the moment that matters most. The phone's own lock
already protects these details, and tablemates appear by first name only.

**How to change.** A small app change: wrap the meetup details screen in the same `PrivacyLock` check as the inbox.

**Revisit when** members ask for it, or a report shows details seen on a shared or borrowed phone.
