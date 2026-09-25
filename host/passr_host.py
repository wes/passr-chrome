"""passr native messaging host: bridges the Chrome extension to `pass`/gpg.

Protocol: 4-byte little-endian length + UTF-8 JSON, one request per launch.
Requests:
  {"cmd": "list"}                          -> {"entries": [...]}
  {"cmd": "show", "entry": "a/b"}          -> {"password", "username", "otp"}
  {"cmd": "copy", "entry": "a/b", "field": "password|username|otp"}
"""
import base64
import hashlib
import hmac
import json
import os
import shutil
import struct
import subprocess
import sys
import time
from urllib.parse import parse_qs, unquote, urlparse

STORE = os.path.expanduser(os.environ.get("PASSWORD_STORE_DIR") or "~/.password-store")
CLIP_SECONDS = int(os.environ.get("PASSWORD_STORE_CLIP_TIME") or 45)
USER_KEYS = ("login", "username", "user", "email", "e-mail")


def read_msg():
    raw = sys.stdin.buffer.read(4)
    if len(raw) < 4:
        sys.exit(0)
    (n,) = struct.unpack("<I", raw)
    return json.loads(sys.stdin.buffer.read(n))


def send(obj):
    data = json.dumps(obj).encode()
    sys.stdout.buffer.write(struct.pack("<I", len(data)) + data)
    sys.stdout.buffer.flush()


def list_entries():
    out = []
    for root, dirs, files in os.walk(STORE, followlinks=True):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        rel = os.path.relpath(root, STORE)
        for f in files:
            if f.endswith(".gpg"):
                name = f[:-4]
                out.append(name if rel == "." else f"{rel}/{name}")
    out.sort()
    return out


def entry_path(entry):
    path = os.path.realpath(os.path.join(STORE, entry + ".gpg"))
    if not path.startswith(os.path.realpath(STORE) + os.sep) or not os.path.isfile(path):
        raise ValueError(f"no such entry: {entry}")
    return path


GUI_PINENTRIES = ("pinentry-mac", "pinentry-gnome3", "pinentry-qt", "pinentry-gtk-2", "pinentry-gtk")


def run_gpg(path, passphrase=None):
    # Never let gpg-agent spawn its own pinentry: the configured one is often a
    # TTY pinentry, which fails without a terminal ("Inappropriate ioctl for device").
    args = ["gpg", "--decrypt", "--quiet", "--batch", "--yes", "--compress-algo=none", "--no-encrypt-to"]
    if passphrase is None:
        args += ["--pinentry-mode", "error"]
    else:
        args += ["--pinentry-mode", "loopback", "--passphrase-fd", "0"]
    p = subprocess.run(args + [path], capture_output=True,
                       input=None if passphrase is None else passphrase.encode() + b"\n")
    return p.returncode, p.stdout, p.stderr.decode(errors="replace").strip()


def decrypt(entry):
    path = entry_path(entry)
    code, out, err = run_gpg(path)
    error = None
    for _ in range(3):
        if code == 0:
            return out.decode(errors="replace")
        low = err.lower()
        if not ("no pinentry" in low or "bad passphrase" in low or "inappropriate ioctl" in low):
            raise RuntimeError(err or "gpg failed")
        # Key is locked (or the last attempt was wrong): ask with a GUI prompt, decrypt via
        # loopback. gpg-agent caches the passphrase, so later requests don't prompt.
        pw = ask_passphrase(entry, error)
        code, out, err = run_gpg(path, pw)
        error = "Wrong passphrase, try again."
    raise RuntimeError("Wrong passphrase.")


def ask_passphrase(entry, error=None):
    desc = f"Enter your GPG passphrase to unlock “{entry}”."
    for prog in GUI_PINENTRIES:
        if shutil.which(prog):
            return pinentry_getpin(prog, desc, error)
    if sys.platform == "darwin":
        return osascript_getpin(desc, error)
    raise RuntimeError("GPG key is locked and no GUI pinentry is installed "
                       "(install pinentry-gnome3 or pinentry-qt), or unlock it in a terminal first.")


def pinentry_getpin(prog, desc, error=None):
    """Drive a pinentry program directly over the Assuan protocol."""
    esc = lambda s: s.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    p = subprocess.Popen([prog], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)

    def cmd(line=None):
        if line is not None:
            p.stdin.write(line.encode() + b"\n")
            p.stdin.flush()
        data = []
        while True:
            resp = p.stdout.readline().decode(errors="replace").rstrip("\n")
            if resp.startswith("D "):
                data.append(resp[2:])
            elif resp.startswith("OK"):
                return "".join(data)
            elif resp.startswith("ERR") or not resp:
                raise RuntimeError("Unlock cancelled.")

    try:
        cmd()  # greeting
        cmd("SETTITLE passr")
        cmd("SETDESC " + esc(desc))
        cmd("SETPROMPT Passphrase:")
        if error:
            cmd("SETERROR " + esc(error))
        pin = unquote(cmd("GETPIN"))
        p.stdin.write(b"BYE\n")
        p.stdin.flush()
        return pin
    finally:
        p.stdin.close()
        p.wait()


