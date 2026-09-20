# Match UI artwork

These PNGs are League of Legends client artwork owned by Riot Games, downloaded from the independent CommunityDragon mirror. This app is not an official Riot Games product. CommunityDragon is not an official Riot CDN.

`sources.json` records the exact URLs, dimensions, byte lengths and SHA-256 hashes. The app uses the bundled files; it does not request the mutable `latest` paths at runtime. `node scripts/cache-match-art.mjs` deliberately refreshes this snapshot. Champion portraits and ability icons continue to use the existing game-data service.

Source directory: https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-match-history/global/default/
Riot developer documentation: https://developer.riotgames.com/docs/lol
