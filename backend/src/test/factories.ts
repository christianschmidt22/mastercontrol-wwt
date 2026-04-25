import { organizationModel } from '../models/organization.model.js';
import type { Organization, OrganizationInput } from '../models/organization.model.js';

let seq = 0;

/**
 * Build and persist an Organization row with sensible defaults.
 * Pass `overrides` to control any field. Each call gets a unique name
 * so tests that insert multiple orgs don't collide on uniqueness constraints.
 */
export function makeOrg(overrides: Partial<OrganizationInput> = {}): Organization {
  seq += 1;
  const input: OrganizationInput = {
    type: 'customer',
    name: `Test Org ${seq}`,
    metadata: {},
    ...overrides,
  };
  return organizationModel.create(input);
}
