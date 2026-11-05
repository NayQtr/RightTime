#!/usr/bin/env python3
"""Fails if any package locked in pubspec.lock has a known vulnerability in OSV (https://osv.dev).

Run from qatar/app: python3 tool/osv_check.py
Standard library only, so it runs on any CI image. Exit codes: 0 clean, 1 vulnerable, 2 could not check.
"""
import json
import re
import sys
import urllib.request


def locked_packages(text):
    """Hosted packages from pubspec.lock as (name, version). The lock file's layout is fixed, so lines are enough."""
    out, name, source = [], None, None
    for line in text.splitlines():
        m = re.match(r"^  (\S+):$", line)
        if m:
            name, source = m.group(1), None
            continue
        m = re.match(r'^    source: (\S+)$', line)
        if m:
            source = m.group(1)
            continue
        m = re.match(r'^    version: "([^"]+)"$', line)
        if m and name and source == "hosted":
            out.append((name, m.group(1)))
    return out


def main():
    pkgs = locked_packages(open("pubspec.lock", encoding="utf-8").read())
    if not pkgs:
        print("osv: no packages found in pubspec.lock")
        return 2
    body = json.dumps({"queries": [{"package": {"name": n, "ecosystem": "Pub"}, "version": v} for n, v in pkgs]}).encode()
    req = urllib.request.Request("https://api.osv.dev/v1/querybatch", data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            results = json.load(res)["results"]
    except Exception as e:  # network or service failure: say so instead of passing silently
        print(f"osv: could not check ({e})")
        return 2
    bad = [(n, v, [x["id"] for x in r.get("vulns", [])]) for (n, v), r in zip(pkgs, results) if r.get("vulns")]
    for n, v, ids in bad:
        print(f"osv: {n} {v}: {', '.join(ids)}")
    print(f"osv: {len(pkgs)} packages checked, {len(bad)} with known vulnerabilities")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
