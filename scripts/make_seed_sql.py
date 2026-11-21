"""Write supabase/seed/*.sql from seed.json + the Base44 exports.
Usage: python3 -I make_seed_sql.py <seed.json> <AppUser.csv> <QuestionLog.csv> <outdir>
"""
import csv, json, sys, os

seed, users_csv, q_csv, outdir = sys.argv[1:5]
os.makedirs(outdir, exist_ok=True)


def lit(s):
    return "null" if s is None else "'" + str(s).replace("'", "''") + "'"


TENANT = "00000000-0000-4000-8000-0000000000c1"
DATASET = "00000000-0000-4000-8000-0000000000d1"

out = [
    "-- CDI Industries: tenant, dataset, members (from the Base44 AppUser export)",
    f"insert into tenant (id, code, name) values ('{TENANT}', 'cdi', 'CDI Industries') on conflict do nothing;",
    f"insert into security_settings (tenant_id) values ('{TENANT}') on conflict do nothing;",
    f"insert into dataset (id, tenant_id, name, customer) values ('{DATASET}', '{TENANT}', 'SMI Forecast', 'RTX (Raytheon)') on conflict do nothing;",
]
role_map = {"Administrator": "admin", "super_admin": "admin", "general_user": "user"}
for r in csv.DictReader(open(users_csv)):
    out.append(
        "insert into member (tenant_id, email, first_name, last_name, login_name, mobile, role, is_active) values "
        f"('{TENANT}', {lit(r['EmailAddress'].lower())}, {lit(r['FirstName'])}, {lit(r['LastName'])}, "
        f"{lit(r['LoginName'])}, {lit(r['Mobile'] or None)}, '{role_map.get(r['AccessLevel'], 'user')}', {r['isActive']}) "
        "on conflict (tenant_id, email) do nothing;")
out.append("-- link anyone who already signed up")
out.append("update member m set user_id = u.id from auth.users u where lower(u.email) = lower(m.email) and m.user_id is null;")
out.append("-- the Base44 POC's zero-result questions: a ready-made review list")
for r in csv.DictReader(open(q_csv)):
    out.append(
        "insert into question (tenant_id, text, source, result_count, engine, asked_at) values "
        f"('{TENANT}', {lit(r['question'])}, 'typed', 0, 'base44', {lit(r['askedAt'])});")
open(f"{outdir}/01_cdi_tenant.sql", "w").write("\n".join(out) + "\n")

for i, s in enumerate(json.load(open(seed)), start=1):
    label = {"2026-04-06": "Apr 6, 2026", "2026-04-13": "Apr 13, 2026", "2026-04-20": "Apr 20, 2026"}.get(s["as_of"], s["as_of"])
    periods = "array[" + ",".join(lit(p) for p in s["periods"]) + "]"
    rows = json.dumps(s["rows"], separators=(",", ":")).replace("'", "''")
    sql = (f"-- Scrambled sample snapshot {s['as_of']} (part numbers + quantities scrambled; descriptions real)\n"
           f"select import_snapshot('{DATASET}', date '{s['as_of']}', {lit(label)}, {lit(s['file'])}, "
           f"{periods}, '{rows}'::jsonb);\n")
    open(f"{outdir}/1{i}_snapshot_{s['as_of']}.sql", "w").write(sql)
print("ok")
