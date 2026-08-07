#!/bin/sh
# Создаёт snippet прокси /_matrix → MATRIX_BACKEND — только если он задан.
# Без MATRIX_BACKEND образ остаётся чистым статик-сервером (snippet не пишется,
# wildcard-include в конфиге остаётся пустым). Запускается nginx-образом из
# /docker-entrypoint.d/ до старта nginx.
set -eu

SNIPPET=/etc/nginx/snippets/matrix-proxy-enabled.conf
mkdir -p /etc/nginx/snippets

if [ -z "${MATRIX_BACKEND:-}" ]; then
    rm -f "$SNIPPET"
    echo "[matrix-proxy] MATRIX_BACKEND не задан — отдаём только статику"
    exit 0
fi

# Переменная в proxy_pass + resolver → имя апстрима резолвится в рантайме,
# поэтому nginx не падает на старте, если бэкенд ещё недоступен. $request_uri
# сохраняет исходный путь /_matrix/... целиком (rewrite не нужен).
cat > "$SNIPPET" <<EOF
location /_matrix/ {
    resolver ${DNS_RESOLVER:-kube-dns.kube-system.svc.cluster.local} valid=30s ipv6=off;
    set \$matrix_upstream "${MATRIX_BACKEND}";
    proxy_pass        \$matrix_upstream\$request_uri;
    proxy_http_version 1.1;
    proxy_set_header  Host              \$host;
    proxy_set_header  X-Real-IP         \$remote_addr;
    proxy_set_header  X-Forwarded-For   \$proxy_add_x_forwarded_for;
    proxy_set_header  X-Forwarded-Proto \$scheme;
    proxy_read_timeout 60s;
}
EOF

echo "[matrix-proxy] прокси /_matrix → ${MATRIX_BACKEND} включён"
