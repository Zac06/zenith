// Screenshot mode (`zenith --screenshot`): invented data instead of the real Moodle site, so screenshots show nobody's real
// name or courses. Nothing is sent over the network and the saved login is never read or changed.
import type { Course, Section, Assign, SearchCourse } from "./api";

const SITE = "https://moodle.example.edu";
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const shuffle = <T,>(a: T[]) => a.map((x) => [Math.random(), x] as const).sort((p, q) => p[0] - q[0]).map((p) => p[1]);
const now = Math.floor(Date.now() / 1000), DAY = 86400;
const date = (t: number) => new Date(t * 1000).toLocaleString(undefined, { dateStyle: "long", timeStyle: "short" });

const CATS = [{ id: 1, name: "Sciences", parent: 0 }, { id: 2, name: "Humanities", parent: 0 }, { id: 3, name: "Engineering", parent: 0 }];
const POOL: [string, string, number][] = [
  ["Linear Algebra", "MATH201", 1], ["Organic Chemistry II", "CHEM240", 1], ["Statistics for the Life Sciences", "STAT110", 1], ["Classical Mechanics", "PHYS150", 1],
  ["Renaissance Art History", "ARTH220", 2], ["Academic Writing", "ENGL101", 2], ["Introduction to Philosophy", "PHIL100", 2], ["Medieval European History", "HIST210", 2],
  ["Introduction to Algorithms", "CS230", 3], ["Operating Systems", "CS340", 3], ["Digital Signal Processing", "EE320", 3], ["Fluid Dynamics", "ME310", 3],
];
const FIRST = ["Alex", "Sam", "Jordan", "Riley", "Casey", "Taylor", "Morgan", "Jamie", "Robin", "Quinn", "Avery", "Noor"];
const LAST = ["Bennett", "Okafor", "Lindqvist", "Marlowe", "Castellan", "Hayashi", "Delacroix", "Whitfield", "Novak", "Ibarra"];
const name = () => `${pick(FIRST)} ${pick(LAST)}`;

type Fake = Course & { kind: "inprogress" | "future" | "past"; cat: number; teacher: string };
let courses: Fake[] | null = null;
const data = () => courses ??= shuffle(POOL).slice(0, 9).map(([fullname, shortname, cat], i): Fake => ({
  id: 101 + i, fullname, shortname, cat, teacher: name(), isfavourite: i < 2, hidden: i === 8,
  kind: i === 6 ? "past" : i === 7 ? "future" : "inprogress",
  progress: i === 6 ? 100 : i === 7 ? 0 : 5 + Math.floor(Math.random() * 90),
}));
const asSearch = (c: Fake): SearchCourse => ({ id: c.id, fullname: c.fullname, shortname: c.shortname, categoryid: c.cat, categoryname: CATS[c.cat - 1].name,
  summary: `<p>${c.fullname} with ${c.teacher}.</p>`, contacts: [{ id: c.id, fullname: c.teacher }], enrollmentmethods: ["self"] });
const FILTER: Record<string, (c: Fake) => boolean> = {
  all: (c) => !c.hidden, inprogress: (c) => !c.hidden && c.kind === "inprogress", future: (c) => !c.hidden && c.kind === "future",
  past: (c) => !c.hidden && c.kind === "past", favourites: (c) => !c.hidden && !!c.isfavourite, hidden: (c) => !!c.hidden,
};

