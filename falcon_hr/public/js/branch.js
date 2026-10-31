const FALCON_BRANCH_EXPIRY = [
	"custom_cr_expiry_date", "custom_vat_certificate_expiry",
	"custom_qiwa_expiry_date", "custom_muqeem_expiry_date",
];

function falcon_branch_days(frm) {
	FALCON_BRANCH_EXPIRY.forEach((f) => {
		if (!frm.fields_dict[f]) return;
		const date = frm.doc[f];
		let html = "";
		if (date) {
			const d = frappe.datetime.get_diff(date, frappe.datetime.get_today());
			const color = d < 0 ? "#dc2626" : d <= 30 ? "#ea580c" : d <= 60 ? "#ca8a04" : "#16a34a";
			html = `<b style="color:${color}">${d < 0 ? __("EXPIRED {0} days ago", [Math.abs(d)]) : __("{0} days remaining", [d])}</b>`;
		}
		frm.set_df_property(f, "description", html);
	});
}

frappe.ui.form.on("Branch", {
	refresh(frm) {
		falcon_branch_days(frm);
		if (frm.is_new()) return;
		frm.add_custom_button(__("Employees"), () => frappe.set_route("List", "Employee", { branch: frm.doc.name, status: "Active" }), __("View"));
		frm.add_custom_button(__("Expiry Center"), () => frappe.set_route("expiry-center"), __("View"));
		frappe.call({
			method: "falcon_hr.api.expiry.get_branch_summary",
			args: { branch: frm.doc.name },
			callback: (r) => {
				const s = r.message;
				const box = (label, val, color, filt) => `<a href="/app/employee?branch=${encodeURIComponent(frm.doc.name)}&status=Active${filt || ""}"
					style="display:inline-block;min-width:120px;margin:4px 10px 4px 0;padding:10px 14px;border:1px solid var(--border-color);border-radius:8px;text-decoration:none">
					<div class="text-muted small">${label}</div><div style="font-size:22px;font-weight:600;color:${color}">${val}</div></a>`;
				const today = frappe.datetime.get_today(), in60 = frappe.datetime.add_days(today, 60);
				frm.dashboard.add_section(`<div><h6 style="margin-bottom:6px">${__("Employees & Iqama status")}</h6>
					${box(__("Active employees"), s.total, "var(--text-color)")}
					${box(__("Iqama valid"), s.valid, "#16a34a", `&custom_iqama_expiry_date=${encodeURIComponent(JSON.stringify([">", in60]))}`)}
					${box(__("Expiring in 60 days"), s.expiring, "#ca8a04", `&custom_iqama_expiry_date=${encodeURIComponent(JSON.stringify(["Between", [today, in60]]))}`)}
					${box(__("Iqama expired"), s.expired, "#dc2626", `&custom_iqama_expiry_date=${encodeURIComponent(JSON.stringify(["<", today]))}`)}
					${box(__("No Iqama date"), s.missing, "#6b7280", `&custom_iqama_expiry_date=${encodeURIComponent(JSON.stringify(["is", "not set"]))}`)}</div>`,
					__("Branch Overview"));
			},
		});
	},
});
FALCON_BRANCH_EXPIRY.forEach((f) => frappe.ui.form.on("Branch", { [f](frm) { falcon_branch_days(frm); } }));
