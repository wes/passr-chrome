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

// All host requests go through the background worker, which outlives the popup
// (it closes when the passphrase dialog takes focus).
async function native(msg) {
  const res = await chrome.runtime.sendMessage(msg);
  if (res?.error) {
    clearFlag();
    throw new Error(res.error);
  }
  return res;
}

function clearFlag() {
  chrome.action.setBadgeText({ text: "" });
  chrome.storage.session.remove("lastError");
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
    await native({ cmd: "fill", entry, tabId: tab.id });
    window.close();
  } catch (e) {
    status(e.message, true);
  }
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
    chrome.storage.session.get(["entries", "lastError"]),
    chrome.tabs.query({ active: true, currentWindow: true }),
  ]);
  tab = tabs[0];
  site = tab?.url && /^https?:/.test(tab.url) ? siteInfo(tab.url) : null;
  $site.textContent = site?.domain || "";
  if (cached.entries) { entries = cached.entries; render(); }
  if (cached.lastError) { status(cached.lastError, true); clearFlag(); }

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
