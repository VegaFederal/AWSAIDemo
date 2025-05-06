import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface AwsaiDemoStackProps extends cdk.StackProps {
  envName: string;
}

export class AwsaiDemoStack extends cdk.Stack {
  private vpc?: ec2.IVpc;
  
  constructor(scope: Construct, id: string, props: AwsaiDemoStackProps) {
    super(scope, id, props);

    // Lambda Role
    const lambdaRole = new iam.Role(this, 'AIFunctionRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
      ]
    });

    // Lambda Function
    const aiFunction = new lambda.Function(this, 'AIHandler', {
      functionName: `${props.envName}-AIHandler`,
      runtime: lambda.Runtime.PYTHON_3_9,
      code: lambda.Code.fromAsset('lambda'),
      handler: 'lambdaAiHandler.lambda_handler',
      timeout: cdk.Duration.seconds(30),
      role: lambdaRole,
      retryAttempts: 2,
      // If VPC is provided, deploy the Lambda in the VPC
      vpc: this.vpc,
      vpcSubnets: this.vpc ? { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS } : undefined
    });


    // Bedrock Permissions
    aiFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
      resources: [
        'arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-pro-v1:0',
        'arn:aws:bedrock:us-east-1:198846368196:inference-profile/us.amazon.nova-pro-v1:0'
      ],
      effect: iam.Effect.ALLOW
    }));

    // API Gateway CloudWatch Role
    const apiGatewayCloudWatchRole = new iam.Role(this, 'ApiGatewayCloudWatchRole', {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonAPIGatewayPushToCloudWatchLogs')
      ]
    });

    new apigateway.CfnAccount(this, 'ApiGatewayAccount', {
      cloudWatchRoleArn: apiGatewayCloudWatchRole.roleArn
    });

    // API Gateway
    const api = new apigateway.LambdaRestApi(this, 'AWSAiAPI', {
      handler: aiFunction,
      proxy: false,
      deployOptions: {
        dataTraceEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        tracingEnabled: true,
        metricsEnabled: true,
        accessLogDestination: new apigateway.LogGroupLogDestination(new logs.LogGroup(this, 'ApiGatewayAccessLogs', {
          retention: logs.RetentionDays.ONE_WEEK
        })),
      accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields()
      },
      cloudWatchRole: true
    });

    // API Gateway Resources
    const generateResource = api.root.addResource('generate').addResource('content');
    generateResource.addMethod('POST', new apigateway.LambdaIntegration(aiFunction));

    // S3 Website Bucket
    const websiteBucket = new s3.Bucket(this, 'awsAiWebsiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    // CloudFront OAI
    const websiteOAI = new cloudfront.OriginAccessIdentity(this, 'WebsiteOAI', {
      comment: `OAI for ${id}`
    });

    websiteBucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [websiteBucket.arnForObjects('*')],
      principals: [new iam.CanonicalUserPrincipal(websiteOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId)]
    }));

    // S3 Log Bucket
    const logBucket = new s3.Bucket(this, 'AWSAiLogBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      objectOwnership: s3.ObjectOwnership.OBJECT_WRITER
    });

    // CloudFront Distribution
    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(websiteBucket, { originAccessIdentity: websiteOAI }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL
      },
      additionalBehaviors: {
          '/prod/generate/content': {
              origin: new origins.RestApiOrigin(api, {originPath: ''}),
              viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.ALLOW_ALL,
              cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
              allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
              originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
              responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS

          }
      }
    });

    (distribution.node.defaultChild as cdk.CfnResource).applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    // Website Deployment
    new s3deploy.BucketDeployment(this, 'awsAiDeploymentBucket', {
      sources: [s3deploy.Source.asset('./website')],
      destinationBucket: websiteBucket,
      distribution,
      distributionPaths: ['/*'],
      prune: false,
      memoryLimit: 1024,
      role: new iam.Role(this, 'BucketDeploymentRole', {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
        ],
        inlinePolicies: {
          'CloudFrontInvalidation': new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                actions: ['cloudfront:GetInvalidation', 'cloudfront:CreateInvalidation'],
                resources: [distribution.distributionArn]
              })
            ]
          })
        }
      })
    });

    // Outputs
    new cdk.CfnOutput(this, 'BucketName', { value: websiteBucket.bucketName, description: 'Website bucket name' });
    new cdk.CfnOutput(this, 'CloudFrontURL', { value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, 'ApiURL', { value: api.url });
  }
  
  // Method to set the VPC after stack initialization
  public setVpc(vpc: ec2.IVpc): void {
    this.vpc = vpc;
  }
}