frappe.pages["nitaqat-dashboard"].on_page_load = function (wrapper) {
	const page = frappe.ui.make_app_page({ parent: wrapper, title: __("Nitaqat Dashboard"), single_column: true });
	wrapper.nq = new NitaqatDashboard(page);
};
frappe.pages["nitaqat-dashboard"].on_page_show = function (wrapper) {
	wrapper.nq && wrapper.nq.load();
};

const nq_esc = (v) => frappe.utils.escape_html(v == null ? "" : String(v));
const nq_tip = (html) => `data-tip="${frappe.utils.escape_html(html)}"`;
const NQ_BANDS = ["Platinum", "High Green", "Medium Green", "Low Green", "Red"];
const NQ_BAND_COLOR = { Platinum: "#6250d6", "High Green": "#0ca30c", "Medium Green": "#1baf7a", "Low Green": "#86c56b", Red: "#d03b3b", "": "#c9c7bf" };
const NQ_STATE = [
	{ key: "Below target", color: "#d03b3b", cls: "below" },
	{ key: "On target", color: "#0ca30c", cls: "on" },
	{ key: "No target", color: "#b5b3ab", cls: "none" },
];
const NQ_SIZES = ["Micro", "Small", "Medium", "Large", "Giant"];

class NitaqatDashboard {
	constructor(page) {
		this.page = page;
		page.wrapper.find(".page-head").hide();
		this.state = {
			company: "",
			default_target: localStorage.getItem("falcon_nitaqat_default") || "",
			q: "",
			status: "",
			band: "",
			size: "",
			sort: "needed",
			staffed: true,
			help: localStorage.getItem("falcon_nitaqat_help") !== "closed",
		};
		this.$root = $('<div class="fnq"></div>').appendTo(page.main);
		this.$tip = $('<div class="fnq-tipbox"></div>').appendTo(document.body);
	}

	load() {
		frappe
			.call("falcon_hr.api.nitaqat.get_nitaqat", { company: this.state.company, default_target: this.state.default_target })
			.then((r) => {
				this.d = r.message;
				this.render();
			});
	}

	emp_list(extra) {
		const f = { status: "Active", ...extra };
		if (this.state.company) f.company = this.state.company;
		frappe.set_route("List", "Employee", f);
	}

	filtered() {
		const s = this.state, q = s.q;
		let rows = this.d.rows.filter(
			(r) =>
				(!s.staffed || r.total) &&
				(!s.status || r.state === s.status) &&
				(!s.band || (s.band === "__none" ? !r.band : r.band === s.band)) &&
				(!s.size || r.size === s.size) &&
				(!q || `${r.branch} ${r.company} ${r.activity}`.toLowerCase().includes(q))
		);
		const by = {
			needed: (a, b) => b.needed - a.needed || b.total - a.total,
			pct_low: (a, b) => a.pct - b.pct || b.total - a.total,
			pct_high: (a, b) => b.pct - a.pct,
			total: (a, b) => b.total - a.total,
			name: (a, b) => a.branch.localeCompare(b.branch),
		};
		return rows.sort(by[s.sort] || by.needed);
	}

