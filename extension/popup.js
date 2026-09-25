const HOST = "com.passr.host";
const MAX_ROWS = 150;

const $q = document.getElementById("q");
const $list = document.getElementById("list");
const $status = document.getElementById("status");
const $site = document.getElementById("site");

let entries = [];
let rows = [];
let sel = 0;
let tab = null;
let site = null;

function native(msg) {
  return chrome.runtime.sendNativeMessage(HOST, msg).then(
    res => {
      if (res?.error) throw new Error(res.error);
      return res;
    },
    err => {
      const m = String(err?.message || err);
      throw new Error(/not found|forbidden/i.test(m)
        ? "passr helper not installed. See github.com/wes/passr-chrome#install"
        : m);
    });
}

function status(text, isErr = false) {
  $status.textContent = text;
  $status.className = isErr ? "err" : "";
}

function render() {
  const q = $q.value.trim();
  const matched = siteMatches(entries, site);
  const matchSet = new Set(matched);
  let list;
  if (q) {
    const found = search(entries, q);
    list = [...found.filter(e => matchSet.has(e)), ...found.filter(e => !matchSet.has(e))];
  } else {
    list = [...matched, ...entries.filter(e => !matchSet.has(e))];
  }
  rows = list.slice(0, MAX_ROWS);
  sel = 0;

  const frag = document.createDocumentFragment();
  if (!q && matched.length) frag.append(sep(`Matches for ${site.domain}`));
  rows.forEach((e, i) => {
    if (!q && matched.length && i === matched.length) frag.append(sep("All"));
    frag.append(row(e, i, matchSet.has(e)));
  });
  $list.replaceChildren(frag);
  highlight();
  if (entries.length && !rows.length) status("No matches");
  else if (!$status.classList.contains("err")) status("");
}

function sep(text) {
  const li = document.createElement("li");
  li.className = "sep";
  li.textContent = text;
  return li;
}

function row(entry, i, isMatch) {
  const li = document.createElement("li");
  li.dataset.i = i;
  const slash = entry.lastIndexOf("/");
  li.innerHTML = `<span class="txt"><div class="name"><span class="dir"></span><span class="base"></span></div></span>
    <span class="acts"><button data-a="password" title="Copy password (⌘C)">pass</button><button data-a="username" title="Copy username (⌘U)">user</button><button data-a="otp" title="Copy OTP (⌘O)">otp</button><button data-a="fill" title="Fill (↵)">fill</button></span>`;
  li.querySelector(".dir").textContent = slash >= 0 ? entry.slice(0, slash + 1) : "";
  li.querySelector(".base").textContent = entry.slice(slash + 1);
  if (isMatch) li.prepend(Object.assign(document.createElement("span"), { className: "match" }));
  li.addEventListener("mousemove", () => { if (sel !== i) { sel = i; highlight(false); } });
  li.addEventListener("click", ev => {
    const a = ev.target.closest("button")?.dataset.a;
    if (!a || a === "fill") fill(entry); else copy(entry, a);
  });
  return li;
}

function highlight(scroll = true) {
  $list.querySelectorAll("li.sel").forEach(li => li.classList.remove("sel"));
  const li = $list.querySelector(`li[data-i="${sel}"]`);
  if (li) {
    li.classList.add("sel");
    if (scroll) li.scrollIntoView({ block: "nearest" });
  }
}

async function copy(entry, field) {
  status(`Decrypting ${entry}…`);
  try {
    const res = await native({ cmd: "copy", entry, field });
    status(`Copied ${field} · clears in ${res.seconds}s`);
    setTimeout(() => window.close(), 700);
  } catch (e) {
    status(e.message, true);
  }
}

async function fill(entry) {
  if (!tab || !site) return copy(entry, "password");
  status(`Decrypting ${entry}…`);
  try {
    const creds = await native({ cmd: "show", entry });
    let results;
    try {
      results = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true }, func: fillCreds, args: [creds.username, creds.password],
      });
    } catch {
      results = await chrome.scripting.executeScript({
        target: { tabId: tab.id }, func: fillCreds, args: [creds.username, creds.password],
      });
    }
    if (results.some(r => r.result)) window.close();
    else status("No login fields found on this page. Use ⌘C to copy instead.", true);
  } catch (e) {
    status(e.message, true);
  }
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

document.addEventListener("keydown", ev => {
  const mod = ev.metaKey || ev.ctrlKey;
  if (ev.key === "ArrowDown" || (ev.ctrlKey && ev.key === "n")) {
    sel = Math.min(sel + 1, rows.length - 1); highlight(); ev.preventDefault();
  } else if (ev.key === "ArrowUp" || (ev.ctrlKey && ev.key === "p")) {
    sel = Math.max(sel - 1, 0); highlight(); ev.preventDefault();
  } else if (!rows[sel]) {
    return;
  } else if (ev.key === "Enter") {
    ev.preventDefault();
    if (ev.shiftKey) copy(rows[sel], "password"); else fill(rows[sel]);
  } else if (mod && ev.key === "c" && $q.selectionStart === $q.selectionEnd) {
    ev.preventDefault(); copy(rows[sel], "password");
  } else if (mod && ev.key === "u") {
    ev.preventDefault(); copy(rows[sel], "username");
  } else if (mod && ev.key === "o") {
    ev.preventDefault(); copy(rows[sel], "otp");
  }
});

$q.addEventListener("input", render);

if (!/Mac/.test(navigator.platform)) {
  document.querySelectorAll("footer kbd").forEach(k => { k.textContent = k.textContent.replace("⌘", "Ctrl+"); });
}

(async () => {
  const [cached, tabs] = await Promise.all([
    chrome.storage.session.get("entries"),
    chrome.tabs.query({ active: true, currentWindow: true }),
  ]);
  tab = tabs[0];
  site = tab?.url && /^https?:/.test(tab.url) ? siteInfo(tab.url) : null;
  $site.textContent = site?.domain || "";
  if (cached.entries) { entries = cached.entries; render(); }

  try {
    const res = await native({ cmd: "list" });
    const changed = JSON.stringify(res.entries) !== JSON.stringify(entries);
    entries = res.entries;
    if (changed) {
      chrome.storage.session.set({ entries });
      const prev = rows[sel];
      render();
      const i = rows.indexOf(prev);
      if (i > 0) { sel = i; highlight(); }
    }
  } catch (e) {
    status(e.message, true);
  }
})();
