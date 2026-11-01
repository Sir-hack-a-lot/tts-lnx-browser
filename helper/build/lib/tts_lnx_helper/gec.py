"""Sec-MS-GEC v2 ("CS64-SHA256") — bit-exacte Python-port van de JS-implementatie
in extension/background/engines/edge-protocol.js (zelf geport van edge-tts drm.py).

Microsoft heeft het v1-token (alleen SHA-256-hex) buiten gebruik gesteld;
de dienst eist nu het v2-formaat "<16 hex>-<64 hex>".

Python heeft vrije int-precisie: waar JS BigInt/Math.imul gebruikt volstaat
gewone int-rekening met maskering via ``& _M32``. De ``x * 0x100000001``-
rotaties blijven gewone int-vermenigvuldiging vóór de shifts (zoals in de
JS-port); pas daarna wordt gemaskeerd.
"""

import time

from tts_lnx_helper.edge_constants import TRUSTED_CLIENT_TOKEN

_M32 = 0xFFFFFFFF
_ROT = 0x100000001  # 2**32 + 1: rotatie-vermenigvuldiging zoals in de referentie
WIN_EPOCH_SECONDS = 11644473600  # seconden tussen 1-1-1601 en 1-1-1970

SHA256_INITIAL = [0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19]
# Voorberekende toestand/schedule-fragmenten van een vaste 57-byte prefix
# (de prefix zelf is niet bekend; deze constanten komen uit drm.py).
SHA256_STATE = [0xFD9FBEA2, 0x91243CE7, 0xBE499094, 0xCD2E1E0A, 0x6C006F49, 0x04BD35AB, 0xFEB0A7E4, 0x03EFFBD2]
SHA256_SCHEDULE = [0xEB24BF9E, 0x1558691F, 0xA0C09EE2, 0x0CFA32BA, 0xA622EE8C, 0xD1DD9491, 0xC0DD25A0, 0xF9E70AB6, 0xF0C31573, 0x7058CE4E, 0x7188E606, 0x00E5AB33, 0xD258B060, 0x72766564]
SHA256_ROUND_CONSTANTS = [
    0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5,
    0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174,
    0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
    0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967,
    0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85,
    0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070,
    0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3,
    0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2,
]
SHA256_ADJUSTMENT = 0xC9DC06A7
SHA256_BLOCK_CONSTANTS = SHA256_ROUND_CONSTANTS[:14] + [SHA256_ADJUSTMENT] + SHA256_ROUND_CONSTANTS[15:]
SHA256_SIGMA0_ADJUSTMENT = 0x059C0B80
SHA256_SIGMA1_ADJUSTMENT = 0x000B92C0

CS64_COEFFICIENTS = [
    (0xE82E91B1, 0xB32700D0), (0x44DE24C6, 0x88DFF51D), (0x3BEB65BC, 0x29514038),
    (0xC89C5933, 0xB328CBDF), (0x8D1EC211, 0xD405B4D5), (0x314EF5D5, 0x26E55F3C),
    (0xE92491B1, 0x607801C6), (0xF0A5B9D5, 0x82B2C1FB), (0x06064CF3, 0xFA51A3DA),
    (0xDA79FA60, 0x207CC464), (0xBED20560, 0x3C3C74F3), (0x89F9C9F8, 0xD2D14B61),
    (0x35FA38C6, 0xBB04A2C1), (0xCB49E3C6, 0xC5626167),
]
CS64_FACTOR = 0x82893933
CS64_ADJUSTMENT0 = 0xF2F90B1A
CS64_ADJUSTMENT1 = 0x0B1A0000


def rol16(v):
    return ((v << 16) | (v >> 16)) & _M32


def words_le4_even(data):
    """Data als little-endian 32-bit woorden, zero-padded tot een even aantal."""
    padded = len(data) + ((4 - (len(data) % 4)) % 4)
    words = []
    for i in range(0, padded, 4):
        word = 0
        for j in range(4):
            if i + j < len(data):
                word |= data[i + j] << (8 * j)
        words.append(word)
    if len(words) % 2:
        words.append(0)
    return words


def sigma0(v):
    return ((v >> 7) ^ ((v << 25) & _M32) ^ (v >> 18) ^ ((v << 14) & _M32) ^ (v >> 3)) & _M32


def sigma1(v):
    return ((v >> 17) ^ ((v << 15) & _M32) ^ (v >> 19) ^ ((v << 13) & _M32) ^ (v >> 10)) & _M32


def _sum_e(r):
    return (r >> 6) ^ (r >> 11) ^ (r >> 25)