	render() {
		const s = this.d.summary;
		const st = this.state;
		this.$root.html(`
			<div class="fnq-head"><div>
				<h1 class="fnq-title">${__("Nitaqat Dashboard")}</h1>
				<div class="fnq-sub">${__("Saudization of every sponsoring branch compared with its target band.")}</div></div>
				<div class="fnq-actions">
					<button class="fnq-btn" data-act="help">${st.help ? __("Hide guide") : __("How to read this page")}</button>
					<button class="fnq-btn" data-act="csv">${__("Download CSV")}</button>
					<button class="fnq-btn" data-act="report">${__("Branch Workforce Summary")}</button>
					<button class="fnq-btn dark" data-act="pdf">${__("Monthly PDF")}</button>
				</div></div>
			${st.help ? this.help_html() : ""}
			<div class="fnq-tiles">
				<div class="fnq-tile hero" data-tile="all" ${nq_tip(__("Saudi employees ÷ all active employees, company-wide"))}>
					<div class="l">${__("Overall Saudization")}</div><div class="v">${s.pct}%</div><div class="h">${__("{0} Saudi of {1} active", [s.saudi, s.total])}</div></div>
				<div class="fnq-tile green" data-tile="saudi"><div class="l">${__("Saudi employees")}</div><div class="v">${s.saudi}</div><div class="h">${__("{0} non-Saudi", [s.non_saudi])}</div></div>
				<div class="fnq-tile rose" data-tile="below"><div class="l">${__("Branches below target")}</div><div class="v">${s.below}</div><div class="h">${__("{0} on target", [s.on_target])}</div></div>
				<div class="fnq-tile sand" data-tile="below" ${nq_tip(__("New Saudi hires needed so that every branch reaches its target"))}>
					<div class="l">${__("Saudis needed")}</div><div class="v">${s.needed}</div><div class="h">${__("to bring every branch to target")}</div></div>
				<div class="fnq-tile" data-tile="notarget"><div class="l">${__("Branches without a target")}</div><div class="v">${s.no_target}</div><div class="h">${__("{0} employees have no branch", [s.unassigned])}</div></div>
			</div>
			<div class="fnq-bar">
				<div class="fnq-search"><input type="search" placeholder="${__("Search branch, company or activity…")}" value="${nq_esc(st.q)}"></div>
				<div data-c="company"></div>
				<div data-c="default_target"></div>
				<select class="fnq-sel" data-f="status">
					<option value="">${__("All statuses")}</option>
					${NQ_STATE.map((x) => `<option value="${x.key}" ${st.status === x.key ? "selected" : ""}>${__(x.key)}</option>`).join("")}
				</select>
				<select class="fnq-sel" data-f="band">
					<option value="">${__("All bands")}</option>
					${NQ_BANDS.map((b) => `<option value="${b}" ${st.band === b ? "selected" : ""}>${__(b)}</option>`).join("")}
					<option value="__none" ${st.band === "__none" ? "selected" : ""}>${__("Band not recorded")}</option>
				</select>
				<select class="fnq-sel" data-f="size">
					<option value="">${__("All sizes")}</option>
					${NQ_SIZES.map((z) => `<option value="${z}" ${st.size === z ? "selected" : ""}>${__(z)}</option>`).join("")}
				</select>
				<select class="fnq-sel" data-f="sort">
					${[["needed", __("Sort: Saudis needed")], ["pct_low", __("Sort: lowest Saudization")], ["pct_high", __("Sort: highest Saudization")], ["total", __("Sort: most employees")], ["name", __("Sort: name")]]
						.map(([v, l]) => `<option value="${v}" ${st.sort === v ? "selected" : ""}>${l}</option>`).join("")}
				</select>
				<label class="fnq-toggle"><input type="checkbox" ${st.staffed ? "checked" : ""}> ${__("Only branches with staff")}</label>
				<button class="fnq-link" data-act="clear">${__("Clear filters")}</button>
			</div>
			<div class="fnq-charts"></div>
			<div class="fnq-listhead"><b class="fnq-count"></b></div>
			<div class="fnq-grid"></div>
			<div class="fnq-note">${__("Size classes and Saudis needed are calculated from active employees and the target you set; Qiwa remains the official source for your band.")}</div>`);

		const mk = (f, df) => {
			const c = frappe.ui.form.make_control({
				parent: this.$root.find(`[data-c="${f}"]`),
				df: {
					fieldname: f,
					...df,
					change: () => {
						const v = c.get_value() || "";
						if (String(v) !== String(this.state[f])) {
							this.state[f] = v;
							if (f === "default_target") localStorage.setItem("falcon_nitaqat_default", v);
							this.load();
						}
					},
				},
				render_input: true,
			});
			c.$input && c.$input.attr("placeholder", df.label);
			c.set_value(this.state[f]);
		};
		mk("company", { fieldtype: "Link", options: "Company", label: __("Company") });
		mk("default_target", { fieldtype: "Percent", label: __("Default target %") });

		this.$root.find(".fnq-search input").on("input", (e) => {
			this.state.q = e.target.value.toLowerCase();
			this.render_body();
		});
		this.$root.find(".fnq-sel").on("change", (e) => {
			this.state[e.target.dataset.f] = e.target.value;
			this.render_body();
		});
		this.$root.find(".fnq-toggle input").on("change", (e) => {
			this.state.staffed = e.target.checked;
			this.render_body();
		});
		this.$root.find("[data-tile]").on("click", (e) => {
			const t = $(e.currentTarget).data("tile");
			if (t === "all") this.emp_list({});
			if (t === "saudi") this.emp_list({ custom_employee_category: "Saudi" });
			if (t === "below") this.set_filter("status", "Below target");
			if (t === "notarget") this.set_filter("status", "No target");
		});
		this.$root.find("[data-act]").on("click", (e) => this.action($(e.currentTarget).data("act")));
		this.render_body();
	}

