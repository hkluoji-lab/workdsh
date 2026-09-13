import test from 'node:test';
import assert from 'node:assert/strict';
import { isNativePreset, nativePresetRows, requireNativePreset } from '../../packages/plugins/experts/dist/client/preset-policy.js';
test('native new-session and default menus exclude every compiled expert including public leads', () => {
  const rows = [{id:'dsh-base'}, {id:'custom'}, {id:'wd-exp-work-retrospective-advisor-123'}, {id:'wd-exp-member-123'}];
  assert.deepEqual(nativePresetRows(rows), rows.slice(0,2));
  assert.equal(isNativePreset('wd-exp-public-team'), false);
  assert.throws(() => requireNativePreset(rows[2].id), /召唤专家/);
  assert.doesNotThrow(() => requireNativePreset('dsh-base'));
});

import { installExpertPresetMenu } from '../../packages/plugins/experts/dist/client/PresetMenu.js';
test('both native Slot adapters filter the roster and refuse internal select/default mutations', async () => {
  const registrations = [];
  const ctx = { slots: {
    entriesOfSlot: key => [{ options: key === 'settings.section' ? {id:'agent-presets',order:20,label:'Agent presets'} : {}, inject: () => ({}), component: 'native-preset' }],
    register: (options, component) => { registrations.push({options, component}); return () => {}; },
    subscribe: () => () => {},
  }, effect: callback => callback() };
  installExpertPresetMenu(ctx, {});
  assert.equal(registrations.length, 2);
  const rows = [{id:'dsh-base'}, {id:'wd-exp-public-expert'}];
  let writes = 0;
  const seat = registrations[0].component({ useAgentPresetSeat: selector => selector({options:rows}), select: async () => { writes++; } });
  assert.deepEqual(seat.props.useAgentPresetSeat(s => s.options), rows.slice(0,1));
  await assert.rejects(seat.props.select(rows[1].id), /召唤专家/);
  const settings = registrations[1].component({ useAgentPresetSection: selector => selector({rows}), makeDefault: async () => { writes++; }, beginCopy: () => { writes++; } });
  assert.deepEqual(settings.props.useAgentPresetSection(s => s.rows), rows.slice(0,1));
  await assert.rejects(settings.props.makeDefault(rows[1].id), /召唤专家/);
  assert.throws(() => settings.props.beginCopy(rows[1].id), /召唤专家/);
  assert.equal(writes, 0);
  await settings.props.makeDefault('dsh-base');
  assert.equal(writes, 1);
});

test('summoned expert keeps the unfiltered authored roster for its read-only label', () => {
  let Seat;
  const ctx = {slots:{entriesOfSlot: () => [{options:{},inject:()=>({}),component:'native'}], subscribe:()=>()=>{},register:(_,component)=>{Seat=component;return ()=>{};}},effect:fn=>fn()};
  installExpertPresetMenu(ctx, {});
  // Capture the hero adapter (the fake settings owner intentionally does not match).
  const rows=[{id:'standard',name:'标准模式'},{id:'wd-exp-finance',name:'公司财务专家团'}];
  const element=Seat({useAgentPresetSeat:selector=>selector({current:'wd-exp-finance',options:rows})});
  assert.equal(element.props.useAgentPresetSeat(s=>s.options)[1].name,'公司财务专家团');
  assert.notEqual(element.type,'native');
});
