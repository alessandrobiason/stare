import { briefingText } from "../i18n/briefings";
import { SatelliteCategory } from "./categories";

/**
 * What one object *is*, in the words someone standing under it would want.
 *
 * The marker's four channels and the card's five figures answer "what is it
 * for" and "where is it", and neither answers "what am I actually looking at".
 * The catalogue itself is no help there — CelesTrak carries a name and two
 * lines of elements, and the name is a working identifier (`CXO`, `GJZ 01`,
 * `TRANSPORTER-17 OBJECT BA`) rather than a description. So the description is
 * written here, and hung off the two keys the catalogue does promise: the
 * catalogue number, which never changes, and the naming convention an operator
 * uses for a whole fleet.
 *
 * **Three tiers, most specific first.**
 *
 * 1. **Landmarks, one at a time** (`LANDMARK_BRIEFINGS`). A couple of dozen
 *    objects are the reason anyone points a phone at the sky — the two crewed
 *    stations and the great observatories — and they are individually worth
 *    knowing about. They are keyed by catalogue number for the reason
 *    `categories.ts` gives: their names are the least stable thing about them.
 * 2. **Fleets, by naming convention** (`FAMILIES`). Nobody wants a paragraph
 *    about Starlink 4321 in particular; they want to know what a Starlink is.
 *    One entry describes thousands of objects, and 92% of the catalogue is a
 *    handful of such fleets.
 * 3. **The category it was filed under** (`CATEGORY_BRIEFINGS`). The residual:
 *    a plain statement of what the colour on the marker already meant, so an
 *    unrecognised object still gets a sentence rather than a blank space.
 *
 * **Links are the operator's own page, or nothing.** A link is worth a tap only
 * if it lands on the people who fly the thing; a search result or an
 * encyclopaedia article is something anyone can already do from their own
 * phone. Plenty of entries therefore carry no link — a Chinese reconnaissance
 * series and a Russian military designation have no public mission page, and
 * saying nothing is the honest answer.
 */
export type Briefing = {
  /** What it is and what it is for, in about two lines. */
  text: string;
  /** The operator's own page for it, where there is one to open. */
  url?: string;
};

/**
 * One entry in the tables below: a briefing, plus the name its translations
 * are filed under.
 *
 * The id is what makes this text translatable without the eleven other
 * language files having to know about catalogue numbers or naming
 * conventions — see `src/i18n/briefings`. It is written out rather than
 * derived from the regex beside it because a regex is a matching rule that
 * will be widened as a fleet grows new prefixes, and the key a translation
 * hangs on has to outlive that.
 */
export type BriefingEntry = Briefing & { id: string };

/** What a briefing is looked up from: everything the card already knows. */
export type BriefingSubject = {
  name: string;
  /** The catalogue number, which is how the landmarks are recognised. */
  noradId: number;
  category: SatelliteCategory;
  parked: boolean;
};

/**
 * The landmarks, one at a time — the tier this whole module exists for.
 *
 * Keyed by catalogue number, matching `LANDMARK_NORAD_IDS` in `categories.ts`:
 * these are the objects the overlay spends its only labels and its brightest
 * colour on, so they are the ones a tap should say the most about. Each gets
 * what it is, who flies it and what it is doing up there, plus the mission's
 * own page.
 */
const LANDMARK_BRIEFINGS = {
  25544: {
    id: "iss",
    text: "The International Space Station: a laboratory the size of a football pitch, 400 km up, crewed without a break since November 2000 by NASA, Roscosmos, ESA, JAXA and CSA. It circles the Earth every ninety minutes, so the crew see sixteen sunrises a day. It is also the brightest thing in this sky — bright enough to follow with the naked eye, crossing from horizon to horizon in about five minutes without ever blinking or changing colour, which is how you tell it from an aircraft.",
    url: "https://www.nasa.gov/international-space-station/"
  },
  48274: {
    id: "tiangong",
    text: "Tiangong, China's own station: three modules and a crew of three, assembled in orbit in 2021-22 and flown by the China Manned Space Agency. It is about a fifth the mass of the ISS and was built to last at least a decade, with crews rotating roughly every six months. After the ISS it is the brightest object passing overhead, and it moves the same way — a steady point of light, no flashing, gone in a few minutes.",
    url: "http://en.cmse.gov.cn/"
  },
  20580: {
    id: "hubble",
    text: "The Hubble Space Telescope, a 2.4 m optical telescope NASA and ESA have flown since 1990. It sits above the air that blurs and absorbs starlight, which is why its pictures are the ones everyone has seen. Five shuttle crews visited it to replace instruments and gyroscopes, the first to correct a flaw in its mirror that had left it short-sighted; no vehicle flying can reach it now. It is faint but findable by eye on a dark night.",
    url: "https://science.nasa.gov/mission/hubble/"
  },
  25867: {
    id: "chandra",
    text: "Chandra, NASA's X-ray observatory since 1999, on an orbit that swings a third of the way to the Moon. It images gas at millions of degrees — matter falling into black holes, and the hot haze filling galaxy clusters. X-rays cannot be focused by a normal mirror, so its optics are nested barrels of glass that the light grazes at a shallow angle, like a stone skipping on water. Its orbit takes it far outside the Earth's radiation belts, where it can observe uninterrupted for two days at a stretch.",
    url: "https://chandra.harvard.edu/"
  },
  25989: {
    id: "xmmNewton",
    text: "XMM-Newton, ESA's X-ray observatory since 1999, carrying the largest X-ray collecting area ever flown. Its long elliptical orbit lets it stare at one faint source for the better part of two days at a time. Where Chandra was built for the sharpest possible image, this one was built to gather the most light, and the two have worked as a pair for a quarter of a century. It also carries a small conventional telescope, so the same object can be seen in X-rays and in visible light at once.",
    url: "https://www.cosmos.esa.int/web/xmm-newton"
  },
  28485: {
    id: "swift",
    text: "Swift, NASA's gamma-ray burst hunter. It detects a burst — the collapse of a massive star, or two neutron stars merging — and turns its telescopes onto it within about a minute, before the afterglow fades. The whole spacecraft slews to do it, which is where the name comes from. It then alerts observatories on the ground within seconds, so that telescopes everywhere can be pointed at an explosion that was billions of light years away and is already dying.",
    url: "https://swift.gsfc.nasa.gov/"
  },
  38358: {
    id: "nustar",
    text: "NuSTAR, the first telescope to focus hard X-rays rather than merely count them. Doing so needs a 10 m focal length, so the mast between its optics and its detectors was unfolded once it reached orbit. That focusing is what lets it pick one black hole out of a crowded galactic centre instead of recording a smear, and it has used it to find black holes hidden behind so much dust that no other instrument could see them.",
    url: "https://www.nustar.caltech.edu/"
  },
  42758: {
    id: "hxmt",
    text: "Insight-HXMT, called Huiyan, China's first X-ray astronomy satellite, launched in 2017 and run by the Institute of High Energy Physics. It scans the plane of the Milky Way for black holes and neutron stars, building a census of the compact objects our galaxy is full of. Its detectors cover an unusually wide range of energies for one spacecraft, and it has doubled as a gamma-ray burst monitor — including for events first spotted by gravitational-wave detectors on the ground.",
    url: "http://english.ihep.cas.cn/"
  },
  44874: {
    id: "cheops",
    text: "CHEOPS, an ESA and Swiss-led photometer that measures how much a known planet dims its own star as it crosses it. That dip gives the planet's size, and with its mass, whether it is rock, ice or gas. It does not hunt for new planets: it is pointed at ones already found, to measure them properly. The dimming it has to detect is often less than a hundredth of a percent — the equivalent of noticing a moth cross a floodlight from a mile away.",
    url: "https://www.esa.int/Science_Exploration/Space_Science/Cheops"
  },
  49954: {
    id: "ixpe",
    text: "IXPE, flown by NASA and the Italian space agency since 2021. It measures the polarisation of X-rays, which carries the geometry of what emitted them — the shape of the flow around a black hole. Brightness and colour say how much energy is coming out; polarisation says what shape the thing producing it is, which no other X-ray measurement can reach. It was the first mission built to do this since a brief experiment in the 1970s.",
    url: "https://ixpe.msfc.nasa.gov/"
  },
  58753: {
    id: "einsteinProbe",
    text: "Einstein Probe, a Chinese Academy of Sciences mission with ESA and MPE, launched in 2024. Its lobster-eye optics watch a tenth of the sky at once for X-ray flares that appear and fade within hours. The design copies the eye of a lobster, which focuses by reflection off a grid of tiny square channels rather than by bending light — the only practical way to keep a very wide field and still form an image in X-rays. It is built to catch the events nobody was looking at.",
    url: "https://www.cosmos.esa.int/web/einstein-probe"
  },
  60089: {
    id: "svom",
    text: "SVOM, a French-Chinese mission launched in 2024 to catch gamma-ray bursts and point ground telescopes at them within minutes — including the oldest bursts, from the first billion years of the universe. Its instruments were chosen to be sensitive to the faint, soft bursts that come from the greatest distances, and a dedicated network of small robotic telescopes on the ground responds to its alerts automatically, often while the burst is still going.",
    url: "https://www.svom.eu/"
  }
} as const satisfies Record<number, BriefingEntry>;

