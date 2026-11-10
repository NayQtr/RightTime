// OpenAPI 3.1 description of the HerZone member API (what the web app and the mobile app call). Written from the route
// handlers in src/routes/user.js and src/routes/push.js; test/openapi.test.mjs fails when a member route is added to the
// server but not here, or described here but missing from the server.
// Not described (not for app clients): /api/admin/v1/* (admin console), /api/v1/payments/webhooks/{psp} (payment
// provider to server), /api/mock-psp/* (staging checkout), /api/internal/push:dispatch (scheduler).
// Build openapi.json with: node openapi/build.mjs

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const ok = (schema, description = "OK") => ({ description, content: { "application/json": { schema } } });
const obj = (properties, required = Object.keys(properties)) => ({ type: "object", properties, required });
const str = (extra = {}) => ({ type: "string", ...extra });
const nullable = (schema) => ({ anyOf: [schema, { type: "null" }] });
const ts = { type: "string", format: "date-time", description: "ISO-8601 in Asia/Qatar (+03:00)" };
const uuid = { type: "string", format: "uuid" };
const idParam = (name = "id", description = "Booking id") => ({ name, in: "path", required: true, schema: name === "ref" ? str() : uuid, description });
const errors = (...codes) => Object.fromEntries(codes.map((c) => [String(c), { $ref: `#/components/responses/E${c}` }]));
const body = (schema) => ({ required: true, content: { "application/json": { schema } } });

const user = { security: [{ bearer: [] }] };
const userAny = { security: [{ bearer: [] }], "x-registration-required": false };
const idem = { parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }] };

const PHASES = ["pending_payment", "forming", "locked", "revealed", "day_of", "completed", "cancelled"];
const BOOKING_STATUSES = ["payment_pending", "paid_awaiting_group", "group_locked", "revealed", "checked_in", "completed",
  "cancelled_by_user", "cancelled_by_organizer", "expired", "payment_failed", "waitlisted"];
const REPORT_CATEGORIES = ["harassment", "threat_violence", "photo_without_consent", "stalking_unwanted_contact", "fraud", "disruptive"];
const CONSENT_TYPES = ["terms", "conduct", "privacy_notice", "marketing"];

