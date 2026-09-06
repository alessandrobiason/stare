import * as fs from "fs";
import * as path from "path";
import { parseTleCatalog } from "../src/data/tleCatalog";
import { briefingFor, BriefingSubject } from "../src/satellite/briefing";
import { noradId, SATELLITE_CATEGORIES } from "../src/satellite/categories";
import { Tle } from "../src/types";

/**
 * The same slice of CelesTrak's active catalog the tracker is measured against:
 * ~16,000 real entries, which is the only honest way to ask what share of a
 * tapped sky gets an answer better than its category.
 */
const catalog: Tle[] = parseTleCatalog(
  fs.readFileSync(path.join(__dirname, "../testing/fixtures/active.tle"), "utf8")
);

function subjectOf(tle: Tle): BriefingSubject {
  return {
    name: tle.name,
    noradId: noradId(tle.line1),
    category: tle.category,
    parked: tle.parked
  };
}

/** Every distinct briefing this module can produce, by walking the catalog. */
const briefings = catalog.map((tle) => briefingFor(subjectOf(tle)));

function briefingOf(name: string): ReturnType<typeof briefingFor> {
  const tle = catalog.find((candidate) => candidate.name === name);
  if (!tle) throw new Error(`${name} is not in the fixture`);
  return briefingFor(subjectOf(tle));
}

describe("what a tapped satellite says it is", () => {
  test("the landmarks are described one at a time, with the mission's own page", () => {
    // The tier the whole module is for: these are the objects the sky spends
    // its labels and its brightest colour on.
    const iss = briefingOf("ISS");
    expect(iss.text).toContain("International Space Station");
    expect(iss.url).toContain("nasa.gov");

    const hubble = briefingOf("Hubble");
    expect(hubble.text).toContain("2.4 m optical telescope");
    expect(hubble.url).toContain("nasa.gov");

    // Named `CXO` in the catalog and renamed for the label, so the description
    // has to hang off the catalogue number rather than either name.
    expect(briefingOf("Chandra").text).toContain("X-ray");
    expect(briefingOf("Chandra").url).toBe("https://chandra.harvard.edu/");
  });

  test("every landmark gets its own words and somewhere to read more", () => {
    const landmarks = catalog.filter((tle) => tle.category === "LANDMARK");
    const described = landmarks.map((tle) => briefingFor(subjectOf(tle)));

    expect(described.length).toBeGreaterThan(10);
    for (const briefing of described) {
      expect(briefing.url).toBeDefined();
      // Not the category's fallback sentence, which says nothing an unlabelled
      // marker did not already say.
      expect(briefing.text).not.toContain("worth going outside for");
    }
  });

  test("a fleet is described once, and every member of it gets that description", () => {
    // Nobody wants a paragraph about Starlink 4321 in particular.
    expect(briefingOf("STARLINK-1008").text).toContain("SpaceX");
    expect(briefingOf("STARLINK-1008")).toEqual(briefingOf("STARLINK-1012"));

    expect(briefingOf("NAVSTAR 43 (USA 132)").text).toContain("atomic clock");
    expect(briefingOf("NAVSTAR 43 (USA 132)").url).toBe("https://www.gps.gov/");
  });

  test("the catalog's own name for a crew ferry is the thing that changes, so it is matched by name", () => {
    // Renumbered every few months, which is why these are the one part of the
    // landmark tier that is a name test rather than a catalogue number.
    const soyuz = catalog.find((tle) => tle.name.startsWith("SOYUZ-MS"));
    if (soyuz) expect(briefingFor(subjectOf(soyuz)).text).toContain("lifeboat");
  });

  test("most of a tapped sky gets more than the colour of its marker already said", () => {
    // Every sentence the last tier can produce, gathered by asking about
    // objects no fleet and no catalogue number can recognise.
    const fallbacks = new Set(
      SATELLITE_CATEGORIES.flatMap((category) =>
        [false, true].map(
          (parked) =>
            briefingFor({ name: "ZZ UNRECOGNISED", noradId: 0, category, parked }).text
        )
      )
    );
    const described = briefings.filter((briefing) => !fallbacks.has(briefing.text));

    // The residual is genuinely long-tailed — some 780 naming conventions with
    // a handful of objects each — but the fleets are where the objects are, so
    // nine tapped satellites in ten are described by something written for them.
    expect(described.length / briefings.length).toBeGreaterThan(0.9);
  });

  test("nothing is left without an answer", () => {
    for (const briefing of briefings) {
      expect(briefing.text.length).toBeGreaterThan(80);
    }
  });

  test("two lines, because a card over a camera picture is not an article", () => {
    for (const briefing of briefings) {
      expect(briefing.text.length).toBeLessThanOrEqual(260);
    }
  });

  test("a link is the operator's own page or nothing at all", () => {
    for (const { url } of briefings) {
      if (url === undefined) continue;
      expect(url).toMatch(/^https?:\/\/[a-z0-9.-]+\//);
      // A search result or an encyclopaedia article is something anyone can
      // already do from their own phone.
      expect(url).not.toMatch(/wikipedia|google|bing|duckduckgo/);
    }
  });

  test("an object nothing recognises still gets a sentence", () => {
    const unknown: BriefingSubject = {
      name: "OBJECT ZZ-1",
      noradId: 999999,
      category: "OTHER",
      parked: false
    };

    // Blank space where a description should be reads as a fault in the app
    // rather than a gap in the catalog.
    expect(briefingFor({ ...unknown, name: "WHAT IS THIS" }).text).toContain("does not classify");
  });

  test("a parked object nothing else claims is described by the orbit it holds", () => {
    const parked = briefingFor({
      name: "UNRECOGNISED GEO",
      noradId: 999998,
      category: "COMMS",
      parked: true
    });

    expect(parked.text).toContain("35,786 km");
  });
});
