"""Builds data/pokedex.json from the Infinite Fusion species list + PokéAPI (national dex, French names).

Usage: python tools/build_pokedex.py
"""
import json
import re
import urllib.request
from pathlib import Path

PBS_URL = "https://raw.githubusercontent.com/infinitefusion/infinitefusion-e18/develop-6.6/PBS/pokemon.txt"
POKEAPI_GRAPHQL = "https://beta.pokeapi.co/graphql/v1beta"
OUT = Path(__file__).resolve().parent.parent / "data" / "pokedex.json"

# Triple fusions and other special entries use ids >= 999999.
MAX_ID = 999998

# Infinite Fusion names that don't match PokéAPI's English species names.
NAME_ALIASES = {
    "nidoranf": "nidoranfemale",
    "nidoranm": "nidoranmale",
    "nidoranfe": "nidoranfemale",
    "nidoranma": "nidoranmale",
}


# Several Infinite Fusion ids share a species: InternalName -> (label, PokéAPI sprite name).
FORMS = {
    "ORICORIO_1": ("Style Flamenco", 741), "ORICORIO_2": ("Style Pom-Pom", 10123),
    "ORICORIO_3": ("Style Hula", 10124), "ORICORIO_4": ("Style Buyō", 10125),
    "U_NECROZMA": ("Ultra", 10157),
    "LYCANROC_D": ("Diurne", 745), "LYCANROC_N": ("Nocturne", 10126),
    "MELOETTA_A": ("Chant", 648), "MELOETTA_P": ("Danse", 10018),
    "MINIOR_M": ("Météore", 774), "MINIOR_C": ("Noyau", 10136),
    "CASTFORM_SUNNY": ("Solaire", 10013), "CASTFORM_RAINY": ("Eau de Pluie", 10014),
    "CASTFORM_SNOWY": ("Blizzard", 10015),
    "SHELLOS_E": ("Orient", "422-east"), "GASTRODON_E": ("Orient", "423-east"),
    "SHELLOS_W": ("Occident", 422), "GASTRODON_W": ("Occident", 423),
    "TORNADUS": ("Avatar", 641), "TORNADUS_T": ("Totémique", 10019),
    "THUNDURUS": ("Avatar", 642), "THUNDURUS_T": ("Totémique", 10020),
    "LANDORUS": ("Avatar", 645), "LANDORUS_T": ("Totémique", 10021),
}


def fetch(url, data=None):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": "pokefusion", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode("utf-8")


def key(name):
    k = re.sub(r"[^a-z0-9]", "", name.lower().replace("♀", "female").replace("♂", "male"))
    return NAME_ALIASES.get(k, k)


def parse_pbs(text):
    mons = []
    for block in re.split(r"^\[(\d+)\]\s*$", text, flags=re.M)[1:]:
        if block.isdigit():
            current = {"id": int(block)}
            mons.append(current)
            continue
        fields = dict(re.findall(r"^(\w+)\s*=\s*(.*?)\s*$", block, flags=re.M))
        current.update(fields)
    return [m for m in mons if m["id"] <= MAX_ID and "Name" in m]


def pokeapi_species():
    query = """query { pokemon_v2_pokemonspecies(order_by:{id:asc}) {
      id name capture_rate is_legendary is_mythical
      pokemon_v2_pokemonspeciesnames(where:{language_id:{_in:[5,9]}}) { name language_id } } }"""
    data = json.loads(fetch(POKEAPI_GRAPHQL, json.dumps({"query": query}).encode()))["data"]
    by_key = {}
    for sp in data["pokemon_v2_pokemonspecies"]:
        names = {n["language_id"]: n["name"] for n in sp["pokemon_v2_pokemonspeciesnames"]}
        entry = {
            "nat": sp["id"], "fr": names.get(5), "capture_rate": sp["capture_rate"],
            "legendary": sp["is_legendary"] or sp["is_mythical"],
        }
        by_key.setdefault(key(sp["name"]), entry)
        if 9 in names:
            by_key.setdefault(key(names[9]), entry)
    return by_key


# Share of non-legendary Pokémon per tier, from most common to rarest
# (1 Poké Ball, 2 Super Ball, 3 Hyper Ball, 4 Honor Ball). Legendaries and mythicals are tier 5 (Master Ball).
TIER_SHARES = [0.38, 0.30, 0.20, 0.12]


def rarity_score(mon, capture_rate):
    """0 = very common, 1 = very rare: low catch rate and high base stat total."""
    bst = sum(mon["stats"])
    return 0.5 * (255 - capture_rate) / 255 + 0.5 * min(max((bst - 180) / 420, 0), 1)


def assign_tiers(out, species_info):
    regular = [m for m in out if not species_info[m["id"]]["legendary"]]
    regular.sort(key=lambda m: rarity_score(m, species_info[m["id"]]["capture_rate"]))
    bounds, acc = [], 0
    for share in TIER_SHARES:
        acc += share
        bounds.append(acc * len(regular))
    for rank, m in enumerate(regular):
        m["tier"] = next(t for t, b in enumerate(bounds, 1) if rank < b)
    for m in out:
        if species_info[m["id"]]["legendary"]:
            m["tier"] = 5


def main():
    species = pokeapi_species()
    out, unmatched, species_info = [], [], {}
    for m in parse_pbs(fetch(PBS_URL)):
        hp, atk, df, spe, spa, spd = map(int, m["BaseStats"].split(","))
        types = [m["Type1"].lower()]
        if m.get("Type2") and m["Type2"].lower() != types[0]:
            types.append(m["Type2"].lower())
        match = species.get(key(m["Name"])) or species.get(key(m.get("InternalName", "")))
        if not match:
            unmatched.append(f'{m["id"]} {m["Name"]}')
        form_label, sprite_id = FORMS.get(m.get("InternalName"), (None, None))
        out.append({
            "id": m["id"],
            "nat": match["nat"] if match else None,
            "sprite": sprite_id or (match and match["nat"]),
            "en": m["Name"],
            "fr": (match and match["fr"]) or m["Name"],
            "form": form_label,
            "types": types,
            "stats": [hp, atk, df, spa, spd, spe],
        })
        species_info[m["id"]] = {
            "capture_rate": match["capture_rate"] if match else 45,
            "legendary": bool(match and match["legendary"]),
        }
    assign_tiers(out, species_info)
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(out)} Pokémon -> {OUT}")
    if unmatched:
        print("Sans correspondance PokéAPI:", ", ".join(unmatched))


if __name__ == "__main__":
    main()
