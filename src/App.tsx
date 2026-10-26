import { useCallback, useEffect, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { useCourseStack } from "./courseStack";
import * as api from "./api";

const P: Record<string, string> = {
  file: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6",
  link: "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7 M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7",
  chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  lock: "M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4",
  check: "M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  folder: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5z",
  down: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3",
  back: "M19 12H5 M12 19l-7-7 7-7",
  out: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
  chev: "M6 9l6 6 6-6",
  dots: "M12 12h.01 M19 12h.01 M5 12h.01",
  x: "M18 6L6 18 M6 6l12 12",
  search: "M21 21l-4.35-4.35 M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
  sliders: "M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6",
  trash: "M3 6h18 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6 M10 11v6 M14 11v6 M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2",
  star: "M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z",
  eyeoff: "M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94 M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19 M1 1l22 22",
  eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  ext: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6 M15 3h6v6 M10 14L21 3",
  wifi: "M5 12.55a11 11 0 0 1 14.08 0 M1.42 9a16 16 0 0 1 21.16 0 M8.53 16.11a6 6 0 0 1 6.95 0 M12 20h.01",
};
const Icon = ({ n, s = 18 }: { n: string; s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={P[n]} /></svg>
);
const modIcon = (m: string) => ({ resource: "file", url: "link", forum: "chat", folder: "folder", assign: "check", quiz: "check", choice: "check", feedback: "check" } as any)[m] ?? "book";
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
if (import.meta.env.DEV) {
  console.assert(tokenised("/pluginfile.php/1/a.png", "https://m.uni.edu", "t") === "https://m.uni.edu/webservice/pluginfile.php/1/a.png?token=t");
  console.assert(tokenised("https://other.edu/a.png", "https://m.uni.edu", "t") === "https://other.edu/a.png");
}
// Saved API answers, so courses that were already opened stay readable without a connection.
const CACHE = "zenith:cache:";
const cacheGet = <T,>(k: string): T | undefined => { try { const v = localStorage.getItem(CACHE + k); return v === null ? undefined : JSON.parse(v) as T; } catch { return undefined; } };
const cacheSet = (k: string, v: unknown) => { try { localStorage.setItem(CACHE + k, JSON.stringify(v)); } catch {} };
const cacheClear = () => { for (const k of Object.keys(localStorage)) if (k.startsWith(CACHE)) localStorage.removeItem(k); };
// A dropped connection must never sign anyone out: only Moodle rejecting the token should.
const authError = (e: unknown) => /invalid\s*token|accessexception|servicerequireslogin|usernotloggedin/i.test(String(e));
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
    const a = listen("sso-complete", onDone); const b = listen<string>("sso-error", (e) => { setMsg(e.payload); setBusy(false); });
    return () => { a.then((f) => f()); b.then((f) => f()); };
  }, []);
  const sso = site && (site.config.typeoflogin ?? 1) !== 1;
  const connect = async () => { setMsg(""); setBusy(true); try { setSite(await api.resolveSite(url)); } catch (e) { setMsg(String(e)); } setBusy(false); };
  return (
    <div className="login">
      <div className="hero"><h1>Zenith</h1><p>Your Moodle™ courses and files, always at hand.</p><p className="legal">Independent app, not affiliated with or endorsed by Moodle. The word Moodle and associated Moodle logos are trademarks or registered trademarks of Moodle Pty Ltd or its related affiliates.</p></div>
      <div className="panel">
        <h2>{site ? site.config.sitename : "Connect to your university"}</h2>
        {!site ? (<>
          <label>Moodle address</label>
          <input autoFocus placeholder="moodle.university.edu" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && connect()} />
          <button className="primary" disabled={busy || !url} onClick={connect}>{busy ? "Connecting…" : "Continue"}</button>
        </>) : sso ? (<>
          <p className="muted">You'll sign in through your institution in your browser, then return here.</p>
          <button className="primary" onClick={() => { api.startSso(site.site); setMsg("Finish signing in in your browser. You can close that tab afterwards."); }}>Sign in with your institution</button>
        </>) : (<>
          <label>Username</label><input value={user} onChange={(e) => setUser(e.target.value)} />
          <label>Password</label><input type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
          <button className="primary" onClick={() => api.loginPassword(site.site, user, pass).then(onDone).catch((e) => setMsg(String(e)))}>Sign in</button>
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
let htmlSite = "";
DOMPurify.addHook("afterSanitizeAttributes", (el) => {
  for (const a of ["src", "poster", "background"]) {
    const v = el.getAttribute(a);
    if (v && !v.startsWith("data:") && !sameOrigin(htmlSite, v)) el.removeAttribute(a);
  }
});

// Moodle HTML (section summaries, labels): sanitised, files get the token, link clicks are routed through onLink
function Html({ html, site, token, onLink }: { html: string; site: string; token: string; onLink: (href: string) => void }) {
  const clean = useMemo(() => {
    htmlSite = site;
    const s = DOMPurify.sanitize(html, { FORBID_ATTR: ["style", "class", "id", "srcset"], FORBID_TAGS: ["style", "form", "input", "button", "image"] });
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
    onClick={(e) => { const a = (e.target as HTMLElement).closest("a"); if (!a) return; e.preventDefault(); const h = a.getAttribute("href"); if (h) onLink(h); }} />;
}

const SUBMISSION: Record<string, string> = { new: "Not submitted", draft: "Draft, not submitted yet", submitted: "Submitted", reopened: "Reopened for a new attempt" };
// Moodle sends restriction messages as HTML
const plain = (h: string) => new DOMParser().parseFromString(h, "text/html").body.textContent?.replace(/\s+/g, " ").trim() ?? "";
const when = (t: number) => new Date(t * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

const pluginOn = (a: api.Assign, what: "file" | "onlinetext") => {
  // Moodle reports submission plugins with plugin = "file" / "onlinetext" (subtype is "assignsubmission").
  // Feedback plugins reuse the type "file", so exclude them.
  const c = a.configs?.find((x) => x.subtype !== "assignfeedback" && x.plugin === what && x.name === "enabled");
  return c?.value === "1";
};

function AssignRow({ a, site, token, uid, onLink, getFile }: { a: api.Assign; site: string; token: string; uid: number; onLink: (href: string) => void; getFile: (f: api.FileItem) => void }) {
  const [expanded, setExpanded] = useState(false); const [st, setSt] = useState<api.AssignStatus | null>(null); const [err, setErr] = useState("");
  const [text, setText] = useState(""); const [loadedText, setLoadedText] = useState(""); const [picked, setPicked] = useState<string[]>([]); const [saving, setSaving] = useState(false); const [msg, setMsg] = useState(""); const [agreed, setAgreed] = useState(false);
  // Moodle returns the answer as formatted HTML; edit it as plain text and only send it back when changed,
  // so attaching a file to an existing answer never flattens it. shortcut: rich formatting is lost on edit.
  const load = () => api.assignStatus(a.id).then((s) => { setSt(s); const t = plain(s.text ?? ""); setText(t); setLoadedText(t); setErr(""); }).catch((e) => setErr(String(e)));
  const toggle = () => { setExpanded(!expanded); if (!expanded && !st) load(); };
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
      if (picked.length) { itemid = 0; for (const path of picked) itemid = await api.uploadDraftFile(path, itemid, uid); }
      // mod_assign_save_submission needs plugindata, so calling it with nothing changed is what raised [invalidparameter]
      if (dirty) await api.saveSubmission(a.id, {
        ...(pluginOn(a, "onlinetext") && text !== loadedText ? { text } : {}),
        ...(itemid !== undefined ? { fileItemId: itemid } : {}),
      });
      // without drafts, saving already submits; with drafts a separate "submit for grading" step is needed
      if (graded && !done) await api.submitForGrading(a.id);
      await load(); setPicked([]);
      setMsg(submitting ? "Submitted for grading." : "Saved.");
    } catch (e) { setMsg(String(e).replace(/^Error: /, "")); }
    setSaving(false);
  };
  return (<>
    <button className="item" onClick={toggle}>
      <span className="ico"><Icon n={locked ? "lock" : "check"} /></span>
      <span className="grow">{a.name}{locked && <small>Locked until {when(a.allowsubmissionsfromdate)}</small>}<small>{a.duedate ? (late ? "Was due " : "Due ") + when(a.duedate) : "No due date"}</small></span>
      <span className={expanded ? "chev" : "chev shut"}><Icon n="chev" /></span>
    </button>
    {expanded && <div className="summary">
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
          {pluginOn(a, "file") && <div className="joinrow">
            <button className="btn" onClick={choose}>Attach files…</button>
            {picked.map((p) => <span className="chip" key={p}>{p.split(/[\\/]/).pop()}</span>)}
          </div>}
          {picked.length > 0 && <small className="muted">The attached files replace any files already submitted. Leave this empty to keep them.</small>}
          {a.requiresubmissionstatement === 1 && <label className="agree"><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /> This assignment requires me to accept its submission statement.</label>}
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

function CourseView({ c, site, token, uid, ensureDir, notify, onLink, onHtml, onForum, dlMode, setDl }: { c: api.Course; site: string; token: string; uid: number; ensureDir: () => Promise<string | null>; notify: (m: string) => void; onLink: (href: string) => void; onHtml: (title: string, url: string) => void; onForum: (title: string, id: number) => void; dlMode: api.DlMode; setDl: React.Dispatch<React.SetStateAction<Dl | null>> }) {
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
  const [saved, setSaved] = useState<Set<string>>(new Set()); const [menu, setMenu] = useState<{ f: api.FileItem; x: number; y: number } | null>(null);
  const refreshSaved = () => api.listDownloads().then((l) => setSaved(new Set(l.map((e) => e.course + "::" + e.name)))).catch(() => {});
  useEffect(() => { refreshSaved(); }, []);
  useEffect(() => { const h = () => setMenu(null); window.addEventListener("click", h); return () => window.removeEventListener("click", h); }, []);
  const getFile = async (f: api.FileItem, force = false) => {
    setMenu(null);
    // a Moodle-hosted HTML resource is a page, not a bare file: show it in the app with its pictures and links intact
    if (isHtmlFile(f) && sameOrigin(site, f.fileurl)) { onHtml(f.filename, f.fileurl); return; }
    if (api.isOffline() && !saved.has(course + "::" + f.filename)) { notify(f.filename + " isn't downloaded yet — connect to the internet to get it."); return; }
    const dir = (await ensureDir()) ?? "";   // empty = default folder; changing it is done in Settings
    notify((force ? "Downloading " : "Opening ") + f.filename + "…");
    const id = Date.now() + "-" + Math.random().toString(36).slice(2);
    setDl({ id, name: f.filename, done: 0, total: null });
    try {
      const r = await api.download(id, f.fileurl, dir, course, f.filename, dlMode, f.timemodified, force);
      notify(r.reused ? "Opened saved copy of " + f.filename : "Downloaded " + f.filename); refreshSaved();
    } catch (e) { notify("Download failed: " + (api.isOffline() ? "you're offline." : e)); }
    finally { setTimeout(() => setDl((d) => (d?.id === id ? null : d)), 400); }
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
    if (a) return <AssignRow key={m.id} a={a} site={site} token={token} uid={uid} onLink={onLink} getFile={getFile} />;
    if (m.modname === "forum" && m.instance) return (
      <button className="item" key={m.id} onClick={() => onForum(m.name, m.instance!)}>
        <span className="ico"><Icon n="chat" /></span>
        <span className="grow">{m.name}<small>announcements and discussion · opens in the app</small></span>
        <Icon n="chev" s={16} />
      </button>);
    const files = (m.contents ?? []).filter((f) => f.type === "file");
    if (files.length) return files.map((f) => {
      const isSaved = saved.has(course + "::" + f.filename);
      return (
        <div className="item" role="button" key={m.id + f.filename} onClick={() => getFile(f)}>
          <span className="ico"><Icon n={modIcon(m.modname)} /></span>
          <span className="grow">{m.modname === "folder" ? `${m.name} / ${f.filename}` : m.name}<small>{f.filename} · {size(f.filesize)}{isSaved ? " · saved" : ""}</small></span>
          {isSaved
            ? <button className="icon" title="Options" onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setMenu({ f, x: window.innerWidth - r.right, y: r.bottom + 4 }); }}><Icon n="dots" /></button>
            : <Icon n="down" />}
        </div>);
    });
    const isUrl = m.modname === "url"; const target = isUrl ? m.contents?.[0]?.fileurl ?? m.url : m.url;
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
      <button onClick={() => getFile(menu.f, true)}><Icon n="down" s={16} />Download again</button></div>}
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
        </section>))}</div>}
  </>);
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

