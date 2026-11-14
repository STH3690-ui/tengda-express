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

test('unique name and phone matches existing customer',()=>{
 const {matchCustomer}=require('../label-v58.js');
 assert.deepEqual(matchCustomer([{id:'c1',name:'安康',phone:'09943253053'}],{name:'安康',phone:'09943253053'}),{status:'matched',customer_id:'c1'});
});
test('same name different phone must be reviewed',()=>{
 const {matchCustomer}=require('../label-v58.js');
 assert.equal(matchCustomer([{id:'c1',name:'安康',phone:'09911111111'}],{name:'安康',phone:'09943253053'}).status,'review');
});
test('same phone different name must be reviewed',()=>{
 const {matchCustomer}=require('../label-v58.js');
 assert.equal(matchCustomer([{id:'c1',name:'小明',phone:'09943253053'}],{name:'安康',phone:'09943253053'}).status,'review');
});

test('phone with spaces matches after normalization',()=>{
 const {matchCustomer}=require('../label-v58.js');
 assert.equal(matchCustomer([{id:'c1',name:'安康',phone:'099 4325 3053'}],{name:'安康',phone:'09943253053'}).status,'matched');
});
test('two matching customers must be reviewed',()=>{
 const {matchCustomer}=require('../label-v58.js');
 assert.equal(matchCustomer([{id:'c1',name:'安康',phone:'09943253053'},{id:'c2',name:'安康',phone:'09943253053'}],{name:'安康',phone:'09943253053'}).status,'review');
});
test('no customer match returns new without creating records',()=>{
 const {matchCustomer}=require('../label-v58.js');
 assert.equal(matchCustomer([],{name:'安康',phone:'09943253053'}).status,'new');
});

test('standalone Myanmar phone is not treated as a tracking number',()=>{
 const r=parseLabel('收件人: 安康\n手机号: 09943253053\n09943253053');
 assert.equal(r.tracking_no,'');
 assert.equal(r.eligible_for_auto_intake,false);
});
test('sorting code cannot stand in for missing waybill',()=>{
 const r=parseLabel('631-C10 789\n收件人: 安康\n手机号: 09943253053');
 assert.equal(r.eligible_for_auto_intake,false);
});

test('phone label 手机号 is recognized',()=>{
 const r=parseLabel('运单号: 79045587905964\n收件人: 安康\n手机号: 09943253053');
 assert.equal(r.phone,'09943253053');
 assert.equal(r.eligible_for_auto_intake,true);
});
