# Falcon HR — Project Summary

Complete record of the work done for **Falcon Resource Management** (Frappe Cloud site `falcons.k.frappe.cloud`) on 31 Oct – 1 Nov 2026: what was built, why, how it was tested, and how to deploy it.

| | |
|---|---|
| App | `falcon_hr` v1.1.0 — private repo [`Omarhabeeb27/falcon_hr`](https://github.com/Omarhabeeb27/falcon_hr), branch `main` |
| Platform | Frappe 16.54.0 · ERPNext 16.53.0 · Frappe HR (HRMS) 16.53.0 · Payments (version-16) |
| Other site apps | Lang Toggle, Prism |
| Languages | English and Arabic (right-to-left) |
| User guide | [`docs/guide/Falcon-HR-User-Guide.pdf`](guide/Falcon-HR-User-Guide.pdf) · [`docs/guide/index.html`](guide/index.html) (masked screenshots) |

---

## Contents

1. [Starting point](#1-starting-point)
2. [Principles we followed](#2-principles-we-followed)
3. [Everything that was built](#3-everything-that-was-built)
4. [Reports](#4-reports)
5. [Notifications and alerts](#5-notifications-and-alerts)
6. [Fixes to existing behaviour](#6-fixes-to-existing-behaviour)
7. [Upgrade to Frappe 16.54 / HRMS 16.53](#7-upgrade-to-frappe-1654--hrms-1653)
8. [Arabic translation](#8-arabic-translation)
9. [Security review fixes](#9-security-review-fixes)
10. [Testing performed](#10-testing-performed)
11. [Install / update on Frappe Cloud](#11-install--update-on-frappe-cloud)
12. [One-time setup after installing](#12-one-time-setup-after-installing)
13. [Data notes and known items](#13-data-notes-and-known-items)
14. [App structure (technical)](#14-app-structure-technical)
15. [Commit history](#15-commit-history)
16. [Possible next steps](#16-possible-next-steps)

---

## 1. Starting point

- **Backup restore.** The Frappe Cloud backup of 31-10-2026 (database, public and private files) was restored into the local site `sama`, which mirrors the cloud site. A safety backup of the old `sama` was taken first.
- **First issue found.** In developer mode, the first `migrate` deleted the HRMS Workspace Sidebar files as "orphans", so the HR desktop icons showed *"Icon is not correctly configured"*. The files were restored from git and re-migrated.
- **Existing customizations (in the cloud database, not in any app):**
  - 102 Employee custom fields (Iqama, Visa, Qiwa Contract, Insurance, GOSI, Driving License, project, accommodation…);
  - 43 Branch custom fields (CR, VAT, GOSI, national address, bank, planned headcount…);
  - 14 employee-document expiry Notifications (system + email, 15 days);
  - a "Duration Days – employee" client script;
  - a custom `Accommodation` doctype.
- **Requests from HR** (originally numbered list):
  - show days remaining for employee documents;
  - add Qiwa and Muqeem numbers and dates on branches;
  - separate company and employee document alerts;
  - branch details with headcount and Iqama status;
  - company details while searching employees;
  - attendance, shifts and roster guidance;
  - reports per branch, employee, project and project location;
  - one page for all alerts.

## 2. Principles we followed

- **Everything in one app.** All new work lives in the app `falcon_hr` (built on top of HRMS), so it is versioned in git, deployable to Frappe Cloud, and survives restores.
- **Never modify HRMS / ERPNext / Frappe code.** Falcon HR only *adds* pages, reports, fields, alerts, and a doctype. Sidebar links point at the standard HRMS screens.
- **Don't override other apps.** For example, Arabic translations skip any phrase another app already translates.
- **Safe on any site.** Queries go through `safe_list()`, which drops custom fields a site doesn't have, so a fresh or staging site never crashes.
- **Idempotent setup.** Every install/migrate step can run any number of times.
- **Permissions respected.** Users only see and act on records their roles and User Permissions allow.

## 3. Everything that was built

### 3.1 Navigation
- **Desktop icon** "Falcon HR".
- **Dock icon** (the new Frappe 16.54 icon rail).
- **Grouped sidebar** with these sections: HR Dashboard, Expiry Center, Nitaqat Dashboard, Employee, Branch, *People & Organization*, *Attendance*, *Shifts & Roster*, *Reports*, *Frappe HR* (links to the HRMS workspaces) and *Tools & Settings*.
- Pages open under `/desk/falcon-hr/…`.

### 3.2 HR Dashboard — `/desk/falcon-hr/falcon-hr-dashboard`
- **Look:** cream canvas, black "hero" tile, pastel tiles and a sliding pill tab bar, styled after the reference videos.
- **Global search:** name, employee ID, Iqama, passport, phone, project or branch, with live results.
- **Filters:** Company, Branch (sponsor), Project, Nationality and Clear filters.
- **Employee status switch:** Active / Inactive / Suspended / Left / All, with counts.
- **KPI tiles:** active employees, branches, expiring within 60 days, expired documents. All are clickable.
- **Tabs:**
  - *Overview:* headcount by branch, document-health ring, upcoming-expiry tiles, nationality mix, and joiners vs leavers over 12 months;
  - *Projects:* active and unassigned counts, top locations, and a card per project;
  - *Documents:* status per document type;
  - *Branches:* a searchable card per branch with headcount, Iqama status, and CR / VAT / Qiwa / Muqeem validity.
- **Every chart element is clickable.** Bars, ring segments, legend rows, nationality segments and joiner months all open the matching filtered list, report or Expiry Center view.
- A "no branch set" banner with a **Fix now** link.
- Header buttons: Employees, Branches, Reports, Nitaqat, Monthly PDF, Expiry Center.

### 3.3 Expiry Center — `/desk/falcon-hr/expiry-center`
- **One list for every expiring document.**
  - Employee documents (7): Iqama, Visa, Passport, Qiwa Contract, Medical Insurance, GOSI, Driving License.
  - Company / branch documents (4): Commercial Registration, VAT Certificate, Qiwa Establishment, Muqeem Subscription.
- **Status rules:** Expired (< 0 days) · Critical (≤ 30) · Expiring Soon (31–60) · Valid (> 60).
- **Status tiles:** clickable, with % bars.
- **Switches:** employee status (Active/Inactive/Suspended/Left/All) · scope (All / Employees / Branches) · view (**Table** or **Board**, a pipeline-style board in 4 columns).
- **Document chips** with counts and "need action" warnings.
- **Search and 9 filters:** branch, company, project, location, nationality, designation, expiring-within window, sort, and clear-all. Active filters show as removable tags.
- **Table columns:** person with avatar, ID, designation and nationality · document and number · branch (sponsor) / company · project / location · expiry and time left with a meter · status. Columns are sortable and rows load progressively (100 at a time).
- **Download CSV** of exactly the current view.
- Arrives pre-filtered from dashboard clicks.

### 3.4 Employee and Branch forms
- **Days remaining** under every expiry date, colour-coded: "33 days remaining", "EXPIRED 12 days ago", "… renew now".
- **Branch Overview** at the top of each Branch: active employees, Iqama valid / ≤ 60 days / expired / no date. Each box opens the matching employees.
- **New Branch fields:**
  - **Qiwa & Muqeem:** Qiwa Establishment Number, Qiwa Issue / Expiry Date, Muqeem Account Number, Muqeem Subscription Start / Expiry Date.
  - **Nitaqat (Saudization):** Nitaqat Activity, Current Nitaqat Band (Platinum / High-Medium-Low Green / Red), Target Saudization %, Last Checked on Qiwa.
- **Employee search** shows branch, company and designation in link dropdowns.

### 3.5 Nitaqat Dashboard — `/desk/falcon-hr/nitaqat-dashboard`
- **Saudization per sponsoring branch** against its target.
  - A Saudi employee is anyone with Employee Category "Saudi" or nationality Saudi Arabia.
  - **Saudis needed** = ⌈(target × headcount − Saudis) ÷ (1 − target)⌉, because each new hire also raises the headcount.
- **Tiles:** overall Saudization, Saudi employees, branches below target, Saudis needed, branches without a target.
- **Charts:**
  - Saudization vs target (the black line is the target);
  - branch status ring;
  - Nitaqat bands;
  - size classes (Micro 1–5 · Small 6–49 · Medium 50–499 · Large 500–2,999 · Giant 3,000+).
- **Filters:** search, company, default target %, status, band, size, sort, only staffed branches.
- **Also on the page:** CSV export, a built-in "How to read this page" guide, and branch cards with a target line and a "Hire N Saudi" chip.

### 3.6 Sponsor & deployment history — doctype `Employee Deployment`
- **Records** the employee's sponsor (branch), sponsor company, project, project location, from/to dates, duration in days, reason (New Joiner, Sponsorship Transfer, Project Change, Location Change, Contract Renewal, Other), status (Active/Ended) and company.
- **One current sponsor at a time.** A new current deployment ends the previous one on the day before. Overlapping dates are refused.
- **Updates the employee.** The current deployment updates the Employee's Branch, Project and Project Location, only for fields that changed, and adds an audit comment to the employee. Deployments dated in the future apply on their start date.
- **Duration** is refreshed nightly.
- **History was seeded on install:** every employee with a Branch got one deployment from their joining date (127 rows on Falcon data).
- **Employee form:** a *Sponsor & Deployment History* section on the first tab, plus a **New Deployment** button.

### 3.7 Leaver checklist
- Built on HRMS **Employee Separation**, using the template **"Falcon Leaver Checklist"**. It has 13 steps:
  1. confirm the last working day;
  2. exit interview;
  3. collect assets;
  4. hand over accommodation;
  5. clear advances and loans;
  6. calculate final settlement / EOSB;
  7. terminate the Qiwa contract;
  8. final exit visa / sponsorship transfer (Muqeem);
  9. cancel medical insurance;
  10. deregister from GOSI;
  11. return the passport and documents;
  12. remove system access;
  13. pay the settlement and get a signed clearance.
- **A draft is created automatically** when an employee's status changes to **Left**. There is also a **Start Leaver Checklist** button, which requires permission to edit that employee.
- **On Submit**, HRMS creates one task per step.

### 3.8 Bulk Attendance Upload — `/desk/falcon-hr/bulk-attendance-upload`
- **Replaces HRMS "Upload Attendance",** which HRMS 16.5x deleted (patch `delete_upload_attendance_doctype`).
- **Four steps:**
  1. **Download the Excel template.** It is pre-filled with every active employee × every date (up to 62 days), with optional company and branch. Holidays come from Holiday List Assignment, existing attendance is shown, and dates before joining or after relieving are excluded.
  2. **Fill in the Status column:** Present / Absent / Half Day / On Leave (+ Leave Type) / Work From Home. Optional: Shift, In Time, Out Time.
  3. **Upload and review.** Every row is validated and **nothing is saved**. Tabs show All / Ready / Need fixing / Skipped, each with a reason, and **Download checked file** exports that list.
  4. **Confirm and import.** Ticking "I have reviewed…" unlocks Import. A background job creates and submits only the Ready rows, with live progress.
- **Never duplicates** a day that is already marked. Errors are reported per row, and other rows are not affected.
- **Respects User Permissions:** employees the user cannot see are reported as "not found".

### 3.9 Monthly management PDF
- **Download** from the HR or Nitaqat dashboard: choose a month (last 12) and company.
- **Sections:**
  - headcount and movements;
  - document compliance, plus the list to renew now;
  - company documents needing attention;
  - Nitaqat summary and branches below target;
  - attendance by status;
  - headcount by branch and by project;
  - joiners and leavers, with each leaver's checklist status;
  - sponsor and deployment changes.
- **Arabic and escaping:** in Arabic the PDF is right-to-left. Every value is HTML-escaped before it reaches the PDF engine.

### 3.10 Falcons Accommodation module
- **The clash:** the site's custom `Accommodation` doctype lived in a custom module named **"build"**, which clashes with Frappe 16.54's built-in **"Build"** module.
- **The fix:** an install/migrate step renames that custom module to **"Falcons Accommodation"**. The doctype, its records and the Employee "Accommodation Assigned" link are unchanged.

## 4. Reports

All reports export to Excel/CSV via **⋯ → Export**, and can be emailed on a schedule via **Setup Auto Email**.

| Report | Contents | Filters |
|---|---|---|
| Document Expiry Register | One row per document (employee + company); summary counts | Show, Document, Branch, Status |
| Employee Document Register | One row per employee, all 7 documents side by side (number / expiry / days left) | Branch, Company, Designation, Status, expired / expiring |
| Branch Compliance Register | CR / VAT / Qiwa / Muqeem numbers and expiries per branch + missing documents | Company |
| Branch Workforce Summary | Planned vs actual, Saudi / non-Saudi, Saudization %, Iqama status, insurance expired, projects; chart | Only staffed |
| Project Assignment Register | Employees by project, location, branch, nationality, Iqama expiry; chart | Project, Location, Branch |
| Project Location Summary | Per project or location: employees, sponsors, Iqama status, top nationality | Group by |

## 5. Notifications and alerts

| Alert | When | Channel | To |
|---|---|---|---|
| **Daily bell alerts** (new) | 60, 30, 15, 7, 3, 1, 0 days before expiry; the day after; then every 30 days while expired | Notification centre (bell) | HR Manager / HR User who can read the record |
| Employee document alerts (existing) | 15 days before (7 documents) | System + email | HR team |
| **Company Doc alerts** (new, 12 rules) | CR, VAT, Qiwa, Muqeem: 60 and 15 days (system), 30 days (email) | System + email | HR Manager |
| Leaver checklist message | When an employee is set to Left | In-app message | The user who saved |

- Subjects are tagged **[Employee Document]** or **[Company Document]**.
- Only active employees are alerted.
- Alerts are never sent twice on the same day.
- Document numbers are never included in the alert text.

## 6. Fixes to existing behaviour

- **Employee form opened as "Not Saved"** every time: the site's duration client script rewrote fields on refresh. It is patched to write only when a value changes, and the fix runs from both the patch and the install hook.
- **List sort dropdown hidden** behind the sticky list column. This was fixed in the **Prism** app; it is committed locally but **not yet pushed** to Prism's GitHub.
- **HRMS sidebar files deleted** by the developer-mode migrate: restored from git.
- **Layout:**
  - Arabic (right-to-left): sliding pills and progress bars now work in both directions;
  - tablet widths: switches, tabs and chips no longer wrap or overflow;
  - Nitaqat cards: long branch names are truncated instead of overflowing.

## 7. Upgrade to Frappe 16.54 / HRMS 16.53

The cloud site was updated by the client, so the local bench was brought to the same versions.

- **Before upgrading:** all 7 local sites were backed up, and uncommitted local changes in `frappe`, `erpnext` and `hrms` were stashed (recoverable with `git stash list`).
- **Versions installed:** frappe v16.54.0, erpnext v16.53.0, hrms v16.53.0, payments `version-16` (cca07d9).
- **Problems found and fixed during the upgrade:**
  - The custom "build" module clashes with Frappe's new "Build" module, so it was renamed (see 3.10).
  - Python dependency conflicts from other bench apps: Insights pins `sqlglot<28`, while Frappe needs `>=30.12`; litellm (Builder) pins `click==8.1.8`, while Frappe needs `~=8.4.1`. Frappe's versions were installed.
  - **Frappe 16.54 replaced Workspace Sidebar with Sidebar + Dock**, and old `workspace_sidebar` files are no longer read. Falcon HR's sidebar was converted to `falcon_hr/falcon_hr/sidebar/` and a Dock was added.
  - **HRMS deleted Upload Attendance,** so Falcon HR now provides Bulk Attendance Upload.
- **Result:** `falcon_hr` now requires frappe ≥ 16.54 and erpnext / hrms ≥ 16.53, which matches the cloud bench.

## 8. Arabic translation

- **357 Falcon-specific phrases** are in `falcon_hr/locale/ar.po`, covering every page, report, message and the PDF.
- **Phrases already translated** by Frappe, ERPNext or HRMS (108) are **not** overridden, so their existing Arabic stays as it is.
- **Saudi HR terminology:** إقامة (Iqama), قوى (Qiwa), مقيم (Muqeem), التأمينات الاجتماعية (GOSI), نطاقات (Nitaqat), السعودة (Saudization), الكفيل (sponsor).
- **Verified in the browser:** no leftover English on any Falcon screen, and the right-to-left layout is checked.

## 9. Security review fixes

Automated security reviews ran on every commit. Every finding was fixed and retested:

- **Expiry Center table:** the employee ID is now HTML-escaped.
- **Daily alerts:** each recipient only gets alerts for records they can read, and document numbers are removed from the alert body.
- **Tooltips:** values are double-escaped.
- **Leaver checklist API:** requires Employee write permission and status Left; existing separations are only shown to users who can read them.
- **Monthly PDF:** every template value is escaped, and the deployment section is filtered by company.
- **Employee Deployment:** saving requires Employee write permission; it carries a Company field so User Permissions apply; Employee updates leave an audit comment.
- **Bulk upload:** validation uses permission-aware queries, and company is no longer returned in the preview.

## 10. Testing performed

- **Data tests.** Every report and API was run on real Falcon data (336 active employees, 472 documents, 40 branches).
- **Functional tests**, rolled back or cleaned up afterwards:
  - a sponsor transfer, including closing the previous deployment, the Employee update and the audit comment;
  - the overlap rule;
  - leaver auto-creation (13 activities);
  - leaver permission blocks;
  - HTML-escaping with a malicious employee name.
- **Bulk attendance upload end to end:**
  - template → upload → review → import gave 3 created, 17 skipped and 2 errors caught;
  - a second import of the same file created 0 duplicates;
  - the full browser flow, including the review gating.
- **Browser tests** (headless Chromium):
  - all 44 sidebar links;
  - every dashboard tab, filter, search and click-through;
  - Expiry Center table and board;
  - Nitaqat filters and charts;
  - Employee and Branch forms;
  - monthly PDF download (HTTP 200, `application/pdf`);
  - no JavaScript errors.
- **Layout:** no horizontal overflow at 1440, 1024 and 768 px, in English and Arabic; all sliding pills aligned in both directions.
- **Migrations:** two consecutive migrates produced no errors and no file changes in any app.
- **Installation:**
  - a clean install on a brand-new frappe + erpnext + hrms site;
  - an install on a copy of the production data (restored backup migrated to 16.54);
  - uninstall then reinstall, which left the site's own 87 Employee fields, 51 Branch fields and 14 alert rules intact.
- **Code quality:** ruff lint and format clean; Python compiles; JavaScript syntax checked.

## 11. Install / update on Frappe Cloud

**No backup restore is needed.** Install the app on the live site. Take a backup first as a safety net only.

1. **Backup:** falcons site → *Backups* → *Schedule a Backup* (with files) → wait until completed.
2. **GitHub access:** GitHub → *Settings → Applications → Frappe Cloud → Configure* → allow `falcon_hr`.
3. **Add the app:** *Bench Groups* → your group → *Apps* → *Add App* → GitHub → `Omarhabeeb27/falcon_hr`, branch `main`.
4. **Deploy** the bench group and wait until it succeeds.
5. **Update the site:** open the site and click **Update** if an update is available.
6. **Install:** site → *Apps* → *Install App* → **Falcon HR**.
7. **Hard-refresh** the browser (Ctrl + Shift + R).

**Later updates:** push to `main` → *Deploy* the bench group → *Update* the site.

**Rollback:** site → Apps → Uninstall Falcon HR (your own data stays), or restore the step-1 backup.

## 12. One-time setup after installing

- **Holiday List Assignment** (HR Setup): Company → Falcon Resource Management → Holiday List *2026* → from 01-01-2026 → **Submit**. Repeat yearly. This marks Fridays and holidays in attendance templates and the Roster.
- **Nitaqat:** on each Branch, fill in the band and Target Saudization % from Qiwa, or set a default target on the Nitaqat Dashboard.
- **Email Account (outgoing)**, for the email alerts.
- **Roles:** HR staff need **HR Manager** or **HR User**.
- **Missing branches:** fill in the Branch (sponsor) for the **212 active employees** who have none. Use Data Import → Update Existing Records.

## 13. Data notes and known items

- **212 of 336 active employees have no Branch**, so branch figures exclude them until it's filled in.
- **Project names are free text**, so the same project can appear twice (e.g. "DELMONTE" vs "DALMONTE"). Reports normalise case and blanks, but not spelling.
- **219 documents are already expired**, mostly old Iqamas. Review whether these employees are still active.
- **Other local sites:**
  - `basamat` cannot migrate because its `pos_next` app no longer exists (renamed kamilPOS). This is outside Falcon HR and pending a decision.
  - Builder (`deroo`) has a dependency conflict with Frappe 16.54 in its AI feature.
  - Insights and LMS are on the bench but not installed on any site.
- **Prism** sort-dropdown fix is not yet pushed to its GitHub repo.

## 14. App structure (technical)

```
falcon_hr/
├── hooks.py                    required_apps frappe/erpnext + frappe/hrms; doctype_js; fixtures;
│                               scheduler (daily alerts, deployment durations); doc_events (leaver)
├── api/
│   ├── common.py               safe_list(), norm(), is_saudi()
│   ├── expiry.py               document catalogue, get_expiry_data(), branch summary
│   ├── dashboard.py            HR dashboard data + global search
│   ├── nitaqat.py              Saudization per branch, saudis_needed()
│   ├── alerts.py               daily notification-centre alerts
│   ├── leaver.py               leaver checklist (Employee Separation)
│   ├── monthly_report.py       monthly management PDF
│   └── attendance_upload.py    bulk attendance template / preview / import job
├── falcon_hr/
│   ├── page/                   falcon_hr_dashboard, expiry_center, nitaqat_dashboard,
│   │                           bulk_attendance_upload
│   ├── report/                 6 script reports
│   ├── doctype/employee_deployment/
│   └── sidebar/falcon_hr/      Frappe 16.54 Sidebar
├── dock/falcon_hr/             Frappe 16.54 Dock entry
├── desktop_icon/               desktop icon
├── fixtures/                   Branch custom fields (Qiwa, Muqeem, Nitaqat) + 12 Company Doc notifications
├── setup/install.py            after_install / after_migrate (idempotent setup)
├── patches/v1_0/               client-script fix
├── templates/monthly_report.html
├── public/js/                  employee.js, branch.js, falcon_hr.bundle.js
└── locale/ar.po                Arabic
docs/
├── guide/                      user guide (HTML + PDF, masked screenshots)
├── screenshots/                README screenshots (masked)
└── FALCON_HR_PROJECT_SUMMARY.md
```

## 15. Commit history

| Commit | Change |
|---|---|
| 6149876 | Initialize app |
| 37d1125 | Expiry Center, Branch Qiwa/Muqeem fields, company document alerts |
| f05e6e0 | Expiry Center falls back to company when employee has no branch |
| f609e25 | Escape employee ID in Expiry Center table |
| 46d8ab9 | HR dashboard page, desktop icon and sidebar |
| 7ce3b26 | Expiry Center redesign, reports, Projects tab, bell alerts, grouped sidebar |
| 3754d6b | Animations via transforms |
| c947778 | Alerts respect each recipient's read permission |
| e79019c | Employee status switch |
| 49ec3ec | Frappe Cloud readiness (`safe_list`, README) |
| 6fd4a35 | Dashboard filters, global search, click-through |
| fd8435b | Employee form no longer opens as "Not Saved" |
| ec504e1 | Frappe Cloud compatibility pass (v1.0.0) |
| 775373d | Ignore local tool caches |
| 3773d29 | Load fixtures before post-install setup |
| 43b9d2b | README screenshots |
| f09fa3e | RTL (Arabic) and narrow-screen layout |
| d43081f | Arabic translations |
| 343c10e | Nitaqat dashboard, deployment history, leaver checklist, monthly PDF |
| d280e3b | Security: permissions, escaping, company scoping |
| a5af7ef | README for new features |
| 6bfbd80 | Frappe 16.54 navigation (Sidebar + Dock), v1.1.0 |
| 9eb67c3 | Bulk Attendance Upload with review step |
| b1a4fb5 | Bulk upload permissions; "build" → Falcons Accommodation |
| a47e561 | Screenshots refreshed on 16.54 UI |

## 16. Possible next steps

- Stamp **branch, project and location on each attendance record**, for attendance reports by site.
- **Renewal workflow:** owner, status and cost for each expiring document.
- **Project pick-list** instead of free text, to end duplicate spellings.
- Supervisor **mobile attendance** page per site.
- Document **scan history** (keep old Iqama and passport copies).
- **WhatsApp / SMS** reminders for critical expiries.
- **Automated tests** for future Frappe updates.
