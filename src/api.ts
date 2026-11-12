import { invoke as real } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { fake } from "./demo";

// `zenith --screenshot`: every call is answered with invented data (see demo.ts)
let demo = false;
let mobile = false;
export const isMobile = () => mobile;
export const naturalScroll = () => invoke<boolean>("natural_scroll");
export const init = () => Promise.all([real<boolean>("screenshot_mode"), real<boolean>("is_mobile")])
  .then(([d, m]) => { demo = d; mobile = m; if (m) document.documentElement.dataset.mobile = ""; }).catch(() => {});
// The Android WebView keeps navigator.onLine true with no internet, so also remember when a call fails like a dead network.
export const net = { down: false };
export const isOffline = () => net.down || !navigator.onLine;
let onNet: () => void = () => {};
export const setNetHandler = (f: () => void) => { onNet = f; };
const NETERR = /error sending request|timed out|dns error|connection (refused|reset|closed)|network is unreachable/i;
const invoke = <T,>(cmd: string, args?: Record<string, unknown>): Promise<T> =>
  (demo ? (fake(cmd, args) as Promise<T>) : real<T>(cmd, args)).catch((e) => { if (NETERR.test(String(e))) { net.down = true; onNet(); } throw e; });

export type Session = { site: string; token: string };
export type Info = { userid: number; fullname: string; sitename: string };
export type Filter = "all" | "inprogress" | "future" | "past" | "favourites" | "hidden";
export type Course = { id: number; fullname: string; shortname: string; progress?: number | null; courseimage?: string; isfavourite?: boolean; hidden?: boolean };
export type FileItem = { type: string; filename: string; filepath?: string; fileurl: string; filesize: number; timemodified?: number; mimetype?: string };
export type Module = { id: number; name: string; modname: string; instance?: number; uservisible?: boolean; availabilityinfo?: string; url?: string; description?: string; contents?: FileItem[] };
// component/itemid are set on sections that belong to a subsection activity (Moodle 4.5+)
export type Section = { id: number; name: string; summary?: string; component?: string | null; itemid?: number | null; modules: Module[] };

export const resolveSite = (input: string) => invoke<{ site: string; config: any }>("resolve_site", { input });
export const startSso = (site: string, wwwroot?: string) => invoke<void>("start_sso", { site, wwwroot: wwwroot ?? null });
export const loginPassword = (site: string, username: string, password: string) =>
  invoke<void>("login_password", { site, username, password });
export const getSession = () => invoke<Session | null>("get_session");
export const takeSsoError = () => invoke<string | null>("take_sso_error");
export const logout = () => invoke<void>("logout");

const ws = <T,>(fn: string, params: Record<string, string> = {}) => invoke<T>("ws_call", { function: fn, params });
// demo mode answers null, which must not read as "offline"
export const reachable = () => invoke<boolean | null>("reachable").then((v) => { net.down = v === false; return v !== false; });
export const siteInfo = () => ws<Info>("core_webservice_get_site_info");
export const listCourses = async (classification: Filter) =>
  (await ws<{ courses: Course[] }>("core_course_get_enrolled_courses_by_timeline_classification",
    { classification, limit: "0", offset: "0", sort: "fullname" })).courses;
export const setFavourite = (id: number, fav: boolean) =>
  ws("core_course_set_favourite_courses", { "courses[0][id]": String(id), "courses[0][favourite]": fav ? "1" : "0" });
// Moodle treats a course as hidden when block_myoverview_hidden_course_<id> EXISTS (any value),
// so un-hiding must delete the preference. update_user_preferences deletes it when "value" is omitted.
export const setHidden = (uid: number, id: number, hide: boolean) => {
  const name = `block_myoverview_hidden_course_${id}`;
  return hide
    ? ws("core_user_set_user_preferences", { "preferences[0][name]": name, "preferences[0][value]": "1", "preferences[0][userid]": String(uid) })
    : ws("core_user_update_user_preferences", { userid: String(uid), "preferences[0][type]": name });
};
export const courseContents = (id: number) => ws<Section[]>("core_course_get_contents", { courseid: String(id) });
export type CourseModule = { id: number; course: number; name: string; modname: string; instance: number };
export const courseModule = async (cmid: number) =>
  (await ws<{ cm: CourseModule }>("core_course_get_course_module", { cmid: String(cmid) })).cm;
export type DlMode = "updated" | "reuse" | "always";
export type DlEntry = { path: string; course: string; name: string; size: number; at: number };
export const download = (id: string, url: string, dir: string, subdir: string, filename: string, mode: DlMode, modified?: number, force = false, open = true) =>
  invoke<{ path: string; reused: boolean }>("download_file", { id, url, dir, subdir, filename, mode, modified: modified ?? null, force, open });
