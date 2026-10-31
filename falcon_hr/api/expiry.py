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
	("GOSI", "custom_gosi_end_date", None),
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


def _rows(doctype, docs, name_fields, extra_fields, filters):
	today = getdate(nowdate())
	out = []
	for label, date_field, number_field in docs:
		cols = _existing(doctype, [date_field, number_field] + extra_fields)
		if date_field not in cols:
			continue
		for r in frappe.get_list(
			doctype,
			filters={**filters, date_field: ["is", "set"]},
			fields=["name"] + cols,
			limit_page_length=0,
		):
			days = date_diff(r[date_field], today)
			out.append(
				{
					"scope": doctype,
					"doctype": doctype,
					"name": r.name,
					"party": r.get(name_fields) or r.name,
					"document": label,
					"number": r.get(number_field) if number_field else "",
					"branch": r.get("branch") or (r.name if doctype == "Branch" else ""),
					"company": r.get("company") or r.get("custom_company") or "",
					"expiry_date": str(r[date_field]),
					"days_left": days,
					"status": status_for(days),
				}
			)
	return out


@frappe.whitelist()
def get_expiry_data(scope="All", document=None, branch=None, status=None, search=None):
	"""Return rows + summary for the Expiry Center page."""
	rows = []
	if scope in ("All", "Employee"):
		f = {"status": "Active"}
		if branch:
			f["branch"] = branch
		rows += _rows("Employee", EMPLOYEE_DOCS, "employee_name", ["employee_name", "branch", "company"], f)
	if scope in ("All", "Branch"):
		f = {"name": branch} if branch else {}
		rows += _rows("Branch", BRANCH_DOCS, "name", ["custom_company"], f)

	if document:
		rows = [r for r in rows if r["document"] == document]
	if search:
		s = search.lower()
		rows = [r for r in rows if s in " ".join(str(v) for v in r.values()).lower()]

	summary = {"Expired": 0, "Critical": 0, "Expiring Soon": 0, "Valid": 0}
	for r in rows:
		summary[r["status"]] += 1
	if status:
		rows = [r for r in rows if r["status"] == status]
	rows.sort(key=lambda r: r["days_left"])
	return {
		"rows": rows,
		"summary": summary,
		"documents": [d[0] for d in EMPLOYEE_DOCS] + [d[0] for d in BRANCH_DOCS],
	}


@frappe.whitelist()
def get_branch_summary(branch):
	"""Employee headcount + Iqama status split for one branch (Branch form dashboard)."""
	today = getdate(nowdate())
	emps = frappe.get_list(
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
	res["documents"] = [
		r for r in _rows("Branch", BRANCH_DOCS, "name", ["custom_company"], {"name": branch})
	]
	return res
