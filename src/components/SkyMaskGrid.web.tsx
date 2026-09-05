/**
 * The web build is the replay harness, and it draws the debug mask grid on a
 * canvas rather than as the pooled views `SkyMaskGrid.tsx` uses on the phone.
 *
 * This file exists only because the bundler picks the implementation by
 * platform, and can only pick a sibling of the module being imported. The
 * implementation itself is the harness's, and lives with the rest of it.
 */
export { SkyMaskGrid } from "../../testing/replay/SkyMaskGridWeb";
