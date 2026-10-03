/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '../init.js';
import {
  deleteContentItem,
  deleteContentItemPermanently,
  hideContentItem,
  publishContentItem,
  restoreContentItem,
} from './content-item-shared.js';
import {
  createContentItemText,
  updateContentItemText,
} from './content-item-text.js';
import {
  createLesson,
  deleteLesson,
  deleteLessonPermanently,
  hideLesson,
  publishLesson,
  restoreLesson,
  updateLesson,
} from './lesson.js';
import {
  createModule,
  deleteModule,
  deleteModulePermanently,
  hideModule,
  publishModule,
  restoreModule,
  updateModule,
} from './module.js';

// Covers what a course's status changes about curriculum edits (visibility of
// new records, delete vs. archive) and the publish/hide/restore/permanent
// delete lifecycle. The draft-course hard-delete cascades themselves are
// covered in module.test.ts, lesson.test.ts and content-item-shared.test.ts.

const {
  courseInstructorGet,
  courseGet,
  moduleGet,
  moduleCreate,
  moduleQueryPrimary,
  modulePatch,
  lessonGet,
  lessonCreate,
  lessonQueryPrimary,
  lessonPatch,
  contentItemGet,
  contentItemCreate,
  contentItemQueryPrimary,
  contentItemPatch,
  contentItemDelete,
  transactionWrite,
  transactionGo,
  bestEffortDeleteContentItemVideos,
  bestEffortCancelTranscodeJobs,
} = vi.hoisted(() => ({
  courseInstructorGet: vi.fn(),
  courseGet: vi.fn(),
  moduleGet: vi.fn(),
  moduleCreate: vi.fn(),
  moduleQueryPrimary: vi.fn(),
  modulePatch: vi.fn(),
  lessonGet: vi.fn(),
  lessonCreate: vi.fn(),
  lessonQueryPrimary: vi.fn(),
  lessonPatch: vi.fn(),
  contentItemGet: vi.fn(),
  contentItemCreate: vi.fn(),
  contentItemQueryPrimary: vi.fn(),
  contentItemPatch: vi.fn(),
  contentItemDelete: vi.fn(),
  transactionWrite: vi.fn(),
  transactionGo: vi.fn(),
  bestEffortDeleteContentItemVideos: vi.fn(),
  bestEffortCancelTranscodeJobs: vi.fn(),
}));

vi.mock('@discava/core-table', () => ({
  createCoreTableService: vi.fn(async () => ({
    entities: {
      courseInstructor: { get: courseInstructorGet },
      course: { get: courseGet },
      module: {
        get: moduleGet,
        create: moduleCreate,
        query: { primary: moduleQueryPrimary },
        patch: modulePatch,
      },
      lesson: {
        get: lessonGet,
        create: lessonCreate,
        query: { primary: lessonQueryPrimary },
        patch: lessonPatch,
      },
      contentItem: {
        get: contentItemGet,
        create: contentItemCreate,
        query: { primary: contentItemQueryPrimary },
        patch: contentItemPatch,
        delete: contentItemDelete,
      },
    },
    transaction: { write: transactionWrite },
  })),
}));

vi.mock('../lib/s3-client.js', () => ({ bestEffortDeleteContentItemVideos }));
vi.mock('../lib/mediaconvert-client.js', () => ({
  bestEffortCancelTranscodeJobs,
}));

const router = t.router({
  createModule,
  updateModule,
  updateLesson,
  updateContentItemText,
  deleteModule,
  publishModule,
  hideModule,
  restoreModule,
  deleteModulePermanently,
  createLesson,
  deleteLesson,
  publishLesson,
  hideLesson,
  restoreLesson,
  deleteLessonPermanently,
  createContentItemText,
  deleteContentItem,
  publishContentItem,
  hideContentItem,
  restoreContentItem,
  deleteContentItemPermanently,
});
const caller = t.createCallerFactory(router);

const INSTRUCTOR_SUB = 'instructor-1';
const COURSE_ID = 'course-1';
const MODULE_ID = 'module-1';
const LESSON_ID = 'lesson-1';
const ARCHIVED_AT = '2024-02-01T00:00:00.000Z';

const callAs = () =>
  caller({
    event: {
      requestContext: {
        authorizer: {
          claims: { sub: INSTRUCTOR_SUB, 'cognito:groups': ['instructor'] },
        },
      },
    } as unknown as APIGatewayProxyEvent,
    context: {} as any,
    info: {} as any,
  });

