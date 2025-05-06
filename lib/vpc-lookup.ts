import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export interface VpcLookupProps {
  envName: string;
}

export class VpcLookup extends Construct {
  public readonly vpc: ec2.IVpc;

  constructor(scope: Construct, id: string, props: VpcLookupProps) {
    super(scope, id);

    // Get VPC ID from context based on environment
    const vpcId = this.node.tryGetContext(`environments`)?.[props.envName]?.['vpc-id'];
    
    if (vpcId) {
      // If VPC ID is provided in context, use it directly
      this.vpc = ec2.Vpc.fromLookup(this, 'ExistingVpc', {
        vpcId: vpcId
      });
      
      // Log the VPC being used
      console.log(`Using VPC with ID ${vpcId} for environment ${props.envName}`);
    } else {
      // If no VPC ID is found, throw an error
      throw new Error(`No VPC ID found for environment ${props.envName}. Please configure it in cdk.json under context.environments.${props.envName}.vpc-id`);
    }
  }
}