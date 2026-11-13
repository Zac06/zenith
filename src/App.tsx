import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Image } from "@tauri-apps/api/image";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { useCourseStack } from "./courseStack";
import * as api from "./api";
import logo from "../docs/icon.png";

const P: Record<string, string> = {
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6",
  link: "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7 M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7",
  chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  lock: "M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4",
  check: "M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  folder: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5z",
  notes: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h5",
  down: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3",
  back: "M19 12H5 M12 19l-7-7 7-7",
  out: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
  chev: "M6 9l6 6 6-6",
  dots: "M12 12h.01 M19 12h.01 M5 12h.01",
  x: "M18 6L6 18 M6 6l12 12",
  search: "M21 21l-4.35-4.35 M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
  smile: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M8 14s1.5 2 4 2 4-2 4-2 M9 9h.01 M15 9h.01",
  sliders: "M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6",
  trash: "M3 6h18 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6 M10 11v6 M14 11v6 M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2",
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z",
  eyeoff: "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94 M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19 M1 1l22 22",
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  ext: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6 M15 3h6v6 M10 14L21 3",
  refresh: "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8 M21 3v5h-5 M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16 M8 16H3v5",
  wifi: "M5 12.55a11 11 0 0 1 14.08 0 M1.42 9a16 16 0 0 1 21.16 0 M8.53 16.11a6 6 0 0 1 6.95 0 M12 20h.01",
};
const Icon = ({ n, s = 18 }: { n: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={P[n]} /></svg>
);
const modIcon = (m: string) => ({ resource: "file", url: "link", forum: "chat", chat: "chat", folder: "folder", assign: "check", quiz: "check", choice: "check", feedback: "check" } as any)[m] ?? "book";
const hue = (id: number) => (id * 47) % 360;
const size = (b: number) => (b > 1e6 ? (b / 1e6).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1e3)) + " KB");
const initials = (n: string) =>
  n.split(/[\s\-–]+/).filter((w) => /^\p{L}{3,}/u.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || n[0]?.toUpperCase() || "?";
const tone = (id: number) => `hsl(${hue(id)} 30% 34%)`;
// Moodle's auto-generated covers are data: URIs -> keep our flat colour; real images need the token
// the token is only ever attached to URLs on the Moodle site itself, never to a host named inside course content
const sameOrigin = (site: string, u: string) => { try { return new URL(u, site).origin === new URL(site).origin; } catch { return false; } };
// Same-site Moodle files need the token; plain pluginfile.php only works with a browser session, so use the ws endpoint.
// Relative URLs are made absolute too: on macOS they would otherwise resolve against tauri://localhost and never load.
const tokenised = (u: string, site: string, token: string) => {
  try {
    const abs = new URL(u, site);
    if (abs.origin !== new URL(site).origin) return u;
    if (!/\/(?:webservice\/)?(?:pluginfile|draftfile)\.php(?:\/|$)/.test(abs.pathname)) return abs.toString();
    if (!abs.pathname.includes("/webservice/")) abs.pathname = abs.pathname.replace(/\/(pluginfile|draftfile)\.php/, "/webservice/$1.php");
    abs.searchParams.set("token", token);
    return abs.toString();
  } catch { return u; }
};
const realImage = (u: string | undefined, site: string, token: string) => (u && !u.startsWith("data:") ? tokenised(u, site, token) : null);
const isHtmlFile = (f: api.FileItem) => /\.html?$/i.test(f.filename) || f.mimetype === "text/html";
const isHtmlUrl = (u: URL) => /\.html?$/i.test(u.pathname);
// A plain pluginfile.php URL only authenticates a browser session; the webservice path is the one that accepts a token.
const webserviceUrl = (u: URL) => {
  const x = new URL(u);
  if (x.pathname.includes("/pluginfile.php/") && !x.pathname.includes("/webservice/")) x.pathname = x.pathname.replace("/pluginfile.php/", "/webservice/pluginfile.php/");
  return x.toString();
};
if (import.meta.env.DEV) {
  console.assert(tokenised("/pluginfile.php/1/a.png", "https://m.uni.edu", "t") === "https://m.uni.edu/webservice/pluginfile.php/1/a.png?token=t");
  console.assert(tokenised("https://other.edu/a.png", "https://m.uni.edu", "t") === "https://other.edu/a.png");
}
// Same-site Moodle links the app can show without fetching a full page. A forum link may carry the forum
// instance (f=) or the course module (id=); the other activities only take a course module id.
type ModLink = { kind: "course" | "forum" | "assign" | "chat"; id: number; instance?: boolean };
const moodleLink = (u: URL, site: string): ModLink | null => {
  if (u.origin !== new URL(site).origin) return null;
  const n = (k: string) => Number(u.searchParams.get(k)) || 0;
  if (u.pathname.endsWith("/course/view.php")) return n("id") ? { kind: "course", id: n("id") } : null;
  if (u.pathname.endsWith("/mod/forum/view.php")) {
    if (n("f")) return { kind: "forum", id: n("f"), instance: true };
    return n("id") ? { kind: "forum", id: n("id") } : null;
  }
  if (u.pathname.endsWith("/mod/assign/view.php")) return n("id") ? { kind: "assign", id: n("id") } : null;
  if (u.pathname.endsWith("/mod/chat/view.php")) return n("id") ? { kind: "chat", id: n("id") } : null;
  return null;
};
if (import.meta.env.DEV) {
  console.assert(moodleLink(new URL("https://m.uni.edu/mod/assign/view.php?id=7"), "https://m.uni.edu")?.id === 7, "assignment link is internal");
  console.assert(moodleLink(new URL("https://m.uni.edu/mod/forum/view.php?f=3"), "https://m.uni.edu")?.instance === true, "forum instance link is internal");
  console.assert(moodleLink(new URL("https://m.uni.edu/mod/chat/view.php?id=9"), "https://m.uni.edu")?.kind === "chat", "chat link is internal");
  console.assert(moodleLink(new URL("https://other.edu/course/view.php?id=1"), "https://m.uni.edu") === null, "foreign links stay external");
  console.assert(webserviceUrl(new URL("https://m.uni.edu/pluginfile.php/1/mod_resource/x.html")) === "https://m.uni.edu/webservice/pluginfile.php/1/mod_resource/x.html", "html files use the token endpoint");
}
// Alt+Left / Alt+Right is the desktop convention for back / forward. Plain arrows and text editing stay untouched.
const navKey = (e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; key: string }) =>
  e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey ? (e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0) : 0;
if (import.meta.env.DEV) {
  console.assert(navKey({ altKey: true, ctrlKey: false, metaKey: false, shiftKey: false, key: "ArrowLeft" }) === -1, "Alt+Left goes back");
  console.assert(navKey({ altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, key: "ArrowLeft" }) === 0, "plain arrows are left alone");
}
// A two-finger trackpad swipe arrives as horizontal wheel deltas. Firefox goes back on a left swipe; the OS
// scroll direction setting flips which way is positive, so the same delta means the opposite swipe.
const swipeDir = (dx: number, natural: boolean) => (Math.abs(dx) > 120 ? Math.sign(dx) * (natural ? -1 : 1) : 0);
if (import.meta.env.DEV) {
  console.assert(swipeDir(-150, false) === -1 && swipeDir(150, false) === 1 && swipeDir(-40, false) === 0, "swipe left goes back");
  console.assert(swipeDir(150, true) === -1, "natural scrolling flips the swipe");
}
// Saved API answers, so courses that were already opened stay readable without a connection.
const CACHE = "zenith:cache:";
const cacheGet = <T,>(k: string): T | undefined => { try { const v = localStorage.getItem(CACHE + k); return v === null ? undefined : JSON.parse(v) as T; } catch { return undefined; } };
const cacheSet = (k: string, v: unknown) => {
  const s = JSON.stringify(v);
  try { localStorage.setItem(CACHE + k, s); } catch {
    // storage is full: drop the per-course answers (they refill as courses are opened) and try once more. shortcut: no LRU
    for (const x of Object.keys(localStorage)) if (/^zenith:cache:(contents|assigns|html|forum):/.test(x)) localStorage.removeItem(x);
    try { localStorage.setItem(CACHE + k, s); } catch {}
  }
};
const cacheClear = () => { for (const k of Object.keys(localStorage)) if (k.startsWith(CACHE)) localStorage.removeItem(k); };
// A dropped connection must never sign anyone out: only Moodle rejecting the token should.
const authError = (e: unknown) => /invalid\s*token|servicerequireslogin|usernotloggedin/i.test(String(e));
// A saved HTML file links its pictures relative to its own pluginfile folder; make those absolute before sanitising.
const absolutise = (html: string, base: string) => {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("[src],[href],[poster]").forEach((el) => {
    for (const a of ["src", "href", "poster"]) {
      const v = el.getAttribute(a);
      if (v && !/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(v)) el.setAttribute(a, new URL(v, base).toString());
    }
  });
  return doc.body.innerHTML;
};
const FILTERS: [api.Filter, string][] = [["all", "All"], ["inprogress", "In progress"], ["future", "Future"], ["past", "Ended"], ["favourites", "Favourites"], ["hidden", "Hidden"]];

function Login({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState(""); const [site, setSite] = useState<{ site: string; config: any } | null>(null);
  const [user, setUser] = useState(""); const [pass, setPass] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.takeSsoError().then((m) => { if (m) { setMsg(m); setBusy(false); } }).catch(() => {});
    const a = listen("sso-complete", onDone); const b = listen<string>("sso-error", (e) => { setMsg(e.payload); setBusy(false); });
    return () => { a.then((f) => f()); b.then((f) => f()); };
  }, []);
  const sso = site && (site.config.typeoflogin ?? 1) !== 1;
  const connect = async () => {
    setMsg(""); setBusy(true);
    try {
      const s = await api.resolveSite(url);
      if (s.config.typeoflogin === 3) throw new Error("This site signs in inside an embedded browser, which Zenith doesn't support.");
      setSite(s);
    } catch (e) { setMsg(String(e).replace(/^Error: /, "")); }
    setBusy(false);
  };
  const signIn = async () => {
    setMsg(""); setBusy(true);
    try { await api.loginPassword(site!.site, user, pass); onDone(); } catch (e) { setMsg(String(e).replace(/^Error: /, "")); }
    setBusy(false);
  };
  return (
    <div className="login">
      <div className="hero"><h1>Zenith</h1><p>Your Moodle™ courses and files, always at hand.</p><p className="legal">Independent app, not affiliated with or endorsed by Moodle. The word Moodle and associated Moodle logos are trademarks or registered trademarks of Moodle Pty Ltd or its related affiliates.</p></div>
      <div className="panel">
        <h2>{site ? site.config.sitename : "Connect to your university"}</h2>
        {!site ? (<>
          <label>Moodle address</label>
          <input autoFocus autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="url" placeholder="moodle.university.edu" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && connect()} />
          <button className="primary" disabled={busy || !url} onClick={connect}>{busy ? "Connecting…" : "Continue"}</button>
        </>) : sso ? (<>
          <p className="muted">You'll sign in through your institution in your browser, then return here.</p>
          <button className="primary" onClick={() => { setMsg(""); api.startSso(site.site, site.config.wwwroot).then(() => setMsg("Finish signing in in your browser. You can close that tab afterwards.")).catch((e) => setMsg(String(e))); }}>Sign in with your institution</button>
        </>) : (<>
          <label>Username</label><input autoCapitalize="none" autoCorrect="off" spellCheck={false} value={user} onChange={(e) => setUser(e.target.value)} />
          <label>Password</label><input type="password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && signIn()} />
          <button className="primary" disabled={busy || !user || !pass} onClick={signIn}>{busy ? "Signing in…" : "Sign in"}</button>
        </>)}
        {site && <button className="ghost" onClick={() => { setSite(null); setMsg(""); }}>Use a different site</button>}
        {msg && <p className="msg">{msg}</p>}
        {site && sso && msg && <button className="ghost" onClick={() => api.openExternal(`${site.site}/login/logout.php`)}>Browser says "guests are not allowed"? Reset its Moodle session</button>}
      </div>
    </div>
  );
}

const hasContent = (h?: string) => !!h && (/<(img|a)\b/i.test(h) || h.replace(/<[^>]*>|&nbsp;|\s/g, "").length > 0);

// Teachers write this HTML. Images may only come from the Moodle site itself (or data: URIs), so a pasted remote
// picture can't tell another server who is reading. srcset can list several URLs, so it is dropped.
// Moodle sizes emoticons with this class and no width/height; keeping any other class would let content borrow the
// app's own styles (for example the global `.icon` button rules).
const EMOTICON = "emoticon";
let htmlSite = "";
DOMPurify.addHook("afterSanitizeAttributes", (el) => {
  const keep = el.tagName === "IMG" && (el.getAttribute("class") ?? "").split(/\s+/).includes(EMOTICON) ? EMOTICON : "";
  if (keep) el.setAttribute("class", keep); else el.removeAttribute("class");
  for (const a of ["src", "poster", "background"]) {
    const v = el.getAttribute(a);
    if (v && !v.startsWith("data:") && !sameOrigin(htmlSite, v)) el.removeAttribute(a);
  }
});
if (import.meta.env.DEV) {
  const s = DOMPurify.sanitize('<img class="icon emoticon toast" src="/e.png">');
  console.assert(/class="emoticon"/.test(s) && !s.includes("toast") && !s.includes("icon "), "sanitizer keeps only the emoticon class", s);
}

// Moodle HTML (section summaries, labels): sanitised, files get the token, link clicks are routed through onLink
function Html({ html, site, token, onLink }: { html: string; site: string; token: string; onLink: (href: string) => void }) {
  const clean = useMemo(() => {
    htmlSite = site;
    const s = DOMPurify.sanitize(html, { FORBID_ATTR: ["style", "id", "srcset"], FORBID_TAGS: ["style", "form", "input", "button", "image"] });
    // tokenise and absolutise every surviving file URL (relative ones, plain /pluginfile.php and the ws endpoint)
    const doc = new DOMParser().parseFromString(s, "text/html");
    doc.querySelectorAll("[src],[poster]").forEach((el) => {
      for (const a of ["src", "poster"]) {
        const v = el.getAttribute(a);
        if (v) el.setAttribute(a, tokenised(v, site, token));
      }
    });
    return doc.body.innerHTML;
  }, [html, site, token]);
  return <div className="html" dangerouslySetInnerHTML={{ __html: clean }}
    onClick={(e) => { const a = (e.target as HTMLElement).closest("a"); if (!a) return; e.preventDefault(); const h = a.getAttribute("href"); if (h && !h.startsWith("#")) onLink(h); }} />;   // ids are stripped, so a #link has nowhere to go
}

