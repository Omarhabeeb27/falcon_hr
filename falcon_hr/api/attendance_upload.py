"""Bulk attendance upload (replaces HRMS "Upload Attendance", removed in HRMS 16.5x).

1. download_template  - Excel pre-filled with every active employee x every date
                        (holidays and existing attendance marked)
2. preview            - validate an uploaded file row by row, nothing saved
3. start_import       - background job: create + submit Attendance per valid row;
                        blank / Holiday rows are skipped, errors reported per row
"""

import frappe
from frappe import _
from frappe.utils import cstr, date_diff, get_datetime, getdate

from falcon_hr.api.common import norm, safe_list

COLUMNS = [
	"Employee",
	"Employee Name",
	"Branch",
	"Project",
	"Date",
	"Status",
	"Leave Type",
	"Shift",
	"In Time",
	"Out Time",
	"Existing Attendance",
]
STATUSES = ["Present", "Absent", "Half Day", "On Leave", "Work From Home"]
SKIP = {"", "holiday"}
MAX_DAYS = 62
CACHE_KEY = "falcon_attendance_upload:{}"


def _check_permission():
	if not frappe.has_permission("Attendance", "create") or not frappe.has_permission("Attendance", "submit"):
		frappe.throw(_("You need permission to create and submit Attendance."), frappe.PermissionError)


def _holidays_for(employees, from_date, to_date):
	"""{employee: set(dates)} using HRMS Holiday List Assignment (if configured)."""
	try:
		from hrms.utils.holiday_list import get_holiday_dates_between, get_holiday_list_for_employee
	except ImportError:
		return {}
	by_list, out = {}, {}
	for e in employees:
		hl = get_holiday_list_for_employee(e, raise_exception=False, as_on=from_date)
		if not hl:
			continue
		if hl not in by_list:
			by_list[hl] = {getdate(d) for d in get_holiday_dates_between(hl, from_date, to_date)}
		out[e] = by_list[hl]
	return out


@frappe.whitelist()
def download_template(from_date, to_date, company=None, branch=None, project=None):
	_check_permission()
	from_date, to_date = getdate(from_date), getdate(to_date)
	if to_date < from_date:
		frappe.throw(_("To Date cannot be before From Date"))
	if date_diff(to_date, from_date) >= MAX_DAYS:
		frappe.throw(_("Please choose at most {0} days per template.").format(MAX_DAYS))

	filters = {"status": "Active"}
	if company:
		filters["company"] = company
	if branch:
		filters["branch"] = branch
	emps = safe_list(
		"Employee",
		filters=filters,
		fields=[
			"name",
			"employee_name",
			"branch",
			"company",
			"date_of_joining",
			"relieving_date",
			"default_shift",
			"custom_project_assigned_to",
		],
		order_by="employee_name asc",
	)
	if project:
		emps = [e for e in emps if norm(e.get("custom_project_assigned_to")) == project]
	if not emps:
		frappe.throw(_("No active employees match these filters."))

	names = [e.name for e in emps]
	holidays = _holidays_for(names, from_date, to_date)
	existing = {
		(a.employee, getdate(a.attendance_date)): a
		for a in frappe.get_all(
			"Attendance",
			filters={
				"employee": ["in", names],
				"attendance_date": ["between", [from_date, to_date]],
				"docstatus": 1,
			},
			fields=["name", "employee", "attendance_date", "status", "leave_type", "shift"],
		)
	}

	rows = [COLUMNS]
	d = from_date
	while d <= to_date:
		for e in emps:
			if e.date_of_joining and d < getdate(e.date_of_joining):
				continue
			if e.relieving_date and d > getdate(e.relieving_date):
				continue
			ex = existing.get((e.name, d))
			status = ex.status if ex else ("Holiday" if d in holidays.get(e.name, ()) else "")
			rows.append(
				[
					e.name,
					e.employee_name,
					e.branch or "",
					norm(e.get("custom_project_assigned_to")) if e.get("custom_project_assigned_to") else "",
					d.isoformat(),
					status,
					(ex.leave_type if ex else "") or "",
					(ex.shift if ex else e.default_shift) or "",
					"",
					"",
					ex.name if ex else "",
				]
			)
		d = frappe.utils.add_days(d, 1)

	from frappe.utils.xlsxutils import build_xlsx_response

	build_xlsx_response(rows, f"Attendance {from_date.isoformat()} to {to_date.isoformat()}")


