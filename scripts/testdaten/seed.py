#!/usr/bin/env python3
"""Testdaten für stuffdev: erfundene Organisationen, POI, Abzeichen, Codes, Orte und Sammler.

Wiederholbar: Vorherige Seed-Daten (created_by = 'seed', Nutzer 'seed-…') werden vorher entfernt; feste IDs
(uuid5) halten Links stabil. Echte Daten (z. B. von stuff) bleiben unberührt – außer Vergaben an Seed-Abzeichen.
Alle Namen sind erfunden und mit „(Test)“ markiert; Koordinaten liegen in Goslar.

Aufruf (vom Mac, Tailscale an):  scripts/testdaten/seed.sh
Direkt:  python3 scripts/testdaten/seed.py --hsp hsp.json --out-hsp hsp.new.json --out-sql seed.sql
"""
import argparse, hashlib, json, random, secrets, string, uuid
from datetime import datetime, timedelta, timezone

NS = uuid.UUID('7d3c0f4e-5b1a-4c2d-9e8f-0a1b2c3d4e5f')
uid = lambda name: str(uuid.uuid5(NS, name))
NOW = datetime(2026, 11, 23, 12, 0, tzinfo=timezone.utc)
rnd = random.Random(20261123)

ADMIN, WALD, MUSEUM, BIBLIOTHEK = (f'00000000-0000-4000-8000-00000000000{i}' for i in (1, 2, 3, 4))
org = lambda n: f'00000000-0000-4000-8000-0000000000{n:02d}'
CAFE, BAECKEREI, FITNESS, BUEHNE, VEREIN, MARKT = (org(n) for n in range(5, 11))

# ── Organisationen, POI und Konten fürs Test-HSP ─────────────────────────────
ORGS = [
    (CAFE, 'Café Kaiserblick (Test)', 'Marktstraße', '7', 'Kaffee und Kuchen am Markt – zwei Filialen'),
    (BAECKEREI, 'Bäckerei Harzkorn (Test)', 'Breite Straße', '40', 'Backstube mit Filialen in der Altstadt'),
    (FITNESS, 'FitWerk Goslar (Test)', 'Okerstraße', '12', 'Fitnessstudio mit Kursen am Abend'),
    (BUEHNE, 'Kleine Bühne Goslar (Test)', 'Am Wall', '3', 'Theater und Lesungen'),
    (VEREIN, 'SV Harzblick (Test)', 'Sportplatzweg', '1', 'Sportverein mit Lauftreff'),
    (MARKT, 'Weihnachtsmarkt-Verein Goslar (Test)', 'Markt', '1', 'Organisiert Weihnachtsmarkt und Adventsaktionen'),
]
# .NET-Wochentage: 0 = Sonntag
WEEK = [1, 2, 3, 4, 5]
POIS = [
    # id, org, name, street, nr, kategorie, lat, lng, [(tage, von, bis)]
    ('seed-poi-cafe-markt', CAFE, 'Café Kaiserblick am Markt', 'Marktstraße', '7', 'Cafés', 51.90605, 10.42935, [(WEEK + [6, 0], '08:00:00', '18:00:00')]),
    ('seed-poi-cafe-breite', CAFE, 'Café Kaiserblick Breite Straße', 'Breite Straße', '18', 'Cafés', 51.90672, 10.43262, [(WEEK + [6], '09:00:00', '17:00:00')]),
    ('seed-poi-baeckerei-breite', BAECKEREI, 'Harzkorn Breite Straße', 'Breite Straße', '40', 'Bäckereien', 51.90731, 10.43521, [(WEEK + [6], '06:00:00', '18:00:00'), ([0], '07:00:00', '11:00:00')]),
    ('seed-poi-baeckerei-rosentor', BAECKEREI, 'Harzkorn am Rosentor', 'Rosentorstraße', '5', 'Bäckereien', 51.90961, 10.42897, [(WEEK + [6], '06:30:00', '13:00:00')]),
    ('seed-poi-fitness', FITNESS, 'FitWerk Studio', 'Okerstraße', '12', 'Sport', 51.91203, 10.42411, [(WEEK, '06:00:00', '22:00:00'), ([6, 0], '09:00:00', '18:00:00')]),
    ('seed-poi-buehne', BUEHNE, 'Kleine Bühne am Wall', 'Am Wall', '3', 'Bühnen', 51.90433, 10.42318, [([3, 4, 5, 6], '18:00:00', '23:00:00')]),
    ('seed-poi-verein', VEREIN, 'Sportplatz Harzblick', 'Sportplatzweg', '1', 'Sport', 51.89892, 10.43811, []),
    ('seed-poi-markt', MARKT, 'Weihnachtsmarkt auf dem Marktplatz', 'Markt', '1', 'Veranstaltungen', 51.90591, 10.42903, [([1, 2, 3, 4, 5, 6, 0], '11:00:00', '21:00:00')]),
]
# Benutzername → Organisationen. Konten legt stuff in authentik an (Gruppe badges-testers).
ACCOUNTS = {
    'bb-cafe': [CAFE], 'bb-baeckerei': [BAECKEREI], 'bb-fitness': [FITNESS], 'bb-buehne': [BUEHNE],
    'bb-verein': [VEREIN], 'bb-weihnachtsmarkt': [MARKT], 'bb-museum': [MUSEUM, BIBLIOTHEK], 'bb-wald': [WALD],
    'bb-buerger': [],
}

