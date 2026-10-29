import json, math
from dem import elev, haversine

WP = [
    (4.4360, 36.7672), (4.4330, 36.7630), (4.4290, 36.7585), (4.4245, 36.7540),
    (4.4210, 36.7495), (4.4195, 36.7450), (4.4160, 36.7405), (4.4120, 36.7382),
    (4.4080, 36.7420), (4.4075, 36.7480), (4.4095, 36.7545), (4.4105, 36.7610),
    (4.4120, 36.7680), (4.4140, 36.7750), (4.4190, 36.7805), (4.4265, 36.7850),
    (4.4350, 36.7880), (4.4440, 36.7895), (4.4530, 36.7865), (4.4575, 36.7805),
    (4.4540, 36.7750), (4.4480, 36.7715), (4.4420, 36.7692), (4.4360, 36.7672),
]
STEP = 45.0  # m entre deux points densifies

pts = []
for i in range(len(WP) - 1):
    (lo1, la1), (lo2, la2) = WP[i], WP[i + 1]
    d = haversine(la1, lo1, la2, lo2)
    n = max(1, int(d / STEP))
    for k in range(n):
        t = k / n
        pts.append((lo1 + (lo2 - lo1) * t, la1 + (la2 - la1) * t))
pts.append(WP[-1])

raw = [elev(la, lo) for lo, la in pts]
# lissage glissant sur 5 points : le DEM 30 m est bruite
alt = []
for i in range(len(raw)):
    w = raw[max(0, i - 2):i + 3]
    alt.append(sum(w) / len(w))

dist = [0.0]
for i in range(1, len(pts)):
    dist.append(dist[-1] + haversine(pts[i-1][1], pts[i-1][0], pts[i][1], pts[i][0]))

dplus = dmoins = 0.0
for i in range(1, len(alt)):
    dz = alt[i] - alt[i-1]
    if dz > 0: dplus += dz
    else: dmoins -= dz

coords = [[round(lo, 6), round(la, 6), round(a, 1)] for (lo, la), a in zip(pts, alt)]
profile = [[round(d, 1), round(a, 1)] for d, a in zip(dist, alt)]

def at_km(km):
    target = km * 1000
    i = min(range(len(dist)), key=lambda i: abs(dist[i] - target))
    return i

CP = [
    (0.0,   "Depart Ath Aissi",   ["chrono", "eau", "wc"]),
    (3.5,   "Crete d'Akfadou",    ["eau", "solide", "medical"]),
    (6.0,   "Col de Taourirt",    ["eau"]),
    (9.5,   "Chene-liege",        ["eau", "solide"]),
    (12.5,  "Ravin d'Ighzer",     ["eau", "medical", "bus"]),
    (None,  "Arrivee Ath Aissi",  ["chrono", "repas", "medical", "wc"]),
]
checkpoints = []
for km, name, services in CP:
    i = len(dist) - 1 if km is None else at_km(km)
    checkpoints.append({
        "nom": name, "km": round(dist[i] / 1000, 1), "alt": round(alt[i]),
        "lon": coords[i][0], "lat": coords[i][1], "index": i, "services": services,
    })
# D+ par segment inter-checkpoint
for a, b in zip(checkpoints, checkpoints[1:]):
    seg = 0.0
    for i in range(a["index"] + 1, b["index"] + 1):
        dz = alt[i] - alt[i-1]
        if dz > 0: seg += dz
    b["dplus_segment"] = round(seg)
    b["km_segment"] = round((dist[b["index"]] - dist[a["index"]]) / 1000, 1)

out = {
    "nom": "Trail d'Ath Aissi",
    "commune": "Yakouren, Tizi Ouzou",
    "distance_m": round(dist[-1]),
    "dplus": round(dplus), "dmoins": round(dmoins),
    "alt_min": round(min(alt)), "alt_max": round(max(alt)),
    "coords": coords, "profile": profile, "checkpoints": checkpoints,
}
json.dump(out, open("parcours.json", "w"), ensure_ascii=False)
print(f"{len(coords)} pts | {out['distance_m']/1000:.1f} km | D+ {out['dplus']} | D- {out['dmoins']} | alt {out['alt_min']}-{out['alt_max']}")
for c in checkpoints: print(f"  km {c['km']:5.1f}  {c['alt']:4d} m  {c['nom']}")