/** A naming convention, and what everything answering to it is. */
type Family = {
  /** Tested against the upper-cased catalogue name. First match wins. */
  match: RegExp;
  briefing: BriefingEntry;
};

/**
 * The fleets, in the order they are tried.
 *
 * Ordered rather than keyed, because catalogue names overlap: `SES-` is a
 * fleet and `SENTINEL` is another, `TIANZHOU` is a freighter and `TIANHUI` is a
 * mapping satellite. The specific entries come before the general ones, and the
 * first match wins — the same rule `classifySatellite` runs on.
 *
 * Anchored where an operator's names begin with the fleet's name, unanchored
 * where they do not (`NAVSTAR 81 (USA 319)`). The entries are roughly in the
 * order of the categories they mostly fall into: visiting vehicles, navigation,
 * communications, Earth observation, then the odds and ends.
 */
const FAMILIES = [
  // ---- Visiting vehicles. Docked, these share the station's patch of sky,
  // which is exactly when someone taps a cluster and asks what they all are.
  {
    match: /^SOYUZ-MS/,
    briefing: {
      id: "soyuz",
      text: "A Soyuz: the Russian crew ferry, three seats up to the ISS and the same three back down. It stays docked for the crew's six months as their lifeboat, which is why it is here rather than in a hangar. The design first flew in 1967 and has been rebuilt many times over, and between 2011 and 2020 it was the only way anybody reached the station at all. It comes home under a parachute onto the steppe of Kazakhstan, braking with a burst of rockets in the last metre.",
      url: "https://www.roscosmos.ru/"
    }
  },
  {
    match: /^PROGRESS-MS/,
    briefing: {
      id: "progress",
      text: "A Progress freighter: the uncrewed Soyuz that carries fuel, water and food to the ISS. Its engines also push the whole station back up the few hundred metres a month the thin air up there drags it down. It docks automatically, is unloaded over the following months, and is then filled with rubbish and aimed at the Pacific to burn up — so the same spacecraft that brought the supplies takes the waste away.",
      url: "https://www.roscosmos.ru/"
    }
  },
  {
    match: /^(CREW DRAGON|CARGO DRAGON|DRAGON)/,
    briefing: {
      id: "dragon",
      text: "A SpaceX Dragon at the ISS, carrying either four astronauts or a few tonnes of cargo. It is the only vehicle flying that brings cargo back down intact instead of burning up on the way home, which is how experiments and broken hardware get back to a laboratory bench. The capsule is reused across missions, docks itself without the station's robot arm, and splashes down off the coast of Florida.",
      url: "https://www.spacex.com/vehicles/dragon/"
    }
  },
  {
    match: /^CYGNUS/,
    briefing: {
      id: "cygnus",
      text: "A Cygnus freighter, built by Northrop Grumman: a few tonnes of cargo up to the ISS, caught by the station's robot arm. It leaves loaded with rubbish and is deliberately burned up over the Pacific. Because it is destroyed anyway, it is often used for the experiments nobody wants aboard a crewed vehicle — deliberate fires are lit inside it after it undocks, to learn how flames behave in weightlessness.",
      url: "https://www.northropgrumman.com/space/cygnus-spacecraft"
    }
  },
  {
    match: /^STARLINER/,
    briefing: {
      id: "starliner",
      text: "Boeing's Starliner, a crew capsule for the ISS. Unusually, it comes home over land rather than water, slowed by parachutes and cushioned by airbags at touchdown in the American south-west. It was built alongside SpaceX's Dragon under the same NASA programme, on the principle that two independent vehicles mean a grounded one does not strand the station, and its development has been the longer and harder of the two.",
      url: "https://www.boeing.com/space/starliner"
    }
  },
  {
    match: /^SHENZHOU/,
    briefing: {
      id: "shenzhou",
      text: "A Shenzhou: China's crewed ferry, three taikonauts up to the Tiangong station and back. One is always docked while a crew is aboard, ready to bring them home in a hurry. It is descended from the Soyuz in layout but larger, and its orbital module can be left in orbit to keep working after the crew has gone home. China has flown crews on it since 2003, which made it the third country to launch people on its own.",
      url: "http://en.cmse.gov.cn/"
    }
  },
  {
    match: /^TIANZHOU/,
    briefing: {
      id: "tianzhou",
      text: "A Tianzhou freighter: propellant, food and equipment up to China's Tiangong station, uncrewed. Like the Russian Progress it also raises the station's orbit, and burns up when its work is done. It carries a notably large load for its size — several tonnes — and docks itself within a few hours of launch, so supplies can be sent up quickly when a crew needs them.",
      url: "http://en.cmse.gov.cn/"
    }
  },

  // ---- Navigation. Four global systems and three regional ones; every one of
  // them is the reason the phone doing the asking knows where it is.
  {
    match: /GPS|NAVSTAR/,
    briefing: {
      id: "gps",
      text: "One of the ~31 GPS satellites, run by the US Space Force from 20,200 km up. It broadcasts nothing but the time, from an atomic clock, and where it was when it sent it; four of those signals at once are what give this phone its position. The system has been open to civilians since the 1980s and fully so since 2000, and the clocks aboard have to be corrected for relativity — they run measurably faster up there than on the ground.",
      url: "https://www.gps.gov/"
    }
  },
  {
    match: /GALILEO/,
    briefing: {
      id: "galileo",
      text: "One of Galileo's satellites, the European Union's own navigation system and the only civil-run one. Your phone almost certainly uses it alongside GPS: together they give a better fix than either alone, because more satellites in view means fewer of them hidden behind buildings. It was built so that Europe would not depend on a system run by someone else's military, and its open service is free to anyone.",
      url: "https://www.gsc-europa.eu/"
    }
  },
  {
    match: /GLONASS/,
    briefing: {
      id: "glonass",
      text: "A GLONASS satellite, Russia's global navigation system, flying since the 1980s. Its orbits are steeply inclined, which is what makes it the system that works best at high northern latitudes — the reason it exists, given where Russia is. It nearly collapsed in the 1990s when satellites failed faster than they could be replaced, and was rebuilt to full strength in the following decade. Most modern phone chipsets listen to it as a matter of course.",
      url: "https://glonass-iac.ru/en/"
    }
  },
  {
    match: /BEIDOU/,
    briefing: {
      id: "beidou",
      text: "A BeiDou satellite, China's global navigation system, completed in 2020. Unusually, part of the constellation is parked over Asia rather than orbiting, and it can carry short text messages as well as the time. That messaging service is used by fishing fleets in the South China Sea, where there is no phone signal, and it means the system can hear from a receiver as well as talk to it — which no other navigation system does.",
      url: "http://en.beidou.gov.cn/"
    }
  },
  {
    match: /QZSS|MICHIBIKI/,
    briefing: {
      id: "qzss",
      text: "A Michibiki satellite of Japan's QZSS, on a figure-of-eight track that keeps one of them almost overhead Japan at all times — so GPS keeps working between the tower blocks of central Tokyo. In a narrow street, satellites low in the sky are behind the buildings; one directly above is not. It is a supplement rather than a rival to GPS, and it also broadcasts disaster warnings to receivers on the ground.",
      url: "https://qzss.go.jp/en/"
    }
  },
  {
    match: /IRNSS|NAVIC/,
    briefing: {
      id: "navic",
      text: "A NavIC satellite, India's own regional navigation system, run by ISRO. Seven satellites over the Indian Ocean give India and 1,500 km around it a position that does not depend on anybody else's system. It was begun after Indian forces were reportedly refused GPS precision during a border conflict, and it is now built into an increasing number of phones sold in India.",
      url: "https://www.isro.gov.in/"
    }
  },
  {
    match: /CENTISPACE/,
    briefing: {
      id: "centispace",
      text: "A CentiSpace satellite: a Chinese commercial fleet in low orbit that sharpens existing navigation signals rather than replacing them, pulling GPS and BeiDou fixes towards the centimetre. Being much closer to the ground than the navigation satellites themselves, its signals are stronger and change angle quickly, which lets a receiver resolve the last ambiguities in a fix in seconds instead of minutes. The main customer is self-driving cars."
    }
  },

  // ---- Communications: the bulk of the catalogue, and most of what is
  // overhead at any moment.
  {
    match: /^STARLINK/,
    briefing: {
      id: "starlink",
      text: "A Starlink: one of the thousands SpaceX flies at around 550 km to sell broadband to a dish on a roof. They are far and away the most numerous objects in this sky, and the string of lights people see after a launch. Each is a flat panel about the size of a dining table, and it talks to its neighbours by laser so traffic can cross an ocean without touching the ground. They are deliberately flown low enough that a dead one falls out of orbit and burns up within a few years.",
      url: "https://www.starlink.com/"
    }
  },
  {
    match: /^ONEWEB/,
    briefing: {
      id: "oneweb",
      text: "A OneWeb satellite, now flown by Eutelsat: about 650 of them at 1,200 km, selling broadband wholesale to phone networks, airlines and ships rather than direct to homes. The higher orbit means fewer satellites are needed to cover the globe, at the cost of a longer round trip for the signal. The company went bankrupt in 2020 mid-deployment, was rescued by the British government and Indian investors, and then merged with its European rival.",
      url: "https://oneweb.net/"
    }
  },
  {
    match: /KUIPER/,
    briefing: {
      id: "kuiper",
      text: "One of Amazon's broadband satellites, the constellation begun as Project Kuiper: thousands planned in low orbit, sold to homes and businesses as a rival to Starlink. The commercial bet behind it is the ground segment rather than the sky — cheap customer terminals, and a network that plugs straight into Amazon's own data centres. Its satellites carry a coating designed to keep them fainter than the first Starlinks, after astronomers objected to those."
    }
  },
  {
    match: /QIANFAN|SPACESAIL/,
    briefing: {
      id: "qianfan",
      text: "A Qianfan — \"Thousand Sails\" — satellite, Shanghai's commercial broadband constellation and China's nearest answer to Starlink. More than ten thousand are planned, and the first of them arrived brighter than astronomers had hoped: they are among the more conspicuous new objects in this sky. The operator has said it is working on mitigations, but nothing comparable to Starlink's visors and darkening film has flown yet."
    }
  },
  {
    match: /GUOWANG|HULIANWANG/,
    briefing: {
      id: "guowang",
      text: "A satellite of Guowang, the Chinese state's own broadband constellation, run by SatNet. It is the national counterpart to Starlink rather than a commercial venture, with some thirteen thousand satellites filed for and a deployment that began in earnest in 2024. Very little about it is published — orbits and launch counts are known, capability is not — which is unusual for a system of this size."
    }
  },
  {
    match: /^IRIDIUM/,
    briefing: {
      id: "iridium",
      text: "An Iridium satellite: 66 of them, linked to each other by radio so a call can hop across the constellation. That is why an Iridium phone works in the middle of an ocean with no ground station anywhere near. The original fleet's polished antennas produced the famous \"Iridium flares\", brief flashes brighter than any star; the replacements that flew in 2017-19 are flat and do not flare. The first company went bankrupt in 1999 and was bought for a fraction of what it cost to build.",
      url: "https://www.iridium.com/"
    }
  },
  {
    match: /GLOBALSTAR/,
    briefing: {
      id: "globalstar",
      text: "A Globalstar satellite, carrying satellite phones, trackers and — since 2022 — the emergency SOS messages an iPhone sends when there is no mobile signal. Unlike Iridium its satellites do not talk to each other: each one simply relays to a ground station, so it works where a gateway is in view. Apple's deal to use the network paid for most of the current generation of satellites.",
      url: "https://www.globalstar.com/"
    }
  },
  {
    match: /ORBCOMM/,
    briefing: {
      id: "orbcomm",
      text: "An Orbcomm satellite: short machine-to-machine messages rather than voice or video — lorry fleets, shipping containers, pipeline valves and remote tanks reporting in. The messages are a few dozen bytes and may take minutes to get through, which is fine for something that only needs to say where it is and that it is still working. It was one of the first commercial low-orbit constellations, flying since the 1990s.",
      url: "https://www.orbcomm.com/"
    }
  },
  {
    match: /^(SES-|O3B|ASTRA \d)/,
    briefing: {
      id: "ses",
      text: "An SES satellite, from Luxembourg: the Astra fleet carries television across Europe from the geostationary belt, while the O3b craft circle much lower over the equator to cut the delay for data. \"O3b\" stood for the other three billion — the people without a fixed connection — and that half of the fleet is aimed at islands, ships and remote regions where a cable is not coming.",
      url: "https://www.ses.com/"
    }
  },
  {
    match: /^(INTELSAT|GALAXY)/,
    briefing: {
      id: "intelsat",
      text: "An Intelsat satellite, from the oldest fleet in the business — it began in 1964 as the international consortium that carried the first live television between continents, including the Apollo 11 landing. It was privatised in 2001, has swallowed several rivals since, and its satellites still relay broadcast feeds, in-flight connectivity and government traffic from the geostationary belt.",
      url: "https://www.intelsat.com/"
    }
  },
  {
    match: /^(EUTELSAT|HOTBIRD)/,
    briefing: {
      id: "eutelsat",
      text: "A Eutelsat satellite. The Hot Bird craft at 13° East carry a thousand television channels into dishes across Europe, the Middle East and North Africa — which is why so many roofs in those regions are pointed at the same patch of sky. Eutelsat merged with OneWeb in 2023, making it the only operator flying both a geostationary fleet and a low-orbit constellation.",
      url: "https://www.eutelsat.com/"
    }
  },
  {
    match: /^(VIASAT|INMARSAT)/,
    briefing: {
      id: "viasat",
      text: "A Viasat satellite — the company now includes Inmarsat, whose fleet has carried ships' distress calls since the 1980s. Between them they cover in-flight wi-fi, maritime and government communications from the geostationary belt. Inmarsat's satellites are part of the international distress system, which is why a merchant vessel anywhere in the world can raise help without any other infrastructure.",
      url: "https://www.viasat.com/"
    }
  },
  {
    match: /^(ECHOSTAR|DIRECTV)/,
    briefing: {
      id: "echostar",
      text: "An EchoStar or DirecTV satellite: American direct-to-home television, beamed from the geostationary belt to the small dishes bolted to houses across the United States. One satellite covers the whole country at once, which is what made national subscription television possible without laying any cable — and the business it built is now steadily giving ground to streaming.",
      url: "https://www.echostar.com/"
    }
  },
  {
    match: /^(TELESAT|LIGHTSPEED)/,
    briefing: {
      id: "telesat",
      text: "A Telesat satellite, from the Canadian operator that flew the world's first domestic communications satellite in 1972 — television and broadband to a country too large and too thinly settled to wire. It is now building Lightspeed, a low-orbit constellation aimed at business and government customers rather than households, which is a different bet from Starlink's.",
      url: "https://www.telesat.com/"
    }
  },
  {
    match: /^(SPACEMOBILE|BLUEBIRD|BW3)/,
    briefing: {
      id: "spacemobile",
      text: "An AST SpaceMobile satellite: an antenna the size of a tennis court, aiming to talk to an ordinary unmodified mobile phone on the ground. The antenna has to be that big because the phone's is tiny and its transmitter is weak — the satellite has to do all the hard listening. Unfolded in orbit, these are among the largest commercial satellites flying, and bright enough that astronomers have raised the alarm about them by name.",
      url: "https://ast-science.com/"
    }
  },
  {
    match: /^LYNK/,
    briefing: {
      id: "lynk",
      text: "A Lynk satellite, doing what a mobile mast does but from orbit: a normal phone sees it as a network and can send a text through it from anywhere with a clear view of the sky. The satellites are small, so the service starts with text messages rather than calls or data — enough to say you are safe, or to receive an evacuation warning where the masts are down or were never built.",
      url: "https://lynk.world/"
    }
  },
  {
    match: /^KINEIS/,
    briefing: {
      id: "kineis",
      text: "A Kinéis satellite, the French successor to the Argos system that has tracked tagged animals, buoys and fishing boats since the 1970s. Argos is why we know the migration routes of albatrosses and turtles: a tag small enough for a bird reports its position for years. The new constellation extends the same service to industrial sensors, while keeping the wildlife and ocean work that gave it its name.",
      url: "https://www.kineis.com/"
    }
  },
  {
    match: /^ASTROCAST/,
    briefing: {
      id: "astrocast",
      text: "An Astrocast nanosatellite, a Swiss fleet carrying small bursts of data from sensors that are nowhere near a network: pipelines, buoys, farm equipment, livestock. The satellite passes overhead a few times a day, collects what the sensors have queued up and drops it at a ground station — which is all that is needed when the message is a temperature or a position rather than a video.",
      url: "https://www.astrocast.com/"
    }
  },
  {
    match: /^(SWARM|SPACEBEE)/,
    briefing: {
      id: "spacebee",
      text: "A SpaceBEE, flown by Swarm and now owned by SpaceX: a satellite the size of a slice of bread, relaying tiny, cheap machine messages from sensors in places with no network. The company became notorious in 2018 for launching its first four without regulatory approval, having been told they were too small to be tracked reliably — a decision that helped tighten the rules for everyone."
    }
  },
  {
    match: /^(GONETS|YAMAL|EXPRESS-|MERIDIAN)/,
    briefing: {
      id: "russianComms",
      text: "A Russian communications satellite. Yamal and Express carry television and telephony from the geostationary belt; Gonets and Meridian serve the far north, where a satellite parked over the equator sits too low on the horizon to be useful. The Meridian craft fly the steeply inclined Molniya orbit invented for exactly that problem — slow and high over Siberia, fast and low over the southern hemisphere."
    }
  },
  {
    match: /^(CHINASAT|ZHONGXING|APSTAR|TIANLIAN|TIANTONG)/,
    briefing: {
      id: "chineseComms",
      text: "A Chinese communications satellite: ChinaSat and APStar carry television and telephony across Asia, Tiantong serves handheld satellite phones, and others relay data for the country's own spacecraft. Tiantong is the reason some Chinese-market phones can place a satellite call with no external antenna at all — a capability that reached consumer handsets there before it did anywhere else."
    }
  },
  {
    match: /^(SKYNET|WGS|MUOS|SICRAL|SYRACUSE|AEHF|MILSTAR|UFO )/,
    briefing: {
      id: "militaryComms",
      text: "A military communications satellite — British Skynet, American WGS, MUOS and UFO, Italian Sicral or French Syracuse. Same job as a civil telecommunications satellite, with hardened, encrypted and jam-resistant links, and deliberately little said about what it can do. Skynet has been flying since 1969, which makes it one of the longest-running satellite programmes anywhere."
    }
  },
  {
    match: /^(PRAETORIAN|SDA_)/,
    briefing: {
      id: "sda",
      text: "A satellite of the US Space Development Agency's Proliferated Warfighter Space Architecture: hundreds of small craft in low orbit, replacing a handful of large expensive ones. The reasoning is that a constellation of many cheap satellites is far harder to disable than a few valuable ones, and that each generation can be replaced every few years as the technology moves. They are linked by laser into a mesh across orbit."
    }
  },
  {
    match: /^(SBIRS|DSP )/,
    briefing: {
      id: "earlyWarning",
      text: "An American missile early-warning satellite. It stares at the Earth in the infrared from the geostationary belt, watching for the heat of a rocket launch, and has done since the 1970s. The same sensors detect large meteors entering the atmosphere, which is how some fireballs are recorded with a precision no ground observer could manage — a by-product the scientific community is quietly given access to."
    }
  },
  {
    match: /^TJS/,
    briefing: {
      id: "tjs",
      text: "A TJS satellite — officially a Chinese \"communications technology experiment\", parked in the geostationary belt. Western analysts read the series as early warning, signals intelligence and inspection of other satellites, on the grounds that the stated purpose does not match the orbits or the manoeuvring. Some have been observed moving close to other countries' satellites, which a communications experiment has no reason to do."
    }
  },
  {
    match: /^TDRS/,
    briefing: {
      id: "tdrs",
      text: "A NASA Tracking and Data Relay Satellite: it does not look at anything. Parked over the equator, it relays the ISS's and Hubble's data down to the ground so they do not have to wait to fly over a ground station. Before the system existed, a spacecraft in low orbit could talk to the ground for only a few minutes per orbit; with it, the station has a near-continuous link and live television from orbit became possible.",
      url: "https://www.nasa.gov/"
    }
  },
  {
    match: /^(TIANQI|HEAD-|APRIZESAT|CONNECTA)/,
    briefing: {
      id: "machineRelay",
      text: "A commercial machine-data relay satellite: no camera, just short reports from buoys, containers, meters and farm equipment far from any network. These constellations are built around cost rather than capability — a terminal cheap enough to leave on a water pump for a decade, and a satellite small enough to launch dozens at a time as a rideshare."
    }
  },
  {
    match: /^RASSVET/,
    briefing: {
      id: "rassvet",
      text: "A Rassvet satellite: the demonstration batch for Bureau 1440's planned Russian low-orbit broadband constellation, the domestic answer to Starlink. A few hundred satellites are proposed. The first ones went up in 2023 to prove the hardware, and the programme's scale and schedule depend heavily on funding and on access to components that sanctions have made harder to obtain."
    }
  },
  {
    match: /^(GEESAT|GEELY)/,
    briefing: {
      id: "geespace",
      text: "A Geespace satellite, flown by the Chinese carmaker Geely: a low-orbit fleet selling positioning corrections and connectivity to vehicles — the company's own cars first. It is one of the few constellations built by a manufacturer for its own products rather than sold as a service, and the satellites are made on a production line at a plant designed to turn out hundreds a year."
    }
  },
  {
    match:
      /^(GSAT|JCSAT|OPTUS|KOREASAT|THAICOM|VINASAT|PALAPA|MEASAT|NILESAT|ARABSAT|TURKSAT|HISPASAT|AMOS-|BADR|AZERSPACE|ANGOSAT|NIGCOMSAT|RASCOM|ANIK|TELSTAR|BSAT|SUPERBIRD|ABS-|BELINTERSAT|NSS-|ASIASAT|AMAZONAS|NIMIQ|SXM|STAR ONE|LUCH|KORSAT|SAUDICOMSAT|THURAYA|HELLAS-SAT|HYLAS|THOR |AMC-|INSAT|APSTAR)/,
    briefing: {
      id: "regionalComms",
      text: "A national or regional communications satellite, parked over the equator so it holds still above the country that flies it — television, telephony and broadband for one nation or one region. Many are bought as a turnkey package from a European, American or Chinese manufacturer, which is how a country can have a satellite without having a space industry."
    }
  },

  // ---- Earth observation: everything pointed back down.
  {
    match: /^(LEGION|WORLDVIEW|GEOEYE|QUICKBIRD)/,
    briefing: {
      id: "maxar",
      text: "A Maxar imaging satellite — the WorldView and Legion craft: among the sharpest commercial optical imaging sold, and enough of them to revisit the same place several times a day. Their pictures are the ones behind most satellite views of news events, and the resolution they are allowed to sell is set by regulation rather than by the optics. The same company built much of the hardware behind the world's geostationary fleets.",
      url: "https://www.maxar.com/"
    }
  },
  {
    match: /^(HAWK|BRO-|UNSEENLABS)/,
    briefing: {
      id: "rfRecon",
      text: "A radio-frequency reconnaissance satellite: a receiver rather than a camera. Flying in trios, it locates a transmitter by the fraction of a second between its signal reaching each of them — the same trick GPS uses, run backwards. It is used to find ships that have switched off their AIS transponders, to map radar and jamming, and to catch interference with satellite signals."
    }
  },
  {
    match: /^(SITRO-AIS|AIS-|EXACTVIEW|NORSAT)/,
    briefing: {
      id: "aisTracking",
      text: "A ship-tracking satellite: it listens for the AIS transponders merchant vessels broadcast, giving coverage of the open ocean where no coastal receiver can hear. AIS was designed for collision avoidance between ships within sight of each other, and picking it up from orbit turned it into a global record of who is sailing where — used for safety, for sanctions enforcement and for spotting illegal fishing."
    }
  },
  {
    match: /^GLOBAL-/,
    briefing: {
      id: "satellogicGlobal",
      text: "A Satellogic imaging satellite, built in Argentina: sub-metre optical and hyperspectral pictures, flown as a fleet cheap enough to photograph large areas repeatedly rather than a few places carefully. Hyperspectral means splitting the light into many narrow bands, which tells crops apart, finds mineral signatures and picks up pollution that a normal colour image would miss.",
      url: "https://satellogic.com/"
    }
  },
  {
    match: /^(KOMPSAT|ARIRANG|CAS500)/,
    briefing: {
      id: "koreanEo",
      text: "A South Korean Earth-observation satellite: the Arirang/KOMPSAT series and the newer CAS500 craft, carrying optical and radar imaging for mapping, agriculture and disaster response. The programme began with foreign help in the 1990s and is now largely domestic, and some of the newer satellites are built to a common bus that universities and companies can order their own payload on."
    }
  },
  {
    match: /^IRIDE/,
    briefing: {
      id: "iride",
      text: "An IRIDE satellite, Italy's Earth-observation constellation built with ESA: radar and optical imaging for civil protection, land monitoring and coastal work. It is funded from the country's post-pandemic recovery plan and is meant to be an end-to-end national capability — satellites, ground segment and the services built on top — rather than a single spacecraft.",
      url: "https://www.esa.int/"
    }
  },
  {
    match: /^(COSMO-SKYMED|CSG-|PLEIADES|SPOT |PAZ|PROBA|DEIMOS|VENUS|THEOS)/,
    briefing: {
      id: "europeanImaging",
      text: "A European imaging satellite: Italy's Cosmo-SkyMed radar, France's Pléiades and SPOT optical craft, Spain's PAZ. National programmes serving both civil and defence users, usually with the same spacecraft — a picture of a flood and a picture of an airfield are taken by identical hardware, and the arrangement is what makes the cost bearable for a single country."
    }
  },
  {
    match: /^(CYGFM|FORMOSAT|COSMIC)/,
    briefing: {
      id: "radioOccultation",
      text: "A satellite that measures the atmosphere and ocean using signals meant for something else: GPS transmissions bent by the air, or bounced off the sea. The bending reveals temperature and humidity through the whole depth of the atmosphere, which feeds directly into weather forecasts; the reflections give wave height and wind, including inside hurricanes. It is one of the cheapest useful things a small satellite can do."
    }
  },
  {
    match: /^(FOREST|FIRESAT|WILDFIRE|OROR)/,
    briefing: {
      id: "wildfire",
      text: "A wildfire-detection satellite. Its infrared camera looks for the heat signature of a new fire while it is still small, and reports it in minutes rather than hours. The difference matters enormously: a fire caught in its first hour can be dealt with by a single crew, and the same fire six hours later cannot be dealt with at all. Several of these constellations are funded by charities and insurers rather than governments."
    }
  },
  {
    match: /^HERMES-/,
    briefing: {
      id: "hermes",
      text: "A HERMES nanosatellite, an Italian-led experiment: a swarm of shoebox-sized detectors that catch gamma-ray bursts and locate them by comparing arrival times across the swarm. No single one of them could say where a burst came from; several of them, seconds apart, can. It is a test of whether cheap distributed spacecraft can do a job that has always needed one large observatory."
    }
  },
  {
    match: /^(CENTAURI|SKYKRAFT|SATELIOT|LACUNA|MYRIOTA|EYE-|TYVAK)/,
    briefing: {
      id: "commercialNano",
      text: "A commercial nanosatellite fleet: sensor data from remote equipment, or in Skykraft's case air-traffic surveillance — the ADS-B position reports aircraft broadcast, picked up over oceans where radar cannot reach. Tracking aircraft over the open sea was a gap the industry lived with until satellites started listening, and the search for MH370 is often cited as what finally pushed it."
    }
  },
  {
    match: /^(FLOCK|DOVE|SKYSAT|PELICAN|TANAGER)/,
    briefing: {
      id: "planet",
      text: "A Planet satellite. The Dove and Flock craft are shoebox-sized and photograph the entire land surface of the Earth every day; SkySats are larger and take sharper pictures of specific places. Imaging everything daily rather than aiming at requests turns satellite imagery into a record you can look backwards through — which is how deforestation, construction and troop movements get noticed after the fact.",
      url: "https://www.planet.com/"
    }
  },
  {
    match: /^LEMUR/,
    briefing: {
      id: "lemur",
      text: "A Spire Lemur cubesat. It listens rather than looks: ship and aircraft transponders, and the way GPS signals bend through the atmosphere, which gives temperature and humidity profiles for weather forecasting. One small satellite carrying three unrelated instruments is the economics of the thing — the fleet is built and operated as a data business rather than sold as hardware.",
      url: "https://www.spire.com/"
    }
  },
  {
    match: /^ICEYE/,
    briefing: {
      id: "iceye",
      text: "An ICEYE radar satellite, from Finland. Radar rather than a camera, so it images through cloud and in darkness — which is what floods, oil spills and Arctic ice actually need, since all three tend to happen in bad weather at high latitudes. The company's achievement was shrinking synthetic aperture radar, previously a large and very expensive instrument, onto a satellite of about a hundred kilograms.",
      url: "https://www.iceye.com/"
    }
  },
  {
    match: /^CAPELLA/,
    briefing: {
      id: "capella",
      text: "A Capella radar satellite: a folded reflector antenna on a small spacecraft, imaging metre-scale detail through cloud and at night. Synthetic aperture radar builds a sharp image by combining echoes gathered along the satellite's own track, which is how an antenna a few metres across can resolve what would otherwise need one hundreds of metres long.",
      url: "https://www.capellaspace.com/"
    }
  },
  {
    match: /^UMBRA/,
    briefing: {
      id: "umbra",
      text: "An Umbra radar satellite — among the sharpest commercially sold, at around 16 cm. Radar sees through weather, so it is bought for the days when optical satellites see nothing but cloud. The company was also unusual in releasing a large archive of its imagery openly for researchers to work with, which had not really been done at this resolution before.",
      url: "https://umbra.space/"
    }
  },
  {
    match: /^BLACKSKY/,
    briefing: {
      id: "blacksky",
      text: "A BlackSky imaging satellite, built around revisit rather than resolution: enough of them in orbit to photograph the same place several times a day, and deliver the picture within an hour or so. For a lot of questions — is the ship still there, has the queue at the border grown — knowing quickly matters more than seeing finely, and that is the trade this fleet makes.",
      url: "https://www.blacksky.com/"
    }
  },
  {
    match: /^SENTINEL/,
    briefing: {
      id: "sentinel",
      text: "A Copernicus Sentinel, flown by ESA for the European Union. Radar, optical and atmospheric instruments watching land, ocean, ice and air, and every image is published free for anyone to use. That open policy is the unusual part: Sentinel data underpins a large share of the world's environmental monitoring precisely because nobody has to ask permission or pay for it.",
      url: "https://sentinels.copernicus.eu/"
    }
  },
  {
    match: /^(NOAA|GOES|SUOMI|JPSS|NOAA-)/,
    briefing: {
      id: "noaa",
      text: "An American weather satellite run by NOAA. The GOES craft hold station over the Americas and take the pictures on the forecast; the polar ones circle pole to pole, crossing the equator at the same local time each day so their measurements can be compared. Between them they are the reason a hurricane is watched continuously from formation to landfall.",
      url: "https://www.nesdis.noaa.gov/"
    }
  },
  {
    match: /^(METOP|METEOSAT|MSG-)/,
    briefing: {
      id: "eumetsat",
      text: "A European weather satellite operated by EUMETSAT: Meteosat parked over Africa for the half-hourly disc of cloud, MetOp in polar orbit for the vertical soundings that numerical forecasting actually runs on. The pictures are what people recognise, but the polar soundings are what most improve a forecast — they give the temperature and humidity of the atmosphere layer by layer.",
      url: "https://www.eumetsat.int/"
    }
  },
  {
    match: /^LANDSAT/,
    briefing: {
      id: "landsat",
      text: "A Landsat, NASA and the US Geological Survey: the longest continuous record of the Earth's land surface there is, unbroken since 1972. That half-century of consistent imagery is what makes it possible to say how a glacier, a forest or a city has actually changed rather than how it looks today. The whole archive was opened free of charge in 2008, and use of it multiplied overnight.",
      url: "https://landsat.gsfc.nasa.gov/"
    }
  },
  {
    match: /^(TERRA|AQUA|AURA)\b/,
    briefing: {
      id: "eos",
      text: "One of NASA's Earth Observing System flagships, flying since around 2000. Between them they map cloud, fire, vegetation, sea surface temperature and aerosols daily, and most of them have outlived their design life several times over. The daily global picture they established is the baseline that later missions are compared against, which is why they have been kept flying so long past their planned retirement.",
      url: "https://science.nasa.gov/earth/"
    }
  },
  {
    match: /^(MMS |THEMIS|VAN ALLEN|GOLD|ICON|TIMED|AIM |SDO|ACE |WIND|GEOTAIL|CLUSTER)/,
    briefing: {
      id: "heliophysics",
      text: "A space-physics satellite. It measures the magnetic field and charged particles around the Earth rather than the ground below — the environment that produces aurorae, disturbs radio and can damage satellites and power grids during a solar storm. Several fly in tight formation, because the structures they are measuring are invisible and can only be mapped by sampling them from several points at once.",
      url: "https://science.nasa.gov/heliophysics/"
    }
  },
  {
    match: /^(GRACE|ICESAT|SWOT|CALIPSO|CLOUDSAT|SMAP|PACE|NISAR)/,
    briefing: {
      id: "nasaEarthScience",
      text: "A NASA Earth-science satellite, each built around a single measurement: the height of the ice, the water on the land, the salt in the sea, the carbon dioxide in the air. Missions like these are how a global number — sea level, ice mass, atmospheric CO2 — stops being an estimate and becomes something measured, which is the whole basis of the climate record.",
      url: "https://science.nasa.gov/earth/"
    }
  },
  {
    match: /^FENGYUN/,
    briefing: {
      id: "fengyun",
      text: "A Fengyun satellite, China's weather fleet, run by the China Meteorological Administration — some parked over Asia, some in polar orbit. Its data is shared internationally through the World Meteorological Organization, as weather data generally is: forecasting is one of the few fields where nearly every country hands over its measurements to everyone else as a matter of course."
    }
  },
  {
    match:
      /^(GAOFEN|ZIYUAN|HAIYANG|TIANHUI|JILIN|CHUANGXIN|SUPERVIEW|ZHUHAI|PIESAT|NINGXIA|YUNYAO|DONGPO|HEAD|GJZ|HJS|SCS-)/,
    briefing: {
      id: "chineseRemoteSensing",
      text: "A Chinese remote-sensing satellite, state or commercial: high-resolution land imaging (Gaofen, Ziyuan, Jilin, SuperView), ocean colour, or agricultural and disaster monitoring. China now launches more Earth-observation satellites than anyone else, and the Jilin constellation in particular is being built towards hundreds of craft aimed at imaging anywhere on Earth within minutes of a request."
    }
  },
  {
    match: /^YAOGAN/,
    briefing: {
      id: "yaogan",
      text: "A Yaogan satellite. The name is a generic Chinese label for \"remote sensing\", applied to a long series widely understood to be military reconnaissance — optical, radar and radio-intelligence craft, some flying in trios that locate ships by the timing of their radio emissions. Almost nothing is officially said about any individual satellite in the series."
    }
  },
  {
    match: /^(SHIYAN|SHIJIAN|SJ-|TIANYI|TIANMU|TIANPING|YUNHAI|CHECKMATE|AETHER)/,
    briefing: {
      id: "chineseExperimental",
      text: "A Chinese experimental or technology-demonstration satellite. These series carry new instruments and techniques rather than an operational service — testing hardware that may later fly on something else. Some have been genuinely novel: the Mozi satellite in this family demonstrated quantum key distribution from orbit, which had never been done before."
    }
  },
  {
    match: /^(RESURS|KANOPUS|METEOR-M|ELEKTRO|ARKTIKA|IONOSFERA|OBZOR)/,
    briefing: {
      id: "russianEo",
      text: "A Russian Earth-observation satellite: Resurs and Kanopus image the land, Meteor-M and Elektro do the weather, and Arktika flies a highly elliptical orbit to keep watch over the Arctic, which a geostationary satellite cannot see properly. That Arctic orbit is the interesting part — it is the same Molniya trick used for northern communications, applied to weather."
    }
  },
  {
    match: /^(CARTOSAT|RISAT|RESOURCESAT|OCEANSAT|EOS-|SCATSAT)/,
    briefing: {
      id: "isroEo",
      text: "An Indian Earth-observation satellite from ISRO: Cartosat for mapping, RISAT's radar for imaging through monsoon cloud, Resourcesat and Oceansat for crops, forests and the sea. The programme is unusually oriented towards domestic practical use — irrigation planning, fishing forecasts, groundwater and disaster warning — rather than towards selling imagery.",
      url: "https://www.isro.gov.in/"
    }
  },
  {
    match: /^(QPS-SAR|STRIX|GRUS|ALE-)/,
    briefing: {
      id: "japaneseCommercial",
      text: "A Japanese commercial small satellite: the QPS-SAR and Strix craft carry radar that sees through cloud, and the Grus fleet takes optical pictures. QPS-SAR's distinguishing feature is an antenna that folds out from a very small satellite into a dish several metres across, which is what lets a spacecraft of that size do radar imaging at all."
    }
  },
  {
    match: /^(GHGSAT|TOMORROW|MUON|SATELLOGIC|NUSAT|CARBON|METHANESAT)/,
    briefing: {
      id: "environmentalMonitoring",
      text: "A commercial environmental-monitoring satellite. GHGSat and MethaneSAT trace greenhouse gases back to the individual site leaking them — a specific well, pipeline or landfill, named rather than estimated. Methane is the target because it is a powerful greenhouse gas, leaks are often cheap to fix, and until these satellites flew nobody could prove who was responsible."
    }
  },
  {
    match: /^(DMSP|USA |NROL|KH-|LACROSSE|TOPAZ|ONYX)/,
    briefing: {
      id: "usMilitary",
      text: "An American military or intelligence satellite. \"USA\" is the designation given on launch and usually all that is officially said about it: the mission, the operator and often the orbit are classified. What is known about many of them comes from amateur satellite trackers, who follow them with binoculars and stopwatches and publish orbits the government does not."
    }
  },
  {
    match: /^COSMOS/,
    briefing: {
      id: "cosmos",
      text: "A Cosmos satellite — the blanket designation the Soviet Union and now Russia give to military and unannounced payloads. The numbering runs past 2,500 and covers everything from navigation and early warning to targets and debris; the name says nothing at all about what any individual one does. It has been in continuous use since 1962, which makes it the longest-running designation in orbit."
    }
  },

  // ---- The odds and ends, which are still worth a sentence.
  {
    match: /OBJECT\b/,
    briefing: {
      id: "rideshareObject",
      text: "An object catalogued from a rideshare launch but not yet publicly matched to its owner. Dozens of small satellites go up on one rocket, and it can take weeks of tracking before each is tied to the operator that flew it. Until then the catalogue names it after the launch — and a few never get identified at all, because nobody ever comes forward to claim them."
    }
  },
  {
    match: /^(CALSPHERE|LCS |SURCAL|TEMPSAT)/,
    briefing: {
      id: "calibrationSphere",
      text: "A calibration sphere from the 1960s: a metal ball with no power, no radio and nothing to do but be tracked, so that radars could be checked against an object of exactly known size and shape. They are among the oldest things still in orbit, and because they have no instruments to fail, they will go on being useful for as long as they stay up — which for some of them is centuries.",
      url: "https://www.space-track.org/"
    }
  },
  {
    match: /^(ETALON|LAGEOS|STARLETTE|STELLA|AJISAI|LARES)/,
    briefing: {
      id: "geodeticSphere",
      text: "A geodetic sphere covered in mirrors. It carries no instruments at all: ground stations bounce lasers off it, and the round trip measures the distance to within millimetres. Doing that from many stations over many years is how the shape of the Earth, the drift of the continents and the wobble of its rotation are actually measured. LAGEOS, launched in 1976, is expected to stay up for eight million years."
    }
  },
  {
    match: /^(YAM-|LOFT)/,
    briefing: {
      id: "loftOrbital",
      text: "A Loft Orbital satellite: one standard spacecraft carrying several unrelated customers' instruments at once, so an operator can buy a slot rather than build a satellite. It is the same idea as renting rack space in a data centre — the hard, expensive parts (power, pointing, radio, ground network) are provided, and the customer brings only the thing that makes their mission theirs.",
      url: "https://www.loftorbital.com/"
    }
  },
  {
    match: /^(ION SCV|VIGORIDE|SHERPA|OTV-|HELIOS|LAUNCHER ORBITER)/,
    briefing: {
      id: "spaceTug",
      text: "An orbital transfer vehicle — a space tug. It rides up with a batch of small satellites and then moves them, one at a time, into the particular orbits they each wanted. Rideshare launches are cheap because everyone goes to the same place; the tug is what lets a customer take the cheap ride and still end up somewhere else. Some are also being developed to refuel or move satellites already in orbit."
    }
  },
  {
    match: /^(AO-|SO-|FO-|CAS-|CAS |OSCAR|JAS-|RS-\d|HO-|LO-)/,
    briefing: {
      id: "amateurRadio",
      text: "An amateur radio satellite, built and operated by volunteers. It relays contacts between radio amateurs on the ground, and can usually be heard with a handheld set and a simple aerial — no dish, no subscription, nothing but a licence. The tradition goes back to OSCAR 1 in 1961, which made amateurs the fourth group in the world to put anything in orbit, and many of the satellites are built by students.",
      url: "https://www.amsat.org/"
    }
  },
  {
    match: /^(TEVEL|UNISAT|CUBEBUG|BIRDS|FOSSASAT|AEROCUBE|GEOSCAN)/,
    briefing: {
      id: "cubesat",
      text: "A cubesat: a satellite of a few standard 10 cm cubes, cheap enough for a university, a school programme or a small company. Most carry one experiment and a radio, and stay up for a few years before the air drags them down. The standard was defined in 1999 to give students something they could actually finish, and it ended up reshaping the whole industry by making orbit affordable."
    }
  }
] as const satisfies readonly Family[];

