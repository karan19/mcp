import * as path from 'path';
import * as fs from 'fs';
import { Duration, Stack, StackProps, CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import {
  aws_apprunner as apprunner,
  aws_dynamodb as dynamodb,
  aws_iam as iam,
  aws_secretsmanager as secretsmanager,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DockerImageAsset, Platform } from 'aws-cdk-lib/aws-ecr-assets';

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
   * CPU units allocated to the container (e.g. 512, 1024, 2048).
   *
   * @default 1024
   */
  readonly cpu?: number;

  /**
   * Memory (in MiB) allocated to the container.
   *
   * @default 2048
   */
  readonly memoryLimitMiB?: number;

  /**
   * Container port that App Runner should expose.
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
   * Bedrock region hosting the model.
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
   * DynamoDB table ARNs that the task should be allowed to read from.
   */
  readonly dynamoTableArns?: string[];

  /**
   * Raw DynamoDB table config string passed through to the application (table|partitionKey|sortKey entries).
   */
  readonly dynamoTableConfig?: string;

  /**
   * Optional KMS key ARN used by the DynamoDB tables; grants decrypt permissions when provided.
   */
  readonly kmsKeyArn?: string;

  /**
   * Whether to provision a managed chat history table.
   *
   * @default true
   */
  readonly createChatTable?: boolean;

  /**
   * Optional explicit name for the managed chat history table.
   */
  readonly chatTableName?: string;
}

export class McpStack extends Stack {
  constructor(scope: Construct, id: string, props: McpStackProps) {
    super(scope, id, props);

    const cpu = props.cpu ?? 1024;
    const memoryLimitMiB = props.memoryLimitMiB ?? 2048;
    const servicePort = props.servicePort ?? 8080;

    const tableConfigEntries: string[] = [];
    if (props.dynamoTableConfig && props.dynamoTableConfig.trim()) {
      tableConfigEntries.push(
        ...props.dynamoTableConfig
          .split(';')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0),
      );
    }

    const externalDynamoTableArns = (props.dynamoTableArns ?? []).filter((arn) => arn && arn.length > 0);
    const shouldCreateChatTable = props.createChatTable ?? true;
    let chatTable: dynamodb.Table | undefined;

    if (shouldCreateChatTable) {
      chatTable = new dynamodb.Table(this, 'ChatHistoryTable', {
        tableName: props.chatTableName,
        partitionKey: { name: 'sessionId', type: dynamodb.AttributeType.STRING },
        sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        removalPolicy: RemovalPolicy.RETAIN,
      });

      chatTable.addGlobalSecondaryIndex({
        indexName: 'userIndex',
        partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
        sortKey: { name: 'lastMessageAt', type: dynamodb.AttributeType.STRING },
        projectionType: dynamodb.ProjectionType.ALL,
      });

      const chatTableConfig = `${chatTable.tableName}|sessionId|createdAt|userIndex|userId|lastMessageAt`;
      tableConfigEntries.push(chatTableConfig);
    }

    const combinedTableConfig = tableConfigEntries.join(';');

