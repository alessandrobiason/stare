/**
 * Skia, as the two things in this app that draw with it need it.
 *
 * The package's own entry point cannot be used here. It re-exports
 * `external/reanimated`, and one module in there — `useVideoLoading` — calls
 * `Rea.createWorkletRuntime()` at module scope. So importing
 * `@shopify/react-native-skia` at all evaluates that line, the optional
 * dependency proxy behind `Rea` throws "react-native-reanimated is not
 * installed!", and the app is dead before its first frame. The proxy exists
 * precisely so an uninstalled Reanimated costs nothing until an animated API
 * is touched; the eager call at import defeats it.
 *
 * Reanimated is native code, so installing it to satisfy an import nothing
 * here uses would mean another device build — for a dependency that would then
 * sit in the binary unused. Naming the three modules this app actually draws
 * with costs nothing, and cannot fail quietly: they are internal paths, so a
 * Skia upgrade that moves them breaks the bundle rather than the picture.
 *
 * If that upgrade comes, check whether the entry point is safe again first.
 * If it is, this file is a handful of re-exports to delete.
 *
 * `NativeSetup` is the side effect the entry point would have run: it installs
 * the JSI bindings, and everything below is unusable until it has.
 */
import "@shopify/react-native-skia/src/skia/NativeSetup";

export {
  createPicture,
  PaintStyle,
  Skia,
  StrokeCap,
  StrokeJoin,
  TileMode
} from "@shopify/react-native-skia/src/skia";
export type {
  SkCanvas,
  SkColor,
  SkPaint,
  SkPath,
  SkPicture
} from "@shopify/react-native-skia/src/skia";
export { SkiaPictureView } from "@shopify/react-native-skia/src/views/SkiaPictureView";