def _sum_a(r):
    return (r >> 2) ^ (r >> 13) ^ (r >> 22)


def sha256_rounds(state_in, words, first_round=0):
    """SHA-256-rondes, eventueel hervat midden in het eerste blok. De "rotaties"
    lopen via x * (2**32 + 1) zodat de hoge bits meeliften tot de eindmaskering,
    zoals in de referentie."""
    a, b, c, d, e, f, g, h = state_in
    constants = SHA256_BLOCK_CONSTANTS if first_round == 14 else SHA256_ROUND_CONSTANTS
    aligned = min(64, ((first_round + 7) // 8) * 8)

    for i in range(first_round, aligned):
        t1 = h + _sum_e(e * _ROT) + (g ^ (e & (f ^ g))) + constants[i] + words[i]
        t2 = _sum_a(a * _ROT) + ((a & b) | (c & (a | b)))
        na = (t1 + t2) & _M32
        ne = (d + t1) & _M32
        h, g, f, e, d, c, b, a = g, f, e, ne, c, b, a, na

    # Uitgerolde rondes: de rollen van a..h schuiven per ronde één plek op.
    for i in range(aligned, 64, 8):
        t1 = h + _sum_e(e * _ROT) + (g ^ (e & (f ^ g))) + constants[i] + words[i]
        d = (d + t1) & _M32
        h = (t1 + _sum_a(a * _ROT) + ((a & b) | (c & (a | b)))) & _M32
        t1 = g + _sum_e(d * _ROT) + (f ^ (d & (e ^ f))) + constants[i + 1] + words[i + 1]
        c = (c + t1) & _M32
        g = (t1 + _sum_a(h * _ROT) + ((h & a) | (b & (h | a)))) & _M32
        t1 = f + _sum_e(c * _ROT) + (e ^ (c & (d ^ e))) + constants[i + 2] + words[i + 2]
        b = (b + t1) & _M32
        f = (t1 + _sum_a(g * _ROT) + ((g & h) | (a & (g | h)))) & _M32
        t1 = e + _sum_e(b * _ROT) + (d ^ (b & (c ^ d))) + constants[i + 3] + words[i + 3]
        a = (a + t1) & _M32
        e = (t1 + _sum_a(f * _ROT) + ((f & g) | (h & (f | g)))) & _M32
        t1 = d + _sum_e(a * _ROT) + (c ^ (a & (b ^ c))) + constants[i + 4] + words[i + 4]
        h = (h + t1) & _M32
        d = (t1 + _sum_a(e * _ROT) + ((e & f) | (g & (e | f)))) & _M32
        t1 = c + _sum_e(h * _ROT) + (b ^ (h & (a ^ b))) + constants[i + 5] + words[i + 5]
        g = (g + t1) & _M32
        c = (t1 + _sum_a(d * _ROT) + ((d & e) | (f & (d | e)))) & _M32
        t1 = b + _sum_e(g * _ROT) + (a ^ (g & (h ^ a))) + constants[i + 6] + words[i + 6]
        f = (f + t1) & _M32
        b = (t1 + _sum_a(c * _ROT) + ((c & d) | (e & (c | d)))) & _M32
        t1 = a + _sum_e(f * _ROT) + (h ^ (f & (g ^ h))) + constants[i + 7] + words[i + 7]
        e = (e + t1) & _M32
        a = (t1 + _sum_a(b * _ROT) + ((b & c) | (d & (b | c)))) & _M32
    return [a, b, c, d, e, f, g, h]


def expand_sha256_schedule(words, first_word=16):
    for i in range(first_word, 64):
        x = words[i - 2]
        y = words[i - 15]
        words.append((sigma1(x) + words[i - 7] + sigma0(y) + words[i - 16]) & _M32)


def sha256_init(data):
    """Eerste blok is voorberekend rond een vaste prefix; hervat op ronde 14."""
    words = [0] * 14
    words.append(((data[0] << 16) | (data[1] << 8) | data[2]) & _M32)
    words.append(((data[3] << 24) | (data[4] << 16) | (data[5] << 8) | data[6]) & _M32)
    for i in range(16, 30):
        value = SHA256_SCHEDULE[i - 16]
        if i - 2 >= 14:
            value += (sigma1(words[i - 2]) ^ SHA256_SIGMA1_ADJUSTMENT) if i == 16 else sigma1(words[i - 2])
        if i - 7 >= 14:
            value += words[i - 7]
        if i - 15 >= 14:
            value += (sigma0(words[i - 15]) ^ SHA256_SIGMA0_ADJUSTMENT) if i == 29 else sigma0(words[i - 15])
        words.append(value & _M32)
    words.append((sigma1(words[28]) + words[23] + sigma0(words[15]) + words[14]
                  + SHA256_ADJUSTMENT - SHA256_ROUND_CONSTANTS[14]) & _M32)
    expand_sha256_schedule(words, 31)
    working = sha256_rounds(SHA256_STATE, words, 14)
    return [(x + w) & _M32 for x, w in zip(SHA256_INITIAL, working)]


def sha256_digest_custom(data):
    """Aangepaste SHA-256 over (57-byte prefix || data); zie sha256_init."""
    if len(data) < 7:
        raise ValueError('Token-salt moet minstens 7 bytes bevatten')
    length = 57 + len(data)
    rest = data[7:]
    pad_len = (55 - length) % 64
    padded = rest + b'\x80' + bytes(pad_len) + (length * 8).to_bytes(8, 'big')
    state = sha256_init(data[:7])
    for off in range(0, len(padded), 64):
        block = padded[off:off + 64]
        words = [int.from_bytes(block[i * 4:i * 4 + 4], 'big') for i in range(16)]
        expand_sha256_schedule(words)
        working = sha256_rounds(state, words)
        state = [(x + w) & _M32 for x, w in zip(state, working)]
    return b''.join(x.to_bytes(4, 'big') for x in state)


def cs64_digest(data, digest):
    key_a = int.from_bytes(digest[0:4], 'little') | 1
    key_b = int.from_bytes(digest[4:8], 'little') | 1
    factors = [(key_a * CS64_FACTOR) & _M32, (key_b * CS64_FACTOR) & _M32]
    terms = [(coeff * factors[i % 2]) & _M32 for i, (coeff, _off) in enumerate(CS64_COEFFICIENTS)]
    offsets = [off for (_coeff, off) in CS64_COEFFICIENTS]
    prefixed = b'\x00' + data  # leidende nulbyte, zoals in de referentie
    for i, word in enumerate(words_le4_even(prefixed)):
        term = (word * (key_a if i % 2 == 0 else key_b)) & _M32
        offset = (rol16(word) * (0xEF0569FB if i % 2 == 0 else 0xC31713DB)) & _M32
        if i == 0:
            term = (term + ((CS64_ADJUSTMENT0 * factors[0]) & _M32)) & _M32
            offset = (offset + CS64_ADJUSTMENT1) & _M32
        terms.append(term)
        offsets.append(offset)
    swap_acc = 0
    swap_last = 0
    state = 0
    acc = 0
    for i in range(0, len(terms), 2):
        x = terms[i]
        y = terms[i + 1]
        t = rol16((offsets[i] + x) & _M32)
        q = (t * 0x76F50F34) & _M32
        swap_acc = (swap_acc + (((rol16(q) * 0xC3EFEA97) & _M32) + q)) & _M32
        t = rol16((offsets[i + 1] + y) & _M32)
        q = (t * 0x1881CE3C) & _M32
        swap_last = (((rol16(q) * 0x35BD1EC9) & _M32) + q) & _M32
        swap_acc = (swap_acc + swap_last) & _M32

        state = (state * key_a) & _M32
        state = (state + x) & _M32
        state = (rol16(state) * 0xCF98B111) & _M32
        state = (rol16(state) * 0x87085B9F) & _M32
        state = (rol16(state) * 0x12CEB96D) & _M32
        state = (rol16(state) * 0x257E1D83) & _M32
        acc = (acc + state) & _M32
        t = (((state * key_b) & _M32) + y) & _M32
        t = (rol16(t) * 0xA27416F5) & _M32
        t = (rol16(t) * 0xD38396FF) & _M32
        state = (rol16((rol16(t) * 0x7C932B89) & _M32) * 0xBFA49F69) & _M32
        acc = (acc + state) & _M32
    return [swap_last ^ state, swap_acc ^ acc]


def compute_sec_ms_gec(now_ms=None):
    """Sec-MS-GEC v2-token "<16 hex>-<64 hex>" voor het huidige 5-minutenvenster."""
    if now_ms is None:
        now_ms = int(time.time() * 1000)
    ticks = now_ms // 1000 + WIN_EPOCH_SECONDS
    ticks -= ticks % 300  # afronden naar 5-minutenvenster
    data = f"{ticks * 10_000_000}{TRUSTED_CLIENT_TOKEN}".encode('ascii')
    digest = sha256_digest_custom(data)
    c1, c2 = cs64_digest(data, digest)
    cs64 = c1.to_bytes(4, 'little') + c2.to_bytes(4, 'little')
    return f"{cs64.hex().upper()}-{digest.hex().upper()}"