export const defaultDownloadDir = () => invoke<string>("default_download_dir");
export const listDownloads = () => invoke<DlEntry[]>("list_downloads");
export const deleteDownloads = (paths?: string[]) => invoke<number>("delete_downloads", { paths: paths ?? null });
export const openLocal = (path: string) => invoke<void>("open_local", { path });
export const openPicked = (path: string) => invoke<void>("open_picked", { path });
export const revealFile = (path: string) => invoke<void>("reveal_file", { path });
export const courseById = async (id: number) =>
  (await ws<{ courses: Course[] }>("core_course_get_courses_by_field", { field: "id", value: String(id) })).courses[0];
let onNote: (m: string) => void = () => {};
export const setNoteHandler = (f: (m: string) => void) => { onNote = f; };
// opens in the system browser (auto-logged-in when possible); reports why auto-login was skipped
export const openWeb = (url: string) => invoke<string | null>("open_authed", { url }).then((m) => onNote(m ?? ""));
export type UpdateMode = "auto" | "ask" | "manual";
export type UpdateInfo = { version: string; url: string; notes: string; apkUrl?: string };
export type UpdateProgress = { done: number; total: number | null };
let pendingUpdate: Update | null = null;
let pendingApk: string | null = null;
export const canSelfUpdate = async () => (demo ? true : invoke<boolean>("can_self_update"));
export const checkUpdate = async (): Promise<UpdateInfo | null> => {
  if (demo) return null;
  if (mobile) {
    // real(), not invoke(): GitHub being unreachable must not mark Moodle as offline
    const u = await real<UpdateInfo | null>("check_update");
    pendingApk = u?.apkUrl ?? null;
    return u;
  }
  const u = await check();
  pendingUpdate = u;
  return u ? {
    version: u.version,
    url: `https://github.com/zac06/zenith/releases/tag/v${u.version}`,
    notes: u.body ?? "",
  } : null;
};
export const downloadUpdate = async (onProgress: (p: UpdateProgress) => void): Promise<string | null> => {
  if (demo) return null;
  if (mobile) {
    if (!pendingApk) throw new Error("No APK in the latest release");
    const off = await listen<UpdateProgress>("update-progress", (e) => onProgress(e.payload));
    try { return await invoke<string>("download_update", { url: pendingApk }); }
    finally { off(); }
  }
  if (!pendingUpdate) throw new Error("Check for updates first");
  let done = 0, total: number | null = null;
  await pendingUpdate.download((e) => {
    if (e.event === "Started") { done = 0; total = e.data.contentLength ?? null; }
    else if (e.event === "Progress") done += e.data.chunkLength;
    onProgress({ done, total });
  });
  onProgress({ done, total });
  return null;
};
export const installUpdate = async (path: string | null): Promise<void> => {
  if (demo) return;
  if (mobile) {
    await invoke<void>("install_update", { path: path ?? "" });
    return;
  }
  if (!pendingUpdate) throw new Error("No update is ready");
  await pendingUpdate.install();
  await relaunch();
};

export type SearchCourse = { id: number; fullname: string; shortname: string; categoryid?: number; categoryname?: string; summary?: string; overviewfiles?: { fileurl: string }[]; contacts?: { id: number; fullname: string }[]; enrollmentmethods?: string[] };
export type Category = { id: number; name: string; parent: number; path?: string; coursecount?: number };
export const categories = () => ws<Category[]>("core_course_get_categories");
export type EnrolMethod = { id: number; type: string; name?: string; status: string | boolean; wsfunction?: string };
export const searchCourses = async (q: string) => {
  const out: SearchCourse[] = [];
  for (let page = 0; page < 4; page++) {   // up to 200 results
    const r = await ws<{ total: number; courses: SearchCourse[] }>("core_course_search_courses", { criterianame: "search", criteriavalue: q, page: String(page), perpage: "50" });
    out.push(...r.courses);
    if (out.length >= r.total || !r.courses.length) break;
  }
  return out;
};
export const coursesByCategory = async (id: number) =>
  (await ws<{ courses: SearchCourse[] }>("core_course_get_courses_by_field", { field: "category", value: String(id) })).courses;
export const enrolMethods = (id: number) => ws<EnrolMethod[]>("core_enrol_get_course_enrolment_methods", { courseid: String(id) });
export const selfEnrol = (courseid: number, instanceid: number, password: string) =>
  ws<{ status: boolean; warnings?: { message: string; warningcode?: string }[] }>("enrol_self_enrol_user",
    { courseid: String(courseid), instanceid: String(instanceid), ...(password ? { password } : {}) });
