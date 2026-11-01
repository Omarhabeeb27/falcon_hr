import frappe
from frappe import _
from frappe.utils import date_diff, nowdate

from falcon_hr.api.common import norm, safe_list
from falcon_hr.api.expiry import EMPLOYEE_DOCS


def execute(filters=None):
	filters = filters or {}
	f = {"status": filters.get("status") or "Active"}
	for k in ("branch", "company", "designation"):
		if filters.get(k):
			f[k] = filters[k]

	meta = frappe.get_meta("Employee")
	cols = [
		{
			"label": _("Employee"),
			"fieldname": "name",
			"fieldtype": "Link",
			"options": "Employee",
			"width": 130,
		},
		{"label": _("Name"), "fieldname": "employee_name", "fieldtype": "Data", "width": 190},
		{"label": _("Designation"), "fieldname": "designation", "fieldtype": "Data", "width": 140},
		{"label": _("Nationality"), "fieldname": "custom_nationality", "fieldtype": "Data", "width": 110},
		{
			"label": _("Branch (Sponsor)"),
			"fieldname": "branch",
			"fieldtype": "Link",
			"options": "Branch",
			"width": 200,
		},
		{"label": _("Company"), "fieldname": "company", "fieldtype": "Data", "width": 170},
		{"label": _("Project"), "fieldname": "project", "fieldtype": "Data", "width": 150},
		{"label": _("Project Location"), "fieldname": "location", "fieldtype": "Data", "width": 150},
	]
	fields = [
		"name",
		"employee_name",
		"designation",
		"custom_nationality",
		"branch",
		"company",
		"custom_project_assigned_to",
		"custom_project_location",
	]
	for label, date_f, num_f in EMPLOYEE_DOCS:
		key = frappe.scrub(label)
		if num_f and meta.has_field(num_f):
			fields.append(num_f)
			cols.append(
				{
					"label": _("{0} No.").format(_(label)),
					"fieldname": f"{key}_no",
					"fieldtype": "Data",
					"width": 130,
				}
			)
		fields.append(date_f)
		cols.append(
			{
				"label": _("{0} Expiry").format(_(label)),
				"fieldname": f"{key}_expiry",
				"fieldtype": "Date",
				"width": 110,
			}
		)
		cols.append(
			{
				"label": _("{0} Days Left").format(_(label)),
				"fieldname": f"{key}_days_left",
				"fieldtype": "Int",
				"width": 100,
			}
		)

	today = nowdate()
	data = []
	only = filters.get("document_state")
	for e in safe_list(
		"Employee", filters=f, fields=fields, order_by="employee_name asc", limit_page_length=0
	):
		row = {
			k: e.get(k)
			for k in ("name", "employee_name", "designation", "custom_nationality", "branch", "company")
		}
		row["project"] = norm(e.custom_project_assigned_to)
		row["location"] = norm(e.custom_project_location, "Not set")
		worst = None
		for label, date_f, num_f in EMPLOYEE_DOCS:
			key = frappe.scrub(label)
			if num_f:
				row[f"{key}_no"] = e.get(num_f)
			d = e.get(date_f)
			row[f"{key}_expiry"] = d
			row[f"{key}_days_left"] = date_diff(d, today) if d else None
			if d is not None:
				worst = row[f"{key}_days_left"] if worst is None else min(worst, row[f"{key}_days_left"])
		if only == "Has expired document" and not (worst is not None and worst < 0):
			continue
		if only == "Expiring in 60 days" and not (worst is not None and 0 <= worst <= 60):
			continue
		data.append(row)
	return cols, data
