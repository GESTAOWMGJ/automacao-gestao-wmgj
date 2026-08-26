#!/usr/bin/env bash
set -euo pipefail

if ! command -v firebase >/dev/null 2>&1; then
  echo "Instale a Firebase CLI: npm install -g firebase-tools" >&2
  exit 1
fi

firebase login
firebase use --add
firebase functions:secrets:set WMGJ_INGEST_HMAC_SECRET

echo "Instalando dependências..."
npm --prefix functions ci
npm --prefix tests ci

echo "Compilando Functions..."
npm --prefix functions run build

echo "Rodando testes no Emulator Suite..."
firebase emulators:exec --only firestore,auth,functions "npm --prefix tests test"

echo "Homologação local concluída. Revise antes de qualquer deploy."
