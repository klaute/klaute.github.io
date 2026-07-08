#!/bin/bash

DOMAINS=(
    "lauterbach.tech"
    "klaute.de"
    "klaute.net"
    "jagd-hn.de"
    "xn--jger-hn-5wa.de"
    "klaute.github.io"
)

echo
echo "===================================================="
echo " DOMAIN STATUS CHECK"
echo "===================================================="
echo

for DOMAIN in "${DOMAINS[@]}"
do
    echo
    echo "----------------------------------------------------"
    echo " Checking: $DOMAIN"
    echo "----------------------------------------------------"

    echo -n "DNS Lookup............. "
    DNS=$(dig +short "$DOMAIN" | head -n 1)

    if [ -z "$DNS" ]; then
        echo "FAILED"
        continue
    else
        echo "OK ($DNS)"
    fi

    echo -n "HTTP Test.............. "
    HTTP_RESULT=$(curl -L -s -o /dev/null \
        --max-time 15 \
        -w "%{http_code} %{url_effective}" \
        "http://$DOMAIN")

    echo "$HTTP_RESULT"

    echo -n "HTTPS Test............. "
    HTTPS_RESULT=$(curl -L -s -o /dev/null \
        --max-time 15 \
        -w "%{http_code} %{url_effective}" \
        "https://$DOMAIN")

    if [[ "$HTTPS_RESULT" == 000* ]]; then
        echo "FAILED ($HTTPS_RESULT)"
    else
        echo "$HTTPS_RESULT"
    fi

    echo -n "HTTPS Test insecure.... "
    HTTPS_INSECURE_RESULT=$(curl -k -L -s -o /dev/null \
        --max-time 15 \
        -w "%{http_code} %{url_effective}" \
        "https://$DOMAIN")

    echo "$HTTPS_INSECURE_RESULT"

    echo -n "Timing HTTPS........... "
    curl -L -o /dev/null -s \
        --max-time 20 \
        -w "DNS: %{time_namelookup}s | Connect: %{time_connect}s | TLS: %{time_appconnect}s | TTFB: %{time_starttransfer}s | Total: %{time_total}s\n" \
        "https://$DOMAIN"

    echo -n "TLS Certificate........ "
    TLS=$(echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null | \
        openssl x509 -noout -subject -issuer -dates 2>/dev/null)

    if [ -z "$TLS" ]; then
        echo "FAILED"
    else
        echo "OK"
        echo "$TLS"
    fi

done

echo
echo "===================================================="
echo " DONE"
echo "===================================================="