def merge_hsp(d: dict) -> dict:
    known = {o['id'] for o in d['organisations']}
    for oid, name, street, nr, desc in ORGS:
        if oid not in known:
            d['organisations'].append({'id': oid, 'name': name, 'street': street, 'number': nr, 'postcode': '38640', 'city': 'Goslar',
                                       'logoFileUrl': None, 'description': desc, 'websiteUrl': None, 'contactEmail': None})
    d['pointsOfInterest'] = [p for p in d.get('pointsOfInterest', []) if not p['id'].startswith('seed-')] + [
        {'id': pid, 'organisationId': o, 'name': n, 'street': s, 'houseNumber': nr, 'zipCode': '38640', 'city': 'Goslar',
         'firstCategory': cat, 'secondCategory': None, 'latitude': lat, 'longitude': lng, 'description': None}
        for pid, o, n, s, nr, cat, lat, lng, _ in POIS]
    hours = [h for h in d.get('openingHours', []) if not h['id'].startswith('seed-')]
    for pid, *_rest, slots in POIS:
        for days, f, t in slots:
            for day in days:
                hours.append({'id': f'seed-oh-{pid}-{day}-{f[:5]}', 'pointOfInterestId': pid, 'dayOfWeek': day, 'from': f, 'to': t})
    d['openingHours'] = hours
    for user, orgs in ACCOUNTS.items():
        if user in d['users']:
            continue
        d['users'][user] = {'id': uid(f'profile:{user}'), 'firstName': user.removeprefix('bb-').capitalize(), 'lastName': '(Test)', 'memberships': orgs}
    return d

# ── Abzeichen ────────────────────────────────────────────────────────────────
def spec(icon, palette, shape='circle', pattern='rays'):
    return {'version': 1, 'frame': 'classic', 'emblem': {'shape': shape, 'pattern': pattern, 'motif': {'type': 'icon', 'ref': icon}, 'palette': palette}}

def iso(y, m, d, h=0, mi=0):
    # Ortszeit Goslar im Winter (MEZ = UTC+1)
    return datetime(y, m, d, h, mi, tzinfo=timezone(timedelta(hours=1)))

A = []  # Abzeichen
def badge(key, org_id, name, sp, kind='single', tiers=None, desc='', awarded='', hidden=False, hint='', poi=None,
          rule=None, frm=None, until=None, items=None, required=None, popularity=0.4):
    A.append(dict(key=key, id=uid(f'achievement:{key}'), org=org_id, name=name, spec=sp, kind=kind, tiers=tiers or [], desc=desc,
                  awarded=awarded, hidden=hidden, hint=hint, poi=poi, rule=rule, frm=frm, until=until, items=items or [],
                  required=required, popularity=popularity))

# Café: Abzeichen der Organisation + je Filiale
badge('cafe-bei-uns', CAFE, 'Kaffee bei uns', spec('coffee', 'mango'), 'tiered', [(1, 'Erster Kaffee'), (5, 'Stammgast'), (15, 'Kaffeeliebe')],
      desc='Check ein, wenn du in einer unserer Filialen bist – jede zählt.', awarded='Prost! Der nächste geht auf dich.', popularity=0.6)
