# Chrome Web Store submission

Copy and paste into the Developer Dashboard. Upload `dist/passr-<version>.zip` (built with `scripts/build.sh`).

## Store listing

**Name:** passr

**Summary** (132 chars max):
> Fill and copy passwords from pass, the standard unix password manager. Fast, local, keyboard-first.

**Category:** Tools. **Language:** English.

**Description:**
> passr brings your pass (passwordstore.org) password store to Chrome.
>
> Open it on any login page and the entries that match the site are already at the top. Press Enter to fill your username and password. There's nothing to configure, and it works with the store you already have.
>
> • Site matching based on how you named your entries (example.com, example/you, aws/prod…)
> • Fill username + password with Enter, including login forms inside frames
> • Copy password, username or one-time code (TOTP) with one key; the clipboard clears after 45 seconds
> • Built-in TOTP from otpauth:// lines, with no extra pass extension needed
> • Instant fuzzy search across your whole store
> • Keyboard shortcut: Alt+Shift+P
>
> Private by design: passr has no servers, no accounts and no analytics, and it makes no network requests. Entries are decrypted on your machine by your own gpg.
>
> Requires the small passr helper (macOS and Linux). Install it with one command:
> curl -fsSL https://raw.githubusercontent.com/wes/passr-chrome/main/install.sh | bash
>
> Open source (MIT): https://github.com/wes/passr-chrome

**Graphics** (in `store/`):
- Icon: `icon128.png`
- Screenshot: `screenshot-1280x800.png`
- Small promo tile: `promo-440x280.png`

**Homepage URL:** https://github.com/wes/passr-chrome
**Support URL:** https://github.com/wes/passr-chrome/issues

## Privacy practices tab

**Single purpose:**
> Fill and copy credentials from the user's local pass password store into web pages.

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `nativeMessaging` | Talks to the locally installed passr helper, which lists and decrypts entries from the user's pass password store with the user's own gpg. It's the only way the extension gets credentials, and they never leave the machine. |
| `activeTab` | When the user chooses an entry, passr fills the login form on the current tab. activeTab limits this to the tab the user invoked passr on, with no standing site access. |
| `scripting` | Injects a small function into the active tab, only when the user presses Fill, to find the username/password fields and set their values. |
| `storage` | Keeps the list of entry names (not passwords) in session storage so the popup opens instantly. It's cleared when the browser closes. |

**Remote code:** No, I am not using remote code.

**Data usage:** tick **Authentication information**. It's handled locally to fill forms the user chooses; it isn't collected or transmitted. Then tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://github.com/wes/passr-chrome/blob/main/PRIVACY.md

## After the first upload

1. Copy the extension ID the dashboard assigns and set `STORE_ID` in `install.sh`, so the helper accepts the store build. Push that change *before* the listing goes live.
2. Update the "link coming soon" line in the README with the store URL.
