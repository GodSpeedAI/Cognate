import { describe, expect, test } from 'bun:test';
import { edges } from '../src/data/parts';
import { AUTHORITY_ROUTES, LEDGER_X1, LEDGER_Y, Z_RECORD, blockedBy, writerBase } from '../src/lib/route';

// The authority route (Beat C) is orthogonal on the board and never crosses a cartridge face, top face or agent token.
const writers = edges.filter((e) => e.to === 'C-10' && e.kind === 'stores-in').map((e) => e.from);
const indexOf = (id: string) => Number(id.slice(2)) - 1;

describe('authority route table', () => {
  test('there is one route per verified writer of the durable record, and no others', () => {
    expect(Object.keys(AUTHORITY_ROUTES).sort()).toEqual([...writers].sort());
  });

  for (const id of writers) {
    describe(id, () => {
      const route = AUTHORITY_ROUTES[id];

      test('starts at the writer base and ends at the ledger row end', () => {
        expect(route[0]).toEqual([...writerBase(indexOf(id))]);
        expect(route[route.length - 1]).toEqual([LEDGER_X1, LEDGER_Y, Z_RECORD]);
      });

      test('every leg runs along one world axis only', () => {
        for (let i = 1; i < route.length; i += 1) {
          const a = route[i - 1];
          const b = route[i];
          const changed = [0, 1, 2].filter((k) => a[k] !== b[k]).length;
          expect(changed).toBe(1);
        }
      });

      test('no leg crosses a cartridge face, top face, agent token or layer label on screen', () => {
        for (let i = 1; i < route.length; i += 1) {
          expect(blockedBy(route[i - 1], route[i])).toBeNull();
        }
      });
    });
  }
});