	help_html() {
		return `<div class="fnq-help">
			<div class="fnq-help-grid">
				<div><b>${__("Saudization %")}</b><p>${__("Saudi employees ÷ all active employees of the branch. Saudi = Employee Category “Saudi” or nationality Saudi Arabia.")}</p></div>
				<div><b>${__("Target %")}</b><p>${__("The Saudization % the branch must keep for the band you want (from Qiwa). Enter it on Branch → Nitaqat (Saudization). Branches without one use the Default target % above.")}</p></div>
				<div><b>${__("Saudis needed")}</b><p>${__("How many Saudis to hire to reach the target. Each hire also adds to the headcount, so it is slightly more than “target × headcount − Saudis”.")}</p></div>
				<div><b>${__("Status")}</b><p><span class="fnq-dot" style="background:#d03b3b"></span>${__("Below target")} · <span class="fnq-dot" style="background:#0ca30c"></span>${__("On target")} · <span class="fnq-dot" style="background:#b5b3ab"></span>${__("No target (enter one on the branch or set a default)")}</p></div>
				<div><b>${__("Band")}</b><p>${__("Platinum, High / Medium / Low Green and Red are Qiwa's Nitaqat bands. Record the band shown on Qiwa on each branch so you can filter by it.")}</p></div>
				<div><b>${__("Size")}</b><p>${__("Micro 1–5 · Small 6–49 · Medium 50–499 · Large 500–2,999 · Giant 3,000+ employees (approximate Nitaqat size classes).")}</p></div>
			</div>
			<div class="fnq-help-foot">${__("The black line on each bar is the target. Click any tile, bar, chart slice or chip to drill down.")}</div>
		</div>`;
	}

	set_filter(k, v) {
		this.state[k] = v;
		this.$root.find(`.fnq-sel[data-f="${k}"]`).val(v);
		this.render_body();
	}

	action(a) {
		if (a === "help") {
			this.state.help = !this.state.help;
			localStorage.setItem("falcon_nitaqat_help", this.state.help ? "open" : "closed");
			this.render();
		}
		if (a === "report") frappe.set_route("query-report", "Branch Workforce Summary");
		if (a === "pdf") falcon_monthly_pdf_dialog();
		if (a === "clear") {
			Object.assign(this.state, { q: "", status: "", band: "", size: "", sort: "needed", staffed: true });
			this.render();
		}
		if (a === "csv") {
			const head = ["Branch", "Company", "Activity", "Band", "Size", "Employees", "Saudi", "Non-Saudi", "Saudization %", "Target %", "Saudis needed", "Status", "Last checked on Qiwa"];
			const body = this.filtered().map((r) => [r.branch, r.company, r.activity, r.band, r.size, r.total, r.saudi, r.non_saudi, r.pct, r.target, r.needed, r.state, r.last_checked]);
			frappe.tools.downloadify([head].concat(body), null, "Nitaqat");
		}
	}

	render_body() {
		const rows = this.filtered();
		this.$root.find(".fnq-count").text(__("{0} branches", [rows.length]));
		this.render_charts(rows);
		this.render_cards(rows);
		this.bind_tips();
	}

