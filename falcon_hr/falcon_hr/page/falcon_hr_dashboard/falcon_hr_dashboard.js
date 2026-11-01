frappe.pages["falcon-hr-dashboard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("HR Dashboard"), single_column: true });
	wrapper.fhd = new FalconHRDashboard(page);
};

frappe.pages["falcon-hr-dashboard"].on_page_show = function (wrapper) {
	wrapper.fhd && wrapper.fhd.load();
};

const FHD_STATUS = [
	{ key: "Expired", color: "#d03b3b" },
	{ key: "Critical", color: "#ec835a", note: "≤ 30 days" },
	{ key: "Expiring Soon", color: "#fab219", note: "31–60 days" },
	{ key: "Valid", color: "#0ca30c" },
];
// Validated categorical order (dataviz reference palette, light mode), never cycled.
const FHD_CAT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];
const FHD_OTHER = "#b5b3ab";

const esc = (v) => frappe.utils.escape_html(v == null ? "" : String(v));
// Tooltip HTML lives in an attribute: escape the whole HTML once more so names stay inert after getAttribute().
const tip = (html) => `data-tip="${frappe.utils.escape_html(html)}"`;
// Click-through: elements carry data-nav='{"list"|"report"|"expiry": ...}' handled in bind_nav().
const nav = (obj) => `data-nav="${frappe.utils.escape_html(JSON.stringify(obj))}"`;
const fmt = (n) => (n || 0).toLocaleString();
const ICON = {
	search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
	users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
	building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/></svg>',
	clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
	alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/></svg>',
	arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M7 7h10v10"/></svg>',
};

class FalconHRDashboard {
	constructor(page) {
		this.page = page;
		this.tab = "overview";
		this.emp_status = "Active";
		this.f = { company: "", branch: "", project: "", nationality: "" };
		this.$root = $('<div class="fhd"></div>').appendTo(page.main);
		this.$tip = $('<div class="fhd-tip"></div>').appendTo(document.body);
		page.wrapper.find(".page-head").hide();
	}

	load() {
		frappe.call("falcon_hr.api.dashboard.get_dashboard", { employee_status: this.emp_status, ...this.f }).then((r) => {
			this.d = r.message;
			this.render();
		});
	}

	render() {
		const k = this.d.kpi;
		const soon = (k.Critical || 0) + (k["Expiring Soon"] || 0);
		this.$root.html(`
			<div class="fhd-head">
				<div>
					<h1 class="fhd-title">${__("HR Overview")}</h1>
					<div class="fhd-sub">${esc(frappe.datetime.str_to_user(frappe.datetime.get_today()))} · ${__("Falcon Resource Management")}</div>
				</div>
				<div class="fhd-actions">
					<button class="fhd-btn" data-go="employee">${__("Employees")}</button>
					<button class="fhd-btn" data-go="branch">${__("Branches")}</button>
					<button class="fhd-btn" data-go="reports">${__("Reports")}</button>
					<button class="fhd-btn dark" data-go="expiry">${__("Expiry Center")}</button>
				</div>
			</div>
			<div class="fhd-filterbar">
				<div class="fhd-gsearch">${ICON.search}<input type="search" placeholder="${__("Search employee, ID, Iqama no., passport, project or branch…")}" autocomplete="off"><div class="fhd-results"></div></div>
				<div data-fc="company"></div><div data-fc="branch"></div><div data-fc="project"></div><div data-fc="nationality"></div>
				<button class="fhd-btn" data-act="clear" ${Object.values(this.f).some(Boolean) ? "" : "disabled"}>${__("Clear")}</button>
			</div>
			<div class="fhd-kpis">
				${this.kpi("hero", ICON.users, this.emp_status === "All" ? __("All employees") : __("{0} employees", [__(this.emp_status)]), fmt(k.active), __("{0} left the company", [fmt(k.left)]), "employee")}
				${this.kpi("blue", ICON.building, __("Branches"), fmt(k.branches), __("{0} with staff", [fmt(k.branches_staffed)]), "branch")}
				${this.kpi("sand", ICON.clock, __("Expiring in 60 days"), fmt(soon), __("{0} within 30 days", [fmt(k.Critical)]), "soon")}
				${this.kpi("rose", ICON.alert, __("Expired documents"), fmt(k.Expired), __("{0}% of documents valid", [k.valid_pct]), "expired")}
			</div>
			<div class="fhd-toolbar"><div class="fhd-tabs">
				<span class="fhd-pill"></span>
				<button class="fhd-tab" data-tab="overview">${__("Overview")}</button>
				<button class="fhd-tab" data-tab="projects">${__("Projects")}</button>
				<button class="fhd-tab" data-tab="documents">${__("Documents")}</button>
				<button class="fhd-tab" data-tab="branches">${__("Branches")}</button>
			</div>
			<div class="fhd-status"><span class="fhd-status-lbl">${__("Employees")}</span>
				${["Active", "Inactive", "Suspended", "Left", "All"].map((v) => `<button class="${this.emp_status === v ? "on" : ""}" data-emp="${v}">${__(v)} <span>${(this.d.status_counts || {})[v] ?? ""}</span></button>`).join("")}
			</div></div>
			<div class="fhd-body"></div>`);

		this.$root.find("[data-go]").on("click", (e) => this.go($(e.currentTarget).data("go")));
		this.make_filters();
		this.make_search();
		this.$root.find("[data-emp]").on("click", (e) => { this.emp_status = $(e.currentTarget).data("emp"); this.load(); });
		this.$root.find(".fhd-tab").on("click", (e) => this.set_tab($(e.currentTarget).data("tab")));
		this.set_tab(this.tab, true);
	}

