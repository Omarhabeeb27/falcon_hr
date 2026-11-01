"""The site's "Duration Days - employee" client script re-wrote every duration on
form refresh, so every Employee opened as "Not Saved". Make it write only when the
value really changes. Idempotent; skips silently if the script is absent or edited."""

import re

import frappe

NAME = "Duration Days - employee"
NEW_FN = """function calculate_duration(frm, start_field, end_field, target_field) {
    let start = frm.doc[start_field];
    let end = frm.doc[end_field];
    let days = (start && end) ? frappe.datetime.get_diff(end, start) : null;
    // falcon_hr: only write when it actually changes, so opening a form never marks it "Not Saved"
    if ((cint(frm.doc[target_field]) || 0) !== (days || 0)) {
        frm.set_value(target_field, days);
    }
}"""


def execute():
	if not frappe.db.exists("Client Script", NAME):
		return
	script = frappe.db.get_value("Client Script", NAME, "script") or ""
	if "falcon_hr: only write when it actually changes" in script:
		return
	pattern = re.compile(
		r"function calculate_duration\(frm, start_field, end_field, target_field\) \{.*?\n\}", re.S
	)
	if not pattern.search(script):
		return
	frappe.db.set_value("Client Script", NAME, "script", pattern.sub(lambda _m: NEW_FN, script, count=1))
