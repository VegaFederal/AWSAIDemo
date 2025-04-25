#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AwsaiDemoStack } from '../lib/awsai_demo-stack';

const app = new cdk.App();
new AwsaiDemoStack(app, 'AwsaiDemoStack', {
  // Use the CLI configuration - this is the recommended approach
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  }
});
