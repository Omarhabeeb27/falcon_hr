"""Daily document-expiry alerts into the Frappe notification centre (bell icon)."""

import frappe
from frappe import _
from frappe.utils import nowdate

from falcon_hr.api.expiry import get_expiry_data

# days-left values that trigger an alert; negative = days overdue
THRESHOLDS = {60, 30, 15, 7, 3, 1, 0, -1}
OVERDUE_REPEAT = 30  # remind again every N days while expired
ROLES = ("HR Manager", "HR User")


def _recipients():
	users = frappe.get_all(
		"Has Role",
		filters={"role": ["in", ROLES], "parenttype": "User"},
		pluck="parent",
		distinct=True,
	)
	return [
		u
		for u in users
		if u not in ("Administrator", "Guest")
		and frappe.db.get_value("User", u, ["enabled", "user_type"], as_dict=True)
		in (frappe._dict(enabled=1, user_type="System User"),)
	] or ["Administrator"]


def _due(days_left):
	return days_left in THRESHOLDS or (days_left < -1 and abs(days_left) % OVERDUE_REPEAT == 0)


def _subject(r):
	tag = _("Employee Document") if r["scope"] == "Employee" else _("Company Document")
	if r["days_left"] < 0:
		when = _("expired {0} days ago").format(abs(r["days_left"]))
	elif r["days_left"] == 0:
		when = _("expires TODAY")
	else:
		when = _("expires in {0} days").format(r["days_left"])
	who = r["party"] if r["scope"] == "Employee" else _("Branch {0}").format(r["party"])
	return f"[{tag}] {_(r['document'])} · {who} · {when}"


def _already_sent(user, subject):
	return frappe.db.exists(
		"Notification Log", {"for_user": user, "subject": subject, "creation": [">=", nowdate()]}
	)


def _can_read(user, doctype, name, cache):
	key = (user, doctype, name)
	if key not in cache:
		cache[key] = bool(frappe.has_permission(doctype, "read", doc=name, user=user))
	return cache[key]


def send_daily_alerts():
	rows = [r for r in get_expiry_data()["rows"] if _due(r["days_left"])]
	if not rows:
		return 0
	users = _recipients()
	perm_cache = {}
	sent = 0
	for r in rows:
		subject = _subject(r)
		# No identity-document numbers in the alert body: it links to the record,
		# which enforces the reader's own permissions.
		body = (
			f"<p><b>{frappe.utils.escape_html(_(r['document']))}</b> — {frappe.utils.escape_html(r['party'])}</p>"
			f"<p>{_('Expiry Date')}: {r['expiry_date']}<br>"
			f"{_('Branch')}: {frappe.utils.escape_html(r['branch'] or '-')}</p>"
		)
		for user in users:
			# Only alert users who may read this employee / branch (respects User Permissions).
			if not _can_read(user, r["doctype"], r["name"], perm_cache):
				continue
			if _already_sent(user, subject):
				continue
			frappe.get_doc(
				{
					"doctype": "Notification Log",
					"subject": subject,
					"for_user": user,
					"type": "Alert",
					"document_type": r["doctype"],
					"document_name": r["name"],
					"email_content": body,
					"from_user": "Administrator",
				}
			).insert(ignore_permissions=True)
			sent += 1
	frappe.db.commit()
	return sent


@frappe.whitelist()
def send_alerts_now():
	frappe.only_for(("HR Manager", "System Manager"))
	return send_daily_alerts()
