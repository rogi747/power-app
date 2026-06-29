# Chrome Power

![Visualization](pic.png)

---

The first open source ~~fingerprint browser~~ Chrome multi-open management tool. Developed based on Puppeteer, Electron, and React.

This software is licensed under the AGPL, so if you want to modify it and release it, please keep it open source.

For Chromium source code modification, please refer to [chrome-power-chromium](https://github.com/zmzimpl/chrome-power-chromium)

## Disclaimer

This code is only for technical exchange and learning, please do not use it for illegal or commercial purposes. This code only promises not to save any user data and is not responsible for any user data. Please be informed.

## start

Follow these steps to start using this software:

- Download the installation package [Click here to download](https://github.com/TangNPC/chrome-power-app/releases)
- It is recommended to go to the settings page to set your cache directory.
-Create proxy
- Create window
- Create blank window
- Import window
- Import from template
- Import from AdsPower

## Function

- [x] Multi-window management
- [x] proxy settings
- [x] Chinese and English support
- [x] Puppeteer/Playwright/Selenium access
- [x] ~~Support cookie import~~
- [x] Mac installation support
- [x] Extension management
- [x] Synchronous operations
- [ ] Automation scripts

## Run locally/package

Environment: Node v18.18.2, npm 9.8.1

- Install dependencies `npm i`
- Run debugging `npm run watch`
- (Not necessary) Package and deploy `npm run package`. Be careful to stop the development environment when packaging, otherwise the sqlite3 package will not be packaged.

## API Documentation

[Postman API](https://documenter.getpostman.com/view/25586363/2sA3BkdZ61#intro)

## FAQ

### How to set up the cache directory

On the Settings page, click Cache Directory, select your cache directory, and click OK. Note: Do not set the cache directory in the C drive or installation directory, otherwise the update may cause the cache directory to be lost.

### Windows 10 crashes after installation

If you encounter a crash, try after the installation is completed, right-click to start the program - Properties, add --no-sandbox or --in-process-gpu at the end of the target, and try to start again

### The proxy cannot be used

Currently, the proxy only supports socks5 and http. Please check whether the proxy format is correct and whether the local proxy has TUN mode and Global mode enabled. Please file an issue or contact the author after checking.

### Mac automatic arrangement cannot be used

Mac automatic arrangement requires accessibility permissions. You can check the running log. If you are prompted that permissions are missing, please turn it on in Settings - Accessibility.


