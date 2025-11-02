import * as path from 'path';
import * as fs from 'fs';
import { Duration, Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import {
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_elasticloadbalancingv2 as elbv2,
  aws_logs as logs,
  aws_secretsmanager as secretsmanager,
  aws_iam as iam,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { DnsValidatedCertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { HostedZone, ARecord, RecordTarget } from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';

export interface McpStackProps extends StackProps {
  /**
   * Filesystem path to the MCP server directory that should be used to build the container image.
   */
  readonly containerImagePath: string;

  /**
   * Name of the Secrets Manager secret that stores the SERPAPI key.
   */
  readonly serpApiSecretName: string;

  /**
   * Desired number of Fargate tasks.
   *
   * @default 1
   */
  readonly desiredCount?: number;

  /**
   * CPU units allocated to each task (e.g. 512, 1024).
   *
   * @default 512
   */
  readonly cpu?: number;

  /**
   * Memory (in MiB) allocated to each task.
   *
   * @default 1024
   */
  readonly memoryLimitMiB?: number;

  /**
   * Container/listener port to expose via the load balancer.
   *
   * @default 8080
   */
  readonly servicePort?: number;

  /**
   * Log level to pass through to the container as MCP_LOG_LEVEL.
   *
   * @default 'info'
   */
  readonly logLevel?: string;

  /**
   * Optional ACM certificate ARN to enable HTTPS on the load balancer.
   */
  readonly certificateArn?: string;

  /**
   * Whether to redirect HTTP to HTTPS when a certificate is provided.
   *
   * @default true (when certificateArn is set)
   */
  readonly redirectHttpToHttps?: boolean;

  /**
   * Cognito region for verifying ID tokens.
   */
  readonly cognitoRegion: string;

  /**
   * Cognito user pool ID.
   */
  readonly cognitoUserPoolId: string;

  /**
   * Cognito user pool app client ID.
   */
  readonly cognitoUserPoolClientId: string;

  /**
   * Bedrock region hosting the Anthropic model.
   */
  readonly bedrockRegion: string;

  /**
   * Bedrock model ID (e.g. anthropic.claude-3-haiku-20240307-v1:0).
   */
  readonly bedrockModelId: string;

  /**
   * Optional override for maximum output tokens.
   */
  readonly bedrockMaxOutputTokens?: number;

  /**
   * Optional override for temperature.
   */
  readonly bedrockTemperature?: number;

  /**
   * Optional domain name to associate with the MCP API (e.g. api.example.com).
   */
  readonly apiDomainName?: string;

  /**
   * Hosted zone domain name that contains apiDomainName.
   */
  readonly hostedZoneDomainName?: string;

  /**
   * DynamoDB table ARNs that the task should be allowed to read from.
   */
  readonly dynamoTableArns?: string[];

  /**
   * Raw DynamoDB table config string passed through to the application (table|partitionKey|sortKey entries).
   */
  readonly dynamoTableConfig?: string;

  /**
   * Optional KMS key ARN used by the DynamoDB tables; grants decrypt permissions to the task role when provided.
   */
  readonly kmsKeyArn?: string;
}

export class McpStack extends Stack {
  constructor(scope: Construct, id: string, props: McpStackProps) {
    super(scope, id, props);

    const cpu = props.cpu ?? 512;
    const memoryLimitMiB = props.memoryLimitMiB ?? 1024;
    const desiredCount = props.desiredCount ?? 1;
    const servicePort = props.servicePort ?? 8080;

    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 1,
    });

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      containerInsights: true,
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      cpu,
      memoryLimitMiB,
    });

    const serpApiSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'SerpApiSecret',
      props.serpApiSecretName,
    );

    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/mcp/service/${this.stackName}`,
      retention: logs.RetentionDays.ONE_MONTH,
    });

    const containerImageDirectory = path.resolve(props.containerImagePath);
    if (!fs.existsSync(containerImageDirectory)) {
      throw new Error(`Container image directory does not exist: ${containerImageDirectory}`);
    }

    const container = taskDefinition.addContainer('McpContainer', {
      image: ecs.ContainerImage.fromAsset(containerImageDirectory, {
        platform: Platform.LINUX_AMD64,
      }),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: 'mcp',
        logGroup,
      }),
      environment: {
        LOG_LEVEL: props.logLevel ?? 'info',
        NODE_ENV: 'production',
        MCP_HOST: '0.0.0.0',
        MCP_PORT: String(servicePort),
        COGNITO_REGION: props.cognitoRegion,
        COGNITO_USER_POOL_ID: props.cognitoUserPoolId,
        COGNITO_USER_POOL_CLIENT_ID: props.cognitoUserPoolClientId,
        BEDROCK_REGION: props.bedrockRegion,
        BEDROCK_MODEL_ID: props.bedrockModelId,
        ...(props.bedrockMaxOutputTokens !== undefined
          ? { BEDROCK_MAX_OUTPUT_TOKENS: String(props.bedrockMaxOutputTokens) }
          : {}),
        ...(props.bedrockTemperature !== undefined
          ? { BEDROCK_TEMPERATURE: String(props.bedrockTemperature) }
          : {}),
        ...(props.dynamoTableConfig
          ? { MCP_DYNAMODB_TABLE_CONFIG: props.dynamoTableConfig }
          : {}),
      },
      secrets: {
        SERPAPI_KEY: ecs.Secret.fromSecretsManager(serpApiSecret),
      },
      portMappings: [
        {
          containerPort: servicePort,
        },
      ],
    });

    taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: [
          `arn:aws:bedrock:${props.bedrockRegion}::foundation-model/${props.bedrockModelId}`,
        ],
      }),
    );

    taskDefinition.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          'aws-marketplace:ViewSubscriptions',
          'aws-marketplace:Subscribe',
          'aws-marketplace:Unsubscribe',
          'aws-marketplace:DescribeEntity',
          'aws-marketplace:GetEntity',
        ],
        resources: ['*'],
      }),
    );

    const dynamoTableArns = props.dynamoTableArns ?? [];
    if (dynamoTableArns.length > 0) {
      const dynamoResources = dynamoTableArns.flatMap((arn) => [arn, `${arn}/index/*`]);
      taskDefinition.taskRole.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions: [
            'dynamodb:GetItem',
            'dynamodb:BatchGetItem',
            'dynamodb:Query',
            'dynamodb:Scan',
            'dynamodb:DescribeTable',
          ],
          resources: dynamoResources,
        }),
      );
    }

    if (props.kmsKeyArn) {
      taskDefinition.taskRole.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions: ['kms:Decrypt', 'kms:DescribeKey'],
          resources: [props.kmsKeyArn],
        }),
      );
    }

    const serviceSecurityGroup = new ec2.SecurityGroup(this, 'ServiceSecurityGroup', {
      vpc,
      allowAllOutbound: true,
      description: 'Security group for MCP Fargate service',
    });

    const service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount,
      securityGroups: [serviceSecurityGroup],
      assignPublicIp: false,
    });

    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'LoadBalancer', {
      vpc,
      internetFacing: true,
    });

    let certificateArn = props.certificateArn;

    if (!certificateArn && props.apiDomainName && props.hostedZoneDomainName) {
      const zone = HostedZone.fromLookup(this, 'HostedZone', {
        domainName: props.hostedZoneDomainName,
      });

      const certificate = new DnsValidatedCertificate(this, 'ApiCertificate', {
        domainName: props.apiDomainName,
        hostedZone: zone,
        region: props.bedrockRegion,
      });

      certificateArn = certificate.certificateArn;

      new ARecord(this, 'ApiAliasRecord', {
        zone,
        recordName: props.apiDomainName,
        target: RecordTarget.fromAlias(new targets.LoadBalancerTarget(loadBalancer)),
      });
    }

    const httpListener = loadBalancer.addListener('HttpListener', {
      port: 80,
      open: true,
    });

    const loadBalancerTarget = service.loadBalancerTarget({
      containerName: container.containerName,
      containerPort: servicePort,
    });

    const healthCheck = {
      path: '/health',
      interval: Duration.seconds(30),
      healthyHttpCodes: '200-499',
    };

    const httpsEnabled = Boolean(certificateArn);
    const redirectHttp = props.redirectHttpToHttps ?? httpsEnabled;

    if (httpsEnabled) {
      const certificate = elbv2.ListenerCertificate.fromArn(certificateArn!);
      const httpsListener = loadBalancer.addListener('HttpsListener', {
        port: 443,
        protocol: elbv2.ApplicationProtocol.HTTPS,
        certificates: [certificate],
        open: true,
      });

      httpsListener.addTargets('HttpsTargets', {
        targetGroupName: 'McpTargetGroup',
        port: servicePort,
        protocol: elbv2.ApplicationProtocol.HTTP,
        targets: [loadBalancerTarget],
        healthCheck,
      });

      if (redirectHttp) {
        httpListener.addAction('RedirectToHttps', {
          action: elbv2.ListenerAction.redirect({
            protocol: 'HTTPS',
            port: '443',
            permanent: true,
          }),
        });
      } else {
        httpListener.addTargets('HttpTargets', {
          targetGroupName: 'McpHttpTargets',
          port: servicePort,
          protocol: elbv2.ApplicationProtocol.HTTP,
          targets: [loadBalancerTarget],
          healthCheck,
        });
      }
    } else {
      httpListener.addTargets('HttpTargets', {
        targetGroupName: 'McpTargetGroup',
        port: servicePort,
        protocol: elbv2.ApplicationProtocol.HTTP,
        targets: [loadBalancerTarget],
        healthCheck,
      });
    }

    service.connections.allowFrom(loadBalancer, ec2.Port.tcp(servicePort));

    new CfnOutput(this, 'LoadBalancerDnsName', {
      value: loadBalancer.loadBalancerDnsName,
      description: 'Public DNS name for the MCP load balancer.',
    });

    if (httpsEnabled) {
      new CfnOutput(this, 'ServiceHttpsUrl', {
        value: `https://${props.apiDomainName ?? loadBalancer.loadBalancerDnsName}`,
        description: 'HTTPS endpoint for the MCP server.',
      });
    }

    if (props.apiDomainName) {
      new CfnOutput(this, 'ServiceCustomDomain', {
        value: props.apiDomainName,
        description: 'Custom domain associated with the MCP API load balancer.',
      });
    }

    new CfnOutput(this, 'ServiceUrl', {
      value: `ws://${loadBalancer.loadBalancerDnsName}`,
      description: 'WebSocket endpoint for the MCP server.',
    });

    new CfnOutput(this, 'ServiceSecurityGroupId', {
      value: serviceSecurityGroup.securityGroupId,
      description: 'Security group ID attached to the MCP service.',
    });

    new CfnOutput(this, 'ClusterName', {
      value: cluster.clusterName,
      description: 'ECS cluster running the MCP server.',
    });

    new CfnOutput(this, 'TaskDefinitionArn', {
      value: taskDefinition.taskDefinitionArn,
      description: 'ARN of the task definition used by the MCP service.',
    });
  }
}
