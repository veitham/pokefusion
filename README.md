# PokéFusion

A small browser game around [Pokémon Infinite Fusion](https://infinitefusion.fandom.com/) sprites: open Poké Ball boosters, build a collection, then fuse your Pokémon in the lab.

**Play:** https://veitham.github.io/pokefusion/

## Features

- **Boosters** – earn a pack of 5 balls every 15 seconds (up to 10 stored, even while the page is closed). Press <kbd>Space</kbd> to open them all at once.
- **Rarity** – 5 tiers shown by the ball: Poké Ball, Super Ball, Hyper Ball, Honor Ball, Master Ball. Tiers come from PokéAPI data (catch rate + base stat total); legendaries and mythicals are Master Ball. 1/128 shiny chance.
- **Collection** – stacked duplicates, search, filters, sorting, a Pokédex view with silhouettes, and "release duplicates" for bonus packs.
- **Lab** – fuse two of your Pokémon. A random hand-drawn sprite is picked (the auto-generated one is only used when nothing was drawn); both originals are consumed. The fusion's rarity depends on its parents.
- **Fusiodex** – a free simulator to preview any fusion and all its sprite variants.

Saves are stored in the browser (`localStorage`).

## Run locally

It's a static site, any web server works:

```bash
python -m http.server 8080
```

Then open http://localhost:8080/.

## Data

- `tools/build_pokedex.py` builds `data/pokedex.json` from the Infinite Fusion species list and [PokéAPI](https://pokeapi.co/) (national dex numbers, French names, rarity).
- `tools/extract_sprites.py "<sprite pack>.zip"` builds the sprite index in `data/sprites/` (variants + artist credits) from an Infinite Fusion sprite pack, and extracts the sprites the online CDN doesn't host into `sprites/custom/`.

## Credits

- Fusion sprites: the Pokémon Infinite Fusion community artists (credited in-game), served via the [Infinite Fusion Dex](https://infinitefusiondex.com/) CDN.
- Official sprites, cries and Pokémon data: [PokéAPI](https://pokeapi.co/).

Pokémon is © Nintendo / Creatures Inc. / GAME FREAK inc. This is a non-commercial fan project.
