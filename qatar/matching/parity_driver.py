"""Reads a JSON matching job on stdin, runs the Python reference engine, prints a JSON result.
Used by qatar/api/test/parity.test.mjs to prove the JavaScript port gives identical results."""
import json
import sys

from matching_engine import BookingInput, VenueInput, run_matching

job = json.load(sys.stdin)
bookings = [BookingInput(
    booking_id=b["booking_id"], user_id=b["user_id"], session_id=b["session_id"], status=b["status"],
    conversation_language=b["conversation_language"], budget_tier_rank=int(b["budget_tier_rank"]),
    q05_topics=frozenset(b["q05_topics"]) if b.get("q05_topics") else None,
    consents_current=b.get("consents_current", True), age_attested=b.get("age_attested", True),
    account_active=b.get("account_active", True)) for b in job["bookings"]]
venues = None if job.get("venues") is None else [VenueInput(v["venue_id"], v["tier_rank"], v["capacity"], v["tables_available"]) for v in job["venues"]]
r = run_matching(job["session_id"], job["mode"], job["rule_version"], job["seed"], bookings,
                 block_rows=[tuple(x) for x in job.get("blocks", [])], venue_capacity=job.get("venue_capacity", 6),
                 venues=venues, packing_mode=job.get("packing_mode", "min_leftovers"), max_tables=job.get("max_tables"))
print(json.dumps({
    "tables": [{"code": t.table_code, "language": t.language, "tier": t.tier_rank, "venue_id": t.venue_id,
                "members": [m.booking_id for m in t.members]} for t in r.tables],
    "leftovers": [[lo.booking.booking_id, lo.reason] for lo in r.leftovers],
    "ineligible": [[b.booking_id, reason] for b, reason in r.ineligible],
    "inputs_hash": r.inputs_hash,
    "explanations": r.explanations,
}))