	render_charts(rows) {
		// 1) Saudization vs target per branch (top 12 by headcount in the current filter)
		const top = rows.slice().sort((a, b) => b.total - a.total).slice(0, 12);
		const scale = Math.min(100, Math.ceil(Math.max(...top.map((r) => Math.max(r.pct, r.target || 0)), 10) / 10) * 10 + 10);
		const bars = top
			.map((r) => {
				const color = r.state === "Below target" ? "#d03b3b" : r.state === "On target" ? "#0ca30c" : "#b5b3ab";
				return `<div class="fnq-hrow" data-branch="${nq_esc(r.branch)}" ${nq_tip(`${nq_esc(r.branch)}<br>${__("Saudization")}: <b>${r.pct}%</b> · ${__("Target")}: <b>${r.target || "—"}%</b> · ${__("Saudis needed")}: <b>${r.needed}</b>`)}>
				<div class="fnq-hlabel" dir="auto">${nq_esc(r.branch)}</div>
				<div class="fnq-htrack"><span style="width:${(Math.min(r.pct, scale) / scale) * 100}%;background:${color}"></span>
					${r.target ? `<i style="inset-inline-start:${(Math.min(r.target, scale) / scale) * 100}%"></i>` : ""}</div>
				<div class="fnq-hval">${r.pct}%</div></div>`;
			})
			.join("");

		// 2) status donut
		const counts = NQ_STATE.map((x) => ({ ...x, n: rows.filter((r) => r.state === x.key).length }));
		const tot = counts.reduce((a, x) => a + x.n, 0) || 1;
		const R = 46, C = 2 * Math.PI * R;
		let off = 0;
		const arcs = counts
			.map((x) => {
				const len = (C * x.n) / tot;
				const a = len > 1.5 ? `<circle r="${R}" cx="56" cy="56" fill="none" stroke="${x.color}" stroke-width="13" stroke-dasharray="${len - 1.5} ${C - len + 1.5}" stroke-dashoffset="${-off}" data-state="${x.key}" style="cursor:pointer" ${nq_tip(`${__(x.key)}: <b>${x.n}</b>`)}></circle>` : "";
				off += len;
				return a;
			})
			.join("");
		const legend = counts
			.map((x) => `<div class="fnq-lg" data-state="${x.key}"><span class="fnq-dot" style="background:${x.color}"></span>${__(x.key)}<b>${x.n}</b></div>`)
			.join("");

		// 3) bands and 4) sizes
		const bandRows = NQ_BANDS.concat([""]).map((b) => ({ b, n: rows.filter((r) => (r.band || "") === b).length }));
		const bmax = Math.max(1, ...bandRows.map((x) => x.n));
		const bandBars = bandRows
			.map((x) => `<div class="fnq-vrow" data-band="${x.b || "__none"}" ${nq_tip(`${x.b ? __(x.b) : __("Band not recorded")}: <b>${x.n}</b>`)}>
				<div class="fnq-vlabel">${x.b ? __(x.b) : __("Not recorded")}</div>
				<div class="fnq-vtrack"><span style="width:${(x.n / bmax) * 100}%;background:${NQ_BAND_COLOR[x.b]}"></span></div><b>${x.n}</b></div>`)
			.join("");
		const sizeRows = NQ_SIZES.map((z) => ({
			z,
			n: rows.filter((r) => r.size === z).length,
			saudi: rows.filter((r) => r.size === z).reduce((a, r) => a + r.saudi, 0),
			total: rows.filter((r) => r.size === z).reduce((a, r) => a + r.total, 0),
		})).filter((x) => x.n);
		const smax = Math.max(1, ...sizeRows.map((x) => x.total));
		const sizeBars = sizeRows
			.map((x) => `<div class="fnq-vrow" data-size="${x.z}" ${nq_tip(`${__(x.z)}: <b>${x.n}</b> ${__("branches")} · ${x.saudi} / ${x.total} ${__("Saudi")}`)}>
				<div class="fnq-vlabel">${__(x.z)} <small>(${x.n})</small></div>
				<div class="fnq-vtrack fnq-stack"><span style="width:${(x.saudi / smax) * 100}%;background:#0ca30c"></span><span style="width:${((x.total - x.saudi) / smax) * 100}%;background:#c9c7bf"></span></div>
				<b>${x.total}</b></div>`)
			.join("");

		this.$root.find(".fnq-charts").html(`
			<div class="fnq-card fnq-chart span-7"><div class="fnq-ch"><b>${__("Saudization vs target")}</b><small>${__("Largest branches in the current filter · black line = target")}</small></div>
				${bars || `<div class="fnq-empty">${__("No branches match")}</div>`}</div>
			<div class="fnq-card fnq-chart span-5"><div class="fnq-ch"><b>${__("Branch status")}</b><small>${__("Click a colour to filter")}</small></div>
				<div class="fnq-donut"><svg width="112" height="112" viewBox="0 0 112 112" style="transform:rotate(-90deg)"><circle r="${R}" cx="56" cy="56" fill="none" stroke="#f0efec" stroke-width="13"></circle>${arcs}</svg>
				<div class="fnq-legend">${legend}</div></div></div>
			<div class="fnq-card fnq-chart span-6"><div class="fnq-ch"><b>${__("Nitaqat band (from Qiwa)")}</b><small>${__("Branches per band · click to filter")}</small></div>${bandBars}</div>
			<div class="fnq-card fnq-chart span-6"><div class="fnq-ch"><b>${__("Size class")}</b><small>${__("Employees per size · green = Saudi")}</small></div>${sizeBars || `<div class="fnq-empty">—</div>`}</div>`);

		const $c = this.$root.find(".fnq-charts");
		$c.find("[data-branch]").on("click", (e) => frappe.set_route("Form", "Branch", e.currentTarget.dataset.branch));
		$c.find("[data-state]").on("click", (e) => this.set_filter("status", e.currentTarget.dataset.state));
		$c.find("[data-band]").on("click", (e) => this.set_filter("band", e.currentTarget.dataset.band));
		$c.find("[data-size]").on("click", (e) => this.set_filter("size", e.currentTarget.dataset.size));
	}

