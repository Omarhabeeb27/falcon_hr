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
const fmt = (n) => (n || 0).toLocaleString();
const ICON = {
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
		this.$root = $('<div class="fhd"></div>').appendTo(page.main);
		this.$tip = $('<div class="fhd-tip"></div>').appendTo(document.body);
		page.wrapper.find(".page-head").hide();
	}

	load() {
		frappe.call("falcon_hr.api.dashboard.get_dashboard").then((r) => {
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
					<button class="fhd-btn dark" data-go="expiry">${__("Expiry Center")}</button>
				</div>
			</div>
			<div class="fhd-kpis">
				${this.kpi("hero", ICON.users, __("Active employees"), fmt(k.active), __("{0} left", [fmt(k.left)]), "employee")}
				${this.kpi("blue", ICON.building, __("Branches"), fmt(k.branches), __("{0} with staff", [fmt(k.branches_staffed)]), "branch")}
				${this.kpi("sand", ICON.clock, __("Expiring in 60 days"), fmt(soon), __("{0} within 30 days", [fmt(k.Critical)]), "soon")}
				${this.kpi("rose", ICON.alert, __("Expired documents"), fmt(k.Expired), __("{0}% of documents valid", [k.valid_pct]), "expired")}
			</div>
			<div class="fhd-tabs">
				<span class="fhd-pill"></span>
				<button class="fhd-tab" data-tab="overview">${__("Overview")}</button>
				<button class="fhd-tab" data-tab="documents">${__("Documents")}</button>
				<button class="fhd-tab" data-tab="branches">${__("Branches")}</button>
			</div>
			<div class="fhd-body"></div>`);

		this.$root.find("[data-go]").on("click", (e) => this.go($(e.currentTarget).data("go")));
		this.$root.find(".fhd-tab").on("click", (e) => this.set_tab($(e.currentTarget).data("tab")));
		this.set_tab(this.tab, true);
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
			employee: () => frappe.set_route("List", "Employee", { status: "Active" }),
			branch: () => frappe.set_route("List", "Branch"),
			expiry: () => frappe.set_route("expiry-center"),
			soon: () => { frappe.route_options = { status: "Critical" }; frappe.set_route("expiry-center"); },
			expired: () => { frappe.route_options = { status: "Expired" }; frappe.set_route("expiry-center"); },
			nobranch: () => frappe.set_route("List", "Employee", { status: "Active", branch: ["is", "not set"] }),
			doc: () => { frappe.route_options = { document: extra }; frappe.set_route("expiry-center"); },
		};
		routes[target] && routes[target]();
	}

	set_tab(tab, instant) {
		this.tab = tab;
		const $tabs = this.$root.find(".fhd-tab").removeClass("active");
		const $t = $tabs.filter(`[data-tab="${tab}"]`).addClass("active");
		const $pill = this.$root.find(".fhd-pill");
		if (instant) $pill.css("transition", "none");
		$pill.css({ left: $t.position().left, width: $t.outerWidth() });
		if (instant) setTimeout(() => $pill.css("transition", ""), 30);
		const $body = this.$root.find(".fhd-body");
		$body.html(this[`render_${tab}`]());
		this.bind_tips($body);
		$body.find("[data-doc]").on("click", (e) => this.go("doc", $(e.currentTarget).data("doc")));
		$body.find("[data-go]").on("click", (e) => this.go($(e.currentTarget).data("go")));
	}

	/* ---------- Overview ---------- */
	render_overview() {
		const d = this.d;
		const banner = d.kpi.no_branch
			? `<div class="fhd-banner"><span>⚠️ ${__("{0} active employees have no Branch (sponsor) set, so branch figures below leave them out.", [fmt(d.kpi.no_branch)])}</span>
				<button class="fhd-btn" data-go="nobranch">${__("Fix now")}</button></div>`
			: "";
		return `${banner}<div class="fhd-grid">
			<div class="fhd-card span-7">${this.card_head(__("Headcount by branch"), __("Active employees per sponsoring branch"))}${this.hbars(d.headcount)}</div>
			<div class="fhd-card span-5">${this.card_head(__("Document health"), __("All employee + branch documents"))}${this.ring()}</div>
			<div class="fhd-card span-8">${this.card_head(__("Upcoming expiries"), __("Next 60 days, soonest first"), "expiry")}${this.tiles()}</div>
			<div class="fhd-card span-4">${this.card_head(__("Nationality mix"), __("Active employees"))}${this.segments(d.nationality)}</div>
			<div class="fhd-card span-12">${this.card_head(__("Joiners and leavers"), __("Last 12 months"))}${this.columns(d.joiners)}</div>
		</div>`;
	}

	card_head(title, sub, go) {
		return `<div class="fhd-card-head"><div><h4>${title}</h4><div class="fhd-card-sub">${sub}</div></div>
			${go ? `<a class="fhd-arrow" data-go="${go}" href="javascript:void(0)">${ICON.arrow}</a>` : ""}</div>`;
	}

	hbars(rows) {
		if (!rows.length) return `<div class="fhd-empty">${__("No branch assignments yet")}</div>`;
		const max = Math.max(...rows.map((r) => r.value));
		return rows
			.map(
				(r, i) => `<div class="fhd-hbar" ${tip(`${esc(r.label)}: <b>${fmt(r.value)}</b>`)}>
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
					${tip(`${__(s.key)}: <b>${fmt(k[s.key])}</b>`)}></circle>`
				: "";
			offset += len;
			return arc;
		}).join("");
		const legend = FHD_STATUS.map(
			(s) => `<div class="fhd-legend-row" ${tip(`${__(s.key)}${s.note ? " (" + s.note + ")" : ""}`)}><span class="fhd-dot" style="background:${s.color}"></span>
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
			.map((r) => `<div style="flex:${r.value};background:${r.color}" ${tip(`${esc(r.label)}: <b>${fmt(r.value)}</b> (${Math.round((100 * r.value) / total)}%)`)}></div>`)
			.join("");
		const legend = colored
			.map((r) => `<div class="fhd-legend-row"><span class="fhd-dot" style="background:${r.color}"></span>${esc(r.label)}
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
				(r, i) => `<div class="fhd-col" ${tip(`${month(r.month)} ${r.month.slice(0, 4)} · ${__("Joined")} <b>${r.joined}</b> · ${__("Left")} <b>${r.left}</b>`)}>
				<i style="height:${(100 * r.joined) / top}%;background:${FHD_CAT[0]};animation-delay:${i * 0.03}s"></i>
				<i style="height:${(100 * r.left) / top}%;background:${FHD_CAT[1]};animation-delay:${i * 0.03}s"></i></div>`
			)
			.join("");
		return `<div class="fhd-legend-inline"><span><span class="fhd-dot" style="background:${FHD_CAT[0]}"></span>${__("Joined")}</span>
			<span><span class="fhd-dot" style="background:${FHD_CAT[1]}"></span>${__("Left")}</span></div>
			<div class="fhd-cols">${grid}${cols}</div>
			<div class="fhd-col-labels">${rows.map((r) => `<span>${month(r.month)}</span>`).join("")}</div>`;
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
			.map((b) => `<a class="fhd-bcard" href="/app/branch/${encodeURIComponent(b.name)}">
				<div class="fhd-bcard-name" dir="auto">${esc(b.name)}</div><div class="fhd-bcard-co">${esc(b.company)}</div>
				<div class="fhd-bcard-num">${fmt(b.headcount)} <small>${__("employees")}</small></div>
				<div class="fhd-chips">
					${b.iqama_expired ? `<span class="fhd-chip"><span class="fhd-dot" style="background:#d03b3b"></span>${__("Iqama expired")}: ${b.iqama_expired}</span>` : ""}
					${b.iqama_soon ? `<span class="fhd-chip"><span class="fhd-dot" style="background:#fab219"></span>${__("Iqama ≤60d")}: ${b.iqama_soon}</span>` : ""}
					${chip("CR", b.docs["Commercial Registration"])}${chip("VAT", b.docs["VAT Certificate"])}
					${chip("Qiwa", b.docs["Qiwa Establishment"])}${chip("Muqeem", b.docs["Muqeem Subscription"])}
				</div></a>`)
			.join("");
		return `<div class="fhd-branches">${cards}</div>`;
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
