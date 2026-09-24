// 账号表装载的契约测试：主账号来自官方环境变量，额外账号来自 accounts.json，
// 读不到或写坏时只告警不阻断主账号。只测纯函数与临时文件，不启动进程、不接触网络。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAccounts } from '../src/config.mjs';

const dir = mkdtempSync(join(tmpdir(), 'workdsh-portal-accounts-'));
const write = (name, content) => {
  const file = join(dir, name);
  writeFileSync(file, content);
  return file;
};

const primary = { username: '18938845688', password: 'Aa@88822166!' };

test('主账号来自环境变量，额外账号来自账号表', () => {
  const file = write('ok.json', JSON.stringify({ accounts: [{ username: '15889358287', password: 'Aa@123456!' }] }));
  const { accounts, warnings } = loadAccounts({ ...primary, accountsFile: file });
  assert.deepEqual([...accounts.keys()], ['18938845688', '15889358287']);
  assert.equal(accounts.get('15889358287'), 'Aa@123456!');
  assert.deepEqual(warnings, []);
});

test('账号表缺失时不报错，只保留主账号', () => {
  const { accounts, warnings } = loadAccounts({ ...primary, accountsFile: join(dir, 'absent.json') });
  assert.deepEqual([...accounts.keys()], ['18938845688']);
  assert.deepEqual(warnings, [], '缺文件是默认形态，不算配置错误');
});

test('账号表写坏、字段缺失或为空时跳过并告警，主账号仍可用', () => {
  const broken = write('broken.json', '{ oops');
  assert.deepEqual(loadAccounts({ ...primary, accountsFile: broken }).warnings, [`${broken}: 不是合法 JSON，额外账号已忽略`]);
  assert.equal(loadAccounts({ ...primary, accountsFile: broken }).accounts.size, 1);

  const noArray = write('no-array.json', JSON.stringify({ users: [] }));
  assert.match(loadAccounts({ ...primary, accountsFile: noArray }).warnings[0], /缺少 accounts 数组/);

  const messy = write('messy.json', JSON.stringify({
    accounts: [null, { username: '  ', password: 'x' }, { username: 'a', password: '' }, { username: '15889358287', password: 'Aa@123456!' }, { username: '15889358287', password: 'other' }],
  }));
  const messyResult = loadAccounts({ ...primary, accountsFile: messy });
  assert.deepEqual([...messyResult.accounts.keys()], ['18938845688', '15889358287']);
  assert.equal(messyResult.accounts.get('15889358287'), 'Aa@123456!', '首次出现的口令生效，重复用户名被跳过');
  assert.equal(messyResult.warnings.length, 4);
});

test('账号表中的用户名与口令同样归一化', () => {
  const file = write('fullwidth.json', JSON.stringify({ accounts: [{ username: '\uff11\uff15\uff18\uff18\uff19\uff13\uff15\uff18\uff12\uff18\uff17 ', password: 'Aa@123456\uff01' }] }));
  const { accounts } = loadAccounts({ ...primary, accountsFile: file });
  assert.equal(accounts.get('15889358287'), 'Aa@123456!');
});

test('未配置官方口令时账号表仍可独立成立', () => {
  const file = write('only-file.json', JSON.stringify({ accounts: [{ username: 'member', password: 'member-pass' }] }));
  const { accounts, warnings } = loadAccounts({ username: '', password: '', accountsFile: file });
  assert.deepEqual([...accounts.keys()], ['member']);
  assert.deepEqual(warnings, []);

  const half = loadAccounts({ username: 'only-user', password: '', accountsFile: join(dir, 'absent.json') });
  assert.deepEqual([...half.accounts.keys()], [], '只配一半视为配置错误，不落账号');
  assert.match(half.warnings[0], /^DSH_AUTH_USERNAME\/DSH_AUTH_PASSWORD: 用户名或口令为空/);
});
