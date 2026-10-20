// Windows-only local test launcher. Install embedded-postgres into runtime/pg first.
// No OS service/account is created. All processes use a fresh ignored directory.
import { spawn } from 'node:child_process';
import { writeFile, unlink, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import crypto from 'node:crypto';

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('This launcher requires Windows x64. On other platforms use tests/postgres_smoke.py with an isolated PostgreSQL test database.');
}
const root = path.resolve(import.meta.dirname, '..');
const runtime = path.join(root, 'runtime/pg');
const requireRuntime = createRequire(path.join(runtime, 'package.json'));
const { Client } = requireRuntime('pg');
const bin = path.join(runtime, 'node_modules/@embedded-postgres/windows-x64/native/bin');
const data = path.join(runtime, `data-${Date.now()}`);
const port = Number(process.env.UPDATEHUB_PG_TEST_PORT || '55439');
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('UPDATEHUB_PG_TEST_PORT must be an integer between 1024 and 65535.');
}
const password = crypto.randomBytes(32).toString('hex');
const pwfile = path.join(runtime, `.password-${Date.now()}`);
const python = path.join(root, 'apps/api/.venv/Scripts/python.exe');
const restoreOnly = process.argv.includes('--restore');
const contentOnly = process.argv.includes('--content');
const stationOnly = process.argv.includes('--station');
if (process.argv.slice(2).some(arg => !['--restore', '--content', '--station'].includes(arg)) || [restoreOnly, contentOnly, stationOnly].filter(Boolean).length > 1) throw new Error('Usage: node tests/portable-postgres.mjs [--restore | --content | --station]');
const env = {
  ...process.env,
  DATABASE_URL: `postgresql+psycopg://updatehub_smoke:${password}@127.0.0.1:${port}/updatehub_test_smoke`,
  PYTHONIOENCODING: 'utf-8',
  PATH: `${bin}${path.delimiter}${process.env.PATH || ''}`,
};
function run(command, args, cwd = runtime) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', value => process.stdout.write(value.toString().replaceAll(password, '[redacted]')));
    child.stderr.on('data', value => process.stderr.write(value.toString().replaceAll(password, '[redacted]')));
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${path.basename(command)} failed: ${code}`)));
  });
}

await mkdir(runtime, { recursive: true });
await writeFile(pwfile, password + '\n', { mode: 0o600 });
let started = false;
try {
  await run(path.join(bin, 'initdb.exe'), ['-D', data, '--username=updatehub_smoke', '--auth=scram-sha-256', `--pwfile=${pwfile}`, '--encoding=UTF8', '--locale=C', '--lc-messages=C']);
  await unlink(pwfile);
  await run(path.join(bin, 'pg_ctl.exe'), ['-D', data, '-l', path.join(data, 'postgres.log'), '-o', `-p ${port} -h 127.0.0.1`, '-w', '-t', '30', 'start']);
  started = true;
  const client = new Client({ host: '127.0.0.1', port, user: 'updatehub_smoke', password, database: 'postgres' });
  await client.connect();
  try {
    await client.query('CREATE DATABASE updatehub_test_smoke');
  } finally {
    await client.end();
  }
  await run(python, [path.join(root, stationOnly ? 'tests/postgres_station_smoke.py' : restoreOnly ? 'tests/postgres_restore.py' : contentOnly ? 'apps/api/tests/postgres_content_smoke.py' : 'tests/postgres_smoke.py')], root);
  console.log('POSTGRESQL_17_VERIFICATION_PASSED');
} finally {
  await unlink(pwfile).catch(() => {});
  if (started) await run(path.join(bin, 'pg_ctl.exe'), ['-D', data, '-m', 'fast', '-w', 'stop']);
}
