import {
  describePictureSize,
  negotiatePictureSize,
  PictureSizeCandidate,
  PictureSizeProbe
} from "../src/camera/pictureSize";

const LADDER: PictureSizeCandidate[] = ["640x480", "352x288", undefined];

/**
 * A camera that captures only at the sizes named, and records what it was
 * asked to do in the order it was asked.
 *
 * `mounted` counts the sessions it was asked to build, because on a real phone
 * a refused size is not a setting that can be backed out of: it is the session
 * that has to go. A negotiation that reuses one camera across the ladder
 * reaches the bottom of it with a camera that cannot capture at all.
 */
function cameraAcceptingOnly(...capturable: PictureSizeCandidate[]) {
  const mounted: PictureSizeCandidate[] = [];
  const attempted: PictureSizeCandidate[] = [];
  let current: PictureSizeCandidate = "unset";
  /** Set by a size the camera refuses, and never cleared: only a rebuild does. */
  let spoiled = false;

  const probe: PictureSizeProbe = {
    mount: async (size) => {
      current = size;
      spoiled = false;
      mounted.push(size);
    },
    capture: async () => {
      attempted.push(current);
      if (spoiled) throw new Error("Image could not be captured");
      if (!capturable.includes(current)) {
        spoiled = true;
        throw new Error("Image could not be captured");
      }
    }
  };

  return { probe, mounted, attempted };
}

test("the cheapest size that captures is the one kept", async () => {
  const camera = cameraAcceptingOnly("640x480", undefined);
  const chosen = await negotiatePictureSize(LADDER, camera.probe);

  expect(chosen).toEqual({ size: "640x480", proven: true, rejected: [] });
  // Nothing further down the ladder was even tried.
  expect(camera.attempted).toEqual(["640x480"]);
});

test("a size the phone refuses is stepped over", async () => {
  // The iPhone 15 case: the session accepts the lowered preset, and then every
  // still taken under it fails.
  const camera = cameraAcceptingOnly(undefined);
  const chosen = await negotiatePictureSize(LADDER, camera.probe);

  expect(chosen.size).toBeUndefined();
  expect(chosen.proven).toBe(true);
  expect(chosen.rejected.map((entry) => entry.size)).toEqual(["640x480", "352x288"]);
  expect(camera.attempted).toEqual(LADDER);
});

test("each candidate gets a session of its own", async () => {
  // The whole of the iPhone 15 fix. A refused size leaves the camera unable to
  // capture at any size, so the rung below it is only reachable through a
  // camera that has been built again — a negotiation that re-props one
  // long-lived view lands on the safe rung and still cannot take a picture.
  const camera = cameraAcceptingOnly(undefined);
  const chosen = await negotiatePictureSize(LADDER, camera.probe);

  expect(camera.mounted).toEqual(LADDER);
  expect(chosen.proven).toBe(true);
});

test("a size is applied before it is judged", async () => {
  const camera = cameraAcceptingOnly(undefined);
  await negotiatePictureSize(LADDER, camera.probe);

  // Every capture was attempted against the size mounted immediately before
  // it: judging a candidate against the previous session would keep whichever
  // rung happened to follow a working one.
  expect(camera.attempted).toEqual(camera.mounted);
});

test("a camera that refuses everything is left on the last rung, unproven", async () => {
  // Nothing here can fix that, and waiting forever for a frame would hide it.
  // The segmentation loop reports its own failures; this gets out of the way.
  const camera = cameraAcceptingOnly();
  const chosen = await negotiatePictureSize(LADDER, camera.probe);

  expect(chosen.size).toBeUndefined();
  expect(chosen.proven).toBe(false);
  expect(chosen.rejected).toHaveLength(LADDER.length);
});

test("a one-rung ladder is a whole negotiation, which is what a rebuild asks for", async () => {
  // Recovery from a camera that stopped capturing: the cheap rungs have had
  // their turn, and the only thing left worth trying is a clean session at the
  // size every phone captures at.
  const camera = cameraAcceptingOnly(undefined);
  const chosen = await negotiatePictureSize([undefined], camera.probe);

  expect(chosen).toEqual({ size: undefined, proven: true, rejected: [] });
  expect(camera.mounted).toEqual([undefined]);
});

test("the reason a size was passed over is carried out for the log", async () => {
  const camera = cameraAcceptingOnly("352x288");
  const chosen = await negotiatePictureSize(LADDER, camera.probe);

  expect(chosen.size).toBe("352x288");
  expect((chosen.rejected[0].cause as Error).message).toBe("Image could not be captured");
});

test("an empty ladder is a programming error, not a camera that cannot capture", async () => {
  const camera = cameraAcceptingOnly();
  await expect(negotiatePictureSize([], camera.probe)).rejects.toThrow(
    "No capture size to negotiate"
  );
});

test("the camera's own default has a name to print", () => {
  expect(describePictureSize("640x480")).toBe("640x480");
  expect(describePictureSize(undefined)).toBe("the camera's default");
});
