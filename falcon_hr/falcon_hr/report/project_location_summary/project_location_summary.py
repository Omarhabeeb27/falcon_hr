import frappe
from frappe import _
from frappe.utils import date_diff, nowdate

from falcon_hr.api.common import norm


def execute(filters=None):
	today = nowdate()
	group_by = (filters or {}).get("group_by") or "Project"
	cols = [
		{"label": _(group_by), "fieldname": "key", "fieldtype": "Data", "width": 260},
		{"label": _("Employees"), "fieldname": "employees", "fieldtype": "Int", "width": 100},
		{"label": _("Branches (Sponsors)"), "fieldname": "branches", "fieldtype": "Int", "width": 140},
		{"label": _("Projects") if group_by == "Location" else _("Locations"), "fieldname": "other", "fieldtype": "Int", "width": 100},
		{"label": _("Iqama Expired"), "fieldname": "iqama_expired", "fieldtype": "Int", "width": 110},
		{"label": _("Iqama ≤60d"), "fieldname": "iqama_soon", "fieldtype": "Int", "width": 100},
		{"label": _("Top Nationality"), "fieldname": "top_nat", "fieldtype": "Data", "width": 160},
	]
	groups = {}
	for e in frappe.get_list("Employee", filters={"status": "Active"}, fields=["branch", "custom_nationality",
			"custom_iqama_expiry_date", "custom_project_assigned_to", "custom_project_location"], limit_page_length=0):
		project, location = norm(e.custom_project_assigned_to), norm(e.custom_project_location, "Not set")
		key, other = (project, location) if group_by == "Project" else (location, project)
		g = groups.setdefault(key, {"employees": 0, "branches": set(), "other": set(), "iqama_expired": 0, "iqama_soon": 0, "nat": {}})
		g["employees"] += 1
		if e.branch:
			g["branches"].add(e.branch)
		g["other"].add(other)
		if e.custom_iqama_expiry_date:
			d = date_diff(e.custom_iqama_expiry_date, today)
			if d < 0:
				g["iqama_expired"] += 1
			elif d <= 60:
				g["iqama_soon"] += 1
		n = e.custom_nationality or "-"
		g["nat"][n] = g["nat"].get(n, 0) + 1
	data = []
	for k, g in sorted(groups.items(), key=lambda x: -x[1]["employees"]):
		nat = max(g["nat"].items(), key=lambda x: x[1]) if g["nat"] else ("", 0)
		data.append({"key": k, "employees": g["employees"], "branches": len(g["branches"]), "other": len(g["other"]),
			"iqama_expired": g["iqama_expired"], "iqama_soon": g["iqama_soon"], "top_nat": f"{nat[0]} ({nat[1]})"})
	chart = {"data": {"labels": [d["key"] for d in data[:12]], "datasets": [{"name": _("Employees"), "values": [d["employees"] for d in data[:12]]}]},
		"type": "bar", "colors": ["#2a78d6"]}
	return cols, data, None, chart
