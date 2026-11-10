# Building Manuscriptic from source

Windows, Mac, and Linux AppImage builds are on the [releases page](https://github.com/rgarth/manuscriptic/releases). These instructions are for building from source.

There is no support and no warranty. Read the warning in [README.md](README.md) before you trust this with a book.

## Requirements

- [Rust](https://www.rust-lang.org/tools/install), on your `PATH`
- Node.js and npm

### macOS

- The Xcode command line tools: `xcode-select --install`

### Linux (Fedora)

```
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file \
  libappindicator-gtk3-devel librsvg2-devel libxdo-devel gcc gcc-c++ make patchelf
```

### Linux (Debian / Ubuntu)

```
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf
```

## Run from source

In this repository:

```
npm install
npm run tauri dev
```

`npm run tauri dev` opens the Manuscriptic window. It also starts a local server so the window can load the interface. That server is only there while you are developing. The shipped app is a desktop program.

## Build an app

```
npm run tauri build
```

- macOS: `src-tauri/target/release/bundle/macos/`
- Windows: `src-tauri/target/release/bundle/nsis/` (and MSI when that target is enabled)
- Linux AppImage only:

```
npm run tauri:build:appimage
```

The AppImage lands in `src-tauri/target/release/bundle/appimage/`. Make it executable and run it:

```
chmod a+x src-tauri/target/release/bundle/appimage/*.AppImage
./src-tauri/target/release/bundle/appimage/*.AppImage
```

The AppImage embeds the Manuscriptic icon, but Linux file managers still show a generic AppImage glyph until the desktop entry is installed. After a build:

```
./scripts/install-linux-icons.sh dist-linux/Manuscriptic_*_aarch64.AppImage
```

Then open Manuscriptic from the app menu; the dock and launcher use the M icon.

Build the AppImage on the architecture you want to ship (`aarch64` or `x86_64`). AppImage tooling does not cross-compile cleanly, so use a native machine or an emulator for the other CPU.

GitHub Actions workflow [`.github/workflows/linux-appimage.yml`](.github/workflows/linux-appimage.yml) builds both AppImages on push of a `v*` tag, or when started by hand.

## Tests

```
npm test
```

Rust needs to be on `PATH`.
