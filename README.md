# Manuscriptic

Manuscriptic is a desktop app for writing novel manuscripts. It runs on macOS, Windows, and Linux.

## Run

Install [Rust](https://www.rust-lang.org/tools/install), then:

```
npm install
npm run tauri dev
```

`npm run tauri dev` opens the Manuscriptic window. While developing, it also starts a local server so the window can load the interface. That server is only for development. The app you ship is a desktop program and does not run in a browser.
