import boto3
import json

def apply_lifecycle_rules():
    """
    Applies a 7-day auto-delete Lifecycle rule to the ConsumAR Studio S3 buckets.
    """
    s3_client = boto3.client('s3')
    
    # The buckets used by the application
    buckets = ['voxel-vista', 'glb-output']
    
    lifecycle_configuration = {
        'Rules': [
            {
                'ID': 'AutoPurge7Days',
                'Prefix': '', # Apply to all objects
                'Status': 'Enabled',
                'Expiration': {
                    'Days': 7
                },
                'AbortIncompleteMultipartUpload': {
                    'DaysAfterInitiation': 1
                }
            }
        ]
    }
    
    for bucket in buckets:
        try:
            print(f"Applying 7-day lifecycle rule to bucket: {bucket}...")
            s3_client.put_bucket_lifecycle_configuration(
                Bucket=bucket,
                LifecycleConfiguration=lifecycle_configuration
            )
            print(f"Successfully applied rule to {bucket}.")
        except Exception as e:
            print(f"Failed to apply rule to {bucket}. Error: {e}")

if __name__ == "__main__":
    print("="*50)
    print("ConsumAR Studio - S3 Lifecycle Configurator")
    print("="*50)
    print("Note: This script requires valid AWS credentials configured locally")
    print("(e.g., via `aws configure` or environment variables).")
    print()
    apply_lifecycle_rules()
