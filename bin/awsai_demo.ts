#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AwsaiDemoStack } from '../lib/awsai_demo-stack';
import { VpcLookup } from '../lib/vpc-lookup';

const app = new cdk.App();

// Environment configuration
const envName = app.node.tryGetContext('env') || 'dev';
const account = process.env.CDK_DEFAULT_ACCOUNT || process.env.AWS_ACCOUNT_ID;
const region = process.env.CDK_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-1';

// Environment-specific props
const envSpecificProps = {
  env: { 
    account: account, 
    region: region 
  }
};

// Create main application stack
const mainStack = new AwsaiDemoStack(app, `${envName}-AwsaiDemoStack`, {
  ...envSpecificProps,
  envName: envName,
});

// Add VPC lookup to the stack
const vpcLookup = new VpcLookup(mainStack, 'VpcLookup', {
  envName: envName
});

// Set the VPC for the stack resources
mainStack.setVpc(vpcLookup.vpc);