frappe.pages["expiry-center"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Expiry Center"), single_column: true });
	wrapper.ec = new ExpiryCenter(page);
};

frappe.pages["expiry-center"].on_page_show = function (wrapper) {
	if (wrapper.ec && frappe.route_options) {
		wrapper.ec.apply_route_options();
		wrapper.ec.refresh();
	}
};

const EC_STATUS = [
	{ key: "Expired", cls: "s-exp", css: "Expired", color: "#d03b3b", hint: __("past expiry date") },
	{ key: "Critical", cls: "s-crit", css: "Critical", color: "#ec835a", hint: __("within 30 days") },
	{ key: "Expiring Soon", cls: "s-soon", css: "Expiring", color: "#fab219", hint: __("31–60 days") },
	{ key: "Valid", cls: "s-ok", css: "Valid", color: "#0ca30c", hint: __("more than 60 days") },
];
const EC_AVATAR = ["#2a78d6", "#eb6834", "#1baf7a", "#6250d6", "#e87ba4", "#008300"];
const EC_PAGE = 100;
const ec_esc = (v) => frappe.utils.escape_html(v == null ? "" : String(v));
const EC_ICON = {
	search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
	down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v12m0 0 5-5m-5 5-5-5M5 21h14"/></svg>',
	refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/></svg>',
	chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3v18h18M8 17V9m5 8V5m5 12v-6"/></svg>',
};

class ExpiryCenter {
	constructor(page) {
		this.page = page;
		page.wrapper.find(".page-head").hide();
		this.state = { employee_status: "Active", scope: "All", status: "", document: "", view: "table", sort: "days_left", search: "", within_days: "" };
		this.shown = EC_PAGE;
		this.data = { rows: [], summary: {}, by_document: {}, documents: [], options: { projects: [], locations: [] } };
		this.$root = $('<div class="fec"></div>').appendTo(page.main);
		this.$toast = $('<div class="fec-toast"></div>').appendTo(document.body);
		this.build();
		this.apply_route_options();
		this.refresh();
	}