    const serpApiSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'SerpApiSecret',
      props.serpApiSecretName,
    );

    const containerImageDirectory = path.resolve(props.containerImagePath);
    if (!fs.existsSync(containerImageDirectory)) {
      throw new Error(`Container image directory does not exist: ${containerImageDirectory}`);
    }

    const imageAsset = new DockerImageAsset(this, 'McpImage', {
      directory: containerImageDirectory,
      platform: Platform.LINUX_AMD64,
    });

    const imageAccessRole = new iam.Role(this, 'AppRunnerEcrAccessRole', {
      assumedBy: new iam.ServicePrincipal('build.apprunner.amazonaws.com'),
      description: 'Role that allows App Runner to pull the MCP image from ECR.',
    });
    imageAsset.repository.grantPull(imageAccessRole);

    const serviceRole = new iam.Role(this, 'AppRunnerServiceRole', {
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
      description: 'Execution role for the MCP App Runner service.',
    });

    const containerEnv: Record<string, string> = {
      LOG_LEVEL: props.logLevel ?? 'info',
      NODE_ENV: 'production',
      MCP_HOST: '0.0.0.0',
      MCP_PORT: String(servicePort),
      COGNITO_REGION: props.cognitoRegion,
      COGNITO_USER_POOL_ID: props.cognitoUserPoolId,
      COGNITO_USER_POOL_CLIENT_ID: props.cognitoUserPoolClientId,
      BEDROCK_REGION: props.bedrockRegion,
      BEDROCK_MODEL_ID: props.bedrockModelId,
    };

    if (props.bedrockMaxOutputTokens !== undefined) {
      containerEnv.BEDROCK_MAX_OUTPUT_TOKENS = String(props.bedrockMaxOutputTokens);
    }

    if (props.bedrockTemperature !== undefined) {
      containerEnv.BEDROCK_TEMPERATURE = String(props.bedrockTemperature);
    }

    if (combinedTableConfig) {
      containerEnv.MCP_DYNAMODB_TABLE_CONFIG = combinedTableConfig;
    }

    if (chatTable) {
      containerEnv.MCP_CHAT_TABLE_NAME = chatTable.tableName;
    }

    const runtimeEnvironmentVariables: apprunner.CfnService.KeyValuePairProperty[] = Object.entries(
      containerEnv,
    ).map(([name, value]) => ({
      name,
      value,
    }));

    const runtimeEnvironmentSecrets: apprunner.CfnService.KeyValuePairProperty[] = [
      {
        name: 'SERPAPI_KEY',
        value: serpApiSecret.secretArn,
      },
    ];

    serpApiSecret.grantRead(serviceRole);

    serviceRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: [`arn:aws:bedrock:${props.bedrockRegion}::foundation-model/${props.bedrockModelId}`],
      }),
    );

    serviceRole.addToPrincipalPolicy(
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

    if (chatTable) {
      chatTable.grantReadWriteData(serviceRole);
    }

    if (externalDynamoTableArns.length > 0) {
      const dynamoResources = externalDynamoTableArns.flatMap((arn) => [arn, `${arn}/index/*`]);
      serviceRole.addToPrincipalPolicy(
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
      serviceRole.addToPrincipalPolicy(
        new iam.PolicyStatement({
          actions: ['kms:Decrypt', 'kms:DescribeKey'],
          resources: [props.kmsKeyArn],
        }),
      );
    }

    const cpuSetting = mapCpuToAppRunner(cpu);
    const memorySetting = mapMemoryToAppRunner(memoryLimitMiB);

    const service = new apprunner.CfnService(this, 'AppRunnerService', {
      serviceName: Stack.of(this).stackName,
      sourceConfiguration: {
        autoDeploymentsEnabled: true,
        authenticationConfiguration: {
          accessRoleArn: imageAccessRole.roleArn,
        },
        imageRepository: {
          imageIdentifier: imageAsset.imageUri,
          imageRepositoryType: 'ECR',
          imageConfiguration: {
            port: String(servicePort),
            runtimeEnvironmentVariables,
            runtimeEnvironmentSecrets,
          },
        },
      },
      instanceConfiguration: {
        cpu: cpuSetting,
        memory: memorySetting,
        instanceRoleArn: serviceRole.roleArn,
      },
      healthCheckConfiguration: {
        protocol: 'HTTP',
        path: '/health',
        interval: Duration.seconds(10).toSeconds(),
        timeout: Duration.seconds(5).toSeconds(),
        healthyThreshold: 1,
        unhealthyThreshold: 3,
      },
    });

    new CfnOutput(this, 'ServiceHttpsUrl', {
      value: service.attrServiceUrl,
      description: 'HTTPS endpoint for the MCP App Runner service.',
    });

    new CfnOutput(this, 'ServiceArn', {
      value: service.attrServiceArn,
      description: 'ARN of the App Runner service.',
    });

    if (chatTable) {
      new CfnOutput(this, 'ChatHistoryTableName', {
        value: chatTable.tableName,
        description: 'DynamoDB table storing chat conversation history.',
      });

      new CfnOutput(this, 'ChatHistoryTableArn', {
        value: chatTable.tableArn,
        description: 'ARN of the chat conversation history table.',
      });
    }

    new CfnOutput(this, 'ContainerImageUri', {
      value: imageAsset.imageUri,
      description: 'URI of the container image deployed to App Runner.',
    });
  }
}

function mapCpuToAppRunner(cpu: number): string {
  if (cpu <= 1024) {
    return '1 vCPU';
  }
  if (cpu <= 2048) {
    return '2 vCPU';
  }
  if (cpu <= 4096) {
    return '4 vCPU';
  }
  return '8 vCPU';
}

function mapMemoryToAppRunner(memoryMiB: number): string {
  if (memoryMiB <= 2048) {
    return '2 GB';
  }
  if (memoryMiB <= 4096) {
    return '4 GB';
  }
  if (memoryMiB <= 8192) {
    return '8 GB';
  }
  if (memoryMiB <= 16384) {
    return '16 GB';
  }
  return '32 GB';
}
