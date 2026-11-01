frappe.ui.form.on("Employee Deployment", {
	employee(frm) {
		if (frm.is_new() && frm.doc.employee && !frm.doc.from_date) frm.set_value("from_date", frappe.datetime.get_today());
	},
	refresh(frm) {
		if (frm.doc.employee && !frm.is_new()) {
			frm.add_custom_button(__("Employee"), () => frappe.set_route("Form", "Employee", frm.doc.employee), __("View"));
		}
		frm.set_intro(frm.doc.is_current ? __("This is the employee's current sponsor and deployment. Saving it updates Branch and Project on the Employee.") : "");
	},
});