	build() {
		this.$root.html(`
			<div class="fec-head">
				<div><h1 class="fec-title">${__("Expiry Center")}</h1>
				<div class="fec-sub">${__("Every employee and company document, sorted by what needs attention first")}</div></div>
				<div class="fec-actions">
					<button class="fec-btn" data-act="reports">${EC_ICON.chart}${__("Reports")}</button>
					<button class="fec-btn" data-act="csv">${EC_ICON.down}${__("Download CSV")}</button>
					<button class="fec-btn dark" data-act="refresh">${EC_ICON.refresh}${__("Refresh")}</button>
				</div>
			</div>
			<div class="fec-stats"></div>
			<div class="fec-row">
				<div class="fec-seg fec-emp" data-seg="employee_status"><span class="pill"></span>
					${["Active", "Inactive", "Suspended", "Left", "All"].map((v) => `<button data-v="${v}">${__(v === "All" ? "All employees" : v)} <span class="cnt" data-cnt="${v}"></span></button>`).join("")}</div>
			</div>
			<div class="fec-row">
				<div class="fec-seg" data-seg="scope"><span class="pill"></span>
					<button data-v="All">${__("All")}</button><button data-v="Employee">${__("Employees")}</button><button data-v="Branch">${__("Branches")}</button></div>
				<div class="fec-seg" data-seg="view"><span class="pill"></span>
					<button data-v="table">${__("Table")}</button><button data-v="board">${__("Board")}</button></div>
				<div class="fec-chips"></div>
			</div>
			<div class="fec-filters">
				<div class="fec-search">${EC_ICON.search}<input type="search" placeholder="${__("Search name, ID, Iqama no., project, branch…")}"></div>
				<div data-f="branch"></div><div data-f="company"></div><div data-f="project"></div><div data-f="location"></div>
			</div>
			<div class="fec-filters more">
				<div data-f="nationality"></div><div data-f="designation"></div><div data-f="within_days"></div><div data-f="sort"></div>
				<div style="display:flex;align-items:center;justify-content:flex-end"><button class="fec-link" data-act="clear">${__("Clear all filters")}</button></div>
			</div>
			<div class="fec-meta"><div class="fec-count"></div><div class="fec-active"></div></div>
			<div class="fec-body"></div>`);

		const ctrl = (f, df) => {
			const c = frappe.ui.form.make_control({
				parent: this.$root.find(`[data-f="${f}"]`),
				df: { fieldname: f, ...df, change: () => this.on_filter(f, c.get_value()) },
				render_input: true,
			});
			c.$input && c.$input.attr("placeholder", df.placeholder || df.label);
			return c;
		};
		this.c = {
			branch: ctrl("branch", { fieldtype: "Link", options: "Branch", label: __("Branch"), placeholder: __("Branch (sponsor)") }),
			company: ctrl("company", { fieldtype: "Link", options: "Company", label: __("Company") }),
			project: ctrl("project", { fieldtype: "Select", options: [{ value: "", label: __("All projects") }], label: __("Project") }),
			location: ctrl("location", { fieldtype: "Select", options: [{ value: "", label: __("All locations") }], label: __("Location") }),
			nationality: ctrl("nationality", { fieldtype: "Link", options: "Country", label: __("Nationality") }),
			designation: ctrl("designation", { fieldtype: "Link", options: "Designation", label: __("Designation") }),
			within_days: ctrl("within_days", {
				fieldtype: "Select", label: __("Expiring within"),
				options: [{ value: "", label: __("Any time") }, { value: "0", label: __("Already expired") }, { value: "7", label: __("7 days") },
					{ value: "15", label: __("15 days") }, { value: "30", label: __("30 days") }, { value: "60", label: __("60 days") }, { value: "90", label: __("90 days") }],
			}),
			sort: ctrl("sort", {
				fieldtype: "Select", label: __("Sort"), default: "days_left",
				options: [{ value: "days_left", label: __("Sort: soonest expiry") }, { value: "name", label: __("Sort: name") },
					{ value: "branch", label: __("Sort: branch") }, { value: "document", label: __("Sort: document") }, { value: "project", label: __("Sort: project") }],
			}),
		};
		this.c.sort.set_value("days_left");

		let t;
		this.$root.find(".fec-search input").on("input", (e) => {
			clearTimeout(t);
			t = setTimeout(() => this.on_filter("search", e.target.value.trim()), 300);
		});
		this.$root.find("[data-seg] button").on("click", (e) => {
			const $b = $(e.currentTarget), seg = $b.closest("[data-seg]").data("seg");
			this.state[seg] = $b.data("v");
			this.slide(seg);
			seg === "view" ? this.render_body() : this.refresh();
		});
		this.$root.find("[data-act]").on("click", (e) => this.action($(e.currentTarget).data("act")));
		this.slide("employee_status", true);
		this.slide("scope", true);
		this.slide("view", true);
		$(window).on("resize", frappe.utils.debounce(() => { ["employee_status", "scope", "view"].forEach((g) => this.slide(g, true)); }, 150));
	}

	slide(seg, instant) {
		const $s = this.$root.find(`[data-seg="${seg}"]`);
		if (!this.$root.is(":visible")) {
			requestAnimationFrame(() => this.slide(seg, true));
			return;
		}
		const $b = $s.find("button").removeClass("active").filter(`[data-v="${this.state[seg]}"]`).addClass("active");
		const $p = $s.find(".pill");
		if (instant) $p.css("transition", "none");
		// Measure from the pill's real resting edge: in RTL Frappe mirrors CSS (left:0 -> right:0).
		// Resize first (in RTL the pill is right-anchored, so width moves its left edge), then measure.
		$p.css({ width: $b.outerWidth() });
		const shift = new DOMMatrix(getComputedStyle($p[0]).transform).m41;
		const rest = $p[0].getBoundingClientRect().left - shift;
		$p.css({ transform: `translateX(${$b[0].getBoundingClientRect().left - rest}px)` });
		if (instant) setTimeout(() => $p.css("transition", ""), 30);
	}

	apply_route_options() {
		const ro = frappe.route_options || {};
		frappe.route_options = null;
		Object.entries(ro).forEach(([k, v]) => {
			// Set state first: Select controls (project/location) may not have their options yet.
			this.state[k] = v;
			// project/location options arrive with the data; fill_options() selects them then.
			if (this.c && this.c[k] && !["project", "location"].includes(k)) this.c[k].set_value(v);
		});
	}

	on_filter(key, value) {
		if (this._silent) return;
		if ((this.state[key] || "") === (value || "")) return;
		this.state[key] = value || "";
		this.refresh();
	}

