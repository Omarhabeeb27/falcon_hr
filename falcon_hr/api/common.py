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
