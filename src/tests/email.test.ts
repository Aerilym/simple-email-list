import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isValidEmail } from '../api/email';

test('valid emails are accepted', () => {
  assert.equal(isValidEmail('user@example.com'), true);
  assert.equal(isValidEmail('user+tag@example.co.uk'), true);
  assert.equal(isValidEmail('user.name@sub.domain.com'), true);
  assert.equal(isValidEmail('123@456.com'), true);
});

test('invalid emails are rejected', () => {
  assert.equal(isValidEmail(''), false);
  assert.equal(isValidEmail('notanemail'), false);
  assert.equal(isValidEmail('missing@tld'), false);
  assert.equal(isValidEmail('@nodomain.com'), false);
  assert.equal(isValidEmail('no-at-sign.com'), false);
  assert.equal(isValidEmail('spaces in@email.com'), false);
  assert.equal(isValidEmail('two@@at.com'), false);
});
