/**
 * The one word on screen that is not translated.
 *
 * The console is the debug view: sensor readouts, filter states, catalogue
 * ages and the build identity — figures whose labels are the names of things
 * in this codebase, read by whoever is diagnosing a phone that is drawing the
 * sky in the wrong place. Translating those labels would make the panel harder
 * to act on, not easier, because the person reading a screenshot of it is
 * reading it against the source.
 *
 * "Console" rather than "Debug" because it is the more portable of the two
 * words: it is a loanword in most of the languages this app ships in, where
 * "debug" is jargon that has only travelled among programmers. The intro page
 * that keys the panels says outright that what is behind this button is in
 * English, so the one untranslated word is explained rather than surprising.
 */
export const CONSOLE_LABEL = "CONSOLE";
