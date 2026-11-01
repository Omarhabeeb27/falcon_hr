"""Nitaqat (Saudization) per sponsoring branch."""

import math

import frappe
from frappe.utils import flt

from falcon_hr.api.common import is_saudi, safe_list

# Approximate Nitaqat size classes by headcount (for orientation only; Qiwa is the source of truth).
SIZES = [(5, "Micro"), (49, "Small"), (499, "Medium"), (2999, "Large"), (10**9, "Giant")]


def size_class(n):
	return next(label for limit, label in SIZES if n <= limit)


def saudis_needed(total, saudi, target_pct):
	"""Saudis to hire (each hire adds to the total too) to reach target_pct."""
	p = flt(target_pct) / 100.0
	if not total or p <= 0 or saudi / total >= p:
		return 0
	if p >= 1:
		return total - saudi
	return max(0, math.ceil((p * total - saudi) / (1 - p) - 1e-9))


@frappe.whitelist()
def get_nitaqat(company=None, default_target=None):
	default_target = flt(default_target)
	bf = {"custom_company": company} if company else {}
	branches = safe_list(
		"Branch",
		filters=bf,
		fields=[
			"name",
			"custom_company",
			"custom_nitaqat_activity",
			"custom_nitaqat_band",
			"custom_nitaqat_target_pct",
			"custom_nitaqat_last_checked",
		],
	)
	ef = {"status": "Active"}
	if company:
		ef["company"] = company
	emps = safe_list(
		"Employee", filters=ef, fields=["name", "branch", "custom_employee_category", "custom_nationality"]
	)
	stats = {}
	for e in emps:
		s = stats.setdefault(e.branch or "", {"total": 0, "saudi": 0})
		s["total"] += 1
		s["saudi"] += 1 if is_saudi(e) else 0

	rows = []
	for b in branches:
		s = stats.get(b.name, {"total": 0, "saudi": 0})
		target = flt(b.custom_nitaqat_target_pct) or default_target
		pct = flt(100.0 * s["saudi"] / s["total"], 1) if s["total"] else 0
		need = saudis_needed(s["total"], s["saudi"], target)
		rows.append(
			{
				"branch": b.name,
				"company": b.custom_company or "",
				"activity": b.custom_nitaqat_activity or "",
				"band": b.custom_nitaqat_band or "",
				"last_checked": str(b.custom_nitaqat_last_checked or ""),
				"total": s["total"],
				"saudi": s["saudi"],
				"non_saudi": s["total"] - s["saudi"],
				"pct": pct,
				"target": target,
				"target_source": "branch"
				if flt(b.custom_nitaqat_target_pct)
				else ("default" if target else ""),
				"needed": need,
				"size": size_class(s["total"]) if s["total"] else "",
				"state": "No staff"
				if not s["total"]
				else ("No target" if not target else ("Below target" if need else "On target")),
			}
		)
	rows.sort(key=lambda r: (-r["needed"], -r["total"]))
	total = sum(s["total"] for s in stats.values())
	saudi = sum(s["saudi"] for s in stats.values())
	return {
		"rows": rows,
		"summary": {
			"total": total,
			"saudi": saudi,
			"non_saudi": total - saudi,
			"pct": flt(100.0 * saudi / total, 1) if total else 0,
			"below": sum(1 for r in rows if r["state"] == "Below target"),
			"on_target": sum(1 for r in rows if r["state"] == "On target"),
			"no_target": sum(1 for r in rows if r["state"] == "No target"),
			"needed": sum(r["needed"] for r in rows),
			"unassigned": stats.get("", {}).get("total", 0),
			"unassigned_saudi": stats.get("", {}).get("saudi", 0),
		},
	}