// every course the user is enrolled in, including hidden ones (the timeline "all" view omits them)
export const enrolledCourses = (uid: number) => ws<{ id: number }[]>("core_enrol_get_users_courses", { userid: String(uid) });
// opens a web link in the system browser (Rust side; also works from inside an AppImage)
export const openExternal = (url: string) => invoke<void>("open_external", { url });

// assignments: the site may not expose these functions, so callers treat failure as "no assignment info".
export type Assign = { id: number; cmid: number; name: string; duedate: number; allowsubmissionsfromdate: number; cutoffdate?: number; intro?: string; introattachments?: FileItem[]; nosubmissions?: number; submissiondrafts?: number; requiresubmissionstatement?: number; configs?: { plugin?: string; subtype?: string; name: string; value: string }[] };
export const courseAssignments = async (courseid: number) =>
  (await ws<{ courses: { assignments: Assign[] }[] }>("mod_assign_get_assignments", { "courseids[0]": String(courseid) })).courses[0]?.assignments ?? [];
export type UpcomingAssign = Assign & { courseId: number; courseName: string; courseShort: string };
export const assignmentsForCourses = async (ids: number[]): Promise<UpcomingAssign[]> => {
  if (!ids.length) return [];
  const params: Record<string, string> = {};
  ids.forEach((id, i) => { params[`courseids[${i}]`] = String(id); });
  const r = await ws<{ courses: { id: number; fullname: string; shortname: string; assignments: Assign[] }[] }>("mod_assign_get_assignments", params);
  return r.courses.flatMap((c) => c.assignments.map((a) => ({ ...a, courseId: c.id, courseName: c.fullname, courseShort: c.shortname })));
};
export type AssignStatus = { submission: string; grade?: string; text?: string; files?: FileItem[]; canEdit?: boolean };
export const assignStatus = async (assignid: number): Promise<AssignStatus> => {
  const r = await ws<any>("mod_assign_get_submission_status", { assignid: String(assignid) });
  const sub = r.lastattempt?.submission;
  const plugins: any[] = sub?.plugins ?? [];
  return {
    submission: sub?.status ?? "new",
    grade: r.feedback?.gradefordisplay?.replace(/<[^>]*>/g, "").trim() || undefined,
    text: plugins.find((p) => p.type === "onlinetext")?.editorfields?.[0]?.text ?? "",
    files: plugins.find((p) => p.type === "file")?.fileareas?.[0]?.files ?? [],
    canEdit: r.lastattempt?.canedit === true && r.lastattempt?.locked !== true,
  };
};
// The answer is typed as plain text but Moodle stores it as HTML: escape it, or "a<b" is lost and the line breaks collapse.
const asHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
// Saves a draft. Plug-ins left out keep what is already saved, so editing the text never drops the attachments.
if (import.meta.env.DEV) console.assert(asHtml("a<b\nc&d") === "a&lt;b<br>c&amp;d");
export const saveSubmission = async (assignmentid: number, p: { text?: string; fileItemId?: number }) => {
  const params: Record<string, string> = { assignmentid: String(assignmentid) };
  if (p.text !== undefined) {
    params["plugindata[onlinetext_editor][text]"] = asHtml(p.text);
    params["plugindata[onlinetext_editor][format]"] = "1";
    params["plugindata[onlinetext_editor][itemid]"] = "0";
  }
  if (p.fileItemId !== undefined) params["plugindata[files_filemanager]"] = String(p.fileItemId);
  const r = await ws<any>("mod_assign_save_submission", params);
  if (Array.isArray(r) && r.length) throw new Error(r[0]?.message ?? "Moodle refused the submission");
};
export const submitForGrading = async (assignmentid: number, accepted: boolean) => {
  const r = await ws<any>("mod_assign_submit_for_grading", { assignmentid: String(assignmentid), acceptsubmissionstatement: accepted ? "1" : "0" });
  if (Array.isArray(r) && r.length) throw new Error(r[0]?.message ?? "Moodle refused the submission");
};
export const uploadDraftFile = (path: string, itemid: number) =>
  invoke<number>("upload_draft_file", { path, itemid });

// A saved HTML resource, fetched with the token so it can be shown inside the app (not stripped of its pictures).
export const fetchContent = (url: string) => invoke<string>("fetch_content", { url });

// Announcements and every other forum: read the discussions without opening a browser.
export type Discussion = { id: number; subject: string; message?: string; author?: string; created?: number; replies?: number };
export const forumDiscussions = async (forumid: number) => {
  const r = await ws<{ discussions?: any[] }>("mod_forum_get_forum_discussions", { forumid: String(forumid), perpage: "20" });
  return (r.discussions ?? []).map((d): Discussion => ({
    id: d.discussion ?? d.id,
    subject: d.subject || d.name || "(no subject)",
    message: d.message,
    author: d.userfullname,
    created: d.created ?? d.timemodified,
    replies: d.numreplies,
  }));
};
