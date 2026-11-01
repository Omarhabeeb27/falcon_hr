import frappe
from frappe import _

from falcon_hr.api.expiry import get_expiry_data


def execute(filters=None):
	filters = filters or {}
	res = get_expiry_data(
		scope=filters.get("scope") or "All",
		document=filters.get("document"),
		branch=filters.get("branch"),
		status=filters.get("status"),
	)
	cols = [
		{"label": _("Type"), "fieldname": "scope", "fieldtype": "Data", "width": 90},
		{"label": _("Document"), "fieldname": "document", "fieldtype": "Data", "width": 170},
		{
			"label": _("Employee / Branch ID"),
			"fieldname": "name",
			"fieldtype": "Dynamic Link",
			"options": "doctype",
			"width": 160,
		},
		{"label": _("Name"), "fieldname": "party", "fieldtype": "Data", "width": 200},
		{"label": _("Number"), "fieldname": "number", "fieldtype": "Data", "width": 130},
		{"label": _("Branch"), "fieldname": "branch", "fieldtype": "Data", "width": 190},
		{"label": _("Company"), "fieldname": "company", "fieldtype": "Data", "width": 170},
		{"label": _("Project"), "fieldname": "project", "fieldtype": "Data", "width": 140},
		{"label": _("Expiry Date"), "fieldname": "expiry_date", "fieldtype": "Date", "width": 110},
		{"label": _("Days Left"), "fieldname": "days_left", "fieldtype": "Int", "width": 90},
		{"label": _("Status"), "fieldname": "status", "fieldtype": "Data", "width": 120},
		{"label": "doctype", "fieldname": "doctype", "fieldtype": "Data", "hidden": 1},
	]
	return (
		cols,
		res["rows"],
		None,
		None,
		[
			{
				"value": res["summary"]["Expired"],
				"label": _("Expired"),
				"indicator": "Red",
				"datatype": "Int",
			},
			{
				"value": res["summary"]["Critical"],
				"label": _("Within 30 days"),
				"indicator": "Orange",
				"datatype": "Int",
			},
			{
				"value": res["summary"]["Expiring Soon"],
				"label": _("31-60 days"),
				"indicator": "Yellow",
				"datatype": "Int",
			},
			{"value": res["summary"]["Valid"], "label": _("Valid"), "indicator": "Green", "datatype": "Int"},
		],
	)
