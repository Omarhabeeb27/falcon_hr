frappe.query_reports["Document Expiry Register"] = {
	filters: [
		{fieldname: "scope", label: __("Show"), fieldtype: "Select", options: "All\nEmployee\nBranch", default: "All"},
		{fieldname: "document", label: __("Document"), fieldtype: "Select", options: "\nIqama\nVisa\nPassport\nQiwa Contract\nMedical Insurance\nGOSI\nDriving License\nCommercial Registration\nVAT Certificate\nQiwa Establishment\nMuqeem Subscription"},
		{fieldname: "branch", label: __("Branch"), fieldtype: "Link", options: "Branch"},
		{fieldname: "status", label: __("Status"), fieldtype: "Select", options: "\nExpired\nCritical\nExpiring Soon\nValid"},
	],
	formatter(value, row, column, data, default_formatter) {
		value = default_formatter(value, row, column, data);
		if (column.fieldname && column.fieldname.endsWith("days_left") && data && data[column.fieldname] !== null && data[column.fieldname] !== undefined && data[column.fieldname] !== "") {
			const d = data[column.fieldname];
			const c = d < 0 ? "#d03b3b" : d <= 30 ? "#c2410c" : d <= 60 ? "#a16207" : "#15803d";
			value = `<span style="color:${c};font-weight:600">${value}</span>`;
		}
		if (column.fieldname === "status" && data && data.status) {
			const m = { Expired: "red", Critical: "orange", "Expiring Soon": "yellow", Valid: "green", Missing: "gray" };
			value = `<span class="indicator-pill ${m[data.status] || "gray"}">${frappe.utils.escape_html(data.status)}</span>`;
		}
		return value;
	},
};
