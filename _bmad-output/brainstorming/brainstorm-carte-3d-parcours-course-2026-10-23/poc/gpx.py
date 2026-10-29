"""Convertit une trace GPX (Garmin Connect) en parcours.json pour le POC.

Usage : python3 gpx.py ../../../../docs/GPX/activity_24827718657.gpx

Produit, pour chaque point : lon, lat, altitude barometrique GPX lissee, et
l'altitude lue dans le MNT terrarium au meme endroit (pour comparaison).
"""
import json, math, re, sys
from dem import elev, haversine

SRC = sys.argv[1] if len(sys.argv) > 1 else "../../../../docs/GPX/activity_24827718657.gpx"
OUT = sys.argv[2] if len(sys.argv) > 2 else "parcours.json"
NB_CHECKPOINTS = 5          # depart + intermediaires + arrivee
SEUIL_FUSION = 8.0          # m : points plus proches que ca = fusionnes (arrets GPS)
FENETRE = 7                 # points : lissage glissant de l'altitude

xml = open(SRC, encoding="utf-8").read()

nom = re.search(r"<name>(.*?)</name>", xml, re.S)
nom = nom.group(1).strip() if nom else "Parcours"

bruts = []
for m in re.finditer(
        r'<trkpt lat="([-\d.]+)" lon="([-\d.]+)">\s*(?:<ele>([-\d.]+)</ele>)?\s*(?:<time>(.*?)</time>)?',
        xml):
    lat, lon = float(m.group(1)), float(m.group(2))
    ele = float(m.group(3)) if m.group(3) else None
    bruts.append((lon, lat, ele, m.group(4)))

if not bruts:
    sys.exit("aucun point de trace trouve dans " + SRC)

# 1. fusion des points quasi immobiles (feux rouges GPS, arrets)
pts = [bruts[0]]
for p in bruts[1:]:
    if haversine(pts[-1][1], pts[-1][0], p[1], p[0]) >= SEUIL_FUSION:
        pts.append(p)
if pts[-1] is not bruts[-1]:
    pts.append(bruts[-1])

# 2. lissage de l'altitude barometrique
brut_alt = [p[2] if p[2] is not None else 0.0 for p in pts]
alt = []
for i in range(len(brut_alt)):
    d = FENETRE // 2
    f = brut_alt[max(0, i - d):i + d + 1]
    alt.append(sum(f) / len(f))

# 3. altitude MNT au meme endroit, pour comparer GPX et terrarium
alt_mnt = [elev(p[1], p[0]) for p in pts]

# 4. distances cumulees et denivele
dist = [0.0]
for i in range(1, len(pts)):
    dist.append(dist[-1] + haversine(pts[i-1][1], pts[i-1][0], pts[i][1], pts[i][0]))

dplus = dmoins = 0.0
for i in range(1, len(alt)):
    dz = alt[i] - alt[i-1]
    if dz > 0: dplus += dz
    else: dmoins -= dz

coords = [[round(p[0], 6), round(p[1], 6), round(a, 1)] for p, a in zip(pts, alt)]
profile = [[round(d, 1), round(a, 1)] for d, a in zip(dist, alt)]
profile_mnt = [round(a, 1) for a in alt_mnt]

# 5. points de passage repartis le long de la trace
def index_au_metre(cible):
    return min(range(len(dist)), key=lambda i: abs(dist[i] - cible))

total = dist[-1]
SERVICES = [
    ["chrono", "eau", "wc"],
    ["eau"],
    ["eau", "solide", "medical"],
    ["eau", "solide"],
    ["eau", "medical"],
]
checkpoints = []
for n in range(NB_CHECKPOINTS):
    i = index_au_metre(total * n / (NB_CHECKPOINTS - 1))
    if n == 0:
        titre, services = "Depart", ["chrono", "eau", "wc"]
    elif n == NB_CHECKPOINTS - 1:
        titre, services = "Arrivee", ["chrono", "repas", "medical", "wc"]
    else:
        titre, services = f"Point {n}", SERVICES[n % len(SERVICES)]
    checkpoints.append({
        "nom": titre, "km": round(dist[i] / 1000, 1), "alt": round(alt[i]),
        "lon": coords[i][0], "lat": coords[i][1], "index": i, "services": services,
    })

for a, b in zip(checkpoints, checkpoints[1:]):
    seg = sum(max(0.0, alt[i] - alt[i-1]) for i in range(a["index"] + 1, b["index"] + 1))
    b["dplus_segment"] = round(seg)
    b["km_segment"] = round((dist[b["index"]] - dist[a["index"]]) / 1000, 1)

# 6. duree reelle de la trace
duree = None
if pts[0][3] and pts[-1][3]:
    from datetime import datetime
    fmt = "%Y-%m-%dT%H:%M:%S.%fZ"
    try:
        t0 = datetime.strptime(pts[0][3], fmt)
        t1 = datetime.strptime(pts[-1][3], fmt)
        duree = int((t1 - t0).total_seconds())
    except ValueError:
        pass

out = {
    "nom": nom,
    "commune": "Yakouren, Tizi Ouzou",
    "source": "GPX Garmin Connect — " + SRC.split("/")[-1],
    "distance_m": round(total),
    "dplus": round(dplus), "dmoins": round(dmoins),
    "alt_min": round(min(alt)), "alt_max": round(max(alt)),
    "duree_s": duree,
    "coords": coords, "profile": profile, "profile_mnt": profile_mnt,
    "checkpoints": checkpoints,
}
json.dump(out, open(OUT, "w"), ensure_ascii=False)

ecart = sum(abs(a - b) for a, b in zip(alt, alt_mnt)) / len(alt)
print(f"{nom}")
print(f"{len(bruts)} points GPX -> {len(coords)} apres fusion a {SEUIL_FUSION} m")
print(f"{total/1000:.2f} km | D+ {out['dplus']} m | D- {out['dmoins']} m | alt {out['alt_min']}-{out['alt_max']} m")
if duree: print(f"duree {duree//3600}h{(duree%3600)//60:02d}")
print(f"ecart moyen GPX barometrique vs MNT terrarium : {ecart:.1f} m")
for c in checkpoints:
    print(f"  km {c['km']:5.1f}  {c['alt']:4d} m  {c['nom']}")