	make_filters() {
		const mk = (f, df) => {
			const c = frappe.ui.form.make_control({
				parent: this.$root.find(`[data-fc="${f}"]`),
				df: { fieldname: f, ...df, change: () => {
					const v = c.get_value() || "";
					if (v !== this.f[f]) { this.f[f] = v; this.load(); }
				} },
				render_input: true,
			});
			c.$input && c.$input.attr("placeholder", df.label);
			c.set_value(this.f[f]);
			return c;
		};
		mk("company", { fieldtype: "Link", options: "Company", label: __("Company") });
		mk("branch", { fieldtype: "Link", options: "Branch", label: __("Branch (sponsor)") });
		mk("project", { fieldtype: "Select", label: __("Project"),
			options: [{ value: "", label: __("All projects") }].concat((this.d.filter_options || {}).projects || []) });
		mk("nationality", { fieldtype: "Link", options: "Country", label: __("Nationality") });
		this.$root.find('[data-act="clear"]').on("click", () => {
			this.f = { company: "", branch: "", project: "", nationality: "" };
			this.load();
		});
	}

	make_search() {
		const $in = this.$root.find(".fhd-gsearch input"), $res = this.$root.find(".fhd-results");
		let t, seq = 0;
		const close = () => $res.removeClass("open").empty();
		$in.on("input", () => {
			clearTimeout(t);
			const q = $in.val().trim();
			if (q.length < 2) return close();
			t = setTimeout(() => {
				const my = ++seq;
				frappe.call("falcon_hr.api.dashboard.search", { q }).then((r) => {
					if (my !== seq) return;
					const { employees, branches } = r.message;
					const items = employees.map((e) => `<a class="fhd-res" href="/app/employee/${encodeURIComponent(e.name)}">
							<span class="fhd-res-ico">${esc((e.employee_name || "?").charAt(0))}</span>
							<span><b dir="auto">${esc(e.employee_name)}</b><small>${[e.name, e.designation, e.branch, e.custom_project_assigned_to].filter(Boolean).map(esc).join(" · ")}</small></span>
							${e.status !== "Active" ? `<em>${esc(__(e.status))}</em>` : ""}</a>`)
						.concat(branches.map((b) => `<a class="fhd-res" href="/app/branch/${encodeURIComponent(b.name)}">
							<span class="fhd-res-ico b">${ICON.building}</span><span><b dir="auto">${esc(b.name)}</b><small>${__("Branch")} · ${esc(b.custom_company || "")}</small></span></a>`));
					$res.html(items.length ? items.join("") : `<div class="fhd-res-empty">${__("No matches for “{0}”", [esc(q)])}</div>`).addClass("open");
				});
			}, 250);
		});
		$in.on("keydown", (e) => { if (e.key === "Escape") { $in.val(""); close(); } });
		$(document).off("click.fhdsearch").on("click.fhdsearch", (e) => { if (!$(e.target).closest(".fhd-gsearch").length) close(); });
	}

