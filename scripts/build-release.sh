#!/usr/bin/env bash
#
# Builds and verifies the Figtations release artifact.
#
#   ./scripts/build-release.sh [version]
#
# Defaults to the version in package.json; pass one to assert it matches. The
# artifact and its checksum land in .context/release/, which is gitignored — the
# process is version-controlled, the build output is not.
#
# Fail-fast by design. An earlier hand-rolled version of this ran
# `npm run verify | grep …`, where the pipeline's exit code is grep's, not npm's
# — a red lint scrolled past unnoticed, the build step never ran, and the zip was
# packed around a stale dist/. Hence: `set -euo pipefail`, no pipes around any
# command whose exit code matters, and the artifact is re-extracted and diffed
# against dist/ before the checksum is printed.
#
# Staging happens under /tmp, never inside the repo: copying a minified bundle
# into the working tree puts it in front of ESLint.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

VERSION="${1:-$(node -p 'require("./package.json").version')}"
OUT_DIR="$REPO_ROOT/.context/release"
ZIP="$OUT_DIR/figtations-$VERSION.zip"

STAGE=""
EXTRACT=""
cleanup() { [ -n "$STAGE" ] && rm -rf "$STAGE"; [ -n "$EXTRACT" ] && rm -rf "$EXTRACT"; }
trap cleanup EXIT

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
fail() { printf '\033[31mFAILED: %s\033[0m\n' "$1" >&2; exit 1; }

# macOS ships shasum, Linux runners ship sha256sum. Both print "<hash>  <file>".
sha256() {
  if command -v shasum > /dev/null 2>&1; then
    shasum -a 256 "$1" | cut -d' ' -f1
  elif command -v sha256sum > /dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    fail "neither shasum nor sha256sum is available"
  fi
}

step "Version check"
PKG_VERSION="$(node -p 'require("./package.json").version')"
[ "$VERSION" = "$PKG_VERSION" ] || fail "requested $VERSION, package.json says $PKG_VERSION"
echo "package.json: $PKG_VERSION"

step "Clean install"
rm -rf node_modules dist
npm ci

step "Verify (typecheck, lint, test, build)"
# No pipe: npm's exit code has to reach `set -e` intact.
npm run verify

step "Build"
npm run build
[ -f dist/main.js ] || fail "dist/main.js missing"
[ -f dist/ui.html ] || fail "dist/ui.html missing"

step "Reject sourcemaps"
if find dist -name '*.map' -print -quit | grep -q .; then fail "sourcemap file in dist/"; fi
if grep -q "sourceMappingURL" dist/main.js dist/ui.html; then fail "sourceMappingURL in bundle"; fi
echo "none"

step "Confirm the built bundle carries this version"
grep -q "\"v$VERSION\"" dist/ui.html || fail "dist/ui.html does not contain v$VERSION — stale build?"
echo "dist/ui.html declares v$VERSION"

step "Stage under /tmp and pack"
STAGE="$(mktemp -d /tmp/figtations-stage.XXXXXX)"
mkdir -p "$STAGE/dist"
cp manifest.json "$STAGE/manifest.json"
cp dist/main.js dist/ui.html "$STAGE/dist/"
mkdir -p "$OUT_DIR"
rm -f "$ZIP"
( cd "$STAGE" && zip -rX -9 "$ZIP" manifest.json dist > /dev/null )

step "Re-extract and verify the artifact"
EXTRACT="$(mktemp -d /tmp/figtations-verify.XXXXXX)"
unzip -q "$ZIP" -d "$EXTRACT"

diff -q "$EXTRACT/manifest.json" manifest.json > /dev/null || fail "manifest.json differs from source"
diff -q "$EXTRACT/dist/main.js" dist/main.js > /dev/null || fail "dist/main.js differs from build"
diff -q "$EXTRACT/dist/ui.html" dist/ui.html > /dev/null || fail "dist/ui.html differs from build"
echo "all three files byte-identical to the build"

ACTUAL="$(cd "$EXTRACT" && find . -type f | sed 's|^\./||' | sort | tr '\n' ' ')"
EXPECTED="dist/main.js dist/ui.html manifest.json "
[ "$ACTUAL" = "$EXPECTED" ] || fail "unexpected archive contents: $ACTUAL"
echo "contents exactly: $EXPECTED"

node --input-type=module -e '
import { readFileSync, existsSync } from "node:fs"
const dir = process.argv[1]
const m = JSON.parse(readFileSync(`${dir}/manifest.json`, "utf8"))
if (!m.id || !/^[0-9]+$/.test(m.id)) throw new Error(`manifest id missing or not numeric: ${m.id}`)
for (const key of ["main", "ui"]) {
  if (m[key].startsWith("/")) throw new Error(`${key} path is absolute: ${m[key]}`)
  if (!existsSync(`${dir}/${m[key]}`)) throw new Error(`${key} does not resolve: ${m[key]}`)
}
console.log(`manifest valid — id ${m.id}, main ${m.main}, ui ${m.ui}`)
' "$EXTRACT"

step "Scan for anything that must not ship"
if grep -rqE "node_modules/|BEGIN [A-Z ]*PRIVATE KEY|gh[pousr]_[A-Za-z0-9]{20,}" "$EXTRACT"; then
  fail "archive contains node_modules references, key material or a token"
fi
if grep -rq "/Users/" "$EXTRACT"; then fail "archive contains an absolute local path"; fi
echo "clean"

step "Result"
SIZE="$(wc -c < "$ZIP" | tr -d ' ')"
echo "artifact : $ZIP"
echo "size     : $SIZE bytes"
echo "sha-256  : $(sha256 "$ZIP")"
