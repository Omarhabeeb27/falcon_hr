// Shared helpers loaded on every desk page (kept tiny).
window.falcon_monthly_pdf_dialog = function () {
	const months = [];
	const d = new Date();
	for (let i = 0; i < 12; i++) {
		const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
		const v = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
		months.push({ value: v, label: m.toLocaleString(frappe.boot.lang || undefined, { month: "long", year: "numeric" }) });
	}
	const dlg = new frappe.ui.Dialog({
		title: __("Monthly Management PDF"),
		fields: [
			{ fieldname: "month", fieldtype: "Select", label: __("Month"), options: months, default: months[0].value, reqd: 1 },
			{ fieldname: "company", fieldtype: "Link", options: "Company", label: __("Company"), default: frappe.defaults.get_default("company") },
		],
		primary_action_label: __("Download PDF"),
		primary_action(v) {
			const q = new URLSearchParams({ month: v.month, company: v.company || "" });
			window.open(`/api/method/falcon_hr.api.monthly_report.download?${q.toString()}`, "_blank");
			dlg.hide();
		},
	});
	dlg.show();
};