	emp_filters(extra) {
		const f = {};
		if (this.emp_status !== "All") f.status = this.emp_status;
		if (this.f.company) f.company = this.f.company;
		if (this.f.branch) f.branch = this.f.branch;
		if (this.f.nationality) f.custom_nationality = this.f.nationality;
		return Object.assign(f, extra || {});
	}

	nat_nav(label) {
		if (label === "Other") return "";
		return nav({ list: "Employee", filters: this.emp_filters({ custom_nationality: label === "Not set" ? ["is", "not set"] : label }) });
	}

	month_nav(month) {
		const [y, m] = month.split("-").map(Number);
		const start = `${month}-01`, end = frappe.datetime.obj_to_str(new Date(y, m, 0));
		const f = this.emp_filters({ date_of_joining: ["between", [start, end]] });
		delete f.status;
		return nav({ list: "Employee", filters: f });
	}

	bind_nav($scope) {
		$scope.find("[data-nav]").on("click", (e) => {
			const n = JSON.parse(e.currentTarget.getAttribute("data-nav"));
			if (n.list) frappe.set_route("List", n.list, n.filters || {});
			else if (n.report) frappe.set_route("query-report", n.report, n.filters || {});
			else if (n.expiry) {
				frappe.route_options = { employee_status: this.emp_status, ...this.expiry_filters(), ...n.expiry };
				frappe.set_route("expiry-center");
			}
		});
	}

	expiry_filters() {
		const o = {};
		["company", "branch", "project", "nationality"].forEach((k) => this.f[k] && (o[k] = this.f[k]));
		return o;
	}

	kpi(cls, icon, label, value, foot, go) {
		return `<div class="fhd-kpi ${cls}" data-go="${go}">
			<div class="fhd-kpi-ico">${icon}</div>
			<div class="fhd-kpi-label">${label}</div>
			<div class="fhd-kpi-value">${value}</div>
			<span class="fhd-kpi-foot">${foot}</span></div>`;
	}

	go(target, extra) {
		const routes = {
			employee: () => frappe.set_route("List", "Employee", this.emp_filters()),
			branch: () => frappe.set_route("List", "Branch"),
			expiry: () => { frappe.route_options = { employee_status: this.emp_status, ...this.expiry_filters() }; frappe.set_route("expiry-center"); },
			soon: () => { frappe.route_options = { status: "Critical", employee_status: this.emp_status, ...this.expiry_filters() }; frappe.set_route("expiry-center"); },
			expired: () => { frappe.route_options = { status: "Expired", employee_status: this.emp_status, ...this.expiry_filters() }; frappe.set_route("expiry-center"); },
			nobranch: () => frappe.set_route("List", "Employee", { status: "Active", branch: ["is", "not set"] }),
			reports: () => frappe.set_route("query-report", "Branch Workforce Summary"),
			project: () => frappe.set_route("query-report", "Project Assignment Register", { project: extra }),
			unassigned: () => frappe.set_route("List", "Employee", { status: "Active", custom_project_assigned_to: ["in", ["", "-", "na", "NA"]] }),
			doc: () => { frappe.route_options = { document: extra, employee_status: this.emp_status, ...this.expiry_filters() }; frappe.set_route("expiry-center"); },
		};
		routes[target] && routes[target]();
	}