type Contrast = "system" | "on" | "off";
const CONTRASTS: [Contrast, string, string][] = [["system", "System", "Follow your device"], ["on", "On", "Always high contrast"], ["off", "Off", "Never"]];

function Settings({ user, site, signOut, dir, pick, reset, mode, setMode, notify, theme, setTheme, contrast, setContrast }: { user: string; site: string; signOut: () => void; dir: string | null; pick: () => Promise<string | null>; reset: () => void; mode: api.DlMode; setMode: (m: api.DlMode) => void; notify: (m: string) => void; theme: Theme; setTheme: (t: Theme) => void; contrast: Contrast; setContrast: (c: Contrast) => void }) {
  const [files, setFiles] = useState<api.DlEntry[] | null>(null); const [confirm, setConfirm] = useState<string | null>(null);
  const reload = () => api.listDownloads().then(setFiles).catch(() => setFiles([]));
  useEffect(() => { reload(); }, []);
  const [def, setDef] = useState<string | null>(null); useEffect(() => { api.defaultDownloadDir().then(setDef).catch(() => {}); }, []);
  const shownDir = dir ?? def;
  const del = async (paths?: string[]) => { const n = await api.deleteDownloads(paths); notify(`Deleted ${n} file${n === 1 ? "" : "s"}`); setConfirm(null); reload(); };
  const ask = (key: string, run: () => void) => { if (confirm === key) run(); else { setConfirm(key); setTimeout(() => setConfirm(null), 4000); } };
  const byCourse = new Map<string, api.DlEntry[]>();
  (files ?? []).forEach((f) => byCourse.set(f.course, [...(byCourse.get(f.course) ?? []), f]));
  const sum = (l: api.DlEntry[]) => l.reduce((a, f) => a + f.size, 0);
  const plural = (n: number) => `${n} file${n === 1 ? "" : "s"}`;
  return (
    <div className="stack">
      <div className="bar"><h1>Settings</h1></div>
      <section className="sec only-phone">
        <div className="sechead static">Account</div>
        <div className="setrow"><div className="grow"><b>{user}</b><small>{site}</small></div><button className="btn danger" onClick={signOut}>Sign out</button></div>
      </section>
      <section className="sec">
        <div className="sechead static">Appearance</div>
        <div className="setrow col"><b>Theme</b>
          <div className="choices">{THEMES.map(([k, t, d]) => <button key={k} aria-pressed={theme === k} className={theme === k ? "choice on" : "choice"} onClick={() => setTheme(k)}><b>{t}</b><small>{d}</small></button>)}</div></div>
        <div className="setrow col"><div><b>High contrast</b><small>Stronger text and borders, plain colours and clear focus outlines</small></div>
          <div className="choices">{CONTRASTS.map(([k, t, d]) => <button key={k} aria-pressed={contrast === k} className={contrast === k ? "choice on" : "choice"} onClick={() => setContrast(k)}><b>{t}</b><small>{d}</small></button>)}</div></div>
      </section>
      <section className="sec">
        <div className="sechead static">Downloads</div>
        <div className="setrow desk"><div className="grow"><b>Download folder</b><small>{shownDir ?? "…"}{!dir && shownDir ? " (default)" : ""}</small></div>
          <button className="btn" onClick={() => pick()}>Change…</button>
          {dir && <button className="btn" onClick={reset}>Use default</button>}
          {shownDir && <button className="btn" onClick={() => api.openLocal(shownDir).catch(() => notify("That folder doesn't exist yet"))}>Open folder</button>}</div>
        <div className="setrow col"><b>When a file is already saved</b>
          <div className="choices">{MODES.map(([k, t, d]) => <button key={k} className={mode === k ? "choice on" : "choice"} onClick={() => setMode(k)}><b>{t}</b><small>{d}</small></button>)}</div></div>
      </section>
      <section className="sec">
        <div className="sechead static"><span>Saved files</span><span className="muted">{files ? `${plural(files.length)} · ${size(sum(files))}` : ""}</span></div>
        {files && !files.length && <div className="setrow muted">Nothing downloaded yet.</div>}
        {[...byCourse].map(([course, list]) => (
          <div key={course} className="coursegroup">
            <div className="setrow"><div className="grow"><b>{course}</b><small>{plural(list.length)} · {size(sum(list))}</small></div>
              <button className="btn danger" onClick={() => ask("c:" + course, () => del(list.map((f) => f.path)))}>{confirm === "c:" + course ? "Click to confirm" : "Clear course"}</button></div>
            {list.map((f) => (
              <div className="setrow file" key={f.path}>
                <div className="grow">{f.name}<small>{size(f.size)} · {new Date(f.at * 1000).toLocaleDateString()}</small></div>
                <button className="icon" title="Open" onClick={() => api.openLocal(f.path)}><Icon n="file" /></button>
                <button className="icon" title="Delete" onClick={() => del([f.path])}><Icon n="trash" /></button>
              </div>))}
          </div>))}
        {!!files?.length && <div className="setrow"><div className="grow muted">Only files Zenith downloaded are listed or removed; anything else in your folder is never touched. Files saved by older versions aren't tracked.</div>
          <button className="btn danger" onClick={() => ask("all", () => del())}>{confirm === "all" ? "Click to confirm" : "Delete all downloads"}</button></div>}
      </section>
    </div>);
}

