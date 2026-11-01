import frappe


def after_migrate():
	"""Idempotent post-migrate fixes."""
	fix_branch_field_order()
	set_employee_search_fields()
	# Frappe marks all patches "done" on a fresh install, so run this idempotent fix here too.
	from falcon_hr.patches.v1_0.fix_duration_client_script import execute as fix_duration_script

	fix_duration_script()


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