	set_tab(tab, instant) {
		this.tab = tab;
		const $tabs = this.$root.find(".fhd-tab").removeClass("active");
		const $t = $tabs.filter(`[data-tab="${tab}"]`).addClass("active");
		const $pill = this.$root.find(".fhd-pill");
		if (instant) $pill.css("transition", "none");
		// Measure from the pill's real resting edge: in RTL Frappe mirrors CSS (left:0 -> right:0).
		// Resize first (in RTL the pill is right-anchored, so width moves its left edge), then measure.
		$pill.css({ width: $t.outerWidth() });
		const shift = new DOMMatrix(getComputedStyle($pill[0]).transform).m41;
		const rest = $pill[0].getBoundingClientRect().left - shift;
		$pill.css({ transform: `translateX(${$t[0].getBoundingClientRect().left - rest}px)` });
		if (instant) setTimeout(() => $pill.css("transition", ""), 30);
		const $body = this.$root.find(".fhd-body");
		$body.html(this[`render_${tab}`]());
		this.bind_tips($body);
		this.bind_nav($body);
		$body.find("[data-doc]").on("click", (e) => this.go("doc", $(e.currentTarget).data("doc")));
		$body.find("[data-go]").on("click", (e) => this.go($(e.currentTarget).data("go")));
		$body.find("[data-project]").on("click", (e) => this.go("project", $(e.currentTarget).data("project")));
		$body.find(".fhd-filter").on("input", (e) => {
			const q = e.target.value.toLowerCase();
			$body.find("[data-search]").each((_, el) => { el.style.display = el.dataset.search.includes(q) ? "" : "none"; });
		});
	}

	/* ---------- Overview ---------- */
	render_overview() {
		const d = this.d;
		const banner = d.kpi.no_branch
			? `<div class="fhd-banner"><span>⚠️ ${__("{0} employees in this view have no Branch (sponsor) set, so branch figures below leave them out.", [fmt(d.kpi.no_branch)])}</span>
				<button class="fhd-btn" data-go="nobranch">${__("Fix now")}</button></div>`
			: "";
		return `${banner}<div class="fhd-grid">
			<div class="fhd-card span-7">${this.card_head(__("Headcount by branch"), __("Employees per sponsoring branch"))}${this.hbars(d.headcount, "branch")}</div>
			<div class="fhd-card span-5">${this.card_head(__("Document health"), __("All employee + branch documents"))}${this.ring()}</div>
			<div class="fhd-card span-8">${this.card_head(__("Upcoming expiries"), __("Next 60 days, soonest first"), "expiry")}${this.tiles()}</div>
			<div class="fhd-card span-4">${this.card_head(__("Nationality mix"), __("Employees in this view"))}${this.segments(d.nationality)}</div>
			<div class="fhd-card span-12">${this.card_head(__("Joiners and leavers"), __("Last 12 months"))}${this.columns(d.joiners)}</div>
		</div>`;
	}

	card_head(title, sub, go) {
		return `<div class="fhd-card-head"><div><h4>${title}</h4><div class="fhd-card-sub">${sub}</div></div>
			${go ? `<a class="fhd-arrow" data-go="${go}" href="javascript:void(0)">${ICON.arrow}</a>` : ""}</div>`;
	}

	hbars(rows, kind) {
		if (!rows.length) return `<div class="fhd-empty">${__("No branch assignments yet")}</div>`;
		const max = Math.max(...rows.map((r) => r.value));
		return rows
			.map(
				(r, i) => `<div class="fhd-hbar" ${tip(`${esc(r.label)}: <b>${fmt(r.value)}</b> · ${__("click to open")}`)}
					${r.label === "Other" ? "" : kind === "branch" ? nav({ list: "Employee", filters: this.emp_filters({ branch: r.label }) })
						: nav({ report: "Project Assignment Register", filters: { location: r.label } })}>
				<div class="fhd-hbar-label" dir="auto">${esc(r.label)}</div>
				<div class="fhd-hbar-track"><div class="fhd-hbar-fill" style="width:${(100 * r.value) / max}%;animation-delay:${i * 0.04}s;${r.label === "Other" ? `background:${FHD_OTHER}` : ""}"></div></div>
				<div class="fhd-hbar-val">${fmt(r.value)}</div></div>`
			)
			.join("");
	}