badge('cafe-markt', CAFE, 'Kaffee am Markt', spec('coffee', 'kaiser', 'hexagon'), poi='seed-poi-cafe-markt', desc='Einmal am Markt einchecken.', popularity=0.5)
badge('cafe-breite', CAFE, 'Kaffee Breite Straße', spec('cake', 'heather', 'hexagon'), poi='seed-poi-cafe-breite', desc='Einmal in der Breiten Straße einchecken.', popularity=0.35)
badge('cafe-alle', CAFE, 'Beide Filialen', spec('crown', 'mango', 'shield'), 'collection', items=['cafe-markt', 'cafe-breite'], required=2,
      desc='In beiden Filialen gewesen.', popularity=0)
# Bäckerei: Frühaufsteher mit festen Zeiten
badge('baeckerei-frueh', BAECKEREI, 'Frühaufsteher', spec('sun', 'sunset'), poi='seed-poi-baeckerei-breite',
      desc='Check zwischen 6 und 8 Uhr in der Breiten Straße ein.', awarded='Die frühen Brötchen gehören dir.', popularity=0.25)
badge('baeckerei-broetchen', BAECKEREI, 'Brötchen-Held', spec('cake', 'lager'), 'tiered', [(3, None), (10, None), (25, 'Ehrenbäcker')],
      desc='Bekommst du an der Kasse.', popularity=0.45)
# Fitness: Abendfitness und Stammgast
badge('fitness-abend', FITNESS, 'Beim Abendfitness', spec('run', 'night', 'diamond'), poi='seed-poi-fitness',
      desc='Dienstags und donnerstags zwischen 18:30 und 20:00 im Studio einchecken.', popularity=0.2)
badge('fitness-stammgast', FITNESS, 'FitWerk-Stammgast', spec('flame', 'ore', 'shield'), 'tiered', [(4, None), (12, None), (30, 'Eisern')],
      poi='seed-poi-fitness', desc='Jeder Besuch zählt, einmal am Tag.', popularity=0.3)
# Bühne: Veranstaltung und Limited Edition im Dezember
badge('buehne-premiere', BUEHNE, 'Premiere Winterstück', spec('masks-theater', 'heather'), frm=iso(2026, 12, 1), until=iso(2026, 12, 31, 23, 59),
      desc='Den Code gibt es im Foyer, nur im Dezember.', popularity=0)
badge('buehne-lesung', BUEHNE, 'Lesungsgast', spec('book', 'slate'), desc='Bei einer Lesung den Code scannen.', popularity=0.2)
# Verein: Stationen, versteckt, vergangene und kommende Aktion
badge('verein-lauftreff', VEREIN, 'Lauftreff', spec('walk', 'forest'), 'tiered', [(2, None), (8, None), (20, 'Marathonherz')],
      desc='Jeder Lauftreff zählt.', popularity=0.35)
badge('verein-geheim', VEREIN, 'Das Vereinsheim-Geheimnis', spec('key', 'granite'), hidden=True, hint='Frag an der Theke nach dem Pokal von 1987',
      desc='Wer fragt, findet.', popularity=0.08)
badge('verein-herbstlauf', VEREIN, 'Herbstlauf 2026', spec('leaf', 'sunset'), frm=iso(2026, 10, 1), until=iso(2026, 10, 31, 23, 59),
      desc='Beim Herbstlauf im Oktober dabei.', popularity=0.3)
badge('verein-silvesterlauf', VEREIN, 'Silvesterlauf', spec('sparkles', 'night'), frm=iso(2026, 12, 31), until=iso(2027, 1, 1, 18, 0),
      desc='Nur an Silvester.', popularity=0)
# Weihnachtsmarkt: Limited Edition, Adventssonntage als Kombination
XMAS = (iso(2026, 11, 25), iso(2026, 12, 30, 21, 0))
badge('markt-gluehwein', MARKT, 'Weihnachtsmarkt 2026', spec('snowflake', 'river'), poi='seed-poi-markt', frm=XMAS[0], until=XMAS[1],
      desc='Auf dem Weihnachtsmarkt einchecken, täglich 11–21 Uhr.', popularity=0)
