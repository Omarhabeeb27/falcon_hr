"""Monthly management PDF: headcount, movements, document compliance, Nitaqat, attendance, projects."""

from collections import Counter

import frappe
from frappe import _
from frappe.utils import add_months, flt, get_first_day, get_last_day, getdate, nowdate
from frappe.utils.pdf import get_pdf

from falcon_hr.api.common import norm, safe_list
from falcon_hr.api.expiry import get_expiry_data
from falcon_hr.api.nitaqat import get_nitaqat


def build_context(month=None, company=None):
	month = month or nowdate()[:7]
	start = get_first_day(f"{month}-01")
	end = get_last_day(start)
	ef = {"company": company} if company else {}

	emps = safe_list(
		"Employee",
		filters=ef,
		fields=[
			"name",
			"employee_name",
			"status",
			"branch",
			"designation",
			"date_of_joining",
			"relieving_date",
			"custom_project_assigned_to",
		],
	)
	active = [e for e in emps if e.status == "Active"]
	joined = [e for e in emps if e.date_of_joining and start <= getdate(e.date_of_joining) <= end]
	left = [e for e in emps if e.relieving_date and start <= getdate(e.relieving_date) <= end]

	sep = {}
	if frappe.db.exists("DocType", "Employee Separation"):
		for s in frappe.get_list(
			"Employee Separation",
			filters={"employee": ["in", [e.name for e in left] or [""]]},
			fields=["employee", "name", "boarding_status", "docstatus"],
		):
			sep[s.employee] = s

	exp = get_expiry_data(company=company)
	critical = [r for r in exp["rows"] if 0 <= r["days_left"] <= 30][:25]
	company_docs = [r for r in exp["rows"] if r["scope"] == "Branch" and r["days_left"] <= 60]

	att = Counter()
	att_people = set()
	af = {"attendance_date": ["between", [start, end]], "docstatus": 1}
	if company:
		af["company"] = company
	for a in frappe.get_list("Attendance", filters=af, fields=["employee", "status"], limit_page_length=0):
		att[a.status] += 1
		att_people.add(a.employee)

	branches = Counter(e.branch or _("(No branch set)") for e in active).most_common(15)
	projects = Counter(norm(e.custom_project_assigned_to) for e in active).most_common(12)

	moves = []
	if frappe.db.table_exists("Employee Deployment"):
		moves = frappe.get_list(
			"Employee Deployment",
			filters={"from_date": ["between", [start, end]], **({"company": company} if company else {})},
			fields=["employee_name", "sponsor_branch", "project", "from_date", "reason"],
			order_by="from_date asc",
			limit_page_length=50,
		)

	nq = get_nitaqat(company=company)
	return {
		"month_label": start.strftime("%B %Y"),
		"company": company or _("All companies"),
		"generated": frappe.utils.format_datetime(frappe.utils.now_datetime()),
		"kpi": {
			"active": len(active),
			"joined": len(joined),
			"left": len(left),
			"branches": len({e.branch for e in active if e.branch}),
			"no_branch": sum(1 for e in active if not e.branch),
		},
		"expiry": exp["summary"],
		"critical": critical,
		"company_docs": company_docs,
		"joined_list": joined[:30],
		"left_list": left[:30],
		"separations": sep,
		"attendance": dict(att),
		"attendance_people": len(att_people),
		"branches": branches,
		"projects": projects,
		"moves": moves,
		"nitaqat": nq["summary"],
		"nitaqat_below": [r for r in nq["rows"] if r["state"] == "Below target"][:20],
		"flt": flt,
		"rtl": frappe.local.lang in ("ar", "fa", "he", "ur"),
	}


@frappe.whitelist()
def download(month=None, company=None):
	if not set(frappe.get_roles()) & {"HR User", "HR Manager", "System Manager"}:
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	ctx = build_context(month, company or None)
	html = frappe.render_template("falcon_hr/templates/monthly_report.html", ctx)
	frappe.local.response.filename = f"Falcon-HR-Monthly-Report-{month or nowdate()[:7]}.pdf"
	frappe.local.response.filecontent = get_pdf(
		html,
		{
			"page-size": "A4",
			"margin-top": "12mm",
			"margin-bottom": "12mm",
			"margin-left": "10mm",
			"margin-right": "10mm",
		},
	)
	frappe.local.response.type = "pdf"