// module ids end in 1..7; the assignment instance id is cmid + 50000
const file = (cid: number, filename: string, filesize: number) => ({ type: "file", filename, fileurl: `${SITE}/pluginfile.php/${cid}/${filename}`, filesize, timemodified: now - 9 * DAY });
const contents = (cid: number): Section[] => {
  const b = cid * 100;
  return [
    { id: cid * 10 + 1, name: "General", summary: "", modules: [
      { id: b + 1, name: "Course syllabus", modname: "resource", contents: [file(cid, "syllabus.pdf", 184000)] },
      { id: b + 2, name: "Announcements", modname: "forum", url: `${SITE}/mod/forum/view.php?id=${b + 2}` }] },
    { id: cid * 10 + 2, name: "Week 1", summary: "", modules: [
      { id: b + 3, name: "Lecture slides", modname: "resource", contents: [file(cid, "week1-slides.pdf", 2400000)] },
      { id: b + 4, name: "Problem set 1", modname: "assign" },
      { id: b + 5, name: "Reading response", modname: "assign" }] },
    { id: cid * 10 + 3, name: "Week 2", summary: "", modules: [
      { id: b + 6, name: "Lab report", modname: "assign" },
      { id: b + 7, name: "Midterm quiz", modname: "quiz", uservisible: false, availabilityinfo: `<div>Not available unless: It is after ${date(now + 14 * DAY)}</div>` }] },
  ];
};
const assigns = (cid: number): Assign[] => [
  { id: cid * 100 + 50004, cmid: cid * 100 + 4, name: "Problem set 1", duedate: now + 3 * DAY, allowsubmissionsfromdate: 0, submissiondrafts: 0, configs: [{ plugin: "file", subtype: "assignsubmission", name: "enabled", value: "1" }, { plugin: "onlinetext", subtype: "assignsubmission", name: "enabled", value: "1" }], intro: "<p>Solve the exercises in the attached sheet and upload your answers as a single PDF.</p>", introattachments: [file(cid, "problem-set-1.pdf", 90000)] },
  { id: cid * 100 + 50005, cmid: cid * 100 + 5, name: "Reading response", duedate: now - 5 * DAY, allowsubmissionsfromdate: 0, configs: [{ plugin: "onlinetext", subtype: "assignsubmission", name: "enabled", value: "1" }], intro: "<p>One page on this week's reading.</p>" },
  { id: cid * 100 + 50006, cmid: cid * 100 + 6, name: "Lab report", duedate: now + 20 * DAY, allowsubmissionsfromdate: now + 7 * DAY, intro: "<p>Write up your results from the lab session.</p>" },
];

const ws = (fn: string, p: Record<string, string>): unknown => {
  const cid = Number(p.courseid), c = data();
  switch (fn) {
    case "core_webservice_get_site_info": return { userid: 1, fullname: (user ??= name()), sitename: "Example University" };
    case "core_course_get_enrolled_courses_by_timeline_classification": return { courses: c.filter(FILTER[p.classification] ?? FILTER.all) };
    case "core_course_set_favourite_courses": { const x = c.find((x) => x.id === Number(p["courses[0][id]"])); if (x) x.isfavourite = p["courses[0][favourite]"] === "1"; return {}; }
    case "core_user_set_user_preferences": case "core_user_update_user_preferences": {
      const key = p["preferences[0][name]"] ?? p["preferences[0][type]"], x = c.find((x) => key.endsWith("_" + x.id)); if (x) x.hidden = fn === "core_user_set_user_preferences"; return {}; }
    case "core_course_get_contents": return contents(cid);
    case "core_course_get_courses_by_field": return { courses: c.filter((x) => (p.field === "id" ? x.id === Number(p.value) : x.cat === Number(p.value))).map(asSearch) };
    case "core_course_search_courses": { const q = (p.criteriavalue ?? "").toLowerCase(); const r = c.filter((x) => x.fullname.toLowerCase().includes(q)).map(asSearch); return { total: r.length, courses: r }; }
    case "core_course_get_categories": return CATS;
    case "core_enrol_get_users_courses": return c.map((x) => ({ id: x.id }));
    case "core_enrol_get_course_enrolment_methods": return [];
    case "mod_assign_get_assignments": return { courses: [{ assignments: assigns(Number(p["courseids[0]"])) }] };
    case "mod_assign_get_submission_status": {
      const done = Number(p.assignid) % 100 === 5;
      return { lastattempt: { canedit: true, submission: { status: done ? "submitted" : "new", plugins: [] } }, feedback: done ? { gradefordisplay: "92.00 / 100.00" } : {} };
    }
    case "mod_assign_save_submission": case "mod_assign_submit_for_grading": return [];
    case "mod_forum_get_forum_discussions": return { discussions: [{ discussion: 1, subject: "Welcome to the course", message: "<p>Lectures start on Monday. Bring the textbook.</p>", userfullname: "Course team", created: now - 2 * DAY, numreplies: 0 }] };
  }
  throw "Not available in screenshot mode.";
};
let user: string | undefined;

export const fake = async (cmd: string, args: any): Promise<unknown> => {
  switch (cmd) {
    case "get_session": return { site: SITE, token: "screenshot-mode" };
    case "ws_call": return ws(args.function, args.params);
    case "download_file": return { path: "", reused: false };
    case "upload_draft_file": return 0;
    case "fetch_content": return "<h1>Sample page</h1><p>An HTML resource shown inside the app.</p>";
    case "list_downloads": return [];
    case "default_download_dir": return "";
    case "delete_downloads": return 0;
    default: return null;   // logout, open_*, check_update, login: do nothing
  }
};
