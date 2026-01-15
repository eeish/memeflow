#!/usr/bin/env python3
import os
import sys
from datetime import datetime, timezone

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError


def load_env(path):
    env = {}
    try:
        with open(path, "r", encoding="utf-8") as handle:
            for raw in handle:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                env[key.strip()] = value.strip().strip("'").strip('"')
    except FileNotFoundError:
        print(f"Missing env file: {path}", file=sys.stderr)
        sys.exit(1)
    return env


def mask(value):
    if not value:
        return ""
    if len(value) <= 6:
        return "*" * len(value)
    return value[:3] + ("*" * (len(value) - 6)) + value[-3:]


def error_details(exc):
    response = getattr(exc, "response", None) or {}
    error = response.get("Error", {}) if isinstance(response, dict) else {}
    parts = []
    if error.get("Code"):
        parts.append(f"code={error.get('Code')}")
    if error.get("Message"):
        parts.append(f"message={error.get('Message')}")
    if response.get("ResponseMetadata", {}).get("RequestId"):
        parts.append(f"request_id={response['ResponseMetadata']['RequestId']}")
    return ", ".join(parts) if parts else str(exc)


def main():
    env_path = os.path.join("service", ".env")
    env = load_env(env_path)

    required = [
        "R2_ACCOUNT_ID",
        "R2_ACCESS_KEY_ID",
        "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET_NAME",
        "R2_PUBLIC_DOMAIN",
    ]
    missing = [key for key in required if not env.get(key)]
    if missing:
        print(f"Missing required env vars in {env_path}: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    account_id = env["R2_ACCOUNT_ID"]
    bucket_name = env["R2_BUCKET_NAME"]
    endpoint_url = f"https://{account_id}.r2.cloudflarestorage.com"

    print("R2 config:")
    print(f"- endpoint_url: {endpoint_url}")
    print(f"- bucket_name: {bucket_name}")
    print(f"- access_key_id: {mask(env['R2_ACCESS_KEY_ID'])}")

    client = boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=env["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=env["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
        config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
    )

    try:
        client.head_bucket(Bucket=bucket_name)
        print("Health check: OK (bucket is accessible)")
    except ClientError as exc:
        print(f"Health check: FAILED ({error_details(exc)})", file=sys.stderr)
        print("Attempting list buckets for more detail...")
        try:
            response = client.list_buckets()
            buckets = [b.get("Name", "") for b in response.get("Buckets", [])]
            print(f"ListBuckets: OK ({len(buckets)} buckets)")
            if buckets:
                print("- buckets:", ", ".join(sorted(buckets)))
        except ClientError as list_exc:
            print(f"ListBuckets: FAILED ({error_details(list_exc)})", file=sys.stderr)
        sys.exit(2)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    key = f"healthcheck/{timestamp}.txt"
    body = f"healthcheck {timestamp}\n".encode("utf-8")

    try:
        client.put_object(
            Bucket=bucket_name,
            Key=key,
            Body=body,
            ContentType="text/plain",
        )
        public_url = f"https://{env['R2_PUBLIC_DOMAIN']}/{key}"
        print("Upload test: OK")
        print(f"- object_key: {key}")
        print(f"- public_url: {public_url}")
    except ClientError as exc:
        print(f"Upload test: FAILED ({exc})", file=sys.stderr)
        sys.exit(3)


if __name__ == "__main__":
    main()
