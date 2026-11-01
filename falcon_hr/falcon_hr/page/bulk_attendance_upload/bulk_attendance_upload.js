frappe.pages["bulk-attendance-upload"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Bulk Attendance Upload"), single_column: true });
	wrapper.fba = new BulkAttendanceUpload(page);
};

const fba_esc = (v) => frappe.utils.escape_html(v == null ? "" : String(v));

class BulkAttendanceUpload {
	constructor(page) {
		this.page = page;
		page.wrapper.find(".page-head").hide();
		this.file_url = null;
		this.$root = $('<div class="fba"></div>').appendTo(page.main);
		this.render();
		frappe.realtime.on("falcon_attendance_upload", (d) => d.key === this.key && this.show_progress(d));
	}

	render() {
		const today = frappe.datetime.get_today();
		this.$root.html(`
			<h1 class="fba-title">${__("Bulk Attendance Upload")}</h1>
			<div class="fba-sub">${__("Mark attendance for many employees and many days at once: download a sheet already filled with every employee and date, type the status, upload it back. Nothing is saved until you click Import.")}</div>
			<div class="fba-steps">
				<div class="fba-step" data-step="1"><div class="fba-n">1</div><h4>${__("Download the template")}</h4>
					<p>${__("One row per active employee per day. Holidays and attendance already marked are filled in for you.")}</p>
					<div data-c="from_date"></div><div data-c="to_date"></div><div data-c="company"></div><div data-c="branch"></div>
					<div class="fba-row"><button class="fba-btn dark" data-act="template">${__("Download Excel template")}</button></div></div>
				<div class="fba-step" data-step="2"><div class="fba-n">2</div><h4>${__("Fill in the Status column")}</h4>
					<p>${__("Use: Present, Absent, Half Day, On Leave (also fill Leave Type) or Work From Home. Leave a row empty to skip it. Optional: Shift, In Time and Out Time (e.g. 08:05).")}</p>
					<p>${__("Tip: in Excel, type Present once and drag it down, then change the exceptions.")}</p></div>
				<div class="fba-step" data-step="3"><div class="fba-n">3</div><h4>${__("Upload and review")}</h4>
					<p>${__("Every row is checked first — nothing is saved yet. Review the result below, fix any errors in Excel and upload again.")}</p>
					<div class="fba-row"><button class="fba-btn dark" data-act="upload">${__("Upload filled file")}</button></div>
					<div class="fba-file"></div><div class="fba-check"></div></div>
				<div class="fba-step" data-step="4"><div class="fba-n">4</div><h4>${__("Confirm and import")}</h4>
					<p>${__("Only the rows marked Ready are created and submitted. Rows that need fixing or are skipped are not touched.")}</p>
					<label class="fba-confirm"><input type="checkbox" disabled> ${__("I have reviewed the rows and want to import the Ready rows")}</label>
					<div class="fba-row"><button class="fba-btn dark" data-act="import" disabled>${__("Import")}</button></div>
					<div class="fba-result"></div></div>
			</div>
			<div class="fba-review" style="display:none">
				<div class="fba-tabs"></div>
				<div class="fba-row" style="margin:0"><button class="fba-btn" data-act="checked">${__("Download checked file")}</button></div>
			</div>
			<div class="fba-table" style="display:none"></div>
			<div class="fba-tip"><b>${__("Good to know")}:</b> ${__("Days that already have attendance are skipped, never duplicated. Holidays come from the Holiday List Assignment (HR Setup). Large months run in the background; you can keep working and come back to this page.")}</div>`);
		const mk = (f, df) => (this[f] = frappe.ui.form.make_control({ parent: this.$root.find(`[data-c="${f}"]`), df: { fieldname: f, ...df }, render_input: true }));
		mk("from_date", { fieldtype: "Date", label: __("From Date"), reqd: 1 });
		mk("to_date", { fieldtype: "Date", label: __("To Date"), reqd: 1 });
		mk("company", { fieldtype: "Link", options: "Company", label: __("Company") });
		mk("branch", { fieldtype: "Link", options: "Branch", label: __("Branch (optional)") });
		this.from_date.set_value(frappe.datetime.month_start());
		this.to_date.set_value(today);
		this.company.set_value(frappe.defaults.get_default("company"));
		this.$root.find("[data-act]").on("click", (e) => this[`act_${$(e.currentTarget).data("act")}`]());
		this.$root.find(".fba-confirm input").on("change", (e) => {
			this.$root.find('[data-act="import"]').prop("disabled", !(e.target.checked && this.ready_count));
		});
	}

	act_template() {
		const from = this.from_date.get_value(), to = this.to_date.get_value();
		if (!from || !to) return frappe.msgprint(__("Please choose From Date and To Date."));
		const q = new URLSearchParams({ from_date: from, to_date: to, company: this.company.get_value() || "", branch: this.branch.get_value() || "" });
		window.open(`/api/method/falcon_hr.api.attendance_upload.download_template?${q.toString()}`, "_blank");
		this.$root.find('[data-step="1"]').addClass("done");
	}

	act_upload() {
		new frappe.ui.FileUploader({
			restrictions: { allowed_file_types: [".xlsx", ".csv"] },
			allow_multiple: false,
			on_success: (file) => {
				this.file_url = file.file_url;
				this.$root.find(".fba-file").text(file.file_name || file.file_url);
				this.preview();
			},
		});
	}

