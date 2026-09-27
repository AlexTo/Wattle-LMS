/**
 * Copyright Discava Contributors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  AdminPortal,
  CoreApi,
  CoreTable,
  EventsPostConfirmation,
  EventsTranscodeCleanup,
  EventsTranscodeComplete,
  InstructorApi,
  InstructorPortal,
  LessonMediaBucket,
  LessonMediaUploadBucket,
  RuntimeConfig,
  StudentPortal,
  suppressRules,
  UserIdentity,
  VideoTranscodePipeline,
} from '@discava/common-constructs';
import type {
  AdminPortalComponentConfig,
  CoreApiComponentConfig,
  CoreTableComponentConfig,
  IdentityComponentConfig,
  InstructorApiComponentConfig,
  InstructorPortalComponentConfig,
  LessonMediaComponentConfig,
  StudentPortalComponentConfig,
} from '@discava/common-infra-config';
import { CfnResource, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { Mfa, UserPoolOperation } from 'aws-cdk-lib/aws-cognito';
import { TableEncryption } from 'aws-cdk-lib/aws-dynamodb';
import { Rule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Function as LambdaFunctionHandler } from 'aws-cdk-lib/aws-lambda';
import { BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { ScheduleGroup } from 'aws-cdk-lib/aws-scheduler';
import { Construct } from 'constructs';

type InstructorApiIntegrations = ReturnType<
  ReturnType<typeof InstructorApi.defaultIntegrations>['build']
>;

export interface ApplicationStackProps extends StackProps {
  /** Settings for the Cognito user pool / identity construct. @default all enabled */
  readonly identity?: IdentityComponentConfig;
  /** Settings for the core API construct. @default all enabled */
  readonly coreApi?: CoreApiComponentConfig;
  /** Settings for the instructor API construct. @default all enabled */
  readonly instructorApi?: InstructorApiComponentConfig;
  /** Settings for the core DynamoDB table construct. @default all enabled */
  readonly coreTable?: CoreTableComponentConfig;
  /** Settings for the student portal static website construct. @default all enabled */
  readonly studentPortal?: StudentPortalComponentConfig;
  /** Settings for the instructor portal static website construct. @default all enabled */
  readonly instructorPortal?: InstructorPortalComponentConfig;
  /** Settings for the admin portal static website construct. @default all enabled */
  readonly adminPortal?: AdminPortalComponentConfig;
  /** Settings for the lesson media S3 bucket construct. @default all enabled */
  readonly lessonMedia?: LessonMediaComponentConfig;
}

