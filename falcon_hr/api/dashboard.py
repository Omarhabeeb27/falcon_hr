"""Data for the Falcon HR dashboard page."""

from collections import Counter, defaultdict

import frappe
from frappe.utils import add_months, getdate, nowdate

from falcon_hr.api.common import norm, safe_list
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
def get_dashboard(employee_status="Active", company=None, branch=None, project=None, nationality=None):
	emp_filters = {} if employee_status == "All" else {"status": employee_status}
	if company:
		emp_filters["company"] = company
	if branch:
		emp_filters["branch"] = branch
	if nationality:
		emp_filters["custom_nationality"] = nationality
	emps = safe_list(
		"Employee",
		filters=emp_filters,
		fields=[
			"name",
			"branch",
			"custom_nationality",
			"date_of_joining",
			"gender",
			"custom_project_assigned_to",
			"custom_project_location",
			"custom_iqama_expiry_date",
		],
		limit_page_length=0,
	)
	if project:
		emps = [e for e in emps if norm(e.custom_project_assigned_to) == project]
	all_projects = sorted(
		{
			norm(p)
			for p in safe_list("Employee", filters={"status": "Active"}, pluck="custom_project_assigned_to")
		}
		if frappe.get_meta("Employee").has_field("custom_project_assigned_to")
		else []
	)
	left = frappe.db.count("Employee", {"status": "Left"})
	bf = {}
	if branch:
		bf["name"] = branch
	if company:
		bf["custom_company"] = company
	branches = safe_list("Branch", filters=bf, fields=["name", "custom_company"], limit_page_length=0)

	by_branch = Counter(e.branch or "No branch" for e in emps)
	no_branch = by_branch.pop("No branch", 0)

	nat_counter = Counter(e.custom_nationality or "Not set" for e in emps)

	# joiners per month, last 12 months (includes current month)
	today = getdate(nowdate())
	months = []
	for i in range(11, -1, -1):
		d = add_months(today, -i)
		months.append(d.strftime("%Y-%m"))
	all_emps = safe_list("Employee", fields=["date_of_joining", "relieving_date"], limit_page_length=0)
	joined = Counter(str(e.date_of_joining)[:7] for e in all_emps if e.date_of_joining)
	relieved = Counter(str(e.relieving_date)[:7] for e in all_emps if e.relieving_date)

	expiry = get_expiry_data(
		employee_status=employee_status,
		company=company,
		branch=branch,
		project=project,
		nationality=nationality,
	)
	rows = expiry["rows"]

	doc_health = defaultdict(lambda: {"Expired": 0, "Critical": 0, "Expiring Soon": 0, "Valid": 0})
	for r in rows:
		doc_health[r["document"]][r["status"]] += 1
	order = [d[0] for d in EMPLOYEE_DOCS] + [d[0] for d in BRANCH_DOCS]
	doc_health_list = [
		{
			"document": d,
			"scope": "Employee" if d in dict((x[0], 1) for x in EMPLOYEE_DOCS) else "Branch",
			**doc_health[d],
		}
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

	if project or nationality:
		branch_cards = [c for c in branch_cards if c["headcount"]]

	# projects / locations
	projects = {}
	locations = Counter()
	for e in emps:
		pj = norm(e.custom_project_assigned_to)
		loc = norm(e.custom_project_location, "Not set")
		g = projects.setdefault(
			pj,
			{
				"project": pj,
				"headcount": 0,
				"locations": Counter(),
				"branches": set(),
				"iqama_expired": 0,
				"iqama_soon": 0,
			},
		)
		g["headcount"] += 1
		g["locations"][loc] += 1
		if e.branch:
			g["branches"].add(e.branch)
		if e.custom_iqama_expiry_date:
			dl = (getdate(e.custom_iqama_expiry_date) - today).days
			if dl < 0:
				g["iqama_expired"] += 1
			elif dl <= 60:
				g["iqama_soon"] += 1
		if loc != "Not set":
			locations[loc] += 1
	project_list = sorted(
		[
			{
				**{k: v for k, v in g.items() if k not in ("locations", "branches")},
				"locations": [{"label": k, "value": v} for k, v in g["locations"].most_common(4)],
				"branches": len(g["branches"]),
			}
			for g in projects.values()
		],
		key=lambda x: (x["project"] == "Not assigned", -x["headcount"]),
	)
	unassigned = projects.get("Not assigned", {}).get("headcount", 0)

	return {
		"projects": project_list,
		"locations": _top(locations, 10),
		"employee_status": employee_status,
		"filter_options": {"projects": all_projects},
		"status_counts": expiry["employee_status_counts"],
		"kpi": {
			"active": len(emps),
			"left": left,
			"branches": len(branches),
			"branches_staffed": len(by_branch),
			"no_branch": no_branch,
			"valid_pct": valid_pct,
			"projects": len([p for p in projects if p != "Not assigned"]),
			"unassigned": unassigned,
			**expiry["summary"],
		},
		"headcount": _top(by_branch, TOP_N),
		"nationality": _top(nat_counter, 5),
		"joiners": [{"month": m, "joined": joined.get(m, 0), "left": relieved.get(m, 0)} for m in months],
		"doc_health": doc_health_list,
		"upcoming": upcoming,
		"branches": branch_cards,
	}


@frappe.whitelist()
def search(q):
	"""Global search box on the dashboard: employees (name, ID, Iqama, passport, phone) and branches."""
	q = (q or "").strip()
	if len(q) < 2:
		return {"employees": [], "branches": []}
	like = f"%{q}%"
	meta = frappe.get_meta("Employee")
	or_fields = [
		f
		for f in (
			"employee_name",
			"name",
			"custom_iqama_number",
			"passport_number",
			"cell_number",
			"custom_project_assigned_to",
		)
		if f == "name" or meta.has_field(f)
	]
	employees = safe_list(
		"Employee",
		or_filters={f: ["like", like] for f in or_fields},
		fields=[
			"name",
			"employee_name",
			"status",
			"branch",
			"designation",
			"custom_project_assigned_to",
			"custom_iqama_number",
		],
		limit_page_length=8,
		order_by="status asc, employee_name asc",
	)
	branches = safe_list(
		"Branch",
		or_filters={
			"name": ["like", like],
			**(
				{"custom_branch_name": ["like", like]}
				if frappe.get_meta("Branch").has_field("custom_branch_name")
				else {}
			),
		},
		fields=["name", "custom_company"],
		limit_page_length=5,
	)
	return {"employees": employees, "branches": branches}
