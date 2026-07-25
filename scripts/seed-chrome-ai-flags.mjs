#!/usr/bin/env node
/**
 * Seeds Prompt API / Gemini Nano chrome://flags into the dedicated WXT Chrome
 * profile's Local State (browser.enabled_labs_experiments).
 *
 * Chrome 150 option indices for #optimization-guide-on-device-model:
 *   @0 Default | @1 Enabled | @2 Enabled BypassPerfRequirement | @3 Force Small | @4 Disabled
 *
 * Must run while no Chrome process is using .wxt/chrome-data (single-instance lock).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const profileDir = resolve(root, '.wxt/chrome-data');
const localStatePath = resolve(profileDir, 'Local State');

/** @type {string[]} */
const REQUIRED_LABS = [
  'optimization-guide-on-device-model@2', // Enabled BypassPerfRequirement
  'prompt-api-for-gemini-nano@1', // Enabled
  'prompt-api-for-gemini-nano-multimodal-input@1', // Enabled
];

const FLAG_PREFIXES = [
  'optimization-guide-on-device-model',
  'prompt-api-for-gemini-nano',
  'prompt-api-for-gemini-nano-multimodal-input',
];

async function main() {
  await mkdir(profileDir, { recursive: true });

  let state = {};
  try {
    state = JSON.parse(await readFile(localStatePath, 'utf8'));
  } catch (err) {
    if (err && err.code !== 'ENOENT') throw err;
  }

  const browser = state.browser ?? (state.browser = {});
  const existing = Array.isArray(browser.enabled_labs_experiments)
    ? browser.enabled_labs_experiments
    : [];

  const kept = existing.filter(
    (entry) => !FLAG_PREFIXES.some((p) => entry === p || entry.startsWith(`${p}@`)),
  );
  browser.enabled_labs_experiments = [...kept, ...REQUIRED_LABS];

  await writeFile(localStatePath, `${JSON.stringify(state)}\n`, 'utf8');
  console.log(
    `Seeded chrome://flags into ${localStatePath}:\n  ${REQUIRED_LABS.join('\n  ')}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
