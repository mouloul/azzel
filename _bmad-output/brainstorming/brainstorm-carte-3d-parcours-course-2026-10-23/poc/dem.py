import math, os, subprocess
import numpy as np
from PIL import Image

Z = 14
CACHE = os.path.dirname(os.path.abspath(__file__)) + "/tiles"
os.makedirs(CACHE, exist_ok=True)

def deg2tile(lat, lon, z):
    n = 2 ** z
    x = (lon + 180.0) / 360.0 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y

def tile(z, x, y):
    p = f"{CACHE}/{z}_{x}_{y}.png"
    if not os.path.exists(p):
        url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
        subprocess.run(["curl","-sS","--max-time","30","-o",p,url], check=True)
    return np.asarray(Image.open(p).convert("RGB")).astype(np.float64)

_cache = {}
def elev(lat, lon, z=Z):
    fx, fy = deg2tile(lat, lon, z)
    tx, ty = int(fx), int(fy)
    key = (z, tx, ty)
    if key not in _cache:
        _cache[key] = tile(z, tx, ty)
    a = _cache[key]
    size = a.shape[0]
    px = min(size - 1, int((fx - tx) * size))
    py = min(size - 1, int((fy - ty) * size))
    r, g, b = a[py, px]
    return (r * 256 + g + b / 256) - 32768

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    h = math.sin(dp/2)**2 + math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2 * R * math.asin(math.sqrt(h))
