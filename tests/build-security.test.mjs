import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

test('the generated site does not contain a Hugging Face access token', async () => {
  const assetDirectory = 'docs/assets';
  const assetNames = await readdir(assetDirectory);
  const files = ['docs/index.html', ...assetNames.filter(name => name.endsWith('.js')).map(name => join(assetDirectory, name))];
  const output = await Promise.all(files.map(file => readFile(file, 'utf8')));

  assert.ok(output.length > 1, 'expected the production build to contain JavaScript assets');
  for (const text of output) assert.doesNotMatch(text, /hf_[A-Za-z0-9]/);
});