/**
 * What a category means, for everything no fleet or landmark claimed.
 *
 * The residual is genuinely long-tailed — some 780 naming conventions with a
 * handful of objects each — so the last word is the one the marker's colour was
 * already saying, stated in a sentence. Better than a blank space, and it does
 * not pretend to know more than the catalogue does.
 */
const CATEGORY_BRIEFINGS = {
  LANDMARK: {
    id: "category.LANDMARK",
    text: "One of the handful of objects worth going outside for: a crewed station, a visiting vehicle, or one of the great observatories. These are the few that are bright enough, large enough or famous enough that seeing the light move across the sky means something."
  },
  NAVIGATION: {
    id: "category.NAVIGATION",
    text: "A navigation satellite. It broadcasts the time from an atomic clock and where it was when it sent it; a receiver hearing four of them at once can work out where it is. They fly high — around 20,000 km — so that a good part of the constellation is above the horizon from anywhere, which is also why none of them can be seen by eye."
  },
  EARTH: {
    id: "category.EARTH",
    text: "An Earth-observation satellite, pointed back down at us — imaging land and sea, tracking weather, or measuring ice, crops, fires and pollution. Most fly a low polar orbit, crossing the equator at the same local time each day so that what they record can be compared like for like from one pass to the next."
  },
  INTERNET: {
    id: "category.INTERNET",
    text: "A satellite in one of the internet constellations: hundreds or thousands of identical satellites in low orbit, handing a dish on the ground from one to the next as they pass, so that some part of the network is always overhead. Low orbit is the whole point — it keeps the round trip short enough for a video call, which a geostationary link cannot manage."
  },
  TELECOM: {
    id: "category.TELECOM",
    text: "A telecommunications satellite: television and data relayed between points on the ground with no cable between them, or calls and short messages from satellite phones and small devices far from any mast. Most of them are parked over the equator, which is why a dish can be aimed once and left alone."
  },
  OTHER: {
    id: "category.OTHER",
    text: "An active satellite the catalogue names but does not classify. Most objects up here this size are technology demonstrators, university cubesats or small commercial payloads — the long tail of an orbit that has become cheap enough to reach that thousands of small, specific things are now flying in it."
  }
} as const satisfies Record<SatelliteCategory, BriefingEntry>;

