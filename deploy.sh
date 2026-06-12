#!/bin/bash

# 에러 발생 시 스크립트 중단
set -e

# 기본 설정 변수
PROJECT_ID="knu-jerry-kang91558149"
PROJECT_NUMBER="673317980620"
REGION="asia-northeast3"
SERVICE_NAME="ecobi-service"
SECRET_NAME="ecobi-db-url"
REPO_NAME="ecobi-repo"
DB_INSTANCE="ecobi-2"
SA_EMAIL="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
IMAGE_TAG="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/ecobi-app:latest"

echo "=================================================="
echo "    Ecobi 서비스 GCP Cloud Run 자동 배포 스크립트"
echo "=================================================="
echo "설정 정보:"
echo " - GCP 프로젝트 ID: $PROJECT_ID"
echo " - 프로젝트 번호: $PROJECT_NUMBER"
echo " - 배포 지역(Region): $REGION"
echo " - Cloud Run 서비스명: $SERVICE_NAME"
echo "=================================================="

# 배포 방식 선택
echo "배포 방식을 선택해 주세요:"
echo " 1) Secret Manager 사용 (보안 권장, IAM 권한 필요)"
echo " 2) 일반 환경변수로 직접 주입 (권한 문제 발생 시 우회 가능, 테스트 권장)"
read -p "선택 (1 또는 2, 기본값: 1): " DEPLOY_MODE
DEPLOY_MODE=${DEPLOY_MODE:-1}
ML_ENV_VARS="RECOMMENDATION_ADAPTER=ml,ML_PYTHON_PATH=/opt/venv/bin/python,ML_RECOMMENDER_TIMEOUT_MS=60000,ML_RECOMMENDER_SKIP_MODELS=false"

has_secret_accessor_binding() {
    gcloud secrets get-iam-policy "$SECRET_NAME" \
        --project="$PROJECT_ID" \
        --flatten="bindings[].members" \
        --filter="bindings.role=roles/secretmanager.secretAccessor AND bindings.members=serviceAccount:$SA_EMAIL" \
        --format="value(bindings.role)" 2>/dev/null | grep -q "roles/secretmanager.secretAccessor"
}

has_cloudsql_client_binding() {
    gcloud projects get-iam-policy "$PROJECT_ID" \
        --flatten="bindings[].members" \
        --filter="bindings.role=roles/cloudsql.client AND bindings.members=serviceAccount:$SA_EMAIL" \
        --format="value(bindings.role)" 2>/dev/null | grep -q "roles/cloudsql.client"
}

# 1. GCP API 활성화
echo -e "\n[1/5] 필수 Google Cloud API 활성화 중..."
if [ "$DEPLOY_MODE" = "1" ]; then
    gcloud services enable \
        run.googleapis.com \
        sqladmin.googleapis.com \
        secretmanager.googleapis.com \
        artifactregistry.googleapis.com \
        cloudbuild.googleapis.com \
        --project="$PROJECT_ID"
else
    gcloud services enable \
        run.googleapis.com \
        sqladmin.googleapis.com \
        artifactregistry.googleapis.com \
        cloudbuild.googleapis.com \
        --project="$PROJECT_ID"
fi

# DB 접속 정보 개별 입력받기 (오류 방지)
echo -e "\n데이터베이스 접속 정보를 입력해 주세요."
read -p " 1. DB 사용자명 (기본값: postgres): " DB_USER
DB_USER=${DB_USER:-postgres}

read -p " 2. DB 비밀번호 (필수): " DB_PASSWORD
if [ -z "$DB_PASSWORD" ]; then
    echo "오류: DB 비밀번호는 필수 입력값입니다. 배포를 중단합니다."
    exit 1
fi

read -p " 3. DB 이름 (기본값: postgres): " DB_NAME
DB_NAME=${DB_NAME:-postgres}

# 특수문자 처리를 위한 URL 인코딩 처리 (Secret Manager용)
ENCODED_USER=$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$DB_USER")
ENCODED_PASS=$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$DB_PASSWORD")
ENCODED_NAME=$(node -e "console.log(encodeURIComponent(process.argv[1]))" "$DB_NAME")
USER_DB_URL="postgresql://${ENCODED_USER}:${ENCODED_PASS}@localhost/${ENCODED_NAME}?host=/cloudsql/${PROJECT_ID}:${REGION}:${DB_INSTANCE}"