export const paths = {
  // ------------------------------------------------------------------ auth
  "/api/v1/auth/otp:request": { post: { tags: ["auth"], ...idem,
    summary: "Send a sign-in code by SMS (in the request's locale) to a mobile number of an allowed country (Qatar only by default). 422 UNSUPPORTED_COUNTRY for other countries; 429 also when the hourly cap for a visitor country is reached; 503 when no SMS provider is set up or the provider refused the message (nothing is kept, ask again)",
    requestBody: body(obj({ phone_e164: str({ example: "+97455501234", description: "+974 followed by 8 digits starting 3-7; another allowed country (server setting PHONE_ALLOWED_COUNTRY_CODES): any valid E.164 number" }),
      locale: str({ enum: ["ar", "en"], description: "Language of the SMS; without it, the Accept-Language of the request" }) }, ["phone_e164"])),
    responses: { 202: ok(obj({ challenge_id: uuid, expires_in: { type: "integer", example: 300 }, resend_after: { type: "integer", example: 45 }, code_length: { type: "integer", example: 6 },
      dev_code: str({ description: "Staging only (OTP_DEV_MODE with no SMS provider). Never present in production." }) }, ["challenge_id", "expires_in", "resend_after", "code_length"]), "Code sent"),
    ...errors(400, 422, 429, 503) } } },
  "/api/v1/auth/otp:verify": { post: { tags: ["auth"], summary: "Exchange the code for a session (creates the account on first sign-in)",
    requestBody: body(obj({ challenge_id: uuid, code: str({ pattern: "^[0-9]{6}$" }), locale: str({ enum: ["ar", "en"] }) }, ["challenge_id", "code"])),
    responses: { 200: ok({ allOf: [ref("Tokens"), obj({ user: obj({ id: uuid, is_new: { type: "boolean" }, registration_status: ref("RegistrationStatus"), locale: str(), status: str() }) })] }),
      ...errors(400, 404, 410, 423) } } },
  "/api/v1/auth/token:refresh": { post: { tags: ["auth"], summary: "Rotate the refresh token. Presenting an already-used refresh token ends the whole session.",
    requestBody: body(obj({ refresh_token: str() })), responses: { 200: ok(ref("Tokens")), ...errors(401) } } },
  "/api/v1/auth/logout": { post: { tags: ["auth"], ...userAny, summary: "End this session: its refresh token and access tokens stop working at once",
    requestBody: body(obj({ refresh_token: str() })), responses: { 204: { description: "Signed out" }, ...errors(401) } } },

  // ------------------------------------------------------------------ public
  "/api/v1/health": { get: { tags: ["public"], summary: "Liveness of the API, database and server keys",
    responses: { 200: ok(obj({ status: str({ enum: ["ok"] }), key_source: str() })) } } },
  "/api/v1/legal/current": { get: { tags: ["public"], summary: "Current legal documents in the request language, with the versions to consent to",
    responses: { 200: ok({ type: "object", description: "Keys: terms, conduct, privacy_notice, marketing (each LegalDoc) and cancellation",
      properties: Object.fromEntries([...CONSENT_TYPES.map((t) => [t, ref("LegalDoc")]), ["cancellation", obj({ document_version: str(), text: str() })]]) }) } } },
  "/api/v1/support/call-requests": { post: { tags: ["safety"], ...user, ...idem, summary: "Request contact: the coordinator calls her back, with her note and the time she chose. One open request per member (sending again updates it), 3 new ones a day",
    requestBody: body(obj({ message: str({ minLength: 1, maxLength: 500, description: "What the problem or request is" }),
      callback_when: str({ enum: ["now", "10min", "1h", "tomorrow"], description: "When she wants the call" }),
      contact_phone: str({ description: "Only when the number to call is not the one she signed up with: 8 Qatar digits or international" }),
      booking_id: uuid }, ["message", "callback_when"])),
    responses: { 200: ok(obj({ id: uuid, status: str({ enum: ["requested"] }), created_at: ts, already_requested: { type: "boolean" } }), "She already had an open request: it now carries her latest words"),
      201: ok(obj({ id: uuid, status: str({ enum: ["requested"] }), created_at: ts, already_requested: { type: "boolean" } }), "Request received"), ...errors(401, 403, 404, 422, 429) } } },
  "/api/v1/support/contact": { get: { tags: ["public"], summary: "Coordinator on duty (call and WhatsApp), or null when not configured",
    responses: { 200: ok(obj({ coordinator: nullable(obj({ phone_e164: str(), phone_display: str(), tel_url: str(), whatsapp_url: nullable(str()) })) })) } } },
  "/api/v1/questionnaires/preview": { get: { tags: ["questionnaire"], summary: "Published questionnaire before sign-up (questions only, no user data)",
    responses: { 200: ok(obj({ questionnaire_version_id: uuid, code: str(), questions: { type: "array", items: ref("Question") } })), ...errors(404) } } },

  // ------------------------------------------------------------------ account
  "/api/v1/users/me": {
    get: { tags: ["account"], ...userAny, summary: "Signed-in member",
      responses: { 200: ok(obj({ user: { allOf: [ref("User"), obj({ outdated_consents: { type: "array", items: str({ enum: ["terms", "conduct", "privacy_notice"] }) } })] } })), ...errors(401) } },
    delete: { tags: ["account"], ...userAny, summary: "Request account deletion; every session ends at once",
      responses: { 202: ok(obj({ status: str({ enum: ["deletion_requested"] }) }), "Deletion requested"), ...errors(401) } } },
  "/api/v1/users/me/export": { get: { tags: ["account"], ...userAny, summary: "A copy of my data (right of access): account, consents, latest answers, bookings, payments, refunds, ratings, reports I made. Other members' data is never included",
    responses: { 200: { ...ok({ type: "object", required: ["exported_at", "account", "consents", "questionnaire", "bookings", "payments", "refunds", "ratings", "reports_made"] }),
      headers: { "Content-Disposition": { schema: str({ example: "attachment; filename=\"herzone-my-data-2026-11-04.json\"" }) } } }, ...errors(401) } } },
  "/api/v1/users/me/registration": { post: { tags: ["account"], ...userAny, ...idem, summary: "Complete registration: name, language, age and women-only confirmation, consents",
    requestBody: body(obj({ display_name: str({ minLength: 1, maxLength: 30, description: "First name, as on her payment card (required; compared with the name on the card). Letters, spaces and hyphens" }), locale: str({ enum: ["ar", "en"] }),
      age_eligibility_confirmed: { const: true }, woman_confirmed: { const: true }, consents: { type: "array", items: ref("Consent") } }, ["display_name", "locale", "age_eligibility_confirmed", "woman_confirmed", "consents"])),
    responses: { 201: ok(obj({ user: ref("User"), next: str({ enum: ["questionnaire"] }) }), "Registered"), ...errors(401, 409, 422) } } },
  "/api/v1/users/me/consents": { post: { tags: ["account"], ...user, ...idem, summary: "Accept an updated document, or confirm women-only for an older account",
    requestBody: body(obj({ consents: { type: "array", items: ref("Consent") }, woman_confirmed: { const: true } }, [])),
    responses: { 200: ok(obj({ outdated_consents: { type: "array", items: str() }, woman_confirmed: { type: "boolean" } })), ...errors(401, 403, 422) } } },

  // ------------------------------------------------------------------ questionnaire
  "/api/v1/questionnaires/current": { get: { tags: ["questionnaire"], ...user, summary: "Published questionnaire with the member's draft, submitted answers and answers carried from an older version",
    responses: { 200: ok(obj({ questionnaire_version_id: uuid, code: str(), questions: { type: "array", items: ref("Question") }, draft: nullable(ref("AnswerSet")),
      submitted: nullable(ref("AnswerSet")), has_submitted_any: { type: "boolean" },
      carried: nullable(obj({ from_version_id: uuid, answers: { type: "array", items: ref("Answer") } })) })), ...errors(401, 403, 404) } } },
  "/api/v1/questionnaire-responses": { post: { tags: ["questionnaire"], ...user, ...idem, summary: "Save a draft or submit the answers",
    requestBody: body(obj({ questionnaire_version_id: uuid, status: str({ enum: ["draft", "submitted"] }), answers: { type: "array", items: ref("Answer") } })),
    responses: { 200: ok(ref("ResponseSaved"), "Draft updated"), 201: ok(ref("ResponseSaved"), "Created or submitted"), ...errors(400, 401, 403, 404, 409, 422) } } },

  // ------------------------------------------------------------------ sessions and bookings
  "/api/v1/sessions": { get: { tags: ["bookings"], ...user, summary: "Dinners on sale, with the member's language match and any booking she holds",
    parameters: [{ name: "experience", in: "query", required: false, schema: str() }],
    responses: { 200: ok(obj({ profile_languages: { type: "array", items: str() }, sessions: { type: "array", items: ref("Session") } })), ...errors(401, 403) } } },
  "/api/v1/sessions/{id}/waitlist": { post: { tags: ["bookings"], ...user, ...idem, summary: "Join the waitlist of a full dinner",
    parameters: [idParam("id", "Session id"), ...idem.parameters],
    responses: { 201: ok(obj({ session_id: uuid, position: { type: "integer" }, status: str({ enum: ["waiting"] }) }), "On the waitlist"), ...errors(401, 403, 404, 409) } } },
  "/api/v1/bookings": {
    post: { tags: ["bookings"], ...user, ...idem, summary: "Hold a seat (minutes) and get the checkout link",
      requestBody: body(obj({ session_id: uuid, alternate_session_ids: { type: "array", items: uuid, maxItems: 3 },
        occasion: nullable(str({ enum: ["birthday", "other"], description: "She celebrates an occasion on this date; the coordinator is told" })) }, ["session_id"])),
      responses: { 201: ok(obj({ booking_id: uuid, ref: str(), status: ref("BookingStatus"), hold_expires_at: ts,
        checkout_url: nullable(str({ description: "null when the late no-refund acknowledgement is required first (POST .../checkout)" })),
        amount: ref("Money"), cancellation: ref("RefundTerms") }), "Seat held"), ...errors(401, 403, 404, 409, 422) } },
    get: { tags: ["bookings"], ...user, summary: "The member's bookings, newest dinner first",
      responses: { 200: ok(obj({ bookings: { type: "array", items: ref("BookingSummary") } })), ...errors(401, 403) } } },
  "/api/v1/bookings/{id}": { get: { tags: ["bookings"], ...user, summary: "One booking with its payment and refund terms",
    parameters: [idParam()],
    responses: { 200: ok(obj({ id: uuid, ref: str(), status: ref("BookingStatus"), hold_expires_at: nullable(ts), amount: ref("Money"),
      payment: nullable(obj({ status: str(), failure_code: nullable(str()) })), checkout_url: nullable(str()), cancellation: ref("RefundTerms") })), ...errors(400, 401, 403, 404) } } },
  "/api/v1/bookings/{id}/checkout": { post: { tags: ["bookings"], ...user, ...idem, summary: "A new checkout link while the seat is held",
    parameters: [idParam(), ...idem.parameters],
    requestBody: { required: false, content: { "application/json": { schema: obj({ acknowledge_late_no_refund: { type: "boolean" } }, []) } } },
    responses: { 200: ok(obj({ checkout_url: str(), hold_expires_at: ts })), ...errors(401, 403, 404, 409, 422) } } },
  "/api/v1/bookings/{id}/event-details": { get: { tags: ["bookings"], ...user,
    summary: "Everything about the dinner, revealed by phase: table code and themes after reveal, venue and tablemates on the day. Supports If-None-Match.",
    parameters: [idParam(), { name: "If-None-Match", in: "header", required: false, schema: str() }],
    responses: { 200: { ...ok(ref("EventDetails")), headers: { ETag: { schema: str() } } }, 304: { description: "Not modified" }, ...errors(400, 401, 403, 404) } } },
  "/api/v1/bookings/{id}/cancel": { post: { tags: ["bookings"], ...user, ...idem, summary: "Cancel before the dinner starts; refund per the cancellation terms",
    parameters: [idParam(), ...idem.parameters],
    requestBody: { required: false, content: { "application/json": { schema: obj({ reason_code: str({ enum: ["schedule_changed", "illness", "other"] }) }, []) } } },
    responses: { 200: ok(obj({ status: str({ enum: ["cancelled_by_user"] }), refund: obj({ eligible: { type: "boolean" }, amount: ref("Money"), status: str() }) })), ...errors(401, 403, 404, 409) } } },
  "/api/v1/bookings/{id}/resolution": { post: { tags: ["bookings"], ...user, ...idem, summary: "After the organiser cancels: rebook into another dinner or take a refund",
    parameters: [idParam(), ...idem.parameters],
    requestBody: body({ oneOf: [obj({ choice: { const: "rebook" }, session_id: uuid }), obj({ choice: { const: "refund" } })] }),
    responses: { 200: ok({ oneOf: [obj({ choice: { const: "rebook" }, booking: obj({ id: uuid, ref: str(), status: ref("BookingStatus") }) }),
      obj({ choice: { const: "refund" }, refund: obj({ status: str(), amount: ref("Money") }) })] }), ...errors(401, 403, 404, 409, 422) } } },
  "/api/v1/bookings/{id}/check-in": { post: { tags: ["bookings"], ...user, ...idem, summary: "Check in at the venue on the day",
    parameters: [idParam(), ...idem.parameters],
    responses: { 200: ok(obj({ status: str({ enum: ["checked_in"] }), checked_in_at: ts })), ...errors(401, 403, 404, 409) } } },
  "/api/v1/bookings/{id}/feedback": { post: { tags: ["bookings"], ...user, ...idem, summary: "Private feedback after the dinner (once)",
    parameters: [idParam(), ...idem.parameters],
    requestBody: body(obj({ overall_rating: { type: "integer", minimum: 1, maximum: 5 }, comfort_rating: { type: "integer", minimum: 1, maximum: 5 },
      venue_rating: { type: "integer", minimum: 1, maximum: 5 }, would_book_again: { type: "boolean" }, comment: str({ maxLength: 500 }) }, ["overall_rating", "comfort_rating"])),
    responses: { 201: ok(obj({ saved: { const: true } }), "Saved"), ...errors(401, 403, 404, 409, 422) } } },

  // ------------------------------------------------------------------ after the dinner
  "/api/v1/bookings/{id}/contacts": { get: { tags: ["contacts"], ...user, summary: "Tablemates and the stay-in-touch state with each, for 7 days after the dinner",
    parameters: [idParam()],
    responses: { 200: ok(obj({ open: { type: "boolean" }, closes_at: nullable(ts), members: { type: "array", items: obj({ seat: str({ description: "Opaque per-viewer seat token" }),
      display_name: nullable(str()), state: str({ enum: ["none", "sent", "incoming", "connected"] }), request_id: nullable(uuid), whatsapp_url: nullable(str()), can_send: { type: "boolean" } }) } })),
      ...errors(400, 401, 403, 404) } } },
  "/api/v1/contact-requests": { post: { tags: ["contacts"], ...user, ...idem, summary: "Ask a tablemate to stay in touch (a refusal is never revealed)",
    requestBody: body(obj({ booking_id: uuid, seat: str() })),
    responses: { 201: ok(obj({ state: str({ enum: ["sent", "connected"] }), whatsapp_url: nullable(str()) }), "Sent or connected"), ...errors(401, 403, 404, 409, 422) } } },
  "/api/v1/contact-requests/{id}:accept": { post: { tags: ["contacts"], ...user, ...idem, summary: "Accept a request: both get each other's WhatsApp link",
    parameters: [idParam("id", "Contact request id"), ...idem.parameters],
    responses: { 200: ok(ref("ContactDecision")), ...errors(400, 401, 403, 404, 409) } } },
  "/api/v1/contact-requests/{id}:decline": { post: { tags: ["contacts"], ...user, ...idem, summary: "Decline a request (the sender is not told)",
    parameters: [idParam("id", "Contact request id"), ...idem.parameters],
    responses: { 200: ok(ref("ContactDecision")), ...errors(400, 401, 403, 404, 409) } } },

  // ------------------------------------------------------------------ safety
  "/api/v1/reports": { post: { tags: ["safety"], ...user, ...idem, summary: "Private safety report about a dinner or a tablemate. immediate_danger shows the 999 screen.",
    requestBody: body(obj({ booking_id: uuid, category: str({ enum: REPORT_CATEGORIES }), timing: str({ enum: ["during", "after"] }),
      immediate_danger: { type: "boolean" }, reported_seat: str(), description: str({ maxLength: 2000 }) }, ["booking_id", "category", "timing"])),
    responses: { 201: ok(obj({ case_ref: str(), severity: { type: "integer", minimum: 1, maximum: 4 }, status: str(),
      emergency: obj({ show: { type: "boolean" }, number: str({ enum: ["999"] }) }) }), "Report received"), ...errors(400, 401, 403, 404, 422) } } },
  "/api/v1/cases/mine": { get: { tags: ["safety"], ...user, summary: "Decisions taken about the member, with the appeal window",
    responses: { 200: ok(obj({ cases: { type: "array", items: obj({ case_ref: str(), event_date: nullable(ts), category: str(), decision: str(), decision_label: str({ description: "The decision in the request's language" }), status: str(),
      appeal_until: ts, can_appeal: { type: "boolean" } }) } })), ...errors(401) } } },
  "/api/v1/cases/{ref}/appeal": { post: { tags: ["safety"], ...user, ...idem, summary: "Appeal a decision within 14 days",
    parameters: [idParam("ref", "Case reference"), ...idem.parameters],
    responses: { 202: ok(obj({ case_ref: str(), status: str({ enum: ["appealed"] }) }), "Appeal filed"), ...errors(401, 404, 409) } } },

  // ------------------------------------------------------------------ notifications and subscriptions
  "/api/v1/notifications": { get: { tags: ["notifications"], ...userAny, summary: "Inbox: the latest 50 notifications, in the request language",
    responses: { 200: ok(obj({ notifications: { type: "array", items: obj({ id: uuid, template_key: str(), created_at: ts, booking_id: nullable(uuid), text: str() }) } })), ...errors(401) } } },
  "/api/v1/push/key": { get: { tags: ["notifications"], summary: "Web Push (VAPID) public key. The mobile app will use APNs and FCM instead (NMX-52).",
    responses: { 200: ok(obj({ public_key: str() })) } } },
  "/api/v1/push/subscriptions": { post: { tags: ["notifications"], ...userAny, summary: "Register this browser for Web Push",
    requestBody: body(obj({ endpoint: str({ format: "uri" }), keys: obj({ p256dh: str(), auth: str() }) })),
    responses: { 201: ok(obj({ subscribed: { const: true } }), "Subscribed"), ...errors(401, 422) } } },
  "/api/v1/push/subscriptions:delete": { post: { tags: ["notifications"], ...userAny, summary: "Stop Web Push on this browser",
    requestBody: body(obj({ endpoint: str() })), responses: { 200: ok(obj({ subscribed: { const: false } })), ...errors(401) } } },
  "/api/v1/promo-codes:check": { post: { tags: ["subscriptions"], ...user, summary: "Check a promo code (plans are display-only; nothing is redeemed). At most 10 checks per hour.",
    requestBody: body(obj({ code: str({ maxLength: 24 }) })),
    responses: { 200: ok({ oneOf: [obj({ valid: { const: true }, percent_off: { type: "integer" } }), obj({ valid: { const: false } })] }), ...errors(401, 403, 422, 429) } } },
};