/**
 * The same for the geostationary belt, where the orbit itself says a great deal.
 *
 * An object that holds station is at 35,786 km by definition, and got there
 * deliberately and expensively — worth saying, since the marker already draws it
 * as a ring and the card already gives its period as a day.
 */
const PARKED_BRIEFING = {
  id: "parked",
  text: "A satellite parked 35,786 km over the equator, where one orbit takes exactly one day and it appears to hang still. That is why the dish on a roof can be bolted down and never moved again. The altitude is not a choice but arithmetic: it is the one height at which an orbit lasts exactly as long as a rotation of the Earth. It also means the signal travels 70,000 km and back, which is the quarter-second delay on a satellite phone call."
} as const satisfies BriefingEntry;

/**
 * Every id the tables above file a text under.
 *
 * Derived from the tables rather than listed beside them, so a fleet added
 * with a new id widens this union on its own and the suite that checks the
 * eleven translation tables against it starts failing the same day. A missing
 * translation still renders — in English — so nothing else would notice.
 */
export type BriefingId =
  | (typeof LANDMARK_BRIEFINGS)[keyof typeof LANDMARK_BRIEFINGS]["id"]
  | (typeof FAMILIES)[number]["briefing"]["id"]
  | (typeof CATEGORY_BRIEFINGS)[SatelliteCategory]["id"]
  | (typeof PARKED_BRIEFING)["id"];