# 2. 배포 모드별 설정 진행
if [ "$DEPLOY_MODE" = "1" ]; then
    # [모드 1] Secret Manager 설정
    echo -e "\n[2/5] Secret Manager 정보 확인 및 설정..."
    SECRET_EXISTS=true
    if ! gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" >/dev/null 2>&1; then
        SECRET_EXISTS=false
    fi

    if [ "$SECRET_EXISTS" = false ]; then
        echo " -> '$SECRET_NAME' 시크릿 생성 중..."
        gcloud secrets create "$SECRET_NAME" \
            --replication-policy="automatic" \
            --project="$PROJECT_ID"
    fi

    echo " -> 데이터베이스 URL을 Secret Manager에 등록 중..."
    echo -n "$USER_DB_URL" | gcloud secrets versions add "$SECRET_NAME" --data-file=- --project="$PROJECT_ID"

    echo -e "\n[3/5] 서비스 계정 권한 확인 및 부여 중..."
    echo " -> 대상 서비스 계정: $SA_EMAIL"

    # Secret Accessor 권한 부여
    if has_secret_accessor_binding; then
        echo " -> Secret Manager 접근 권한이 이미 설정되어 있습니다."
    else
        echo " -> Secret Manager 접근 권한 부여..."
        gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
            --member="serviceAccount:$SA_EMAIL" \
            --role="roles/secretmanager.secretAccessor" \
            --project="$PROJECT_ID" \
            --quiet >/dev/null
    fi

    # Cloud SQL Client 권한 부여
    if has_cloudsql_client_binding; then
        echo " -> Cloud SQL 클라이언트 접근 권한이 이미 설정되어 있습니다."
    else
        echo " -> Cloud SQL 클라이언트 접근 권한 부여..."
        gcloud projects add-iam-policy-binding "$PROJECT_ID" \
            --member="serviceAccount:$SA_EMAIL" \
            --role="roles/cloudsql.client" \
            --quiet >/dev/null
    fi

else
    # [모드 2] 일반 환경변수 우회 모드 (Secret Manager 및 IAM 스킵)
    echo -e "\n[2/5] (우회 모드) Secret Manager 설정을 건너뜁니다."
    echo -e "\n[3/5] (우회 모드) Cloud SQL 권한 부여 시도 (실패 시 무시)..."
    if has_cloudsql_client_binding; then
        echo " -> Cloud SQL 클라이언트 접근 권한이 이미 설정되어 있습니다."
    else
        # Cloud SQL Client 권한 부여는 시도하되, 실패해도 계속 진행
        gcloud projects add-iam-policy-binding "$PROJECT_ID" \
            --member="serviceAccount:$SA_EMAIL" \
            --role="roles/cloudsql.client" \
            --quiet >/dev/null || echo " -> [경고] Cloud SQL IAM 설정 권한이 부족하여 건너뜁니다. (이미 설정되어 있거나 기본 권한으로 작동하길 기대함)"
    fi
fi

# 3. Artifact Registry 레포지토리 준비
echo -e "\n[4/5] Artifact Registry 컨테이너 저장소 설정..."
if ! gcloud artifacts repositories describe "$REPO_NAME" --location="$REGION" --project="$PROJECT_ID" >/dev/null 2>&1; then
    echo " -> '$REPO_NAME' Docker 저장소 생성 중..."
    gcloud artifacts repositories create "$REPO_NAME" \
        --repository-format=docker \
        --location="$REGION" \
        --description="Ecobi App Docker repository" \
        --project="$PROJECT_ID"
else
    echo " -> Docker 저장소가 이미 존재합니다."
fi

# 4. Cloud Build 빌드 및 이미지 업로드
echo -e "\n[4.5/5] Google Cloud Build로 도커 이미지 빌드 중..."
gcloud builds submit --tag "$IMAGE_TAG" --project="$PROJECT_ID"

# 5. Cloud Run 배포
echo -e "\n[5/5] Cloud Run 서비스 배포 중..."
if [ "$DEPLOY_MODE" = "1" ]; then
    gcloud run deploy "$SERVICE_NAME" \
        --image="$IMAGE_TAG" \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --platform=managed \
        --allow-unauthenticated \
        --service-account="$SA_EMAIL" \
        --add-cloudsql-instances="$PROJECT_ID:$REGION:$DB_INSTANCE" \
        --memory=2Gi \
        --cpu=2 \
        --timeout=300 \
        --set-env-vars="DB_CLIENT=postgres,NODE_ENV=production,HOST=0.0.0.0,SEED_DEV_DATA=false,$ML_ENV_VARS" \
        --set-secrets="DATABASE_URL=${SECRET_NAME}:latest"
else
    # 일반 환경변수 주입 시에는 DATABASE_URL 대신 개별 DB 인자로 전달하여 파싱 오류 원천 차단
    gcloud run deploy "$SERVICE_NAME" \
        --image="$IMAGE_TAG" \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --platform=managed \
        --allow-unauthenticated \
        --service-account="$SA_EMAIL" \
        --add-cloudsql-instances="$PROJECT_ID:$REGION:$DB_INSTANCE" \
        --memory=2Gi \
        --cpu=2 \
        --timeout=300 \
        --set-env-vars="DB_CLIENT=postgres,NODE_ENV=production,HOST=0.0.0.0,SEED_DEV_DATA=false,DB_USER=$DB_USER,DB_PASSWORD=$DB_PASSWORD,DB_NAME=$DB_NAME,DB_HOST=/cloudsql/$PROJECT_ID:$REGION:$DB_INSTANCE,$ML_ENV_VARS"
fi

echo "=================================================="
echo " 🎉 배포 프로세스가 완료되었습니다!"
echo "=================================================="
