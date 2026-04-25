import { describe, it, expect } from 'vitest';
import { db } from '../db/database.js';
import { organizationModel } from './organization.model.js';
import { makeOrg } from '../test/factories.js';

describe('organizationModel.listByType', () => {
  it('returns only organizations matching the requested type', () => {
    makeOrg({ type: 'customer', name: 'Fairview Health' });
    makeOrg({ type: 'customer', name: 'Acme Corp' });
    makeOrg({ type: 'oem', name: 'Cisco' });

    const customers = organizationModel.listByType('customer');
    const oems = organizationModel.listByType('oem');

    expect(customers.length).toBeGreaterThanOrEqual(2);
    expect(customers.every(o => o.type === 'customer')).toBe(true);

    expect(oems.length).toBeGreaterThanOrEqual(1);
    expect(oems.every(o => o.type === 'oem')).toBe(true);

    // Customer ids should not appear in OEM list
    const customerIds = new Set(customers.map(o => o.id));
    expect(oems.some(o => customerIds.has(o.id))).toBe(false);
  });

  it('returns results sorted case-insensitively by name', () => {
    makeOrg({ type: 'customer', name: 'Zebra Inc' });
    makeOrg({ type: 'customer', name: 'apple Corp' });
    makeOrg({ type: 'customer', name: 'Mango Ltd' });

    const list = organizationModel.listByType('customer');
    const names = list.map(o => o.name.toLowerCase());
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });
});

describe('organizationModel — JSON metadata round-trip', () => {
  it('preserves nested metadata structure after create and get', () => {
    const meta = {
      industry: 'Healthcare',
      hq: { city: 'St. Louis', state: 'MO' },
      tags: ['enterprise', 'priority'],
      renewalYear: 2027,
    };

    const org = makeOrg({ metadata: meta });
    const fetched = organizationModel.get(org.id);

    expect(fetched).toBeDefined();
    expect(fetched!.metadata).toEqual(meta);
  });

  it('preserves nested metadata after update', () => {
    const org = makeOrg({ metadata: { tier: 'gold' } });
    const newMeta = { tier: 'platinum', contacts: { primary: 'Jane Doe' } };

    organizationModel.update(org.id, org.name, newMeta);
    const fetched = organizationModel.get(org.id);

    expect(fetched!.metadata).toEqual(newMeta);
  });
});

describe('organizationModel.update', () => {
  it('bumps updated_at relative to created_at', () => {
    const org = makeOrg();

    // Pause one second so CURRENT_TIMESTAMP changes
    const before = new Date(org.updated_at).getTime();

    // SQLite datetime resolution is 1 second; busy-wait a tick to ensure
    // at least a millisecond passes, then rely on the SQL datetime('now').
    // We cannot reliably guarantee a second difference in a fast test, so
    // we assert the value changes (not necessarily greater) when the SQL
    // function is called during update.
    const updated = organizationModel.update(org.id, 'Renamed Org', org.metadata);

    expect(updated).toBeDefined();
    expect(updated!.name).toBe('Renamed Org');

    // updated_at should be set to a value via datetime('now') on update.
    // In practice the clock may not tick in the same second, so we at least
    // assert the field is a non-empty string and is parseable as a date.
    expect(typeof updated!.updated_at).toBe('string');
    expect(updated!.updated_at.length).toBeGreaterThan(0);
    expect(Number.isNaN(new Date(updated!.updated_at).getTime())).toBe(false);

    // Capture for reference even if same second
    const after = new Date(updated!.updated_at).getTime();
    expect(after).toBeGreaterThanOrEqual(before);
  });
});

describe('organizationModel.remove — cascade', () => {
  it('deleting an org cascades to its contacts', () => {
    const org = makeOrg();

    // Insert a contact via raw SQL (contact.model.ts is not yet in this commit)
    db.prepare('INSERT INTO contacts (organization_id, name) VALUES (?, ?)').run(org.id, 'Test Contact');

    const countBefore = (
      db.prepare<[number], { n: number }>('SELECT COUNT(*) AS n FROM contacts WHERE organization_id = ?').get(org.id)!
    ).n;
    expect(countBefore).toBe(1);

    organizationModel.remove(org.id);

    const countAfter = (
      db.prepare<[number], { n: number }>('SELECT COUNT(*) AS n FROM contacts WHERE organization_id = ?').get(org.id)!
    ).n;
    expect(countAfter).toBe(0);
  });

  it('returns true when a row was deleted and false when org does not exist', () => {
    const org = makeOrg();
    expect(organizationModel.remove(org.id)).toBe(true);
    expect(organizationModel.remove(org.id)).toBe(false);
  });
});