	ring() {
		const k = this.d.kpi;
		const total = FHD_STATUS.reduce((s, x) => s + (k[x.key] || 0), 0) || 1;
		const R = 54, C = 2 * Math.PI * R, GAP = 2;
		let offset = 0;
		const arcs = FHD_STATUS.map((s) => {
			const len = (C * (k[s.key] || 0)) / total;
			const arc = len > GAP
				? `<circle r="${R}" cx="66" cy="66" fill="none" stroke="${s.color}" stroke-width="14"
					stroke-dasharray="${len - GAP} ${C - len + GAP}" stroke-dashoffset="${-offset}"
					${tip(`${__(s.key)}: <b>${fmt(k[s.key])}</b> · ${__("click to open")}`)} ${nav({ expiry: { status: s.key } })} style="cursor:pointer"></circle>`
				: "";
			offset += len;
			return arc;
		}).join("");
		const legend = FHD_STATUS.map(
			(s) => `<div class="fhd-legend-row fhd-click" ${tip(`${__(s.key)}${s.note ? " (" + s.note + ")" : ""} · ${__("click to open")}`)} ${nav({ expiry: { status: s.key } })}><span class="fhd-dot" style="background:${s.color}"></span>
				${__(s.key)}${s.note ? ` <small class="text-muted">${s.note}</small>` : ""}<b>${fmt(k[s.key])}</b></div>`
		).join("");
		return `<div class="fhd-ring-wrap"><div class="fhd-ring"><svg width="132" height="132">
			<circle r="${R}" cx="66" cy="66" fill="none" stroke="#f0efec" stroke-width="14"></circle>${arcs}</svg>
			<div class="fhd-ring-center"><div><b>${k.valid_pct}%</b><span>${__("valid")}</span></div></div></div>
			<div class="fhd-legend">${legend}</div></div>`;
	}

	tiles() {
		const up = this.d.upcoming;
		if (!up.length) return `<div class="fhd-empty">${__("Nothing expires in the next 60 days 🎉")}</div>`;
		return `<div class="fhd-tiles">${up
			.map((r) => {
				const cls = r.days_left <= 7 ? "ink" : r.status === "Critical" ? "crit" : "warn";
				return `<a class="fhd-tile ${cls}" href="/app/${frappe.router.slug(r.doctype)}/${encodeURIComponent(r.name)}">
					<div><div class="fhd-tile-top">${esc(__(r.scope))} · ${esc(frappe.datetime.str_to_user(r.expiry_date))}</div>
					<div class="fhd-tile-name" dir="auto">${esc(r.party)}</div><div class="fhd-tile-doc">${esc(__(r.document))}</div></div>
					<div class="fhd-tile-days">${r.days_left} <small>${__("days left")}</small></div></a>`;
			})
			.join("")}</div>`;
	}

	segments(rows) {
		const total = rows.reduce((s, r) => s + r.value, 0) || 1;
		let ci = 0;
		const colored = rows.map((r) => ({ ...r, color: r.label === "Other" || r.label === "Not set" ? FHD_OTHER : FHD_CAT[ci++] }));
		const seg = colored
			.map((r) => `<div style="flex:${r.value};background:${r.color};cursor:pointer" ${tip(`${esc(r.label)}: <b>${fmt(r.value)}</b> (${Math.round((100 * r.value) / total)}%)`)} ${this.nat_nav(r.label)}></div>`)
			.join("");
		const legend = colored
			.map((r) => `<div class="fhd-legend-row fhd-click" ${this.nat_nav(r.label)}><span class="fhd-dot" style="background:${r.color}"></span>${esc(r.label)}
				<b>${fmt(r.value)} <small class="text-muted">${Math.round((100 * r.value) / total)}%</small></b></div>`)
			.join("");
		return `<div class="fhd-seg">${seg}</div><div class="fhd-legend">${legend}</div>`;
	}

