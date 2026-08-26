import fs from 'node:fs/promises';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const projectId = 'wmgj-firestore-rules-test';
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await fs.readFile(new URL('../firestore/firestore.rules', import.meta.url), 'utf8') }
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'organizations/wmgj'), { name: 'WMGJ', active: true });
    await setDoc(doc(db, 'organizations/wmgj/members/admin'), { role: 'org_admin', active: true });
    await setDoc(doc(db, 'organizations/wmgj/members/viewer'), { role: 'viewer', active: true });
    await setDoc(doc(db, 'organizations/other/members/other-user'), { role: 'viewer', active: true });
    await setDoc(doc(db, 'organizations/wmgj/sourceDocuments/doc1'), { orgId: 'wmgj', workflowState: 'VALIDATED' });
  });
});

after(async () => env?.cleanup());

test('nega leitura não autenticada', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, 'organizations/wmgj/sourceDocuments/doc1')));
});

test('permite leitura ao membro do mesmo tenant', async () => {
  const db = env.authenticatedContext('viewer').firestore();
  await assertSucceeds(getDoc(doc(db, 'organizations/wmgj/sourceDocuments/doc1')));
});

test('nega leitura cruzada entre tenants', async () => {
  const db = env.authenticatedContext('viewer').firestore();
  await assertFails(getDoc(doc(db, 'organizations/other/sourceDocuments/doc1')));
});

test('nega escrita cliente em auditEvents', async () => {
  const db = env.authenticatedContext('admin').firestore();
  await assertFails(setDoc(doc(db, 'organizations/wmgj/auditEvents/fake'), { orgId: 'wmgj' }));
});

test('admin pode criar action item válido', async () => {
  const db = env.authenticatedContext('admin').firestore();
  const now = new Date();
  await assertSucceeds(setDoc(doc(db, 'organizations/wmgj/actionItems/a1'), {
    orgId: 'wmgj',
    title: 'Revisar conciliação',
    status: 'OPEN',
    riskLevel: 'HIGH',
    createdBy: 'admin',
    createdAt: now,
    updatedAt: now
  }));
  assert.ok(true);
});