ADVENT = [(1, iso(2026, 11, 29)), (2, iso(2026, 12, 6)), (3, iso(2026, 12, 13)), (4, iso(2026, 12, 20))]
for n, day in ADVENT:
    badge(f'markt-advent-{n}', MARKT, f'{n}. Advent', spec('star', 'kaiser', 'shield', 'dots'), frm=day, until=day + timedelta(days=1),
          desc=f'Nur am {n}. Adventssonntag auf dem Weihnachtsmarkt.', popularity=0)
badge('markt-advent-alle', MARKT, 'Adventsjäger 2026', spec('gift', 'kaiser', 'shield'), 'collection', items=[f'markt-advent-{n}' for n in range(1, 5)],
      required=3, desc='An drei der vier Adventssonntage dabei.', popularity=0)
# Bestehende Organisationen
badge('wald-laeufer', WALD, 'Waldläufer', spec('trees', 'moss', 'circle', 'forest'), 'tiered', [(3, None), (6, None), (10, 'Waldkenner')],
      desc='Scanne die Stationen am Pfad.', popularity=0.55)
badge('wald-pilz', WALD, 'Pilzfinder', spec('mushroom', 'moss'), hidden=True, hint='Wo die Pilze im Kreis wachsen', popularity=0.12)
badge('museum-kaiserpfalz', MUSEUM, 'In der Kaiserpfalz', spec('building-castle', 'kaiser', 'shield'), poi='poi-museum-kaiserpfalz',
      desc='Check in der Kaiserpfalz ein, zu den Öffnungszeiten.', popularity=0.4)
badge('museum-haus', MUSEUM, 'Museumsbesuch', spec('building-monument', 'granite'), poi='poi-museum-haupthaus', popularity=0.3)
badge('bibliothek-leseratte', BIBLIOTHEK, 'Leseratte', spec('books', 'slate', 'hexagon'), 'tiered', [(5, None), (20, None), (50, 'Bücherwurm')],
      desc='Jede Ausleihe zählt – an der Theke.', popularity=0.4)
badge('kultur-kombi', MUSEUM, 'Kultur-Kombi', spec('palette', 'heather', 'diamond'), 'collection',
      items=['museum-kaiserpfalz', 'bibliothek-leseratte', 'buehne-lesung'], required=2, desc='Zwei von drei Kulturorten.', popularity=0)
# Plattform-Abzeichen der Haupt-Admin-Organisation
badge('plattform-erste', ADMIN, 'Erste Schritte', spec('rocket', 'mango'), rule='awards_count', desc='Sammle dein erstes Abzeichen.', popularity=0)
badge('plattform-sammler', ADMIN, 'Sammler', spec('trophy', 'mango', 'shield'), 'tiered', [(3, None), (10, None), (25, 'Großsammler')],
      rule='awards_count', desc='Sammle Abzeichen in ganz Goslar.', popularity=0)
badge('plattform-vielseitig', ADMIN, 'Vielseitig', spec('heart-handshake', 'river'), 'tiered', [(2, None), (4, None), (6, None)],
      rule='orgs_count', desc='Abzeichen von verschiedenen Organisationen.', popularity=0)
badge('plattform-unterwegs', ADMIN, 'Unterwegs', spec('map-pin', 'harz'), 'tiered', [(1, None), (5, None), (10, None)],
      rule='places_count', desc='An verschiedenen Orten eingecheckt.', popularity=0)
badge('plattform-treue', ADMIN, 'Treue Seele', spec('heart', 'sunset'), 'tiered', [(3, None), (7, None), (30, None)],
      rule='active_days', desc='An vielen Tagen die App geöffnet.', popularity=0)
badge('plattform-kombi', ADMIN, 'Kombi-Profi', spec('puzzle', 'heather'), rule='collections_count', desc='Deine erste Kombination.', popularity=0)
BY = {a['key']: a for a in A}

# ── Codes und Orte ───────────────────────────────────────────────────────────
C = []
def code(key, badge_key, template, label='', poi=None, geo=None, place_name=None, schedule=None, per_user_limit=1,
         cooldown=None, value=1, frm=None, until=None):
    C.append(dict(key=key, id=uid(f'code:{key}'), badge=badge_key, template=template, label=label, poi=poi, geo=geo, place_name=place_name,
                  schedule=schedule, limit=per_user_limit, cooldown=cooldown, value=value, frm=frm, until=until))
