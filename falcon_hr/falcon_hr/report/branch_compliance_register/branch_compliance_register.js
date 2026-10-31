frappe.query_reports["Branch Compliance Register"] = {
	filters: [{fieldname: "company", label: __("Company"), fieldtype: "Link", options: "Company"}],
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
