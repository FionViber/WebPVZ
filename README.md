# WebPVZ

Plants vs. Zombies: Game of the Year Edition for the browser and desktop.

[Play in English](https://fionviber.github.io/WebPVZ/) · [Play in Simplified Chinese](https://fionviber.github.io/WebPVZ/zh-cn/) · [Download](https://github.com/FionViber/WebPVZ/releases/latest)

## Browser

The main link opens the English edition. Both browser editions require the page password. Game progress is stored in your browser; clearing site data removes it. The two editions have separate saves.

To use a downloaded web edition, extract the whole archive and open `index.html` in a current browser. Keep the `assets` and `default-save` folders alongside it.

## Desktop downloads

Choose `EN` for English or `SC` for Simplified Chinese. Desktop downloads do not require the page password.

| System | Package suffix |
| --- | --- |
| Windows, Intel or AMD 64-bit | `Windows-x64.zip` |
| macOS, Apple silicon | `macOS-arm64.zip` |
| macOS, Intel | `macOS-x64.zip` |
| Linux, Intel or AMD 64-bit | `Linux-x64.zip` |
| Linux, ARM64 | `Linux-arm64.zip` |

Extract the whole archive. On Windows, run the included `.exe`. On macOS, move the `.app` to Applications. On Linux, use an extraction tool that preserves executable permissions, then run the application from its folder. Linux requires a graphical desktop and Electron's system libraries.

The macOS applications are not signed or notarised. The supplied macOS and Linux packages have not been tested on those operating systems.

English and Simplified Chinese desktop editions keep separate save folders. Do not copy only the executable: the accompanying files are required.

## Files

- `docs/`: password-protected English browser edition, published with GitHub Pages.
- `docs/zh-cn/`: password-protected Simplified Chinese browser edition.
- `desktop/EN/` and `desktop/SC/`: Electron application source, game files and icons.
- Release assets: desktop packages, protected web archives and `SHA256SUMS.txt`.

To run a desktop edition from source, open its folder, run `npm install`, then `npm start`. Both editions use Electron 45.2.2.

PageCrypt 7.1.0 encrypts the browser entry pages. It does not encrypt the game assets or the desktop source. Passwords are not included in this repository. Desktop packages retain the supplied files unchanged. The `1.0.0` release number identifies this distribution.
