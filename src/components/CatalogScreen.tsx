import React, { MutableRefObject, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { useDirectoryFixes } from "../hooks/useDirectoryFixes";
import { useLocale } from "../hooks/useLocale";
import { fill, strings } from "../i18n";
import { groupNumber, lookDirection } from "../i18n/format";
import { CatalogEntry, SatelliteCatalog } from "../satellite/catalog";
import { CATEGORY_COLORS, SatelliteCategory } from "../satellite/categories";
import {
  buildDirectory,
  DirectoryFix,
  DirectoryGroup,
  DirectoryMatch,
  DirectorySection,
  DIRECTORY_HORIZON_DEG,
  isSingleObject,
  searchDirectory
} from "../satellite/directory";
import { OrbitEpoch } from "../types";
import { Icon } from "./Icon";
import { cssColor } from "./palette";
import { theme } from "./theme";

type Props = {
  /** Everything in orbit, as boot downloaded it. The index is built from it once. */
  catalog: SatelliteCatalog;
  /**
   * The clock and the fix the rows are worked out against: the phone's, or the
   * replay's. A ref, because this screen samples it on its own slow timer and
   * nothing else on it changes when the epoch does.
   */
  epochRef: MutableRefObject<OrbitEpoch>;
  /**
   * Puts an object on the sky: the same selection a tap on its own mark makes,
   * and the sky tab with it. See `SkyOverlay`.
   */
  onSelect: (name: string) => void;
};

/**
 * The catalog: everything in orbit, as a list to look things up in.
 *
 * The sky view answers "what is above me now" and cannot answer "where is the
 * thing I came looking for", because an object below the horizon has no mark to
 * tap — and from anywhere, at any moment, that is most of the sixteen thousand.
 * So this tab is the catalogue read the other way round: by name.
 *
 * **It is one tap deep and no deeper.** The index is the fleets under the six
 * headings the sky is coloured by, largest first, so the shape of what is up
 * there is legible before anything is tapped: Starlink is ten thousand objects
 * and GPS is forty, and a list that said so nowhere would be hiding the single
 * most surprising fact about the modern sky. Opening a fleet gives what is
 * above the horizon *now*, highest first — the answer worth having about ten
 * thousand identical spacecraft — with the rest counted rather than listed. And
 * the search, which is the same index read by name, finds any one object
 * whether it is up or not.
 *
 * **A row is a satellite, and tapping it is the same tap as tapping its mark.**
 * It selects the object and hands the screen back to the sky, where the card
 * that opens is the card the sky itself would have opened — and where, because
 * something is selected, the overlay draws that object's own pass across the
 * picture (`useFocusedPath`). That line is the literal answer to the question
 * this tab exists for: an object still under the horizon gets an arc showing
 * where it will come up, on the sky, in the place the answer belongs. Reading
 * about it here instead would have meant a second copy of the card over a list,
 * saying the same sentences in a worse place.
 *
 * **The highlights and the search results carry their position even when they
 * are under the horizon** — `SE 143° · 34° below` — and an opened fleet carries
 * only what is up. The difference is what the row is for: a name somebody typed
 * or a landmark they know is one particular object, and where it is now is
 * worth saying whatever the answer; a fleet is ten thousand interchangeable
 * ones, and nobody wants the one on the far side of the Earth.
 *
 * The camera keeps running behind it, as it does behind the settings, so
 * leaving is one tap back onto a view that never stopped.
 */
export const CatalogScreen: React.FC<Props> = ({ catalog, epochRef, onSelect }) => {
  // Every word on this screen is a word, and nothing in its props changes when
  // the console's picker changes the language. See `useLocale`.
  useLocale();
  const t = strings();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<DirectoryGroup | null>(null);

  // Once per catalog: a walk of sixteen thousand entries and a memoised fleet
  // match apiece, held for as long as the catalog itself lives.
  const sections = useMemo(() => buildDirectory(catalog), [catalog]);
  const found = useMemo(
    () => searchDirectory(sections, query, SEARCH_ROWS),
    [sections, query]
  );

  /**
   * The objects this screen is asking the arithmetic about, and the elevation
   * it wants them from.
   *
   * One list, whichever of the three screens is showing, so there is one scan
   * running rather than one per section — and memoised, because the hook keys
   * its work on the identity of what it is given.
   */
  const searching = query.trim() !== "";
  const named = useMemo(() => objectRowsOf(sections), [sections]);
  const live = useMemo<readonly CatalogEntry[]>(() => {
    if (open) return open.entries;
    return searching ? found.entries : named;
  }, [open, searching, found.entries, named]);
  const fixes = useDirectoryFixes(
    live,
    epochRef,
    open ? DIRECTORY_HORIZON_DEG : undefined
  );
  /**
   * The scan's answers by name, for the rows that were drawn before it ran.
   *
   * Only the opened fleet reads the list itself, because there the scan is what
   * decides which rows exist at all; everywhere else the names were on screen
   * first and this is what fills the line under each of them in.
   */
  const where = useMemo(
    () => new Map((fixes ?? []).map((fix) => [fix.name, fix])),
    [fixes]
  );

  return (
    <View style={styles.screen}>
      <View style={styles.head}>
        {open ? (
          <GroupHead group={open} shown={fixes} onBack={() => setOpen(null)} />
        ) : (
          <>
            {/* The tab's own label, so the bar and the page cannot disagree. */}
            <Text style={styles.title}>{t.tabs.catalog}</Text>
            <Text style={styles.about}>{t.catalog.about}</Text>
            <Search value={query} onChange={setQuery} />
          </>
        )}
      </View>

      <ScrollView
        // Keyed by which of the three screens this is, so opening a fleet lands
        // at the top of it rather than wherever the index happened to be
        // scrolled to. Typing does not change the key, so a search does not
        // jump under the finger as the results narrow.
        key={open ? open.id : searching ? "search" : "index"}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        // The field is at the top of a list that scrolls under it, so a drag is
        // how the keyboard is put away — the platform's own gesture for it.
        keyboardDismissMode="on-drag"
      >
        {open ? (
          <FixList fixes={fixes} onSelect={onSelect} />
        ) : searching ? (
          <Matches found={found} where={where} onOpen={setOpen} onSelect={onSelect} />
        ) : (
          <Index sections={sections} where={where} onOpen={setOpen} onSelect={onSelect} />
        )}
      </ScrollView>
    </View>
  );
};

/**
 * How many objects a search will list.
 *
 * A list is read rather than counted: past a few dozen rows the answer to a
 * query this loose is "narrow it", and the fleet rows above the objects are how
 * — `star` lists the Starlink fleet as one row, not eight thousand.
 */
const SEARCH_ROWS = 40;

/**
 * And how many of an opened fleet's objects are listed.
 *
 * A southward sky can have four hundred Starlinks over it at once. What a row
 * is worth is telling somebody which way to turn, and the four hundredth of
 * those is not a satellite anybody is going to go and find — the count above
 * the list already says how many there are, which is the fact worth having.
 */
const GROUP_ROWS = 25;

/**
 * The one heading whose rows are objects rather than fleets.
 *
 * The landmarks are the couple of dozen objects somebody comes to this tab
 * knowing the name of, so each of them is a row that goes to the sky rather
 * than a row that opens a list — the ISS and the Progress docked to it are two
 * things, and `Progress · 2 in orbit` would be a way in to a page saying
 * neither of them is up. Named rather than taken as the first section, which
 * `buildDirectory` does not promise: a catalogue with no landmarks in it drops
 * the heading, and the next one along is not it.
 */
const HIGHLIGHTS: SatelliteCategory = "LANDMARK";

/** Whether this heading is listed as objects rather than as fleets. */
function listsObjects(section: DirectorySection): boolean {
  return section.category === HIGHLIGHTS;
}

/**
 * The objects a heading lists as rows of their own, in the order they are read.
 *
 * Two kinds. Every group of the highlights, because that is what that heading
 * is; and, under any other heading, a fleet that turns out to have one member —
 * which is an object with a fleet's name on it, and a row that opened a list of
 * one would be a dead end.
 *
 * Alphabetical for the highlights, which is not the order the groups are in:
 * the index puts fleets largest first, and these are not fleets being compared
 * but a couple of dozen names being read down for one particular one.
 */
function objectsOf(section: DirectorySection): CatalogEntry[] {
  const groups = listsObjects(section) ? section.groups : section.groups.filter(isSingleObject);
  return groups
    .flatMap((group) => [...group.entries])
    .sort((one, other) => one.name.localeCompare(other.name));
}

/** Every object the index draws a row of its own for, across every heading. */
function objectRowsOf(sections: readonly DirectorySection[]): CatalogEntry[] {
  return sections.flatMap(objectsOf);
}

/**
 * The search field.
 *
 * The one place in this app that takes a keyboard, and the reason the tab is
 * worth having: a browse answers "what is up there" and only a name answers
 * "where is the thing I came looking for". Plain, unadorned and not a form —
 * no submit, no clear button, no autocomplete: every keystroke is the query,
 * because the answer is already in memory and costs a substring test per name.
 *
 * `autoCorrect` and `autoCapitalize` are off because the catalogue's names are
 * identifiers rather than words — a phone that helpfully corrects `iss` to
 * `is` is a phone that has broken the only control on the screen.
 */
const Search: React.FC<{ value: string; onChange: (value: string) => void }> = ({
  value,
  onChange
}) => (
  <View style={styles.search}>
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={strings().catalog.search}
      placeholderTextColor={theme.color.textFaint}
      accessibilityLabel={strings().catalog.search}
      autoCorrect={false}
      autoCapitalize="none"
      returnKeyType="search"
      style={styles.searchInput}
    />
  </View>
);

/** The index: every fleet, under the heading its category gives it. */
const Index: React.FC<{
  sections: readonly DirectorySection[];
  where: ReadonlyMap<string, DirectoryFix>;
  onOpen: (group: DirectoryGroup) => void;
  onSelect: (name: string) => void;
}> = ({ sections, where, onOpen, onSelect }) => {
  const t = strings();

  return (
    <>
      {sections.map((section) => {
        // The highlights are listed as the objects they are, with where each of
        // them is now; every other heading is listed as fleets, except any one
        // of those that turns out to hold a single object.
        const objects = objectsOf(section);
        const fleets = listsObjects(section)
          ? []
          : section.groups.filter((group) => !isSingleObject(group));
        const last = objects.length + fleets.length - 1;

        return (
          <View key={section.category} style={styles.section}>
            <Text style={styles.heading}>{t.filter.categories[section.category]}</Text>
            <View style={styles.group}>
              {fleets.map((group, row) => (
                <GroupRow
                  key={group.id}
                  group={group}
                  last={row === last}
                  onPress={() => onOpen(group)}
                />
              ))}
              <EntryRows
                entries={objects}
                where={where}
                from={fleets.length}
                last={last}
                onSelect={onSelect}
              />
            </View>
          </View>
        );
      })}
    </>
  );
};

/** What a query found: the fleets it names, then the objects it names. */
const Matches: React.FC<{
  found: DirectoryMatch;
  where: ReadonlyMap<string, DirectoryFix>;
  onOpen: (group: DirectoryGroup) => void;
  onSelect: (name: string) => void;
}> = ({ found, where, onOpen, onSelect }) => {
  const t = strings();

  if (found.groups.length === 0 && found.entries.length === 0) {
    return <Text style={styles.note}>{t.catalog.noMatch}</Text>;
  }

  return (
    <>
      {found.groups.length > 0 && (
        <View style={styles.group}>
          {found.groups.map((group, row) => (
            <GroupRow
              key={group.id}
              group={group}
              last={row === found.groups.length - 1}
              onPress={() => onOpen(group)}
            />
          ))}
        </View>
      )}
      {found.entries.length > 0 && (
        <View style={[styles.group, found.groups.length > 0 && styles.spaced]}>
          <EntryRows
            entries={found.entries}
            where={where}
            from={0}
            last={found.entries.length - 1}
            onSelect={onSelect}
          />
        </View>
      )}
    </>
  );
};

/** An opened fleet's heading: the way back, its name, and how much of it is up. */
const GroupHead: React.FC<{
  group: DirectoryGroup;
  /** What is up, or `null` while the first scan of it is still running. */
  shown: DirectoryFix[] | null;
  onBack: () => void;
}> = ({ group, shown, onBack }) => {
  const t = strings();

  return (
    <View style={styles.headRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.catalog.back}
        style={styles.back}
        onPress={onBack}
      >
        <Icon name="chevron" size={16} direction="left" color={theme.color.textDim} />
      </Pressable>
      <View style={styles.headText}>
        <Text numberOfLines={1} style={styles.groupTitle}>
          {group.name ?? t.scene.breakdown.other}
        </Text>
        <Text style={styles.about}>
          {shown === null
            ? t.catalog.working
            : fill(t.catalog.above, {
                count: groupNumber(shown.length),
                total: groupNumber(group.entries.length)
              })}
        </Text>
      </View>
    </View>
  );
};

/** An opened fleet: what is over the horizon, highest first. */
const FixList: React.FC<{
  fixes: DirectoryFix[] | null;
  onSelect: (name: string) => void;
}> = ({ fixes, onSelect }) => {
  const t = strings();

  if (fixes === null) return <Text style={styles.note}>{t.catalog.working}</Text>;
  if (fixes.length === 0) return <Text style={styles.note}>{t.catalog.noneAbove}</Text>;

  const shown = fixes.slice(0, GROUP_ROWS);
  return (
    <>
      <View style={styles.group}>
        {shown.map((fix, row) => (
          <ObjectRow
            key={fix.name}
            name={fix.name}
            category={fix.category}
            parked={fix.parked}
            at={fix}
            last={row === shown.length - 1}
            onPress={() => onSelect(fix.name)}
          />
        ))}
      </View>
      {fixes.length > GROUP_ROWS && (
        <Text style={styles.note}>
          {fill(t.catalog.highest, { count: groupNumber(GROUP_ROWS) })}
        </Text>
      )}
    </>
  );
};

/**
 * A list of objects somebody named, with where each one is once that is known.
 *
 * The highlights and the search results, which are lists whose membership is
 * settled before any arithmetic runs: the names are drawn at once and the line
 * under each fills in when the scan lands. An opened fleet is the other case
 * and cannot work this way — there the scan decides *which* rows there are —
 * so it waits, and says so (`FixList`).
 *
 * Left in the order they were given rather than sorted by height. These are a
 * dozen objects somebody is reading down looking for one particular name, and a
 * list that reordered itself every three seconds as things rose and set is a
 * list nobody can put a finger on.
 */
const EntryRows: React.FC<{
  entries: readonly CatalogEntry[];
  /** The scan's answers by name, empty until it has landed. */
  where: ReadonlyMap<string, DirectoryFix>;
  /** How many rows are already above these, so the last one loses its rule. */
  from: number;
  last: number;
  onSelect: (name: string) => void;
}> = ({ entries, where, from, last, onSelect }) => (
  <>
    {entries.map((entry, row) => (
      <ObjectRow
        key={entry.name}
        name={entry.name}
        category={entry.category}
        parked={entry.parked}
        at={where.get(entry.name) ?? null}
        last={from + row === last}
        onPress={() => onSelect(entry.name)}
      />
    ))}
  </>
);

/** One object: the mark it will turn into, its name, and which way to turn. */
const ObjectRow: React.FC<{
  name: string;
  category: SatelliteCategory;
  parked: boolean;
  /** Where it is, or `null` until the scan that places it has landed. */
  at: DirectoryFix | null;
  last: boolean;
  onPress: () => void;
}> = ({ name, category, parked, at, last, onPress }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={name}
    style={[styles.row, last && styles.rowLast]}
    onPress={onPress}
  >
    <Swatch category={category} parked={parked} />
    <View style={styles.rowText}>
      <Text numberOfLines={1} style={styles.rowName}>
        {name}
      </Text>
      {/* The card's own `Look` figure, in the card's own words: which way to
          turn, and how far up from there. An object that has not risen reads as
          "34° below" rather than as a minus sign — see `lookDirection`. */}
      {at && (
        <Text numberOfLines={1} style={styles.rowMeta}>
          {lookDirection(at)}
        </Text>
      )}
    </View>
    <Icon name="chevron" size={14} color={theme.color.textFaint} />
  </Pressable>
);

/** One fleet: what it is called, how many of it there are, and the way in. */
const GroupRow: React.FC<{
  group: DirectoryGroup;
  last: boolean;
  onPress: () => void;
}> = ({ group, last, onPress }) => {
  const t = strings();
  const name = group.name ?? t.scene.breakdown.other;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      style={[styles.row, last && styles.rowLast]}
      onPress={onPress}
    >
      <Swatch category={group.category} parked={false} />
      <Text numberOfLines={1} style={[styles.rowName, styles.rowNameWide]}>
        {name}
      </Text>
      {/* A phrase rather than a noun, so it is right for one as well as for
          seven thousand: this app's message table has no plurals in it and is
          not the place to start (`src/i18n/index.ts`). */}
      <Text style={styles.count}>
        {fill(t.catalog.objects, { count: groupNumber(group.entries.length) })}
      </Text>
      <Icon name="chevron" size={14} color={theme.color.textFaint} />
    </Pressable>
  );
};