/** Every id, in the order the tables are searched. */
export const BRIEFING_IDS: readonly BriefingId[] = [
  ...Object.values(LANDMARK_BRIEFINGS).map((entry) => entry.id),
  ...FAMILIES.map((family) => family.briefing.id),
  ...Object.values(CATEGORY_BRIEFINGS).map((entry) => entry.id),
  PARKED_BRIEFING.id
];

/**
 * Which entry describes one object: its own, its fleet's, or its category's.
 *
 * Always answers. A blank space where a description should be reads as a fault
 * in the app rather than a gap in the catalogue, and the category tier means
 * there is always something true to say.
 */
export function briefingEntryFor(subject: BriefingSubject): BriefingEntry {
  const landmark = LANDMARK_BRIEFINGS[subject.noradId as keyof typeof LANDMARK_BRIEFINGS];
  if (landmark) return landmark;

  const name = subject.name.toUpperCase();
  for (const family of FAMILIES) {
    if (family.match.test(name)) return family.briefing;
  }

  if (subject.parked) return PARKED_BRIEFING;
  return CATEGORY_BRIEFINGS[subject.category];
}

/**
 * The same, in the reader's language.
 *
 * The link is never translated, and should not be: it is the operator's own
 * page, and there is no French mirror of nasa.gov to send anyone to. The text
 * falls back to English one entry at a time, so a fleet added to the catalogue
 * between one translation pass and the next reads in English rather than not
 * at all.
 */
export function briefingFor(subject: BriefingSubject): Briefing {
  const entry = briefingEntryFor(subject);
  return { text: briefingText(entry.id) ?? entry.text, url: entry.url };
}
