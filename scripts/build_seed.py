"""Build a scrambled seed from the real RTX forecast files.

- Reads the PIVOT sheet of each file (same rule as the app's importer).
- Descriptions come from Sheet1 (column B), kept as-is.
- Part numbers keep their shape (letters, dashes, length) but every digit is
  replaced, consistently per part across all files.
- Quantities are multiplied by a per-part factor (0.55 - 1.6), the same in
  every file, so each part's ups/downs/new/removed pattern is preserved.

Usage: python3 -I build_seed.py <out.json> <file1.xlsx> [file2.xlsx ...]
"""
import hashlib, json, random, re, sys
import openpyxl


def as_of_from_name(name):
    m = re.search(r"(\d{1,2})[._-](\d{1,2})[._-](\d{2,4})", name)
    mm, dd, yy = m.groups()
    yy = int(yy) + (2000 if len(yy) == 2 else 0)
    return f"{yy:04d}-{int(mm):02d}-{int(dd):02d}"


def read_pivot(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    name = next(n for n in wb.sheetnames if n.strip().lower() == "pivot")
    ws = wb[name]
    header, rows = None, []
    for r in ws.iter_rows(values_only=True):
        first = str(r[0] or "").strip()
        if header is None:
            if first.lower() == "row labels":
                header = [str(c).strip() for c in r[1:] if c is not None and str(c).strip()]
                header = [h for h in header if h.lower() != "grand total"]
            continue
        if not first:
            continue
        if first.lower() == "grand total":
            break
        rows.append((first, [r[1 + i] for i in range(len(header))]))
    periods = [re.sub(r"^sum of\s*", "", h, flags=re.I).strip() for h in header]
    descr = {}
    if "Sheet1" in wb.sheetnames:
        blank = 0
        for r in wb["Sheet1"].iter_rows(min_row=2, max_col=2, values_only=True):
            if not r[0]:
                blank += 1
                if blank > 200:
                    break
                continue
            blank = 0
            descr.setdefault(str(r[0]).strip(), (str(r[1]).strip() if r[1] else None))
    wb.close()
    return periods, rows, descr


def scramble_run(run, salt):
    # same digit run -> same scrambled run, so part families keep a shared prefix
    rnd = random.Random(hashlib.sha256(f"wf-{salt}-{run}".encode()).hexdigest())
    first = rnd.randint(1, 9) if run[0] != "0" else (rnd.randint(0, 9) if salt else 0)
    return str(first) + "".join(str(rnd.randint(0, 9)) for _ in run[1:])


def scramble_part(part, used):
    runs = re.split(r"(\d+)", part)
    for salt in range(50):
        # only the last digit run gets a salt when a collision forces a retry
        last = max(i for i, t in enumerate(runs) if t.isdigit()) if any(t.isdigit() for t in runs) else -1
        s = "".join(scramble_run(t, salt if (i == last or salt >= 10) else 0) if t.isdigit() else t
                    for i, t in enumerate(runs))
        if s not in used and s != part:
            used.add(s)
            return s
    raise RuntimeError(part)


def main():
    out, files = sys.argv[1], sys.argv[2:]
    snaps, all_descr = [], {}
    for f in files:
        periods, rows, descr = read_pivot(f)
        all_descr.update({k: v for k, v in descr.items() if v})
        snaps.append({"file": f.split("/")[-1], "as_of": as_of_from_name(f), "periods": periods, "rows": rows})
        print(f, len(rows), "parts", len(periods), "periods", periods[0], "...", periods[-1], file=sys.stderr)

    used, pmap, factor = set(), {}, {}
    for p in sorted({p for s in snaps for p, _ in s["rows"]}):
        pmap[p] = scramble_part(p, used)
        rnd = random.Random(hashlib.sha256(f"qty-{p}".encode()).hexdigest())
        factor[p] = rnd.uniform(0.55, 1.6)

    def q(v, p):
        v = float(v or 0)
        if v == 0:
            return 0
        x = v * factor[p]
        return round(x) if abs(v - round(v)) < 1e-9 else round(x, 2)

    result = []
    for s in snaps:
        rows = [[pmap[p], all_descr.get(p), [q(v, p) for v in vals]] for p, vals in s["rows"]]
        result.append({"file": s["file"], "as_of": s["as_of"], "periods": s["periods"], "rows": rows})
    json.dump(result, open(out, "w"), separators=(",", ":"))
    found = sum(1 for p in pmap if p in all_descr)
    print("parts", len(pmap), "with descr", found, file=sys.stderr)
    for p in list(pmap)[:5]:
        print(" ", p, "->", pmap[p], "|", all_descr.get(p), file=sys.stderr)


main()
