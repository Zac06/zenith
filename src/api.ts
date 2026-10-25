import { invoke as real } from "@tauri-apps/api/core";
import { fake } from "./demo";

// `zenith --screenshot`: every call is answered with invented data (see demo.ts)
let demo = false;
export const init = () => Promise.all([real<boolean>("screenshot_mode"), real<boolean>("is_mobile")])
  .then(([d, m]) => { demo = d; if (m) document.documentElement.dataset.mobile = ""; }).catch(() => {});
const invoke = <T,>(cmd: string, args?: Record<string, unknown>): Promise<T> => (demo ? (fake(cmd, args) as Promise<T>) : real<T>(cmd, args));

export type Session = { site: string; token: string };
export type Info = { userid: number; fullname: string; sitename: string };
export type Filter = "all" | "inprogress" | "future" | "past" | "favourites" | "hidden";
export type Course = { id: number; fullname: string; shortname: string; progress?: number | null; courseimage?: string; isfavourite?: boolean; hidden?: boolean };
export type FileItem = { type: string; filename: string; fileurl: string; filesize: number; timemodified?: number; mimetype?: string };
export type Module = { id: number; name: string; modname: string; instance?: number; uservisible?: boolean; availabilityinfo?: string; url?: string; description?: string; contents?: FileItem[] };
// component/itemid are set on sections that belong to a subsection activity (Moodle 4.5+)
export type Section = { id: number; name: string; summary?: string; component?: string | null; itemid?: number | null; modules: Module[] };

export const resolveSite = (input: string) => invoke<{ site: string; config: any }>("resolve_site", { input });
export const startSso = (site: string) => invoke<void>("start_sso", { site });
export const loginPassword = (site: string, username: string, password: string) =>
  invoke<void>("login_password", { site, username, password });
export const getSession = () => invoke<Session | null>("get_session");
export const logout = () => invoke<void>("logout");

const ws = <T,>(fn: string, params: Record<string, string> = {}) => invoke<T>("ws_call", { function: fn, params });
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
export type DlMode = "updated" | "reuse" | "always";
export type DlEntry = { path: string; course: string; name: string; size: number; at: number };
export const download = (id: string, url: string, dir: string, subdir: string, filename: string, mode: DlMode, modified?: number, force = false) =>
  invoke<{ path: string; reused: boolean }>("download_file", { id, url, dir, subdir, filename, mode, modified: modified ?? null, force });
export const defaultDownloadDir = () => invoke<string>("default_download_dir");
export const listDownloads = () => invoke<DlEntry[]>("list_downloads");
export const deleteDownloads = (paths?: string[]) => invoke<number>("delete_downloads", { paths: paths ?? null });
export const openLocal = (path: string) => invoke<void>("open_local", { path });
export const courseById = async (id: number) =>
  (await ws<{ courses: Course[] }>("core_course_get_courses_by_field", { field: "id", value: String(id) })).courses[0];
let onNote: (m: string) => void = () => {};
export const setNoteHandler = (f: (m: string) => void) => { onNote = f; };
// opens in the system browser (auto-logged-in when possible); reports why auto-login was skipped
export const openWeb = (url: string) => invoke<string | null>("open_authed", { url }).then((m) => { if (m) onNote(m); });
export type UpdateInfo = { version: string; url: string; notes: string };
export const checkUpdate = () => invoke<UpdateInfo | null>("check_update");

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
    canEdit: r.lastattempt?.canedit !== false && r.lastattempt?.locked !== true,
  };
};
// Saves a draft. Plug-ins left out keep what is already saved, so editing the text never drops the attachments.
export const saveSubmission = async (assignmentid: number, p: { text?: string; fileItemId?: number }) => {
  const params: Record<string, string> = { assignmentid: String(assignmentid) };
  if (p.text !== undefined) {
    params["plugindata[onlinetext_editor][text]"] = p.text;
    params["plugindata[onlinetext_editor][format]"] = "1";
    params["plugindata[onlinetext_editor][itemid]"] = "0";
  }
  if (p.fileItemId !== undefined) params["plugindata[files_filemanager]"] = String(p.fileItemId);
  const r = await ws<any>("mod_assign_save_submission", params);
  if (Array.isArray(r) && r.length) throw new Error(r[0]?.message ?? "Moodle refused the submission");
};
export const submitForGrading = async (assignmentid: number) => {
  const r = await ws<any>("mod_assign_submit_for_grading", { assignmentid: String(assignmentid), acceptsubmissionstatement: "1" });
  if (Array.isArray(r) && r.length) throw new Error(r[0]?.message ?? "Moodle refused the submission");
};
export const uploadDraftFile = (path: string, itemid: number, userid: number) =>
  invoke<number>("upload_draft_file", { path, itemid, userid });

// A saved HTML resource, fetched with the token so it can be shown inside the app (not stripped of its pictures).
export const fetchContent = (url: string) => invoke<string>("fetch_content", { url });

// Announcements and every other forum: read the discussions without opening a browser.
export type Discussion = { id: number; subject: string; message?: string; author?: string; created?: number; replies?: number };
export const forumDiscussions = async (forumid: number) => {
  const r = await ws<{ discussions?: any[] }>("mod_forum_get_forum_discussions", { forumid: String(forumid) });
  return (r.discussions ?? []).map((d): Discussion => ({
    id: d.discussion ?? d.id,
    subject: d.subject || d.name || "(no subject)",
    message: d.message,
    author: d.userfullname,
    created: d.created ?? d.timemodified,
    replies: d.numreplies,
  }));
};
