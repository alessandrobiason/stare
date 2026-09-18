import { ConfigPlugin, IOSConfig, withFinalizedMod } from "expo/config-plugins";
import plist from "@expo/plist";
import * as fs from "fs";

/**
 * Strips the `aps-environment` entitlement `expo-notifications` adds, because
 * this app never asks for it.
 *
 * Everything this app schedules is a local notification — a `UNNotification`
 * with a date on it, worked out on the device (`src/satellite/passAlerts.ts`)
 * and handed to iOS to deliver. That needs no entitlement at all. But
 * `expo-notifications` ships a config plugin that runs the moment the package
 * is installed — Expo autolinks it whether or not it is listed in this file's
 * own `plugins` array — and that plugin always writes `aps-environment` to the
 * entitlements file, because the same package also carries the *remote* push
 * APIs (`getDevicePushTokenAsync`, `getExpoPushTokenAsync`) this app never
 * calls. Left in, that entitlement asks App Store Connect for a provisioning
 * profile with the Push Notifications capability enabled — a real capability,
 * on the Apple Developer account, that a profile generated before this feature
 * existed does not have — and the archive fails signing over a permission the
 * app does not use:
 *
 *     error: Provisioning profile "…" doesn't include the aps-environment
 *     entitlement.
 *
 * The alternative is enabling that capability and reissuing the profile. This
 * plugin is the other one: it removes the one line that made the profile
 * insufficient, so a build keeps working with the profile it already has.
 *
 * **Why a `finalized` mod, and not a second `withEntitlementsPlist`.** Mods of
 * the same kind run in the order they were registered, and Expo's own default
 * plugins — `expo-notifications` among them — are registered *after* this
 * app's `plugins` array is read, not before. A plugin here that edited the
 * entitlements plist directly would run and finish before
 * `expo-notifications`'s own edit even starts, which would delete a key that
 * has not been written yet. A `finalized` mod is different: whichever mod
 * kind's edits ran, and in whatever order they were registered, `finalized`
 * mods run after all of them (`@expo/config-plugins`'s `evalModsAsync` sorts
 * every platform's mods by a fixed precedence — `dangerous` first,
 * `finalized` last — so it is the one hook guaranteed to see the file as
 * every other plugin left it. `withDangerousMod` is the same idea at the other
 * end of that same list, and is not what is wanted here: this has to run
 * *after* the entitlement exists, not before.
 *
 * By the time this runs, `expo prebuild` has already written the pbxproj that
 * says where the entitlements file is (the `xcodeproj` mod runs early, ahead
 * of everything but `dangerous`), so the file this reads and rewrites is the
 * one Xcode is actually going to sign against.
 */
const withoutPushEntitlement: ConfigPlugin = (config) =>
  withFinalizedMod(config, [
    "ios",
    async (config) => {
      const entitlementsPath = IOSConfig.Entitlements.getEntitlementsPath(
        config.modRequest.projectRoot
      );
      // No file, or none of the keys this exists to remove: expo-notifications'
      // own plugin either did not run (the package was removed) or has already
      // been told not to write this key, and there is nothing to undo either
      // way.
      if (!entitlementsPath) return config;

      const entitlements = plist.parse(fs.readFileSync(entitlementsPath, "utf8")) as Record<
        string,
        unknown
      >;
      if (!("aps-environment" in entitlements)) return config;

      delete entitlements["aps-environment"];
      fs.writeFileSync(entitlementsPath, plist.build(entitlements));
      return config;
    }
  ]);

export default withoutPushEntitlement;