P = {p[0]: p for p in POIS}
def at_poi(pid, radius=60):
    if pid in P:
        _, _, name, *_r, lat, lng, _h = P[pid]
    else:  # POI der bestehenden Test-Organisationen
        lat, lng, name = {'poi-museum-kaiserpfalz': (51.9013, 10.4262, 'Kaiserpfalz'), 'poi-museum-haupthaus': (51.9045, 10.4311, 'Goslarer Museum')}[pid]
    return {'lat': lat, 'lng': lng, 'radiusM': radius}, name[:80]
def hours_of(pid):
    out = {}
    for days, f, t in (P[pid][8] if pid in P else []):
        for d in days:
            out.setdefault((f[:5], t[:5]), set()).add(7 if d == 0 else d)
    return [{'days': sorted(v), 'from': k[0], 'to': k[1]} for k, v in out.items()] or None

for pid, label in [('seed-poi-cafe-markt', 'Filiale Markt'), ('seed-poi-cafe-breite', 'Filiale Breite Straße')]:
    g, n = at_poi(pid)
    code(f'cafe-bei-uns-{pid}', 'cafe-bei-uns', 'place', label, pid, g, n, hours_of(pid), per_user_limit=None, cooldown=24 * 3600)
for k, pid in [('cafe-markt', 'seed-poi-cafe-markt'), ('cafe-breite', 'seed-poi-cafe-breite')]:
    g, n = at_poi(pid); code(k, k, 'place', 'Check-in', pid, g, n, hours_of(pid))
g, n = at_poi('seed-poi-baeckerei-breite')
code('baeckerei-frueh', 'baeckerei-frueh', 'place', 'Frühaufsteher', 'seed-poi-baeckerei-breite', g, n,
     [{'days': [1, 2, 3, 4, 5, 6], 'from': '06:00', 'to': '08:00'}])
code('baeckerei-kasse', 'baeckerei-broetchen', 'checkout', 'Kasse Breite Straße', 'seed-poi-baeckerei-breite', per_user_limit=None)
g, n = at_poi('seed-poi-fitness', 80)
code('fitness-abend', 'fitness-abend', 'place', 'Abendkurs', 'seed-poi-fitness', g, n, [{'days': [2, 4], 'from': '18:30', 'to': '20:00'}])
code('fitness-stammgast', 'fitness-stammgast', 'place', 'Besuch', 'seed-poi-fitness', g, n, hours_of('seed-poi-fitness'), per_user_limit=None, cooldown=20 * 3600)
code('buehne-premiere', 'buehne-premiere', 'event', 'Foyer Premiere', 'seed-poi-buehne')
code('buehne-lesung', 'buehne-lesung', 'station', 'Lesungen Plakat', 'seed-poi-buehne', per_user_limit=None, cooldown=7 * 24 * 3600)
for i in range(1, 4):
    code(f'verein-lauftreff-{i}', 'verein-lauftreff', 'station', f'Lauftreff Station {i}', 'seed-poi-verein', per_user_limit=None, cooldown=6 * 24 * 3600)
code('verein-geheim', 'verein-geheim', 'station', 'Pokal-Vitrine', 'seed-poi-verein')
code('verein-herbstlauf', 'verein-herbstlauf', 'event', 'Start Herbstlauf')
code('verein-silvesterlauf', 'verein-silvesterlauf', 'event', 'Start Silvesterlauf')
g, n = at_poi('seed-poi-markt', 120)
code('markt-gluehwein', 'markt-gluehwein', 'place', 'Weihnachtsmarkt', 'seed-poi-markt', g, n, hours_of('seed-poi-markt'))
for k, day in ADVENT:
    code(f'markt-advent-{k}', f'markt-advent-{k}', 'place', f'{k}. Advent', 'seed-poi-markt', g, f'{k}. Advent auf dem Weihnachtsmarkt',
         [{'days': [7], 'from': '11:00', 'to': '21:00'}], frm=day, until=day + timedelta(days=1))
