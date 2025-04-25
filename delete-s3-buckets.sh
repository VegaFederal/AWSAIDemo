#!/bin/bash

# Text colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting S3 bucket cleanup...${NC}"

# Get list of all buckets
buckets=$(aws s3api list-buckets --query 'Buckets[].Name' --output text)

if [ -z "$buckets" ]; then
    echo -e "${GREEN}No buckets found. Nothing to delete.${NC}"
    exit 0
fi

# Counter for progress
total_buckets=$(echo "$buckets" | wc -w)
current=0

for bucket in $buckets; do
    ((current++))
    echo -e "\n${YELLOW}Processing bucket ${current}/${total_buckets}: ${bucket}${NC}"
    
    # First, remove bucket versioning to handle versioned objects
    echo "Suspending versioning..."
    aws s3api put-bucket-versioning \
        --bucket "$bucket" \
        --versioning-configuration Status=Suspended 2>/dev/null

    # Delete all versions and delete markers
    echo "Removing all object versions..."
    versions=$(aws s3api list-object-versions \
        --bucket "$bucket" \
        --output json \
        --query '{Objects: Objects[].{Key:Key,VersionId:VersionId}, Markers: DeleteMarkers[].{Key:Key,VersionId:VersionId}}' 2>/dev/null)
    
    if [ "$versions" != "null" ] && [ -n "$versions" ]; then
        echo "$versions" | jq -c '.Objects + .Markers' 2>/dev/null | \
        while read -r version; do
            if [ "$version" != "null" ] && [ -n "$version" ]; then
                key=$(echo "$version" | jq -r '.Key')
                version_id=$(echo "$version" | jq -r '.VersionId')
                aws s3api delete-object \
                    --bucket "$bucket" \
                    --key "$key" \
                    --version-id "$version_id" 2>/dev/null
            fi
        done
    fi

    # Delete remaining objects
    echo "Removing remaining objects..."
    aws s3 rm "s3://${bucket}" --recursive 2>/dev/null

    # Finally delete the bucket
    echo "Deleting bucket..."
    if aws s3api delete-bucket --bucket "$bucket" 2>/dev/null; then
        echo -e "${GREEN}Successfully deleted bucket: ${bucket}${NC}"
    else
        echo -e "${RED}Failed to delete bucket: ${bucket}${NC}"
    fi
done

echo -e "\n${GREEN}Bucket cleanup completed!${NC}"
