import frappe

EMPTY = {"", "-", "--", "na", "n/a", "none", "nil", "null", "0"}


def norm(value, empty_label="Not assigned"):
	"""Normalise free-text project / location values so reports group them cleanly."""
	v = " ".join((value or "").split())
	if v.lower() in EMPTY:
		return empty_label
	return v.upper()


def is_saudi(emp):
	return (emp.get("custom_employee_category") or "") == "Saudi" or (
		(emp.get("custom_nationality") or "").lower() in ("saudi arabia", "saudi")
	)


def safe_list(doctype, filters=None, fields=None, **kwargs):
	"""frappe.get_list that tolerates sites missing some custom fields.

	Falcon's Employee/Branch custom fields live in the site database, not in this
	app, so a fresh/staging site may not have them. Unknown fields are dropped from
	`fields` and `filters`; rows simply return None for them.
	"""
	meta = frappe.get_meta(doctype)
	std = {"name", "owner", "creation", "modified", "modified_by", "docstatus", "idx"}

	def ok(f):
		base = f.split(" as ")[0].strip()
		return base in std or meta.has_field(base)

	if fields:
		fields = [f for f in fields if ok(f)] or ["name"]
	if isinstance(filters, dict):
		filters = {k: v for k, v in filters.items() if ok(k)}
	if isinstance(kwargs.get("or_filters"), dict):
		kwargs["or_filters"] = {k: v for k, v in kwargs["or_filters"].items() if ok(k)}
	kwargs.setdefault("limit_page_length", 0)
	return frappe.get_list(doctype, filters=filters, fields=fields, **kwargs)
