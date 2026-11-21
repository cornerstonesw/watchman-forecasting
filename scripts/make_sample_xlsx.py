"""Write scrambled sample workbooks in the same layout as the RTX files (Sheet1 + PIVOT)."""
import json, sys, openpyxl
from openpyxl.styles import Font
seed, outdir = sys.argv[1], sys.argv[2]
for s in json.load(open(seed)):
    wb = openpyxl.Workbook()
    raw = wb.active; raw.title = "Sheet1"
    raw.append(["Part", "Part Description", "Type", *s["periods"]])
    for p, d, q in s["rows"]:
        raw.append([p, d, "Awarded", *q])
    pv = wb.create_sheet("PIVOT")
    pv.append(["Type", "Awarded"]); pv.append([])
    pv.append(["Row Labels", *[f"Sum of {x}" for x in s["periods"]]])
    for c in pv[3]: c.font = Font(bold=True)
    tot = [0] * len(s["periods"])
    for p, d, q in s["rows"]:
        pv.append([p, *q]); tot = [a + (b or 0) for a, b in zip(tot, q)]
    pv.append(["Grand Total", *tot])
    mm, dd, yy = s["as_of"][5:7], s["as_of"][8:10], s["as_of"][2:4]
    wb.save(f"{outdir}/Watchman Sample Forecast_{mm}.{dd}.{yy} (scrambled).xlsx")
print("ok")
