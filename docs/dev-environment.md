# The dev container, and two things that report themselves wrong

The [root README](../README.md) has what you need to build the image and run
it. This is the rest: the base it is built on, and the two failures on the
dev-client path that name something other than what is actually wrong.

## The image

`docker/Dockerfile` is the only image definition — Node, the build deps some
native modules need at install time, and a system Chromium for the e2e suite.
`.devcontainer/devcontainer.json` wraps it for VS Code, adding mounts and editor
wiring on top of it (`--network=host`, port 8081 forwarded) and setting no
environment of its own.

Two named volumes carry state across a rebuild. `stare-node-modules` holds
`node_modules`, and `stare-home` holds the container's home directory, which is
where everything a rebuild would otherwise discard lives:
the Playwright browser cache, the npm cache, the VS Code server, `~/.gitconfig`
and `~/.ssh/known_hosts`. Deleting either volume is the way to force a clean
one; a plain rebuild keeps both.

The base is Debian 12 (bookworm). Bullseye's LTS ended in August 2026, and its
packages move to `archive.debian.org` after that, which takes `apt-get install
chromium` with them — `docker build --build-arg BASE_IMAGE=...` pins a
different base without editing the file.

## "An unknown error occurred while installing React Native DevTools"

React Native DevTools is an Electron app, and Electron refuses to run as root
without `--no-sandbox`. Its install probe runs the binary with `--version`,
which is fatal under root, and `expo start` reports that as the message above
with a `FATAL` from `electron_main_delegate.cc` underneath.
`ELECTRON_DISABLE_SANDBOX=1` is the answer; the image sets it, and the `start`
and `tunnel` scripts set it again so the commands also work in a shell that did
not inherit it.

## `failed to start tunnel` / `remote gone away`

`--tunnel` runs on Expo's ngrok account, not on one of yours. `@expo/cli`
carries a token and the `exp.direct` domain and writes them to
`~/.expo/ngrok.yml`, so the address is `<randomness>-<user>-<port>.exp.direct`
and there is nothing to sign up for. Which means this pair of messages is not a
credential problem and, despite the message the CLI prints with it, usually not
an ngrok outage either: that is the 2.3.41 agent saying the server closed its
session.

The two things that do it are another agent still holding the session from an
`expo start` that never exited — free ngrok is one session at a time — and a
subdomain collision on that shared account, which the CLI retries three times
with fresh randomness before it gives up. So `pgrep -af ngrok` before retrying,
and `EXPO_TUNNEL_SUBDOMAIN=<unique>` if a collision keeps happening.

If ngrok is genuinely unreachable, forward 8081 by other means (VS Code's Ports
panel will) and point the phone at that address with
`EXPO_PACKAGER_PROXY_URL=https://<host> npm run start` — `UrlCreator` reads it
and rewrites every URL handed to the device.
