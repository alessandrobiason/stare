/**
 * What counts as a change to the native side of the app.
 *
 * `runtimeVersion` is the `fingerprint` policy (app.json), so this hash is what
 * decides which installed builds an over-the-air update is allowed to reach: a
 * phone only takes an update whose fingerprint equals the one compiled into it.
 * Everything the native build depends on goes in — app.json, every config
 * plugin, every autolinked package — and the default is to include rather than
 * exclude, because the cost of the two mistakes is not symmetric. A fingerprint
 * that changes when it did not need to means an update is quietly not offered,
 * which is a wasted release; one that fails to change when it should means
 * JavaScript running against a binary that no longer matches it, on someone's
 * phone, with no way to take it back.
 *
 * So there is one exclusion here, and it is not a preference.
 *
 * `ios-testflight.yml` stamps `ios.buildNumber` into app.json before prebuild,
 * because CFBundleVersion has to rise on every upload. That number is different
 * on every release and exists only inside the CI job, so with versions in the
 * hash the fingerprint compiled into the binary is one no checkout of this
 * repository can ever reproduce — and every update published afterwards would
 * compute a different one and silently never arrive. Version strings do not
 * reach compiled code, so dropping them costs nothing.
 *
 * The second entry is `@expo/fingerprint`'s own default, repeated because a
 * config file replaces the default list rather than adding to it.
 */
module.exports = {
  sourceSkips: ["ExpoConfigVersions", "PackageJsonAndroidAndIosScriptsIfNotContainRun"]
};
