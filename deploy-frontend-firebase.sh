#!/bin/bash

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-knu-jerry-kang91558149}"
HOSTING_SITE_ID="${HOSTING_SITE_ID:-knu-jerry-kang91558149}"
HOSTING_TARGET="${HOSTING_TARGET:-hosting}"

echo "=================================================="
echo "    Ecobi Frontend Firebase Hosting 배포"
echo "=================================================="
echo " - Firebase/GCP project: ${PROJECT_ID}"
echo " - Hosting site: ${HOSTING_SITE_ID}"
echo " - 정적 파일: dist/"
echo " - API rewrite: /api/v1/** -> Cloud Run ecobi-service"
echo "=================================================="

if ! npx firebase-tools projects:list --json >/dev/null 2>&1; then
  echo "[중단] Firebase CLI 인증이 필요합니다."
  echo "먼저 다음 명령을 실행하세요:"
  echo "  npx firebase-tools login"
  exit 1
fi

if [ "${SKIP_SERVICE_ENABLE:-false}" != "true" ]; then
  ENABLED_SERVICES="$(gcloud services list --enabled --project="${PROJECT_ID}" --format='value(config.name)')"
  if ! grep -q '^firebase.googleapis.com$' <<<"${ENABLED_SERVICES}" || ! grep -q '^firebasehosting.googleapis.com$' <<<"${ENABLED_SERVICES}"; then
    gcloud services enable \
      firebase.googleapis.com \
      firebasehosting.googleapis.com \
      --project="${PROJECT_ID}" >/dev/null
  fi
fi

PROJECTS_JSON="$(npx firebase-tools projects:list --json)"
if ! PROJECTS_JSON="${PROJECTS_JSON}" PROJECT_ID="${PROJECT_ID}" node -e '
  const payload = JSON.parse(process.env.PROJECTS_JSON);
  const projects = Array.isArray(payload.result) ? payload.result : payload.result?.projects ?? [];
  process.exit(projects.some((project) => project.projectId === process.env.PROJECT_ID) ? 0 : 1);
'; then
  echo " - GCP project '${PROJECT_ID}'가 아직 Firebase project가 아니어서 Firebase 리소스 추가를 시도합니다."
  if ! npx firebase-tools projects:addfirebase "${PROJECT_ID}"; then
    echo "[중단] Firebase project 전환에 실패했습니다."
    echo "필요 조건:"
    echo "  1. 현재 Firebase 로그인 계정이 '${PROJECT_ID}'의 Editor 또는 Owner 수준 권한을 가져야 합니다."
    echo "  2. Firebase Console에서 Firebase Terms of Service를 수락해야 합니다."
    echo "  3. 권한을 방금 부여했다면 'npx firebase-tools login --reauth' 후 다시 실행하세요."
    exit 1
  fi
fi

SITES_JSON="$(npx firebase-tools hosting:sites:list --project "${PROJECT_ID}" --json)"
if ! SITES_JSON="${SITES_JSON}" HOSTING_SITE_ID="${HOSTING_SITE_ID}" node -e '
  const payload = JSON.parse(process.env.SITES_JSON);
  const sites = payload.result?.sites ?? [];
  process.exit(
    sites.some((site) =>
      site.name?.endsWith(`/sites/${process.env.HOSTING_SITE_ID}`) ||
      site.defaultUrl === `https://${process.env.HOSTING_SITE_ID}.web.app`
    )
      ? 0
      : 1
  );
'; then
  echo " - Hosting site '${HOSTING_SITE_ID}'가 없어 생성을 시도합니다."
  npx firebase-tools hosting:sites:create "${HOSTING_SITE_ID}" --project "${PROJECT_ID}"
fi

npm run build

npx firebase-tools deploy \
  --only "${HOSTING_TARGET}" \
  --project "${PROJECT_ID}"

echo "=================================================="
echo "Frontend Firebase Hosting 배포 완료"
echo "Firebase Console: https://console.firebase.google.com/project/${PROJECT_ID}/hosting"
echo "=================================================="
