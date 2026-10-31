frappe.pages["expiry-center"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Expiry Center"),
		single_column: true,
	});
	new ExpiryCenter(page);
};

class ExpiryCenter {
	constructor(page) {
		this.page = page;
		this.data = { rows: [], summary: {} };
		this.make_filters();
		this.$body = $('<div class="expiry-center"></div>').appendTo(page.main);
		page.set_primary_action(__("Refresh"), () => this.refresh(), "refresh");
		page.add_inner_button(__("Download CSV"), () => this.download());
		this.refresh();
	}

	make_filters() {
		const p = this.page;
		const change = () => this.refresh();
		this.f = {
			scope: p.add_field({ fieldname: "scope", label: __("Show"), fieldtype: "Select",
				options: "All\nEmployee\nBranch", default: "All", change }),
			document: p.add_field({ fieldname: "document", label: __("Document"), fieldtype: "Select", change }),
			branch: p.add_field({ fieldname: "branch", label: __("Branch"), fieldtype: "Link", options: "Branch", change }),
			status: p.add_field({ fieldname: "status", label: __("Status"), fieldtype: "Select",
				options: "\nExpired\nCritical\nExpiring Soon\nValid", change }),
			search: p.add_field({ fieldname: "search", label: __("Search"), fieldtype: "Data", change }),
		};
	}

	values() {
		const v = {};
		Object.keys(this.f).forEach((k) => (v[k] = this.f[k].get_value()));
		return v;
	}

	refresh() {
		frappe.call({
			method: "falcon_hr.api.expiry.get_expiry_data",
			args: this.values(),
			freeze: true,
			callback: (r) => {
				this.data = r.message;
				if (!this.f.document.df.options) {
					this.f.document.df.options = [""].concat(this.data.documents).join("\n");
					this.f.document.refresh();
				}
				this.render();
			},
		});
	}

	render() {
		const s = this.data.summary || {};
		const color = { Expired: "red", Critical: "orange", "Expiring Soon": "yellow", Valid: "green" };
		const cards = ["Expired", "Critical", "Expiring Soon", "Valid"]
			.map(
				(k) => `<div class="col-sm-3"><div class="frappe-card" style="padding:14px;margin-bottom:12px;cursor:pointer"
					data-status="${k}"><div class="text-muted">${__(k)}</div>
					<div style="font-size:26px;font-weight:600" class="text-${color[k] === "yellow" ? "warning" : color[k] === "red" ? "danger" : color[k] === "green" ? "success" : "warning"}">${s[k] || 0}</div></div></div>`
			)
			.join("");

		const rows = this.data.rows
			.map((r) => {
				const days = r.days_left < 0 ? __("Expired {0} days ago", [Math.abs(r.days_left)]) : __("{0} days", [r.days_left]);
				return `<tr>
					<td><span class="indicator-pill ${r.scope === "Employee" ? "blue" : "purple"}">${__(r.scope)}</span></td>
					<td><a href="/app/${frappe.router.slug(r.doctype)}/${encodeURIComponent(r.name)}">${frappe.utils.escape_html(r.party)}</a>
						${r.scope === "Employee" ? `<div class="text-muted small">${r.name}</div>` : ""}</td>
					<td>${__(r.document)}</td>
					<td>${frappe.utils.escape_html(r.number || "")}</td>
					<td>${frappe.utils.escape_html(r.scope === "Employee" ? r.branch || r.company || "" : r.company || "")}</td>
					<td>${frappe.datetime.str_to_user(r.expiry_date)}</td>
					<td><b>${days}</b></td>
					<td><span class="indicator-pill ${color[r.status]}">${__(r.status)}</span></td></tr>`;
			})
			.join("");

		this.$body.html(`<div class="row" style="margin-bottom:6px">${cards}</div>
			<div class="frappe-card" style="padding:0;overflow:auto"><table class="table table-bordered" style="margin:0">
			<thead><tr><th>${__("Type")}</th><th>${__("Employee / Branch")}</th><th>${__("Document")}</th><th>${__("Number")}</th>
			<th>${__("Branch / Company")}</th><th>${__("Expiry Date")}</th><th>${__("Time Left")}</th><th>${__("Status")}</th></tr></thead>
			<tbody>${rows || `<tr><td colspan="8" class="text-muted text-center" style="padding:30px">${__("Nothing to show")}</td></tr>`}</tbody></table></div>`);

		this.$body.find("[data-status]").on("click", (e) => {
			this.f.status.set_value($(e.currentTarget).data("status"));
		});
	}

	download() {
		const head = ["Type", "Employee / Branch", "ID", "Document", "Number", "Branch", "Company", "Expiry Date", "Days Left", "Status"];
		const body = this.data.rows.map((r) => [r.scope, r.party, r.name, r.document, r.number, r.branch, r.company, r.expiry_date, r.days_left, r.status]);
		frappe.tools.downloadify([head].concat(body), null, "Expiry Center");
	}
}
