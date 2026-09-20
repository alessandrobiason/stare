# What the operating system asks, in the reader's language

The three sentences iOS shows inside its own camera, location and motion
prompts. They are not part of `src/i18n`, and cannot be: they are read by the
operating system out of the app bundle before a line of JavaScript runs, so
they have to exist as native resources rather than as strings the app looks
up.

`app.json`'s `expo.locales` points at these files. On `expo prebuild`, Expo
turns each one into `ios/Stare/Supporting/<lang>.lproj/InfoPlist.strings` and
adds it to the Xcode project as a bundled resource — which is what makes iOS
treat the app as localized for that language and pick the matching prompt.
English also lives in `app.json`'s `ios.infoPlist`, which is the base the
system falls back to for a language not listed here.

**Keep these short and keep them true.** They are read in a modal, by someone
deciding whether to say no, seconds after the intro's last page has explained
why the app is about to ask (`src/i18n` → `intro.access`). The two wordings of
the same permission are deliberately different: the intro page has room to
explain, the prompt has one line to justify.

`NSMotionUsageDescription` is written by two plugins — `expo-location`'s
`motionUsagePermission` and `expo-sensors`'s `motionPermission` — and iOS shows
it when the attitude stream starts rather than at the same moment as the other
two. It is easy to leave untranslated for exactly that reason: it is the one
prompt that does not appear during the intro's run of three.

## Two constraints

**One file per language the app speaks**, matching `LOCALES` in
`src/i18n/locale.ts`. The suite in `__tests__/i18n.test.ts` checks the two
lists against each other.

**No double quotes, backslashes or newlines in a value.** Expo writes these
into a `.strings` file as `KEY = "value";` without escaping anything, so a
quotation mark inside a sentence would end the string early and leave the file
unparseable — which fails at build time, or worse, ships a prompt with no text
in it. The suite checks that too. Use a typographic quote if you need one.