	action(act) {
		if (act === "refresh") this.refresh(true);
		if (act === "csv") this.download();
		if (act === "reports") frappe.set_route("query-report", "Document Expiry Register");
		if (act === "clear") {
			Object.values(this.c).forEach((c) => c.set_value(""));
			this.c.sort.set_value("days_left");
			this.$root.find(".fec-search input").val("");
			Object.assign(this.state, { status: "", document: "", search: "", scope: "All", employee_status: "Active" });
			this.slide("scope");
			this.slide("employee_status");
			this.refresh();
		}
	}

	args() {
		const s = this.state;
		const a = { employee_status: s.employee_status || "Active", scope: s.scope, status: s.status, document: s.document, search: s.search, sort: s.sort || "days_left" };
		["branch", "company", "project", "location", "nationality", "designation"].forEach((k) => (a[k] = s[k] || ""));
		a.within_days = s.within_days === "" || s.within_days == null ? "" : s.within_days === "0" ? -1 : s.within_days;
		return a;
	}

	refresh(toast) {
		this.shown = EC_PAGE;
		frappe.call({ method: "falcon_hr.api.expiry.get_expiry_data", args: this.args() }).then((r) => {
			this.data = r.message;
			this.fill_options();
			this.render_stats();
			this.render_chips();
			this.render_active();
			this.render_body();
			const cnt = this.data.employee_status_counts || {};
			this.$root.find("[data-cnt]").each((_, el) => { el.textContent = cnt[el.dataset.cnt] ?? ""; });
			["employee_status", "scope", "view"].forEach((g) => this.slide(g, true));
			if (toast) this.toast(__("Updated · {0} documents", [this.data.rows.length]));
		});
	}

	fill_options() {
		const o = this.data.options || {};
		[["project", o.projects], ["location", o.locations]].forEach(([k, list]) => {
			const c = this.c[k], cur = this.state[k] || c.get_value();
			const opts = [{ value: "", label: k === "project" ? __("All projects") : __("All locations") }].concat(list || []);
			if (JSON.stringify(c.df.options) !== JSON.stringify(opts)) {
				c.df.options = opts;
				c.refresh();
				if (cur) {
					this._silent = true;
					c.set_value(cur).then(() => (this._silent = false));
				}
			}
		});
	}

	render_stats() {
		const s = this.data.summary || {};
		const total = EC_STATUS.reduce((a, x) => a + (s[x.key] || 0), 0) || 1;
		this.$root.find(".fec-stats").html(
			EC_STATUS.map((x, i) => `<div class="fec-stat ${x.cls} ${this.state.status === x.key ? "on" : ""}" data-status="${x.key}" style="animation-delay:${i * 0.05}s">
				<div class="lbl"><i style="background:${x.color}"></i>${__(x.key)}</div>
				<div class="val">${(s[x.key] || 0).toLocaleString()}</div>
				<div class="hint">${x.hint} · ${Math.round((100 * (s[x.key] || 0)) / total)}%</div>
				<div class="bar"><span style="transform:scaleX(${(s[x.key] || 0) / total});transform-origin:${frappe.utils.is_rtl() ? "right" : "left"};background:${x.color}"></span></div></div>`).join("")
		);
		this.$root.find(".fec-stat").on("click", (e) => {
			const k = $(e.currentTarget).data("status");
			this.state.status = this.state.status === k ? "" : k;
			this.refresh();
		});
	}

	render_chips() {
		const by = this.data.by_document || {};
		const docs = (this.data.documents || []).filter((d) => by[d] || this.state.document === d);
		const chip = (d, label, n, bad) => `<button class="fec-chip ${this.state.document === d ? "on" : ""}" data-doc="${ec_esc(d)}">
			${ec_esc(label)} <b>${n}</b>${bad ? `<span class="r">· ${bad} ⚠</span>` : ""}</button>`;
		const total = Object.values(by).reduce((a, x) => a + x.Expired + x.Critical + x["Expiring Soon"] + x.Valid, 0);
		this.$root.find(".fec-chips").html(
			chip("", __("All documents"), total, 0) +
			docs.map((d) => {
				const x = by[d] || { Expired: 0, Critical: 0, "Expiring Soon": 0, Valid: 0 };
				return chip(d, __(d), x.Expired + x.Critical + x["Expiring Soon"] + x.Valid, x.Expired + x.Critical);
			}).join("")
		);
		this.$root.find(".fec-chip").on("click", (e) => {
			this.state.document = $(e.currentTarget).data("doc") || "";
			this.refresh();
		});
	}

