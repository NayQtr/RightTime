// Access and refresh tokens, for members and for the admin console alike. This lives beside the other services rather
// than inside routes/user.js because routes/admin.js issues tokens too, and a route file must not have to import
// another route file to do it.
import { jwtSign, randomToken, randomUUID, sha256hex } from "../lib/crypto.js";
import { fail, json } from "../lib/http.js";

export async function issueTokens(ctx, subjectType, subjectId, familyId = randomUUID()) {
  const now = Math.floor(Date.now() / 1000);
  const ttl = subjectType === "admin" ? ctx.cfg.adminTtl : ctx.cfg.accessTtl;
  // sid = the session (refresh-token family): the access token is refused as soon as that session is revoked (app.js).
  const access = jwtSign(ctx.keys.jwt.privateKey, ctx.keys.jwt.kid, { sub: subjectId, typ: subjectType, sid: familyId, iat: now, exp: now + ttl, jti: randomToken(8) });
  const refresh = "rt_" + randomToken(32);
  await ctx.sql`
    INSERT INTO app.refresh_tokens (subject_type, subject_id, family_id, token_hash, expires_at)
    VALUES (${subjectType}, ${subjectId}, ${familyId}, ${sha256hex(refresh)}, now() + make_interval(days => ${ctx.cfg.refreshTtlDays}))`;
  return { access_token: access, refresh_token: refresh, token_type: "Bearer", expires_in: ttl };
}

export async function refreshTokens(ctx, subjectType) {
  const { sql, body } = ctx;
  const token = String(body.refresh_token || "");
  const [rt] = await sql`SELECT * FROM app.refresh_tokens WHERE token_hash = ${sha256hex(token)} AND subject_type = ${subjectType}`;
  if (!rt) fail(401, "UNAUTHENTICATED");
  if (rt.revoked_at) {
    await sql`UPDATE app.refresh_tokens SET revoked_at = now() WHERE family_id = ${rt.family_id} AND revoked_at IS NULL`;
    fail(401, "UNAUTHENTICATED");
  }
  if (new Date(rt.expires_at) < new Date()) fail(401, "UNAUTHENTICATED");
  // NMX-63: claim the token atomically before issuing new ones. Two requests with the same token at the same moment:
  // only one claims it; the other is treated as reuse and ends the whole session (it used to split it into two).
  const [claimed] = await sql`UPDATE app.refresh_tokens SET revoked_at = now() WHERE id = ${rt.id} AND revoked_at IS NULL RETURNING id`;
  if (!claimed) {
    await sql`UPDATE app.refresh_tokens SET revoked_at = now() WHERE family_id = ${rt.family_id} AND revoked_at IS NULL`;
    fail(401, "UNAUTHENTICATED");
  }
  const tokens = await issueTokens(ctx, subjectType, rt.subject_id, rt.family_id);
  await sql`UPDATE app.refresh_tokens SET replaced_by = (SELECT id FROM app.refresh_tokens WHERE token_hash = ${sha256hex(tokens.refresh_token)})
             WHERE id = ${rt.id}`;
  return json(200, tokens);
}