def _read_rows(file_url):
	file_doc = frappe.get_doc("File", {"file_url": file_url})
	file_doc.check_permission("read")
	if file_url.lower().endswith(".csv"):
		from frappe.utils.csvutils import read_csv_content

		raw = read_csv_content(file_doc.get_content())
	else:
		from frappe.utils.xlsxutils import read_xlsx_file_from_attached_file

		raw = read_xlsx_file_from_attached_file(file_url=file_url)
	raw = [r for r in raw if r and any(cstr(c).strip() for c in r)]
	if not raw:
		frappe.throw(_("The file is empty."))
	header = [cstr(c).strip() for c in raw[0]]
	missing = [c for c in ("Employee", "Date", "Status") if c not in header]
	if missing:
		frappe.throw(
			_("Missing columns: {0}. Please use the downloaded template.").format(", ".join(missing))
		)
	idx = {h: i for i, h in enumerate(header)}

	def cell(r, col):
		i = idx.get(col)
		return cstr(r[i]).strip() if i is not None and i < len(r) and r[i] is not None else ""

	rows = []
	for n, r in enumerate(raw[1:], start=2):
		rows.append({"row": n, **{c: cell(r, c) for c in COLUMNS}})
	return rows


def _parse_date(v):
	try:
		return getdate(v)
	except Exception:
		return None


def _time(date, value):
	if not value:
		return None
	value = value.strip()
	try:
		if len(value) <= 8 and ":" in value:  # "08:05" or "08:05:00"
			return get_datetime(f"{date} {value}")
		return get_datetime(value)
	except Exception:
		return "invalid"


def _validate(rows):
	emp_ids = {r["Employee"] for r in rows if r["Employee"]}
	# get_list (not get_all): employees the user may not see are treated as "not found".
	emps = {
		e.name: e
		for e in frappe.get_list(
			"Employee",
			filters={"name": ["in", list(emp_ids) or [""]]},
			fields=["name", "employee_name", "company", "status", "date_of_joining", "relieving_date"],
		)
	}
	leave_types = (
		set(frappe.get_all("Leave Type", pluck="name"))
		if frappe.db.exists("DocType", "Leave Type")
		else set()
	)
	shifts = (
		set(frappe.get_all("Shift Type", pluck="name"))
		if frappe.db.exists("DocType", "Shift Type")
		else set()
	)
	existing = set()
	if emps:
		for a in frappe.get_all(
			"Attendance",
			filters={"employee": ["in", list(emps)], "docstatus": 1},
			fields=["employee", "attendance_date"],
		):
			existing.add((a.employee, getdate(a.attendance_date)))

	seen, out = set(), []
	for r in rows:
		status = r["Status"]
		res = {
			"row": r["row"],
			"employee": r["Employee"],
			"name": r["Employee Name"],
			"date": r["Date"],
			"status": status,
		}
		if status.lower() in SKIP:
			res.update(result="skip", message=_("No status (or Holiday) — skipped"))
			out.append(res)
			continue
		problems = []
		e = emps.get(r["Employee"])
		d = _parse_date(r["Date"])
		if not e:
			problems.append(_("Employee ID not found"))
		if not d:
			problems.append(_("Invalid date"))
		if status not in STATUSES:
			problems.append(_("Status must be one of: {0}").format(", ".join(STATUSES)))
		if status == "On Leave" and not r["Leave Type"]:
			problems.append(_("Leave Type is required for On Leave"))
		if r["Leave Type"] and leave_types and r["Leave Type"] not in leave_types:
			problems.append(_("Unknown Leave Type"))
		if r["Shift"] and shifts and r["Shift"] not in shifts:
			problems.append(_("Unknown Shift"))
		if e and d:
			if e.date_of_joining and d < getdate(e.date_of_joining):
				problems.append(_("Before the employee's joining date"))
			if e.relieving_date and d > getdate(e.relieving_date):
				problems.append(_("After the employee's relieving date"))
			if (e.name, d) in seen:
				problems.append(_("Duplicate row for this employee and date"))
			seen.add((e.name, d))
		for col in ("In Time", "Out Time"):
			if r[col] and d and _time(d.isoformat(), r[col]) == "invalid":
				problems.append(_("Invalid {0}").format(_(col)))
		if problems:
			res.update(result="error", message="; ".join(problems))
		elif (e.name, d) in existing:
			res.update(result="skip", message=_("Attendance already marked for this day — skipped"))
		else:
			res.update(result="ok", message="", company=e.company)
		out.append(res)
	return out


