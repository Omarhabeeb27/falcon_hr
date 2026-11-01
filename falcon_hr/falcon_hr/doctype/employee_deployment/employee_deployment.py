import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_days, date_diff, getdate, nowdate


class EmployeeDeployment(Document):
	def validate(self):
		if self.to_date and getdate(self.to_date) < getdate(self.from_date):
			frappe.throw(_("To Date cannot be before From Date"))
		if self.sponsor_branch and frappe.get_meta("Branch").has_field("custom_company"):
			self.sponsor_company = frappe.db.get_value("Branch", self.sponsor_branch, "custom_company")
		end = getdate(self.to_date) if self.to_date else getdate(nowdate())
		self.duration_days = max(date_diff(end, self.from_date) + 1, 0)
		self.status = "Ended" if self.to_date and getdate(self.to_date) < getdate(nowdate()) else "Active"
		self.is_current = 1 if self.status == "Active" else 0
		if self.is_current and not self.flags.ignore_close_previous:
			self.close_previous()
		self.check_overlap()

	def close_previous(self):
		"""One sponsor at a time: starting a new current deployment ends the previous one the day before."""
		for name, from_date in frappe.get_all(
			"Employee Deployment",
			filters={"employee": self.employee, "is_current": 1, "name": ["!=", self.name or ""]},
			fields=["name", "from_date"],
			as_list=True,
		):
			if getdate(from_date) >= getdate(self.from_date):
				frappe.throw(
					_("Employee already has a current deployment {0} starting on or after {1}.").format(
						frappe.bold(name), frappe.format(self.from_date, "Date")
					)
				)
			prev = frappe.get_doc("Employee Deployment", name)
			prev.to_date = add_days(self.from_date, -1)
			prev.flags.ignore_close_previous = True
			prev.save(ignore_permissions=True)

	def check_overlap(self):
		end = self.to_date or "9999-12-31"
		clash = frappe.db.sql(
			"""select name from `tabEmployee Deployment`
			where employee=%s and name!=%s and is_current=0
			and from_date <= %s and ifnull(to_date, '9999-12-31') >= %s limit 1""",
			(self.employee, self.name or "", end, self.from_date),
		)
		if clash:
			frappe.throw(
				_("Dates overlap with deployment {0} of this employee.").format(frappe.bold(clash[0][0]))
			)

	def on_update(self):
		# Only push to the Employee once the deployment has actually started.
		if self.is_current and getdate(self.from_date) <= getdate(nowdate()):
			self.sync_employee()

	def sync_employee(self):
		"""Keep the Employee's branch / project / location in step with the current deployment."""
		meta = frappe.get_meta("Employee")
		values = {"branch": self.sponsor_branch}
		if meta.has_field("custom_project_assigned_to"):
			values["custom_project_assigned_to"] = self.project
		if meta.has_field("custom_project_location"):
			values["custom_project_location"] = self.project_location
		frappe.db.set_value("Employee", self.employee, values, update_modified=False)


@frappe.whitelist()
def get_history(employee):
	frappe.has_permission("Employee", "read", doc=employee, throw=True)
	return frappe.get_list(
		"Employee Deployment",
		filters={"employee": employee},
		fields=[
			"name",
			"sponsor_branch",
			"sponsor_company",
			"project",
			"project_location",
			"from_date",
			"to_date",
			"duration_days",
			"status",
			"reason",
		],
		order_by="from_date desc",
	)


def refresh_durations():
	"""Daily: keep the running duration of current deployments up to date and end those past To Date."""
	for name in frappe.get_all("Employee Deployment", filters={"is_current": 1}, pluck="name"):
		doc = frappe.get_doc("Employee Deployment", name)
		doc.flags.ignore_close_previous = True
		doc.save(ignore_permissions=True)


def seed_from_employees():
	"""Give every employee with a Branch an initial deployment so history starts on day one.
	Idempotent: skips employees that already have any deployment."""
	if not frappe.db.table_exists("Employee Deployment"):
		return 0
	meta = frappe.get_meta("Employee")
	fields = ["name", "branch", "date_of_joining", "relieving_date", "status"]
	for f in ("custom_project_assigned_to", "custom_project_location"):
		if meta.has_field(f):
			fields.append(f)
	have = set(frappe.get_all("Employee Deployment", pluck="employee", distinct=True))
	made = 0
	for e in frappe.get_all("Employee", filters={"branch": ["is", "set"]}, fields=fields):
		if e.name in have:
			continue
		start = e.date_of_joining or nowdate()
		end = e.relieving_date if e.status == "Left" else None
		if end and getdate(end) < getdate(start):
			end = start
		doc = frappe.get_doc(
			{
				"doctype": "Employee Deployment",
				"employee": e.name,
				"sponsor_branch": e.branch,
				"from_date": start,
				"to_date": end,
				"project": e.get("custom_project_assigned_to"),
				"project_location": e.get("custom_project_location"),
				"remarks": "Created automatically from the employee's branch when Falcon HR was installed.",
			}
		)
		doc.flags.ignore_close_previous = True
		doc.insert(ignore_permissions=True)
		made += 1
	return made
