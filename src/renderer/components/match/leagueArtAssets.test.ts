import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('bundled League match artwork', () => {
  it('contains the exact verified PNG bytes recorded in its source manifest', () => {
    const directory = path.resolve('src/renderer/assets/match-ui');
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'sources.json'), 'utf8')) as { assets: { name: string; sha256: string; bytes: number }[] };
    expect(manifest.assets).toHaveLength(30);
    for (const asset of manifest.assets) {
      const data = fs.readFileSync(path.join(directory, asset.name));
      expect(data.length, asset.name).toBe(asset.bytes);
      expect(data.subarray(0, 8).toString('hex'), asset.name).toBe('89504e470d0a1a0a');
      expect(createHash('sha256').update(data).digest('hex'), asset.name).toBe(asset.sha256);
    }
  });
});
