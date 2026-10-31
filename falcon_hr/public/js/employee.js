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

frappe.ui.form.on("Employee", {
	refresh(frm) {
		falcon_set_expiry_descriptions(frm);
		if (!frm.is_new()) {
			frm.add_custom_button(__("Expiry Center"), () => frappe.set_route("expiry-center"), __("View"));
		}
	},
});
FALCON_EMP_EXPIRY.forEach(([field]) => {
	frappe.ui.form.on("Employee", { [field](frm) { falcon_set_expiry_descriptions(frm); } });
});
