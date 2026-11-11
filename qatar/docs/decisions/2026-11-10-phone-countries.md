# Visitors' numbers: Qatar only, by configuration (item 38)

**Date:** 10 Nov 2026. **Status:** provisional; built.

**Context.** Sign-in accepted +974 numbers only, written into the code. Visitors from the Gulf or elsewhere could not
sign up. The choice also decides where SMS must reach (item 37).

**Decision.** Qatar only at launch, now as a setting: `PHONE_ALLOWED_COUNTRY_CODES` (config.js, default `974`). A Qatar
number keeps its strict 8-digit pattern; another allowed code takes any valid international number. Codes outside Qatar
are capped at `OTP_COUNTRY_HOURLY_CAP` codes an hour per country (default 20) against SMS abuse. The store reviewers'
number is accepted as set.

**Why.** The service runs in Doha and paid SMS abroad is the main abuse risk; widening later is one setting, no release.

**How to change.** Set `PHONE_ALLOWED_COUNTRY_CODES`, for example `974,966,971,965,973,968` for the Gulf.

**Revisit** when visitors ask to join, or at launch with the SMS provider's price list.
