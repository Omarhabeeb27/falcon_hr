import frappe
from frappe import _
from frappe.utils import date_diff, flt, nowdate

from falcon_hr.api.common import is_saudi, safe_list


def execute(filters=None):
	filters = filters or {}
	today = nowdate()
	cols = [
		{"label": _("Branch (Sponsor)"), "fieldname": "branch", "fieldtype": "Link", "options": "Branch", "width": 230},
		{"label": _("Company"), "fieldname": "company", "fieldtype": "Data", "width": 170},
		{"label": _("Planned"), "fieldname": "planned", "fieldtype": "Int", "width": 80},
		{"label": _("Active"), "fieldname": "active", "fieldtype": "Int", "width": 80},
		{"label": _("Gap vs Plan"), "fieldname": "gap", "fieldtype": "Int", "width": 95},
		{"label": _("Saudi"), "fieldname": "saudi", "fieldtype": "Int", "width": 70},
		{"label": _("Non-Saudi"), "fieldname": "non_saudi", "fieldtype": "Int", "width": 90},
		{"label": _("Saudization %"), "fieldname": "saudization", "fieldtype": "Percent", "width": 110},
		{"label": _("Iqama Valid"), "fieldname": "iqama_valid", "fieldtype": "Int", "width": 95},
		{"label": _("Iqama ≤60d"), "fieldname": "iqama_soon", "fieldtype": "Int", "width": 95},
		{"label": _("Iqama Expired"), "fieldname": "iqama_expired", "fieldtype": "Int", "width": 105},
		{"label": _("No Iqama Date"), "fieldname": "iqama_missing", "fieldtype": "Int", "width": 105},
		{"label": _("Insurance Expired"), "fieldname": "ins_expired", "fieldtype": "Int", "width": 120},
		{"label": _("Projects"), "fieldname": "projects", "fieldtype": "Int", "width": 80},
	]
	branches = safe_list("Branch", fields=["name", "custom_company", "custom_planned_employee_count"], limit_page_length=0)
	emps = safe_list("Employee", filters={"status": "Active"},
		fields=["branch", "custom_employee_category", "custom_nationality", "custom_iqama_expiry_date",
			"custom_insurance_expiry_date", "custom_project_assigned_to"], limit_page_length=0)
	stats = {}
	for e in emps:
		key = e.branch or "__none__"
		s = stats.setdefault(key, {"active": 0, "saudi": 0, "iqama_valid": 0, "iqama_soon": 0, "iqama_expired": 0,
			"iqama_missing": 0, "ins_expired": 0, "projects": set()})
		s["active"] += 1
		if is_saudi(e):
			s["saudi"] += 1
		elif not e.custom_iqama_expiry_date:
			s["iqama_missing"] += 1
		else:
			d = date_diff(e.custom_iqama_expiry_date, today)
			s["iqama_expired" if d < 0 else "iqama_soon" if d <= 60 else "iqama_valid"] += 1
		if e.custom_insurance_expiry_date and date_diff(e.custom_insurance_expiry_date, today) < 0:
			s["ins_expired"] += 1
		if (e.custom_project_assigned_to or "").strip() not in ("", "-", "na"):
			s["projects"].add(e.custom_project_assigned_to.strip().upper())

	def build(name, company, planned, s):
		active = s["active"]
		return {"branch": name, "company": company, "planned": planned, "active": active,
			"gap": active - planned if planned else None, "saudi": s["saudi"], "non_saudi": active - s["saudi"],
			"saudization": flt(100.0 * s["saudi"] / active, 1) if active else 0,
			"iqama_valid": s["iqama_valid"], "iqama_soon": s["iqama_soon"], "iqama_expired": s["iqama_expired"],
			"iqama_missing": s["iqama_missing"], "ins_expired": s["ins_expired"], "projects": len(s["projects"])}

	empty = {"active": 0, "saudi": 0, "iqama_valid": 0, "iqama_soon": 0, "iqama_expired": 0, "iqama_missing": 0, "ins_expired": 0, "projects": set()}
	data = [build(b.name, b.custom_company, b.custom_planned_employee_count or 0, stats.get(b.name, empty)) for b in branches]
	if filters.get("only_staffed"):
		data = [d for d in data if d["active"]]
	data.sort(key=lambda d: -d["active"])
	if "__none__" in stats:
		data.append(build(_("(No branch set)"), "", 0, stats["__none__"]))
	chart = {"data": {"labels": [d["branch"] for d in data[:15]],
		"datasets": [{"name": _("Active"), "values": [d["active"] for d in data[:15]]},
			{"name": _("Planned"), "values": [d["planned"] for d in data[:15]]}]},
		"type": "bar", "colors": ["#2a78d6", "#eb6834"]}
	return cols, data, None, chart
