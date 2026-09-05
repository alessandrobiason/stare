import { readFileSync } from "node:fs";

/**
 * Fails if the over-the-air update config in app.json is not usable.
 *
 * `expo-updates` is not fail-loud. A build whose `updates.url` points at a
 * project that does not exist installs and runs perfectly well — it simply
 * never finds an update, forever, and the only symptom is that a published fix
 * does not arrive. That is a bad thing to discover after a 10x macOS release,
 * because the fix is another one.
 *
 * So the shape is checked where it is cheap, next to the icon and the release
 * secrets: the project id has been filled in, the update URL names that same
 * project, the channel the binary will ask for is present, and the runtime
 * version is the fingerprint policy the whole scheme leans on.
 *
 * Everything here is settled by `npx eas-cli init` and `npx eas-cli update:configure`
 * — see the OTA section of docs/ios-builds.md.
 */

const PLACEHOLDER = "REPLACE-WITH-EAS-PROJECT-ID";
/** EAS project ids are v4 UUIDs; nothing else is worth accepting. */
const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const { expo } = JSON.parse(readFileSync("app.json", "utf8"));
const problems = [];

const projectId = expo.extra?.eas?.projectId;
const url = expo.updates?.url;
const channel = expo.updates?.requestHeaders?.["expo-channel-name"];
const policy = expo.runtimeVersion?.policy;

if (projectId === PLACEHOLDER || url?.includes(PLACEHOLDER)) {
  problems.push(
    "app.json still holds the placeholder project id. Run `npx eas-cli init` and " +
      "`npx eas-cli update:configure`, which fill in both extra.eas.projectId and updates.url.",
  );
} else if (!PROJECT_ID.test(projectId ?? "")) {
  problems.push(`extra.eas.projectId is "${projectId}", which is not a UUID.`);
} else if (url !== `https://u.expo.dev/${projectId}`) {
  problems.push(
    `updates.url is "${url}", which does not name project ${projectId}. ` +
      "A build pointed at the wrong project never sees an update and never says so.",
  );
}

if (!channel) {
  problems.push(
    "updates.requestHeaders['expo-channel-name'] is missing. This build is not made " +
      "by EAS Build, so the channel is not injected for us: the binary asks for the " +
      "channel named here and nothing else.",
  );
}

// Not a preference. Under the appVersion policy an update reaches any build
// sharing a version string, including one built before a native dependency
// changed under it; the fingerprint policy derives the runtime version from the
// native inputs themselves, so a build and an update only match when the native
// side actually does.
if (policy !== "fingerprint") {
  problems.push(
    `runtimeVersion policy is ${policy ? `"${policy}"` : "not set"}, not "fingerprint". ` +
      "Only the fingerprint policy stops a JavaScript update reaching a binary whose " +
      "native side no longer matches it.",
  );
}

if (problems.length > 0) {
  for (const line of problems) console.error(`::error::${line}`);
  console.error("\nSee \"Shipping a fix without a rebuild\" in docs/ios-builds.md.");
  process.exit(1);
}

console.log(
  `Updates configured: project ${projectId}, channel "${channel}", fingerprint runtime version.`,
);