/**
 * The mark the sky would draw for this thing, at the size a list can carry it:
 * a point in its category's colour, or the ring an object parked over the
 * equator gets.
 *
 * The same two channels the overlay and the card use, so a row is tied to the
 * dot it will turn into rather than merely being about it. Colour is the
 * category and shape is whether it holds station — see `CATEGORY_COLORS`.
 */
const Swatch: React.FC<{ category: SatelliteCategory; parked: boolean }> = ({
  category,
  parked
}) => {
  const color = CATEGORY_COLORS[category];
  return (
    <View
      style={[
        styles.swatch,
        parked
          ? { borderColor: color, backgroundColor: "transparent" }
          : { backgroundColor: color, borderColor: cssColor({ color, alpha: 0.3 }) }
      ]}
    />
  );
};

const styles = StyleSheet.create({
  screen: {
    // Over the camera, which keeps running underneath: this is a sheet on the
    // sky rather than a screen the app has navigated to.
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.color.scrim
  },
  /**
   * The title and the search field, which do not scroll.
   *
   * The list under them is thousands of rows long, and a field that scrolled
   * away with it would be a field nobody could reach without going back to the
   * top of the thing they were searching.
   */
  head: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 8
  },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  headText: {
    flex: 1,
    gap: 3
  },
  back: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.color.divider,
    backgroundColor: theme.color.control
  },
  title: {
    color: theme.color.textBright,
    fontSize: 27,
    fontWeight: "600",
    letterSpacing: -0.4
  },
  groupTitle: {
    color: theme.color.textBright,
    fontSize: 19,
    fontWeight: "600",
    letterSpacing: -0.2
  },
  about: {
    color: theme.color.textDim,
    fontSize: 12,
    lineHeight: 17
  },
  search: {
    marginTop: 4,
    borderRadius: theme.radius.control,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.color.divider,
    backgroundColor: theme.color.control
  },
  searchInput: {
    // A thumb-sized target, like every other control in this layer.
    height: 44,
    paddingHorizontal: 14,
    color: theme.color.text,
    fontSize: 14
  },
  scroll: {
    flex: 1
  },
  content: {
    paddingHorizontal: 18,
    // The sheet itself stops at the tab bar (`SkyOverlay`), so this is only
    // the room a list leaves under its last row.
    paddingBottom: 24
  },
  section: {
    marginBottom: 18
  },
  spaced: {
    marginTop: 14
  },
  heading: {
    color: theme.color.textDim,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 7
  },
  group: {
    borderRadius: theme.radius.panel,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: theme.color.divider,
    backgroundColor: theme.color.control,
    overflow: "hidden"
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    // A thumb-sized row, which is what makes a list usable at all.
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: theme.color.divider
  },
  rowLast: {
    borderBottomWidth: 0
  },
  rowText: {
    flex: 1,
    gap: 2
  },
  rowName: {
    color: theme.color.text,
    fontSize: 14,
    fontWeight: "600"
  },
  rowNameWide: {
    flex: 1
  },
  rowMeta: {
    color: theme.color.textDim,
    fontSize: 11,
    fontWeight: "500",
    fontVariant: ["tabular-nums"]
  },
  count: {
    color: theme.color.textDim,
    fontSize: 12,
    fontVariant: ["tabular-nums"]
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth * 2
  },
  note: {
    color: theme.color.textFaint,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 2,
    paddingVertical: 10
  }
});

export default CatalogScreen;
