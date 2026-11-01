#!/usr/bin/env python3
# Minimale AMO-API-client (addons.mozilla.org/api/v5) met JWT-auth.
# Leest de sleutels zelf uit het sleutelbestand; print nooit geheimen.
# Gebruik als module: from amo import Amo
import hashlib
import hmac
import json
import secrets as _secrets
import time
import urllib.parse
import urllib.request

API = 'https://addons.mozilla.org/api/v5'
KEY_FILE = '/home/randy/Documents/mozilla_api.txt'


def _b64url(data: bytes) -> str:
    import base64
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()


class Amo:
    def __init__(self, key_file=KEY_FILE):
        lines = open(key_file).read().splitlines()
        self.issuer = lines[0].split(':', 1)[1].strip()
        self.secret = lines[1].split(':', 1)[1].strip()

    def _jwt(self) -> str:
        now = int(time.time())
        header = _b64url(json.dumps({'alg': 'HS256', 'typ': 'JWT'}).encode())
        payload = _b64url(json.dumps({
            'iss': self.issuer, 'jti': _secrets.token_hex(8),
            'iat': now, 'exp': now + 60,
        }).encode())
        signing = f'{header}.{payload}'.encode()
        sig = _b64url(hmac.new(self.secret.encode(), signing, hashlib.sha256).digest())
        return f'{header}.{payload}.{sig}'

    def call(self, method, path, body=None, files=None):
        """files: dict veld->(filename, bytes) voor multipart; body: dict voor JSON."""
        url = f'{API}{path}'
        headers = {'Authorization': f'JWT {self._jwt()}'}
        data = None
        if files is not None:
            boundary = _secrets.token_hex(16)
            parts = []
            for veld, waarde in (body or {}).items():
                parts.append(f'--{boundary}\r\nContent-Disposition: form-data; '
                             f'name="{veld}"\r\n\r\n{waarde}\r\n'.encode())
            for veld, (fname, blob) in files.items():
                parts.append(f'--{boundary}\r\nContent-Disposition: form-data; '
                             f'name="{veld}"; filename="{fname}"\r\n'
                             f'Content-Type: application/octet-stream\r\n\r\n'.encode()
                             + blob + b'\r\n')
            parts.append(f'--{boundary}--\r\n'.encode())
            data = b''.join(parts)
            headers['Content-Type'] = f'multipart/form-data; boundary={boundary}'
        elif body is not None:
            data = json.dumps(body).encode()
            headers['Content-Type'] = 'application/json'
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                return res.status, json.loads(res.read() or b'null')
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b'null')


if __name__ == '__main__':
    amo = Amo()
    guid = urllib.parse.quote('tts-lnx-browser@localhost', safe='')
    status, addon = amo.call('GET', f'/addons/addon/{guid}/')
    print('addon-status:', status)
    if status == 200:
        print('naam:', addon.get('name'))
        print('slug:', addon.get('slug'), '| guid:', addon.get('guid'))
        print('status:', addon.get('status'), '| listed:', addon.get('has_listed_versions', '?'))
        print('huidige versie:', (addon.get('current_version') or {}).get('version'))
        print('categories:', addon.get('categories'))
    else:
        print(json.dumps(addon)[:400])
