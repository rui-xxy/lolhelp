import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// Riot client artwork mirrored by CommunityDragon. Pin downloaded bytes in the
// app rather than depending on a live "latest" URL every time a panel opens.
const base = 'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-match-history/global/default/';
const directory = path.resolve('src/renderer/assets/match-ui');
const names = ['kills.png', 'arrow.png', 'icon_gold.png', 'roleicon-marksman.png', 'roleicon-tank.png', 'roleicon-support.png', 'roleicon-assassin.png', 'roleicon-mage.png', 'roleicon-fighter.png', 'right_icons_grub.png', ...['baron', 'herald', 'elder', 'air', 'earth', 'fire', 'water', 'dragon', 'inhibitor', 'tower'].flatMap((name) => [100, 200].map((team) => `${name}-${team}.png`))];
await fs.mkdir(directory, { recursive: true });
const manifest = [];
for (let offset = 0; offset < names.length; offset += 4) {
  const batch = await Promise.all(names.slice(offset, offset + 4).map(async (name) => {
    const url = `${base}${name}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 1000000 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`${name}: not a valid bounded PNG`);
    await fs.writeFile(path.join(directory, name), bytes);
    return { name, source: url, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }));
  manifest.push(...batch);
}
await fs.writeFile(path.join(directory, 'sources.json'), JSON.stringify({ retrievedAt: new Date().toISOString(), copyright: 'Riot Games', mirror: 'CommunityDragon (independent community project, not a Riot CDN)', assets: manifest }, null, 2) + '\n');
const imports = manifest.map((asset, index) => `import art${index} from '../../assets/match-ui/${asset.name}';`).join('\n');
const entries = manifest.map((asset, index) => `  '${asset.name}': art${index},`).join('\n');
await fs.writeFile('src/renderer/components/match/leagueArtAssets.ts', `// Generated from the bundled match-ui artwork snapshot.\n${imports}\n\nexport const LEAGUE_ART_ASSETS: Record<string, string> = {\n${entries}\n};\n`);
console.log(`Cached ${manifest.length} PNG assets (${manifest.reduce((sum, asset) => sum + asset.bytes, 0)} bytes)`);