const SUBMISSION: Record<string, string> = { new: "Not submitted", draft: "Draft, not submitted yet", submitted: "Submitted", reopened: "Reopened for a new attempt" };
// Moodle sends restriction messages as HTML
const plain = (h: string) => new DOMParser().parseFromString(h, "text/html").body.textContent?.replace(/\s+/g, " ").trim() ?? "";
// An answer as editable text: line breaks survive, formatting does not.
const toText = (h: string) => (new DOMParser().parseFromString(h.replace(/<br\s*\/?>|<\/(p|div|li|h[1-6])>/gi, "$&\n"), "text/html").body.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
if (import.meta.env.DEV) console.assert(toText("<p>one</p><p>two<br>three &lt; four</p>") === "one\ntwo\nthree < four");
const when = (t: number) => new Date(t * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

const pluginOn = (a: api.Assign, what: "file" | "onlinetext") => {
  // Moodle reports submission plugins with plugin = "file" / "onlinetext" (subtype is "assignsubmission").
  // Feedback plugins reuse the type "file", so exclude them.
  const c = a.configs?.find((x) => x.subtype !== "assignfeedback" && x.plugin === what && x.name === "enabled");
  return c?.value === "1";
};

function AssignRow({ a, site, token, onLink, getFile, onSubmitted, onOpen, page, onClose }: { a: api.Assign; site: string; token: string; onLink: (href: string) => void; getFile: (f: api.FileItem) => void; onSubmitted?: () => void; onOpen?: () => void; page?: boolean; onClose?: () => void }) {
  const [isOpen, setOpen] = useState(false); const [st, setSt] = useState<api.AssignStatus | null>(null); const [err, setErr] = useState("");
  const [text, setText] = useState(""); const [loadedText, setLoadedText] = useState(""); const [picked, setPicked] = useState<string[]>([]); const [saving, setSaving] = useState(false); const [msg, setMsg] = useState(""); const [agreed, setAgreed] = useState(false);
  // Moodle returns the answer as formatted HTML; edit it as plain text and only send it back when changed,
  // so attaching a file to an existing answer never flattens it. shortcut: rich formatting is lost on edit.
  const load = () => api.assignStatus(a.id).then((s) => { setSt(s); const t = toText(s.text ?? ""); setText(t); setLoadedText(t); setErr(""); }).catch((e) => setErr(String(e)));
  const expanded = page || isOpen;
  const toggle = () => { if (page) return; if (onOpen) { onOpen(); return; } setOpen(!isOpen); if (!isOpen && !st) load(); };
  useEffect(() => { if (page && !st) load(); }, [page]);
  const late = a.duedate > 0 && a.duedate * 1000 < Date.now();
  const locked = a.allowsubmissionsfromdate * 1000 > Date.now();   // 0 = no opening date
  const drafts = a.submissiondrafts === 1;
  const canEdit = !a.nosubmissions && st?.canEdit !== false;
  const needsAgree = a.requiresubmissionstatement === 1 && !agreed;
  const choose = async () => {
    try {
      const p = await open({ multiple: true, title: "Attach files" });
      const paths = typeof p === "string" ? [p] : p ?? [];
      setPicked([...picked, ...paths]);
    } catch (e) { setMsg(String(e)); }
  };
  // Files dropped over the attachment area are attached exactly like ones picked in the dialog.
  // Tauri handles the native drag itself (the WebView never sees HTML5 drops), so listen to its events.
  const [dragging, setDragging] = useState(false); const zoneRef = useRef<HTMLDivElement>(null);
  const showDrop = expanded && !locked && canEdit && !!st && pluginOn(a, "file");
  // Tauri's docs say drag positions are physical pixels, but only the Windows backend reports device pixels;
  // macOS and GTK already report CSS-scale points.
  const cssPoint = (x: number, y: number) => (/Windows/i.test(navigator.userAgent) ? [x / devicePixelRatio, y / devicePixelRatio] : [x, y]);
  useEffect(() => {
    if (!showDrop) return;
    const hit = (x: number, y: number) => {
      const r = zoneRef.current?.getBoundingClientRect();
      return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    };
    const un = getCurrentWebview().onDragDropEvent(({ payload }) => {
      if (payload.type === "leave") { setDragging(false); return; }
      const [x, y] = cssPoint(payload.position.x, payload.position.y);
      const inside = hit(x, y);
      if (payload.type === "drop") {
        setDragging(false);
        if (inside) setPicked((cur) => [...cur, ...payload.paths.filter((x) => !cur.includes(x))]);
        return;
      }
      setDragging(inside);
    });
    return () => { un.then((f) => f()); };
  }, [showDrop, a.id]);
  const dirty = picked.length > 0 || (pluginOn(a, "onlinetext") && text !== loadedText);
  const done = st?.submission === "submitted";
  const idle = !dirty && (!drafts || done);   // nothing to save and nothing left to submit
  const send = async (graded: boolean) => {
    if ((graded || !drafts) && needsAgree) { setMsg("Accept the submission statement before submitting."); return; }
    if (!pluginOn(a, "onlinetext") && !picked.length && !st?.files?.length) { setMsg("Choose at least one file to submit."); return; }
    setSaving(true); setMsg("");
    const submitting = graded || !drafts;
    try {
      let itemid: number | undefined;
      if (picked.length) { itemid = 0; for (const path of picked) itemid = await api.uploadDraftFile(path, itemid); }
      // mod_assign_save_submission needs plugindata, so calling it with nothing changed is what raised [invalidparameter]
      if (dirty) await api.saveSubmission(a.id, {
        ...(pluginOn(a, "onlinetext") && text !== loadedText ? { text } : {}),
        ...(itemid !== undefined ? { fileItemId: itemid } : {}),
      });
      // without drafts, saving already submits; with drafts a separate "submit for grading" step is needed
      if (graded && !done) await api.submitForGrading(a.id, agreed);
      await load(); setPicked([]);
      setMsg(submitting ? "Submitted for grading." : "Saved.");
      if (submitting) onSubmitted?.();
    } catch (e) {
      const m = String(e).replace(/^Error: /, "");
      setMsg(/accessexception/i.test(m) ? "Your Moodle site does not allow this submission from the app. Use Open in browser below." : m);
    }
    setSaving(false);
  };
  return (<>
    {page && <div className="bar"><button className="icon" onClick={onClose} title="Back"><Icon n="back" /></button><h1>{a.name}</h1></div>}
    {!page && <button className="item" onClick={toggle}>
      <span className="ico"><Icon n={locked ? "lock" : "check"} /></span>
      <span className="grow">{a.name}{locked && <small>Locked until {when(a.allowsubmissionsfromdate)}</small>}<small>{a.duedate ? (late ? "Was due " : "Due ") + when(a.duedate) : "No due date"}</small></span>
      <span className={expanded ? "chev" : "chev shut"}><Icon n="chev" /></span>
    </button>}
    {expanded && <div className={page ? "summary pagebody" : "summary"}>
      {hasContent(a.intro) && <Html site={site} html={a.intro!} token={token} onLink={onLink} />}
      {!!a.introattachments?.length && <>
        <h4 className="subhead">Files from your teacher</h4>
        <div className="joinrow">{a.introattachments.map((f) => <button className="btn" key={f.filename} onClick={() => getFile({ ...f, type: "file" })}>{f.filename}</button>)}</div>
      </>}
      <h4 className="subhead">Your submission</h4>
      <p className="status">{err ? "Status unavailable: " + err : st ? <span className={done ? "chip" : "chip off"}>{SUBMISSION[st.submission] ?? st.submission}</span> : "Loading status…"}{st?.grade ? <span> Grade {st.grade}</span> : null}</p>
      {!!st?.files?.length && <div className="joinrow">{st.files.map((f) => <button className="btn" key={f.fileurl} onClick={() => getFile({ ...f, type: "file" })}>{f.filename}</button>)}</div>}
      {!locked && canEdit && st && (pluginOn(a, "file") || pluginOn(a, "onlinetext")) && (
        <div className="submit">
          {pluginOn(a, "onlinetext") && <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your answer…" rows={5} />}
          {pluginOn(a, "file") && <div className={"drop" + (dragging ? " on" : "")} ref={zoneRef}>
            <span className="dropmsg">{dragging ? "Drop to attach" : "Drag files here"}</span>
            <button className="btn" onClick={choose}>Attach files…</button>
            {picked.length > 0 && <div className="joinrow">{picked.map((p) => <span className="chip file" key={p}>
              <button title={p} onClick={() => api.openPicked(p).catch((e) => setMsg(String(e).replace(/^Error: /, "")))}>{p.split(/[\\/]/).pop()}</button>
              <button title="Remove" aria-label={"Remove " + p} onClick={() => setPicked(picked.filter((x) => x !== p))}><Icon n="x" s={12} /></button>
            </span>)}</div>}
          </div>}
          {picked.length > 0 && <small className="muted">The attached files replace any files already submitted. Leave this empty to keep them.</small>}
          {a.requiresubmissionstatement === 1 && <div className="joinrow">
            <label className="agree"><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /> I accept the submission statement.</label>
            <button className="btn" onClick={() => api.openWeb(`${site}/mod/assign/view.php?id=${a.cmid}&action=${drafts ? "submit" : "editsubmission"}`)}>Read the statement</button>
          </div>}
          <div className="joinrow">
            {drafts && <button className="btn" disabled={saving} onClick={() => send(false)}>{saving ? "Working…" : "Save draft"}</button>}
            <button className="primary sm" disabled={saving || needsAgree || idle} onClick={() => send(drafts)}>{saving ? "Working…" : drafts ? "Submit for grading" : done ? "Update submission" : "Submit"}</button>
          </div>
          {msg && <p className={/^(Saved|Submitted)/.test(msg) ? "muted" : "msg"}>{msg}</p>}
        </div>)}
      {!locked && <button className="btn" onClick={() => api.openWeb(`${site}/mod/assign/view.php?id=${a.cmid}`)}>Open in browser</button>}
    </div>}
  </>);
}

type Dl = { id: string; name: string; done: number; total: number | null };

function CourseView({ c, site, token, dir, notify, onLink, onHtml, onForum, onChat, dlMode, setDl, onSubmitted, assignPages, onAssign, middleDownload }: { c: api.Course; site: string; token: string; dir: string | null; notify: (m: string) => void; onLink: (href: string) => void; onHtml: (title: string, url: string) => void; onForum: (title: string, id: number) => void; onChat: (title: string, id: number, cmid: number, courseId: number) => void; dlMode: api.DlMode; setDl: React.Dispatch<React.SetStateAction<Dl | null>>; onSubmitted?: () => void; assignPages: boolean; onAssign: (a: api.Assign, course: string, group: number) => void; middleDownload: boolean }) {
  const [secs, setSecs] = useState<api.Section[] | null>(null); const [err, setErr] = useState(""); const [closed, setClosed] = useState<Record<number, boolean>>({});
  useEffect(() => {
    setSecs(null); setErr("");
    const key = "contents:" + c.id, cached = cacheGet<api.Section[]>(key);
    if (api.isOffline() && cached) { setSecs(cached); return; }
    api.courseContents(c.id).then((s) => { setSecs(s); cacheSet(key, s); })
      .catch((e) => { if (cached && !authError(e)) setSecs(cached); else setErr(!api.isOffline() || authError(e) ? String(e) : "You're offline and this course hasn't been opened in the app before."); });
  }, [c.id]);
  const course = c.shortname || c.fullname;
  const [assigns, setAssigns] = useState<Map<number, api.Assign>>(new Map());   // by course-module id; empty if the site hides the function
  useEffect(() => {
    setAssigns(new Map());
    const key = "assigns:" + c.id, cached = cacheGet<api.Assign[]>(key);
    if (api.isOffline() && cached) { setAssigns(new Map(cached.map((a) => [a.cmid, a]))); return; }
    api.courseAssignments(c.id).then((l) => { setAssigns(new Map(l.map((a) => [a.cmid, a]))); cacheSet(key, l); })
      .catch(() => { if (cached) setAssigns(new Map(cached.map((a) => [a.cmid, a]))); });
  }, [c.id]);
  const [saved, setSaved] = useState<Map<string, string>>(new Map()); const [menu, setMenu] = useState<{ f: api.FileItem; g: number; path?: string; x: number; y: number } | null>(null);
  const dlBusy = useRef(new Set<string>());
  const refreshSaved = () => api.listDownloads().then((l) => setSaved(new Map(l.map((e) => [e.course + "::" + e.name, e.path])))).catch(() => {});
  useEffect(() => { refreshSaved(); }, []);
  useEffect(() => { const h = () => setMenu(null); window.addEventListener("click", h); return () => window.removeEventListener("click", h); }, []);
  // Saved under <course>/<activity>/<folder path>, so same-named files in different activities never overwrite each other
  const folderOf = (f: api.FileItem, group: number) => `${course}/${group}${f.filepath && f.filepath !== "/" ? f.filepath : ""}`;
  const lastKey = "lastDoc:" + c.id; const [last, setLast] = useState(() => localStorage.getItem(lastKey));   // the document opened most recently in this course
  const getFile = async (f: api.FileItem, force = false, group = 0, open = true) => {
    setMenu(null);
    const folder = group ? folderOf(f, group) : course, key = folder + "::" + f.filename;
    if (open) { localStorage.setItem(lastKey, key); setLast(key); }
    if (dlBusy.current.has(key)) return;   // a second click while it downloads
    // a Moodle-hosted HTML resource is a page, not a bare file: show it in the app with its pictures and links intact.
    // "download only" still saves the raw file.
    if (open && isHtmlFile(f) && sameOrigin(site, f.fileurl)) { onHtml(f.filename, webserviceUrl(new URL(f.fileurl, site))); return; }
    if (api.isOffline() && !saved.has(key)) { notify(f.filename + " isn't downloaded yet — connect to the internet to get it."); return; }
    notify((open ? (force ? "Downloading " : "Opening ") : "Downloading ") + f.filename + "…");
    dlBusy.current.add(key);
    const id = Date.now() + "-" + Math.random().toString(36).slice(2);
    setDl({ id, name: f.filename, done: 0, total: null });
    try {
      const r = await api.download(id, f.fileurl, dir ?? "", folder, f.filename, dlMode, f.timemodified, force, open);   // empty dir = default folder; changing it is done in Settings
      notify((r.reused ? (open ? "Opened saved copy of " : "Already saved: ") : "Downloaded ") + f.filename); refreshSaved();
    } catch (e) { notify("Download failed: " + (api.isOffline() ? "you're offline." : e)); }
    finally { dlBusy.current.delete(key); setTimeout(() => setDl((d) => (d?.id === id ? null : d)), 400); }
  };
  if (err) return (
    <div className="sec pad"><p>{!api.isOffline() ? "This course can't be shown in the app (you may not be enrolled)." : "You're offline and this course hasn't been saved yet."}</p>{!api.isOffline() && <small>{err}</small>}<br />
      <button className="primary" onClick={() => api.openWeb(`${site}/course/view.php?id=${c.id}`)}>Open in browser</button></div>);
  if (!secs) return <div className="muted pad">Loading course…</div>;
  // Moodle 4.5+ subsections: the activity sits in its parent section, its content is an extra
  // "delegated" section at the end of the list. Nest it back in place instead of listing it separately.
  const delegated = new Map<number, api.Section>();
  secs.forEach((x) => { if (x.component === "mod_subsection" && x.itemid != null) delegated.set(x.itemid, x); });
  const toggle = (id: number) => setClosed({ ...closed, [id]: !closed[id] });
  const renderMods = (mods: api.Module[]): React.ReactNode => mods.map((m) => {
    if (m.modname === "label") return hasContent(m.description) ? <div className="summary" key={m.id}><Html site={site} html={m.description!} token={token} onLink={onLink} /></div> : null;
    if (m.modname === "subsection") {
      const d = m.instance != null ? delegated.get(m.instance) : undefined;
      if (d) return (
        <div className="subsec" key={m.id}>
          <button className="sechead" onClick={() => toggle(d.id)}><span>{m.name || d.name}</span><span className={closed[d.id] ? "chev shut" : "chev"}><Icon n="chev" /></span></button>
          {!closed[d.id] && <>
            {hasContent(d.summary) && <div className="summary"><Html site={site} html={d.summary!} token={token} onLink={onLink} /></div>}
            {renderMods(d.modules)}
          </>}
        </div>);
    }
    if (m.uservisible === false) return (   // access restriction: show why, and until when if Moodle says
      <div className="item locked" key={m.id}><span className="ico"><Icon n="lock" /></span>
        <span className="grow">{m.name}<small>Locked</small>{m.availabilityinfo && <small>{plain(m.availabilityinfo)}</small>}</span></div>);
    const a = m.modname === "assign" ? assigns.get(m.id) : undefined;
    if (a) return <AssignRow key={m.id} a={a} site={site} token={token} onLink={onLink} getFile={(f) => getFile(f, false, m.id)} onSubmitted={onSubmitted} onOpen={assignPages ? () => onAssign(a, course, m.id) : undefined} />;
    if (m.modname === "forum" && m.instance) return (
      <button className="item" key={m.id} onClick={() => onForum(m.name, m.instance!)}>
        <span className="ico"><Icon n="chat" /></span>
        <span className="grow">{m.name}<small>latest posts · replies open in your browser</small></span>
        <Icon n="chev" s={16} />
      </button>);
    if (m.modname === "chat" && m.instance) return (
      <button className="item" key={m.id} onClick={() => onChat(m.name, m.instance!, m.id, c.id)}>
        <span className="ico"><Icon n="chat" /></span>
        <span className="grow">{m.name}<small>live chat</small></span>
        <Icon n="chev" s={16} />
      </button>);
    const files = (m.contents ?? []).filter((f) => f.type === "file");
    if (files.length) return files.map((f) => {
      const savedPath = saved.get(folderOf(f, m.id) + "::" + f.filename);
      const isSaved = savedPath !== undefined, isLast = last === folderOf(f, m.id) + "::" + f.filename;
      return (
        <div className={isLast ? "item last" : "item"} role="button" key={m.id + (f.filepath ?? "") + f.filename} onClick={() => getFile(f, false, m.id)}
          onMouseDown={(e) => { if (middleDownload && e.button === 1) e.preventDefault(); }}   // no autoscroll
          onAuxClick={(e) => { if (middleDownload && e.button === 1) getFile(f, false, m.id, false); }}>
          <span className="ico"><Icon n={modIcon(m.modname)} /></span>
          <span className="grow">{m.modname === "folder" ? `${m.name} / ${f.filename}` : m.name}<small>{f.filename} · {size(f.filesize)}{isSaved ? " · saved" : ""}{isLast ? " · last opened" : ""}</small></span>
          <button className="icon" title="Options" onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setMenu({ f, g: m.id, path: savedPath, x: window.innerWidth - r.right, y: r.bottom + 4 }); }}><Icon n="dots" /></button>
        </div>);
    });
    const isUrl = m.modname === "url"; const target = isUrl ? m.contents?.[0]?.fileurl ?? m.url : m.url ?? `${site}/mod/${m.modname}/view.php?id=${m.id}`;
    return (
      <button className="item" key={m.id} onClick={() => target && onLink(target)}>
        <span className="ico"><Icon n={modIcon(m.modname)} /></span><span className="grow">{m.name}<small>{isUrl ? "link" : m.modname + " · opens in browser"}</small></span><Icon n="link" s={16} />
      </button>);
  });
  return (<div className="stack">{secs.filter((s) => !s.component && (s.modules.length || hasContent(s.summary))).map((s) => (
    <section className="sec" key={s.id}>
      <button className="sechead" onClick={() => toggle(s.id)}>
        <span>{s.name || "General"}</span><span className={closed[s.id] ? "chev shut" : "chev"}><Icon n="chev" /></span>
      </button>
      {!closed[s.id] && hasContent(s.summary) && <div className="summary"><Html site={site} html={s.summary!} token={token} onLink={onLink} /></div>}
      {!closed[s.id] && renderMods(s.modules)}
    </section>))}
    {menu && <div className="menu" style={{ position: "fixed", top: menu.y, right: menu.x }} onClick={(e) => e.stopPropagation()}>
      <button onClick={() => getFile(menu.f, false, menu.g, false)}><Icon n="down" s={16} />Download only</button>
      {isHtmlFile(menu.f) && sameOrigin(site, menu.f.fileurl) && <button onClick={() => { setMenu(null); api.openWeb(menu.f.fileurl); }}><Icon n="ext" s={16} />Open in browser</button>}
      {menu.path && <>
        <button className="desk" onClick={() => { setMenu(null); api.revealFile(menu.path!).catch((e) => notify(String(e))); }}><Icon n="folder" s={16} />Show in folder</button>
        <button onClick={() => getFile(menu.f, true, menu.g)}><Icon n="down" s={16} />Download again</button>
      </>}</div>}
  </div>);
}

function HtmlPage({ title, url, site, token, onLink, onClose }: { title: string; url: string; site: string; token: string; onLink: (href: string) => void; onClose: () => void }) {
  const [body, setBody] = useState<string | null>(null); const [err, setErr] = useState("");
  useEffect(() => {
    const key = "html:" + url, cached = cacheGet<string>(key);
    if (api.isOffline() && cached !== undefined) { setBody(cached); return; }
    api.fetchContent(url).then((h) => { setBody(h); cacheSet(key, h); })
      .catch((e) => { if (cached !== undefined) setBody(cached); else setErr(!api.isOffline() ? String(e) : "You're offline and this page hasn't been opened before."); });
  }, [url]);
  const html = useMemo(() => (body === null ? "" : absolutise(body, url)), [body, url]);
  return (<>
    <div className="bar"><button className="icon" onClick={onClose}><Icon n="back" /></button><h1>{title}</h1></div>
    {err ? <div className="sec pad"><p>{err}</p><button className="primary" onClick={() => api.openWeb(url)}>Open in browser</button></div>
      : body === null ? <p className="muted pad">Loading…</p>
      : <section className="sec"><div className="summary"><Html site={site} html={html} token={token} onLink={onLink} /></div></section>}
  </>);
}

function ForumPage({ title, id, site, token, onLink, onClose }: { title: string; id: number; site: string; token: string; onLink: (href: string) => void; onClose: () => void }) {
  const [list, setList] = useState<api.Discussion[] | null>(null); const [err, setErr] = useState("");
  useEffect(() => {
    const key = "forum:" + id, cached = cacheGet<api.Discussion[]>(key);
    if (api.isOffline() && cached) { setList(cached); return; }
    api.forumDiscussions(id).then((d) => { setList(d); cacheSet(key, d); })
      .catch((e) => { if (cached) setList(cached); else setErr(!api.isOffline() ? String(e) : "You're offline and these announcements haven't been opened before."); });
  }, [id]);
  return (<>
    <div className="bar"><button className="icon" onClick={onClose}><Icon n="back" /></button><h1>{title}</h1></div>
    {err ? <div className="sec pad"><p>{err}</p><button className="primary" onClick={() => api.openWeb(`${site}/mod/forum/view.php?f=${id}`)}>Open in browser</button></div>
      : !list ? <p className="muted pad">Loading…</p>
      : !list.length ? <p className="muted pad">Nothing has been posted here yet.</p>
      : <div className="stack">{list.map((d) => (
        <section className="sec" key={d.id}>
          <div className="sechead static"><span>{d.subject}</span><small>{[d.author, d.created ? when(d.created) : "", d.replies ? `${d.replies} repl${d.replies === 1 ? "y" : "ies"}` : ""].filter(Boolean).join(" · ")}</small></div>
          {d.message && <div className="summary"><Html site={site} html={d.message} token={token} onLink={onLink} /></div>}
          <div className="summary"><button className="btn" onClick={() => api.openWeb(`${site}/mod/forum/discuss.php?d=${d.id}`)}>{d.replies ? "Read the replies" : "Open in browser"}</button></div>
        </section>))}</div>}
  </>);
}

// A small, dependency-free emoji set: enough for chat, nothing to download.
const EMOJI = "😀 😃 😄 😁 😆 😅 😂 🙂 🙃 😉 😊 😇 🥰 😍 😘 😋 😜 🤪 🤗 🤔 😐 😴 😷 🤒 👍 👎 👏 🙌 🙏 💪 🔥 ✨ 🎉 ❤️ 😢 😭 😤 🤯 😱 😬 🤝 ✅ ❌ ⏰ 📚".split(" ");
// A message box grows with its text up to five lines, then scrolls. scrollHeight includes the padding but not the border.
const growBox = (el: HTMLTextAreaElement) => {
  el.style.height = "auto";
  const s = getComputedStyle(el), lh = parseFloat(s.lineHeight) || 20;
  const pad = parseFloat(s.paddingTop) + parseFloat(s.paddingBottom) + parseFloat(s.borderTopWidth) + parseFloat(s.borderBottomWidth);
  el.style.height = Math.min(el.scrollHeight, Math.round(lh * 5 + pad)) + "px";
};
function EmojiPicker({ onPick }: { onPick: (e: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="emojiwrap">
      <button className="icon" type="button" title="Emoji" aria-label="Emoji" onClick={() => setOpen((v) => !v)}><Icon n="smile" /></button>
      {open && <div className="emojis">{EMOJI.map((e) => <button key={e} type="button" onClick={() => onPick(e)}>{e}</button>)}</div>}
    </div>
  );
}

// A live chat room plus its past sessions. Messages carry only author ids, so names are looked up in
// batches; the room session (chatsid) expires when it stops being polled and is renewed on the next poll.
function ChatPage({ title, id, cmid, courseId, me, site, token, onLink, onClose }: { title: string; id: number; cmid: number; courseId: number; me: number; site: string; token: string; onLink: (href: string) => void; onClose: () => void }) {
  const [tab, setTab] = useState<"chat" | "history">("chat");
  const [msgs, setMsgs] = useState<api.ChatMessage[]>([]);
  const [names, setNames] = useState(new Map<number, string>());   // names are cosmetic: a miss shows "User 12"
  const [text, setText] = useState("");
  const [err, setErr] = useState("");   // the room could not be opened at all
  const [note, setNote] = useState(""); // temporary: reconnecting, or a message was refused
  const [sending, setSending] = useState(false);
  const [online, setOnline] = useState(false);
  const [sessions, setSessions] = useState<api.ChatSession[] | null>(null);
  const [histErr, setHistErr] = useState("");
  const [openSession, setOpenSession] = useState<api.ChatSession | null>(null);
  const [histMsgs, setHistMsgs] = useState<api.ChatMessage[] | null>(null);
  const sid = useRef<string | null>(null), last = useRef(0), quiet = useRef(false), inFlight = useRef(false);
  const box = useRef<HTMLDivElement>(null), atBottom = useRef(true), refresh = useRef<() => void>(() => {});
  const ta = useRef<HTMLTextAreaElement>(null);
  const asked = useRef(new Set<number>());

  useEffect(() => {
    let dead = false, timer = 0;
    const poll = async () => {
      if (dead || quiet.current || document.hidden || !sid.current) return;
      quiet.current = true;
      try {
        const r = await api.chatLatest(sid.current, last.current);
        if (dead) return;
        last.current = r.last || last.current;
        setOnline(true); setNote("");
        if (r.messages.length) setMsgs((cur) => api.mergeChat(cur, r.messages));
      } catch {
        // silence ends the room session; logging in again gives a new one and the next tick fetches
        if (!dead) setOnline(false);
        try { sid.current = await api.chatLogin(id); last.current = 0; if (!dead) setOnline(true); }
        catch { if (!dead) { setOnline(false); setNote(api.isOffline() ? "You're offline." : "Reconnecting…"); } }
      } finally { quiet.current = false; }
    };
    refresh.current = () => void poll();
    api.chatView(id);
    api.chatLogin(id).then((v) => {
      if (dead) return;
      sid.current = v; setOnline(true); setNote("");
      void poll();
      timer = window.setInterval(poll, 4000);
    }).catch((e) => { if (!dead) setErr(api.isOffline() ? "Chat needs a connection." : String(e).replace(/^Error: /, "")); });
    return () => { dead = true; clearInterval(timer); sid.current = null; };
  }, [id]);

  useEffect(() => {
    const ids = [...new Set([...msgs, ...(histMsgs ?? [])].map((m) => m.userid))];
    // a name the site refuses to share stays unknown instead of being asked for again on every message
    const unknown = ids.filter((u) => u && !names.has(u) && !asked.current.has(u));
    if (!unknown.length) return;
    unknown.forEach((u) => asked.current.add(u));
    api.chatNames(courseId, unknown).then((m) => setNames((cur) => new Map([...cur, ...m]))).catch(() => {});
  }, [msgs, histMsgs, names, courseId]);

  useEffect(() => { if (atBottom.current && box.current) box.current.scrollTop = box.current.scrollHeight; }, [msgs]);
  useEffect(() => { if (ta.current) growBox(ta.current); }, [text]);
  useEffect(() => {
    if (tab !== "history" || sessions !== null) return;
    api.chatSessions(id).then(setSessions).catch((e) => { setSessions([]); setHistErr(String(e).replace(/^Error: /, "")); });
  }, [tab, id, sessions]);

  const send = async () => {
    const t = text.trim();
    if (!t || inFlight.current || !sid.current) return;
    inFlight.current = true; setSending(true); setNote("");
    try {
      try {
        await api.chatSend(sid.current, t);
      } catch (e) {
        // only a room that logged itself out is worth retrying; retrying anything else could post twice
        if (!/\[(?:notlogged|cantlogin)\]/.test(String(e))) throw e;
        sid.current = await api.chatLogin(id);
        await api.chatSend(sid.current, t);
      }
      setText(""); last.current = 0; refresh.current();
    } catch (e) {
      setNote(String(e).replace(/^Error: /, ""));
    } finally { inFlight.current = false; setSending(false); }
  };
  const pickEmoji = (e: string) => {
    const el = ta.current, at = el?.selectionStart ?? text.length, to = el?.selectionEnd ?? at;
    setText(text.slice(0, at) + e + text.slice(to));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + e.length, at + e.length); });
  };
  const openHistory = (s: api.ChatSession) => {
    setOpenSession(s); setHistMsgs(null); setHistErr("");
    api.chatSessionMessages(id, s.start, s.end).then(setHistMsgs)
      .catch((e) => { setHistMsgs([]); setHistErr(String(e).replace(/^Error: /, "")); });
  };
  const row = (m: api.ChatMessage, raw = false) => {
    if (m.system) return <div className="chatmsg sys" key={m.id}>{plain(m.message)}</div>;
    const mine = m.userid === me;
    return (
      <div className={"chatmsg" + (mine ? " mine" : "")} key={m.id}>
        {!mine && <b>{names.get(m.userid) ?? "User " + m.userid}</b>}
        {/* live messages arrive formatted; past-session rows come as raw text (a Moodle quirk) */}
        {raw ? <div className="bubble raw">{m.message}</div> : <div className="bubble"><Html site={site} html={m.message} token={token} onLink={onLink} /></div>}
        <small>{m.timestamp ? new Date(m.timestamp * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : ""}</small>
      </div>
    );
  };

  return (<div className="chatpage">
    <div className="bar">
      <button className="icon" onClick={onClose} title="Back"><Icon n="back" /></button><h1>{title}</h1>
      <span className={"chaton" + (online ? " on" : "")}>{err ? "Unavailable" : online ? "Connected" : api.isOffline() ? "Offline" : "Connecting…"}</span>
    </div>
    {err ? <div className="sec pad"><p>{err}</p><button className="primary" onClick={() => api.openWeb(`${site}/mod/chat/view.php?id=${cmid}`)}>Open in browser</button></div> : <>
      <div className="tabs">
        <button className={tab === "chat" ? "tab on" : "tab"} onClick={() => setTab("chat")}>Chat</button>
        <button className={tab === "history" ? "tab on" : "tab"} onClick={() => setTab("history")}>Past sessions</button>
      </div>
      {tab === "chat" ? <div className="chatfill">
        <div className="msgs" ref={box} onScroll={() => { const el = box.current; if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
          {!msgs.length && <p className="muted">{online ? "No messages yet. Say hello." : "Connecting…"}</p>}
          {msgs.map((m) => row(m))}
        </div>
        {note && <p className="muted small2">{note}</p>}
        <div className="composer">
          <textarea ref={ta} rows={1} value={text} placeholder="Message…" aria-label="Message" onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
          <EmojiPicker onPick={pickEmoji} />
          <button className="primary" disabled={!text.trim() || sending || !sid.current} onClick={() => void send()}>{sending ? "Sending…" : "Send"}</button>
        </div>
      </div> : openSession ? <>
        <div className="bar"><button className="icon" onClick={() => { setOpenSession(null); setHistMsgs(null); }} title="Back to sessions"><Icon n="back" /></button><h1>{when(openSession.start)}</h1></div>
        {histErr ? <p className="msg pad">{histErr}</p>
          : !histMsgs ? <p className="muted pad">Loading…</p>
          : <div className="msgs">{histMsgs.length ? histMsgs.map((m) => row(m, true)) : <p className="muted">No messages in this session.</p>}</div>}
      </> : <>
        {histErr ? <div className="sec pad"><p>{histErr}</p><button className="primary" onClick={() => api.openWeb(`${site}/mod/chat/report.php?id=${cmid}`)}>Open in browser</button></div>
          : !sessions ? <p className="muted pad">Loading…</p>
          : !sessions.length ? <p className="muted pad">No past sessions.</p>
          : <div className="stack"><section className="sec">{sessions.map((s) => (
            <button className="item" key={s.start} onClick={() => openHistory(s)}>
              <span className="ico"><Icon n="chat" /></span>
              <span className="grow">{when(s.start)}<small>{when(s.end)} · {s.users.reduce((n, u) => n + u.messagecount, 0)} messages{s.complete ? "" : " · ongoing"}</small></span>
              <Icon n="chev" s={16} />
            </button>))}</section></div>}
      </>}
    </>}
  </div>);
}

// Moodle Messages: the conversation list, plus one conversation at a time. Reading the room marks it read on the
// server; the room polls for new messages with timefrom, which is inclusive, so results are merged by id.
function MessagesPage({ me, site, onOpen }: { me: number; site: string; onOpen: (c: api.Conversation) => void }) {
  const [convs, setConvs] = useState<api.Conversation[] | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => {
    if (!me) return;
    api.conversations(me).then((v) => { setConvs(v); setErr(""); })
      .catch((e) => { setErr(api.isOffline() ? "Messages need a connection." : String(e).replace(/^Error: /, "")); setConvs((c) => c ?? []); });
  }, [me]);
  useEffect(() => {
    load();
    const t = window.setInterval(() => { if (!document.hidden) load(); }, 15000);
    return () => clearInterval(t);
  }, [load]);
  return (<>
    <div className="bar"><h1>Messages</h1></div>
    {err && !convs?.length ? <div className="sec pad"><p>{err}</p><button className="primary" onClick={() => api.openWeb(`${site}/message/index.php`)}>Open in browser</button></div>
      : !convs ? <p className="muted pad">Loading…</p>
      : !convs.length ? <p className="muted pad">No conversations yet.</p>
      : <div className="stack"><section className="sec">{convs.map((c) => (
        <button className="item" key={c.id} onClick={() => onOpen(c)}>
          <span className="avatar">{initials(api.convName(c, me))}</span>
          <span className="grow">{api.convName(c, me)}<small>{c.last ? plain(c.last.text).slice(0, 100) : "No messages yet"}</small></span>
          {c.unread > 0 && <span className="unread" title={`${c.unread} unread`}>{c.unread}</span>}
          <Icon n="chev" s={16} />
        </button>))}</section></div>}
  </>);
}

function ConversationView({ c, me, site, token, onLink, onBack }: { c: api.Conversation; me: number; site: string; token: string; onLink: (href: string) => void; onBack: () => void }) {
  const [msgs, setMsgs] = useState<api.Msg[]>([]);
  const [names, setNames] = useState(() => new Map(c.members.map((m) => [m.id, m.fullname] as const)));
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const last = useRef(0), busy = useRef(false), sent = useRef(false);
  const box = useRef<HTMLDivElement>(null), atBottom = useRef(true), ta = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let dead = false, timer = 0;
    const take = (r: { messages: api.Msg[]; members: api.MsgUser[] }) => {
      if (dead) return;
      if (r.members.length) setNames((cur) => new Map([...cur, ...r.members.map((m) => [m.id, m.fullname] as const)]));
      if (r.messages.length) {
        setMsgs((cur) => api.mergeMsgs(cur, r.messages));
        last.current = Math.max(last.current, ...r.messages.map((m) => m.time));
        api.markRead(me, c.id);
      }
    };
    const fetch = (first: boolean) => {
      if (dead || busy.current || document.hidden) return;
      busy.current = true;
      api.conversationMessages(me, c.id, first ? 0 : last.current)
        .then(take)
        .catch((e) => { if (!dead && first) setNote(api.isOffline() ? "Messages need a connection." : String(e).replace(/^Error: /, "")); })
        .finally(() => { busy.current = false; if (!dead && first) setLoaded(true); });
    };
    fetch(true);
    timer = window.setInterval(() => fetch(false), 5000);
    return () => { dead = true; clearInterval(timer); };
  }, [c.id, me]);

  useEffect(() => { if (atBottom.current && box.current) box.current.scrollTop = box.current.scrollHeight; }, [msgs]);
  useEffect(() => { if (ta.current) growBox(ta.current); }, [text]);

  const send = async () => {
    const t = text.trim();
    if (!t || sent.current) return;
    sent.current = true; setSending(true); setNote("");
    try {
      const made = await api.sendMessage(c.id, t);
      if (made.length) {
        setMsgs((cur) => api.mergeMsgs(cur, made));
        last.current = Math.max(last.current, ...made.map((m) => m.time));
      }
      setText("");
    } catch (e) { setNote(String(e).replace(/^Error: /, "")); }
    finally { sent.current = false; setSending(false); }
  };
  const pickEmoji = (e: string) => {
    const el = ta.current, at = el?.selectionStart ?? text.length, to = el?.selectionEnd ?? at;
    setText(text.slice(0, at) + e + text.slice(to));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + e.length, at + e.length); });
  };
  const row = (m: api.Msg) => {
    const own = m.from === me;
    return (
      <div className={"chatmsg" + (own ? " mine" : "")} key={m.id}>
        {!own && <b>{names.get(m.from) ?? "User " + m.from}</b>}
        <div className="bubble"><Html site={site} html={m.text} token={token} onLink={onLink} /></div>
        <small>{m.time ? new Date(m.time * 1000).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : ""}</small>
      </div>
    );
  };

  return (<div className="chatpage">
    <div className="bar"><button className="icon" onClick={onBack} title="Back to messages"><Icon n="back" /></button><h1>{api.convName(c, me)}</h1>
      {c.type === 2 && <span className="muted small2">{c.members.length} members</span>}</div>
    <div className="msgs" ref={box} onScroll={() => { const el = box.current; if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
      {!loaded && !msgs.length ? <p className="muted">Loading…</p> : !msgs.length ? <p className="muted">No messages yet. Say hello.</p> : msgs.map(row)}
    </div>
    {note && <p className="muted small2">{note}</p>}
    <div className="composer">
      <textarea ref={ta} rows={1} value={text} placeholder="Message…" aria-label="Message" onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
      <EmojiPicker onPick={pickEmoji} />
      <button className="primary" disabled={!text.trim() || sending} onClick={() => void send()}>{sending ? "Sending…" : "Send"}</button>
    </div>
  </div>);
}

const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const has = (hay: string, q: string) => { const h = norm(hay); return norm(q).split(/\s+/).filter(Boolean).every((t) => h.includes(t)); };

function Explore({ site, token, enrolled, notify, onLink, onJoined }: { site: string; token: string; enrolled: Set<number>; notify: (m: string) => void; onLink: (h: string) => void; onJoined: (c: api.Course) => void }) {
  const [qc, setQc] = useState(""); const [qd, setQd] = useState(""); const [qt, setQt] = useState("");
  const [res, setRes] = useState<api.SearchCourse[] | null>(null); const [busy, setBusy] = useState(false); const [note, setNote] = useState("");
  const [sel, setSel] = useState<api.SearchCourse | null>(null); const [methods, setMethods] = useState<api.EnrolMethod[] | null>(null);
  const [keys, setKeys] = useState<Record<number, string>>({}); const [joining, setJoining] = useState<number | null>(null);
  const [errs, setErrs] = useState<Record<number, string>>({});
  const [cats, setCats] = useState<Map<number, api.Category>>(new Map());
  useEffect(() => { api.categories().then((l) => setCats(new Map(l.map((c) => [c.id, c])))).catch(() => {}); }, []);

  // full category path (faculty > department > programme) when the site lets us list categories
  const pathOf = (id: number) => (cats.get(id)?.path ?? "").split("/").filter(Boolean).map((i) => cats.get(Number(i))?.name).filter(Boolean) as string[];
  const crumbs = (c: api.SearchCourse): string[] => { const p = pathOf(c.categoryid ?? -1); return p.length ? p : c.categoryname ? [c.categoryname] : []; };
  const teachers = (c: api.SearchCourse) => (c.contacts ?? []).map((t) => t.fullname).join(", ");

  const search = async () => {
    const c = qc.trim(), d = qd.trim(), t = qt.trim();
    if (!c && !d) { notify(t ? "Teacher search needs a course name or a department as well." : "Type a course name or a department."); return; }
    setBusy(true); setSel(null); setNote("");
    try {
      let list: api.SearchCourse[];
      if (c) list = await api.searchCourses(c);
      else {
        if (!cats.size) { setRes([]); setNote("This site doesn't let the app list departments. Search by course name instead."); setBusy(false); return; }
        const ids = [...cats.values()].filter((k) => (k.coursecount ?? 1) > 0 && has(pathOf(k.id).join(" "), d)).map((k) => k.id);
        if (!ids.length) { setRes([]); setNote("No department matches that name."); setBusy(false); return; }
        if (ids.length > 25) { setRes([]); setNote(`"${d}" matches ${ids.length} departments. Add more words to narrow it down.`); setBusy(false); return; }
        list = (await Promise.all(ids.map((id) => api.coursesByCategory(id).catch(() => [] as api.SearchCourse[])))).flat();
      }
      list = [...new Map(list.map((x) => [x.id, x])).values()];
      if (c && d) list = list.filter((x) => has(crumbs(x).join(" "), d));
      if (t) list = list.filter((x) => has(teachers(x), t));
      list.sort((a, b) => a.fullname.localeCompare(b.fullname) || crumbs(a).join().localeCompare(crumbs(b).join()));
      setRes(list);
      if (t && !list.length) setNote("No match. Teacher names come from each course's listed contacts, which some courses leave empty.");
    } catch (e) { notify(String(e)); }
    setBusy(false);
  };
  const choose = (c: api.SearchCourse) => { setSel(c); setMethods(null); setKeys({}); setErrs({}); api.enrolMethods(c.id).then(setMethods).catch(() => setMethods([])); };
  // like Moodle's own "Enrolment options" page: one block per enabled method
  const enabled = (methods ?? []).filter((m) => String(m.status) === "true");
  const selfs = enabled.filter((m) => m.type === "self");
  const NOT_USER_FACING = ["self", "guest", "manual", "cohort", "meta", "database", "ldap", "flatfile", "lti", "imsenterprise", "category", "mnet"];
  const others = enabled.filter((m) => !NOT_USER_FACING.includes(m.type));   // custom plugins: finish in the browser
  const guest = enabled.some((m) => m.type === "guest");
  const asCourse = (c: api.SearchCourse): api.Course => ({ id: c.id, fullname: c.fullname, shortname: c.shortname });
  const join = async (m: api.EnrolMethod) => {
    if (!sel) return;
    setJoining(m.id); setErrs((x) => ({ ...x, [m.id]: "" }));
    try {
      const r = await api.selfEnrol(sel.id, m.id, keys[m.id] ?? "");
      if (!r.status) { const w = r.warnings?.[0]; throw new Error(w ? `${w.message}${w.warningcode ? ` [${w.warningcode}]` : ""}` : "Enrolment was refused"); }
      notify("Enrolled in " + sel.fullname); onJoined(asCourse(sel));
    } catch (e) { setErrs((x) => ({ ...x, [m.id]: String(e).replace(/^Error: /, "") })); }
    setJoining(null);
  };
  if (sel) return (
    <div className="stack">
      <div className="bar"><button className="icon" onClick={() => setSel(null)}><Icon n="back" /></button><h1>{sel.fullname}</h1></div>
      <div className="banner" style={{ background: tone(sel.id) }}>{crumbs(sel).join(" › ") || sel.shortname}</div>
      <section className="sec">
        {teachers(sel) && <div className="summary"><b>Taught by:</b> {teachers(sel)}</div>}
        {hasContent(sel.summary) && <div className="summary"><Html site={site} html={sel.summary!} token={token} onLink={onLink} /></div>}
        <div className="summary">
          {enrolled.has(sel.id) ? (<><p>You're already enrolled in this course.</p><button className="primary sm" onClick={() => onJoined(asCourse(sel))}>Open course</button></>)
            : methods === null ? <span className="muted">Checking enrolment options…</span>
            : !selfs.length && !others.length ? <p className="muted">Enrolment options aren't available in the app for this course. {guest ? "It allows guest access, so you can view it in the browser." : "Enrolment is managed by your institution."}</p>
            : (<div className="methods">
              {selfs.map((m) => (
                <div className="method" key={m.id}><h4>{m.name || "Self enrolment"}</h4>
                  <div className="joinrow">
                    <input type="password" placeholder="Enrolment key (if required)" value={keys[m.id] ?? ""} onChange={(e) => setKeys({ ...keys, [m.id]: e.target.value })} onKeyDown={(e) => e.key === "Enter" && join(m)} />
                    <button className="primary sm" disabled={joining !== null} onClick={() => join(m)}>{joining === m.id ? "Enrolling…" : "Enrol me"}</button>
                  </div>
                  {errs[m.id] && <div className="enrolerr"><p>{errs[m.id]}</p><button className="ghost" onClick={() => api.openWeb(`${site}/enrol/index.php?id=${sel.id}`)}>Try in browser instead</button></div>}
                </div>))}
              {others.map((m) => (
                <div className="method" key={m.id}><h4>{m.name || m.type}</h4><small className="muted" style={{ marginBottom: 8 }}>custom method · {m.type}{m.wsfunction ? ` · ${m.wsfunction}` : ""}</small>
                  <button className="primary sm" onClick={() => api.openWeb(`${site}/enrol/index.php?id=${sel.id}`)}>Enrol in browser</button></div>))}
            </div>)}
          {methods && methods.length > 0 && !enrolled.has(sel.id) && <small className="muted" style={{ marginTop: 10 }}>Reported by Moodle: {methods.map((m) => `${m.name || m.type} [${m.type}${String(m.status) === "true" ? "" : ", disabled"}${m.wsfunction ? ", " + m.wsfunction : ""}]`).join(" · ")}</small>}
          <button className="ghost" onClick={() => api.openWeb(`${site}/course/view.php?id=${sel.id}`)}>Open in browser</button>
        </div>
      </section>
    </div>);
  const onEnter = (e: React.KeyboardEvent) => { if (e.key === "Enter") search(); };
  return (
    <>
      <div className="bar"><h1>Explore courses</h1></div>
      <div className="fields">
        <input autoFocus placeholder="Course  (e.g. networks)" value={qc} onChange={(e) => setQc(e.target.value)} onKeyDown={onEnter} />
        <input placeholder="Department  (e.g. software)" value={qd} onChange={(e) => setQd(e.target.value)} onKeyDown={onEnter} />
        <input placeholder="Teacher  (combine with the above)" value={qt} onChange={(e) => setQt(e.target.value)} onKeyDown={onEnter} />
        <button className="primary sm" disabled={busy} onClick={search}>{busy ? "Searching…" : "Search"}</button>
      </div>
      {note && <p className="muted pad">{note}</p>}
      {res && !res.length && !note && <p className="muted pad">No courses found.</p>}
      {res && res.length > 0 && <p className="muted" style={{ margin: "14px 0 0" }}>{res.length} course{res.length === 1 ? "" : "s"}{res.length >= 200 ? " (showing the first 200, refine your search)" : ""}</p>}
      <div className="grid" style={{ marginTop: 14 }}>{(res ?? []).map((c) => {
        const img = realImage(c.overviewfiles?.[0]?.fileurl, site, token);
        return (
          <div className="course" role="button" key={c.id} onClick={() => choose(c)}>
            <div className="cover" style={{ background: tone(c.id) }}><span>{initials(c.fullname)}</span>{img && <img src={img} onError={(e) => (e.currentTarget.style.display = "none")} />}</div>
            <div className="body"><b>{c.fullname}</b>
              <small>{crumbs(c).slice(-2).join(" › ")}</small>
              {teachers(c) && <small>{teachers(c)}</small>}
              {(enrolled.has(c.id) || c.enrollmentmethods?.includes("self")) && <small className="tagline">{enrolled.has(c.id) ? "✓ Enrolled" : "Self-enrolment open"}</small>}</div>
          </div>);
      })}</div>
    </>);
}

const MODES: [api.DlMode, string, string][] = [
  ["updated", "Re-download only if updated", "Reuse the saved copy unless the file changed on Moodle (recommended)."],
  ["reuse", "Always use the saved copy", "Never download again once saved. Fastest, but can show an outdated file."],
  ["always", "Always download again", "Fetch a fresh copy every time and overwrite the saved one."],
];

type Theme = "system" | "light" | "dark";
const THEMES: [Theme, string, string][] = [["system", "System", "Follow your device"], ["light", "Light", "Always light"], ["dark", "Dark", "Always dark"]];

const ACCENTS: [string, string][] = [["", "Pine"], ["#1d4ed8", "Blue"], ["#6d28d9", "Violet"], ["#be123c", "Rose"], ["#92400e", "Amber"], ["#334155", "Slate"]];   // all pass AA text contrast on the light and (lightened) dark backgrounds
const SETTINGS_TABS = [["general", "General"], ["appearance", "Appearance"], ["downloads", "Downloads"], ["permissions", "Permissions"], ["about", "About"]] as const;

type Contrast = "system" | "on" | "off";
const CONTRASTS: [Contrast, string, string][] = [["system", "System", "Follow your device"], ["on", "On", "Always high contrast"], ["off", "Off", "Never"]];

const UPDATE_MODES: [api.UpdateMode, string, string][] = [
  ["auto", "Download automatically", "Zenith downloads the update in the background, then asks before installing."],
  ["ask", "Ask before updating", "Zenith checks automatically, then asks before downloading and installing."],
  ["manual", "Manual only", "Only check when you press the button."],
];

const ASSIGN_PAGES: [boolean, string, string][] = [
  [true, "Separate page", "Open each assignment on its own page, like announcements."],
  [false, "Inside the course", "Expand assignments in the course list."],
];

const INTERNAL_LINKS: [boolean, string, string][] = [
  [true, "Open in the app", "Courses, forums and assignments from course text stay inside Zenith."],
  [false, "Open in your browser", "Every Moodle link opens in the system browser."],
];

const MIDDLE_DOWNLOAD: [boolean, string, string][] = [
  [true, "Download only", "A middle click saves the file without opening it."],
  [false, "Do nothing", "Middle clicks on files are ignored."],
];

type Sort = "name" | "size" | "date";
const SORTS: [Sort, string, string][] = [
  ["name", "Name", "A to Z within each course."],
  ["size", "Size", "Largest files first."],
  ["date", "Newest", "Most recently downloaded first."],
];

function About() {
  const [version, setVersion] = useState("");
  useEffect(() => { getVersion().then(setVersion).catch(() => {}); }, []);
  const open = (url: string) => api.openExternal(url).catch(() => {});
  return (<div className="stack">
    <section className="sec">
      <div className="setrow abouthead"><img className="aboutlogo" src={logo} alt="" /><div className="grow"><h2>Zenith</h2><small>Version {version || "…"}</small></div></div>
      <div className="setrow"><div className="grow"><b>Source code</b><small>github.com/zac06/zenith</small></div><button className="btn" onClick={() => open("https://github.com/zac06/zenith")}>GitHub</button></div>
      <div className="setrow"><div className="grow"><b>Website</b><small>zac06.github.io/zenith</small></div><button className="btn" onClick={() => open("https://zac06.github.io/zenith")}>Open</button></div>
    </section>
    <section className="sec">
      <div className="sechead static">Developer</div>
      <div className="setrow"><img className="avatarimg" src="https://github.com/Zac06.png?size=96" alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} /><div className="grow"><b>Zaccaria Francescato</b><small>@Zac06</small></div><button className="btn" onClick={() => open("https://github.com/Zac06")}>GitHub</button></div>
    </section>
    <p className="muted small2">Independent app, not affiliated with or endorsed by Moodle.</p>
  </div>);
}

// Android only: may Zenith install apps (its own updates)? null where the platform has no such switch. The user flips it in the
// system settings, so it is read again whenever the app comes back to the front.
function useInstallPerm() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    const read = () => api.installPermission().then(setOk).catch(() => setOk(null));
    read();
    window.addEventListener("focus", read); document.addEventListener("visibilitychange", read);
    return () => { window.removeEventListener("focus", read); document.removeEventListener("visibilitychange", read); };
  }, []);
  return ok;
}
const PermRow = ({ title, desc, ok, grant }: { title: string; desc: string; ok: boolean; grant: () => void }) => (
  <div className="setrow"><div className="grow"><b>{title}</b><small>{desc}</small></div>
    <span className={ok ? "chip" : "chip warn"}>{ok ? "Granted" : "Not granted"}</span>
    {!ok && <button className="btn" onClick={grant}>Grant</button>}</div>);