	columns(rows) {
		const max = Math.max(1, ...rows.map((r) => Math.max(r.joined, r.left)));
		const step = Math.pow(10, Math.floor(Math.log10(max)));
		const top = Math.ceil(max / step) * step;
		const grid = [0.5, 1].map((f) => `<div class="fhd-gridline" style="bottom:${f * 100}%"><span>${fmt(Math.round(top * f))}</span></div>`).join("");
		const month = (m) => {
			const [y, mo] = m.split("-");
			return new Date(+y, +mo - 1, 1).toLocaleString(undefined, { month: "short" });
		};
		const cols = rows
			.map(
				(r, i) => `<div class="fhd-col" style="cursor:pointer" ${this.month_nav(r.month)} ${tip(`${month(r.month)} ${r.month.slice(0, 4)} · ${__("Joined")} <b>${r.joined}</b> · ${__("Left")} <b>${r.left}</b>`)}>
				<i style="height:${(100 * r.joined) / top}%;background:${FHD_CAT[0]};animation-delay:${i * 0.03}s"></i>
				<i style="height:${(100 * r.left) / top}%;background:${FHD_CAT[1]};animation-delay:${i * 0.03}s"></i></div>`
			)
			.join("");
		return `<div class="fhd-legend-inline"><span><span class="fhd-dot" style="background:${FHD_CAT[0]}"></span>${__("Joined")}</span>
			<span><span class="fhd-dot" style="background:${FHD_CAT[1]}"></span>${__("Left")}</span></div>
			<div class="fhd-cols">${grid}${cols}</div>
			<div class="fhd-col-labels">${rows.map((r) => `<span>${month(r.month)}</span>`).join("")}</div>`;
	}

	/* ---------- Projects ---------- */
	render_projects() {
		const d = this.d, k = d.kpi;
		const assigned = k.active - k.unassigned;
		const projects = d.projects.filter((p) => p.project !== "Not assigned");
		const max = Math.max(1, ...projects.map((p) => p.headcount));
		const card = (p, i) => `<a class="fhd-pcard" href="javascript:void(0)" data-project="${esc(p.project)}" data-search="${esc(p.project.toLowerCase())}" style="animation-delay:${Math.min(i, 12) * 0.03}s">
			<div class="fhd-pcard-top"><span class="fhd-pcard-name">${esc(p.project)}</span><span class="fhd-arrow">${ICON.arrow}</span></div>
			<div class="fhd-pcard-num">${fmt(p.headcount)} <small>${__("employees")}</small></div>
			<div class="fhd-pcard-bar"><span style="width:${(100 * p.headcount) / max}%"></span></div>
			<div class="fhd-chips">
				<span class="fhd-chip">${__("{0} sponsors", [p.branches])}</span>
				${p.iqama_expired ? `<span class="fhd-chip"><span class="fhd-dot" style="background:#d03b3b"></span>${__("Iqama expired")}: ${p.iqama_expired}</span>` : ""}
				${p.iqama_soon ? `<span class="fhd-chip"><span class="fhd-dot" style="background:#fab219"></span>${__("Iqama ≤60d")}: ${p.iqama_soon}</span>` : ""}
			</div>
			<div class="fhd-pcard-loc">${p.locations.map((l) => `<span>📍 ${esc(l.label)} · ${l.value}</span>`).join("")}</div></a>`;
		return `<div class="fhd-grid" style="margin-bottom:14px">
			<div class="fhd-card span-4 fhd-kpi-mini"><div class="fhd-card-sub">${__("Active projects")}</div><div class="fhd-big">${fmt(k.projects)}</div>
				<div class="fhd-card-sub">${__("{0} of {1} employees assigned", [fmt(assigned), fmt(k.active)])}</div>
				<div class="fhd-pcard-bar" style="margin-top:10px"><span style="width:${(100 * assigned) / (k.active || 1)}%"></span></div></div>
			<div class="fhd-card span-4 fhd-kpi-mini" data-go="unassigned" style="cursor:pointer"><div class="fhd-card-sub">${__("Not assigned to a project")}</div>
				<div class="fhd-big" style="color:#c2410c">${fmt(k.unassigned)}</div><div class="fhd-card-sub">${__("Click to review these employees")}</div></div>
			<div class="fhd-card span-4">${this.card_head(__("Top locations"), __("Employees per project location"))}${this.hbars(d.locations, "location")}</div>
		</div>
		<div class="fhd-card">
			<div class="fhd-card-head"><div><h4>${__("Projects assigned to")}</h4><div class="fhd-card-sub">${__("Click a project for its full employee list (downloadable)")}</div></div>
				<input class="fhd-filter" type="search" placeholder="${__("Filter projects…")}"></div>
			<div class="fhd-projects">${projects.map(card).join("") || `<div class="fhd-empty">${__("No projects recorded yet")}</div>`}</div>
		</div>`;
	}

