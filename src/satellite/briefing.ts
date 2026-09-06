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
const LANDMARK_BRIEFINGS: Record<number, Briefing> = {
  25544: {
    text: "The International Space Station: a laboratory the size of a football pitch, 400 km up, crewed without a break since November 2000 by NASA, Roscosmos, ESA, JAXA and CSA. It is also the brightest thing in this sky — bright enough to follow with the naked eye.",
    url: "https://www.nasa.gov/international-space-station/"
  },
  48274: {
    text: "Tiangong, China's own station: three modules and a crew of three, assembled in orbit in 2021-22 and flown by the China Manned Space Agency. After the ISS it is the brightest object passing overhead.",
    url: "http://en.cmse.gov.cn/"
  },
  20580: {
    text: "The Hubble Space Telescope, a 2.4 m optical telescope NASA and ESA have flown since 1990. It sits above the air that blurs and absorbs starlight, which is why its pictures are the ones everyone has seen.",
    url: "https://science.nasa.gov/mission/hubble/"
  },
  25867: {
    text: "Chandra, NASA's X-ray observatory since 1999, on an orbit that swings a third of the way to the Moon. It images gas at millions of degrees — matter falling into black holes, and the hot haze filling galaxy clusters.",
    url: "https://chandra.harvard.edu/"
  },
  25989: {
    text: "XMM-Newton, ESA's X-ray observatory since 1999, carrying the largest X-ray collecting area ever flown. Its long elliptical orbit lets it stare at one faint source for the better part of two days at a time.",
    url: "https://www.cosmos.esa.int/web/xmm-newton"
  },
  28485: {
    text: "Swift, NASA's gamma-ray burst hunter. It detects a burst — the collapse of a massive star, or two neutron stars merging — and turns its telescopes onto it within about a minute, before the afterglow fades.",
    url: "https://swift.gsfc.nasa.gov/"
  },
  38358: {
    text: "NuSTAR, the first telescope to focus hard X-rays rather than merely count them. Doing so needs a 10 m focal length, so the mast between its optics and its detectors was unfolded once it reached orbit.",
    url: "https://www.nustar.caltech.edu/"
  },
  42758: {
    text: "Insight-HXMT, called Huiyan, China's first X-ray astronomy satellite, launched in 2017 and run by the Institute of High Energy Physics. It scans the plane of the Milky Way for black holes and neutron stars.",
    url: "http://english.ihep.cas.cn/"
  },
  44874: {
    text: "CHEOPS, an ESA and Swiss-led photometer that measures how much a known planet dims its own star as it crosses it. That dip gives the planet's size, and with its mass, whether it is rock, ice or gas.",
    url: "https://www.esa.int/Science_Exploration/Space_Science/Cheops"
  },
  49954: {
    text: "IXPE, flown by NASA and the Italian space agency since 2021. It measures the polarisation of X-rays, which carries the geometry of what emitted them — the shape of the flow around a black hole.",
    url: "https://ixpe.msfc.nasa.gov/"
  },
  58753: {
    text: "Einstein Probe, a Chinese Academy of Sciences mission with ESA and MPE, launched in 2024. Its lobster-eye optics watch a tenth of the sky at once for X-ray flares that appear and fade within hours.",
    url: "https://www.cosmos.esa.int/web/einstein-probe"
  },
  60089: {
    text: "SVOM, a French-Chinese mission launched in 2024 to catch gamma-ray bursts and point ground telescopes at them within minutes — including the oldest bursts, from the first billion years of the universe.",
    url: "https://www.svom.eu/"
  }
};