const INSTALL_PERM: [string, string] = ["Install updates", "Lets Zenith install a new version it has downloaded. Without it, updating stops with an error."];

function Settings({ user, site, signOut, dir, pick, reset, mode, setMode, notify, theme, setTheme, contrast, setContrast, updateMode, setUpdateMode, checkNow, checking, canUpdate, accent, setAccent, assignPages, setAssignPages, internalLinks, setInternalLinks, middleDownload, setMiddleDownload }: { user: string; site: string; signOut: () => void; dir: string | null; pick: () => Promise<string | null>; reset: () => void; mode: api.DlMode; setMode: (m: api.DlMode) => void; notify: (m: string) => void; theme: Theme; setTheme: (t: Theme) => void; contrast: Contrast; setContrast: (c: Contrast) => void; updateMode: api.UpdateMode; setUpdateMode: (m: api.UpdateMode) => void; checkNow: () => void; checking: boolean; canUpdate: boolean; accent: string; setAccent: (a: string) => void; assignPages: boolean; setAssignPages: (v: boolean) => void; internalLinks: boolean; setInternalLinks: (v: boolean) => void; middleDownload: boolean; setMiddleDownload: (v: boolean) => void }) {
  const [tab, setTab] = useState<(typeof SETTINGS_TABS)[number][0]>("general");
  const perm = useInstallPerm();
  const [files, setFiles] = useState<api.DlEntry[] | null>(null); const [confirm, setConfirm] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>((localStorage.getItem("dlSort") as Sort) || "name");
  const changeSort = (v: Sort) => { localStorage.setItem("dlSort", v); setSort(v); };
  const reload = () => api.listDownloads().then(setFiles).catch(() => setFiles([]));
  useEffect(() => { reload(); }, []);
  const [def, setDef] = useState<string | null>(null); useEffect(() => { api.defaultDownloadDir().then(setDef).catch(() => {}); }, []);
  const shownDir = dir ?? def;
  const del = async (paths?: string[]) => { const n = await api.deleteDownloads(paths); notify(`Deleted ${n} file${n === 1 ? "" : "s"}`); setConfirm(null); reload(); };
  const ask = (key: string, run: () => void) => { if (confirm === key) run(); else { setConfirm(key); setTimeout(() => setConfirm(null), 4000); } };
  const byCourse = new Map<string, api.DlEntry[]>();
  (files ?? []).forEach((f) => { const g = f.course.split("/")[0]; byCourse.set(g, [...(byCourse.get(g) ?? []), f]); });
  const groups = [...byCourse].sort(([a], [b]) => a.localeCompare(b));
  const cmp = (a: api.DlEntry, b: api.DlEntry) => sort === "size" ? b.size - a.size : sort === "date" ? b.at - a.at : a.name.localeCompare(b.name);
  groups.forEach(([, l]) => l.sort(cmp));
  const sum = (l: api.DlEntry[]) => l.reduce((a, f) => a + f.size, 0);
  const plural = (n: number) => `${n} file${n === 1 ? "" : "s"}`;
  return (
    <div className="stack">
      <div className="bar"><h1>Settings</h1></div>
      <div className="tabs">{SETTINGS_TABS.filter(([k]) => k !== "permissions" || perm !== null).map(([k, l]) => <button key={k} className={tab === k ? "tab on" : "tab"} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === "general" && (<>
      <section className="sec only-phone">
        <div className="sechead static">Account</div>
        <div className="setrow"><div className="grow"><b>{user}</b><small>{site}</small></div><button className="btn danger" onClick={signOut}>Sign out</button></div>
      </section>
      <section className="sec">
        <div className="sechead static">Updates</div>
        <div className="setrow col"><b>When an update is available</b>
          <div className="choices">{UPDATE_MODES.map(([k, t, d]) => <button key={k} className={updateMode === k ? "choice on" : "choice"} onClick={() => setUpdateMode(k)}><b>{t}</b><small>{d}</small></button>)}</div></div>
        <div className="setrow"><div className="grow"><b>Check for updates now</b><small>{canUpdate ? "Downloads and installs from GitHub releases." : "In-app install isn't available for this package; updates open the release page."}</small></div>
          <button className="btn" disabled={checking} onClick={checkNow}>{checking ? "Checking…" : "Check now"}</button></div>
      </section>
      <section className="sec">
        <div className="sechead static">Courses</div>
        <div className="setrow col"><b>Assignments</b>
          <div className="choices">{ASSIGN_PAGES.map(([k, t, d]) => <button key={String(k)} aria-pressed={assignPages === k} className={assignPages === k ? "choice on" : "choice"} onClick={() => setAssignPages(k)}><b>{t}</b><small>{d}</small></button>)}</div></div>
        <div className="setrow col"><b>Moodle links</b>
          <div className="choices">{INTERNAL_LINKS.map(([k, t, d]) => <button key={String(k)} aria-pressed={internalLinks === k} className={internalLinks === k ? "choice on" : "choice"} onClick={() => setInternalLinks(k)}><b>{t}</b><small>{d}</small></button>)}</div></div>
      </section>
      </>)}
      {tab === "appearance" && (<>
      <section className="sec">
        <div className="sechead static">Appearance</div>
        <div className="setrow col"><b>Theme</b>
          <div className="choices">{THEMES.map(([k, t, d]) => <button key={k} aria-pressed={theme === k} className={theme === k ? "choice on" : "choice"} onClick={() => setTheme(k)}><b>{t}</b><small>{d}</small></button>)}</div></div>
        <div className="setrow col"><div><b>High contrast</b><small>Stronger text and borders, plain colours and clear focus outlines</small></div>
          <div className="choices">{CONTRASTS.map(([k, t, d]) => <button key={k} aria-pressed={contrast === k} className={contrast === k ? "choice on" : "choice"} onClick={() => setContrast(k)}><b>{t}</b><small>{d}</small></button>)}</div></div>
        <div className="setrow col"><b>Accent colour</b>
          <div className="swatches">{ACCENTS.map(([c, n]) => <button key={n} aria-pressed={accent === c} aria-label={n} title={n} className={accent === c ? "swatch on" : "swatch"} style={{ background: c || "#1f5c4a" }} onClick={() => setAccent(c)} />)}</div></div>
      </section>
      </>)}
      {tab === "downloads" && (<>
      <section className="sec">
        <div className="sechead static">Downloads</div>
        <div className="setrow desk"><div className="grow"><b>Download folder</b><small>{shownDir ?? "…"}{!dir && shownDir ? " (default)" : ""}</small></div>
          <button className="btn" onClick={() => pick()}>Change…</button>
          {dir && <button className="btn" onClick={reset}>Use default</button>}
          {shownDir && <button className="btn" onClick={() => api.openLocal(shownDir).catch(() => notify("That folder doesn't exist yet"))}>Open folder</button>}</div>
        <div className="setrow col"><b>When a file is already saved</b>
          <div className="choices">{MODES.map(([k, t, d]) => <button key={k} className={mode === k ? "choice on" : "choice"} onClick={() => setMode(k)}><b>{t}</b><small>{d}</small></button>)}</div></div>
        <div className="setrow col desk"><b>Middle-click a file</b>
          <div className="choices">{MIDDLE_DOWNLOAD.map(([k, t, d]) => <button key={String(k)} aria-pressed={middleDownload === k} className={middleDownload === k ? "choice on" : "choice"} onClick={() => setMiddleDownload(k)}><b>{t}</b><small>{d}</small></button>)}</div></div>
      </section>
      <section className="sec">
        <div className="sechead static"><span>Saved files</span><span className="muted">{files ? `${plural(files.length)} · ${size(sum(files))}` : ""}</span></div>
        <div className="setrow col"><b>Sort by</b>
          <div className="choices">{SORTS.map(([k, t, d]) => <button key={k} aria-pressed={sort === k} className={sort === k ? "choice on" : "choice"} onClick={() => changeSort(k)}><b>{t}</b><small>{d}</small></button>)}</div></div>
        {files && !files.length && <div className="setrow muted">Nothing downloaded yet.</div>}
        {groups.map(([course, list]) => (
          <div key={course} className="coursegroup">
            <div className="setrow"><div className="grow"><b>{course}</b><small>{plural(list.length)} · {size(sum(list))}</small></div>
              <button className="btn danger" onClick={() => ask("c:" + course, () => del(list.map((f) => f.path)))}>{confirm === "c:" + course ? "Click to confirm" : "Clear course"}</button></div>
            {list.map((f) => (
              <div className="setrow file" key={f.path}>
                <div className="grow">{f.name}<small>{size(f.size)} · {new Date(f.at * 1000).toLocaleDateString()}</small></div>
                <button className="icon desk" title="Show in folder" onClick={() => api.revealFile(f.path).catch(() => notify("That file is no longer there"))}><Icon n="folder" /></button>
                <button className="icon" title="Open" onClick={() => api.openLocal(f.path).catch((e) => notify(String(e)))}><Icon n="file" /></button>
                <button className="icon" title="Delete" onClick={() => del([f.path])}><Icon n="trash" /></button>
              </div>))}
          </div>))}
        {!!files?.length && <div className="setrow"><div className="grow muted">Only files Zenith downloaded are listed or removed; anything else in your folder is never touched. Files saved by older versions aren't tracked.</div>
          <button className="btn danger" onClick={() => ask("all", () => del())}>{confirm === "all" ? "Click to confirm" : "Delete all downloads"}</button></div>}
      </section>
      </>)}
      {tab === "permissions" && (
      <section className="sec">
        <div className="sechead static">Permissions</div>
        <div className="setrow"><div className="grow muted">Android keeps these switches in its own settings, so Zenith can only open them for you. The status here updates when you come back.</div></div>
        <PermRow title={INSTALL_PERM[0]} desc={INSTALL_PERM[1]} ok={perm === true} grant={() => api.grantInstallPermission().catch((e) => notify(String(e)))} />
      </section>)}
      {tab === "about" && <About />}
    </div>);
}

// first-launch setup: look + accessibility, shown once. Signing in to the university happens afterwards, on the normal login screen.
const seenSetup = () => localStorage.getItem("onboarded") === "1" || ["theme", "contrast", "dlMode", "dlDir"].some((k) => localStorage.getItem(k) !== null);

function Setup({ theme, setTheme, contrast, setContrast, onDone }: { theme: Theme; setTheme: (t: Theme) => void; contrast: Contrast; setContrast: (c: Contrast) => void; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const perm = useInstallPerm(); const last = perm === null ? 2 : 3;   // the permission step exists on Android only
  return (
    <div className="setup">
      <button className="ghost skip" onClick={onDone}>Skip</button>
      <div className="setupcard">
        {step === 0 && (<>
          <h1>Welcome to Zenith</h1>
          <p className="muted">Your courses and materials, always at hand. Let's set it up the way you like it. It takes a few seconds.</p>
        </>)}
        {step === 1 && (<>
          <h1>Choose your look</h1>
          <p className="muted">Pick how Zenith should appear. The whole window updates as you choose.</p>
          <div className="looks">{THEMES.map(([k, t, d]) => (
            <button key={k} aria-pressed={theme === k} className={theme === k ? "look on" : "look"} onClick={() => setTheme(k)}>
              <div className={"thumb " + k}><i className="tb" /><i className="tc" /><i className="tc" /></div>
              <b>{t}</b><small>{d}</small>
            </button>))}</div>
        </>)}
        {step === 2 && (<>
          <h1>Make it comfortable</h1>
          <p className="muted">Turn on anything that helps you read and navigate more easily.</p>
          <div className="accrow col"><div><b>High contrast</b><small>Stronger text and borders, plain colours and clear focus outlines</small></div>
          <div className="choices">{CONTRASTS.map(([k, t, d]) => <button key={k} aria-pressed={contrast === k} className={contrast === k ? "choice on" : "choice"} onClick={() => setContrast(k)}><b>{t}</b><small>{d}</small></button>)}</div></div>
          <p className="muted small2">You can change all of this later in Settings.</p>
        </>)}
        {step === 3 && (<>
          <h1>Allow updates</h1>
          <p className="muted">Android asks before an app may install another one. Allow it now, so a Zenith update never stops with an error later.</p>
          <section className="sec"><PermRow title={INSTALL_PERM[0]} desc={INSTALL_PERM[1]} ok={perm === true} grant={() => api.grantInstallPermission().catch(() => {})} /></section>
          <p className="muted small2">You can also do this later in Settings → Permissions.</p>
        </>)}
        <div className="setupnav">
          {step > 0 ? <button className="btn" onClick={() => setStep(step - 1)}>Back</button> : <span style={{ width: 70 }} />}
          <div className="pager">{Array.from({ length: last + 1 }, (_, i) => <i key={i} className={i === step ? "on" : ""} />)}</div>
          <button className="primary" style={{ padding: "12px 22px" }} onClick={() => (step < last ? setStep(step + 1) : onDone())}>{step === 0 ? "Get started" : step < last ? "Next" : "Continue to login"}</button>
        </div>
      </div>
    </div>);
}

type Due = api.UpcomingAssign & { submitted: boolean | null };
type Overlay = { kind: "html" | "forum" | "assign" | "chat" | "conv"; title: string; url?: string; id?: number; assign?: api.Assign; course?: string; group?: number; cmid?: number; courseId?: number; conv?: api.Conversation };
type View = { token: string; stack: api.Course[]; overlay: Overlay | null; settingsOpen: boolean; explore: boolean; messagesOpen: boolean };

// Windows and X11 show a per-window icon; Wayland and macOS ignore it, so the error is dropped.
async function tintWindowIcon(accent: string) {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const x = c.getContext("2d")!, s = (p: string) => new Path2D(p);
  x.scale(0.25, 0.25);   // the same geometry as the 1024px src-tauri/icons/icon.svg
  x.fillStyle = accent || "#1f5c4a";
  x.fill(s("M264 64H760A200 200 0 0 1 960 264V760A200 200 0 0 1 760 960H264A200 200 0 0 1 64 760V264A200 200 0 0 1 264 64Z"));
  x.strokeStyle = "#7cc9a8"; x.lineWidth = 36;
  x.stroke(s("M212 640A332 332 0 0 1 812 640"));
  x.strokeStyle = "#eef3f0"; x.lineCap = "round";
  x.stroke(s("M168 640H856"));
  x.lineWidth = 18;
  x.stroke(s("M512 528V640"));
  x.fillStyle = "#eef3f0"; x.beginPath(); x.arc(512, 450, 80, 0, Math.PI * 2); x.fill();
  const rgba = new Uint8Array(x.getImageData(0, 0, 256, 256).data);
  const img = await Image.new(rgba, 256, 256);
  await getCurrentWindow().setIcon(img);
  await img.close();
}

export default function App() {
  const [session, setSession] = useState<api.Session | null | undefined>(undefined);
  const [info, setInfo] = useState<api.Info | null>(null); const [courses, setCourses] = useState<api.Course[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dlMode, setDlMode] = useState<api.DlMode>((localStorage.getItem("dlMode") as api.DlMode) || "updated");
  const changeMode = (m: api.DlMode) => { localStorage.setItem("dlMode", m); setDlMode(m); };
  const [assignPages, setAssignPages] = useState(localStorage.getItem("assignPages") !== "off");
  const changeAssignPages = (v: boolean) => { localStorage.setItem("assignPages", v ? "on" : "off"); setAssignPages(v); };
  const [internalLinks, setInternalLinks] = useState(localStorage.getItem("internalLinks") !== "off");
  const changeInternalLinks = (v: boolean) => { localStorage.setItem("internalLinks", v ? "on" : "off"); setInternalLinks(v); };
  const [middleDownload, setMiddleDownload] = useState(localStorage.getItem("middleDownload") !== "off");
  const changeMiddleDownload = (v: boolean) => { localStorage.setItem("middleDownload", v ? "on" : "off"); setMiddleDownload(v); };
  const [theme, setThemeState] = useState<Theme>((localStorage.getItem("theme") as Theme) || "system");
  const [contrast, setContrastState] = useState<Contrast>(() => { const v = localStorage.getItem("contrast"); return v === "on" || v === "high" ? "on" : v === "off" ? "off" : "system"; });   // System by default
  const [osHigh, setOsHigh] = useState(() => matchMedia("(prefers-contrast: more)").matches);
  useEffect(() => { const mq = matchMedia("(prefers-contrast: more)"); const f = () => setOsHigh(mq.matches); mq.addEventListener("change", f); return () => mq.removeEventListener("change", f); }, []);
  const high = contrast === "on" || (contrast === "system" && osHigh);
  const setTheme = (t: Theme) => { localStorage.setItem("theme", t); setThemeState(t); };
  const [accent, setAccentState] = useState(() => { const v = localStorage.getItem("accent") ?? ""; return ACCENTS.some(([c]) => c === v) ? v : ""; });
  const setAccent = (a: string) => { localStorage.setItem("accent", a); setAccentState(a); };
  const setContrast = (c: Contrast) => { localStorage.setItem("contrast", c); setContrastState(c); };
  const [setup, setSetup] = useState(!seenSetup());
  useEffect(() => { if (session && setup) { localStorage.setItem("onboarded", "1"); setSetup(false); } }, [session]);   // existing users never see it
  const finishSetup = () => { localStorage.setItem("onboarded", "1"); setSetup(false); };
  useEffect(() => {
    const r = document.documentElement;
    if (theme === "system") delete r.dataset.theme; else r.dataset.theme = theme;
    if (high) r.dataset.contrast = "high"; else delete r.dataset.contrast;
    if (accent) { r.dataset.accent = ""; r.style.setProperty("--a", accent); } else { delete r.dataset.accent; r.style.removeProperty("--a"); }
  }, [theme, high, accent]);
  useEffect(() => { if (!api.isMobile()) tintWindowIcon(accent).catch(() => {}); }, [accent]);
  const [explore, setExplore] = useState(false); const [enrolledIds, setEnrolledIds] = useState<Set<number>>(new Set());
  const [messagesOpen, setMessagesOpen] = useState(false);
  const [stack, setStack, back, clear] = useCourseStack<api.Course>(); const [q, setQ] = useState("");
  const open_ = stack[stack.length - 1] ?? null;
  const [dir, setDir] = useState(localStorage.getItem("dlDir")); const [toast, setToast] = useState("");
  const [note, setNote] = useState("");   // auto-login warnings must survive the app being backgrounded for the browser
  const [offline, setOffline] = useState(api.isOffline());
  const offlineRef = useRef(offline); offlineRef.current = offline;
  const [tick, setTick] = useState(0);   // bumped when the connection comes back, to reload what was served from the cache
  const [dl, setDl] = useState<Dl | null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const viewKey = useRef(""); const restoringView = useRef(false);
  const hidx = useRef(0), hmax = useRef(0);   // current entry and the furthest one, to tell if back/forward exists
  const natural = useRef(false); const hintRef = useRef<HTMLDivElement>(null);
  useEffect(() => { api.naturalScroll().then((v) => { natural.current = v; }).catch(() => {}); }, []);
  // Browser history is the screen history: back/forward (buttons, Alt+Arrow, Android back) move through it.
  useLayoutEffect(() => {
    if (!session) return;
    const view: View = { token: session.token, stack, overlay, settingsOpen, explore, messagesOpen };
    const key = JSON.stringify(view);
    if (restoringView.current) { restoringView.current = false; viewKey.current = key; return; }
    if (!viewKey.current) { history.replaceState({ view, i: 0 }, ""); hidx.current = 0; hmax.current = 0; viewKey.current = key; return; }
    if (key === viewKey.current) return;
    hidx.current++; hmax.current = hidx.current;   // a push drops any forward entries
    history.pushState({ view, i: hidx.current }, "");
    viewKey.current = key;
  }, [session, stack, overlay, settingsOpen, explore, messagesOpen]);
  useEffect(() => {
    const f = (e: PopStateEvent) => {
      const v = e.state?.view as View | undefined;
      // Entries from a previous login must not bring another account's courses back.
      if (!v || !session || v.token !== session.token) return;
      hidx.current = e.state?.i ?? 0;
      restoringView.current = true;
      setStack(v.stack); setOverlay(v.overlay); setSettingsOpen(v.settingsOpen); setExplore(v.explore); setMessagesOpen(!!v.messagesOpen);
    };
    window.addEventListener("popstate", f);
    return () => window.removeEventListener("popstate", f);
  }, [session]);
  useEffect(() => {
    if (api.isMobile()) return;   // Alt+Arrow is a desktop shortcut
    const f = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable]")) return;
      const dir = navKey(e);
      if (!dir) return;
      e.preventDefault();
      if (dir < 0) history.back(); else history.forward();
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);
  // The WebView has no native swipe gesture (wry disables it), so accumulate the wheel deltas of one gesture.
  useEffect(() => {
    if (api.isMobile()) return;
    let acc = 0, last = 0, lock = 0, release = 0;
    const draw = (dir: number, p: number) => {
      const el = hintRef.current, b = el?.firstElementChild as HTMLElement | null;
      if (!el || !b) return;
      el.dataset.dir = String(dir); el.classList.add("on");
      b.style.setProperty("--tx", `${dir * (1 - p) * 36}px`);   // mostly off the edge, sliding in
      b.style.setProperty("--sc", String(0.8 + p * 0.2));
      b.style.setProperty("--o", String(0.3 + p * 0.7));
    };
    const hide = () => hintRef.current?.classList.remove("on");
    const can = (dir: number) => (dir < 0 ? hidx.current > 0 : hidx.current < hmax.current);
    // shortcut: a 130 ms silence stands in for "fingers lifted" because wheel events carry no gesture end;
    // upgrade to a native gesture once the WebView exposes one.
    const finish = () => {
      const dir = swipeDir(acc, natural.current);
      acc = 0;
      if (!dir || !can(dir)) return hide();
      lock = performance.now() + 150;
      draw(dir, 1); window.setTimeout(hide, 160);
      if (dir < 0) history.back(); else history.forward();
    };
    const f = (e: WheelEvent) => {
      if (e.ctrlKey) return;   // pinch zoom
      // momentum left over from the gesture that just navigated must not start another one
      if (e.timeStamp < lock) { lock = e.timeStamp + 150; return; }
      const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerWidth : 1;   // lines / pages -> pixels
      const dx = e.deltaX * k, dy = e.deltaY * k;
      if (Math.abs(dx) <= Math.abs(dy)) return;
      // a genuinely sideways-scrollable element keeps its scroll
      for (let el = e.target instanceof Element ? e.target : null; el; el = el.parentElement) {
        const s = getComputedStyle(el);
        if ((s.overflowX === "auto" || s.overflowX === "scroll") && el.scrollWidth > el.clientWidth) return;
      }
      if (e.timeStamp - last > 150) acc = 0;   // a pause starts a new gesture
      last = e.timeStamp;
      if (Math.sign(acc) !== Math.sign(dx)) acc = 0;
      acc += dx;
      const way = Math.sign(acc) * (natural.current ? -1 : 1);   // -1 back, +1 forward
      if (can(way)) draw(way, Math.min(Math.abs(acc) / 120, 1)); else hide();
      clearTimeout(release);
      release = window.setTimeout(finish, 130);
    };
    window.addEventListener("wheel", f, { passive: true });
    return () => window.removeEventListener("wheel", f);
  }, []);
  const notify = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(""), 3500); }, []);
  useEffect(() => {
    // the WebView's own online flag can stay stale on Android, so poll the site as well (and on focus / network events)
    let live = true;
    const check = () => api.reachable().then((ok) => { if (!live) return; if (ok && offlineRef.current) setTick((n) => n + 1); setOffline(!ok); }).catch(() => {});
    const off = () => setOffline(true);
    api.setNetHandler(() => setOffline(true));
    check(); const t = setInterval(() => { if (offlineRef.current) check(); }, 10000);   // only ask the site while offline: a failing call, a focus or a network event notices a drop
    window.addEventListener("online", check); window.addEventListener("offline", off); window.addEventListener("focus", check);
    return () => { live = false; clearInterval(t); window.removeEventListener("online", check); window.removeEventListener("offline", off); window.removeEventListener("focus", check); };
  }, []);
  useEffect(() => { const un = listen<{ id: string; done: number; total: number | null }>("download-progress", (e) => setDl((cur) => (cur && cur.id === e.payload.id ? { ...cur, done: e.payload.done, total: e.payload.total } : cur))); return () => { un.then((f) => f()); }; }, []);
  const refresh = () => api.getSession().then(setSession);
  useEffect(() => { refresh(); }, []);
  useEffect(() => { api.setNoteHandler(setNote); }, []);
  useEffect(() => { if (session && info) api.enrolledCourses(info.userid).then((l) => setEnrolledIds(new Set(l.map((c) => c.id)))).catch(() => {}); }, [session, info]);
  const [due, setDue] = useState<Due[]>([]);
  const [dueTick, setDueTick] = useState(0);
  useEffect(() => {
    if (!session || !info) { setDue([]); return; }
    const key = "upcoming:" + info.userid, cached = cacheGet<Due[]>(key);
    if (api.isOffline() && cached) { setDue(cached); return; }
    if (!enrolledIds.size) { setDue(cached ?? []); return; }
    let live = true;
    api.assignmentsForCourses([...enrolledIds])
      .then(async (list) => {
        const next = list.filter((a) => a.duedate * 1000 > Date.now()).sort((a, b) => a.duedate - b.duedate).slice(0, 5);
        const withStatus = await Promise.all(next.map(async (a) => {
          try { return { ...a, submitted: (await api.assignStatus(a.id)).submission === "submitted" }; }
          catch { return { ...a, submitted: null }; }
        }));
        if (!live) return;
        setDue(withStatus); cacheSet(key, withStatus);
      })
      .catch(() => { if (cached) setDue(cached); });
    return () => { live = false; };
  }, [session, info, enrolledIds, dueTick]);
  const [update, setUpdate] = useState<api.UpdateInfo | null>(null);
  const [updatePhase, setUpdatePhase] = useState<"idle" | "checking" | "available" | "downloading" | "ready" | "installing" | "error">("idle");
  const [updateProgress, setUpdateProgress] = useState<api.UpdateProgress | null>(null);
  const [updatePath, setUpdatePath] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState("");
  const updateBusy = useRef(false);
  const phaseRef = useRef(updatePhase); phaseRef.current = updatePhase;   // the 6-hour timer would otherwise see the phase from when it started
  const [updateMode, setUpdateModeState] = useState<api.UpdateMode>(() => { const v = localStorage.getItem("updateMode"); return v === "auto" || v === "manual" ? v : "ask"; });
  const setUpdateMode = (m: api.UpdateMode) => { localStorage.setItem("updateMode", m); setUpdateModeState(m); };
  const [canSelfUpdate, setCanSelfUpdate] = useState(true);
  useEffect(() => { api.canSelfUpdate().then(setCanSelfUpdate).catch(() => setCanSelfUpdate(false)); }, []);
  const canInstall = (u: api.UpdateInfo) => canSelfUpdate && (!api.isMobile() || !!u.apkUrl);
  async function download() {
    setUpdatePhase("downloading"); setUpdateProgress({ done: 0, total: null }); setUpdateError(""); setUpdatePath(null);
    try {
      setUpdatePath(await api.downloadUpdate(setUpdateProgress));
      setUpdatePhase("ready");
    } catch (e) {
      setUpdateError(String(e).replace(/^Error: /, ""));
      setUpdatePhase("error");
    }
  }
  async function checkForUpdate(manual: boolean) {
    if (updateBusy.current || phaseRef.current === "downloading" || phaseRef.current === "installing" || (!manual && phaseRef.current === "ready")) return;
    updateBusy.current = true;
    setUpdate(null); setUpdatePhase("checking"); setUpdateError("");
    try {
      const u = await api.checkUpdate();
      if (!u) { setUpdatePhase("idle"); if (manual) notify("Zenith is up to date."); return; }
      if (!manual && localStorage.getItem("skipVersion") === u.version) { setUpdatePhase("idle"); return; }
      setUpdate(u); setUpdatePhase("available");
      if (updateMode === "auto" && canInstall(u)) void download();
    } catch (e) {
      setUpdatePhase("idle");
      if (manual) notify("Couldn't check for updates: " + String(e).replace(/^Error: /, ""));
    } finally {
      updateBusy.current = false;
    }
  }
  async function install() {
    if (!update) return;
    setUpdatePhase("installing"); setUpdateError("");
    try {
      await api.installUpdate(updatePath);
      if (api.isMobile()) { notify("Finish installing in the Android dialog."); setUpdatePhase("idle"); }
    } catch (e) {
      setUpdateError(String(e).replace(/^Error: /, ""));
      setUpdatePhase("error");
    }
  }
  useEffect(() => {
    if (updateMode === "manual") return;
    void checkForUpdate(false);
    const t = setInterval(() => void checkForUpdate(false), 6 * 3600 * 1000);
    return () => clearInterval(t);
  }, [updateMode, canSelfUpdate]);
  const [filter, setFilter] = useState<api.Filter>("all"); const [menu, setMenu] = useState<number | null>(null); const [loading, setLoading] = useState(false);
  const loadSeq = useRef(0);
  const load = useCallback((f: api.Filter) => {
    const seq = ++loadSeq.current, stale = () => seq !== loadSeq.current;   // a slower earlier answer must not replace a newer filter's
    setLoading(true);
    const cached = cacheGet<api.Course[]>("courses:" + f);
    if (api.isOffline() && cached) { setCourses(cached); setLoading(false); return Promise.resolve(); }
    return api.listCourses(f)
      .then((cs) => { if (stale()) return; setCourses(cs); cacheSet("courses:" + f, cs); setOffline(false); })
      .catch((e) => {
        if (stale()) return;
        if (authError(e)) { api.logout(); setSession(null); cacheClear(); setCourses([]); }
        else if (cached) { setCourses(cached); setOffline(true); }
        else notify("Couldn't load courses: " + e);
      })
      .finally(() => { if (!stale()) setLoading(false); });
  }, [notify]);
  useEffect(() => { if (session) load(filter); }, [session, filter, tick]);
  useEffect(() => {
    if (!session) return;
    const cached = cacheGet<api.Info>("info");
    if (api.isOffline() && cached) { setInfo(cached); return; }
    api.siteInfo().then((i) => { setInfo(i); cacheSet("info", i); })
      .catch((e) => {
        if (authError(e)) { api.logout(); setSession(null); setInfo(null); cacheClear(); }
        else { setOffline(true); if (cached) setInfo(cached); }
      });
  }, [session]);
  const act = async (c: api.Course, what: "fav" | "hide") => {
    setMenu(null);
    try {
      if (what === "fav") await api.setFavourite(c.id, !c.isfavourite);
      else await api.setHidden(info!.userid, c.id, filter !== "hidden" && !c.hidden);
      await load(filter);
    } catch (e) { notify("Couldn't update course: " + e); }
  };
  const openCourseById = async (id: number) => {
    if (open_?.id === id) return;
    try {
      const c = courses.find((x) => x.id === id) ?? (await api.courseById(id));
      if (!c) throw new Error("not found");
      setStack((st) => [...st, c]);
    } catch { api.openWeb(`${session!.site}/course/view.php?id=${id}`); }
  };
  // Downloads a file from an assignment page; the course view keeps its own copy for its saved-file menu.
  const openAttachment = async (f: api.FileItem, course: string, group: number) => {
    const id = Date.now() + "-" + Math.random().toString(36).slice(2);
    setDl({ id, name: f.filename, done: 0, total: null });
    try {
      const r = await api.download(id, f.fileurl, dir ?? "", `${course}/${group}`, f.filename, dlMode, f.timemodified);
      notify(r.reused ? "Opened saved copy of " + f.filename : "Downloaded " + f.filename);
    } catch (e) { notify("Download failed: " + (api.isOffline() ? "you're offline." : e)); }
    finally { setTimeout(() => setDl((d) => (d?.id === id ? null : d)), 400); }
  };
  const openModuleLink = async (t: ModLink, fallback: string) => {
    try {
      const m = await api.courseModule(t.id);
      if (t.kind === "forum" && m.modname === "forum") { setOverlay({ kind: "forum", title: m.name, id: m.instance }); return; }
      if (t.kind === "chat" && m.modname === "chat") { setOverlay({ kind: "chat", title: m.name, id: m.instance, cmid: m.id, courseId: m.course }); return; }
      if (t.kind === "assign" && m.modname === "assign") {
        if (!assignPages) { setOverlay(null); await openCourseById(m.course); return; }
        const a = (await api.courseAssignments(m.course)).find((x) => x.cmid === m.id);
        if (a) {
          const c = await api.courseById(m.course).catch(() => null);
          setOverlay({ kind: "assign", title: a.name, assign: a, course: c?.shortname || c?.fullname || String(m.course), group: m.id });
          return;
        }
      }
    } catch { /* fall through to the browser */ }
    api.openWeb(fallback);
  };
  // same-site course/forum/assignment links open in the app; everything else in the system browser
  const handleLink = (href: string) => {
    if (!session) return;
    let u: URL; try { u = new URL(href, session.site + "/"); } catch { return; }
    if (!/^https?:$/.test(u.protocol)) return;
    if (internalLinks && isHtmlUrl(u) && sameOrigin(session.site, u.toString())) {
      const name = u.pathname.split("/").pop() || "Page";
      setOverlay({ kind: "html", title: name, url: webserviceUrl(u) });
      return;
    }
    const t = internalLinks ? moodleLink(u, session.site) : null;
    if (!t) { api.openWeb(u.toString()); return; }
    if (t.kind === "course") { setOverlay(null); openCourseById(t.id); }
    else if (t.kind === "forum" && t.instance) setOverlay({ kind: "forum", title: "Forum", id: t.id });
    else void openModuleLink(t, u.toString());
  };
  const pick = async () => { const p = await open({ directory: true, title: "Choose download folder" }); if (typeof p === "string") { localStorage.setItem("dlDir", p); setDir(p); return p; } return null; };
  const resetDir = () => { localStorage.removeItem("dlDir"); setDir(null); };

  // Refresh: every page under <main> starts over (its key changes), the course list and the due list are fetched again
  const [rk, setRk] = useState(0); const [spin, setSpin] = useState(false);
  const doRefresh = () => { setRk((n) => n + 1); setTick((n) => n + 1); setDueTick((n) => n + 1); setSpin(true); setTimeout(() => setSpin(false), 700); };
  const refreshRef = useRef(doRefresh); refreshRef.current = doRefresh;
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === "F5" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r")) { e.preventDefault(); refreshRef.current(); } };
    window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f);
  }, []);
  const signOut = () => api.logout().then(() => { viewKey.current = ""; restoringView.current = false; hidx.current = 0; hmax.current = 0; clear(); cacheClear(); setOverlay(null); setInfo(null); setCourses([]); refresh(); });
  if (session === undefined) return null;
  if (!session) return setup
    ? <Setup theme={theme} setTheme={setTheme} contrast={contrast} setContrast={setContrast} onDone={finishSetup} />
    : <Login onDone={refresh} />;
  const refreshBtn = <button className={spin ? "icon spin" : "icon"} title="Refresh (F5)" aria-label="Refresh" onClick={doRefresh}><Icon n="refresh" /></button>;
  const shown = courses.filter((c) => c.fullname.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="app">
      <aside>
        <div className="brand">Zenith</div>
        <nav>
          <button className={!explore && !settingsOpen && !messagesOpen ? "on" : ""} onClick={() => { setExplore(false); setSettingsOpen(false); setMessagesOpen(false); setOverlay(null); clear(); }}><Icon n="notes" />My courses</button>
          <button className={messagesOpen ? "on" : ""} onClick={() => { setMessagesOpen(true); setExplore(false); setSettingsOpen(false); setOverlay(null); clear(); }}><Icon n="chat" />Messages</button>
          <button className={explore ? "on" : ""} onClick={() => { setExplore(true); setSettingsOpen(false); setMessagesOpen(false); setOverlay(null); clear(); }}><Icon n="search" />Explore</button>
          <button className={settingsOpen ? "on" : ""} onClick={() => { setSettingsOpen(true); setExplore(false); setMessagesOpen(false); setOverlay(null); clear(); }}><Icon n="sliders" />Settings</button>
        </nav>
        <div className="grow" />
        <div className="user"><div className="avatar">{initials(info?.fullname ?? "?")}</div><span className="grow">{info?.fullname}</span>
          <button className="icon" title="Sign out" onClick={signOut}><Icon n="out" /></button></div>
      </aside>
      <main key={rk}>
        {note && <div className="offline" role="alert"><Icon n="lock" s={16} /><span className="grow">{note}</span><button className="icon" title="Dismiss" onClick={() => setNote("")}><Icon n="x" s={16} /></button></div>}
        {offline && <div className="offline" role="status"><Icon n="wifi" s={16} /><span>You're offline. Showing courses and files already saved on this device.</span></div>}
        {overlay ? (
          overlay.kind === "conv"
            ? <ConversationView key={overlay.conv!.id} c={overlay.conv!} me={info?.userid ?? 0} site={session.site} token={session.token} onLink={handleLink} onBack={back} />
            : overlay.kind === "forum"
            ? <ForumPage title={overlay.title} id={overlay.id!} site={session.site} token={session.token} onLink={handleLink} onClose={back} />
            : overlay.kind === "chat"
            ? <ChatPage key={overlay.id} title={overlay.title} id={overlay.id!} cmid={overlay.cmid!} courseId={overlay.courseId!} me={info?.userid ?? 0} site={session.site} token={session.token} onLink={handleLink} onClose={back} />
            : overlay.kind === "assign"
            ? <AssignRow key={overlay.assign!.id} page a={overlay.assign!} site={session.site} token={session.token} onLink={handleLink} getFile={(f) => openAttachment(f, overlay.course!, overlay.group!)} onSubmitted={() => setDueTick((n) => n + 1)} onClose={back} />
            : <HtmlPage title={overlay.title} url={overlay.url!} site={session.site} token={session.token} onLink={handleLink} onClose={back} />
        ) : open_ ? (<>
          <div className="bar"><button className="icon" onClick={back}><Icon n="back" /></button><h1>{open_.fullname}</h1>{refreshBtn}</div>
          <div className="banner" style={{ background: tone(open_.id) }}>{open_.shortname}</div>
          <CourseView key={open_.id} dlMode={dlMode} c={open_} site={session.site} token={session.token} dir={dir} notify={notify} onLink={handleLink}
            onHtml={(title, url) => setOverlay({ kind: "html", title, url })} onForum={(title, id) => setOverlay({ kind: "forum", title, id })} setDl={setDl} onSubmitted={() => setDueTick((n) => n + 1)}
            onChat={(title, id, cmid, courseId) => setOverlay({ kind: "chat", title, id, cmid, courseId })}
            assignPages={assignPages} onAssign={(a, course, group) => setOverlay({ kind: "assign", title: a.name, assign: a, course, group })} middleDownload={middleDownload} />
        </>) : messagesOpen ? (
          <MessagesPage me={info?.userid ?? 0} site={session.site}
            onOpen={(c) => setOverlay({ kind: "conv", title: api.convName(c, info?.userid ?? 0), conv: c })} />
        ) : explore ? (
          <Explore site={session.site} token={session.token} enrolled={enrolledIds} notify={notify} onLink={handleLink}
            onJoined={(c) => { setExplore(false); setStack([c]); setEnrolledIds((s) => new Set(s).add(c.id)); load(filter); }} />
        ) : settingsOpen ? (
          <Settings user={info?.fullname ?? ""} site={info?.sitename ?? ""} signOut={signOut} dir={dir} pick={pick} reset={resetDir} mode={dlMode} setMode={changeMode} notify={notify} theme={theme} setTheme={setTheme} contrast={contrast} setContrast={setContrast}
            updateMode={updateMode} setUpdateMode={setUpdateMode} checkNow={() => void checkForUpdate(true)} checking={updatePhase === "checking"} canUpdate={canSelfUpdate} accent={accent} setAccent={setAccent}
            assignPages={assignPages} setAssignPages={changeAssignPages} internalLinks={internalLinks} setInternalLinks={changeInternalLinks}
            middleDownload={middleDownload} setMiddleDownload={changeMiddleDownload} />
        ) : (<>
          <div className="bar"><h1>My courses</h1>{refreshBtn}<input className="search" placeholder="Search courses…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {!!due.length && <section className="duecard" aria-label="Upcoming assignments">
            <div className="duehead"><b>Due soon</b><small>{due.length} upcoming</small></div>
            {due.map((a) => <button className={"due " + (a.submitted === true ? "submitted" : a.submitted === false ? "pending" : "unknown")} key={a.id} onClick={() => assignPages ? setOverlay({ kind: "assign", title: a.name, assign: a, course: a.courseShort, group: a.cmid }) : openCourseById(a.courseId)}>
              <span className="grow"><b>{a.name}</b><small>{a.courseShort} · {when(a.duedate)}</small></span>
              <span className="duestatus">{a.submitted === true ? "Submitted" : a.submitted === false ? "Not submitted" : "Status unavailable"}</span>
            </button>)}
          </section>}
          <div className="tabs">{FILTERS.map(([k, l]) => <button key={k} className={filter === k ? "tab on" : "tab"} onClick={() => setFilter(k)}>{l}</button>)}</div>
          {loading ? <p className="muted pad">Loading…</p> : (
            <div className="grid" onClick={() => setMenu(null)}>{shown.map((c) => {
              const img = realImage(c.courseimage, session.site, session.token); const hid = filter === "hidden" || c.hidden;
              return (
                <div className={menu === c.id ? "course open" : "course"} role="button" key={c.id} onClick={() => setStack([c])}>
                  <div className="cover" style={{ background: tone(c.id) }}>
                    <span>{initials(c.fullname)}</span>
                    {img && <img src={img} onError={(e) => (e.currentTarget.style.display = "none")} />}
                  </div>
                  {c.isfavourite && <span className="fav"><Icon n="star" s={15} /></span>}
                  <button className={menu === c.id ? "dots on" : "dots"} title="Options" onClick={(e) => { e.stopPropagation(); setMenu(menu === c.id ? null : c.id); }}><Icon n="dots" /></button>
                  {menu === c.id && (
                    <div className="menu" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => act(c, "fav")}><Icon n="star" s={16} />{c.isfavourite ? "Remove from favourites" : "Add to favourites"}</button>
                      <button onClick={() => act(c, "hide")}><Icon n={hid ? "eye" : "eyeoff"} s={16} />{hid ? "Show in course list" : "Hide from view"}</button>
                      <button onClick={() => { setMenu(null); api.openWeb(`${session.site}/course/view.php?id=${c.id}`); }}><Icon n="ext" s={16} />Open in browser</button>
                    </div>)}
                  <div className="body"><b>{c.fullname}</b>
                    {c.progress != null && <div className="prog"><i style={{ width: `${Math.round(c.progress)}%` }} /></div>}
                    {c.progress != null && <small>{Math.round(c.progress)}% complete</small>}</div>
                </div>);
            })}</div>)}
          {!shown.length && !loading && <p className="muted pad">No courses in this view.</p>}
        </>)}
      </main>
      {update && updatePhase !== "checking" && (
        <div className="update">
          <div className="grow">
            <b>{updatePhase === "ready" ? `Zenith ${update.version} is ready` : updatePhase === "downloading" ? `Downloading Zenith ${update.version}…` : updatePhase === "installing" ? "Installing update…" : updatePhase === "error" ? "Couldn't update automatically" : `Zenith ${update.version} is available`}</b>
            <small className={updatePhase === "error" ? "msg" : ""}>{updatePhase === "error" ? updateError : updatePhase === "downloading" ? (updateProgress?.total ? `${Math.round((updateProgress.done / updateProgress.total) * 100)}%` : size(updateProgress?.done ?? 0)) : updatePhase === "ready" ? "Install it now, or later." : "A newer version has been released."}</small>
            {updatePhase === "downloading" && <div className={updateProgress?.total ? "dlbar" : "dlbar indet"}>{updateProgress?.total ? <i style={{ width: `${Math.min(100, Math.round((updateProgress.done / updateProgress.total) * 100))}%` }} /> : <i />}</div>}
          </div>
          {updatePhase === "available" && (canInstall(update) ? <button className="primary sm" onClick={() => void download()}>Download</button> : <button className="primary sm" onClick={() => api.openExternal(update.url)}>Open release page</button>)}
          {updatePhase === "ready" && <button className="primary sm" onClick={() => void install()}>Install and restart</button>}
          {updatePhase === "error" && <button className="primary sm" onClick={() => api.openExternal(update.url)}>Open release page</button>}
          {updatePhase === "error" && updatePath && <button className="btn" onClick={() => void install()}>Try install</button>}
          {updatePhase !== "downloading" && updatePhase !== "installing" && <button className="icon" title={updatePhase === "error" ? "Later" : "Skip this version"} onClick={() => { if (updatePhase !== "error") localStorage.setItem("skipVersion", update.version); setUpdate(null); setUpdatePhase("idle"); }}><Icon n="x" /></button>}
        </div>)}
      {(toast || dl) && <div className="toast">{toast || dl?.name}
        {dl && <div className={dl.total ? "dlbar" : "dlbar indet"}>{dl.total ? <i style={{ width: `${Math.min(100, Math.round((dl.done / dl.total) * 100))}%` }} /> : <i />}</div>}
        {dl && <span className="dltext">{size(dl.done)}{dl.total ? ` of ${size(dl.total)}` : ""}</span>}
      </div>}
      <div className="swipehint" ref={hintRef} aria-hidden="true"><span className="bub"><Icon n="back" s={22} /></span></div>
    </div>
  );
}