	preview() {
		frappe.call({ method: "falcon_hr.api.attendance_upload.preview", args: { file_url: this.file_url }, freeze: true, freeze_message: __("Checking rows…") }).then((r) => {
			const { summary, rows } = r.message;
			this.rows = rows;
			this.ready_count = summary.ok;
			this.$root.find('[data-step="2"], [data-step="3"]').addClass("done");
			this.$root.find('[data-step="4"]').removeClass("done");
			this.$root.find(".fba-check").html(this.stats(summary.ok, summary.skip, summary.error, summary.total, __("Ready to import")));
			this.$root.find(".fba-result").empty();
			const $c = this.$root.find(".fba-confirm input").prop({ checked: false, disabled: !summary.ok });
			this.$root.find('[data-act="import"]').prop("disabled", true);
			if (!summary.ok) frappe.show_alert({ message: __("No rows are ready to import yet."), indicator: "orange" });
			this.filter = summary.error ? "error" : "ok";
			this.render_review(summary);
		});
	}

	render_review(summary) {
		const tabs = [["all", __("All"), summary.total], ["ok", __("Ready"), summary.ok], ["error", __("Need fixing"), summary.error], ["skip", __("Skipped"), summary.skip]];
		this.$root.find(".fba-review").show().find(".fba-tabs").html(tabs.map(([k, l, n]) =>
			`<button class="fba-tab ${this.filter === k ? "on" : ""}" data-f="${k}">${l} <b>${n}</b></button>`).join(""));
		this.$root.find(".fba-tab").on("click", (e) => { this.filter = e.currentTarget.dataset.f; this.render_review(summary); });
		this.table(this.filter === "all" ? this.rows : this.rows.filter((r) => r.result === this.filter));
	}

	act_checked() {
		const head = ["Row", "Employee", "Employee Name", "Date", "Status", "Result", "Message"];
		const label = { ok: "Ready", skip: "Skipped", error: "Error" };
		frappe.tools.downloadify([head].concat((this.rows || []).map((r) => [r.row, r.employee, r.name, r.date, r.status, label[r.result], r.message])), null, "Attendance check");
	}

	stats(ok, skip, err, total, okLabel) {
		return `<div class="fba-stats">
			<div class="fba-stat ok"><b>${ok}</b><span>${okLabel}</span></div>
			<div class="fba-stat skip"><b>${skip}</b><span>${__("Skipped")}</span></div>
			<div class="fba-stat err"><b>${err}</b><span>${__("Need fixing")}</span></div>
			<div class="fba-stat"><b>${total}</b><span>${__("Rows in file")}</span></div></div>`;
	}

	table(rows) {
		const $t = this.$root.find(".fba-table");
		if (!rows.length) return $t.hide();
		const label = { ok: __("Ready"), skip: __("Skipped"), error: __("Error") };
		$t.show().html(`<table><thead><tr><th>${__("Row")}</th><th>${__("Employee")}</th><th>${__("Date")}</th><th>${__("Status")}</th><th>${__("Result")}</th><th>${__("Message")}</th></tr></thead><tbody>
			${rows.map((r) => `<tr><td>${r.row}</td><td><b>${fba_esc(r.employee)}</b> <span class="text-muted">${fba_esc(r.name)}</span></td><td>${fba_esc(r.date)}</td>
				<td>${fba_esc(__(r.status || ""))}</td><td><span class="fba-pill ${r.result}">${label[r.result]}</span></td><td>${fba_esc(r.message)}</td></tr>`).join("")}
			</tbody></table>`);
	}

	act_import() {
		if (!this.$root.find(".fba-confirm input").prop("checked")) return;
		frappe.confirm(__("Create and submit attendance for {0} ready rows?", [this.ready_count]), () => {
			this.$root.find('[data-act="import"]').prop("disabled", true);
			this.$root.find(".fba-confirm input").prop("disabled", true);
			frappe.call("falcon_hr.api.attendance_upload.start_import", { file_url: this.file_url }).then((r) => {
				this.key = r.message;
				this.$root.find(".fba-result").html(`<div class="fba-bar"><span style="transform:scaleX(0)"></span></div><div class="fba-file">${__("Importing…")}</div>`);
				this.poll();
			});
		});
	}

	poll() {
		clearTimeout(this._t);
		frappe.call("falcon_hr.api.attendance_upload.get_status", { key: this.key }).then((r) => {
			this.show_progress(r.message);
			if (r.message && r.message.state !== "done") this._t = setTimeout(() => this.poll(), 2000);
		});
	}

	show_progress(d) {
		if (!d) return;
		if (d.state === "done") {
			clearTimeout(this._t);
			this.$root.find('[data-step="4"]').addClass("done");
			this.$root.find(".fba-result").html(this.stats(d.created, d.skipped, (d.errors || []).length, d.created + d.skipped + (d.errors || []).length, __("Created")) +
				`<div class="fba-row"><a class="fba-btn" href="/app/attendance">${__("Open Attendance list")}</a></div>`);
			this.rows = (d.errors || []);
			this.$root.find(".fba-review").hide();
			this.table(this.rows);
			frappe.show_alert({ message: __("Attendance import finished: {0} created", [d.created]), indicator: "green" });
			return;
		}
		const pct = d.total ? d.done / d.total : 0;
		this.$root.find(".fba-bar span").css("transform", `scaleX(${pct})`);
		this.$root.find(".fba-result .fba-file").text(__("Importing… {0} of {1}", [d.done || 0, d.total || 0]));
	}
}
