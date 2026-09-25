# passr privacy policy

_Last updated: September 24, 2026_

passr is a browser front end for [`pass`](https://www.passwordstore.org/). It runs entirely on your computer.

- **passr collects nothing.** No analytics, telemetry, crash reports or accounts.
- **passr makes no network requests.** The extension and its helper never contact any server, including ours.
- **Your passwords stay local.** Entries are decrypted on your machine by your own `gpg`, through a helper the browser runs via Chrome's native messaging. A decrypted value is used for exactly one of these:
  - filled into the page you're on, when you press Enter,
  - put on your clipboard, when you ask to copy it (it's cleared after 45 seconds).

  Decrypted values are never stored anywhere.
- **What is stored:** the list of entry *names* (not their contents) is kept in the browser's in-memory session storage, so the popup opens instantly. It's gone when the browser closes.
- **Page access:** passr reads or changes a page only when you trigger a fill, and then only to find the login fields and fill them. It uses Chrome's `activeTab` permission, so it has no standing access to any site.

The source code is public: https://github.com/wes/passr-chrome

Questions: open an issue at https://github.com/wes/passr-chrome/issues