for i in range(1, 11):
    code(f'wald-station-{i}', 'wald-laeufer', 'station', f'Station {i}', 'poi-wald-eingang' if i == 1 else None)
code('wald-pilz', 'wald-pilz', 'station', 'Pilzkreis')
g, n = at_poi('poi-museum-kaiserpfalz', 100)
code('museum-kaiserpfalz', 'museum-kaiserpfalz', 'place', 'Eingang Kaiserpfalz', 'poi-museum-kaiserpfalz', g, n,
     [{'days': [1, 2, 3, 4, 5, 6, 7], 'from': '10:00', 'to': '17:00'}])
code('museum-haus', 'museum-haus', 'station', 'Kasse Museum', 'poi-museum-haupthaus')
code('bibliothek-theke', 'bibliothek-leseratte', 'checkout', 'Ausleihtheke', per_user_limit=None)

# ── Erfundene Sammler ────────────────────────────────────────────────────────
NAMES = ['Anna', 'Ben', 'Carla', 'Deniz', 'Ella', 'Finn', 'Greta', 'Hannes', 'Ida', 'Jonas', 'Kira', 'Lukas', 'Mia', 'Noah', 'Olga', 'Paul',
         'Rosa', 'Sami', 'Tilda', 'Umut', 'Vera', 'Willi', 'Yara', 'Zoe', 'Aylin', 'Bruno', 'Clara', 'David', 'Emil', 'Frieda', 'Gustav',
         'Hanna', 'Ilyas', 'Jule', 'Karl', 'Lea', 'Malte', 'Nele', 'Oskar', 'Pia']
USERS = [f'seed-sammler-{i:02d}' for i in range(1, 41)]

def q(v):
    if v is None:
        return 'NULL'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, datetime):
        return f"'{v.isoformat()}'"
    if isinstance(v, (dict, list)):
        return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"

def tier_for(thresholds, progress):
    return sum(1 for t in thresholds if t <= progress)

def hsp_hours(hsp: dict, pid: str):
    out = {}
    for h in hsp.get('openingHours', []):
        if h['pointOfInterestId'] != pid:
            continue
        out.setdefault((h['from'][:5], h['to'][:5]), set()).add(7 if h['dayOfWeek'] == 0 else h['dayOfWeek'])
    return [{'days': sorted(v), 'from': k[0], 'to': k[1]} for k, v in out.items()] or None

