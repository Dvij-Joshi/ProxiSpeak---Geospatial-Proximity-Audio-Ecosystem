import test from 'node:test';
import assert from 'node:assert/strict';
import { isCompanyEmail, classifyUserAccount } from '../src/utils/userType.js';

test('isCompanyEmail correctly classifies personal consumer email domains', () => {
  const personalEmails = [
    'user@gmail.com',
    'student@googlemail.com',
    'worker@yahoo.com',
    'alex@outlook.com',
    'dev@hotmail.com',
    'member@icloud.com',
    'lead@proton.me',
    'contact@aol.com',
  ];

  for (const email of personalEmails) {
    assert.equal(isCompanyEmail(email), false, `Expected ${email} to be classified as personal (false)`);
  }
});

test('isCompanyEmail correctly classifies enterprise organization domains', () => {
  const corporateEmails = [
    'kunj@google.com',
    'dvij@microsoft.com',
    'engineer@netflix.com',
    'founder@startup.io',
    'designer@proxispeak.ai',
    'director@acme.org',
    'staff@university.edu',
  ];

  for (const email of corporateEmails) {
    assert.equal(isCompanyEmail(email), true, `Expected ${email} to be classified as corporate (true)`);
  }
});

test('classifyUserAccount returns organization for org members or corporate emails', () => {
  // Personal user without org
  const personalUser = { username: 'john', email: 'john@gmail.com' };
  assert.equal(classifyUserAccount(personalUser, null), 'personal');

  // Corporate email user without org yet
  const corporateUser = { username: 'sarah', email: 'sarah@google.com' };
  assert.equal(classifyUserAccount(corporateUser, null), 'organization');

  // Personal email user that belongs to an organization
  const orgMember = { username: 'alex', email: 'alex@gmail.com' };
  assert.equal(classifyUserAccount(orgMember, { orgId: 'acme-corp' }), 'organization');

  // Guest
  assert.equal(classifyUserAccount(null), 'guest');
});

test('isCompanyEmail safely handles empty, malformed, or invalid inputs', () => {
  assert.equal(isCompanyEmail(null), false);
  assert.equal(isCompanyEmail(undefined), false);
  assert.equal(isCompanyEmail(''), false);
  assert.equal(isCompanyEmail('notanemail'), false);
  assert.equal(isCompanyEmail(123), false);
});