	render_active() {
		const s = this.state, tags = [];
		const add = (key, label) => tags.push(`<span class="fec-tag">${ec_esc(label)}<button data-clear="${key}">✕</button></span>`);
		if (s.employee_status && s.employee_status !== "Active") tags.push(`<span class="fec-tag">${ec_esc(__("Employees: {0}", [__(s.employee_status)]))}</span>`);
		if (s.status) add("status", __(s.status));
		if (s.document) add("document", __(s.document));
		["branch", "company", "project", "location", "nationality", "designation"].forEach((k) => s[k] && add(k, s[k]));
		if (s.within_days) add("within_days", s.within_days === "0" ? __("Already expired") : __("≤ {0} days", [s.within_days]));
		if (s.search) add("search", `“${s.search}”`);
		this.$root.find(".fec-count").html(`<b>${this.data.rows.length.toLocaleString()}</b> ${__("documents")}`);
		this.$root.find(".fec-active").html(tags.join(""));
		this.$root.find("[data-clear]").on("click", (e) => {
			const k = $(e.currentTarget).data("clear");
			if (this.c[k]) this.c[k].set_value("");
			if (k === "search") this.$root.find(".fec-search input").val("");
			this.state[k] = "";
			this.refresh();
		});
	}

	render_body() {
		const $b = this.$root.find(".fec-body");
		const rows = this.data.rows;
		if (!rows.length) {
			$b.html(`<div class="fec-table-wrap"><div class="fec-empty"><b>${__("Nothing matches these filters")}</b>${__("Try clearing a filter or widening the date window.")}</div></div>`);
			return;
		}
		this.state.view === "board" ? this.render_board($b) : this.render_table($b);
	}

	days_cell(r) {
		const d = r.days_left;
		const color = d < 0 ? "#d03b3b" : d <= 30 ? "#ec835a" : d <= 60 ? "#fab219" : "#0ca30c";
		const pct = d < 0 ? 100 : Math.max(4, Math.min(100, 100 - (d / 365) * 100));
		const txt = d < 0 ? __("{0}d overdue", [Math.abs(d)]) : d === 0 ? __("today") : __("{0}d left", [d]);
		return `<span class="fec-days" style="color:${d < 0 ? "#9b2222" : "inherit"}"><span class="fec-meter"><span style="width:${pct}%;background:${color}"></span></span>${txt}</span>`;
	}

