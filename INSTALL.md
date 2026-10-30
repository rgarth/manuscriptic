# Building Manuscriptic from source

These instructions are for building on a Mac. That is the system I run. Windows executables are on the [releases page](https://github.com/rgarth/manuscriptic/releases). Linux is untested.

There is no support and no warranty. Read the warning in [README.md](README.md) before you trust this with a book.

If you want the app, and not the source, get the latest disk image from the [releases page](https://github.com/rgarth/manuscriptic/releases). The notes there explain how to open it when Apple refuses to run an unsigned app.

## Requirements

- macOS
- [Rust](https://www.rust-lang.org/tools/install), on your `PATH`
- Node.js and npm
- The Xcode command line tools: `xcode-select --install`

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

On a Mac, the app is written to `src-tauri/target/release/bundle/macos/`.

## Tests

```
npm test
```

Rust needs to be on `PATH`.
