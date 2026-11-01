#!/usr/bin/env python3
# Minimale driver voor het Firefox Remote Debugging Protocol (RDP).
# Protocol: lengte-geprefixte JSON-pakketten (<byteLengte>:<json>) over TCP.
# Gebruik: rdp.py <poort> <opdracht> — zie main onderaan.
import json
import socket
import sys


class RDP:
    def __init__(self, port):
        self.sock = socket.create_connection(('127.0.0.1', port), timeout=15)
        self.buf = b''

    def _read_packet(self, pred=None):
        while True:
            if b':' in self.buf:
                hdr, _, rest = self.buf.partition(b':')
                if hdr.isdigit() and len(rest) >= int(hdr):
                    n = int(hdr)
                    self.buf = rest[n:]
                    data = json.loads(rest[:n])
                    # Niet-gevraagde events (frameUpdate e.d.) overslaan.
                    if pred is None or pred(data):
                        return data
                    continue
            chunk = self.sock.recv(65536)
            if not chunk:
                raise ConnectionError('RDP-verbinding gesloten')
            self.buf += chunk

    def request(self, to, type_, pred=None, timeout=15, **kw):
        pkt = json.dumps({'to': to, 'type': type_, **kw}).encode()
        self.sock.sendall(str(len(pkt)).encode() + b':' + pkt)
        self.sock.settimeout(timeout)
        return self._read_packet(pred)


def main():
    port = int(sys.argv[1])
    rdp = RDP(port)
    rdp.sock.settimeout(15)
    # Groet + root-form ophalen.
    root = rdp.request('root', 'getRoot', pred=lambda d: 'addonsActor' in d or 'tabs' in d)
    print('ROOT:', json.dumps({k: v for k, v in root.items() if isinstance(v, (str, bool))}))
    tabs = rdp.request('root', 'listTabs', pred=lambda d: 'tabs' in d)
    for t in tabs['tabs']:
        print('TAB:', t.get('actor'), '|', t.get('url'), '|', t.get('title', '')[:60])


if __name__ == '__main__':
    main()