def build_sql(hsp: dict) -> str:
    out = ['BEGIN;', '-- Vorherige Seed-Daten entfernen']
    seed_a = "SELECT id FROM achievements WHERE created_by = 'seed'"
    out += [
        f"DELETE FROM redemptions WHERE user_sub LIKE 'seed-%' OR code_id IN (SELECT id FROM codes WHERE created_by = 'seed') OR achievement_id IN ({seed_a});",
        f"DELETE FROM awards WHERE user_sub LIKE 'seed-%' OR achievement_id IN ({seed_a});",
        "DELETE FROM code_nonces WHERE code_id IN (SELECT id FROM codes WHERE created_by = 'seed');",
        "DELETE FROM codes WHERE created_by = 'seed';",
        f"DELETE FROM collection_items WHERE collection_id IN ({seed_a}) OR achievement_id IN ({seed_a});",
        f"DELETE FROM achievement_tiers WHERE achievement_id IN ({seed_a});",
        "DELETE FROM achievements WHERE created_by = 'seed';",
        "DELETE FROM user_activity_days WHERE user_sub LIKE 'seed-%';",
        "DELETE FROM profiles WHERE user_sub LIKE 'seed-%';",
        "DELETE FROM pois WHERE id LIKE 'seed-%';",
        '-- POI (wie nach einem Abruf aus dem HSP)',
    ]
    # Alle POI des Test-HSP (auch die der bestehenden Organisationen), damit Abzeichen und Orte sie finden
    for p in hsp['pointsOfInterest']:
        out.append(f"INSERT INTO pois (id, org_id, name, street, house_number, zip_code, city, category, lat, lng, opening_hours) VALUES "
                   f"({q(p['id'])}, {q(p['organisationId'])}, {q(p['name'])}, {q(p.get('street'))}, {q(p.get('houseNumber'))}, {q(p.get('zipCode'))}, "
                   f"{q(p.get('city'))}, {q(p.get('firstCategory') or p.get('secondCategory'))}, {p['latitude']}, {p['longitude']}, {q(hsp_hours(hsp, p['id']))}) "
                   "ON CONFLICT (id) DO UPDATE SET org_id = EXCLUDED.org_id, name = EXCLUDED.name, street = EXCLUDED.street, house_number = EXCLUDED.house_number, "
                   "zip_code = EXCLUDED.zip_code, city = EXCLUDED.city, category = EXCLUDED.category, lat = EXCLUDED.lat, lng = EXCLUDED.lng, "
                   "opening_hours = EXCLUDED.opening_hours, removed_at = NULL;")
    out.append('-- Abzeichen')
    published = NOW - timedelta(days=50)
    for a in A:
        out.append(
            'INSERT INTO achievements (id, org_id, kind, name, description, awarded_text, category, spec, status, required_count, hidden, hint, '
            'open_for_collections, created_by, created_at, updated_at, published_at, auto_rule, available_from, available_until, poi_id) VALUES '
            f"({q(a['id'])}, {q(a['org'])}, {q(a['kind'])}, {q(a['name'])}, {q(a['desc'])}, {q(a['awarded'])}, '{{}}', {q(a['spec'])}, 'live', "
            f"{q(a['required'])}, {q(a['hidden'])}, {q(a['hint'])}, {q(a['key'] in ('bibliothek-leseratte', 'buehne-lesung'))}, 'seed', "
            f"{q(published)}, {q(published)}, {q(published)}, {q(a['rule'])}, {q(a['frm'])}, {q(a['until'])}, {q(a['poi'])});")
        tiers = a['tiers'] if a['kind'] == 'tiered' else [(a['required'] or 1, None)]
        for level, (t, name) in enumerate(tiers, 1):
            out.append(f"INSERT INTO achievement_tiers (achievement_id, level, threshold, name, awarded_text) VALUES ({q(a['id'])}, {level}, {t}, {q(name)}, NULL);")
        for pos, item in enumerate(a['items']):
            out.append(f"INSERT INTO collection_items (collection_id, achievement_id, approved_at, approved_by, position) VALUES "
                       f"({q(a['id'])}, {q(BY[item]['id'])}, {q(published)}, 'seed', {pos});")
    out.append('-- Codes und Orte')
    for c in C:
        a = BY[c['badge']]
        token = ''.join(rnd.choice(string.ascii_letters + string.digits) for _ in range(22))
        secret = f"decode('{secrets.token_hex(32)}', 'hex')" if c['template'] in ('event', 'checkout') else 'NULL'
        g = c['geo'] or {}
        out.append(
            'INSERT INTO codes (id, achievement_id, org_id, template, label, token, secret, per_user_limit, per_user_cooldown_seconds, value, '
            'valid_from, valid_until, geo_lat, geo_lng, geo_radius_m, place_name, schedule, poi_id, created_by, created_at) VALUES '
            f"({q(c['id'])}, {q(a['id'])}, {q(a['org'])}, {q(c['template'])}, {q(c['label'])}, {q(token)}, {secret}, {q(c['limit'])}, "
            f"{q(c['cooldown'])}, {c['value']}, {q(c['frm'])}, {q(c['until'])}, {q(g.get('lat'))}, {q(g.get('lng'))}, {q(g.get('radiusM'))}, "
            f"{q(c['place_name'])}, {q(c['schedule'])}, {q(c['poi'])}, 'seed', {q(published)});")

    out.append('-- Sammler: Vergaben (deterministisch zufällig)')
    awards = {}  # (user, key) -> (progress, tier, first)
    place_checkins = {u: set() for u in USERS}
    for u in USERS:
        activity = rnd.random()  # wie aktiv die Person ist
        for a in A:
            if a['rule'] or a['kind'] == 'collection' or a['popularity'] == 0:
                continue
            if rnd.random() > a['popularity'] * (0.4 + activity):
                continue
            thresholds = [t for t, _ in a['tiers']] if a['kind'] == 'tiered' else [1]
            progress = rnd.randint(1, int(thresholds[-1] * 1.2)) if a['kind'] == 'tiered' else 1
            first = NOW - timedelta(days=rnd.randint(1, 48), hours=rnd.randint(0, 12))
            if a['until'] and a['until'] < NOW:  # vergangene Aktion: im Zeitfenster
                first = a['until'] - timedelta(days=rnd.randint(1, 20))
            tier = tier_for(thresholds, progress)
            awards[(u, a['key'])] = (progress, tier, first if tier >= 1 else None)
            for c in C:
                if c['badge'] == a['key'] and c['template'] == 'place' and tier >= 1:
                    place_checkins[u].add(c['id'])
                    break
        # Kombinationen aus den Teilen
        for a in A:
            if a['kind'] != 'collection':
                continue
            have = [i for i in a['items'] if awards.get((u, i), (0, 0, None))[1] >= 1]
            if have:
                done = len(have) >= a['required']
                firsts = sorted(awards[(u, i)][2] for i in have)
                awards[(u, a['key'])] = (len(have), 1 if done else 0, firsts[a['required'] - 1] if done else None)
        # Plattform-Abzeichen aus den Kennzahlen (Plattform zählt nicht mit)
        earned = [(k, v) for (uu, k), v in awards.items() if uu == u and v[1] >= 1 and not BY[k]['rule']]
        days = rnd.randint(1, 40)
        metric = {
            'awards_count': len(earned),
            'orgs_count': len({BY[k]['org'] for k, _ in earned}),
            'places_count': len(place_checkins[u]),
            'collections_count': sum(1 for k, _ in earned if BY[k]['kind'] == 'collection'),
            'active_days': days,
        }
        for a in A:
            if not a['rule'] or metric[a['rule']] <= 0:
                continue
            thresholds = [t for t, _ in a['tiers']] if a['kind'] == 'tiered' else [1]
            v = metric[a['rule']]
            tier = tier_for(thresholds, v)
            awards[(u, a['key'])] = (v, tier, NOW - timedelta(days=rnd.randint(0, 20)) if tier >= 1 else None)
        for d in range(days):
            out.append(f"INSERT INTO user_activity_days (user_sub, day) VALUES ({q(u)}, {q((NOW - timedelta(days=d * 2)).date().isoformat())});")
    for (u, k), (progress, tier, first) in awards.items():
        out.append(f"INSERT INTO awards (achievement_id, user_sub, progress, tier, first_earned_at, updated_at) VALUES "
                   f"({q(BY[k]['id'])}, {q(u)}, {progress}, {tier}, {q(first)}, {q(first or NOW)});")
    for u, codes in place_checkins.items():
        for cid in codes:
            a_id = next(BY[c['badge']]['id'] for c in C if c['id'] == cid)
            out.append(f"INSERT INTO redemptions (code_id, achievement_id, user_sub, value, status, source, created_at) VALUES "
                       f"({q(cid)}, {q(a_id)}, {q(u)}, 1, 'success', 'place', {q(NOW - timedelta(days=rnd.randint(1, 40)))});")
    out.append('-- Öffentliche Profile mit Showcase (etwa die Hälfte)')
    for i, u in enumerate(USERS):
        if i % 2:
            continue
        mine = [BY[k]['id'] for (uu, k), v in awards.items() if uu == u and v[1] >= 1][:6]
        showcase = 'ARRAY[' + ','.join(f"'{x}'::uuid" for x in mine) + ']::uuid[]' if mine else "'{}'"
        out.append(f"INSERT INTO profiles (user_sub, handle, display_name, public, showcase) VALUES "
                   f"({q(u)}, {q('test-' + NAMES[i].lower())}, {q(NAMES[i] + ' (Test)')}, true, {showcase});")
    out.append('COMMIT;')
    return '\n'.join(out) + '\n'

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--hsp', required=True)
    ap.add_argument('--out-hsp', required=True)
    ap.add_argument('--out-sql', required=True)
    args = ap.parse_args()
    with open(args.hsp) as f:
        hsp = merge_hsp(json.load(f))
    with open(args.out_hsp, 'w') as f:
        json.dump(hsp, f, ensure_ascii=False, indent=2)
        f.write('\n')
    with open(args.out_sql, 'w') as f:
        f.write(build_sql(hsp))
    print(f'{len(ORGS)} Organisationen, {len(POIS)} POI, {len(A)} Abzeichen, {len(C)} Codes, {len(USERS)} Sammler')