const problem = obj({ type: str(), status: { type: "integer" }, code: str({ description: "Stable machine code, e.g. OTP_INVALID, SESSION_FULL, BOOKING_NOT_FOUND" }),
  message: str({ description: "Localised for Accept-Language (ar default, en)" }), request_id: str(), details: { type: "array", items: { type: "object" } },
  retryable: { type: "boolean" }, retry_after: { type: "integer" } }, ["type", "status", "code", "message", "request_id", "retryable"]);
const errorDescriptions = { 400: "Malformed request", 401: "Not signed in, or the session has ended", 403: "Registration incomplete, account suspended, or not allowed",
  404: "Not found", 409: "Conflict with the current state", 410: "Code expired", 422: "Validation failed", 423: "Too many wrong codes", 429: "Too many requests", 503: "Service unavailable" };

// operationId for code generators (e.g. getBookingsIdEventDetails), and `security: []` on public routes.
const camel = (method, p) => method + p.replace(/^\/api\/v1/, "").split(/[/:{}-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join("");
for (const [p, ops] of Object.entries(paths)) for (const [m, op] of Object.entries(ops)) {
  op.operationId = camel(m, p);
  if (!op.security) op.security = [];
}
const TAGS = { auth: "Sign in with an SMS code; sessions and tokens", public: "No sign-in needed", account: "Registration, consents, deletion",
  questionnaire: "The personality questionnaire", bookings: "Dinners, seats, payment, cancellation, check-in, feedback",
  contacts: "Staying in touch with tablemates after the dinner", safety: "Private reports and appeals", notifications: "Inbox and Web Push",
  subscriptions: "Promo codes (plans are display-only)" };

export const spec = {
  openapi: "3.1.0",
  info: { title: "HerZone member API", version: "1.0.0",
    description: "Small-table dinners for women in Qatar. Errors use one problem envelope (code + localised message). Times are ISO-8601 in Asia/Qatar (+03:00); money is in dirhams (minor units) with a display string. Every POST that changes data needs an Idempotency-Key; a retry with the same key replays the first answer. Access tokens last 15 minutes and stop working at once when their session ends; refresh tokens rotate on every use. The mobile app sends `X-HerZone-App: <version> <ios|android>` on every call; below the server's minimum version (MIN_APP_VERSION) any call returns 426 APP_UPDATE_REQUIRED, with min_version and store_url in details, and the app shows only an update screen." },
  servers: [{ url: "https://fvodcnqmxskgzziwuwmz.supabase.co/functions/v1", description: "Staging (herzone.app today); add ?forceFunctionRegion=ap-south-1 to run next to the database" }],
  tags: Object.entries(TAGS).map(([name, description]) => ({ name, description })),
  paths,
  components: {
    securitySchemes: { bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
    parameters: { IdempotencyKey: { name: "Idempotency-Key", in: "header", required: true, schema: str({ maxLength: 100 }), description: "A new UUID per action; reuse it only to retry the same request" } },
    responses: Object.fromEntries(Object.entries(errorDescriptions).map(([c, d]) => [`E${c}`, { description: d, content: { "application/problem+json": { schema: ref("Problem") }, "application/json": { schema: ref("Problem") } } }])),
    schemas: {
      Problem: problem,
      Tokens: obj({ access_token: str(), refresh_token: str(), token_type: str({ enum: ["Bearer"] }), expires_in: { type: "integer", example: 900 } }),
      RegistrationStatus: str({ enum: ["consents_required", "complete"] }),
      User: obj({ id: uuid, display_name: nullable(str()), locale: str({ enum: ["ar", "en"] }), status: str(), registration_status: ref("RegistrationStatus"), woman_confirmed: { type: "boolean" },
        phone_e164: nullable(str({ description: "Only on GET /users/me: her own number, to confirm it as the contact number" })) },
        ["id", "display_name", "locale", "status", "registration_status", "woman_confirmed"]),
      LegalDoc: obj({ document_version: str(), required: { type: "boolean" }, text: str() }),
      Consent: obj({ type: str({ enum: CONSENT_TYPES }), document_version: str(), granted: { type: "boolean" } }),
      Question: obj({ id: uuid, key: str({ example: "Q01" }), scope: str(), answer_type: str(), is_required: { type: "boolean" }, max_selections: nullable({ type: "integer" }),
        layout: str(), section: nullable(str()), scale_low: nullable(str()), scale_high: nullable(str()), text: str(), purpose: nullable(str()),
        options: { type: "array", items: obj({ id: uuid, key: str(), label: str(), emoji: nullable(str()), is_exclusive: { type: "boolean" } }) } }),
      Answer: obj({ question_id: uuid, option_ids: { type: "array", items: uuid } }),
      AnswerSet: obj({ response_id: uuid, answers: { type: "array", items: ref("Answer") } }),
      ResponseSaved: obj({ response_id: uuid, status: str({ enum: ["draft", "submitted"] }), submitted_at: nullable(ts),
        completeness: obj({ required_answered: { type: "integer" }, required_total: { type: "integer" }, optional_answered: { type: "integer" }, optional_total: { type: "integer" } }),
        derived: obj({ conversation_languages: { type: "array", items: str() }, budget_tier: nullable(obj({ id: uuid, label: str() })),
          supported_languages_note: nullable(str()), private_contact_case_id: nullable(uuid) }), next: str({ enum: ["choose_session"] }) }, ["response_id", "status", "completeness"]),
      Money: obj({ amount_minor: { type: "integer" }, currency: str({ enum: ["QAR"] }), display: str({ example: "59 ر.ق" }) }),
      BookingStatus: str({ enum: BOOKING_STATUSES }),
      Phase: str({ enum: PHASES }),
      Session: obj({ id: uuid, experience: str(), conversation_language: str(), language_match: nullable({ type: "boolean" }), starts_at: ts, ends_at: ts, district: str(),
        seats_left: { type: "integer" }, is_full: { type: "boolean" }, price: ref("Money"), group_size: str({ example: "4–6" }), full_refund_until: ts,
        full_refund_until_hours: { type: "integer" }, booking_closes_at: ts, my_booking_id: nullable(uuid) }),
      RefundTerms: obj({ full_refund_until: ts, full_refund_until_hours: { type: "integer" }, full_refund_window_open: { type: "boolean" },
        refund_if_cancelled_after_payment: str({ enum: ["full", "partial", "none"] }), late_cancel_refund_pct: { type: "integer" },
        acknowledgement_required: nullable(str({ enum: ["late_no_refund"] })) }),
      BookingSummary: obj({ id: uuid, ref: str(), status: ref("BookingStatus"), phase: ref("Phase"), experience: str(), starts_at: ts, ends_at: ts,
        lock_at: nullable(ts), reveal_at: nullable(ts), district: str(), confirmed_count: nullable({ type: "integer" }), hold_expires_at: nullable(ts) }),
      Action: obj({ type: str({ enum: ["cancel", "pay", "check_in", "report", "feedback", "resolution"] }), method: str({ enum: ["POST"] }), href: str() }),
      EventDetails: obj({
        booking: obj({ id: uuid, ref: str(), status: ref("BookingStatus"), cancel_reason: str(), cancellation: { type: "object" } }, ["id", "ref", "status", "cancellation"]),
        session: obj({ experience: str(), conversation_language: str(), starts_at: ts, ends_at: ts, timezone: str({ enum: ["Asia/Qatar"] }), district: str(),
          food_price_band: obj({ max_minor: { type: "integer" }, display: str() }), accessibility: nullable({}), group_size: str() }),
        reveal: obj({ phase: ref("Phase"), lock_at: nullable(ts), reveal_at: nullable(ts), check_in_opens_at: nullable(ts) }),
        identity_check: str({ enum: ["pending"], description: "Present while the name on her payment card is reviewed: venue, table code and tablemates stay hidden until it is approved" }),
        table: nullable(obj({ confirmed_count: { type: "integer" }, capacity: { type: "integer" }, code: str(), shared_themes: { type: "array", items: str() },
          members: { type: "array", items: obj({ seat: str(), display_name: nullable(str()) }) } }, ["confirmed_count", "capacity"])),
        venue: nullable(obj({ name: str(), address: str(), district: str(), location: obj({ lat: { type: "number" }, lng: { type: "number" } }), map_url: str(),
          arrival_instructions: str(), bill_policy: str() })),
        payment: nullable(obj({ amount: ref("Money"), status: str() })),
        actions: { type: "array", items: ref("Action") },
        feedback: obj({ submitted: { type: "boolean" }, open: { type: "boolean" } }),
        refund: obj({ status: str(), amount: ref("Money") }, ["status"]),
        rebooked_into: obj({ booking_id: uuid, ref: str(), status: ref("BookingStatus") }),
        resolution: { type: "object", description: "Rebook or refund options after the organiser cancels" },
      }, ["booking", "session", "reveal", "table", "venue", "payment", "actions"]),
      ContactDecision: obj({ status: str({ enum: ["accepted", "declined"] }), whatsapp_url: nullable(str()) }),
    },
  },
};
