#!/usr/bin/env python3
"""
Baut die POI-Kacheln für den Abstecher-Finder.

  python3 build_pois.py --filter web/categories.json
      -> gibt die Filterausdrücke für `osmium tags-filter` aus

  python3 build_pois.py web/categories.json gefiltert.osm.pbf web/data
      -> schreibt web/data/meta.json und web/data/tiles/<i>_<j>.json

Kachelraster: 0,5° (i = floor(lat*2), j = floor(lon*2)).
Eintrag je Ziel: [id, lat, lon, unterkategorie, {tags}]
"""
import json, math, os, re, sys, shutil
from datetime import datetime, timezone
from collections import defaultdict

KEEP = ['name', 'wikidata', 'wikipedia', 'website', 'contact:website', 'opening_hours', 'wheelchair', 'dog', 'fee',
        'covered', 'indoor', 'building', 'zoo', 'museum']


def load_subs(path):
    cats = json.load(open(path, encoding='utf-8'))
    subs = []
    for m in cats['main']:
        for s in m['subs']:
            need = []
            for c in s.get('need', []):
                c = dict(c)
                if 'name' in c:
                    c['re'] = re.compile(c['name'], re.I)
                need.append(c)
            subs.append({'id': s['id'], 'q': [tuple(x) for x in s['q']], 'need': need, 'named': s.get('named', False)})
    return subs


def filter_expr(subs):
    by_key = defaultdict(set)
    for s in subs:
        for k, v in s['q']:
            by_key[k].add(v)
    return ' '.join(f"nwr/{k}={','.join(sorted(v))}" for k, v in sorted(by_key.items()))


def classify(subs, tags):
    name = tags.get('name', '')
    for s in subs:
        if not any(v in [x.strip() for x in tags.get(k, '').split(';')] for k, v in s['q']):
            continue
        if s['need'] and not any(
            (('tag' in c and tags.get(c['tag']) in c['in']) or
             ('has' in c and tags.get(c['has']) not in (None, 'no')) or
             ('re' in c and c['re'].search(name)))
            for c in s['need']):
            continue
        if s['named'] and not name:
            continue
        return s['id']
    return None


def build(cat_path, src, out):
    import osmium

    subs = load_subs(cat_path)
    items = []

    def emit(oid, lat, lon, tags):
        sid = classify(subs, tags)
        if sid:
            items.append([oid, round(lat, 5), round(lon, 5), sid,
                          {k: tags[k] for k in KEEP if k in tags}])

    def centroid(points):
        if not points:
            return None
        return sum(p[0] for p in points) / len(points), sum(p[1] for p in points) / len(points)

    class Handler(osmium.SimpleHandler):
        def node(self, n):
            if len(n.tags) and n.location.valid():
                emit(f'n{n.id}', n.location.lat, n.location.lon, {t.k: t.v for t in n.tags})

        def way(self, w):
            if not len(w.tags):
                return
            c = centroid([(nd.lat, nd.lon) for nd in w.nodes if nd.location.valid()])
            if c:
                emit(f'w{w.id}', c[0], c[1], {t.k: t.v for t in w.tags})

        def area(self, a):
            if a.from_way():          # geschlossene Wege kommen schon über way()
                return
            c = centroid([(n.lat, n.lon) for ring in a.outer_rings() for n in ring])
            if c:
                emit(f'r{a.orig_id()}', c[0], c[1], {t.k: t.v for t in a.tags})

    Handler().apply_file(src, locations=True, idx='flex_mem')

    tiles = defaultdict(list)
    for it in items:
        tiles[f'{math.floor(it[1] * 2)}_{math.floor(it[2] * 2)}'].append(it)

    tdir = os.path.join(out, 'tiles')
    shutil.rmtree(tdir, ignore_errors=True)
    os.makedirs(tdir, exist_ok=True)
    for tid, lst in tiles.items():
        with open(os.path.join(tdir, f'{tid}.json'), 'w', encoding='utf-8') as f:
            json.dump(lst, f, ensure_ascii=False, separators=(',', ':'))

    meta = {'built': datetime.now(timezone.utc).isoformat(timespec='seconds'),
            'count': len(items), 'tileSize': 0.5, 'tiles': sorted(tiles)}
    with open(os.path.join(out, 'meta.json'), 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False)
    per_sub = defaultdict(int)
    for it in items:
        per_sub[it[3]] += 1
    print(f'{len(items)} Ziele in {len(tiles)} Kacheln')
    print(', '.join(f'{k}: {v}' for k, v in sorted(per_sub.items(), key=lambda x: -x[1])))


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--filter':
        print(filter_expr(load_subs(sys.argv[2])))
    elif len(sys.argv) == 4:
        build(*sys.argv[1:])
    else:
        sys.exit(__doc__)
