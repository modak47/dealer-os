import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { sellerDatabase, rpc } from './support/seller-database';

test('BikeBuyer photo manifest: private access, ownership, replay, limits, completion and retention', async () => {
  const db = await sellerDatabase();
  try {
    await db.exec("alter table website_leads add column external_submission_id text; insert into website_leads(id,lead_source,external_submission_id) values(91001,'bike_buyer_uk','test-one'),(91002,'motorgeeks','test-two'),(91003,'bike_buyer_uk','test-three');");
    await db.exec(readFileSync('supabase/migrations/20261103142428_bikebuyeruk_photo_transfer.sql','utf8'));
    const photo = {id:randomUUID(),sha256:'a'.repeat(64),byte_size:100,width:100,height:100};
    const call = (action:string, photos:unknown[]=[photo], lead=91001, external='test-one') => rpc(db,'bbuk_photo_transfer',{p_lead_id:lead,p_external_id:external,p_action:action,p_photos:photos});
    for (const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(call('reserve'),/permission denied/);
      await assert.rejects(db.query('select * from bikebuyeruk_photo_transfers'),/permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    await assert.rejects(call('reserve',[photo],91002,'test-two'),/Lead not found/);
    await assert.rejects(call('reserve',[photo],91001,'wrong'),/Lead not found/);
    await assert.rejects(call('reserve',[photo,photo]),/Duplicate photo/);
    await assert.rejects(call('reserve',Array.from({length:11},()=>({...photo,id:randomUUID()}))),/Invalid manifest/);
    await assert.rejects(call('reserve',[{...photo,byte_size:4194305}]),/Invalid photo/);
    assert.equal((await call('reserve')).complete,false);
    assert.equal((await call('reserve')).complete,false);
    assert.equal((await db.query('select * from lead_photos')).rows.length,1);
    await assert.rejects(call('reserve',[{...photo,sha256:'b'.repeat(64)}]),/Manifest conflict/);
    await assert.rejects(call('reserve',[photo],91003,'test-three'),/Photo ID conflict/);
    await assert.rejects(call('complete'),/Photos incomplete/);
    await assert.rejects(call('ack',[{...photo,sha256:'b'.repeat(64)}]),/Photo conflict/);
    await call('ack'); await call('ack');
    assert.equal((await call('complete')).complete,true);
    const completed = (await db.query<{completed_at:Date}>('select completed_at from bikebuyeruk_photo_transfers')).rows[0].completed_at;
    assert.equal((await call('complete')).complete,true);
    assert.deepEqual((await db.query<{completed_at:Date}>('select completed_at from bikebuyeruk_photo_transfers')).rows[0].completed_at,completed);
    await assert.rejects(call('expire'),/Retention not reached/);
    await db.exec("update bikebuyeruk_photo_transfers set completed_at=now()-interval '31 days'");
    assert.equal((await call('expire')).removed,true);
    assert.equal((await call('reserve')).removed,true);
    await assert.rejects(call('ack'),/Photo conflict/);
    assert.equal((await db.query<{status:string}>('select status from lead_photos')).rows[0].status,'removed');
    // Unrelated seller photos and leads remain untouched.
    assert.equal((await db.query<{n:number}>('select count(*)::int n from website_leads')).rows[0].n,3);
    await db.exec("insert into website_leads(id,lead_source,external_submission_id) values(91004,'bike_buyer_uk','test-four')");
    const large=Array.from({length:10},()=>({...photo,id:randomUUID(),byte_size:4194304}));
    await call('reserve',large,91003,'test-three');
    await assert.rejects(call('reserve',Array.from({length:3},()=>({...photo,id:randomUUID(),byte_size:4194304})),91004,'test-four'),/Photo budget reached/);
    assert.equal((await db.query<{n:number}>('select count(*)::int n from bikebuyeruk_photo_transfers')).rows[0].n,2);
  } finally { await db.close(); }
});
