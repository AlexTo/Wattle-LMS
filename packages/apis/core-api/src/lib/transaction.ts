/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { TRPCError } from '@trpc/server';

// The reason DynamoDB gave for cancelling each item of a transaction, in the
// order the items were written.
export type CancellationReasons = ({ code?: string } | undefined)[];

export const failedCondition = (
  reasons: CancellationReasons,
  index: number,
): boolean => reasons[index]?.code === 'ConditionalCheckFailed';

// DynamoDB cancels one of two transactions that touch the same records at the
// same moment with TransactionConflict, rather than a failed condition.
// Nothing was written and a retry is safe, so it's a CONFLICT, not a server
// error.
export const hasTransactionConflict = (reasons: CancellationReasons) =>
  reasons.some((reason) => reason?.code === 'TransactionConflict');

export const transactionConflict = () =>
  new TRPCError({
    code: 'CONFLICT',
    message:
      'Another request was changing the same records; nothing was changed. Please retry',
  });
