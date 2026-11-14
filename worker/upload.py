"""Upload data/package to Cloudflare R2 (S3 API) and set CORS.

Files go under a version prefix (default v1/), so a new data release can be
uploaded next to the old one and switched by changing VITE_DATA_URL in Vercel.

  - Skips files whose MD5 already matches the object's ETag (re-runs are cheap).
  - Content-Type: application/json for .json, application/octet-stream for .bin.
  - Cache-Control: 1 day (files under a version prefix never change).
  - CORS: GET/HEAD from any origin (public, read-only data).

Needs worker/.env (never committed), see .env.example:
    R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET

    uv run upload.py --check        # credentials + bucket reachable, nothing uploaded
    uv run upload.py                # upload data/package → s3://$R2_BUCKET/v1/
    uv run upload.py --prefix v2
"""
from __future__ import annotations

import argparse
import hashlib
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from dotenv import load_dotenv

from download import ROOT

PACKAGE = ROOT / "data" / "package"
# The data is public and read-only, so any origin may GET it (Vercel previews get new URLs).
ALLOWED_ORIGINS = ["*"]


def client():
    load_dotenv(Path(__file__).with_name(".env"))
    missing = [k for k in ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET")
               if not os.environ.get(k)]
    if missing:
        sys.exit(f"worker/.env is missing: {', '.join(missing)} (see worker/.env.example)")
    s3 = boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
        config=Config(retries={"max_attempts": 5, "mode": "standard"}, max_pool_connections=16),
    )
    return s3, os.environ["R2_BUCKET"]


def existing_etags(s3, bucket: str, prefix: str) -> dict[str, str]:
    out = {}
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=prefix):
        for o in page.get("Contents", []):
            out[o["Key"]] = o["ETag"].strip('"')
    return out


def set_cors(s3, bucket: str) -> None:
    s3.put_bucket_cors(Bucket=bucket, CORSConfiguration={"CORSRules": [{
        "AllowedOrigins": ALLOWED_ORIGINS, "AllowedMethods": ["GET", "HEAD"],
        "AllowedHeaders": ["*"], "MaxAgeSeconds": 86400,
    }]})


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prefix", default="v1")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--no-cors", action="store_true")
    args = ap.parse_args()
    s3, bucket = client()
    prefix = args.prefix.strip("/") + "/"

    try:
        s3.head_bucket(Bucket=bucket)
    except ClientError as e:
        sys.exit(f"cannot reach bucket {bucket!r}: {e.response['Error'].get('Code')} — check the token and name")
    print(f"bucket {bucket!r} reachable")
    if args.check:
        return 0

    if not (PACKAGE / "variables.json").exists():
        sys.exit("data/package is empty: run `uv run package.py` first")
    files = sorted(f for f in PACKAGE.rglob("*") if f.is_file())
    have = existing_etags(s3, bucket, prefix)

    def put(f: Path) -> str:
        key = prefix + f.relative_to(PACKAGE).as_posix()
        body = f.read_bytes()
        if have.get(key) == hashlib.md5(body).hexdigest():
            return "skip"
        s3.put_object(
            Bucket=bucket, Key=key, Body=body,
            ContentType="application/json" if f.suffix == ".json" else "application/octet-stream",
            CacheControl="public, max-age=86400",
        )
        return "ok"

    counts, errors = {"ok": 0, "skip": 0}, []
    with ThreadPoolExecutor(12) as pool:
        futs = {pool.submit(put, f): f for f in files}
        for k, fut in enumerate(as_completed(futs), 1):
            try:
                counts[fut.result()] += 1
            except Exception as e:
                errors.append(f"{futs[fut].name}: {e}")
            if k % 500 == 0 or k == len(files):
                print(f"{k}/{len(files)} (uploaded {counts['ok']}, unchanged {counts['skip']}, errors {len(errors)})",
                      flush=True)
    if not args.no_cors:
        set_cors(s3, bucket)
        print("CORS set for:", ", ".join(ALLOWED_ORIGINS))
    for e in errors[:20]:
        print("  error:", e)
    print(f"done → s3://{bucket}/{prefix}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
