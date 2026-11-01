"""Leaver checklist: an HRMS Employee Separation built from the Falcon Leaver Checklist template."""

import frappe
from frappe import _
from frappe.utils import nowdate

from falcon_hr.setup.install import LEAVER_TEMPLATE, ensure_leaver_template


def _open_separation(employee):
	return frappe.db.get_value("Employee Separation", {"employee": employee, "docstatus": ["<", 2]}, "name")


def create_separation(employee, notify=True):
	existing = _open_separation(employee)
	if existing:
		return existing
	ensure_leaver_template()
	template = frappe.db.get_value("Employee Separation Template", {"title": LEAVER_TEMPLATE}, "name")
	emp = frappe.get_doc("Employee", employee)
	doc = frappe.new_doc("Employee Separation")
	doc.update(
		{
			"employee": emp.name,
			"employee_name": emp.employee_name,
			"company": emp.company,
			"department": emp.department,
			"designation": emp.designation,
			"boarding_begins_on": emp.relieving_date or nowdate(),
			"resignation_letter_date": emp.get("resignation_letter_date"),
			"employee_separation_template": template,
		}
	)
	if template:
		for a in frappe.get_doc("Employee Separation Template", template).activities:
			doc.append(
				"activities",
				{
					"activity_name": a.activity_name,
					"role": a.role,
					"user": a.user,
					"begin_on": a.begin_on,
					"duration": a.duration,
				},
			)
	doc.insert(ignore_permissions=True)
	if notify:
		frappe.msgprint(
			_("Leaver checklist {0} created. Review it and click Submit to create the tasks.").format(
				frappe.utils.get_link_to_form("Employee Separation", doc.name)
			),
			alert=True,
		)
	return doc.name


def on_employee_update(doc, method=None):
	"""When an employee is set to Left, prepare a draft leaver checklist (once)."""
	if doc.status == "Left" and doc.has_value_changed("status"):
		create_separation(doc.name)


@frappe.whitelist()
def start_leaver_checklist(employee):
	frappe.has_permission("Employee Separation", "create", throw=True)
	return create_separation(employee, notify=False)


@frappe.whitelist()
def get_leaver_status(employee):
	frappe.has_permission("Employee", "read", doc=employee, throw=True)
	name = _open_separation(employee)
	if not name:
		return None
	d = frappe.db.get_value(
		"Employee Separation", name, ["name", "docstatus", "boarding_status"], as_dict=True
	)
	return d
