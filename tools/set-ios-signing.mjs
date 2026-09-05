import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Points the generated Xcode project at manual App Store signing.
 *
 * `xcodebuild archive` under automatic signing always signs for *development*
 * first and leaves distribution to the export that follows. A development
 * profile is minted from a registered device list and an Apple Development
 * certificate, and an account that only ever ships to TestFlight has neither,
 * so Apple refuses with "Your team has no devices from which to generate a
 * provisioning profile". Setting CODE_SIGN_IDENTITY does not move that
 * decision; it only earns "automatically signed for development, but a
 * conflicting code signing identity has been manually specified".
 *
 * Manual signing skips the whole negotiation: the App Store profile in
 * APPLE_DIST_PROFILE_BASE64 is the one used, and no device list exists to
 * refuse. That is why the release workflow stores a profile even though
 * -allowProvisioningUpdates would otherwise fetch one.
 *
 * The settings land on the app target rather than on the xcodebuild command
 * line, because a command-line setting reaches every target in the build --
 * including CocoaPods' -- and a pod that cannot carry a profile fails with
 * "does not support provisioning profiles". Run this after `pod install`,
 * which rewrites parts of the same project.
 */

const APPLICATION = "com.apple.product-type.application";

const team = process.env.TEAM_ID;
const profile = process.env.PROFILE_NAME;

if (!team || !profile) {
  console.error("::error::set-ios-signing.mjs needs TEAM_ID and PROFILE_NAME in the environment.");
  process.exit(1);
}

function findProject() {
  if (!existsSync("ios")) return null;
  const dir = readdirSync("ios").find((entry) => entry.endsWith(".xcodeproj"));
  if (!dir) return null;
  const path = join("ios", dir, "project.pbxproj");
  return existsSync(path) ? path : null;
}

const path = findProject();
if (!path) {
  console.error("::error::No ios/*.xcodeproj/project.pbxproj. Run `expo prebuild` first.");
  process.exit(1);
}

let src = readFileSync(path, "utf8");

/** The app target, as opposed to any test or extension target. */
const target = [...src.matchAll(/\n\t\t(\w+) \/\* ([^*]+?) \*\/ = \{\n\t\t\tisa = PBXNativeTarget;(.*?)\n\t\t\};/gs)].find(
  (match) => match[3].includes(APPLICATION),
);
if (!target) {
  console.error(`::error::${path} has no ${APPLICATION} target, so there is nothing to sign.`);
  process.exit(1);
}

const listId = target[3].match(/buildConfigurationList = (\w+)/)?.[1];
const list = listId && src.match(new RegExp(`\\n\\t\\t${listId} /\\* [^*]+ \\*/ = \\{(.*?)\\n\\t\\t\\};`, "s"));
if (!list) {
  console.error(`::error::Target ${target[2]} in ${path} has no build configuration list.`);
  process.exit(1);
}

const configIds = [...list[1].matchAll(/(\w+) \/\* (\w+) \*\/,/g)].map((match) => match[1]);
if (configIds.length === 0) {
  console.error(`::error::Target ${target[2]} in ${path} lists no build configurations.`);
  process.exit(1);
}

// Every spelling of the settings that decide how the app is signed. They are
// removed rather than edited in place, so a value left by a previous run or a
// future template cannot survive underneath the ones written below.
const OWNED = /^\t{4}"?(CODE_SIGN_IDENTITY|CODE_SIGN_STYLE|PROVISIONING_PROFILE|PROVISIONING_PROFILE_SPECIFIER|DEVELOPMENT_TEAM)(\[[^\]]*\])?"?\s*=.*;\n/gm;

const settings = [
  `\t\t\t\tCODE_SIGN_IDENTITY = "Apple Distribution";`,
  `\t\t\t\t"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "Apple Distribution";`,
  `\t\t\t\tCODE_SIGN_STYLE = Manual;`,
  `\t\t\t\tDEVELOPMENT_TEAM = ${team};`,
  `\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = "${profile}";`,
].join("\n");

for (const id of configIds) {
  const block = new RegExp(`(\\n\\t\\t${id} /\\* (\\w+) \\*/ = \\{.*?buildSettings = \\{\\n)(.*?)(\\n\\t\\t\\t\\};)`, "s");
  const found = src.match(block);
  if (!found) {
    console.error(`::error::Build configuration ${id} in ${path} has no buildSettings block.`);
    process.exit(1);
  }
  const cleaned = found[3].replace(OWNED, "");
  src = src.replace(block, `$1${settings}\n${cleaned}$4`);
}

// The template also pins the identity at the project level, which is a
// different setting from the target's and would otherwise still read
// "iPhone Developer". Nothing should consult it now, but leaving a
// development identity in a project that only ever builds for the App Store
// is a trap for the next person reading the file.
src = src.replace(
  /"CODE_SIGN_IDENTITY\[sdk=iphoneos\*\]" = "iPhone Developer";/g,
  '"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "Apple Distribution";',
);

writeFileSync(path, src);

console.log(`Signing for target ${target[2]} in ${path}:`);
for (const [, name, body] of src.matchAll(/\n\t\t(?:\w+) \/\* (\w+) \*\/ = \{\n\t\t\tisa = XCBuildConfiguration;(.*?)\n\t\t\};/gs)) {
  for (const line of body.split("\n").filter((entry) => /CODE_SIGN|PROVISIONING|DEVELOPMENT_TEAM/.test(entry))) {
    console.log(`  ${name}: ${line.trim()}`);
  }
}
