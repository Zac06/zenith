#!/bin/sh
# Install Zenith on Linux (AppImage) or macOS (dmg) from the latest GitHub release.
# Usage: curl -fsSL https://zac06.github.io/zenith/install.sh | sh
set -eu

die() { printf 'zenith: %s\n' "$*" >&2; exit 1; }
say() { printf '%s\n' "$*"; }

command -v curl >/dev/null 2>&1 || die "curl is required"

# shortcut: asset names follow .github/workflows/release.yml; update if they change
tag=$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/zac06/zenith/releases/latest) ||
  die "could not reach GitHub"
tag=${tag##*/}
[ -n "$tag" ] || die "could not find the latest release"
ver=${tag#v}
base="https://github.com/zac06/zenith/releases/download/$tag"

# Checks the download against the SHA256SUMS asset the release job publishes.
verify() {
  res=$(curl -sSL -w '\n%{http_code}' "$base/SHA256SUMS" 2>/dev/null || true)
  code=$(printf '%s\n' "$res" | tail -n 1)
  if [ "$code" = "404" ]; then
    # shortcut: v0.2.5 shipped without SHA256SUMS; refuse instead once every supported release has one
    say "Warning: this release publishes no SHA256SUMS, so the download was not verified."
    return 0
  fi
  [ "$code" = "200" ] || { say "Could not download SHA256SUMS (HTTP $code)." >&2; return 1; }
  want=$(printf '%s\n' "$res" | sed '$d' | awk -v f="$1" '$2 == f { print $1; exit }')
  if [ -z "$want" ]; then say "SHA256SUMS has no entry for $1." >&2; return 1; fi
  if command -v sha256sum >/dev/null 2>&1; then got=$(sha256sum "$2"); else got=$(shasum -a 256 "$2"); fi
  if [ "${got%% *}" != "$want" ]; then
    say "Checksum mismatch for $1: the download is corrupted or was tampered with." >&2
    return 1
  fi
  say "Checksum verified."
}
case $(uname -s) in
Linux)
  case $(uname -m) in
  x86_64 | amd64) ;;
  *) die "no Linux build for $(uname -m) yet (x86_64 only)" ;;
  esac
  file="Zenith_${ver}_amd64.AppImage"
  dir=$HOME/.local/bin
  mkdir -p "$dir" || die "could not create $dir"
  tmp=$dir/.zenith-download
  say "Downloading $file"
  curl -fL --progress-bar "$base/$file" -o "$tmp" || { rm -f "$tmp"; die "download failed"; }
  verify "$file" "$tmp" || { rm -f "$tmp"; die "install stopped"; }
  chmod +x "$tmp" && mv "$tmp" "$dir/zenith" || die "could not install to $dir"
  say "Zenith $ver installed as $dir/zenith."
  case :$PATH: in
  *:$dir:*) ;;
  *) say "Add $dir to your PATH, then run: zenith" ;;
  esac
  if command -v ldconfig >/dev/null 2>&1 && ! ldconfig -p 2>/dev/null | grep -q 'libfuse\.so\.2'; then
    say "Note: install libfuse2 if Zenith does not start (or run APPIMAGE_EXTRACT_AND_RUN=1 zenith)."
  fi
  ;;
Darwin)
  file="Zenith_${ver}_universal.dmg"
  tmp=$(mktemp -d) || die "could not create a temporary folder"
  mnt=$tmp/mnt
  trap 'hdiutil detach "$mnt" -quiet 2>/dev/null || true; rm -rf "$tmp"' EXIT
  say "Downloading $file"
  curl -fL --progress-bar "$base/$file" -o "$tmp/Zenith.dmg" || die "download failed"
  verify "$file" "$tmp/Zenith.dmg" || die "install stopped"
  mkdir "$mnt"
  hdiutil attach "$tmp/Zenith.dmg" -nobrowse -quiet -mountpoint "$mnt" || die "could not open the disk image"
  app=$mnt/Zenith.app
  if [ ! -d "$app" ]; then
    app=$(ls -d "$mnt"/*.app 2>/dev/null | head -n1)
  fi
  [ -d "$app" ] || die "the disk image does not contain an app"
  dest=/Applications
  [ -w "$dest" ] || { dest=$HOME/Applications; mkdir -p "$dest"; }
  rm -rf "$dest/Zenith.app"
  cp -R "$app" "$dest/" || die "could not copy Zenith to $dest"
  say "Zenith $ver installed in $dest."
  say "The app is not notarized: on first launch, right-click Zenith and choose Open."
  ;;
*)
  die "this script supports Linux and macOS; on Windows use the installer on the download page"
  ;;
esac
