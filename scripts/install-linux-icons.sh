#!/usr/bin/env bash
# Install Manuscriptic icons and a desktop entry for a built AppImage.
# The AppImage already embeds the icon; Linux file managers still need this
# local install before the dock / app menu show it.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
appimage="${1:-}"
if [[ -z "$appimage" ]]; then
  appimage="$(ls -1 "$root"/dist-linux/Manuscriptic_*_aarch64.AppImage "$root"/dist-linux/Manuscriptic_*_amd64.AppImage 2>/dev/null | head -1 || true)"
fi
if [[ -z "$appimage" || ! -f "$appimage" ]]; then
  echo "Usage: $0 /path/to/Manuscriptic_*.AppImage" >&2
  exit 1
fi
appimage="$(readlink -f "$appimage")"

icons="$HOME/.local/share/icons/hicolor"
apps="$HOME/.local/share/applications"
tmpdir="${TMPDIR:-/tmp}/manuscriptic-icon-install-$$"
mkdir -p "$tmpdir" "$apps"
trap 'rm -rf "$tmpdir"' EXIT

export APPIMAGE_EXTRACT_AND_RUN=1
export TMPDIR="$tmpdir"
(
  cd "$tmpdir"
  "$appimage" --appimage-extract >/dev/null
)

extract="$tmpdir/squashfs-root"
for size in 32x32 64x64 128x128; do
  mkdir -p "$icons/$size/apps"
  cp -f "$extract/usr/share/icons/hicolor/$size/apps/manuscriptic.png" "$icons/$size/apps/manuscriptic.png"
done
mkdir -p "$icons/256x256/apps"
cp -f "$extract/Manuscriptic.png" "$icons/256x256/apps/manuscriptic.png"
if [[ -f "$root/src-tauri/icons/icon.png" ]]; then
  mkdir -p "$icons/512x512/apps"
  cp -f "$root/src-tauri/icons/icon.png" "$icons/512x512/apps/manuscriptic.png"
fi

cat > "$apps/manuscriptic.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Manuscriptic
Comment=Desktop app for novel manuscripts
Exec=$appimage %F
Icon=manuscriptic
Terminal=false
Categories=Office;WordProcessor;
MimeType=application/x-manuscriptic;
StartupWMClass=manuscriptic
EOF

gtk-update-icon-cache -f -t "$icons" 2>/dev/null || true
update-desktop-database "$apps" 2>/dev/null || true
echo "Installed desktop entry: $apps/manuscriptic.desktop"
echo "Launch Manuscriptic from the app menu to see the icon."