/** A naming convention, and what everything answering to it is. */
type Family = {
  /** Tested against the upper-cased catalogue name. First match wins. */
  match: RegExp;
  briefing: Briefing;
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
const FAMILIES: readonly Family[] = [
  // ---- Visiting vehicles. Docked, these share the station's patch of sky,
  // which is exactly when someone taps a cluster and asks what they all are.
  {
    match: /^SOYUZ-MS/,
    briefing: {
      text: "A Soyuz: the Russian crew ferry, three seats up to the ISS and the same three back down. It stays docked for the crew's six months as their lifeboat, which is why it is here rather than in a hangar.",
      url: "https://www.roscosmos.ru/"
    }
  },
  {
    match: /^PROGRESS-MS/,
    briefing: {
      text: "A Progress freighter: the uncrewed Soyuz that carries fuel, water and food to the ISS. Its engines also push the whole station back up the few hundred metres a month the thin air up there drags it down.",
      url: "https://www.roscosmos.ru/"
    }
  },
  {
    match: /^(CREW DRAGON|CARGO DRAGON|DRAGON)/,
    briefing: {
      text: "A SpaceX Dragon at the ISS, carrying either four astronauts or a few tonnes of cargo. It is the only vehicle flying that brings cargo back down intact instead of burning up on the way home.",
      url: "https://www.spacex.com/vehicles/dragon/"
    }
  },
  {
    match: /^CYGNUS/,
    briefing: {
      text: "A Cygnus freighter, built by Northrop Grumman: a few tonnes of cargo up to the ISS, caught by the station's robot arm. It leaves loaded with rubbish and is deliberately burned up over the Pacific.",
      url: "https://www.northropgrumman.com/space/cygnus-spacecraft"
    }
  },
  {
    match: /^STARLINER/,
    briefing: {
      text: "Boeing's Starliner, a crew capsule for the ISS. Unusually, it comes home over land rather than water, slowed by parachutes and cushioned by airbags at touchdown in the American south-west.",
      url: "https://www.boeing.com/space/starliner"
    }
  },
  {
    match: /^SHENZHOU/,
    briefing: {
      text: "A Shenzhou: China's crewed ferry, three taikonauts up to the Tiangong station and back. One is always docked while a crew is aboard, ready to bring them home in a hurry if it comes to that.",
      url: "http://en.cmse.gov.cn/"
    }
  },
  {
    match: /^TIANZHOU/,
    briefing: {
      text: "A Tianzhou freighter: propellant, food and equipment up to China's Tiangong station, uncrewed. Like the Russian Progress it also raises the station's orbit, and burns up when its work is done.",
      url: "http://en.cmse.gov.cn/"
    }
  },

  // ---- Navigation. Four global systems and three regional ones; every one of
  // them is the reason the phone doing the asking knows where it is.
  {
    match: /GPS|NAVSTAR/,
    briefing: {
      text: "One of the ~31 GPS satellites, run by the US Space Force from 20,200 km up. It broadcasts nothing but the time, from an atomic clock; four of those signals at once are what fix this phone's position.",
      url: "https://www.gps.gov/"
    }
  },
  {
    match: /GALILEO/,
    briefing: {
      text: "One of Galileo's satellites, the European Union's own navigation system and the only civil-run one. Your phone almost certainly uses it alongside GPS — together they fix a position more sharply than either alone.",
      url: "https://www.gsc-europa.eu/"
    }
  },
  {
    match: /GLONASS/,
    briefing: {
      text: "A GLONASS satellite, Russia's global navigation system, flying since the 1980s. Its orbits are steeply inclined, which is what makes it the system that works best at high northern latitudes.",
      url: "https://glonass-iac.ru/en/"
    }
  },
  {
    match: /BEIDOU/,
    briefing: {
      text: "A BeiDou satellite, China's global navigation system, completed in 2020. Unusually, part of the constellation is parked over Asia rather than circling, and it can carry short text messages as well as time.",
      url: "http://en.beidou.gov.cn/"
    }
  },
  {
    match: /QZSS|MICHIBIKI/,
    briefing: {
      text: "A Michibiki satellite of Japan's QZSS, on a figure-of-eight track that keeps one of them almost overhead Japan at all times — so a GPS fix still works in the street canyons of central Tokyo.",
      url: "https://qzss.go.jp/en/"
    }
  },
  {
    match: /IRNSS|NAVIC/,
    briefing: {
      text: "A NavIC satellite, India's own regional navigation system, run by ISRO. Seven satellites over the Indian Ocean give India and 1,500 km around it a position fix that depends on nobody else's system.",
      url: "https://www.isro.gov.in/"
    }
  },
  {
    match: /CENTISPACE/,
    briefing: {
      text: "A CentiSpace satellite: a Chinese commercial fleet in low orbit that sharpens existing navigation signals rather than replacing them, correcting GPS and BeiDou fixes down towards the centimetre."
    }
  },

  // ---- Communications: the bulk of the catalogue, and most of what is
  // overhead at any moment.
  {
    match: /^STARLINK/,
    briefing: {
      text: "A Starlink: one of the thousands SpaceX flies at around 550 km to sell broadband to a dish on a roof. They are far and away the most numerous objects in this sky, and the train of lights after a launch.",
      url: "https://www.starlink.com/"
    }
  },
  {
    match: /^ONEWEB/,
    briefing: {
      text: "A OneWeb satellite, now flown by Eutelsat: about 650 of them at 1,200 km, selling broadband wholesale to phone networks, airlines and ships rather than direct to households.",
      url: "https://oneweb.net/"
    }
  },
  {
    match: /KUIPER/,
    briefing: {
      text: "One of Amazon's broadband satellites, the constellation begun as Project Kuiper: thousands planned in low orbit, sold to homes and businesses as a rival to Starlink."
    }
  },
  {
    match: /QIANFAN|SPACESAIL/,
    briefing: {
      text: "A Qianfan — \"Thousand Sails\" — satellite, Shanghai's commercial broadband constellation and China's nearest answer to Starlink, with several hundred already flying of many thousands planned."
    }
  },
  {
    match: /GUOWANG|HULIANWANG/,
    briefing: {
      text: "A satellite of Guowang, the Chinese state's own broadband constellation, run by SatNet. It is the national counterpart to Starlink, and is being launched in batches towards a planned 13,000."
    }
  },
  {
    match: /^IRIDIUM/,
    briefing: {
      text: "An Iridium satellite: 66 of them, linked to each other by radio so a call can hop across the constellation. That is why an Iridium phone works at the poles and in the middle of an ocean.",
      url: "https://www.iridium.com/"
    }
  },
  {
    match: /GLOBALSTAR/,
    briefing: {
      text: "A Globalstar satellite, carrying satellite phones, trackers and — since 2022 — the emergency SOS messages an iPhone sends when it is out of reach of any mobile network.",
      url: "https://www.globalstar.com/"
    }
  },
  {
    match: /ORBCOMM/,
    briefing: {
      text: "An Orbcomm satellite: short machine-to-machine messages rather than voice or video — lorry fleets, shipping containers, pipelines and buoys reporting where they are and how they are doing.",
      url: "https://www.orbcomm.com/"
    }
  },
  {
    match: /^(SES-|O3B|ASTRA \d)/,
    briefing: {
      text: "An SES satellite, from Luxembourg: the Astra fleet carries television across Europe from the geostationary belt, while the O3b craft sit lower down and sell internet capacity to islands and ships.",
      url: "https://www.ses.com/"
    }
  },
  {
    match: /^(INTELSAT|GALAXY)/,
    briefing: {
      text: "An Intelsat satellite, from the oldest fleet in the business — it began in 1964 as the international consortium that carried the first live transatlantic television.",
      url: "https://www.intelsat.com/"
    }
  },
  {
    match: /^(EUTELSAT|HOTBIRD)/,
    briefing: {
      text: "A Eutelsat satellite. The Hot Bird craft at 13° East carry a thousand television channels into dishes across Europe, the Middle East and North Africa from one spot in the sky.",
      url: "https://www.eutelsat.com/"
    }
  },
  {
    match: /^(VIASAT|INMARSAT)/,
    briefing: {
      text: "A Viasat satellite — the company now includes Inmarsat, whose fleet has carried ships' distress calls since the 1980s. Between them they connect aircraft, vessels and remote ground stations.",
      url: "https://www.viasat.com/"
    }
  },
  {
    match: /^(ECHOSTAR|DIRECTV)/,
    briefing: {
      text: "An EchoStar or DirecTV satellite: American direct-to-home television, beamed from the geostationary belt to the small dishes bolted to the sides of houses.",
      url: "https://www.echostar.com/"
    }
  },
  {
    match: /^(TELESAT|LIGHTSPEED)/,
    briefing: {
      text: "A Telesat satellite, from the Canadian operator that flew the world's first domestic communications satellite in 1972 — television and connectivity across Canada's north and beyond.",
      url: "https://www.telesat.com/"
    }
  },
  {
    match: /^(SPACEMOBILE|BLUEBIRD|BW3)/,
    briefing: {
      text: "An AST SpaceMobile satellite: an antenna the size of a tennis court, aiming to talk to an ordinary unmodified mobile phone on the ground — no dish, no terminal, just bars where there is no mast.",
      url: "https://ast-science.com/"
    }
  },
  {
    match: /^LYNK/,
    briefing: {
      text: "A Lynk satellite, doing what a mobile mast does but from orbit: a normal phone sees it as a network and can send a text through it from anywhere with a clear view of the sky.",
      url: "https://lynk.world/"
    }
  },
  {
    match: /^KINEIS/,
    briefing: {
      text: "A Kinéis satellite, the French successor to the Argos system that has tracked tagged animals, buoys and fishing boats since the 1970s — small, infrequent position reports from anywhere on Earth.",
      url: "https://www.kineis.com/"
    }
  },
  {
    match: /^ASTROCAST/,
    briefing: {
      text: "An Astrocast nanosatellite, a Swiss fleet carrying small bursts of data from sensors that are nowhere near a network: pipelines, farm equipment, containers and remote weather stations.",
      url: "https://www.astrocast.com/"
    }
  },
  {
    match: /^(SWARM|SPACEBEE)/,
    briefing: {
      text: "A SpaceBEE, flown by Swarm and now owned by SpaceX: a satellite the size of a slice of bread, relaying tiny, cheap machine messages from sensors in places with no other network."
    }
  },
  {
    match: /^(GONETS|YAMAL|EXPRESS-|MERIDIAN)/,
    briefing: {
      text: "A Russian communications satellite. Yamal and Express carry television and telephony from the geostationary belt; Gonets and Meridian serve the Arctic and the far north, where a parked satellite sits too low to see."
    }
  },
  {
    match: /^(CHINASAT|ZHONGXING|APSTAR|TIANLIAN|TIANTONG)/,
    briefing: {
      text: "A Chinese communications satellite: ChinaSat and APStar carry television and telephony across Asia, Tiantong serves handheld satellite phones, and the Tianlian craft relay data down from other spacecraft."
    }
  },
  {
    match: /^(SKYNET|WGS|MUOS|SICRAL|SYRACUSE|AEHF|MILSTAR|UFO )/,
    briefing: {
      text: "A military communications satellite — British Skynet, American WGS, MUOS and UFO, Italian Sicral or French Syracuse. Same job as a civil one, hardened and encrypted: links to ships, aircraft and troops."
    }
  },
  {
    match: /^(PRAETORIAN|SDA_)/,
    briefing: {
      text: "A satellite of the US Space Development Agency's Proliferated Warfighter Space Architecture: hundreds of small craft in low orbit, meshed by laser links, for military data relay and missile tracking."
    }
  },
  {
    match: /^(SBIRS|DSP )/,
    briefing: {
      text: "An American missile early-warning satellite. It stares at the Earth in the infrared from the geostationary belt, watching for the heat of a rocket motor lifting off anywhere on the hemisphere below."
    }
  },
  {
    match: /^TJS/,
    briefing: {
      text: "A TJS satellite — officially a Chinese \"communications technology experiment\", parked in the geostationary belt. Western analysts read most of the series as early-warning or signals-intelligence craft."
    }
  },
  {
    match: /^TDRS/,
    briefing: {
      text: "A NASA Tracking and Data Relay Satellite: it does not look at anything. Parked over the equator, it relays the ISS's and Hubble's data down to New Mexico when they are on the far side of the Earth.",
      url: "https://www.nasa.gov/"
    }
  },
  {
    match: /^(TIANQI|HEAD-|APRIZESAT|CONNECTA)/,
    briefing: {
      text: "A commercial machine-data relay satellite: no camera, just short reports from buoys, containers, meters and farm equipment far from any phone network, collected on each pass and dropped to a ground station."
    }
  },
  {
    match: /^RASSVET/,
    briefing: {
      text: "A Rassvet satellite: the demonstration batch for Bureau 1440's planned Russian low-orbit broadband constellation, the domestic answer to Starlink and OneWeb."
    }
  },
  {
    match: /^(GEESAT|GEELY)/,
    briefing: {
      text: "A Geespace satellite, flown by the Chinese carmaker Geely: a low-orbit fleet selling positioning corrections and connectivity to vehicles rather than to households."
    }
  },
  {
    match:
      /^(GSAT|JCSAT|OPTUS|KOREASAT|THAICOM|VINASAT|PALAPA|MEASAT|NILESAT|ARABSAT|TURKSAT|HISPASAT|AMOS-|BADR|AZERSPACE|ANGOSAT|NIGCOMSAT|RASCOM|ANIK|TELSTAR|BSAT|SUPERBIRD|ABS-|BELINTERSAT|NSS-|ASIASAT|AMAZONAS|NIMIQ|SXM|STAR ONE|LUCH|KORSAT|SAUDICOMSAT|THURAYA|HELLAS-SAT|HYLAS|THOR |AMC-|INSAT|APSTAR)/,
    briefing: {
      text: "A national or regional communications satellite, parked over the equator so it holds still above the country that flies it — television, telephony and internet backhaul for one part of the world."
    }
  },

  // ---- Earth observation: everything pointed back down.
  {
    match: /^(LEGION|WORLDVIEW|GEOEYE|QUICKBIRD)/,
    briefing: {
      text: "A Maxar imaging satellite — the WorldView and Legion craft: among the sharpest commercial optical imaging sold, and enough of them to revisit the same place several times a day.",
      url: "https://www.maxar.com/"
    }
  },
  {
    match: /^(HAWK|BRO-|UNSEENLABS)/,
    briefing: {
      text: "A radio-frequency reconnaissance satellite: a receiver rather than a camera. Flying in trios, it locates a transmitter by the fractions of a second between each craft hearing it — which finds ships running dark."
    }
  },
  {
    match: /^(SITRO-AIS|AIS-|EXACTVIEW|NORSAT)/,
    briefing: {
      text: "A ship-tracking satellite: it listens for the AIS transponders merchant vessels broadcast, giving coverage of the open ocean where no coastal receiver can hear them."
    }
  },
  {
    match: /^GLOBAL-/,
    briefing: {
      text: "A Satellogic imaging satellite, built in Argentina: sub-metre optical and hyperspectral pictures, flown as a fleet cheap enough to point at the same place again and again.",
      url: "https://satellogic.com/"
    }
  },
  {
    match: /^(KOMPSAT|ARIRANG|CAS500)/,
    briefing: {
      text: "A South Korean Earth-observation satellite: the Arirang/KOMPSAT series and the newer CAS500 craft, carrying optical and radar imagers for mapping, agriculture and disaster response."
    }
  },
  {
    match: /^IRIDE/,
    briefing: {
      text: "An IRIDE satellite, Italy's Earth-observation constellation built with ESA: radar and optical imaging for civil protection, land monitoring and the country's own public services.",
      url: "https://www.esa.int/"
    }
  },
  {
    match: /^(COSMO-SKYMED|CSG-|PLEIADES|SPOT |PAZ|PROBA|DEIMOS|VENUS|THEOS)/,
    briefing: {
      text: "A European imaging satellite: Italy's Cosmo-SkyMed radar, France's Pléiades and SPOT optical craft, Spain's PAZ. National programmes whose pictures are also sold commercially."
    }
  },
  {
    match: /^(CYGFM|FORMOSAT|COSMIC)/,
    briefing: {
      text: "A satellite that measures the atmosphere and ocean using signals meant for something else: GPS transmissions bent by the air, or reflected off the sea, which give temperature profiles and hurricane wind speeds."
    }
  },
  {
    match: /^(FOREST|FIRESAT|WILDFIRE|OROR)/,
    briefing: {
      text: "A wildfire-detection satellite. Its infrared camera looks for the heat signature of a new fire while it is still small, and reports the position to the services that have to get to it."
    }
  },
  {
    match: /^HERMES-/,
    briefing: {
      text: "A HERMES nanosatellite, an Italian-led experiment: a swarm of shoebox-sized detectors that catch gamma-ray bursts and locate them by the fractions of a second between one craft seeing a burst and the next."
    }
  },
  {
    match: /^(CENTAURI|SKYKRAFT|SATELIOT|LACUNA|MYRIOTA|EYE-|TYVAK)/,
    briefing: {
      text: "A commercial nanosatellite fleet: sensor data from remote equipment, or in Skykraft's case air-traffic surveillance — the ADS-B position reports aircraft broadcast, over oceans with no radar coverage."
    }
  },
  {
    match: /^(FLOCK|DOVE|SKYSAT|PELICAN|TANAGER)/,
    briefing: {
      text: "A Planet satellite. The Dove and Flock craft are shoebox-sized and photograph the entire land surface of the Earth every day; SkySat and Pelican follow up on any of it in far sharper detail.",
      url: "https://www.planet.com/"
    }
  },
  {
    match: /^LEMUR/,
    briefing: {
      text: "A Spire Lemur cubesat. It listens rather than looks: ship and aircraft transponders, and the way GPS signals bend through the atmosphere, which is a temperature and humidity profile for weather forecasts.",
      url: "https://www.spire.com/"
    }
  },
  {
    match: /^ICEYE/,
    briefing: {
      text: "An ICEYE radar satellite, from Finland. Radar rather than a camera, so it images through cloud and in darkness — which is what floods, oil spills and sea ice actually need.",
      url: "https://www.iceye.com/"
    }
  },
  {
    match: /^CAPELLA/,
    briefing: {
      text: "A Capella radar satellite: a folded reflector antenna on a small spacecraft, imaging metre-scale detail through cloud and at night for commercial and government customers.",
      url: "https://www.capellaspace.com/"
    }
  },
  {
    match: /^UMBRA/,
    briefing: {
      text: "An Umbra radar satellite — among the sharpest commercially sold, at around 16 cm. Radar sees through weather, so it is bought for monitoring that cannot wait for a clear sky.",
      url: "https://umbra.space/"
    }
  },
  {
    match: /^BLACKSKY/,
    briefing: {
      text: "A BlackSky imaging satellite, built around revisit rather than resolution: enough of them in orbit to photograph the same place several times a day and show what changed between the pictures.",
      url: "https://www.blacksky.com/"
    }
  },
  {
    match: /^SENTINEL/,
    briefing: {
      text: "A Copernicus Sentinel, flown by ESA for the European Union. Radar, optical and atmospheric instruments watching land, ocean, ice and air — and every image is published free for anyone to use.",
      url: "https://sentinels.copernicus.eu/"
    }
  },
  {
    match: /^(NOAA|GOES|SUOMI|JPSS|NOAA-)/,
    briefing: {
      text: "An American weather satellite run by NOAA. The GOES craft hold station over the Americas and take the pictures on the forecast; the polar ones sweep the whole globe twice a day, feeding the models.",
      url: "https://www.nesdis.noaa.gov/"
    }
  },
  {
    match: /^(METOP|METEOSAT|MSG-)/,
    briefing: {
      text: "A European weather satellite operated by EUMETSAT: Meteosat parked over Africa for the half-hourly disc of cloud, MetOp in polar orbit for the soundings that European forecast models run on.",
      url: "https://www.eumetsat.int/"
    }
  },
  {
    match: /^LANDSAT/,
    briefing: {
      text: "A Landsat, NASA and the US Geological Survey: the longest continuous record of the Earth's land surface there is, unbroken since 1972 — the archive against which any change is measured.",
      url: "https://landsat.gsfc.nasa.gov/"
    }
  },
  {
    match: /^(TERRA|AQUA|AURA)\b/,
    briefing: {
      text: "One of NASA's Earth Observing System flagships, flying since around 2000. Between them they map cloud, fire, vegetation, sea surface temperature and ozone — the daily state of the whole planet.",
      url: "https://science.nasa.gov/earth/"
    }
  },
  {
    match: /^(MMS |THEMIS|VAN ALLEN|GOLD|ICON|TIMED|AIM |SDO|ACE |WIND|GEOTAIL|CLUSTER)/,
    briefing: {
      text: "A space-physics satellite. It measures the magnetic field and charged particles around the Earth rather than the ground below — the machinery behind aurorae, and the storms that knock out power grids.",
      url: "https://science.nasa.gov/heliophysics/"
    }
  },
  {
    match: /^(GRACE|ICESAT|SWOT|CALIPSO|CLOUDSAT|SMAP|PACE|NISAR)/,
    briefing: {
      text: "A NASA Earth-science satellite, each built around a single measurement: the height of the ice, the water on the land, the salt in the sea, the aerosols in the air.",
      url: "https://science.nasa.gov/earth/"
    }
  },
  {
    match: /^FENGYUN/,
    briefing: {
      text: "A Fengyun satellite, China's weather fleet, run by the China Meteorological Administration — some parked over Asia, some in polar orbit, and their data shared into the global forecasting system."
    }
  },
  {
    match:
      /^(GAOFEN|ZIYUAN|HAIYANG|TIANHUI|JILIN|CHUANGXIN|SUPERVIEW|ZHUHAI|PIESAT|NINGXIA|YUNYAO|DONGPO|HEAD|GJZ|HJS|SCS-)/,
    briefing: {
      text: "A Chinese remote-sensing satellite, state or commercial: high-resolution land imaging (Gaofen, Ziyuan, Jilin, SuperView), ocean colour and sea state (Haiyang), or the survey mapping national cartography runs on."
    }
  },
  {
    match: /^YAOGAN/,
    briefing: {
      text: "A Yaogan satellite. The name is a generic Chinese label for \"remote sensing\", applied to a long series widely understood to be military reconnaissance — optical, radar and electronic-intelligence craft."
    }
  },
  {
    match: /^(SHIYAN|SHIJIAN|SJ-|TIANYI|TIANMU|TIANPING|YUNHAI|CHECKMATE|AETHER)/,
    briefing: {
      text: "A Chinese experimental or technology-demonstration satellite. These series carry new instruments and techniques rather than an operational service — Tianmu, for instance, sounds the atmosphere for forecasting."
    }
  },
  {
    match: /^(RESURS|KANOPUS|METEOR-M|ELEKTRO|ARKTIKA|IONOSFERA|OBZOR)/,
    briefing: {
      text: "A Russian Earth-observation satellite: Resurs and Kanopus image the land, Meteor-M and Elektro do the weather, and Arktika flies a looping orbit that keeps the Arctic in view where a parked satellite cannot see it."
    }
  },
  {
    match: /^(CARTOSAT|RISAT|RESOURCESAT|OCEANSAT|EOS-|SCATSAT)/,
    briefing: {
      text: "An Indian Earth-observation satellite from ISRO: Cartosat for mapping, RISAT's radar for imaging through monsoon cloud, Resourcesat and Oceansat for crops, forests and the sea.",
      url: "https://www.isro.gov.in/"
    }
  },
  {
    match: /^(QPS-SAR|STRIX|GRUS|ALE-)/,
    briefing: {
      text: "A Japanese commercial small satellite: the QPS-SAR and Strix craft carry radar that sees through cloud, and the Grus fleet takes optical images — both sold as data rather than flown by a space agency."
    }
  },
  {
    match: /^(GHGSAT|TOMORROW|MUON|SATELLOGIC|NUSAT|CARBON|METHANESAT)/,
    briefing: {
      text: "A commercial environmental-monitoring satellite. GHGSat and MethaneSAT trace greenhouse gases back to the individual site leaking them; the Tomorrow.io radars are private weather forecasting."
    }
  },
  {
    match: /^(DMSP|USA |NROL|KH-|LACROSSE|TOPAZ|ONYX)/,
    briefing: {
      text: "An American military or intelligence satellite. \"USA\" is the designation given on launch and usually all that is officially said about it: reconnaissance, signals intelligence, early warning or military weather."
    }
  },
  {
    match: /^COSMOS/,
    briefing: {
      text: "A Cosmos satellite — the blanket designation the Soviet Union and now Russia give to military and unannounced payloads. The number says nothing about the job: reconnaissance, early warning, navigation or a test."
    }
  },

  // ---- The odds and ends, which are still worth a sentence.
  {
    match: /OBJECT\b/,
    briefing: {
      text: "An object catalogued from a rideshare launch but not yet publicly matched to its owner. Dozens of small satellites go up on one rocket, and it takes weeks to work out which tracked object is which."
    }
  },
  {
    match: /^(CALSPHERE|LCS |SURCAL|TEMPSAT)/,
    briefing: {
      text: "A calibration sphere from the 1960s: a metal ball with no power, no radio and nothing to do but be tracked, so that radars could be checked against a target of known size. It is still up there.",
      url: "https://www.space-track.org/"
    }
  },
  {
    match: /^(ETALON|LAGEOS|STARLETTE|STELLA|AJISAI|LARES)/,
    briefing: {
      text: "A geodetic sphere covered in mirrors. It carries no instruments at all: ground stations bounce lasers off it, and the round trip measures continental drift, the Earth's spin and the shape of its gravity field."
    }
  },
  {
    match: /^(YAM-|LOFT)/,
    briefing: {
      text: "A Loft Orbital satellite: one standard spacecraft carrying several unrelated customers' instruments at once, so an operator can buy a payload in orbit without ever building a satellite of their own.",
      url: "https://www.loftorbital.com/"
    }
  },
  {
    match: /^(ION SCV|VIGORIDE|SHERPA|OTV-|HELIOS|LAUNCHER ORBITER)/,
    briefing: {
      text: "An orbital transfer vehicle — a space tug. It rides up with a batch of small satellites and then moves them, one at a time, into the individual orbits their operators actually wanted."
    }
  },
  {
    match: /^(AO-|SO-|FO-|CAS-|CAS |OSCAR|JAS-|RS-\d|HO-|LO-)/,
    briefing: {
      text: "An amateur radio satellite, built and operated by volunteers. It relays contacts between radio amateurs on the ground, and can usually be received with a handheld set and a home-made antenna.",
      url: "https://www.amsat.org/"
    }
  },
  {
    match: /^(TEVEL|UNISAT|CUBEBUG|BIRDS|FOSSASAT|AEROCUBE|GEOSCAN)/,
    briefing: {
      text: "A cubesat: a satellite of a few standard 10 cm cubes, cheap enough for a university, a school programme or a small company. Most carry one experiment, and most re-enter within a few years."
    }
  }
];

/**
 * What a category means, for everything no fleet or landmark claimed.
 *
 * The residual is genuinely long-tailed — some 780 naming conventions with a
 * handful of objects each — so the last word is the one the marker's colour was
 * already saying, stated in a sentence. Better than a blank space, and it does
 * not pretend to know more than the catalogue does.
 */
const CATEGORY_BRIEFINGS: Record<SatelliteCategory, Briefing> = {
  LANDMARK: {
    text: "One of the handful of objects worth going outside for: a crewed station, a visiting vehicle, or one of the great observatories."
  },
  NAVIGATION: {
    text: "A navigation satellite. It broadcasts the time from an atomic clock and where it was when it sent it; a receiver hearing four of them at once can work out where it is."
  },
  EARTH: {
    text: "An Earth-observation satellite, pointed back down at us — imaging land and sea, tracking weather, or measuring ice, crops, fires and pollution."
  },
  COMMS: {
    text: "A communications satellite: it moves bits. Television, telephony, broadband or machine-to-machine messages, between points on the ground that have no cable between them."
  },
  OTHER: {
    text: "An active satellite the catalogue names but does not classify. Most objects up here this size are technology demonstrators, university cubesats or small commercial payloads."
  }
};

/**
 * The same for the geostationary belt, where the orbit itself says a great deal.
 *
 * An object that holds station is at 35,786 km by definition, and got there
 * deliberately and expensively — worth saying, since the marker already draws it
 * as a ring and the card already gives its period as a day.
 */
const PARKED_BRIEFING: Briefing = {
  text: "A satellite parked 35,786 km over the equator, where one orbit takes exactly one day and it appears to hang still. That is why the dish on a roof can be bolted down and never moved again."
};

/**
 * What to say about one object: its own entry, its fleet's, or its category's.
 *
 * Always answers. A blank space where a description should be reads as a fault
 * in the app rather than a gap in the catalogue, and the category tier means
 * there is always something true to say.
 */
export function briefingFor(subject: BriefingSubject): Briefing {
  const landmark = LANDMARK_BRIEFINGS[subject.noradId];
  if (landmark) return landmark;

  const name = subject.name.toUpperCase();
  for (const family of FAMILIES) {
    if (family.match.test(name)) return family.briefing;
  }

  if (subject.parked) return PARKED_BRIEFING;
  return CATEGORY_BRIEFINGS[subject.category];
}