def osascript_getpin(desc, error=None):
    text = f"{error}\n\n{desc}" if error else desc
    script = (
        "on run argv\n"
        "  activate\n"
        "  text returned of (display dialog (item 1 of argv) with title \"passr\" "
        "default answer \"\" with hidden answer with icon caution "
        "buttons {\"Cancel\", \"Unlock\"} default button \"Unlock\")\n"
        "end run"
    )
    p = subprocess.run(["osascript", "-e", script, text], capture_output=True)
    if p.returncode != 0:
        raise RuntimeError("Unlock cancelled.")
    return p.stdout.decode().rstrip("\n")


def totp(uri):
    u = urlparse(uri)
    q = {k: v[0] for k, v in parse_qs(u.query).items()}
    secret = q["secret"].upper().replace(" ", "")
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    period = int(q.get("period", 30))
    digits = int(q.get("digits", 6))
    algo = getattr(hashlib, q.get("algorithm", "SHA1").lower())
    counter = struct.pack(">Q", int(time.time()) // period)
    h = hmac.new(key, counter, algo).digest()
    o = h[-1] & 0x0F
    code = (struct.unpack(">I", h[o:o + 4])[0] & 0x7FFFFFFF) % (10 ** digits)
    return str(code).zfill(digits)


def parse(entry, text):
    lines = text.splitlines()
    password = lines[0] if lines else ""
    username = otp = None
    for line in lines[1:]:
        s = line.strip()
        if s.startswith("otpauth://"):
            otp = totp(s)
            continue
        if ":" in s and not username:
            k, v = s.split(":", 1)
            if k.strip().lower() in USER_KEYS and v.strip():
                username = v.strip()
    if password.startswith("otpauth://"):
        otp, password = totp(password), ""
    if not username and "/" in entry:
        # browserpass convention: site/username
        username = unquote(entry.rsplit("/", 1)[1])
    return {"password": password, "username": username or "", "otp": otp}


def clipboard_cmds():
    """(copy, paste) argv for this platform."""
    if sys.platform == "darwin":
        return ["pbcopy"], ["pbpaste"]
    if os.environ.get("WAYLAND_DISPLAY") and shutil.which("wl-copy"):
        return ["wl-copy"], ["wl-paste", "--no-newline"]
    if shutil.which("xclip"):
        return ["xclip", "-selection", "clipboard"], ["xclip", "-selection", "clipboard", "-o"]
    if shutil.which("xsel"):
        return ["xsel", "--clipboard", "--input"], ["xsel", "--clipboard", "--output"]
    raise RuntimeError("No clipboard tool found. Install wl-clipboard, xclip or xsel.")


def set_clipboard(cmd, data):
    # X11/Wayland copy tools fork to own the selection; don't wait on their pipes.
    subprocess.run(cmd, input=data, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)


def copy_to_clipboard(value):
    copy_cmd, paste_cmd = clipboard_cmds()
    set_clipboard(copy_cmd, value.encode())
    digest = hashlib.sha256(value.encode()).hexdigest()
    # Double-fork a detached child that clears the clipboard later if unchanged,
    # so it survives Chrome tearing down the host process.
    if os.fork() == 0:
        os.setsid()
        if os.fork() == 0:
            devnull = os.open(os.devnull, os.O_RDWR)
            for fd in (0, 1, 2):
                os.dup2(devnull, fd)
            time.sleep(CLIP_SECONDS)
            cur = subprocess.run(paste_cmd, capture_output=True).stdout
            if hashlib.sha256(cur).hexdigest() == digest:
                set_clipboard(copy_cmd, b"")
        os._exit(0)
    os.wait()


def handle(req):
    cmd = req.get("cmd")
    if cmd == "list":
        return {"entries": list_entries()}
    if cmd == "show":
        return parse(req["entry"], decrypt(req["entry"]))
    if cmd == "copy":
        field = req.get("field", "password")
        value = parse(req["entry"], decrypt(req["entry"])).get(field)
        if not value:
            raise ValueError(f"entry has no {field}")
        copy_to_clipboard(value)
        return {"ok": True, "seconds": CLIP_SECONDS}
    raise ValueError(f"unknown cmd: {cmd}")


def main():
    req = read_msg()
    try:
        send(handle(req))
    except Exception as e:  # report every failure to the popup
        send({"error": str(e)})


if __name__ == "__main__":
    main()
