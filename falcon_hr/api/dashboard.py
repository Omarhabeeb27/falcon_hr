"""Data for the Falcon HR dashboard page."""

from collections import Counter, defaultdict

import frappe
from frappe.utils import add_months, getdate, nowdate

from falcon_hr.api.expiry import BRANCH_DOCS, EMPLOYEE_DOCS, get_expiry_data

TOP_N = 8


def _top(counter, n, other_label="Other"):
	items = counter.most_common()
	top = items[:n]
	rest = sum(v for _, v in items[n:])
	if rest:
		top.append((other_label, rest))
	return [{"label": k, "value": v} for k, v in top]


@frappe.whitelist()
def get_dashboard():
	emps = frappe.get_list(
		"Employee",
		filters={"status": "Active"},
		fields=["name", "branch", "custom_nationality", "date_of_joining", "gender"],
		limit_page_length=0,
	)
	left = frappe.db.count("Employee", {"status": "Left"})
	branches = frappe.get_list("Branch", fields=["name", "custom_company"], limit_page_length=0)

	by_branch = Counter(e.branch or "No branch" for e in emps)
	no_branch = by_branch.pop("No branch", 0)

	nationality = Counter(e.custom_nationality or "Not set" for e in emps)

	# joiners per month, last 12 months (includes current month)
	today = getdate(nowdate())
	months = []
	for i in range(11, -1, -1):
		d = add_months(today, -i)
		months.append(d.strftime("%Y-%m"))
	all_emps = frappe.get_list(
		"Employee", fields=["date_of_joining", "relieving_date"], limit_page_length=0
	)
	joined = Counter(str(e.date_of_joining)[:7] for e in all_emps if e.date_of_joining)
	relieved = Counter(str(e.relieving_date)[:7] for e in all_emps if e.relieving_date)

	expiry = get_expiry_data()
	rows = expiry["rows"]

	doc_health = defaultdict(lambda: {"Expired": 0, "Critical": 0, "Expiring Soon": 0, "Valid": 0})
	for r in rows:
		doc_health[r["document"]][r["status"]] += 1
	order = [d[0] for d in EMPLOYEE_DOCS] + [d[0] for d in BRANCH_DOCS]
	doc_health_list = [
		{"document": d, "scope": "Employee" if d in dict((x[0], 1) for x in EMPLOYEE_DOCS) else "Branch", **doc_health[d]}
		for d in order
		if d in doc_health
	]

	total_docs = len(rows) or 1
	valid_pct = round(100 * expiry["summary"]["Valid"] / total_docs)

	upcoming = [r for r in rows if 0 <= r["days_left"] <= 60][:9]

	# per-branch cards
	iqama_by_branch = defaultdict(lambda: {"expired": 0, "soon": 0})
	branch_docs = defaultdict(dict)
	for r in rows:
		if r["scope"] == "Employee" and r["document"] == "Iqama" and r["branch"]:
			if r["status"] == "Expired":
				iqama_by_branch[r["branch"]]["expired"] += 1
			elif r["status"] in ("Critical", "Expiring Soon"):
				iqama_by_branch[r["branch"]]["soon"] += 1
		if r["scope"] == "Branch":
			branch_docs[r["name"]][r["document"]] = r["days_left"]

	branch_cards = sorted(
		[
			{
				"name": b.name,
				"company": b.custom_company or "",
				"headcount": by_branch.get(b.name, 0),
				"iqama_expired": iqama_by_branch[b.name]["expired"],
				"iqama_soon": iqama_by_branch[b.name]["soon"],
				"docs": branch_docs.get(b.name, {}),
			}
			for b in branches
		],
		key=lambda c: -c["headcount"],
	)

	return {
		"kpi": {
			"active": len(emps),
			"left": left,
			"branches": len(branches),
			"branches_staffed": len(by_branch),
			"no_branch": no_branch,
			"valid_pct": valid_pct,
			**expiry["summary"],
		},
		"headcount": _top(by_branch, TOP_N),
		"nationality": _top(nationality, 5),
		"joiners": [{"month": m, "joined": joined.get(m, 0), "left": relieved.get(m, 0)} for m in months],
		"doc_health": doc_health_list,
		"upcoming": upcoming,
		"branches": branch_cards,
	}