	render_cards(rows) {
		const $g = this.$root.find(".fnq-grid");
		if (!rows.length) {
			$g.html(`<div class="fnq-empty">${__("No branches match these filters.")}</div>`);
			return;
		}
		$g.html(
			rows
				.map((r, i) => {
					const stt = NQ_STATE.find((x) => x.key === r.state) || NQ_STATE[2];
					const scale = Math.max(r.target || 0, r.pct, 10) * 1.25;
					return `<div class="fnq-card" style="animation-delay:${Math.min(i, 12) * 0.03}s">
				<div class="fnq-card-top"><div class="fnq-namewrap">
					<a class="fnq-name" dir="auto" title="${nq_esc(r.branch)}" href="/app/branch/${encodeURIComponent(r.branch)}">${nq_esc(r.branch)}</a>
					<div class="fnq-co" title="${nq_esc(r.company)}">${nq_esc(r.company)}${r.activity ? " · " + nq_esc(r.activity) : ""}</div></div>
					<span class="fnq-state ${stt.cls}">${nq_esc(__(r.state))}</span></div>
				<div class="fnq-pct">${r.pct}% <small>${r.target ? __("target {0}%", [r.target]) + (r.target_source === "default" ? " " + __("(default)") : "") : __("no target set")}</small></div>
				<div class="fnq-meter"><span style="width:${Math.min(100, (r.pct / scale) * 100)}%;background:${stt.color}"></span>${r.target ? `<i style="inset-inline-start:${(r.target / scale) * 100}%"></i>` : ""}</div>
				<div class="fnq-facts">
					<span class="fnq-chip" data-emp='${nq_esc(JSON.stringify({ branch: r.branch }))}'>${__("{0} employees", [r.total])}</span>
					<span class="fnq-chip" data-emp='${nq_esc(JSON.stringify({ branch: r.branch, custom_employee_category: "Saudi" }))}'>${__("{0} Saudi", [r.saudi])}</span>
					${r.size ? `<span class="fnq-chip">${nq_esc(__(r.size))}</span>` : ""}
					${r.band ? `<span class="fnq-chip" style="background:${NQ_BAND_COLOR[r.band] || "#999"};color:#fff">${nq_esc(__(r.band))}</span>` : `<span class="fnq-chip muted">${__("Band not recorded")}</span>`}
					${r.needed ? `<span class="fnq-chip need">${__("Hire {0} Saudi", [r.needed])}</span>` : ""}
				</div></div>`;
				})
				.join("")
		);
		$g.find("[data-emp]").on("click", (e) => this.emp_list(JSON.parse(e.currentTarget.getAttribute("data-emp"))));
	}

	bind_tips() {
		const $t = this.$tip;
		this.$root.find("[data-tip]").off("mousemove.nq mouseleave.nq")
			.on("mousemove.nq", (e) => $t.html(e.currentTarget.getAttribute("data-tip")).css({ left: e.clientX + 14, top: e.clientY + 14, opacity: 1 }))
			.on("mouseleave.nq", () => $t.css("opacity", 0));
	}
}
