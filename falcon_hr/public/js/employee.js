// Show "days remaining" under every document expiry date on the Employee form.
const FALCON_EMP_EXPIRY = [
	["custom_iqama_expiry_date", "Iqama"],
	["custom_visa_end_date", "Visa"],
	["valid_upto", "Passport"],
	["custom_qiwa_contract_end_date", "Qiwa Contract"],
	["custom_insurance_expiry_date", "Medical Insurance"],
	["custom_gosi_end_date", "GOSI"],
	["custom_driving_license_expiry_date", "Driving License"],
];

function falcon_expiry_html(date) {
	if (!date) return "";
	const d = frappe.datetime.get_diff(date, frappe.datetime.get_today());
	let color = "#16a34a", text = __("{0} days remaining", [d]);
	if (d < 0) { color = "#dc2626"; text = __("EXPIRED {0} days ago", [Math.abs(d)]); }
	else if (d <= 30) { color = "#ea580c"; text = __("{0} days remaining - renew now", [d]); }
	else if (d <= 60) { color = "#ca8a04"; }
	return `<b style="color:${color}">${text}</b>`;
}

function falcon_set_expiry_descriptions(frm) {
	FALCON_EMP_EXPIRY.forEach(([field]) => {
		if (frm.fields_dict[field]) {
			frm.set_df_property(field, "description", falcon_expiry_html(frm.doc[field]));
		}
	});
}

function falcon_deployment_history(frm) {
	frappe.call({
		method: "falcon_hr.falcon_hr.doctype.employee_deployment.employee_deployment.get_history",
		args: { employee: frm.doc.name },
	}).then((r) => {
		const rows = r.message || [];
		const esc = (v) => frappe.utils.escape_html(v == null ? "" : String(v));
		const fmt = (d) => (d ? frappe.datetime.str_to_user(d) : "");
		const body = rows.length
			? rows.map((d) => `<tr style="cursor:pointer" data-dep="${esc(d.name)}">
				<td><span class="indicator-pill ${d.status === "Active" ? "green" : "gray"}">${esc(__(d.status))}</span></td>
				<td><b>${esc(d.sponsor_branch)}</b><div class="text-muted small">${esc(d.sponsor_company || "")}</div></td>
				<td>${esc(d.project || "—")}<div class="text-muted small">${esc(d.project_location || "")}</div></td>
				<td>${fmt(d.from_date)} → ${d.to_date ? fmt(d.to_date) : __("now")}</td>
				<td style="text-align:right"><b>${d.duration_days || 0}</b> ${__("days")}</td></tr>`).join("")
			: `<tr><td colspan="5" class="text-muted">${__("No deployment history yet. Click New Deployment to record the current sponsor.")}</td></tr>`;
		const html = `<div class="falcon-dep" style="width:100%">
			<table class="table table-sm" style="margin:0;font-size:12.5px"><thead><tr>
			<th>${__("Status")}</th><th>${__("Sponsor (Branch)")}</th><th>${__("Project / Location")}</th><th>${__("Period")}</th><th style="text-align:right">${__("Duration")}</th>
			</tr></thead><tbody>${body}</tbody></table></div>`;
		// Show it on the first tab, right after the section holding Branch (the form dashboard
		// lives on the Connections tab in v16, where nobody would look for it).
		frm.layout.wrapper.find(".falcon-dep-section").remove();
		const $anchor = frm.fields_dict.branch ? frm.fields_dict.branch.$wrapper.closest(".form-section") : null;
		const $sec = $(`<div class="row form-section card-section visible-section falcon-dep-section">
			<div class="section-head" style="display:flex;justify-content:space-between;align-items:center">${__("Sponsor & Deployment History")}
				<button class="btn btn-xs btn-default falcon-dep-new">${__("New Deployment")}</button></div>
			<div class="section-body" style="display:block;overflow-x:auto">${html}</div></div>`);
		if ($anchor && $anchor.length) $sec.insertAfter($anchor);
		else frm.layout.wrapper.find(".form-page").first().append($sec);
		$sec.find("[data-dep]").on("click", (e) => frappe.set_route("Form", "Employee Deployment", $(e.currentTarget).data("dep")));
		$sec.find(".falcon-dep-new").on("click", () => falcon_new_deployment(frm));
	});
}

function falcon_new_deployment(frm) {
	frappe.new_doc("Employee Deployment", {
		employee: frm.doc.name,
		sponsor_branch: frm.doc.branch,
		project: frm.doc.custom_project_assigned_to,
		project_location: frm.doc.custom_project_location,
		from_date: frappe.datetime.get_today(),
	});
}

function falcon_leaver_button(frm) {
	if (frm.doc.status !== "Left") return;
	frappe.call({ method: "falcon_hr.api.leaver.get_leaver_status", args: { employee: frm.doc.name } }).then((r) => {
		const s = r.message;
		if (s) {
			frm.add_custom_button(__("Leaver Checklist"), () => frappe.set_route("Form", "Employee Separation", s.name));
			frm.dashboard.set_headline_alert(
				`${__("Leaver checklist")}: <a href="/app/employee-separation/${encodeURIComponent(s.name)}">${frappe.utils.escape_html(s.name)}</a> · ${frappe.utils.escape_html(__(s.boarding_status || (s.docstatus ? "In Process" : "Draft")))}`,
				s.boarding_status === "Completed" ? "green" : "orange"
			);
		} else {
			frm.add_custom_button(__("Start Leaver Checklist"), () =>
				frappe.call({ method: "falcon_hr.api.leaver.start_leaver_checklist", args: { employee: frm.doc.name } })
					.then((x) => frappe.set_route("Form", "Employee Separation", x.message))
			);
		}
	});
}

frappe.ui.form.on("Employee", {
	refresh(frm) {
		falcon_set_expiry_descriptions(frm);
		if (!frm.is_new()) {
			frm.add_custom_button(__("Expiry Center"), () => frappe.set_route("expiry-center"), __("View"));
			frm.add_custom_button(__("Deployment History"), () => frappe.set_route("List", "Employee Deployment", { employee: frm.doc.name }), __("View"));
			frm.add_custom_button(__("New Deployment"), () => falcon_new_deployment(frm), __("Create"));
			falcon_deployment_history(frm);
			falcon_leaver_button(frm);
		}
	},
});
FALCON_EMP_EXPIRY.forEach(([field]) => {
	frappe.ui.form.on("Employee", { [field](frm) { falcon_set_expiry_descriptions(frm); } });
});
