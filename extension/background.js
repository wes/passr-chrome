// Talks to the native host on the popup's behalf. Requests run here rather than in the
// popup because the popup closes as soon as the passphrase dialog takes focus, and the
// fill or copy should still finish once the key is unlocked.

const HOST = "com.passr.host";

// connectNative (unlike sendNativeMessage) keeps the service worker alive while the
// host waits on the passphrase dialog.
function native(msg) {
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connectNative(HOST);
    let done = false;
    port.onMessage.addListener(res => {
      done = true;
      port.disconnect();
      if (res?.error) reject(new Error(res.error)); else resolve(res);
    });
    port.onDisconnect.addListener(() => {
      if (done) return;
      const m = chrome.runtime.lastError?.message || "passr helper exited unexpectedly";
      reject(new Error(/not found|forbidden/i.test(m)
        ? "passr helper not installed. See github.com/wes/passr-chrome#install"
        : m));
    });
    port.postMessage(msg);
  });
}

async function fill(entry, tabId) {
  const creds = await native({ cmd: "show", entry });
  const args = [creds.username, creds.password];
  let results;
  try {
    results = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: fillCreds, args });
  } catch {
    results = await chrome.scripting.executeScript({ target: { tabId }, func: fillCreds, args });
  }
  const filled = results.some(r => r.result);
  if (!filled) throw new Error("No login fields found on this page. Use ⌘C to copy instead.");
  return { filled };
}

// Runs inside the page. Must be self-contained.
function fillCreds(username, password) {
  const usable = el => !el.disabled && !el.readOnly && el.getClientRects().length > 0 &&
    getComputedStyle(el).visibility !== "hidden";
  const isUserType = el => ["text", "email", "tel"].includes(el.type);
  const set = (el, v) => {
    el.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const inputs = [...document.querySelectorAll("input")].filter(usable);
  const pw = inputs.find(i => i.type === "password");
  let user = null;
  if (pw) {
    for (let i = inputs.indexOf(pw) - 1; i >= 0; i--) {
      if (isUserType(inputs[i])) { user = inputs[i]; break; }
    }
  } else {
    const hint = /user|email|login|account|identifier|name/i;
    const texts = inputs.filter(isUserType);
    user = texts.find(i => hint.test(i.name + i.id + i.autocomplete + i.placeholder + (i.getAttribute("aria-label") || "")))
      || (texts.includes(document.activeElement) ? document.activeElement : null);
  }
  let filled = false;
  if (user && username) { set(user, username); filled = true; }
  if (pw && password) { set(pw, password); filled = true; }
  return filled;
}

// If the popup is gone by the time a request fails (e.g. after the passphrase dialog),
// flag it on the toolbar icon; the popup shows the message next time it opens.
async function flagError(message) {
  await chrome.storage.session.set({ lastError: message });
  chrome.action.setBadgeBackgroundColor({ color: "#d33" });
  chrome.action.setBadgeText({ text: "!" });
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const run = msg.cmd === "fill" ? fill(msg.entry, msg.tabId) : native(msg);
  run.then(reply, e => {
    if (msg.cmd !== "list") flagError(e.message);
    reply({ error: e.message });
  });
  return true;
});