const timestamps = {
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const module = {
  moduleId: MODULE_ID,
  courseId: COURSE_ID,
  title: 'Introduction',
  order: 1,
  visibility: 'visible' as const,
  ...timestamps,
};

const lesson = {
  lessonId: LESSON_ID,
  moduleId: MODULE_ID,
  courseId: COURSE_ID,
  title: 'Welcome',
  order: 1,
  visibility: 'visible' as const,
  ...timestamps,
};

const textItem = (
  contentItemId: string,
  overrides: Record<string, unknown> = {},
) => ({
  contentItemId,
  lessonId: LESSON_ID,
  moduleId: MODULE_ID,
  courseId: COURSE_ID,
  type: 'text' as const,
  status: 'ready' as const,
  title: contentItemId,
  body: '{}',
  order: 1,
  visibility: 'visible' as const,
  studentActivityCount: 0,
  ...timestamps,
  ...overrides,
});

const moduleKey = { courseId: COURSE_ID, moduleId: MODULE_ID };
const lessonKey = { ...moduleKey, lessonId: LESSON_ID };
const itemKey = (contentItemId: string) => ({ ...lessonKey, contentItemId });

const resolves = (data: unknown) => ({
  go: vi.fn().mockResolvedValue({ data }),
});

// A query whose results span more than one page: `.go()` returns only the
// first page unless asked for every page with `{ pages: 'all' }`, as
// ElectroDB's own default is a single page.
const resolvesPaged = (firstPage: unknown[], laterPages: unknown[]) => ({
  go: vi.fn(async (options?: { pages?: number | 'all' }) => ({
    data: options?.pages === 'all' ? [...firstPage, ...laterPages] : firstPage,
  })),
});

// patch(key).set(values) / .remove(attributes), then .go(); returns `data`.
const patchChain = (data: unknown) => {
  const chain = {
    set: vi.fn(() => chain),
    remove: vi.fn(() => chain),
    go: vi.fn().mockResolvedValue({ data }),
  };
  return chain;
};

// What a transaction was asked to write, one entry per item.
type TransactionWrite = {
  entity: string;
  op: 'patch' | 'delete';
  key: Record<string, string>;
  set?: Record<string, unknown>;
  condition?: string;
};
let transactionWrites: TransactionWrite[];

// Renders a `.where()` callback into a readable condition string.
const renderCondition = (where: (attr: any, op: any) => string): string =>
  where(new Proxy({}, { get: (_target, name) => String(name) }), {
    eq: (name: string, value: unknown) => `${name} = ${value}`,
    exists: (name: string) => `exists(${name})`,
  });

const transactionEntity = (entity: string) => ({
  patch: (key: Record<string, string>) => ({
    set: (set: Record<string, unknown>) => ({
      commit: () => ({ entity, op: 'patch', key, set }),
    }),
  }),
  delete: (key: Record<string, string>) => ({
    where: (where: (attr: any, op: any) => string) => ({
      commit: () => ({
        entity,
        op: 'delete',
        key,
        condition: renderCondition(where),
      }),
    }),
    commit: () => ({ entity, op: 'delete', key }),
  }),
});

const setCourseStatus = (status: 'draft' | 'published' | 'archived') =>
  courseGet.mockReturnValue(resolves({ courseId: COURSE_ID, status }));

beforeEach(() => {
  vi.clearAllMocks();

  courseInstructorGet.mockReturnValue(
    resolves({ courseId: COURSE_ID, instructorId: INSTRUCTOR_SUB }),
  );
  setCourseStatus('draft');
  moduleGet.mockReturnValue(resolves(module));
  lessonGet.mockReturnValue(resolves(lesson));
  contentItemGet.mockReturnValue(resolves(textItem('item-1')));
  moduleQueryPrimary.mockReturnValue(resolves([]));
  lessonQueryPrimary.mockReturnValue(resolves([]));
  contentItemQueryPrimary.mockReturnValue(resolves([]));
  moduleCreate.mockImplementation((values) =>
    resolves({ ...timestamps, ...values }),
  );
  lessonCreate.mockImplementation((values) =>
    resolves({ ...timestamps, ...values }),
  );
  contentItemCreate.mockImplementation((values) =>
    resolves({
      status: 'ready',
      studentActivityCount: 0,
      ...timestamps,
      ...values,
    }),
  );
  transactionWrite.mockImplementation((build) => {
    transactionWrites = build({
      module: transactionEntity('module'),
      lesson: transactionEntity('lesson'),
      contentItem: transactionEntity('contentItem'),
    });
    return { go: transactionGo };
  });
  transactionGo.mockResolvedValue({ canceled: false, data: [] });
  bestEffortDeleteContentItemVideos.mockResolvedValue(undefined);
  bestEffortCancelTranscodeJobs.mockResolvedValue(undefined);
});

// Invariant: every lifecycle procedure is limited to instructors teaching the
// course, and writes nothing otherwise.
describe.each([
  ['publishModule', moduleKey],
  ['hideModule', moduleKey],
  ['restoreModule', moduleKey],
  ['deleteModulePermanently', moduleKey],
  ['publishLesson', lessonKey],
  ['hideLesson', lessonKey],
  ['restoreLesson', lessonKey],
  ['deleteLessonPermanently', lessonKey],
  ['publishContentItem', itemKey('item-1')],
  ['hideContentItem', itemKey('item-1')],
  ['restoreContentItem', itemKey('item-1')],
  ['deleteContentItemPermanently', itemKey('item-1')],
] as const)('%s', (procedure, input) => {
  it('throws FORBIDDEN, writing nothing, when the caller does not teach the course', async () => {
    courseInstructorGet.mockReturnValue(resolves(undefined));

    await expect((callAs() as any)[procedure](input)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(modulePatch).not.toHaveBeenCalled();
    expect(lessonPatch).not.toHaveBeenCalled();
    expect(contentItemPatch).not.toHaveBeenCalled();
    expect(contentItemDelete).not.toHaveBeenCalled();
    expect(transactionWrite).not.toHaveBeenCalled();
  });
});

describe('visibility of new records', () => {
  // Invariant: a draft course has never been open to students, so new
  // records are visible straight away; in any other course they start
  // hidden, so students never see something half-built.
  it.each([
    ['draft', 'visible'],
    ['published', 'hidden'],
    ['archived', 'hidden'],
  ] as const)(
    'in a %s course, new modules, lessons and content items are %s',
    async (status, visibility) => {
      setCourseStatus(status);

      const createdModule = await callAs().createModule({
        courseId: COURSE_ID,
        title: 'New module',
      });
      const createdLesson = await callAs().createLesson({
        ...moduleKey,
        title: 'New lesson',
      });
      const createdItem = await callAs().createContentItemText({
        ...lessonKey,
        title: 'New text',
        body: '{}',
      });

      expect(createdModule.visibility).toBe(visibility);
      expect(createdLesson.visibility).toBe(visibility);
      expect(createdItem.visibility).toBe(visibility);
    },
  );

  it('refuses to add a lesson to an archived module', async () => {
    moduleGet.mockReturnValue(resolves({ ...module, archivedAt: ARCHIVED_AT }));

    await expect(
      callAs().createLesson({ ...moduleKey, title: 'New lesson' }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(lessonCreate).not.toHaveBeenCalled();
  });

  it('refuses to add content to an archived lesson', async () => {
    lessonGet.mockReturnValue(resolves({ ...lesson, archivedAt: ARCHIVED_AT }));

    await expect(
      callAs().createContentItemText({
        ...lessonKey,
        title: 'New text',
        body: '{}',
      }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(contentItemCreate).not.toHaveBeenCalled();
  });
});

// A course archived after being published may still have students with
// progress and attempts, so it follows the same rules as a published one.
describe.each(['published', 'archived'] as const)(
  'delete in a %s course',
  (status) => {
    beforeEach(() => {
      setCourseStatus(status);
    });

    // Invariant: outside a draft course, delete never destroys anything --
    // it only marks the record archived, so it (and every student's data for
    // it) can be restored.
    it('archives a module instead of deleting it and everything under it', async () => {
      const patch = patchChain({ ...module, archivedAt: ARCHIVED_AT });
      modulePatch.mockReturnValue(patch);

      const result = await callAs().deleteModule(moduleKey);

      expect(modulePatch).toHaveBeenCalledWith(moduleKey);
      expect(patch.set).toHaveBeenCalledWith({
        archivedAt: expect.any(String),
      });
      expect(transactionWrite).not.toHaveBeenCalled();
      expect(bestEffortDeleteContentItemVideos).not.toHaveBeenCalled();
      expect(result.archivedAt).toBe(ARCHIVED_AT);
    });

    it('archives a lesson instead of deleting it and its content items', async () => {
      const patch = patchChain({ ...lesson, archivedAt: ARCHIVED_AT });
      lessonPatch.mockReturnValue(patch);

      await callAs().deleteLesson(lessonKey);

      expect(lessonPatch).toHaveBeenCalledWith(lessonKey);
      expect(patch.set).toHaveBeenCalledWith({
        archivedAt: expect.any(String),
      });
      expect(transactionWrite).not.toHaveBeenCalled();
    });

    it('archives a video content item, keeping its S3 objects and transcode', async () => {
      contentItemGet.mockReturnValue(
        resolves(textItem('item-1', { type: 'video', s3Key: 'key.mp4' })),
      );
      const patch = patchChain(
        textItem('item-1', {
          type: 'video',
          s3Key: 'key.mp4',
          mimeType: 'video/mp4',
          archivedAt: ARCHIVED_AT,
        }),
      );
      contentItemPatch.mockReturnValue(patch);

      await callAs().deleteContentItem(itemKey('item-1'));

      expect(patch.set).toHaveBeenCalledWith({
        archivedAt: expect.any(String),
      });
      expect(contentItemDelete).not.toHaveBeenCalled();
      expect(bestEffortCancelTranscodeJobs).not.toHaveBeenCalled();
      expect(bestEffortDeleteContentItemVideos).not.toHaveBeenCalled();
    });

    it('leaves an already archived module untouched, so a retry keeps the original archivedAt', async () => {
      moduleGet.mockReturnValue(
        resolves({ ...module, archivedAt: ARCHIVED_AT }),
      );

      const result = await callAs().deleteModule(moduleKey);

      expect(modulePatch).not.toHaveBeenCalled();
      expect(result.archivedAt).toBe(ARCHIVED_AT);
    });

    it('leaves an already archived lesson untouched', async () => {
      lessonGet.mockReturnValue(
        resolves({ ...lesson, archivedAt: ARCHIVED_AT }),
      );

      const result = await callAs().deleteLesson(lessonKey);

      expect(lessonPatch).not.toHaveBeenCalled();
      expect(result.archivedAt).toBe(ARCHIVED_AT);
    });

    it('leaves an already archived content item untouched', async () => {
      contentItemGet.mockReturnValue(
        resolves(textItem('item-1', { archivedAt: ARCHIVED_AT })),
      );

      const result = await callAs().deleteContentItem(itemKey('item-1'));

      expect(contentItemPatch).not.toHaveBeenCalled();
      expect(contentItemDelete).not.toHaveBeenCalled();
      expect(result.archivedAt).toBe(ARCHIVED_AT);
    });
  },
);

describe('publishModule', () => {
  // Invariant: publishing a module shows it complete, all at once -- the
  // module and every hidden, unarchived lesson and content item under it
  // are published in one transaction. Archived records, and content items
  // under an archived lesson, are left alone.
  it('publishes the module and its hidden descendants in one transaction', async () => {
    moduleGet
      .mockReturnValueOnce(resolves({ ...module, visibility: 'hidden' }))
      .mockReturnValueOnce(resolves(module));
    lessonQueryPrimary.mockReturnValue(
      resolves([
        { ...lesson, visibility: 'hidden' },
        { ...lesson, lessonId: 'lesson-visible' },
        {
          ...lesson,
          lessonId: 'lesson-archived',
          visibility: 'hidden',
          archivedAt: ARCHIVED_AT,
        },
      ]),
    );
    contentItemQueryPrimary.mockReturnValue(
      resolves([
        textItem('item-hidden', { visibility: 'hidden' }),
        textItem('item-visible'),
        textItem('item-archived', {
          visibility: 'hidden',
          archivedAt: ARCHIVED_AT,
        }),
        textItem('item-under-archived-lesson', {
          lessonId: 'lesson-archived',
          visibility: 'hidden',
        }),
      ]),
    );

    const result = await callAs().publishModule(moduleKey);

    expect(transactionWrites).toEqual([
      {
        entity: 'module',
        op: 'patch',
        key: moduleKey,
        set: { visibility: 'visible' },
      },
      {
        entity: 'lesson',
        op: 'patch',
        key: lessonKey,
        set: { visibility: 'visible' },
      },
      {
        entity: 'contentItem',
        op: 'patch',
        key: itemKey('item-hidden'),
        set: { visibility: 'visible' },
      },
    ]);
    expect(result).toEqual(module);
  });

  it('writes nothing when the module and everything under it are already visible', async () => {
    lessonQueryPrimary.mockReturnValue(resolves([lesson]));
    contentItemQueryPrimary.mockReturnValue(resolves([textItem('item-1')]));

    await callAs().publishModule(moduleKey);

    expect(transactionWrite).not.toHaveBeenCalled();
  });

  it('refuses to publish an archived module', async () => {
    moduleGet.mockReturnValue(resolves({ ...module, archivedAt: ARCHIVED_AT }));

    await expect(callAs().publishModule(moduleKey)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(transactionWrite).not.toHaveBeenCalled();
  });

  it('throws CONFLICT when the transaction is canceled', async () => {
    moduleGet.mockReturnValue(resolves({ ...module, visibility: 'hidden' }));
    transactionGo.mockResolvedValue({ canceled: true, data: [] });

    await expect(callAs().publishModule(moduleKey)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });
});

describe('publishLesson', () => {
  it('publishes the lesson and its hidden, unarchived content items in one transaction', async () => {
    lessonGet
      .mockReturnValueOnce(resolves({ ...lesson, visibility: 'hidden' }))
      .mockReturnValueOnce(resolves(lesson));
    contentItemQueryPrimary.mockReturnValue(
      resolves([
        textItem('item-hidden', { visibility: 'hidden' }),
        textItem('item-visible'),
        textItem('item-archived', {
          visibility: 'hidden',
          archivedAt: ARCHIVED_AT,
        }),
      ]),
    );

    const result = await callAs().publishLesson(lessonKey);

    expect(transactionWrites).toEqual([
      {
        entity: 'lesson',
        op: 'patch',
        key: lessonKey,
        set: { visibility: 'visible' },
      },
      {
        entity: 'contentItem',
        op: 'patch',
        key: itemKey('item-hidden'),
        set: { visibility: 'visible' },
      },
    ]);
    expect(result).toEqual(lesson);
  });

  it('refuses to publish an archived lesson', async () => {
    lessonGet.mockReturnValue(resolves({ ...lesson, archivedAt: ARCHIVED_AT }));

    await expect(callAs().publishLesson(lessonKey)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(transactionWrite).not.toHaveBeenCalled();
  });
});

describe('publishContentItem and hide*', () => {
  it('publishes a hidden content item', async () => {
    contentItemGet.mockReturnValue(
      resolves(textItem('item-1', { visibility: 'hidden' })),
    );
    const patch = patchChain(textItem('item-1'));
    contentItemPatch.mockReturnValue(patch);

    const result = await callAs().publishContentItem(itemKey('item-1'));

    expect(patch.set).toHaveBeenCalledWith({ visibility: 'visible' });
    expect(result.visibility).toBe('visible');
  });

  it('refuses to publish an archived content item', async () => {
    contentItemGet.mockReturnValue(
      resolves(textItem('item-1', { archivedAt: ARCHIVED_AT })),
    );

    await expect(
      callAs().publishContentItem(itemKey('item-1')),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(contentItemPatch).not.toHaveBeenCalled();
  });

  // Hiding is not cascaded: children keep their own visibility (students
  // stop seeing them anyway, since a record is only shown under visible
  // ancestors).
  it('hides only the module itself', async () => {
    const patch = patchChain({ ...module, visibility: 'hidden' });
    modulePatch.mockReturnValue(patch);

    await callAs().hideModule(moduleKey);

    expect(patch.set).toHaveBeenCalledWith({ visibility: 'hidden' });
    expect(lessonPatch).not.toHaveBeenCalled();
    expect(contentItemPatch).not.toHaveBeenCalled();
    expect(transactionWrite).not.toHaveBeenCalled();
  });

  it('hides a lesson and a content item', async () => {
    const lessonPatchChain = patchChain({ ...lesson, visibility: 'hidden' });
    lessonPatch.mockReturnValue(lessonPatchChain);
    const itemPatchChain = patchChain(
      textItem('item-1', { visibility: 'hidden' }),
    );
    contentItemPatch.mockReturnValue(itemPatchChain);

    await callAs().hideLesson(lessonKey);
    await callAs().hideContentItem(itemKey('item-1'));

    expect(lessonPatchChain.set).toHaveBeenCalledWith({ visibility: 'hidden' });
    expect(itemPatchChain.set).toHaveBeenCalledWith({ visibility: 'hidden' });
  });

  it('refuses to hide an archived record', async () => {
    moduleGet.mockReturnValue(resolves({ ...module, archivedAt: ARCHIVED_AT }));

    await expect(callAs().hideModule(moduleKey)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
  });
});

describe('restore', () => {
  it('restores an archived module by removing archivedAt', async () => {
    moduleGet.mockReturnValue(resolves({ ...module, archivedAt: ARCHIVED_AT }));
    const patch = patchChain(module);
    modulePatch.mockReturnValue(patch);

    const result = await callAs().restoreModule(moduleKey);

    expect(patch.remove).toHaveBeenCalledWith(['archivedAt']);
    expect(result.archivedAt).toBeUndefined();
  });

  it('writes nothing when the module is not archived', async () => {
    await callAs().restoreModule(moduleKey);

    expect(modulePatch).not.toHaveBeenCalled();
  });

  // Invariant: a record can only come back once its ancestors have, since
  // an archived ancestor would still hide it from students.
  it('refuses to restore a lesson under an archived module', async () => {
    lessonGet.mockReturnValue(resolves({ ...lesson, archivedAt: ARCHIVED_AT }));
    moduleGet.mockReturnValue(resolves({ ...module, archivedAt: ARCHIVED_AT }));

    await expect(callAs().restoreLesson(lessonKey)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: 'Restore the module first',
    });
    expect(lessonPatch).not.toHaveBeenCalled();
  });

  it('restores a lesson under an active module', async () => {
    lessonGet.mockReturnValue(resolves({ ...lesson, archivedAt: ARCHIVED_AT }));
    const patch = patchChain(lesson);
    lessonPatch.mockReturnValue(patch);

    await callAs().restoreLesson(lessonKey);

    expect(patch.remove).toHaveBeenCalledWith(['archivedAt']);
  });

  it.each([
    ['module', 'Restore the module first'],
    ['lesson', 'Restore the lesson first'],
  ] as const)(
    'refuses to restore a content item under an archived %s',
    async (ancestor, message) => {
      contentItemGet.mockReturnValue(
        resolves(textItem('item-1', { archivedAt: ARCHIVED_AT })),
      );
      if (ancestor === 'module') {
        moduleGet.mockReturnValue(
          resolves({ ...module, archivedAt: ARCHIVED_AT }),
        );
      } else {
        lessonGet.mockReturnValue(
          resolves({ ...lesson, archivedAt: ARCHIVED_AT }),
        );
      }

      await expect(
        callAs().restoreContentItem(itemKey('item-1')),
      ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED', message });
      expect(contentItemPatch).not.toHaveBeenCalled();
    },
  );

  it('restores a content item whose lesson and module are active', async () => {
    contentItemGet.mockReturnValue(
      resolves(textItem('item-1', { archivedAt: ARCHIVED_AT })),
    );
    const patch = patchChain(textItem('item-1'));
    contentItemPatch.mockReturnValue(patch);

    await callAs().restoreContentItem(itemKey('item-1'));

    expect(patch.remove).toHaveBeenCalledWith(['archivedAt']);
  });
});

describe('permanent delete', () => {
  // Invariant: only an archived record can be deleted permanently.
  it.each([
    ['deleteModulePermanently', moduleKey],
    ['deleteLessonPermanently', lessonKey],
    ['deleteContentItemPermanently', itemKey('item-1')],
  ] as const)(
    '%s refuses a record that is not archived',
    async (procedure, input) => {
      await expect((callAs() as any)[procedure](input)).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
      });
      expect(transactionWrite).not.toHaveBeenCalled();
      expect(contentItemDelete).not.toHaveBeenCalled();
    },
  );

  // Invariant: student data is never destroyed by a curriculum edit -- a
  // record with any student activity under it can stay archived but can't
  // be deleted permanently.
  it('refuses to delete a module permanently when any content item in it has student activity', async () => {
    moduleGet.mockReturnValue(resolves({ ...module, archivedAt: ARCHIVED_AT }));
    contentItemQueryPrimary.mockReturnValue(
      resolves([
        textItem('item-1'),
        textItem('item-2', { studentActivityCount: 3 }),
      ]),
    );

    await expect(
      callAs().deleteModulePermanently(moduleKey),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(transactionWrite).not.toHaveBeenCalled();
  });

  it('refuses to delete a lesson permanently when any content item in it has student activity', async () => {
    lessonGet.mockReturnValue(resolves({ ...lesson, archivedAt: ARCHIVED_AT }));
    contentItemQueryPrimary.mockReturnValue(
      resolves([textItem('item-1', { studentActivityCount: 1 })]),
    );

    await expect(
      callAs().deleteLessonPermanently(lessonKey),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(transactionWrite).not.toHaveBeenCalled();
  });

  // The checks and the delete are separate calls, so each content item
  // delete is conditioned on the updatedAt from the snapshot the activity
  // check looked at (a student's first activity in between bumps updatedAt),
  // and the parent's delete on the archivedAt that was checked (a restore in
  // between clears it). Either cancels the delete.
  it('deletes an archived module and everything under it, conditioned on the checked snapshot', async () => {
    moduleGet.mockReturnValue(resolves({ ...module, archivedAt: ARCHIVED_AT }));
    lessonQueryPrimary.mockReturnValue(resolves([lesson]));
    contentItemQueryPrimary.mockReturnValue(
      resolves([textItem('item-1', { updatedAt: '2024-03-01T00:00:00.000Z' })]),
    );

    await callAs().deleteModulePermanently(moduleKey);

    expect(transactionWrites).toEqual([
      {
        entity: 'module',
        op: 'delete',
        key: moduleKey,
        condition: `archivedAt = ${ARCHIVED_AT}`,
      },
      { entity: 'lesson', op: 'delete', key: lessonKey },
      {
        entity: 'contentItem',
        op: 'delete',
        key: itemKey('item-1'),
        condition: 'updatedAt = 2024-03-01T00:00:00.000Z',
      },
    ]);
  });

  it('deletes an archived lesson and its content items, conditioned on the checked snapshot', async () => {
    lessonGet.mockReturnValue(resolves({ ...lesson, archivedAt: ARCHIVED_AT }));
    contentItemQueryPrimary.mockReturnValue(
      resolves([textItem('item-1', { updatedAt: '2024-03-01T00:00:00.000Z' })]),
    );

    await callAs().deleteLessonPermanently(lessonKey);

    expect(transactionWrites).toEqual([
      {
        entity: 'lesson',
        op: 'delete',
        key: lessonKey,
        condition: `archivedAt = ${ARCHIVED_AT}`,
      },
      {
        entity: 'contentItem',
        op: 'delete',
        key: itemKey('item-1'),
        condition: 'updatedAt = 2024-03-01T00:00:00.000Z',
      },
    ]);
  });

  it('refuses to delete a content item permanently once a student has activity on it', async () => {
    contentItemGet.mockReturnValue(
      resolves(
        textItem('item-1', {
          archivedAt: ARCHIVED_AT,
          studentActivityCount: 1,
        }),
      ),
    );

    await expect(
      callAs().deleteContentItemPermanently(itemKey('item-1')),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(contentItemDelete).not.toHaveBeenCalled();
  });

  it('deletes an archived video content item, conditioned on no activity and still archived, then cleans up', async () => {
    const video = textItem('item-1', {
      type: 'video',
      status: 'ready',
      s3Key: 'key.mp4',
      mimeType: 'video/mp4',
      archivedAt: ARCHIVED_AT,
    });
    contentItemGet.mockReturnValue(resolves(video));
    const where = vi.fn(() => ({
      go: vi.fn().mockResolvedValue({ data: video }),
    }));
    contentItemDelete.mockReturnValue({ where });

    await callAs().deleteContentItemPermanently(itemKey('item-1'));

    expect(contentItemDelete).toHaveBeenCalledWith(itemKey('item-1'));
    expect(renderCondition(where.mock.calls[0][0])).toBe(
      'studentActivityCount = 0 AND exists(archivedAt)',
    );
    expect(bestEffortCancelTranscodeJobs).toHaveBeenCalledWith(
      expect.anything(),
      [video],
    );
    expect(bestEffortDeleteContentItemVideos).toHaveBeenCalledWith(
      expect.anything(),
      [video],
    );
  });

  it('throws CONFLICT when the delete condition fails because the item changed after the checks', async () => {
    contentItemGet.mockReturnValue(
      resolves(textItem('item-1', { archivedAt: ARCHIVED_AT })),
    );
    const conditionFailed = Object.assign(new Error('Conditional failed'), {
      cause: Object.assign(new Error('failed'), {
        name: 'ConditionalCheckFailedException',
      }),
    });
    contentItemDelete.mockReturnValue({
      where: () => ({ go: vi.fn().mockRejectedValue(conditionFailed) }),
    });

    await expect(
      callAs().deleteContentItemPermanently(itemKey('item-1')),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(bestEffortDeleteContentItemVideos).not.toHaveBeenCalled();
  });
});

describe('descendants spanning more than one query page', () => {
  // Invariant: publish and permanent delete act on every descendant, not
  // just the first page of results.
  it('publishModule also publishes a hidden content item on a later page', async () => {
    moduleGet.mockReturnValue(resolves(module));
    contentItemQueryPrimary.mockReturnValue(
      resolvesPaged(
        [textItem('item-1')],
        [textItem('item-on-page-2', { visibility: 'hidden' })],
      ),
    );

    await callAs().publishModule(moduleKey);

    expect(transactionWrites).toEqual([
      {
        entity: 'contentItem',
        op: 'patch',
        key: itemKey('item-on-page-2'),
        set: { visibility: 'visible' },
      },
    ]);
  });

  it('publishLesson also publishes a hidden content item on a later page', async () => {
    contentItemQueryPrimary.mockReturnValue(
      resolvesPaged(
        [textItem('item-1')],
        [textItem('item-on-page-2', { visibility: 'hidden' })],
      ),
    );

    await callAs().publishLesson(lessonKey);

    expect(transactionWrites).toEqual([
      {
        entity: 'contentItem',
        op: 'patch',
        key: itemKey('item-on-page-2'),
        set: { visibility: 'visible' },
      },
    ]);
  });

  it('deleteModulePermanently refuses when the only item with student activity is on a later page', async () => {
    moduleGet.mockReturnValue(resolves({ ...module, archivedAt: ARCHIVED_AT }));
    contentItemQueryPrimary.mockReturnValue(
      resolvesPaged(
        [textItem('item-1')],
        [textItem('item-on-page-2', { studentActivityCount: 1 })],
      ),
    );

    await expect(
      callAs().deleteModulePermanently(moduleKey),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(transactionWrite).not.toHaveBeenCalled();
  });

  it('deleteLessonPermanently refuses when the only item with student activity is on a later page', async () => {
    lessonGet.mockReturnValue(resolves({ ...lesson, archivedAt: ARCHIVED_AT }));
    contentItemQueryPrimary.mockReturnValue(
      resolvesPaged(
        [textItem('item-1')],
        [textItem('item-on-page-2', { studentActivityCount: 1 })],
      ),
    );

    await expect(
      callAs().deleteLessonPermanently(lessonKey),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(transactionWrite).not.toHaveBeenCalled();
  });

  it('a permanent delete removes descendants on every page', async () => {
    lessonGet.mockReturnValue(resolves({ ...lesson, archivedAt: ARCHIVED_AT }));
    contentItemQueryPrimary.mockReturnValue(
      resolvesPaged([textItem('item-1')], [textItem('item-on-page-2')]),
    );

    await callAs().deleteLessonPermanently(lessonKey);

    expect(
      transactionWrites
        .filter(({ entity }) => entity === 'contentItem')
        .map(({ key }) => key.contentItemId),
    ).toEqual(['item-1', 'item-on-page-2']);
  });
});

describe('parent restored while being permanently deleted', () => {
  // The transaction's first result is the parent's; DynamoDB reports
  // ConditionalCheckFailed there when the restore landed after the
  // archivedAt check, and the whole transaction is canceled.
  const parentRestored = {
    canceled: true,
    data: [{ code: 'ConditionalCheckFailed' }, { code: 'None' }],
  };

  it('deleteModulePermanently throws CONFLICT and cleans up nothing', async () => {
    moduleGet.mockReturnValue(resolves({ ...module, archivedAt: ARCHIVED_AT }));
    contentItemQueryPrimary.mockReturnValue(
      resolves([
        textItem('item-1', {
          type: 'video',
          s3Key: 'key.mp4',
          mimeType: 'video/mp4',
        }),
      ]),
    );
    transactionGo.mockResolvedValue(parentRestored);

    await expect(
      callAs().deleteModulePermanently(moduleKey),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message:
        'The module was restored or changed while it was being deleted; nothing was deleted',
    });
    expect(bestEffortCancelTranscodeJobs).not.toHaveBeenCalled();
    expect(bestEffortDeleteContentItemVideos).not.toHaveBeenCalled();
  });

  it('deleteLessonPermanently throws CONFLICT and cleans up nothing', async () => {
    lessonGet.mockReturnValue(resolves({ ...lesson, archivedAt: ARCHIVED_AT }));
    contentItemQueryPrimary.mockReturnValue(resolves([textItem('item-1')]));
    transactionGo.mockResolvedValue(parentRestored);

    await expect(
      callAs().deleteLessonPermanently(lessonKey),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message:
        'The lesson was restored or changed while it was being deleted; nothing was deleted',
    });
    expect(bestEffortDeleteContentItemVideos).not.toHaveBeenCalled();
  });

  // Draft courses keep their unconditional hard delete: nothing there is
  // ever archived, so there's no archive state to check.
  it('a draft-course delete leaves the parent delete unconditional', async () => {
    await callAs().deleteModule(moduleKey);
    expect(transactionWrites).toEqual([
      { entity: 'module', op: 'delete', key: moduleKey },
    ]);

    await callAs().deleteLesson(lessonKey);
    expect(transactionWrites).toEqual([
      { entity: 'lesson', op: 'delete', key: lessonKey },
    ]);
  });
});

describe('missing records', () => {
  // Invariant: a create can't produce a record under a course that doesn't
  // exist (its visibility depends on the course's status).
  it.each([
    ['createModule', { courseId: COURSE_ID, title: 'New module' }],
    ['createLesson', { ...moduleKey, title: 'New lesson' }],
    ['createContentItemText', { ...lessonKey, title: 'New text', body: '{}' }],
  ] as const)(
    '%s throws NOT_FOUND when the course does not exist',
    async (procedure, input) => {
      courseGet.mockReturnValue(resolves(null));

      await expect((callAs() as any)[procedure](input)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(moduleCreate).not.toHaveBeenCalled();
      expect(lessonCreate).not.toHaveBeenCalled();
      expect(contentItemCreate).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['publishModule', moduleKey, moduleGet],
    ['hideModule', moduleKey, moduleGet],
    ['restoreModule', moduleKey, moduleGet],
    ['deleteModulePermanently', moduleKey, moduleGet],
    ['publishLesson', lessonKey, lessonGet],
    ['hideLesson', lessonKey, lessonGet],
    ['restoreLesson', lessonKey, lessonGet],
    ['deleteLessonPermanently', lessonKey, lessonGet],
    ['publishContentItem', itemKey('item-1'), contentItemGet],
    ['hideContentItem', itemKey('item-1'), contentItemGet],
    ['restoreContentItem', itemKey('item-1'), contentItemGet],
    ['deleteContentItemPermanently', itemKey('item-1'), contentItemGet],
  ] as const)(
    '%s throws NOT_FOUND, writing nothing, when the record does not exist',
    async (procedure, input, get) => {
      get.mockReturnValue(resolves(null));

      await expect((callAs() as any)[procedure](input)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(modulePatch).not.toHaveBeenCalled();
      expect(lessonPatch).not.toHaveBeenCalled();
      expect(contentItemPatch).not.toHaveBeenCalled();
      expect(contentItemDelete).not.toHaveBeenCalled();
      expect(transactionWrite).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['module', moduleGet],
    ['lesson', lessonGet],
  ] as const)(
    'restoreContentItem throws NOT_FOUND when its %s no longer exists',
    async (_ancestor, get) => {
      contentItemGet.mockReturnValue(
        resolves(textItem('item-1', { archivedAt: ARCHIVED_AT })),
      );
      get.mockReturnValue(resolves(null));

      await expect(
        callAs().restoreContentItem(itemKey('item-1')),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(contentItemPatch).not.toHaveBeenCalled();
    },
  );
});

describe('DynamoDB 100-item transaction limit', () => {
  const hiddenItems = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      textItem(`item-${index}`, { visibility: 'hidden' }),
    );

  // Over the limit isn't a dead end: the refusal says what to do so the
  // operation fits, and it's reported as a precondition, not a server fault.
  it.each([
    [
      'publishModule',
      moduleKey,
      () =>
        moduleGet.mockReturnValue(
          resolves({ ...module, visibility: 'hidden' }),
        ),
      'Publish some of its lessons first, then the module.',
    ],
    [
      'publishLesson',
      lessonKey,
      () =>
        lessonGet.mockReturnValue(
          resolves({ ...lesson, visibility: 'hidden' }),
        ),
      'Publish some of its content items first, then the lesson.',
    ],
    [
      'deleteModulePermanently',
      moduleKey,
      () =>
        moduleGet.mockReturnValue(
          resolves({ ...module, archivedAt: ARCHIVED_AT }),
        ),
      'Delete some of its lessons first, then the module.',
    ],
    [
      'deleteLessonPermanently',
      lessonKey,
      () =>
        lessonGet.mockReturnValue(
          resolves({ ...lesson, archivedAt: ARCHIVED_AT }),
        ),
      'Delete some of its content items first, then the lesson.',
    ],
  ] as const)(
    '%s explains how to get under the limit',
    async (procedure, input, arrange, nextStep) => {
      arrange();
      contentItemQueryPrimary.mockReturnValue(resolves(hiddenItems(100)));

      const error = await (callAs() as any)
        [procedure](input)
        .catch((caught: unknown) => caught);

      expect(error).toMatchObject({ code: 'PRECONDITION_FAILED' });
      expect(error.message).toContain('the limit is 100 records');
      expect(error.message).toContain(nextStep);
    },
  );

  // Invariant: an operation that must be atomic is refused outright rather
  // than split, so it never applies to only part of the module or lesson.
  it('publishModule refuses when more than 100 records would be published', async () => {
    moduleGet.mockReturnValue(resolves({ ...module, visibility: 'hidden' }));
    contentItemQueryPrimary.mockReturnValue(resolves(hiddenItems(100)));

    await expect(callAs().publishModule(moduleKey)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(transactionWrite).not.toHaveBeenCalled();
  });

  it('publishModule publishes exactly 100 records in one transaction', async () => {
    moduleGet.mockReturnValue(resolves({ ...module, visibility: 'hidden' }));
    contentItemQueryPrimary.mockReturnValue(resolves(hiddenItems(99)));

    await callAs().publishModule(moduleKey);

    expect(transactionWrites).toHaveLength(100);
  });

  it('publishLesson refuses when more than 100 records would be published', async () => {
    lessonGet.mockReturnValue(resolves({ ...lesson, visibility: 'hidden' }));
    contentItemQueryPrimary.mockReturnValue(resolves(hiddenItems(100)));

    await expect(callAs().publishLesson(lessonKey)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(transactionWrite).not.toHaveBeenCalled();
  });

  it('deleteModulePermanently refuses when the module and its descendants exceed 100 records', async () => {
    moduleGet.mockReturnValue(resolves({ ...module, archivedAt: ARCHIVED_AT }));
    contentItemQueryPrimary.mockReturnValue(resolves(hiddenItems(100)));

    await expect(
      callAs().deleteModulePermanently(moduleKey),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(transactionWrite).not.toHaveBeenCalled();
  });

  it('deleteLessonPermanently refuses when the lesson and its content items exceed 100 records', async () => {
    lessonGet.mockReturnValue(resolves({ ...lesson, archivedAt: ARCHIVED_AT }));
    contentItemQueryPrimary.mockReturnValue(resolves(hiddenItems(100)));

    await expect(
      callAs().deleteLessonPermanently(lessonKey),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    expect(transactionWrite).not.toHaveBeenCalled();
  });
});

describe('repeating an operation writes nothing', () => {
  // Retrying a request that already succeeded (e.g. after a client-side
  // timeout) returns the record as it is, without another write.
  it('publishing an already visible content item', async () => {
    const result = await callAs().publishContentItem(itemKey('item-1'));

    expect(contentItemPatch).not.toHaveBeenCalled();
    expect(result.visibility).toBe('visible');
  });

  it('publishing a visible lesson with nothing hidden in it', async () => {
    contentItemQueryPrimary.mockReturnValue(resolves([textItem('item-1')]));

    await callAs().publishLesson(lessonKey);

    expect(transactionWrite).not.toHaveBeenCalled();
  });

  it.each([
    ['hideModule', moduleKey, moduleGet, { ...module, visibility: 'hidden' }],
    ['hideLesson', lessonKey, lessonGet, { ...lesson, visibility: 'hidden' }],
    [
      'hideContentItem',
      itemKey('item-1'),
      contentItemGet,
      textItem('item-1', { visibility: 'hidden' }),
    ],
  ] as const)(
    '%s on a record that is already hidden',
    async (procedure, input, get, record) => {
      get.mockReturnValue(resolves(record));

      const result = await (callAs() as any)[procedure](input);

      expect(modulePatch).not.toHaveBeenCalled();
      expect(lessonPatch).not.toHaveBeenCalled();
      expect(contentItemPatch).not.toHaveBeenCalled();
      expect(result.visibility).toBe('hidden');
    },
  );

  it('restoring a lesson that is not archived', async () => {
    const result = await callAs().restoreLesson(lessonKey);

    expect(lessonPatch).not.toHaveBeenCalled();
    expect(moduleGet).not.toHaveBeenCalled();
    expect(result.archivedAt).toBeUndefined();
  });

  it('restoring a content item that is not archived', async () => {
    const result = await callAs().restoreContentItem(itemKey('item-1'));

    expect(contentItemPatch).not.toHaveBeenCalled();
    expect(result.archivedAt).toBeUndefined();
  });
});

describe('publishLesson conflicts', () => {
  it('throws CONFLICT when the transaction is canceled', async () => {
    lessonGet.mockReturnValue(resolves({ ...lesson, visibility: 'hidden' }));
    transactionGo.mockResolvedValue({ canceled: true, data: [] });

    await expect(callAs().publishLesson(lessonKey)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });
});

describe('editing an archived record', () => {
  // Invariant: an archived record must be restored before it's edited.
  it.each([
    [
      'updateModule',
      { ...moduleKey, title: 'New title' },
      moduleGet,
      { ...module, archivedAt: ARCHIVED_AT },
      'Restore the module before editing it',
    ],
    [
      'updateLesson',
      { ...lessonKey, title: 'New title' },
      lessonGet,
      { ...lesson, archivedAt: ARCHIVED_AT },
      'Restore the lesson before editing it',
    ],
    [
      'updateContentItemText',
      { ...itemKey('item-1'), title: 'New title' },
      contentItemGet,
      textItem('item-1', { archivedAt: ARCHIVED_AT }),
      'Restore the content item before editing it',
    ],
  ] as const)(
    '%s refuses and writes nothing',
    async (procedure, input, get, record, message) => {
      get.mockReturnValue(resolves(record));

      await expect((callAs() as any)[procedure](input)).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message,
      });
      expect(modulePatch).not.toHaveBeenCalled();
      expect(lessonPatch).not.toHaveBeenCalled();
      expect(contentItemPatch).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['updateModule', { ...moduleKey, title: 'New title' }, modulePatch, module],
    ['updateLesson', { ...lessonKey, title: 'New title' }, lessonPatch, lesson],
    [
      'updateContentItemText',
      { ...itemKey('item-1'), title: 'New title' },
      contentItemPatch,
      textItem('item-1'),
    ],
  ] as const)(
    '%s still edits a record that is not archived',
    async (procedure, input, patch, record) => {
      const chain = patchChain({ ...record, title: 'New title' });
      patch.mockReturnValue(chain);

      await (callAs() as any)[procedure](input);

      expect(chain.set).toHaveBeenCalledWith({ title: 'New title' });
    },
  );
});

describe('under an archived module or lesson', () => {
  // Invariant: an archived module or lesson freezes everything under it --
  // nothing beneath it can be added, edited, published or hidden until it's
  // restored, so a restore brings back exactly what was archived.
  const archivedModule = () =>
    moduleGet.mockReturnValue(resolves({ ...module, archivedAt: ARCHIVED_AT }));
  const archivedLesson = () =>
    lessonGet.mockReturnValue(resolves({ ...lesson, archivedAt: ARCHIVED_AT }));

  it.each([
    ['updateLesson', { ...lessonKey, title: 'New title' }],
    ['publishLesson', lessonKey],
    ['hideLesson', lessonKey],
    ['createContentItemText', { ...lessonKey, title: 'New text', body: '{}' }],
    ['updateContentItemText', { ...itemKey('item-1'), title: 'New title' }],
    ['publishContentItem', itemKey('item-1')],
    ['hideContentItem', itemKey('item-1')],
  ] as const)(
    '%s is refused when the module is archived, writing nothing',
    async (procedure, input) => {
      archivedModule();
      lessonGet.mockReturnValue(resolves({ ...lesson, visibility: 'hidden' }));
      contentItemGet.mockReturnValue(
        resolves(textItem('item-1', { visibility: 'hidden' })),
      );

      await expect((callAs() as any)[procedure](input)).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message: 'Restore the module first',
      });
      expect(lessonPatch).not.toHaveBeenCalled();
      expect(contentItemPatch).not.toHaveBeenCalled();
      expect(contentItemCreate).not.toHaveBeenCalled();
      expect(transactionWrite).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['updateContentItemText', { ...itemKey('item-1'), title: 'New title' }],
    ['publishContentItem', itemKey('item-1')],
    ['hideContentItem', itemKey('item-1')],
  ] as const)(
    '%s is refused when the lesson is archived, writing nothing',
    async (procedure, input) => {
      archivedLesson();
      contentItemGet.mockReturnValue(
        resolves(textItem('item-1', { visibility: 'hidden' })),
      );

      await expect((callAs() as any)[procedure](input)).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
        message: 'Restore the lesson first',
      });
      expect(contentItemPatch).not.toHaveBeenCalled();
    },
  );

  // The module is checked first, matching the order restores must happen
  // in.
  it('names the module when both the module and the lesson are archived', async () => {
    archivedModule();
    archivedLesson();

    await expect(
      callAs().publishContentItem(itemKey('item-1')),
    ).rejects.toMatchObject({ message: 'Restore the module first' });
  });

  it.each([
    [
      'hideLesson',
      lessonKey,
      lessonGet,
      { ...lesson, archivedAt: ARCHIVED_AT },
    ],
    [
      'hideContentItem',
      itemKey('item-1'),
      contentItemGet,
      textItem('item-1', { archivedAt: ARCHIVED_AT }),
    ],
  ] as const)(
    '%s refuses an archived record itself, writing nothing',
    async (procedure, input, get, record) => {
      get.mockReturnValue(resolves(record));

      await expect((callAs() as any)[procedure](input)).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
      });
      expect(lessonPatch).not.toHaveBeenCalled();
      expect(contentItemPatch).not.toHaveBeenCalled();
    },
  );
});

describe('lessons spanning more than one query page', () => {
  it('publishModule publishes a hidden lesson on a later page, and leaves items under an archived later-page lesson alone', async () => {
    lessonQueryPrimary.mockReturnValue(
      resolvesPaged(
        [lesson],
        [
          { ...lesson, lessonId: 'lesson-page-2', visibility: 'hidden' },
          {
            ...lesson,
            lessonId: 'lesson-archived-page-2',
            visibility: 'hidden',
            archivedAt: ARCHIVED_AT,
          },
        ],
      ),
    );
    contentItemQueryPrimary.mockReturnValue(
      resolves([
        textItem('item-under-archived', {
          lessonId: 'lesson-archived-page-2',
          visibility: 'hidden',
        }),
      ]),
    );

    await callAs().publishModule(moduleKey);

    expect(transactionWrites).toEqual([
      {
        entity: 'lesson',
        op: 'patch',
        key: { ...moduleKey, lessonId: 'lesson-page-2' },
        set: { visibility: 'visible' },
      },
    ]);
  });

  it('deleteModulePermanently deletes lessons on every page', async () => {
    moduleGet.mockReturnValue(resolves({ ...module, archivedAt: ARCHIVED_AT }));
    lessonQueryPrimary.mockReturnValue(
      resolvesPaged([lesson], [{ ...lesson, lessonId: 'lesson-page-2' }]),
    );

    await callAs().deleteModulePermanently(moduleKey);

    expect(
      transactionWrites
        .filter(({ entity }) => entity === 'lesson')
        .map(({ key }) => key.lessonId),
    ).toEqual([LESSON_ID, 'lesson-page-2']);
  });
});

describe('100-record boundary', () => {
  const items = (count: number, overrides: Record<string, unknown> = {}) =>
    Array.from({ length: count }, (_, index) =>
      textItem(`item-${index}`, overrides),
    );

  // Exactly 100 records still fits in one transaction.
  it('publishLesson publishes a hidden lesson with 99 hidden items', async () => {
    lessonGet
      .mockReturnValueOnce(resolves({ ...lesson, visibility: 'hidden' }))
      .mockReturnValueOnce(resolves(lesson));
    contentItemQueryPrimary.mockReturnValue(
      resolves(items(99, { visibility: 'hidden' })),
    );

    await callAs().publishLesson(lessonKey);

    expect(transactionWrites).toHaveLength(100);
  });

  it('deleteLessonPermanently deletes a lesson with 99 items', async () => {
    lessonGet.mockReturnValue(resolves({ ...lesson, archivedAt: ARCHIVED_AT }));
    contentItemQueryPrimary.mockReturnValue(resolves(items(99)));

    await callAs().deleteLessonPermanently(lessonKey);

    expect(transactionWrites).toHaveLength(100);
  });

  it('deleteModulePermanently deletes a module with 99 records under it', async () => {
    moduleGet.mockReturnValue(resolves({ ...module, archivedAt: ARCHIVED_AT }));
    lessonQueryPrimary.mockReturnValue(resolves([lesson]));
    contentItemQueryPrimary.mockReturnValue(resolves(items(98)));

    await callAs().deleteModulePermanently(moduleKey);

    expect(transactionWrites).toHaveLength(100);
  });
});

describe('remaining edge cases', () => {
  it('restoreLesson throws NOT_FOUND when its module no longer exists', async () => {
    lessonGet.mockReturnValue(resolves({ ...lesson, archivedAt: ARCHIVED_AT }));
    moduleGet.mockReturnValue(resolves(null));

    await expect(callAs().restoreLesson(lessonKey)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(lessonPatch).not.toHaveBeenCalled();
  });

  it('deleteContentItemPermanently rethrows a failure that is not a condition check, rather than reporting CONFLICT', async () => {
    contentItemGet.mockReturnValue(
      resolves(textItem('item-1', { archivedAt: ARCHIVED_AT })),
    );
    contentItemDelete.mockReturnValue({
      where: () => ({
        go: vi.fn().mockRejectedValue(new Error('Throttled')),
      }),
    });

    await expect(
      callAs().deleteContentItemPermanently(itemKey('item-1')),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  });

  it('deleteContentItemPermanently reports INTERNAL_SERVER_ERROR when the delete returns no record', async () => {
    contentItemGet.mockReturnValue(
      resolves(textItem('item-1', { archivedAt: ARCHIVED_AT })),
    );
    contentItemDelete.mockReturnValue({
      where: () => ({ go: vi.fn().mockResolvedValue({ data: null }) }),
    });

    await expect(
      callAs().deleteContentItemPermanently(itemKey('item-1')),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
  });

  it('deleteContentItemPermanently deletes an archived text item without any S3 or transcode cleanup', async () => {
    const text = textItem('item-1', { archivedAt: ARCHIVED_AT });
    contentItemGet.mockReturnValue(resolves(text));
    contentItemDelete.mockReturnValue({
      where: () => ({ go: vi.fn().mockResolvedValue({ data: text }) }),
    });

    await callAs().deleteContentItemPermanently(itemKey('item-1'));

    expect(bestEffortCancelTranscodeJobs).not.toHaveBeenCalled();
    expect(bestEffortDeleteContentItemVideos).not.toHaveBeenCalled();
  });
});
