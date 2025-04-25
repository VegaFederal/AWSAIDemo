import json
import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    logger.info(f"Event: {json.dumps(event)}")
    logger.info(f"Context: {str(context)}")
    
    try:
        # Parse the incoming request
        if 'body' not in event or not event['body']:
            raise ValueError("Missing or empty request body")
        body = json.loads(event['body'])
        prompt = body.get('prompt')
        if not prompt:
            raise ValueError("Missing 'prompt' in request body")
        
        # Initialize Bedrock client
        bedrock = boto3.client('bedrock-runtime', region_name='us-east-1')
        
        # Configure the request
        messages = [{"role": "user", "content": [{"text": prompt}]}]

        request_body = {
            "schemaVersion": "messages-v1",
            "messages": messages
        }
        
        # Call Bedrock with the prompt in messages format
        response = bedrock.invoke_model(
            modelId='amazon.nova-pro-v1:0',
            body=json.dumps(request_body)
        )
        
        # Parse the response
        response_body = json.loads(response['body'].read())
        logger.info(f"Response: {json.dumps(response_body)}")
        
        # Extract the generated text
        generated_text = response_body.get('output', {}).get('message', {}).get('content', [{}])[0].get('text', 'No response text')
        
        # Return the response
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'OPTIONS,POST',
                'Content-Type': 'application/json'
            },
            'body': json.dumps({'response': generated_text})
        }
    except Exception as e:
        logger.error(f"Error: {str(e)}", exc_info=True)
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'OPTIONS,POST',
                'Content-Type': 'application/json'
            },
            'body': json.dumps({'error': str(e)})
        }