"""Single source of truth for every expiring document (employee + branch/company)."""

import frappe
from frappe import _
from frappe.utils import date_diff, getdate, nowdate

# (label, expiry field, number field or None)
EMPLOYEE_DOCS = [
	("Iqama", "custom_iqama_expiry_date", "custom_iqama_number"),
	("Visa", "custom_visa_end_date", "custom_visa_number"),
	("Passport", "valid_upto", "passport_number"),
	("Qiwa Contract", "custom_qiwa_contract_end_date", "custom_qiwa_contract_number"),
	("Medical Insurance", "custom_insurance_expiry_date", "health_insurance_no"),
	("GOSI", "custom_gosi_end_date", "custom_gosi_id"),
	("Driving License", "custom_driving_license_expiry_date", "custom_driving_license_number"),
]

BRANCH_DOCS = [
	("Commercial Registration", "custom_cr_expiry_date", "custom_cr_number"),
	("VAT Certificate", "custom_vat_certificate_expiry", "custom_vat_certificate_number"),
	("Qiwa Establishment", "custom_qiwa_expiry_date", "custom_qiwa_number"),
	("Muqeem Subscription", "custom_muqeem_expiry_date", "custom_muqeem_number"),
]

SOON = 30
WARN = 60


def status_for(days_left):
	if days_left < 0:
		return "Expired"
	if days_left <= SOON:
		return "Critical"
	if days_left <= WARN:
		return "Expiring Soon"
	return "Valid"


def _existing(doctype, fields):
	meta = frappe.get_meta(doctype)
	return [f for f in fields if f and meta.has_field(f)]


EMP_EXTRA = [
	"employee_name",
	"branch",
	"company",
	"designation",
	"custom_nationality",
	"custom_project_assigned_to",
	"custom_project_location",
	"cell_number",
	"status",
	"relieving_date",
]
BRANCH_EXTRA = ["custom_company", "custom_city", "custom_branch_manager_name"]


def _rows(doctype, docs, name_field, extra_fields, filters):
	from falcon_hr.api.common import norm

	today = getdate(nowdate())
	out = []
	for label, date_field, number_field in docs:
		cols = _existing(doctype, [date_field, number_field, *extra_fields])
		if date_field not in cols:
			continue
		for r in frappe.get_list(
			doctype,
			filters={**filters, date_field: ["is", "set"]},
			fields=["name", *cols],
			limit_page_length=0,
		):
			days = date_diff(r[date_field], today)
			is_emp = doctype == "Employee"
			out.append(
				{
					"scope": doctype,
					"doctype": doctype,
					"name": r.name,
					"party": r.get(name_field) or r.name,
					"document": label,
					"number": (r.get(number_field) if number_field else "") or "",
					"branch": r.get("branch") or (r.name if not is_emp else ""),
					"company": r.get("company") or r.get("custom_company") or "",
					"designation": r.get("designation") or "",
					"nationality": r.get("custom_nationality") or "",
					"project": norm(r.get("custom_project_assigned_to")) if is_emp else "",
					"location": norm(r.get("custom_project_location"), "Not set")
					if is_emp
					else (r.get("custom_city") or ""),
					"phone": r.get("cell_number") or "",
					"emp_status": r.get("status") if is_emp else "",
					"relieving_date": str(r.get("relieving_date") or "") if is_emp else "",
					"manager": r.get("custom_branch_manager_name") or "",
					"expiry_date": str(r[date_field]),
					"days_left": days,
					"status": status_for(days),
				}
			)
	return out


