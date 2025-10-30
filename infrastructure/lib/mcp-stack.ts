import * as path from 'path';
import * as fs from 'fs';
import { Duration, Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import {
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_elasticloadbalancingv2 as elbv2,
  aws_logs as logs,
  aws_secretsmanager as secretsmanager,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';

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
      logGroupName: `/nexusnote/mcp/${this.stackName}`,
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

    const listener = loadBalancer.addListener('HttpListener', {
      port: 80,
      open: true,
    });

    service.registerLoadBalancerTargets({
      containerName: container.containerName,
      containerPort: servicePort,
      newTargetGroupId: 'McpTargetGroup',
      listener: ecs.ListenerConfig.applicationListener(listener, {
        protocol: elbv2.ApplicationProtocol.HTTP,
        healthCheck: {
          path: '/health',
          interval: Duration.seconds(30),
          healthyHttpCodes: '200-499',
        },
      }),
    });

    service.connections.allowFrom(loadBalancer, ec2.Port.tcp(servicePort));

    new CfnOutput(this, 'LoadBalancerDnsName', {
      value: loadBalancer.loadBalancerDnsName,
      description: 'Public DNS name for the MCP load balancer.',
    });

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