export class ApplicationStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    {
      identity: identityConfig,
      coreApi: coreApiConfig,
      instructorApi: instructorApiConfig,
      coreTable: coreTableConfig,
      studentPortal: studentPortalConfig,
      instructorPortal: instructorPortalConfig,
      adminPortal: adminPortalConfig,
      lessonMedia: lessonMediaConfig,
      ...props
    }: ApplicationStackProps,
  ) {
    super(scope, id, props);

    const identity = this.createIdentity(identityConfig);
    const coreTable = this.createCoreTable(coreTableConfig);
    const coreApi = this.createCoreApi(coreApiConfig, identity, coreTable);
    const { instructorApi, integrations: instructorApiIntegrations } =
      this.createInstructorApi(instructorApiConfig, identity, coreTable);

    const lessonMediaBucket = this.createLessonMediaBucket(
      lessonMediaConfig,
      instructorApiIntegrations,
    );
    const lessonMediaUploadBucket = this.createLessonMediaUploadBucket(
      lessonMediaConfig,
      instructorApiIntegrations,
    );

    const videoTranscodePipeline = this.createVideoTranscodePipeline(
      lessonMediaUploadBucket,
      lessonMediaBucket,
    );
    this.grantTranscodeJobSubmission(
      videoTranscodePipeline,
      instructorApiIntegrations,
    );
    const { scheduleGroup, schedulerRole } = this.createTranscodeCleanupLambda(
      lessonMediaBucket,
      instructorApiIntegrations,
    );
    this.createTranscodeCompleteLambda(
      lessonMediaUploadBucket,
      coreTable,
      scheduleGroup,
      schedulerRole,
    );

    const studentPortal = this.createStudentPortal(studentPortalConfig);
    const instructorPortal = this.createInstructorPortal(
      instructorPortalConfig,
    );
    const adminPortal = this.createAdminPortal(adminPortalConfig);

    this.restrictCors({
      coreApi,
      instructorApi,
      lessonMediaBucket,
      lessonMediaUploadBucket,
      studentPortal,
      instructorPortal,
      adminPortal,
    });
  }

  private createIdentity(identityConfig?: IdentityComponentConfig) {
    const identity = new UserIdentity(this, 'Identity', {
      enableWaf: identityConfig?.enableWaf ?? true,
      mfa: (identityConfig?.enableMfa ?? true) ? Mfa.REQUIRED : Mfa.OFF,
    });

    // Adds every self-signed-up user to the `student` group
    const postConfirmation = new EventsPostConfirmation(
      this,
      'PostConfirmation',
    );
    // Scoped to any pool in this account/region rather than this specific
    // pool's ARN: referencing the pool here would create a circular
    // CloudFormation dependency, since the pool's LambdaConfig already
    // depends on this function
    postConfirmation.addToRolePolicy(
      new PolicyStatement({
        actions: ['cognito-idp:AdminAddUserToGroup'],
        resources: [
          Stack.of(this).formatArn({
            service: 'cognito-idp',
            resource: 'userpool',
            resourceName: '*',
          }),
        ],
      }),
    );
    identity.userPool.addTrigger(
      UserPoolOperation.POST_CONFIRMATION,
      postConfirmation,
    );

    return identity;
  }

  private createCoreTable(coreTableConfig?: CoreTableComponentConfig) {
    const coreTableKmsEnabled = coreTableConfig?.enableKmsEncryption ?? true;
    const coreTable = new CoreTable(this, 'CoreTable', {
      encryption: coreTableKmsEnabled
        ? TableEncryption.CUSTOMER_MANAGED
        : TableEncryption.DEFAULT,
      enableKeyRotation: coreTableConfig?.enableKeyRotation ?? true,
      deletionProtection: coreTableConfig?.enableDeletionProtection ?? true,
    });
    if (!coreTableKmsEnabled) {
      suppressRules(
        coreTable.table,
        ['CKV_AWS_119'],
        'KMS CMK encryption disabled for this stage',
      );
    }
    return coreTable;
  }

  private createCoreApi(
    coreApiConfig: CoreApiComponentConfig | undefined,
    identity: UserIdentity,
    coreTable: CoreTable,
  ) {
    const coreApiKmsEnabled = coreApiConfig?.enableKmsEncryption ?? true;
    const integrations = CoreApi.defaultIntegrations(this).build();
    const coreApiCertificate = coreApiConfig?.certificateArn
      ? Certificate.fromCertificateArn(
          this,
          'CoreApiCertificate',
          coreApiConfig.certificateArn,
        )
      : undefined;

    const coreApi = new CoreApi(this, 'CoreApi', {
      integrations,
      identity,
      enableWaf: coreApiConfig?.enableWaf ?? true,
      enableKmsEncryption: coreApiKmsEnabled,
      enableKeyRotation: coreApiConfig?.enableKeyRotation ?? true,
      domainName: coreApiConfig?.domainName,
      certificate: coreApiCertificate,
    });
    if (!coreApiKmsEnabled) {
      suppressRules(
        this,
        ['CKV_AWS_158'],
        'KMS encryption disabled for this stage',
        (c) =>
          CfnResource.isCfnResource(c) &&
          c.cfnResourceType === 'AWS::Logs::LogGroup' &&
          c.node.path.includes('/CoreApi/AccessLogs'),
      );
    }

    Object.values(integrations).forEach(({ handler }) =>
      coreTable.grantReadWriteData(handler),
    );

    return coreApi;
  }

  private createInstructorApi(
    instructorApiConfig: InstructorApiComponentConfig | undefined,
    identity: UserIdentity,
    coreTable: CoreTable,
  ) {
    const instructorApiWafEnabled = instructorApiConfig?.enableWaf ?? true;
    const instructorApiKmsEnabled =
      instructorApiConfig?.enableKmsEncryption ?? true;
    const integrations = InstructorApi.defaultIntegrations(this).build();
    const instructorApiCertificate = instructorApiConfig?.certificateArn
      ? Certificate.fromCertificateArn(
          this,
          'InstructorApiCertificate',
          instructorApiConfig.certificateArn,
        )
      : undefined;

    const instructorApi = new InstructorApi(this, 'InstructorApi', {
      integrations,
      identity,
      enableWaf: instructorApiWafEnabled,
      enableKmsEncryption: instructorApiKmsEnabled,
      enableKeyRotation: instructorApiConfig?.enableKeyRotation ?? true,
      domainName: instructorApiConfig?.domainName,
      certificate: instructorApiCertificate,
    });
    if (!instructorApiKmsEnabled) {
      suppressRules(
        this,
        ['CKV_AWS_158'],
        'KMS encryption disabled for this stage',
        (c) =>
          CfnResource.isCfnResource(c) &&
          c.cfnResourceType === 'AWS::Logs::LogGroup' &&
          c.node.path.includes('/InstructorApi/AccessLogs'),
      );
    }

    Object.values(integrations).forEach(({ handler }) =>
      coreTable.grantReadWriteData(handler),
    );

    return { instructorApi, integrations };
  }

  private createLessonMediaBucket(
    lessonMediaConfig: LessonMediaComponentConfig | undefined,
    instructorApiIntegrations: InstructorApiIntegrations,
  ) {
    const lessonMediaKmsEnabled =
      lessonMediaConfig?.enableKmsEncryption ?? true;
    const lessonMediaWafEnabled = lessonMediaConfig?.enableWaf ?? true;
    const lessonMediaCertificate = lessonMediaConfig?.certificateArn
      ? Certificate.fromCertificateArn(
          this,
          'LessonMediaCertificate',
          lessonMediaConfig.certificateArn,
        )
      : undefined;
    const lessonMediaBucket = new LessonMediaBucket(this, 'LessonMediaBucket', {
      enableWaf: lessonMediaWafEnabled,
      enableKmsEncryption: lessonMediaKmsEnabled,
      enableKeyRotation: lessonMediaConfig?.enableKeyRotation ?? true,
      removalPolicy: lessonMediaConfig?.retainOnDelete
        ? RemovalPolicy.RETAIN
        : RemovalPolicy.DESTROY,
      domainNames: lessonMediaConfig?.domainNames,
      certificate: lessonMediaCertificate,
      cookieDomain: lessonMediaConfig?.cookieDomain,
    });
    if (!lessonMediaKmsEnabled) {
      suppressRules(
        lessonMediaBucket.bucket,
        ['CKV_AWS_145'],
        'KMS CMK encryption disabled for this stage',
      );
    }
    if (!lessonMediaWafEnabled) {
      suppressRules(
        lessonMediaBucket.cloudFrontDistribution,
        ['CKV_AWS_68'],
        'WAF disabled for this stage',
      );
    }
    // Least-privilege: only the specific operations that need to sign/access
    // lesson video objects get bucket permissions, not every instructor-api
    // handler (each tRPC operation is its own isolated Lambda).
    lessonMediaBucket.grantPut(
      instructorApiIntegrations['contentItem.createVideoUploadUrl'].handler,
    );
    lessonMediaBucket.grantReadSigningKey(
      instructorApiIntegrations['contentItem.createVideoUrl'].handler,
    );
    // bestEffortDeleteContentItemVideos lists a ready item's whole
    // .../content-items/<id>/ prefix (manifest + segments) before batch-
    // deleting it, so every handler that can reach that best-effort cleanup
    // for a ready video needs read (for ListObjectsV2) alongside delete --
    // delete alone can't list, so without this the list throws AccessDenied,
    // gets swallowed by the best-effort error handling, and the old HLS
    // output is silently orphaned forever instead of cleaned up.
    lessonMediaBucket.grantRead(
      instructorApiIntegrations['contentItem.delete'].handler,
    );
    lessonMediaBucket.grantDelete(
      instructorApiIntegrations['contentItem.delete'].handler,
    );
    // updateContentItemVideo best-effort-deletes the old S3 object when a
    // video is replaced with a new file. updateContentItemText never touches
    // S3, so it gets no bucket permissions.
    lessonMediaBucket.grantRead(
      instructorApiIntegrations['contentItem.updateVideo'].handler,
    );
    lessonMediaBucket.grantDelete(
      instructorApiIntegrations['contentItem.updateVideo'].handler,
    );
    // Deleting a lesson or module cascades to its content items, best-
    // effort-deleting each one's underlying S3 object.
    lessonMediaBucket.grantRead(
      instructorApiIntegrations['lesson.delete'].handler,
    );
    lessonMediaBucket.grantDelete(
      instructorApiIntegrations['lesson.delete'].handler,
    );
    lessonMediaBucket.grantRead(
      instructorApiIntegrations['module.delete'].handler,
    );
    lessonMediaBucket.grantDelete(
      instructorApiIntegrations['module.delete'].handler,
    );

    return lessonMediaBucket;
  }

  private createLessonMediaUploadBucket(
    lessonMediaConfig: LessonMediaComponentConfig | undefined,
    instructorApiIntegrations: InstructorApiIntegrations,
  ) {
    const lessonMediaKmsEnabled =
      lessonMediaConfig?.enableKmsEncryption ?? true;

    // Raw, untranscoded uploads land here instead -- see decision log in
    // #110. Once transcoding completes, TranscodeComplete deletes the raw
    // object and lessonMediaBucket takes over serving the result.
    const lessonMediaUploadBucket = new LessonMediaUploadBucket(
      this,
      'LessonMediaUploadBucket',
      {
        enableKmsEncryption: lessonMediaKmsEnabled,
        enableKeyRotation: lessonMediaConfig?.enableKeyRotation ?? true,
        removalPolicy: lessonMediaConfig?.retainOnDelete
          ? RemovalPolicy.RETAIN
          : RemovalPolicy.DESTROY,
      },
    );
    if (!lessonMediaKmsEnabled) {
      suppressRules(
        lessonMediaUploadBucket.bucket,
        ['CKV_AWS_145'],
        'KMS CMK encryption disabled for this stage',
      );
    }
    // createContentItemVideoUploadUrl now targets this bucket instead of
    // lessonMediaBucket -- the raw upload never sits behind CloudFront.
    lessonMediaUploadBucket.grantPut(
      instructorApiIntegrations['contentItem.createVideoUploadUrl'].handler,
    );
    // createContentItemVideo/updateContentItemVideo check the upload
    // actually exists before recording/submitting a transcode job for it.
    lessonMediaUploadBucket.grantRead(
      instructorApiIntegrations['contentItem.createVideo'].handler,
    );
    lessonMediaUploadBucket.grantRead(
      instructorApiIntegrations['contentItem.updateVideo'].handler,
    );
    // Which bucket a delete/replace targets now depends on the content
    // item's status, so these handlers need delete on both buckets.
    lessonMediaUploadBucket.grantDelete(
      instructorApiIntegrations['contentItem.delete'].handler,
    );
    lessonMediaUploadBucket.grantDelete(
      instructorApiIntegrations['contentItem.updateVideo'].handler,
    );
    lessonMediaUploadBucket.grantDelete(
      instructorApiIntegrations['lesson.delete'].handler,
    );
    lessonMediaUploadBucket.grantDelete(
      instructorApiIntegrations['module.delete'].handler,
    );

    return lessonMediaUploadBucket;
  }

  private createVideoTranscodePipeline(
    lessonMediaUploadBucket: LessonMediaUploadBucket,
    lessonMediaBucket: LessonMediaBucket,
  ) {
    return new VideoTranscodePipeline(this, 'VideoTranscodePipeline', {
      uploadBucket: lessonMediaUploadBucket,
      mediaBucket: lessonMediaBucket,
    });
  }

  // createContentItemVideo/updateContentItemVideo submit the MediaConvert
  // job themselves (see
  // packages/apis/instructor-api/src/lib/mediaconvert-client.ts). Both
  // handlers already get RUNTIME_CONFIG_APP_ID/AppConfig read access from
  // InstructorApi.defaultIntegrations, so only the MediaConvert-specific
  // permissions are needed here.
  private grantTranscodeJobSubmission(
    videoTranscodePipeline: VideoTranscodePipeline,
    instructorApiIntegrations: InstructorApiIntegrations,
  ) {
    const handlers = [
      instructorApiIntegrations['contentItem.createVideo'].handler,
      instructorApiIntegrations['contentItem.updateVideo'].handler,
    ];
    for (const handler of handlers) {
      // MediaConvert's CreateJob isn't meaningfully resource-scoped for a
      // submitter role (the job doesn't exist yet), so this is the widest
      // permission in this stack that's still limited to one action.
      handler.addToRolePolicy(
        new PolicyStatement({
          actions: ['mediaconvert:CreateJob'],
          resources: ['*'],
        }),
      );
      suppressRules(
        handler,
        ['CKV_AWS_111'],
        'CreateJob has no meaningful resource to scope to before the job exists; narrowed to just this one action instead',
        (c) =>
          CfnResource.isCfnResource(c) &&
          c.cfnResourceType === 'AWS::IAM::Policy',
      );
      handler.addToRolePolicy(
        new PolicyStatement({
          actions: ['iam:PassRole'],
          resources: [videoTranscodePipeline.role.roleArn],
        }),
      );
    }

    // Replacing or deleting a still-transcoding video cancels its job (see
    // #123 and the delete-mid-transcode follow-up) -- unlike CreateJob, a
    // job to cancel already exists here, so this can be scoped to the
    // resource type instead of needing a suppression.
    for (const handler of this.getTranscodeCancelHandlers(
      instructorApiIntegrations,
    )) {
      handler.addToRolePolicy(
        new PolicyStatement({
          actions: ['mediaconvert:CancelJob'],
          resources: [
            Stack.of(this).formatArn({
              service: 'mediaconvert',
              resource: 'jobs',
              resourceName: '*',
            }),
          ],
        }),
      );
    }
  }

  // The handlers that can reach bestEffortCancelTranscodeJob(s) -- every
  // caller of it also needs permission to schedule that job's delayed S3
  // cleanup (see createTranscodeCleanupLambda), so both grants are scoped
  // to the same list.
  private getTranscodeCancelHandlers(
    instructorApiIntegrations: InstructorApiIntegrations,
  ) {
    return [
      instructorApiIntegrations['contentItem.createVideo'].handler,
      instructorApiIntegrations['contentItem.updateVideo'].handler,
      instructorApiIntegrations['contentItem.delete'].handler,
      instructorApiIntegrations['lesson.delete'].handler,
      instructorApiIntegrations['module.delete'].handler,
    ];
  }

  // Grants permission to create/update a one-time cleanup schedule in
  // scheduleGroup, targeting schedulerRole -- shared by every handler that
  // can end up retiring a submission's nonce-scoped S3 output, whether by
  // canceling its job early (bestEffortCancelTranscodeJob) or, lacking a
  // job id to cancel with, reacting to that job's own completion event
  // once it finishes on its own (transcode-complete.ts).
  private grantScheduleCleanupWrite(
    handler: LambdaFunctionHandler,
    scheduleGroup: ScheduleGroup,
    schedulerRole: Role,
  ) {
    scheduleGroup.grantWriteSchedules(handler);
    // Creating a schedule with a target role requires the creator to be
    // allowed to pass that role -- scoped to just this one role, and only
    // for EventBridge Scheduler to assume, not any service.
    handler.addToRolePolicy(
      new PolicyStatement({
        actions: ['iam:PassRole'],
        resources: [schedulerRole.roleArn],
        conditions: {
          StringEquals: { 'iam:PassedToService': 'scheduler.amazonaws.com' },
        },
      }),
    );
  }

  private createTranscodeCompleteLambda(
    lessonMediaUploadBucket: LessonMediaUploadBucket,
    coreTable: CoreTable,
    scheduleGroup: ScheduleGroup,
    schedulerRole: Role,
  ) {
    // MediaConvert job COMPLETE/ERROR via EventBridge -> flip contentItem
    // status and, on success, repoint s3Key and clean up the raw upload.
    const transcodeComplete = new EventsTranscodeComplete(
      this,
      'TranscodeComplete',
    );
    // The upload bucket's name is resolved at runtime via RuntimeConfig/
    // AppConfig, granted below alongside the DynamoDB table name lookup
    // @discava/core-table already needs.
    const runtimeConfig = RuntimeConfig.ensure(this);
    transcodeComplete.addEnvironment(
      'RUNTIME_CONFIG_APP_ID',
      runtimeConfig.appConfigApplicationId,
    );
    runtimeConfig.grantReadAppConfig(transcodeComplete);
    coreTable.grantReadWriteData(transcodeComplete);
    lessonMediaUploadBucket.grantDelete(transcodeComplete);
    // A submission whose mediaConvertJobId was never stamped can't be
    // canceled/scheduled early by whatever delete/replace call retired it
    // (see mediaconvert-client.ts's bestEffortCancelTranscodeJobs) --
    // transcode-complete.ts schedules that cleanup itself once this job's
    // own completion event arrives, so it needs the same grants every
    // other scheduler of that cleanup already has.
    this.grantScheduleCleanupWrite(
      transcodeComplete,
      scheduleGroup,
      schedulerRole,
    );
    new Rule(this, 'TranscodeCompleteRule', {
      eventPattern: {
        source: ['aws.mediaconvert'],
        detailType: ['MediaConvert Job State Change'],
        detail: { status: ['COMPLETE', 'ERROR'] },
      },
      targets: [new LambdaFunction(transcodeComplete)],
    });

    return transcodeComplete;
  }

  // bestEffortCancelTranscodeJob schedules a one-time, delayed invocation
  // of this Lambda for the exact job it just canceled (see
  // mediaconvert-client.ts) -- invoked directly by EventBridge Scheduler,
  // not via a persistent Rule like TranscodeComplete, since each
  // invocation is its own one-off event rather than a recurring pattern.
  private createTranscodeCleanupLambda(
    lessonMediaBucket: LessonMediaBucket,
    instructorApiIntegrations: InstructorApiIntegrations,
  ) {
    const transcodeCleanup = new EventsTranscodeCleanup(
      this,
      'TranscodeCleanup',
    );
    const runtimeConfig = RuntimeConfig.ensure(this);
    transcodeCleanup.addEnvironment(
      'RUNTIME_CONFIG_APP_ID',
      runtimeConfig.appConfigApplicationId,
    );
    runtimeConfig.grantReadAppConfig(transcodeCleanup);
    // Needs both: list the job's own nonce-scoped prefix, then delete
    // everything found there.
    lessonMediaBucket.grantRead(transcodeCleanup);
    lessonMediaBucket.grantDelete(transcodeCleanup);

    // A dedicated group (rather than the account's default one) so the
    // scheduler:CreateSchedule/UpdateSchedule grant below can be scoped to
    // just these schedules instead of every schedule in the account.
    // Destroyed with the stack: CDK names the group deterministically, so a
    // retained group blocks the stack from ever being created again, and its
    // one-time schedules are only meaningful while the stack exists.
    const scheduleGroup = new ScheduleGroup(this, 'TranscodeCleanupGroup', {
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // EventBridge Scheduler assumes this to invoke the cleanup Lambda on
    // each schedule's behalf -- distinct from the instructor-api handlers'
    // own role, which only needs to create the schedule, not run it.
    const schedulerRole = new Role(this, 'TranscodeCleanupSchedulerRole', {
      assumedBy: new ServicePrincipal('scheduler.amazonaws.com'),
    });
    transcodeCleanup.grantInvoke(schedulerRole);

    for (const handler of this.getTranscodeCancelHandlers(
      instructorApiIntegrations,
    )) {
      this.grantScheduleCleanupWrite(handler, scheduleGroup, schedulerRole);
    }

    runtimeConfig.set('mediaConvert', 'TranscodeCleanup', {
      lambdaArn: transcodeCleanup.functionArn,
      schedulerRoleArn: schedulerRole.roleArn,
      scheduleGroupName: scheduleGroup.scheduleGroupName,
    });

    return { transcodeCleanup, scheduleGroup, schedulerRole };
  }

  private createStudentPortal(
    studentPortalConfig?: StudentPortalComponentConfig,
  ) {
    const studentPortalWafEnabled = studentPortalConfig?.enableWaf ?? true;
    const studentPortalKmsEnabled =
      studentPortalConfig?.enableKmsEncryption ?? true;
    const certificate = studentPortalConfig?.certificateArn
      ? Certificate.fromCertificateArn(
          this,
          'StudentPortalCertificate',
          studentPortalConfig.certificateArn,
        )
      : undefined;

    const studentPortal = new StudentPortal(this, 'StudentPortal', {
      enableWaf: studentPortalWafEnabled,
      enableKeyRotation: studentPortalConfig?.enableKeyRotation ?? true,
      domainNames: studentPortalConfig?.domainNames,
      certificate,
      ...(studentPortalKmsEnabled
        ? {}
        : { encryption: BucketEncryption.S3_MANAGED }),
    });
    if (!studentPortalWafEnabled) {
      suppressRules(
        studentPortal.cloudFrontDistribution,
        ['CKV_AWS_68'],
        'WAF disabled for this stage',
      );
    }
    if (!studentPortalKmsEnabled) {
      suppressRules(
        this,
        ['CKV_AWS_158'],
        'KMS encryption disabled for this stage',
        (c) =>
          CfnResource.isCfnResource(c) &&
          c.cfnResourceType === 'AWS::Logs::LogGroup' &&
          c.node.path.includes('/StudentPortal/AccessLogs'),
      );
    }

    return studentPortal;
  }

  private createInstructorPortal(
    instructorPortalConfig?: InstructorPortalComponentConfig,
  ) {
    const instructorPortalWafEnabled =
      instructorPortalConfig?.enableWaf ?? true;
    const instructorPortalKmsEnabled =
      instructorPortalConfig?.enableKmsEncryption ?? true;
    const instructorPortalCertificate = instructorPortalConfig?.certificateArn
      ? Certificate.fromCertificateArn(
          this,
          'InstructorPortalCertificate',
          instructorPortalConfig.certificateArn,
        )
      : undefined;

    const instructorPortal = new InstructorPortal(this, 'InstructorPortal', {
      enableWaf: instructorPortalWafEnabled,
      enableKeyRotation: instructorPortalConfig?.enableKeyRotation ?? true,
      domainNames: instructorPortalConfig?.domainNames,
      certificate: instructorPortalCertificate,
      ...(instructorPortalKmsEnabled
        ? {}
        : { encryption: BucketEncryption.S3_MANAGED }),
    });
    if (!instructorPortalWafEnabled) {
      suppressRules(
        instructorPortal.cloudFrontDistribution,
        ['CKV_AWS_68'],
        'WAF disabled for this stage',
      );
    }
    if (!instructorPortalKmsEnabled) {
      suppressRules(
        this,
        ['CKV_AWS_158'],
        'KMS encryption disabled for this stage',
        (c) =>
          CfnResource.isCfnResource(c) &&
          c.cfnResourceType === 'AWS::Logs::LogGroup' &&
          c.node.path.includes('/InstructorPortal/AccessLogs'),
      );
    }

    return instructorPortal;
  }

  private createAdminPortal(adminPortalConfig?: AdminPortalComponentConfig) {
    const adminPortalWafEnabled = adminPortalConfig?.enableWaf ?? true;
    const adminPortalKmsEnabled =
      adminPortalConfig?.enableKmsEncryption ?? true;
    const adminPortalCertificate = adminPortalConfig?.certificateArn
      ? Certificate.fromCertificateArn(
          this,
          'AdminPortalCertificate',
          adminPortalConfig.certificateArn,
        )
      : undefined;

    const adminPortal = new AdminPortal(this, 'AdminPortal', {
      enableWaf: adminPortalWafEnabled,
      enableKeyRotation: adminPortalConfig?.enableKeyRotation ?? true,
      domainNames: adminPortalConfig?.domainNames,
      certificate: adminPortalCertificate,
      ...(adminPortalKmsEnabled
        ? {}
        : { encryption: BucketEncryption.S3_MANAGED }),
    });
    if (!adminPortalWafEnabled) {
      suppressRules(
        adminPortal.cloudFrontDistribution,
        ['CKV_AWS_68'],
        'WAF disabled for this stage',
      );
    }
    if (!adminPortalKmsEnabled) {
      suppressRules(
        this,
        ['CKV_AWS_158'],
        'KMS encryption disabled for this stage',
        (c) =>
          CfnResource.isCfnResource(c) &&
          c.cfnResourceType === 'AWS::Logs::LogGroup' &&
          c.node.path.includes('/AdminPortal/AccessLogs'),
      );
    }

    return adminPortal;
  }

  private restrictCors({
    coreApi,
    instructorApi,
    lessonMediaBucket,
    lessonMediaUploadBucket,
    studentPortal,
    instructorPortal,
    adminPortal,
  }: {
    coreApi: ReturnType<ApplicationStack['createCoreApi']>;
    instructorApi: ReturnType<
      ApplicationStack['createInstructorApi']
    >['instructorApi'];
    lessonMediaBucket: LessonMediaBucket;
    lessonMediaUploadBucket: LessonMediaUploadBucket;
    studentPortal: StudentPortal;
    instructorPortal: InstructorPortal;
    adminPortal: AdminPortal;
  }) {
    coreApi.restrictCorsTo(
      studentPortal,
      instructorPortal,
      adminPortal,
      'http://localhost:4200',
      'http://localhost:4300',
      'http://localhost:4201',
      'http://localhost:4301',
      'http://localhost:4202',
      'http://localhost:4302',
    );

    instructorApi.restrictCorsTo(
      instructorPortal,
      'http://localhost:4200',
      'http://localhost:4300',
    );

    lessonMediaBucket.restrictCorsTo(
      instructorPortal,
      'http://localhost:4200',
      'http://localhost:4300',
    );

    lessonMediaUploadBucket.restrictCorsTo(
      instructorPortal,
      'http://localhost:4200',
      'http://localhost:4300',
    );
  }
}
