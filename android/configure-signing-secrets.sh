#!/usr/bin/env bash
set -euo pipefail
# Run locally as the repository owner after gh auth login. Never commit these inputs.
if [[ $# != 2 ]]; then echo 'Usage: configure-signing-secrets.sh /path/tengda-release.p12 /path/keystore-password.txt' >&2; exit 2; fi
repo=STH3690-ui/tengda-express
base64 < "$1" | tr -d '\n' | gh secret set ANDROID_KEYSTORE_BASE64 --repo "$repo"
gh secret set ANDROID_KEYSTORE_PASSWORD --repo "$repo" < "$2"
gh secret set ANDROID_KEY_PASSWORD --repo "$repo" < "$2"
printf '%s' 'tengda-release' | gh secret set ANDROID_KEY_ALIAS --repo "$repo"
echo 'Four signing secrets configured. Store the original keystore/password offline for all future updates.'
