import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {parseLabel}=require('../label-v58.js');
test('complete label can be parsed without performing writes',()=>{
 const r=parseLabel('中通快递\n运单号: 79045587905964\n收件人: 安康\n手机号: 09943253053');
 assert.equal(r.tracking_no,'79045587905964');
 assert.equal(r.name,'安康');
 assert.equal(r.phone,'09943253053');
 assert.equal(r.eligible_for_auto_intake,true);
});
test('masked phone must not auto intake',()=>{
 const r=parseLabel('运单号: 79045587905964\n收件人: 安康\n手机号: 099****3328');
 assert.equal(r.eligible_for_auto_intake,false);
});
test('multiple waybills must not auto intake',()=>{
 const r=parseLabel('运单号: 79045587905964\n运单号: 79045587905965\n收件人: 安康\n手机号: 09943253053');
 assert.equal(r.eligible_for_auto_intake,false);
});
