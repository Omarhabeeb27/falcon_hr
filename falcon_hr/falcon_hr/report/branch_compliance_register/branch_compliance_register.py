import frappe
from frappe import _
from frappe.utils import date_diff, nowdate

from falcon_hr.api.expiry import BRANCH_DOCS


def execute(filters=None):
	filters = filters or {}
	f = {}
	if filters.get("company"):
		f["custom_company"] = filters["company"]
	meta = frappe.get_meta("Branch")
	extra = ["custom_branch_name", "custom_company", "custom_city", "custom_branch_manager_name",
		"custom_branch_phone", "custom_gosi_subestablishment_number"]
	cols = [
		{"label": _("Branch"), "fieldname": "name", "fieldtype": "Link", "options": "Branch", "width": 220},
		{"label": _("Code"), "fieldname": "custom_branch_name", "fieldtype": "Data", "width": 70},
		{"label": _("Company"), "fieldname": "custom_company", "fieldtype": "Data", "width": 170},
		{"label": _("City"), "fieldname": "custom_city", "fieldtype": "Data", "width": 100},
		{"label": _("Manager"), "fieldname": "custom_branch_manager_name", "fieldtype": "Data", "width": 140},
		{"label": _("GOSI Sub-Est. No."), "fieldname": "custom_gosi_subestablishment_number", "fieldtype": "Data", "width": 130},
	]
	fields = ["name"] + [x for x in extra if meta.has_field(x)]
	for label, date_f, num_f in BRANCH_DOCS:
		key = frappe.scrub(label)
		if num_f and meta.has_field(num_f):
			fields.append(num_f)
			cols.append({"label": _("{0} No.").format(_(label)), "fieldname": f"{key}_no", "fieldtype": "Data", "width": 130})
		if meta.has_field(date_f):
			fields.append(date_f)
		cols.append({"label": _("{0} Expiry").format(_(label)), "fieldname": f"{key}_expiry", "fieldtype": "Date", "width": 110})
		cols.append({"label": _("{0} Days Left").format(_(label)), "fieldname": f"{key}_days_left", "fieldtype": "Int", "width": 100})
	cols.append({"label": _("Missing Documents"), "fieldname": "missing", "fieldtype": "Data", "width": 220})

	today = nowdate()
	data = []
	for b in frappe.get_list("Branch", filters=f, fields=fields, order_by="name asc", limit_page_length=0):
		row = {k: b.get(k) for k in ["name"] + extra}
		missing = []
		for label, date_f, num_f in BRANCH_DOCS:
			key = frappe.scrub(label)
			if num_f:
				row[f"{key}_no"] = b.get(num_f)
			d = b.get(date_f)
			row[f"{key}_expiry"] = d
			row[f"{key}_days_left"] = date_diff(d, today) if d else None
			if not d:
				missing.append(label)
		row["missing"] = ", ".join(missing)
		data.append(row)
	return cols, data
