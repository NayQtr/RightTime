"""
publish_run.py — bridge between PostgreSQL and matching_engine (standard library only).

    psql -Atc "SELECT app.matching_input('<session-uuid>')" \
      | python3 publish_run.py --rule-version r1-interest --seed 20261023 --mode published [--actor <admin-uuid>] \
      | psql -v ON_ERROR_STOP=1 -1

Reads app.matching_input() JSON on stdin, runs run_matching(), and writes SQL on stdout:
  * always:          one matching_runs row (dry_run or published) with seed, inputs_hash, explanations;
  * published only:  the previous current assignments are retired, event_tables rows are created
                     ('forming'), and table_assignments rows are inserted.
Leftovers are reported as a SQL comment and on stderr; ops handles them per Runbook A.
"""
import argparse
import json
import sys
import uuid

from matching_engine import BookingInput, VenueInput, run_matching


def q(v):
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--rule-version", required=True)
    ap.add_argument("--seed", type=int, required=True)
    ap.add_argument("--mode", choices=["dry_run", "published"], required=True)
    ap.add_argument("--actor", default=None, help="admin_users.id; omit for the system job")
    ap.add_argument("--venue-capacity", type=int, default=6)
    ap.add_argument("--packing-mode", choices=["min_leftovers", "greedy_6"], default="min_leftovers")
    ap.add_argument("--max-tables", type=int, default=None,
                    help="bookable tables for this session; default = sum of venues' tables_available")
    args = ap.parse_args(argv)

    data = json.load(sys.stdin)
    bookings = [BookingInput(
        booking_id=b["booking_id"], user_id=b["user_id"], session_id=b["session_id"], status=b["status"],
        conversation_language=b["conversation_language"], budget_tier_rank=int(b["budget_tier_rank"]),
        q05_topics=frozenset(b["q05_topics"]) if b.get("q05_topics") else None,
        consents_current=bool(b["consents_current"]), age_attested=bool(b["age_attested"]),
        account_active=bool(b["account_active"])) for b in data["bookings"]]
    venues = [VenueInput(v["venue_id"], int(v["tier_rank"]), int(v["capacity"]), int(v["tables_available"]))
              for v in data["venues"]]
    max_tables = args.max_tables if args.max_tables is not None else sum(v.tables_available for v in venues)
    res = run_matching(data["session_id"], args.mode, args.rule_version, args.seed, bookings,
                       block_rows=[tuple(x) for x in data["blocks"]], venue_capacity=args.venue_capacity,
                       venues=venues, packing_mode=args.packing_mode, max_tables=max_tables)

    run_id = str(uuid.uuid4())
    summary = {"tables": len(res.tables), "seated": sum(t.size for t in res.tables),
               "leftovers": len(res.leftovers), "ineligible": len(res.ineligible)}
    out = ["SET search_path = app, public;"]
    out.append(
        "INSERT INTO matching_runs (id, session_id, mode, rule_version, questionnaire_version_id, algorithm, seed, "
        "inputs_hash, result_summary, explanations, run_by, published_at) VALUES ("
        f"{q(run_id)}, {q(res.session_id)}, {q(res.mode)}, {q(res.rule_version)}, {q(data['questionnaire_version_id'])}, "
        f"{q(res.algorithm)}, {res.seed}, {q(res.inputs_hash)}, {q(json.dumps(summary))}::jsonb, "
        f"{q(json.dumps(res.explanations, ensure_ascii=False))}::jsonb, {q(args.actor)}::uuid, "
        f"{'now()' if res.mode == 'published' else 'NULL'});")
    if res.mode == "published":
        out.append("UPDATE table_assignments SET is_current = false WHERE is_current AND booking_id IN "
                   f"(SELECT id FROM bookings WHERE session_id = {q(res.session_id)});")
        for t in res.tables:
            tid = str(uuid.uuid4())
            out.append("INSERT INTO event_tables (id, session_id, venue_id, table_code, capacity, status) VALUES "
                       f"({q(tid)}, {q(res.session_id)}, {q(t.venue_id)}, {q(t.table_code)}, {args.venue_capacity}, 'forming');")
            for m in t.members:
                ms = t.member_scores.get(m.booking_id)
                out.append("INSERT INTO table_assignments (booking_id, table_id, matching_run_id, member_score) VALUES "
                           f"({q(m.booking_id)}, {q(tid)}, {q(run_id)}, {'NULL' if ms is None else round(ms, 4)});")
    for lo in res.leftovers:
        out.append(f"-- leftover booking {lo.booking.booking_id} reason={lo.reason}")
        print(f"leftover {lo.booking.booking_id} {lo.reason}", file=sys.stderr)
    for b, reason in res.ineligible:
        out.append(f"-- ineligible booking {b.booking_id} reason={reason}")
    print("\n".join(out))


if __name__ == "__main__":
    main()
