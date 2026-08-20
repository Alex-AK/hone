import { prettyDOM, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { record } from '../../hone/record';
import { fixture } from '../../src/client/api';
import { ContactDetailsForm } from '../../src/client/ContactDetailsForm';
import { MESSAGES } from '../../src/client/rules';

beforeEach(() => {
  fixture.reset();
});

function setup() {
  const user = userEvent.setup({ delay: null });
  render(<ContactDetailsForm />);

  return {
    user,
    fullName: screen.getByLabelText('Full name'),
    email: screen.getByLabelText('Email address'),
    phone: screen.getByLabelText('Phone number'),
    save: screen.getByRole('button', { name: /save/i }),
  };
}

/** What a screen reader reads out as the field's description, if anything. */
function description(field: HTMLElement): string {
  return (field.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
    .trim();
}

describe('every message reaches the field it is about', () => {
  it('says nothing about a field nobody has submitted yet', () => {
    const { fullName, email, phone } = setup();

    for (const field of [fullName, email, phone]) {
      expect(field.getAttribute('aria-invalid')).not.toBe('true');
      expect(description(field)).toBe('');
    }
  });

  it('marks the fields that failed', async () => {
    const { user, save, fullName, email, phone } = setup();

    await user.click(save);

    for (const field of [fullName, email, phone]) {
      expect(
        field.getAttribute('aria-invalid'),
        `${field.id} failed and nothing on it says so`
      ).toBe('true');
    }
  });

  it('marks only the fields that failed', async () => {
    const { user, save, fullName, email, phone } = setup();

    await user.type(fullName, 'Ada Okonjo');
    await user.type(email, 'ada@example.com');
    await user.click(save);

    expect(fullName.getAttribute('aria-invalid')).not.toBe('true');
    expect(email.getAttribute('aria-invalid')).not.toBe('true');
    expect(phone.getAttribute('aria-invalid')).toBe('true');
  });

  it('points each field at the message underneath it', async () => {
    const { user, save, fullName, email, phone } = setup();

    await user.click(save);

    // "described by nothing" is a claim about `aria-describedby` and an id
    // somewhere else in the tree, which is the one thing a verdict cannot show.
    // `highlight: false` because the panel renders text, not a terminal.
    record(
      'the form after a failed save',
      prettyDOM(save.closest('form') ?? document.body, undefined, { highlight: false }) ?? ''
    );
    expect(screen.getByText(MESSAGES.fullName)).toBeDefined();
    expect(description(fullName), 'the full name field is described by nothing').toContain(
      MESSAGES.fullName
    );
    expect(description(email)).toContain(MESSAGES.email);
    expect(description(phone)).toContain(MESSAGES.phone);
  });

  it('stops describing a field by an error it no longer has', async () => {
    const { user, save, email, phone } = setup();

    await user.click(save);
    expect(email.getAttribute('aria-invalid')).toBe('true');

    await user.type(email, 'ada@example.com');
    await user.click(save);

    expect(
      email.getAttribute('aria-invalid'),
      'the field is fixed and still marked wrong'
    ).not.toBe('true');
    expect(description(email)).toBe('');
    expect(phone.getAttribute('aria-invalid')).toBe('true');
  });
});
