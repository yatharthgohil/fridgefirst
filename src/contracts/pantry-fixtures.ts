import { pantryListResponseSchema } from './pantry';

export const pantryContractFixture = pantryListResponseSchema.parse({
  asOfDate: '2026-11-12',
  items: [{
    id: '00000000-0000-4000-8000-000000000005', name: 'Spinach', quantity: 0.75, unit: 'bag',
    storageLocation: 'Fridge', addedOn: '2026-11-10',
    expiration: { kind: 'unknown', date: null, reason: 'no_match' },
    notes: null, status: 'active', version: 1,
    createdAt: '2026-11-10T10:00:00Z', updatedAt: '2026-11-10T10:00:00Z',
    urgency: { kind: 'unknown', daysRemaining: null, label: 'Date unknown' },
  }, {
    id: '00000000-0000-4000-8000-000000000006', name: 'Milk', quantity: 1, unit: 'L',
    storageLocation: 'Fridge', addedOn: '2026-11-10',
    expiration: { kind: 'override', date: '2026-11-13' },
    notes: 'Date on package', status: 'active', version: 2,
    createdAt: '2026-11-10T10:00:00Z', updatedAt: '2026-11-11T10:00:00Z',
    urgency: { kind: 'critical', daysRemaining: 1, label: 'Use tomorrow' },
  }, {
    id: '00000000-0000-4000-8000-000000000007', name: 'Example food', quantity: 0, unit: 'item',
    storageLocation: 'Pantry', addedOn: '2026-11-10',
    expiration: { kind: 'estimate', date: '2026-11-20', provenance: {
      referenceId: '00000000-0000-4000-8000-000000000008', foodName: 'Example food', storageLocation: 'Pantry',
      days: 10, sourceName: 'Demonstration only', sourceUrl: 'https://example.com/fixture',
      sourceAccessedOn: '2026-11-10', assumptions: 'Contract fixture, not food guidance',
    } },
    notes: null, status: 'consumed', version: 3,
    createdAt: '2026-11-10T10:00:00Z', updatedAt: '2026-11-11T10:00:00Z',
    urgency: { kind: 'later', daysRemaining: 8, label: '8 days left' },
  }],
});
