import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const source = await readFile(new URL('../src/client/styles.ts', import.meta.url), 'utf8');
const css = source.match(/`([\s\S]*)`;/)?.[1];
if (!css) throw new Error('projects CSS template not found');
const markup = `<style>${css}</style><section class="wd-projects"><div class="wd-p-shell"><header class="wd-p-top"><button>项目</button><div><button class="wd-p-primary" disabled>邀请</button></div></header><main class="wd-p-main"><nav class="wd-p-tabs"><button>动态</button><button>计划</button><button>任务</button><button>资产</button></nav><textarea>保留的项目草稿</textarea></main><aside class="wd-p-aside">项目配置</aside></div></section>`;

test('project workspace uses a responsive configuration drawer and themed disabled action', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.setContent(markup);
    const wide = await page.locator('.wd-p-aside').evaluate(node => ({ position: getComputedStyle(node).position, width: node.getBoundingClientRect().width }));
    assert.equal(wide.position, 'static');
    assert.ok(wide.width >= 350);
    const disabled = await page.locator('.wd-p-primary').evaluate(node => getComputedStyle(node).backgroundColor);
    assert.notEqual(disabled, 'rgb(255, 255, 255)');
    assert.equal(await page.locator('.wd-p-tabs button').allTextContents().then(rows => rows.join(',')), '动态,计划,任务,资产');
    assert.equal(await page.locator('textarea').inputValue(), '保留的项目草稿');

    await page.setViewportSize({ width: 720, height: 900 });
    const narrow = await page.locator('.wd-p-aside').evaluate(node => ({ position: getComputedStyle(node).position, right: getComputedStyle(node).right, width: node.getBoundingClientRect().width }));
    assert.equal(narrow.position, 'absolute');
    assert.equal(narrow.right, '0px');
    assert.ok(narrow.width <= 720);
    assert.equal(await page.locator('textarea').inputValue(), '保留的项目草稿');

    await page.locator('.wd-p-shell').evaluate(node => node.classList.add('aside-collapsed'));
    assert.equal(await page.locator('.wd-p-aside').evaluate(node => getComputedStyle(node).display), 'none');
  } finally {
    await browser.close();
  }
});
