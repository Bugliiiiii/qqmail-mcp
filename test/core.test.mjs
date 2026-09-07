import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { Readable } from 'node:stream';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { simpleParser } from 'mailparser';
import {
  collectAttachments,
  downloadPartByUid,
  fetchByUid,
  parseSince,
  sanitizeAttachmentFilename,
  saveAttachment,
  streamToLimitedBuffer,
  stripHtml
} from '../src/index.js';

const execFileAsync = promisify(execFile);

test('README client examples follow the npm latest tag instead of pinning a release', async () => {
  for (const filename of ['README.md', 'README.zh-CN.md']) {
    const content = await readFile(new URL(`../${filename}`, import.meta.url), 'utf8');
    assert.match(content, /@ethanli666\/qqmail-mcp/);
    assert.doesNotMatch(content, /@ethanli666\/qqmail-mcp@\d+\.\d+\.\d+/);
  }
});

test('mailparser preserves UTF-8 body and executable attachment bytes without running them', async () => {
  const script = Buffer.from('#!/bin/sh\necho never-run\n');
  const body = Buffer.from('招聘测评通知');
  const raw = [
    'From: recruiter@example.com',
    'To: candidate@example.com',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="test-boundary"',
    '',
    '--test-boundary',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    body.toString('base64'),
    '--test-boundary',
    'Content-Type: application/octet-stream; name="run.sh"',
    'Content-Disposition: attachment; filename="run.sh"',
    'Content-Transfer-Encoding: base64',
    '',
    script.toString('base64'),
    '--test-boundary--',
    ''
  ].join('\r\n');
  const parsed = await simpleParser(raw);
  assert.equal(parsed.text.trim(), body.toString());
  assert.equal(parsed.attachments.length, 1);
  assert.equal(parsed.attachments[0].filename, 'run.sh');
  assert.deepEqual(parsed.attachments[0].content, script);
});

test('fetchByUid always treats the identifier as a UID', async () => {
  let captured;
  const client = {
    async fetchOne(id, query, options) {
      captured = { id, query, options };
      return { uid: id };
    }
  };
  await fetchByUid(client, 4321, { source: true });
  assert.deepEqual(captured, {
    id: 4321,
    query: { source: true },
    options: { uid: true }
  });
});

test('parseSince rejects invalid, future, and excessive lookback values', () => {
  const now = new Date('2026-08-14T12:00:00+08:00');
  assert.throws(() => parseSince('not-a-date', now));
  assert.throws(() => parseSince('2026-08-15T00:00:00+08:00', now));
  assert.throws(() => parseSince('2026-01-01T00:00:00+08:00', now));
  assert.equal(parseSince('2026-08-14T00:00:00+08:00', now).toISOString(), '2026-08-13T16:00:00.000Z');
});

test('stripHtml removes executable and presentation markup', () => {
  assert.equal(stripHtml('<style>x</style><script>bad()</script><p>Hello &amp; world</p>'), 'Hello & world');
});

test('collectAttachments finds named and explicit attachment nodes', () => {
  const tree = {
    type: 'multipart/mixed',
    childNodes: [
      { part: '1', type: 'text/plain', size: 20 },
      {
        part: '2',
        type: 'application/pdf',
        disposition: 'attachment',
        dispositionParameters: { filename: 'resume.pdf' },
        size: 123
      },
      {
        part: '3',
        type: 'application/octet-stream',
        parameters: { name: '../installer.pkg' },
        size: 456
      }
    ]
  };
  assert.deepEqual(collectAttachments(tree).map(({ part, filename, size }) => ({ part, filename, size })), [
    { part: '2', filename: 'resume.pdf', size: 123 },
    { part: '3', filename: '../installer.pkg', size: 456 }
  ]);
});

test('sanitizeAttachmentFilename removes path traversal and executable permission is never implied', () => {
  assert.equal(sanitizeAttachmentFilename('../../run.sh', '2.1'), '2-1-run.sh');
  assert.equal(sanitizeAttachmentFilename('.hidden', '3'), '3-hidden');
});

test('downloadPartByUid always uses UID mode and a one-byte overflow probe', async () => {
  let captured;
  const client = {
    async download(uid, part, options) {
      captured = { uid, part, options };
      return { content: Readable.from([]), meta: {} };
    }
  };
  await downloadPartByUid(client, 99, '2.1', 1024);
  assert.deepEqual(captured, { uid: 99, part: '2.1', options: { uid: true, maxBytes: 1025 } });
});

test('streamToLimitedBuffer rejects content over the byte cap', async () => {
  await assert.rejects(() => streamToLimitedBuffer(Readable.from([Buffer.alloc(5), Buffer.alloc(6)]), 10));
});

test('saveAttachment uses a fixed safe path, mode 0600, hash, and no overwrite', async (t) => {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), 'qqmail-attachment-test-'));
  t.after(() => rm(baseDir, { recursive: true, force: true }));
  let quarantinedPath = '';
  const input = {
    buffer: Buffer.from('safe test bytes'),
    folder: 'INBOX',
    uid: 123,
    part: '2',
    filename: '../../installer.pkg',
    contentType: 'application/octet-stream',
    baseDir,
    applyQuarantine: async (filePath) => {
      quarantinedPath = filePath;
    }
  };
  const saved = await saveAttachment(input);
  assert.equal(saved.path, quarantinedPath);
  assert.equal(path.basename(saved.path), '2-installer.pkg');
  assert.equal((await stat(saved.path)).mode & 0o777, 0o600);
  assert.equal((await readFile(saved.path)).toString(), 'safe test bytes');
  assert.equal(saved.sha256, '7f937d33efac78d47a3feb463d9a224291413f1a9f63f24c3fa6d6691c4811f4');
  await assert.rejects(() => saveAttachment(input), /already exists/);
  assert.equal((await readFile(saved.path)).toString(), 'safe test bytes');
});

test('saveAttachment applies the macOS quarantine attribute', { skip: process.platform !== 'darwin' }, async (t) => {
  const baseDir = await mkdtemp(path.join(os.tmpdir(), 'qqmail-quarantine-test-'));
  t.after(() => rm(baseDir, { recursive: true, force: true }));
  const saved = await saveAttachment({
    buffer: Buffer.from('quarantined bytes'),
    folder: 'INBOX',
    uid: 124,
    part: '2',
    filename: 'run.command',
    contentType: 'application/octet-stream',
    baseDir
  });
  const { stdout } = await execFileAsync('/usr/bin/xattr', ['-p', 'com.apple.quarantine', saved.path]);
  assert.match(stdout, /^0081;/);
  assert.equal((await stat(saved.path)).mode & 0o777, 0o600);
});
