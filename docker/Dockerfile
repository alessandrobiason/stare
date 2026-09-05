# syntax=docker/dockerfile:1

# The one container definition in this repo. `.devcontainer/devcontainer.json`
# builds this file and adds only mounts and editor wiring on top of it -- there
# is no second image, and nothing below is set again over there.
#
# The app itself is an iOS binary, which is Xcode's job on macOS. Nothing here
# builds it, and it reaches a phone through TestFlight rather than from this
# machine (docs/ios-builds.md). What this image runs is the web replay harness
# and the checks around it.

# Debian 12. Bullseye's LTS support ended in August 2026, after which its
# packages move off deb.debian.org to archive.debian.org and `apt-get install
# chromium` fails on any rebuild that misses the layer cache. To go back:
#   docker build --build-arg BASE_IMAGE=node:20.19.4-bullseye-slim ...
ARG BASE_IMAGE=node:20.19.4-bookworm-slim
FROM ${BASE_IMAGE}

WORKDIR /app

# Small build deps that some native modules want at install time, plus a system
# Chromium for the e2e suite -- `playwright.config.ts` points `CHROMIUM_PATH` at
# it rather than Playwright's own download, which does not cover every
# distribution.
#
# Chromium's runtime libraries are left to apt to resolve. Listing them by hand
# meant keeping a copy of another package's dependency list, which is redundant
# while it is right and silently wrong the moment a base image renames one.
#
# `chromium --version` is the point of the whole layer, so it is asserted here:
# a browser that failed to install now breaks the build loudly instead of
# surfacing later as a Playwright "executable doesn't exist" at test time.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      chromium \
      curl \
      g++ \
      git \
      make \
      openssh-client \
      python3 \
  && rm -rf /var/lib/apt/lists/* \
  && chromium --version

# Read by playwright.config.ts. The container runs as root, so Chromium needs
# --no-sandbox, which that config already passes.
ENV CHROMIUM_PATH=/usr/bin/chromium

# React Native DevTools is Electron, which likewise needs its sandbox off when
# the container runs as root. Defined once, here: ENV reaches every shell and
# every child process, so neither ~/.bashrc nor devcontainer.json needs a copy.
ENV ELECTRON_DISABLE_SANDBOX=1

# Metro, which serves the web replay to a browser on this machine.
EXPOSE 8081

# No source is copied in. Both ways of running this image supply /app as a mount
# -- the devcontainer's workspace bind and the `docker run -v` in README.md --
# so a COPY would be shadowed at runtime while still baking 600 MB of test data,
# and the private keys under .secrets/, into a layer. .dockerignore keeps the
# build context empty to match.

# The web replay is the only mode this container can run, and the only one it is
# meant to: it is served to a browser on this machine, never to a phone. The
# device path is a TestFlight build -- see docs/ios-builds.md.
CMD ["npm", "run", "web"]
