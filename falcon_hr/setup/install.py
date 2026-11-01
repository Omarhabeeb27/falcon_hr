import frappe


def after_install():
	# On a fresh install Frappe runs after_install *before* syncing fixtures, so load
	# our fixtures (Qiwa/Muqeem fields, Company Doc notifications) first, then fix up.
	from frappe.utils.fixtures import sync_fixtures

	sync_fixtures("falcon_hr")
	after_migrate()


def after_migrate():
	"""Idempotent post-migrate fixes."""
	fix_branch_field_order()
	set_employee_search_fields()
	# Frappe marks all patches "done" on a fresh install, so run this idempotent fix here too.
	from falcon_hr.patches.v1_0.fix_duration_client_script import execute as fix_duration_script

	fix_duration_script()
	ensure_leaver_template()
	rename_accommodation_module()
	from falcon_hr.falcon_hr.doctype.employee_deployment.employee_deployment import seed_from_employees

	seed_from_employees()


def fix_branch_field_order():
	# Keep the Qiwa/Muqeem section directly before the bank section on the Branch form.
	bank = "Branch-custom_branch_bank_details"
	if frappe.db.exists("Custom Field", bank) and frappe.db.exists(
		"Custom Field", "Branch-custom_muqeem_expiry_date"
	):
		if frappe.db.get_value("Custom Field", bank, "insert_after") != "custom_muqeem_expiry_date":
			frappe.db.set_value("Custom Field", bank, "insert_after", "custom_muqeem_expiry_date")
			frappe.clear_cache(doctype="Branch")


def set_employee_search_fields():
	# Employee link-search dropdowns show these values, so company/branch appear while searching.
	from frappe.custom.doctype.property_setter.property_setter import make_property_setter

	make_property_setter(
		"Employee",
		None,
		"search_fields",
		"employee_name,branch,company,designation",
		"Data",
		for_doctype=True,
	)


LEAVER_TEMPLATE = "Falcon Leaver Checklist"
LEAVER_ACTIVITIES = [
	# (activity, begin_on day, duration days)
	("Confirm last working day and relieving date", 0, 1),
	("Exit interview", 0, 2),
	("Collect company assets (ID card, tools, laptop, phone, SIM)", 0, 3),
	("Hand over accommodation and keys", 0, 3),
	("Clear advances, loans and pending expenses", 0, 5),
	("Calculate final settlement and end-of-service benefits", 1, 5),
	("Terminate Qiwa contract", 1, 3),
	("Issue final exit visa / transfer sponsorship (Muqeem)", 1, 5),
	("Cancel medical insurance", 2, 3),
	("Deregister from GOSI", 2, 3),
	("Return passport and documents to the employee", 3, 2),
	("Remove system and building access", 3, 1),
	("Pay final settlement and get signed clearance", 5, 5),
]


def ensure_leaver_template():
	"""Create the HRMS Employee Separation Template used for the leaver checklist (once)."""
	if not frappe.db.exists("DocType", "Employee Separation Template"):
		return
	if frappe.db.exists("Employee Separation Template", {"title": LEAVER_TEMPLATE}):
		return
	frappe.get_doc(
		{
			"doctype": "Employee Separation Template",
			"title": LEAVER_TEMPLATE,
			"activities": [
				{"activity_name": a, "role": "HR User", "begin_on": b, "duration": d}
				for a, b, d in LEAVER_ACTIVITIES
			],
		}
	).insert(ignore_permissions=True)


ACCOMMODATION_MODULE = "Falcons Accommodation"


def rename_accommodation_module():
	"""The site's custom "Accommodation" doctype lived in a custom module called "build", which
	clashes with Frappe 16.54's own "Build" module (Frappe renames it to "build (Custom)").
	Give it a proper home: rename that custom module to "Falcons Accommodation".
	Idempotent; only ever touches a *custom* module, never Frappe's own."""
	if frappe.db.exists("Module Def", ACCOMMODATION_MODULE):
		return
	from frappe.model.rename_doc import rename_doc

	for old in ("build (Custom)", "build"):
		row = frappe.db.get_value("Module Def", old, ["name", "custom"], as_dict=True)
		if row and row.custom:
			rename_doc(
				doctype="Module Def",
				old=row.name,
				new=ACCOMMODATION_MODULE,
				force=True,
				ignore_permissions=True,
				show_alert=False,
			)
			return