	/* ---------- Documents ---------- */
	render_documents() {
		const legend = FHD_STATUS.map((s) => `<span><span class="fhd-dot" style="background:${s.color}"></span>${__(s.key)}${s.note ? ` (${s.note})` : ""}</span>`).join("");
		const rows = this.d.doc_health
			.map((d) => {
				const total = FHD_STATUS.reduce((s, x) => s + d[x.key], 0);
				const bar = FHD_STATUS.filter((s) => d[s.key])
					.map((s) => `<div style="flex:${d[s.key]};background:${s.color}" ${tip(`${esc(__(d.document))} · ${__(s.key)}: <b>${d[s.key]}</b>`)}></div>`)
					.join("");
				const bad = d.Expired + d.Critical;
				return `<div class="fhd-docrow" data-doc="${esc(d.document)}">
					<div class="name">${esc(__(d.document))}<small>${esc(__(d.scope))}${bad ? ` · ${bad} ${__("need action")}` : ""}</small></div>
					<div class="bar">${bar}</div><div class="tot">${fmt(total)}</div></div>`;
			})
			.join("");
		return `<div class="fhd-card">${this.card_head(__("Status by document"), __("Click a row to open it in the Expiry Center"), "expiry")}
			<div class="fhd-legend-inline">${legend}</div>${rows || `<div class="fhd-empty">${__("No document dates recorded")}</div>`}</div>`;
	}

	/* ---------- Branches ---------- */
	render_branches() {
		const chip = (label, days) => {
			if (days === undefined) return `<span class="fhd-chip"><span class="fhd-dot" style="background:#d6d4cc"></span>${label}: ${__("not set")}</span>`;
			const color = days < 0 ? "#d03b3b" : days <= 30 ? "#ec835a" : days <= 60 ? "#fab219" : "#0ca30c";
			const txt = days < 0 ? __("expired") : __("{0}d", [days]);
			return `<span class="fhd-chip"><span class="fhd-dot" style="background:${color}"></span>${label}: ${txt}</span>`;
		};
		const cards = this.d.branches
			.map((b) => `<a class="fhd-bcard" data-search="${esc((b.name + " " + b.company).toLowerCase())}" href="/app/branch/${encodeURIComponent(b.name)}">
				<div class="fhd-bcard-name" dir="auto">${esc(b.name)}</div><div class="fhd-bcard-co">${esc(b.company)}</div>
				<div class="fhd-bcard-num">${fmt(b.headcount)} <small>${__("employees")}</small></div>
				<div class="fhd-chips">
					${b.iqama_expired ? `<span class="fhd-chip"><span class="fhd-dot" style="background:#d03b3b"></span>${__("Iqama expired")}: ${b.iqama_expired}</span>` : ""}
					${b.iqama_soon ? `<span class="fhd-chip"><span class="fhd-dot" style="background:#fab219"></span>${__("Iqama ≤60d")}: ${b.iqama_soon}</span>` : ""}
					${chip("CR", b.docs["Commercial Registration"])}${chip("VAT", b.docs["VAT Certificate"])}
					${chip("Qiwa", b.docs["Qiwa Establishment"])}${chip("Muqeem", b.docs["Muqeem Subscription"])}
				</div></a>`)
			.join("");
		return `<div class="fhd-card" style="margin-bottom:14px;padding:12px 16px"><div class="fhd-card-head" style="margin:0;align-items:center">
			<div><h4>${__("Branches (sponsors)")}</h4><div class="fhd-card-sub">${__("Headcount, Iqama status and company document validity per branch")}</div></div>
			<input class="fhd-filter" type="search" placeholder="${__("Filter branches…")}"></div></div>
			<div class="fhd-branches">${cards}</div>`;
	}

	bind_tips($scope) {
		const $tip = this.$tip;
		$scope.find("[data-tip]")
			.on("mousemove", (e) => {
				$tip.html(e.currentTarget.getAttribute("data-tip")).css({ left: e.clientX + 14, top: e.clientY + 14, opacity: 1 });
			})
			.on("mouseleave", () => $tip.css("opacity", 0));
	}
}