@frappe.whitelist()
def preview(file_url):
	_check_permission()
	checked = _validate(_read_rows(file_url))
	summary = {k: sum(1 for c in checked if c["result"] == k) for k in ("ok", "skip", "error")}
	for c in checked:
		c.pop("company", None)  # internal, used only by the import job
	summary["total"] = len(checked)
	order = {"error": 0, "ok": 1, "skip": 2}
	return {"summary": summary, "rows": sorted(checked, key=lambda c: (order[c["result"]], c["row"]))[:3000]}


@frappe.whitelist()
def start_import(file_url):
	_check_permission()
	key = frappe.generate_hash(length=12)
	frappe.cache.set_value(
		CACHE_KEY.format(key), {"state": "queued", "done": 0, "total": 0}, expires_in_sec=86400
	)
	frappe.enqueue(
		"falcon_hr.api.attendance_upload.run_import",
		queue="long",
		timeout=3600,
		file_url=file_url,
		key=key,
		user=frappe.session.user,
		now=frappe.flags.in_test,
	)
	return key


def run_import(file_url, key, user):
	frappe.set_user(user)
	rows = {r["row"]: r for r in _read_rows(file_url)}
	checked = _validate(list(rows.values()))
	todo = [c for c in checked if c["result"] == "ok"]
	results = {
		"created": 0,
		"skipped": sum(1 for c in checked if c["result"] == "skip"),
		"errors": [c for c in checked if c["result"] == "error"],
	}
	state = {"state": "running", "done": 0, "total": len(todo)}
	cache_key = CACHE_KEY.format(key)
	frappe.cache.set_value(cache_key, state, expires_in_sec=86400)

	for i, c in enumerate(todo, start=1):
		r = rows[c["row"]]
		d = getdate(r["Date"]).isoformat()
		frappe.db.savepoint("falcon_att")
		try:
			doc = frappe.get_doc(
				{
					"doctype": "Attendance",
					"employee": r["Employee"],
					"attendance_date": d,
					"status": r["Status"],
					"leave_type": r["Leave Type"] or None,
					"shift": r["Shift"] or None,
					"in_time": _time(d, r["In Time"]),
					"out_time": _time(d, r["Out Time"]),
					"company": c.get("company"),
				}
			)
			doc.insert()
			doc.submit()
			results["created"] += 1
		except Exception as e:
			frappe.db.rollback(save_point="falcon_att")
			frappe.clear_messages()
			results["errors"].append({**c, "result": "error", "message": cstr(e)[:200]})
		if i % 50 == 0 or i == len(todo):
			frappe.db.commit()
			state.update(done=i)
			frappe.cache.set_value(cache_key, state, expires_in_sec=86400)
			frappe.publish_realtime("falcon_attendance_upload", {"key": key, **state}, user=user)

	results["errors"] = sorted(results["errors"], key=lambda c: c["row"])[:500]
	final = {"state": "done", "done": len(todo), "total": len(todo), **results}
	frappe.cache.set_value(cache_key, final, expires_in_sec=86400)
	frappe.db.commit()
	frappe.publish_realtime("falcon_attendance_upload", {"key": key, **final}, user=user)


@frappe.whitelist()
def get_status(key):
	_check_permission()
	return frappe.cache.get_value(CACHE_KEY.format(key)) or {"state": "unknown"}