// first-launch setup: look + accessibility, shown once. Signing in to the university happens afterwards, on the normal login screen.
const seenSetup = () => localStorage.getItem("onboarded") === "1" || ["theme", "contrast", "dlMode", "dlDir"].some((k) => localStorage.getItem(k) !== null);

function Setup({ theme, setTheme, contrast, setContrast, onDone }: { theme: Theme; setTheme: (t: Theme) => void; contrast: Contrast; setContrast: (c: Contrast) => void; onDone: () => void }) {
  const [step, setStep] = useState(0); const last = 2;
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
        <div className="setupnav">
          {step > 0 ? <button className="btn" onClick={() => setStep(step - 1)}>Back</button> : <span style={{ width: 70 }} />}
          <div className="pager">{[0, 1, 2].map((i) => <i key={i} className={i === step ? "on" : ""} />)}</div>
          <button className="primary" style={{ padding: "12px 22px" }} onClick={() => (step < last ? setStep(step + 1) : onDone())}>{step === 0 ? "Get started" : step < last ? "Next" : "Continue to login"}</button>
        </div>
      </div>
    </div>);
}

export default function App() {
  const [session, setSession] = useState<api.Session | null | undefined>(undefined);
  const [info, setInfo] = useState<api.Info | null>(null); const [courses, setCourses] = useState<api.Course[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dlMode, setDlMode] = useState<api.DlMode>((localStorage.getItem("dlMode") as api.DlMode) || "updated");
  const changeMode = (m: api.DlMode) => { localStorage.setItem("dlMode", m); setDlMode(m); };
  const [theme, setThemeState] = useState<Theme>((localStorage.getItem("theme") as Theme) || "system");
  const [contrast, setContrastState] = useState<Contrast>(() => { const v = localStorage.getItem("contrast"); return v === "on" || v === "high" ? "on" : v === "off" ? "off" : "system"; });   // System by default
  const [osHigh, setOsHigh] = useState(() => matchMedia("(prefers-contrast: more)").matches);
  useEffect(() => { const mq = matchMedia("(prefers-contrast: more)"); const f = () => setOsHigh(mq.matches); mq.addEventListener("change", f); return () => mq.removeEventListener("change", f); }, []);
  const high = contrast === "on" || (contrast === "system" && osHigh);
  const setTheme = (t: Theme) => { localStorage.setItem("theme", t); setThemeState(t); };
  const setContrast = (c: Contrast) => { localStorage.setItem("contrast", c); setContrastState(c); };
  const [setup, setSetup] = useState(!seenSetup());
  useEffect(() => { if (session && setup) { localStorage.setItem("onboarded", "1"); setSetup(false); } }, [session]);   // existing users never see it
  const finishSetup = () => { localStorage.setItem("onboarded", "1"); setSetup(false); };
  useEffect(() => {
    const r = document.documentElement;
    if (theme === "system") delete r.dataset.theme; else r.dataset.theme = theme;
    if (high) r.dataset.contrast = "high"; else delete r.dataset.contrast;
  }, [theme, high]);
  const [explore, setExplore] = useState(false); const [enrolledIds, setEnrolledIds] = useState<Set<number>>(new Set());
  const [stack, setStack, back, clear] = useCourseStack<api.Course>(); const [q, setQ] = useState("");
  const open_ = stack[stack.length - 1] ?? null;
  const [dir, setDir] = useState(localStorage.getItem("dlDir")); const [toast, setToast] = useState("");
  const [offline, setOffline] = useState(api.isOffline());
  const [dl, setDl] = useState<Dl | null>(null);
  const [overlay, setOverlay] = useState<{ kind: "html" | "forum"; title: string; url?: string; id?: number } | null>(null);
  const notify = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(""), 3500); }, []);
  useEffect(() => {
    // the WebView's own online flag can stay stale on Android, so poll the site as well (and on focus / network events)
    let live = true;
    const check = () => api.reachable().then((ok) => live && setOffline(!ok)).catch(() => {});
    const off = () => setOffline(true);
    api.setNetHandler(() => setOffline(true));
    check(); const t = setInterval(check, 10000);
    window.addEventListener("online", check); window.addEventListener("offline", off); window.addEventListener("focus", check);
    return () => { live = false; clearInterval(t); window.removeEventListener("online", check); window.removeEventListener("offline", off); window.removeEventListener("focus", check); };
  }, []);
  useEffect(() => { const un = listen<{ id: string; done: number; total: number | null }>("download-progress", (e) => setDl((cur) => (cur && cur.id === e.payload.id ? { ...cur, done: e.payload.done, total: e.payload.total } : cur))); return () => { un.then((f) => f()); }; }, []);
  const refresh = () => api.getSession().then(setSession);
  useEffect(() => { refresh(); }, []);
  useEffect(() => { api.setNoteHandler(notify); }, [notify]);
  useEffect(() => { if (session && explore && info) api.enrolledCourses(info.userid).then((l) => setEnrolledIds(new Set(l.map((c) => c.id)))).catch(() => {}); }, [session, explore, info]);
  const [update, setUpdate] = useState<api.UpdateInfo | null>(null);
  useEffect(() => {
    const run = () => api.checkUpdate().then((u) => { if (u && localStorage.getItem("skipVersion") !== u.version) setUpdate(u); }).catch(() => {});
    run(); const t = setInterval(run, 6 * 3600 * 1000); return () => clearInterval(t);
  }, []);
  const [filter, setFilter] = useState<api.Filter>("all"); const [menu, setMenu] = useState<number | null>(null); const [loading, setLoading] = useState(false);
  const load = useCallback((f: api.Filter) => {
    setLoading(true);
    const cached = cacheGet<api.Course[]>("courses:" + f);
    if (api.isOffline() && cached) { setCourses(cached); setLoading(false); return Promise.resolve(); }
    return api.listCourses(f)
      .then((cs) => { setCourses(cs); cacheSet("courses:" + f, cs); setOffline(false); })
      .catch((e) => {
        if (authError(e)) { api.logout(); setSession(null); cacheClear(); setCourses([]); }
        else if (cached) { setCourses(cached); setOffline(true); }
        else notify("Couldn't load courses: " + e);
      })
      .finally(() => setLoading(false));
  }, [notify]);
  useEffect(() => { if (session) load(filter); }, [session, filter]);
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
  // same-site course links open in the app; everything else in the system browser
  const handleLink = (href: string) => {
    if (!session) return;
    let u: URL; try { u = new URL(href, session.site + "/"); } catch { return; }
    if (!/^https?:$/.test(u.protocol)) return;
    const id = u.origin === new URL(session.site).origin && u.pathname.endsWith("/course/view.php") ? Number(u.searchParams.get("id")) : 0;
    if (id) { setOverlay(null); openCourseById(id); } else api.openWeb(u.toString());
  };
  const pick = async () => { const p = await open({ directory: true, title: "Choose download folder" }); if (typeof p === "string") { localStorage.setItem("dlDir", p); setDir(p); return p; } return null; };
  const ensureDir = async () => dir ?? "";   // no prompt here: choose the folder in Settings (default: Downloads/Zenith)
  const resetDir = () => { localStorage.removeItem("dlDir"); setDir(null); };

  const signOut = () => api.logout().then(() => { clear(); cacheClear(); setOverlay(null); setInfo(null); setCourses([]); refresh(); });
  if (session === undefined) return null;
  if (!session) return setup
    ? <Setup theme={theme} setTheme={setTheme} contrast={contrast} setContrast={setContrast} onDone={finishSetup} />
    : <Login onDone={refresh} />;
  const shown = courses.filter((c) => c.fullname.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="app">
      <aside>
        <div className="brand">Zenith</div>
        <nav>
          <button className={!explore && !settingsOpen ? "on" : ""} onClick={() => { setExplore(false); setSettingsOpen(false); setOverlay(null); clear(); }}><Icon n="book" />My courses</button>
          <button className={explore ? "on" : ""} onClick={() => { setExplore(true); setSettingsOpen(false); setOverlay(null); clear(); }}><Icon n="search" />Explore</button>
          <button className={settingsOpen ? "on" : ""} onClick={() => { setSettingsOpen(true); setExplore(false); setOverlay(null); clear(); }}><Icon n="sliders" />Settings</button>
        </nav>
        <div className="grow" />
        <div className="user"><div className="avatar">{initials(info?.fullname ?? "?")}</div><span className="grow">{info?.fullname}</span>
          <button className="icon" title="Sign out" onClick={signOut}><Icon n="out" /></button></div>
      </aside>
      <main>
        {offline && <div className="offline" role="status"><Icon n="wifi" s={16} /><span>You're offline. Showing courses and files already saved on this device.</span></div>}
        {overlay ? (
          overlay.kind === "forum"
            ? <ForumPage title={overlay.title} id={overlay.id!} site={session.site} token={session.token} onLink={handleLink} onClose={() => setOverlay(null)} />
            : <HtmlPage title={overlay.title} url={overlay.url!} site={session.site} token={session.token} onLink={handleLink} onClose={() => setOverlay(null)} />
        ) : open_ ? (<>
          <div className="bar"><button className="icon" onClick={back}><Icon n="back" /></button><h1>{open_.fullname}</h1></div>
          <div className="banner" style={{ background: tone(open_.id) }}>{open_.shortname}</div>
          <CourseView key={open_.id} dlMode={dlMode} c={open_} site={session.site} token={session.token} uid={info?.userid ?? 0} ensureDir={ensureDir} notify={notify} onLink={handleLink}
            onHtml={(title, url) => setOverlay({ kind: "html", title, url })} onForum={(title, id) => setOverlay({ kind: "forum", title, id })} setDl={setDl} />
        </>) : explore ? (
          <Explore site={session.site} token={session.token} enrolled={enrolledIds} notify={notify} onLink={handleLink}
            onJoined={(c) => { setExplore(false); setStack([c]); load(filter); }} />
        ) : settingsOpen ? (
          <Settings user={info?.fullname ?? ""} site={info?.sitename ?? ""} signOut={signOut} dir={dir} pick={pick} reset={resetDir} mode={dlMode} setMode={changeMode} notify={notify} theme={theme} setTheme={setTheme} contrast={contrast} setContrast={setContrast} />
        ) : (<>
          <div className="bar"><h1>My courses</h1><input className="search" placeholder="Search courses…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
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
      {update && (
        <div className="update">
          <div className="grow"><b>Zenith {update.version} is available</b><small>A newer version has been released.</small></div>
          <button className="primary sm" onClick={() => api.openExternal(update.url)}>Download</button>
          <button className="icon" title="Skip this version" onClick={() => { localStorage.setItem("skipVersion", update.version); setUpdate(null); }}><Icon n="x" /></button>
        </div>)}
      {(toast || dl) && <div className="toast">{toast || dl?.name}
        {dl && <div className={dl.total ? "dlbar" : "dlbar indet"}>{dl.total ? <i style={{ width: `${Math.min(100, Math.round((dl.done / dl.total) * 100))}%` }} /> : <i />}</div>}
        {dl && <span className="dltext">{size(dl.done)}{dl.total ? ` of ${size(dl.total)}` : ""}</span>}
      </div>}
    </div>
  );
}
