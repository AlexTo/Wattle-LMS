/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it, vi } from 'vitest';
import {
  hasTransactionConflict,
  writeUnderActiveAncestors,
} from './course-lifecycle.js';

const ancestors = { courseId: 'c', moduleId: 'm', lessonId: 'l' };

// A coreTable whose transaction resolves as given. Only the transaction's
// shape matters here: `data` holds one result per item, ancestor checks first.
const coreTableWith = (result: {
  canceled: boolean;
  data?: { code?: string }[];
}) => {
  const check = () => ({ where: () => ({ commit: () => ({}) }) });
  const coreTable = {
    transaction: {
      write: vi.fn((build: (entities: unknown) => unknown) => {
        build({ module: { check }, lesson: { check } });
        return { go: vi.fn().mockResolvedValue(result) };
      }),
    },
    entities: {
      // Re-read to name an archived ancestor precisely: both still active.
      module: {
        get: () => ({ go: async () => ({ data: { moduleId: 'm' } }) }),
      },
      lesson: {
        get: () => ({ go: async () => ({ data: { lessonId: 'l' } }) }),
      },
    },
  };
  return coreTable as never;
};

const run = (
  result: Parameters<typeof coreTableWith>[0],
  onWrite?: () => never,
) =>
  writeUnderActiveAncestors(
    coreTableWith(result),
    ancestors,
    () => [],
    onWrite,
  );

describe('writeUnderActiveAncestors', () => {
  it('resolves when the transaction commits', async () => {
    await expect(run({ canceled: false, data: [] })).resolves.toBeUndefined();
  });

  it('reports CONFLICT when an ancestor check failed but the ancestors are still active', async () => {
    await expect(
      run({
        canceled: true,
        data: [{ code: 'ConditionalCheckFailed' }, {}, {}],
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it("calls the caller's own error when one of the writes failed its condition", async () => {
    const onWriteConflict = vi.fn(() => {
      throw new Error('caller error');
    });

    await expect(
      run(
        { canceled: true, data: [{}, {}, { code: 'ConditionalCheckFailed' }] },
        onWriteConflict,
      ),
    ).rejects.toThrow('caller error');
  });

  // DynamoDB cancels one of two transactions that touch the same records at
  // once with TransactionConflict rather than a failed condition. Nothing was
  // written, so it's a retryable conflict, not a server error.
  it.each([
    [[{ code: 'TransactionConflict' }, {}, {}]],
    [[{}, {}, { code: 'TransactionConflict' }]],
    [[{ code: 'TransactionConflict' }, {}, { code: 'TransactionConflict' }]],
  ])(
    'reports CONFLICT, not a server error, for a transaction conflict %j',
    async (data) => {
      await expect(run({ canceled: true, data })).rejects.toMatchObject({
        code: 'CONFLICT',
        message: expect.stringContaining('Please retry'),
      });
    },
  );

  it('still reports a failed condition in preference to a transaction conflict', async () => {
    const onWriteConflict = vi.fn(() => {
      throw new Error('caller error');
    });

    await expect(
      run(
        {
          canceled: true,
          data: [
            { code: 'TransactionConflict' },
            {},
            { code: 'ConditionalCheckFailed' },
          ],
        },
        onWriteConflict,
      ),
    ).rejects.toThrow('caller error');
  });

  it('reports INTERNAL_SERVER_ERROR when the cancellation has no recognised reason', async () => {
    await expect(
      run({ canceled: true, data: [{}, {}, {}] }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  });
});

describe('hasTransactionConflict', () => {
  it('is true only when some result is a TransactionConflict', () => {
    expect(hasTransactionConflict([{}, { code: 'TransactionConflict' }])).toBe(
      true,
    );
    expect(hasTransactionConflict([{ code: 'ConditionalCheckFailed' }])).toBe(
      false,
    );
    expect(hasTransactionConflict(undefined)).toBe(false);
  });
});