@frappe.whitelist()
def get_expiry_data(
	scope="All",
	document=None,
	branch=None,
	status=None,
	search=None,
	company=None,
	project=None,
	location=None,
	nationality=None,
	designation=None,
	within_days=None,
	sort="days_left",
	employee_status="Active",
):
	"""Return rows + summary + filter options for the Expiry Center page."""
	rows = []
	if scope in ("All", "Employee"):
		f = {}
		if employee_status and employee_status != "All":
			f["status"] = employee_status
		if branch:
			f["branch"] = branch
		if company:
			f["company"] = company
		if designation:
			f["designation"] = designation
		if nationality and frappe.get_meta("Employee").has_field("custom_nationality"):
			f["custom_nationality"] = nationality
		rows += _rows("Employee", EMPLOYEE_DOCS, "employee_name", EMP_EXTRA, f)
	# Company (branch) documents belong with the current workforce view only.
	if (
		scope in ("All", "Branch")
		and employee_status in ("Active", "All", None, "")
		and not (designation or nationality or project or location)
	):
		f = {"name": branch} if branch else {}
		if company and frappe.get_meta("Branch").has_field("custom_company"):
			f["custom_company"] = company
		rows += _rows("Branch", BRANCH_DOCS, "name", BRANCH_EXTRA, f)

	options = {
		"projects": sorted({r["project"] for r in rows if r["scope"] == "Employee"}),
		"locations": sorted({r["location"] for r in rows if r["scope"] == "Employee"}),
	}

	if document:
		rows = [r for r in rows if r["document"] == document]
	if project:
		rows = [r for r in rows if r["project"] == project]
	if location:
		rows = [r for r in rows if r["location"] == location]
	if within_days not in (None, ""):
		n = int(within_days)
		rows = [r for r in rows if r["days_left"] <= n]
	if search:
		s = search.lower()
		rows = [r for r in rows if s in " ".join(str(v) for v in r.values()).lower()]

	summary = {"Expired": 0, "Critical": 0, "Expiring Soon": 0, "Valid": 0}
	for r in rows:
		summary[r["status"]] += 1
	by_doc = {}
	for r in rows:
		by_doc.setdefault(r["document"], {"Expired": 0, "Critical": 0, "Expiring Soon": 0, "Valid": 0})[
			r["status"]
		] += 1
	if status:
		rows = [r for r in rows if r["status"] == status]

	keys = {
		"days_left": lambda r: r["days_left"],
		"name": lambda r: (r["party"] or "").lower(),
		"branch": lambda r: (r["branch"] or "~").lower(),
		"document": lambda r: (r["document"], r["days_left"]),
		"project": lambda r: (r["project"] or "~", r["days_left"]),
	}
	rows.sort(key=keys.get(sort, keys["days_left"]))
	return {
		"rows": rows,
		"summary": summary,
		"by_document": by_doc,
		"documents": [d[0] for d in EMPLOYEE_DOCS] + [d[0] for d in BRANCH_DOCS],
		"options": options,
		"employee_status_counts": employee_status_counts(),
	}


def employee_status_counts():
	"""Headcount per employee status (permission-aware) for the status switch."""
	counts = {"Active": 0, "Inactive": 0, "Suspended": 0, "Left": 0}
	for st in frappe.get_list("Employee", pluck="status", limit_page_length=0):
		counts[st] = counts.get(st, 0) + 1
	counts["All"] = sum(counts.values())
	return counts


@frappe.whitelist()
def get_branch_summary(branch):
	"""Employee headcount + Iqama status split for one branch (Branch form dashboard)."""
	today = getdate(nowdate())
	from falcon_hr.api.common import safe_list

	emps = safe_list(
		"Employee",
		filters={"branch": branch, "status": "Active"},
		fields=["name", "custom_iqama_expiry_date", "custom_iqama_number"],
		limit_page_length=0,
	)
	res = {"total": len(emps), "valid": 0, "expiring": 0, "expired": 0, "missing": 0}
	for e in emps:
		if not e.custom_iqama_expiry_date:
			res["missing"] += 1
			continue
		d = date_diff(e.custom_iqama_expiry_date, today)
		if d < 0:
			res["expired"] += 1
		elif d <= WARN:
			res["expiring"] += 1
		else:
			res["valid"] += 1
	res["documents"] = [r for r in _rows("Branch", BRANCH_DOCS, "name", ["custom_company"], {"name": branch})]
	return res
