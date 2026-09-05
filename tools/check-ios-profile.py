#!/usr/bin/env python3
"""Fails if a provisioning profile cannot sign this app for the App Store.

The release workflow signs manually, so the profile in APPLE_DIST_PROFILE_BASE64
is the profile: nothing downloads a better one at build time. Every way it can
be wrong -- a development profile, another app's, another team's, an expired one
-- surfaces on the macOS runner as a signing error thirty minutes and ~250
billed minutes into a release. The Linux gate runs this instead, for seconds.

Usage: check-ios-profile.py <decoded profile plist> <bundle id> [team id]

The plist is what `openssl smime -verify -inform DER -noverify` writes out of a
.mobileprovision, which is a CMS blob wrapped around exactly that.
"""

import datetime as dt
import plistlib
import sys


def fail(message):
    print(f"::error::{message}", file=sys.stderr)
    sys.exit(1)


def main():
    if not 3 <= len(sys.argv) <= 4:
        fail(f"usage: {sys.argv[0]} <profile plist> <bundle id> [team id]")

    plist_path, bundle_id = sys.argv[1], sys.argv[2]
    expected_team = sys.argv[3] if len(sys.argv) == 4 else None

    try:
        with open(plist_path, "rb") as handle:
            profile = plistlib.load(handle)
    except Exception as error:  # noqa: BLE001 - the reason is for a human
        fail(f"APPLE_DIST_PROFILE_BASE64 did not decode to a provisioning profile: {error}")

    name = profile.get("Name", "<unnamed>")
    entitlements = profile.get("Entitlements", {})

    # "TEAMID.com.example.app", or "TEAMID.*" for a wildcard profile, which
    # signs this app just as well.
    app_id = entitlements.get("application-identifier", "")
    prefix, _, pattern = app_id.partition(".")
    if not pattern:
        fail(f'Profile "{name}" carries no application-identifier entitlement.')
    if pattern != bundle_id and not (pattern.endswith("*") and bundle_id.startswith(pattern[:-1])):
        fail(f'Profile "{name}" is for {pattern}, but app.json builds {bundle_id}.')

    teams = profile.get("TeamIdentifier", [])
    if expected_team and expected_team not in teams:
        fail(
            f'Profile "{name}" belongs to team {", ".join(teams) or "?"}, '
            f"but APPLE_TEAM_ID is {expected_team}."
        )

    # A development or ad-hoc profile lists the devices it may run on; an App
    # Store profile has no list, because it is not tied to hardware. This is
    # the check that catches the easy mistake of exporting the wrong profile
    # type from the portal, which otherwise fails at upload with ITMS-90165.
    if "ProvisionedDevices" in profile:
        fail(
            f'Profile "{name}" is a development or ad-hoc profile -- it lists '
            f"{len(profile['ProvisionedDevices'])} device(s). TestFlight needs an "
            "App Store profile, which lists none."
        )
    if entitlements.get("get-task-allow"):
        fail(f'Profile "{name}" allows debugging (get-task-allow), so it is not a distribution profile.')

    expires = profile.get("ExpirationDate")
    if not isinstance(expires, dt.datetime):
        fail(f'Profile "{name}" has no expiry date.')
    # plistlib returns naive UTC.
    remaining = expires - dt.datetime.utcnow()
    if remaining.total_seconds() <= 0:
        fail(f'Profile "{name}" expired on {expires:%Y-%m-%d}. Regenerate it at developer.apple.com.')

    print(f'Profile "{name}" signs {pattern} for team {", ".join(teams)}.')
    print(f"  App Store profile, no device list, expires {expires:%Y-%m-%d} ({remaining.days} days).")
    if remaining.days < 30:
        print(f"::warning::Provisioning profile expires in {remaining.days} days.")


if __name__ == "__main__":
    main()