	avatar(r, i) {
		if (r.scope === "Branch") return `<span class="fec-avatar b">${ec_esc((r.party || "?").trim().charAt(0).toUpperCase())}</span>`;
		const ini = (r.party || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
		let h = 0;
		for (const ch of r.name || "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
		return `<span class="fec-avatar" style="background:${EC_AVATAR[h % EC_AVATAR.length]}">${ec_esc(ini)}</span>`;
	}

	render_table($b) {
		const rows = this.data.rows.slice(0, this.shown);
		const st = (r) => EC_STATUS.find((x) => x.key === r.status);
		const body = rows.map((r, i) => `<tr data-i="${i}">
			<td><div class="fec-person">${this.avatar(r, i)}<div><b dir="auto">${ec_esc(r.party)}${this.emp_badge(r)}</b>
				<small>${r.scope === "Employee" ? [r.name, r.designation, r.nationality].filter(Boolean).map(ec_esc).join(" · ") : __("Company document")}</small></div></div></td>
			<td><span class="fec-doc">${ec_esc(__(r.document))}</span><div style="font-size:11.5px;color:#898781;margin-top:3px">${ec_esc(r.number || "—")}</div></td>
			<td class="fec-two"><b dir="auto">${ec_esc(r.branch || "—")}</b><small>${ec_esc(r.company)}</small></td>
			<td class="fec-two"><b>${ec_esc(r.scope === "Employee" ? r.project : "—")}</b><small>${ec_esc(r.location || "")}</small></td>
			<td style="white-space:nowrap"><div style="font-size:12px;color:#52514e;margin-bottom:3px">${ec_esc(frappe.datetime.str_to_user(r.expiry_date))}</div>${this.days_cell(r)}</td>
			<td><span class="fec-status ${st(r).css}"><i></i>${ec_esc(__(r.status))}</span></td></tr>`).join("");
		const th = (label, key) => `<th ${key ? `data-sort="${key}"` : ""} class="${this.state.sort === key ? "sorted" : ""}">${label}${this.state.sort === key ? " ↓" : ""}</th>`;
		$b.html(`<div class="fec-table-wrap"><table class="fec-table"><thead><tr>
			${th(__("Employee / Branch"), "name")}${th(__("Document"), "document")}${th(__("Branch (Sponsor) / Company"), "branch")}
			${th(__("Project / Location"), "project")}${th(__("Expiry / Time left"), "days_left")}${th(__("Status"))}
			</tr></thead><tbody>${body}</tbody></table>
			${this.data.rows.length > this.shown ? `<div class="fec-more"><button class="fec-btn" data-act-more>${__("Show {0} more", [Math.min(EC_PAGE, this.data.rows.length - this.shown)])}</button></div>` : ""}</div>`);
		$b.find("tbody tr").on("click", (e) => this.open(rows[$(e.currentTarget).data("i")]));
		$b.find("th[data-sort]").on("click", (e) => this.c.sort.set_value($(e.currentTarget).data("sort")));
		$b.find("[data-act-more]").on("click", () => { this.shown += EC_PAGE; this.render_body(); });
	}

	render_board($b) {
		const groups = EC_STATUS.map((x) => ({ ...x, rows: this.data.rows.filter((r) => r.status === x.key) }));
		$b.html(`<div class="fec-board">${groups.map((g) => `<div class="fec-col">
			<div class="fec-col-head"><i style="background:${g.color}"></i>${__(g.key)}<span>${g.rows.length}</span></div>
			<div class="fec-cards">${g.rows.slice(0, 60).map((r, i) => `<div class="fec-card ${g.css}" data-k="${g.key}" data-i="${i}" style="animation-delay:${Math.min(i, 12) * 0.02}s">
				<div class="t"><span>${ec_esc(__(r.document))}</span><span>${ec_esc(frappe.datetime.str_to_user(r.expiry_date))}</span></div>
				<div class="n" dir="auto">${ec_esc(r.party)}${this.emp_badge(r)}</div>
				<div class="s">${ec_esc(r.scope === "Employee" ? [r.project, r.branch || r.company].filter(Boolean).join(" · ") : r.company)}</div>
				<div class="d">${r.days_left < 0 ? Math.abs(r.days_left) : r.days_left} <small>${r.days_left < 0 ? __("days overdue") : __("days left")}</small></div></div>`).join("")}
				${g.rows.length > 60 ? `<div class="fec-empty" style="padding:10px">${__("+{0} more — use filters or the table view", [g.rows.length - 60])}</div>` : ""}
				${!g.rows.length ? `<div class="fec-empty" style="padding:16px">${__("None")}</div>` : ""}</div></div>`).join("")}</div>`);
		$b.find(".fec-card").on("click", (e) => {
			const $c = $(e.currentTarget);
			this.open(groups.find((g) => g.key === $c.data("k")).rows[$c.data("i")]);
		});
	}

	emp_badge(r) {
		if (r.scope !== "Employee" || !r.emp_status || r.emp_status === "Active") return "";
		const tip = r.relieving_date ? __("Relieved on {0}", [frappe.datetime.str_to_user(r.relieving_date)]) : "";
		return ` <span class="fec-empst ${ec_esc(r.emp_status)}" title="${ec_esc(tip)}">${ec_esc(__(r.emp_status))}</span>`;
	}

	open(r) {
		if (r) frappe.set_route("Form", r.doctype, r.name);
	}

	toast(msg) {
		this.$toast.text(msg).addClass("show");
		clearTimeout(this._tt);
		this._tt = setTimeout(() => this.$toast.removeClass("show"), 1800);
	}

	download() {
		const head = ["Type", "Name", "ID", "Employee Status", "Document", "Number", "Branch (Sponsor)", "Company", "Designation", "Nationality",
			"Project", "Project Location", "Expiry Date", "Days Left", "Status"];
		const body = this.data.rows.map((r) => [r.scope, r.party, r.name, r.emp_status, r.document, r.number, r.branch, r.company, r.designation,
			r.nationality, r.project, r.location, r.expiry_date, r.days_left, r.status]);
		frappe.tools.downloadify([head].concat(body), null, "Expiry Center");
		this.toast(__("Downloaded {0} rows", [body.length]));
	}
}
