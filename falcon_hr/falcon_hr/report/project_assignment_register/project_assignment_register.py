import frappe
from frappe import _

from falcon_hr.api.common import norm


def execute(filters=None):
	filters = filters or {}
	f = {"status": "Active"}
	if filters.get("branch"):
		f["branch"] = filters["branch"]
	cols = [
		{"label": _("Project"), "fieldname": "project", "fieldtype": "Data", "width": 220},
		{"label": _("Project Location"), "fieldname": "location", "fieldtype": "Data", "width": 170},
		{"label": _("Employee"), "fieldname": "name", "fieldtype": "Link", "options": "Employee", "width": 130},
		{"label": _("Name"), "fieldname": "employee_name", "fieldtype": "Data", "width": 200},
		{"label": _("Designation"), "fieldname": "designation", "fieldtype": "Data", "width": 150},
		{"label": _("Branch (Sponsor)"), "fieldname": "branch", "fieldtype": "Link", "options": "Branch", "width": 210},
		{"label": _("Nationality"), "fieldname": "custom_nationality", "fieldtype": "Data", "width": 110},
		{"label": _("Iqama Expiry"), "fieldname": "custom_iqama_expiry_date", "fieldtype": "Date", "width": 110},
		{"label": _("Remarks"), "fieldname": "remarks", "fieldtype": "Data", "width": 200},
	]
	rows = []
	for e in frappe.get_list("Employee", filters=f, fields=["name", "employee_name", "designation", "branch",
			"custom_nationality", "custom_iqama_expiry_date", "custom_project_assigned_to",
			"custom_project_location", "custom_project_assigned_to_remarks"], limit_page_length=0):
		r = dict(e)
		r["project"] = norm(e.custom_project_assigned_to)
		r["location"] = norm(e.custom_project_location, "Not set")
		r["remarks"] = e.custom_project_assigned_to_remarks
		rows.append(r)
	if filters.get("project"):
		q = filters["project"].upper()
		rows = [r for r in rows if q in r["project"]]
	if filters.get("location"):
		q = filters["location"].upper()
		rows = [r for r in rows if q in r["location"]]
	rows.sort(key=lambda r: (r["project"] == "NOT ASSIGNED" or r["project"] == "Not assigned", r["project"], r["employee_name"] or ""))
	counts = {}
	for r in rows:
		counts[r["project"]] = counts.get(r["project"], 0) + 1
	top = sorted(counts.items(), key=lambda x: -x[1])[:12]
	chart = {"data": {"labels": [t[0] for t in top], "datasets": [{"name": _("Employees"), "values": [t[1] for t in top]}]},
		"type": "bar", "colors": ["#2a78d6"]}
	return cols, rows, None, chart
